// ROIP APP 9BOX — motor canonico `cycleSchedule` (ME-030).
//
// Consolida os 4 hooks canonicos do DOC 03 §17 + DOC 06 §14. Motor puro:
// zero resolver tRPC exposto (canonico DOC 03 §19.13), chamado por jobs
// cron (a virem em MEs futuras) e por outros motores (`processClosedMonth`,
// `triggerQuarterlyCalculation`, `closeNR1Cycle` — MEs futuras).
//
// Convencoes canonicas desta ME:
//   - `now` sempre parametro explicito. Nunca `new Date()` interno — o
//     motor e deterministico, testavel com datas literais e o caller
//     (job cron ou outro motor) e responsavel pelo relogio canonico.
//   - `emitAutoAlert` como dependency injection. Padrao no-op documentado
//     (motor de alertas do DOC 06 §8 ainda nao existe — vem em ME futura;
//     a ligacao acontece la sem editar este motor). Segue Opcao A canonica
//     RV-08 aprovada por Bruno.
//   - Timezone da empresa consumido de `companies.timezone` (default
//     `America/Sao_Paulo` — schema DOC 01).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })`.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME (RV-13; convencao B1 estendida).
//
// Datas canonicas (DOC 06 §14.5):
//   - instrumento_a e instrumento_c: `dataAbertura = dia 16 do ultimo mes
//     do trimestre 00:00 fuso local`; `dataCorte = dia 10 do mes seguinte
//     ao trimestre 23:59:59 fuso local`.
//   - instrumento_d: idem, so Q1 e Q3.
//   - fechamento_mensal: `dataAbertura = dia 1 do mes 00:00`; `dataCorte
//     = dia 10 do mes seguinte 23:59:59`.
//   - radar_nr1: fora do `refreshCycleSchedule` (criado pelo motor NR-1
//     via `closeNR1Cycle` — DOC 03 §11).
//
// Transicoes canonicas (DOC 06 §14.6):
//   - `aberto → atrasado`: NOW() > dataCorte. Todos os 5 tipos.
//   - `atrasado/aberto → fechado`: so `instrumento_c` e `fechamento_mensal`
//     no dia 11 do mes seguinte (fuso local). Instrumentos A e D NUNCA
//     fecham automaticamente (Y8 canonizada); radar_nr1 fecha via
//     `closeNR1Cycle` fora deste motor.
//
// Alertas canonicos (DOC 06 §8, §14.7):
//   - `instrumento_c` fechando → `ciclo_instrumento_encerrado`.
//   - `fechamento_mensal` fechando → `ciclo_mensal_fechado`.
//   - `radar_nr1` fechando → nada (evaluateNR1Alerts cobre).
//   - `instrumento_a/d` → nunca fecham automaticamente, nunca alertam
//     por este motor.

import { and, eq, inArray, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies, cycleSchedule } from '../../db/schema';
import {
  isCicloReferenciaImediatamenteAnterior,
  getDayInTimezone,
  nextFechamentoMensalCiclos,
  nextInstrumentoABCiclos,
  nextInstrumentoDCiclos,
} from '../../lib/cycleDates';
import type { CycleScheduleTipo } from './cycleSchedule';

/**
 * Assinatura canonica do emissor de alerta usado pelo motor. Injetado
 * pelo caller (job cron, outro motor). No-op default enquanto o motor
 * de alertas do DOC 06 §8 nao existir.
 */
export type EmitAutoAlert = (
  tipoCiclo: CycleScheduleTipo,
  cicloReferencia: string,
) => Promise<void>;

/**
 * Implementacao no-op canonica de `EmitAutoAlert`. Documentada aqui para
 * que a ligacao real seja um EDIT explicito no caller quando o motor de
 * alertas (DOC 06 §8) chegar em ME futura.
 */
export const NOOP_EMIT_AUTO_ALERT: EmitAutoAlert = async () => {
  // Motor de alertas ainda nao existe (DOC 06 §8 — ME futura). Deixado
  // como no-op canonico para desacoplar a ordem de MEs sem introduzir
  // dead export (RV-13) nem exigir stub tipado.
};

/**
 * Horizonte canonico do `refreshCycleSchedule`: 6 meses (DOC 06 §14.5).
 * Extraido como constante para inspecao dos testes.
 */
export const REFRESH_HORIZON_MONTHS = 6;

/**
 * Tipos que canonicamente disparam alerta quando fecham automaticamente
 * (DOC 06 §14.7). `radar_nr1` e coberto pelo `evaluateNR1Alerts` fora
 * deste motor; `instrumento_a/d` nao fecham automaticamente (Y8).
 */
const TIPOS_QUE_ALERTAM_AO_FECHAR: readonly CycleScheduleTipo[] = [
  'instrumento_c',
  'fechamento_mensal',
] as const;

/**
 * Tipos canonicos que fecham automaticamente no dia 11 do mes seguinte
 * ao trimestre/mes (DOC 06 §14.6). Instrumentos A e D permanecem em
 * `aberto`/`atrasado` indefinidamente (Y8) e nunca fecham automaticamente
 * por este motor.
 *
 * Exportado a partir da ME-046a (S161) para que a regua nova
 * `verify-canonic-consistency` (passo 10 do validate) confirme, em texto,
 * que a lista canonica se mantem exatamente `['instrumento_c',
 * 'fechamento_mensal']` em ordem — invariante estrutural DOC 06 §14.6.
 */
export const TIPOS_QUE_FECHAM_NO_DIA_11: readonly CycleScheduleTipo[] = [
  'instrumento_c',
  'fechamento_mensal',
] as const;

// ============================================================
// Hook 1 — refreshCycleSchedule(companyId, now)
// ============================================================

/**
 * Resultado canonico do `refreshCycleSchedule`.
 *
 * - `criados`: quantos INSERT novos foram efetivados (linhas ineditas).
 * - `existentes`: quantos UPSERT tocaram linhas ja existentes (idempotencia).
 * - `total`: `criados + existentes`. Corresponde ao numero de candidatos
 *   canonicos que caberia no horizonte para os 4 tipos periodicos.
 */
export interface RefreshCycleScheduleResult {
  criados: number;
  existentes: number;
  total: number;
}

/**
 * DOC 03 §17.3 + DOC 06 §14.5. Cria linhas em `cycleSchedule` para os 4
 * tipos periodicos (A, C, D — Q1/Q3, fechamento_mensal) dentro do
 * horizonte canonico de 6 meses a partir de `now` no fuso local da
 * empresa. NR-1 fica fora (DOC 03 §11 — motor proprio).
 *
 * Idempotente por `uk_cycleSchedule_ciclo (companyId, tipoCiclo,
 * cicloReferencia)`. Reexecucao no mesmo dia nao cria duplicatas — o
 * UPSERT atualiza somente `updatedAt` para linhas ja existentes.
 *
 * Falha canonica se `companyId` nao aparece em `companies`: erro do
 * caller (FK), sobe como excecao do mysql2.
 */
export async function refreshCycleSchedule(
  db: RoipDatabase,
  companyId: number,
  now: Date,
): Promise<RefreshCycleScheduleResult> {
  const [company] = await db
    .select({ id: companies.id, timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    throw new Error(`refreshCycleSchedule: company ${companyId} nao existe`);
  }
  const timeZone = company.timezone;

  interface Candidato {
    tipoCiclo: CycleScheduleTipo;
    cicloReferencia: string;
    dataAbertura: Date;
    dataCorte: Date;
  }

  const candidatos: Candidato[] = [];

  for (const c of nextInstrumentoABCiclos(now, timeZone, REFRESH_HORIZON_MONTHS)) {
    candidatos.push({ tipoCiclo: 'instrumento_a', ...c });
    candidatos.push({ tipoCiclo: 'instrumento_c', ...c });
  }
  for (const c of nextInstrumentoDCiclos(now, timeZone, REFRESH_HORIZON_MONTHS)) {
    candidatos.push({ tipoCiclo: 'instrumento_d', ...c });
  }
  for (const c of nextFechamentoMensalCiclos(now, timeZone, REFRESH_HORIZON_MONTHS)) {
    candidatos.push({ tipoCiclo: 'fechamento_mensal', ...c });
  }

  let criados = 0;
  let existentes = 0;

  for (const cand of candidatos) {
    // Verifica existencia previa. UPSERT do MySQL nao distingue INSERT
    // de UPDATE via `affectedRows` de forma diretamente utilizavel aqui
    // (INSERT retorna 1; UPDATE que muda coluna retorna 2; UPDATE nulo
    // retorna 0). Consulta previa e mais legivel e evita ambiguidade.
    const prev = await db
      .select({ id: cycleSchedule.id })
      .from(cycleSchedule)
      .where(
        and(
          eq(cycleSchedule.companyId, companyId),
          eq(cycleSchedule.tipoCiclo, cand.tipoCiclo),
          eq(cycleSchedule.cicloReferencia, cand.cicloReferencia),
        ),
      )
      .limit(1);

    await db
      .insert(cycleSchedule)
      .values({
        companyId,
        tipoCiclo: cand.tipoCiclo,
        cicloReferencia: cand.cicloReferencia,
        dataAbertura: cand.dataAbertura,
        dataCorte: cand.dataCorte,
        status: 'aberto',
      })
      .onDuplicateKeyUpdate({
        // Preserva a linha existente: idempotencia canonica (§14.5). So
        // `updatedAt` avanca — feito automaticamente pelo `onUpdateNow()`
        // do schema. Passamos apenas o `updatedAt` explicitamente para
        // forcar o UPDATE registrar a passagem do refresh.
        set: { updatedAt: new Date() },
      });

    if (prev.length === 0) criados += 1;
    else existentes += 1;
  }

  return { criados, existentes, total: candidatos.length };
}

// ============================================================
// Hook 2 — updateCycleScheduleStatuses(now, emitAutoAlert)
// ============================================================

/**
 * Metadados canonicos de uma linha fechada pelo hook. Reutilizados pelos
 * testes e pelo pipeline de alertas.
 */
export interface CicloFechadoInfo {
  id: number;
  companyId: number;
  tipoCiclo: CycleScheduleTipo;
  cicloReferencia: string;
}

/**
 * Resultado canonico do `updateCycleScheduleStatuses`.
 *
 * - `paraAtrasado`: contagem global de linhas que transicionaram de
 *   `aberto` para `atrasado` (todos os 5 tipos, `NOW() > dataCorte`).
 * - `paraFechado`: lista das linhas que transicionaram para `fechado`
 *   (apenas `instrumento_c` e `fechamento_mensal` em empresas onde hoje
 *   e dia 11 e a `cicloReferencia` refere ao trimestre/mes anterior).
 */
export interface UpdateCycleScheduleStatusesResult {
  paraAtrasado: number;
  paraFechado: CicloFechadoInfo[];
}

/**
 * DOC 06 §14.6. Executa as 2 transicoes canonicas automaticas em uma
 * unica passagem:
 *   1) `aberto → atrasado` global por `NOW() > dataCorte`.
 *   2) `{aberto,atrasado} → fechado` para `instrumento_c` e
 *      `fechamento_mensal` em empresas onde `now` no fuso local seja
 *      dia 11 do mes e o `cicloReferencia` refira ao trimestre/mes
 *      imediatamente anterior. Cada linha efetivamente fechada dispara
 *      `emitAutoAlert(tipoCiclo, cicloReferencia)`.
 *
 * O caller (job cron) fornece o `now` canonico — o motor nao le
 * `Date.now()` internamente.
 */
export async function updateCycleScheduleStatuses(
  db: RoipDatabase,
  now: Date,
  emitAutoAlert: EmitAutoAlert = NOOP_EMIT_AUTO_ALERT,
): Promise<UpdateCycleScheduleStatusesResult> {
  // ---------- Passo 1: aberto → atrasado (global) ----------
  const abertosVencidos = await db
    .select({ id: cycleSchedule.id })
    .from(cycleSchedule)
    .where(and(eq(cycleSchedule.status, 'aberto'), lt(cycleSchedule.dataCorte, now)));

  let paraAtrasado = 0;
  if (abertosVencidos.length > 0) {
    const ids = abertosVencidos.map((r) => r.id);
    const [res] = await db
      .update(cycleSchedule)
      .set({ status: 'atrasado' })
      .where(and(eq(cycleSchedule.status, 'aberto'), inArray(cycleSchedule.id, ids)));
    paraAtrasado = res.affectedRows;
  }

  // ---------- Passo 2: {aberto,atrasado} → fechado no dia 11 ----------
  // Buscamos apenas linhas dos 2 tipos que fecham automaticamente,
  // com status ainda nao terminal, junto com o timezone da empresa.
  const candidatas = await db
    .select({
      id: cycleSchedule.id,
      companyId: cycleSchedule.companyId,
      tipoCiclo: cycleSchedule.tipoCiclo,
      cicloReferencia: cycleSchedule.cicloReferencia,
      timezone: companies.timezone,
    })
    .from(cycleSchedule)
    .innerJoin(companies, eq(cycleSchedule.companyId, companies.id))
    .where(
      and(
        inArray(cycleSchedule.tipoCiclo, [...TIPOS_QUE_FECHAM_NO_DIA_11]),
        inArray(cycleSchedule.status, ['aberto', 'atrasado']),
      ),
    );

  const paraFechado: CicloFechadoInfo[] = [];
  for (const cand of candidatas) {
    if (getDayInTimezone(now, cand.timezone) !== 11) continue;

    const tipoPeriodo = cand.tipoCiclo === 'fechamento_mensal' ? 'mensal' : 'trimestre';
    if (
      !isCicloReferenciaImediatamenteAnterior(cand.cicloReferencia, tipoPeriodo, now, cand.timezone)
    ) {
      continue;
    }

    // Fecha usando o `now` canonico como `dataFechamento` — deterministico
    // para os testes e alinhado ao SQL canonico do §14.6 (que usa `NOW()`).
    const [res] = await db
      .update(cycleSchedule)
      .set({ status: 'fechado', dataFechamento: now })
      .where(
        and(eq(cycleSchedule.id, cand.id), inArray(cycleSchedule.status, ['aberto', 'atrasado'])),
      );
    if (res.affectedRows > 0) {
      const info: CicloFechadoInfo = {
        id: cand.id,
        companyId: cand.companyId,
        tipoCiclo: cand.tipoCiclo,
        cicloReferencia: cand.cicloReferencia,
      };
      paraFechado.push(info);
      if (TIPOS_QUE_ALERTAM_AO_FECHAR.includes(cand.tipoCiclo)) {
        await emitAutoAlert(cand.tipoCiclo, cand.cicloReferencia);
      }
    }
  }

  return { paraAtrasado, paraFechado };
}

// ============================================================
// Hook 3 — updateCycleSchedule(companyId, tipoCiclo, cicloReferencia,
//                              emitAutoAlert)
// ============================================================

/**
 * Resultado canonico do `updateCycleSchedule`.
 *
 * - `transitionedToFechado`: `true` se a linha passou de nao-fechado para
 *   `fechado` (ou nasceu ja fechada via INSERT). `false` se a linha ja
 *   estava `fechado` — nenhum alerta e emitido.
 */
export interface UpdateCycleScheduleResult {
  transitionedToFechado: boolean;
}

/**
 * DOC 06 §14.7. Utilitario canonico chamado pelos hooks de motor de
 * outras camadas (`processClosedMonth`, `triggerQuarterlyCalculation`,
 * `closeNR1Cycle`) para forcar transicao de `cycleSchedule` para
 * `fechado`. UPSERT canonico idempotente.
 *
 * Apos transicao efetiva de nao-fechado para fechado, dispara
 * `emitAutoAlert(tipoCiclo, cicloReferencia)` — mas somente para tipos
 * canonicamente alertaveis (`instrumento_c`, `fechamento_mensal`).
 * `radar_nr1` fecha sem alerta (evaluateNR1Alerts cobre — §14.7);
 * `instrumento_a/d` nao fecham automaticamente mas se algum caller
 * excepcional os forcar, nao alertam por este motor (Y8).
 *
 * A `dataFechamento` gravada e o proprio `now` fornecido pelo caller.
 * Alinha o motor a datas literais nos testes; em producao o job cron
 * passa `new Date()`.
 */
export async function updateCycleSchedule(
  db: RoipDatabase,
  companyId: number,
  tipoCiclo: CycleScheduleTipo,
  cicloReferencia: string,
  now: Date,
  emitAutoAlert: EmitAutoAlert = NOOP_EMIT_AUTO_ALERT,
): Promise<UpdateCycleScheduleResult> {
  const [prev] = await db
    .select({ id: cycleSchedule.id, status: cycleSchedule.status })
    .from(cycleSchedule)
    .where(
      and(
        eq(cycleSchedule.companyId, companyId),
        eq(cycleSchedule.tipoCiclo, tipoCiclo),
        eq(cycleSchedule.cicloReferencia, cicloReferencia),
      ),
    )
    .limit(1);

  const wasNotFechado = !prev || prev.status !== 'fechado';

  await db
    .insert(cycleSchedule)
    .values({
      companyId,
      tipoCiclo,
      cicloReferencia,
      status: 'fechado',
      dataFechamento: now,
    })
    .onDuplicateKeyUpdate({
      set: { status: 'fechado', dataFechamento: now },
    });

  if (wasNotFechado && TIPOS_QUE_ALERTAM_AO_FECHAR.includes(tipoCiclo)) {
    await emitAutoAlert(tipoCiclo, cicloReferencia);
  }

  return { transitionedToFechado: wasNotFechado };
}

// ============================================================
// Hook 4 — incrementCycleScheduleCounter(cycleScheduleId, delta)
// ============================================================

/**
 * DOC 06 §14.8. Incremento otimista, sem transacao — race conditions
 * canonicamente toleradas com reconciliacao diaria via
 * `refreshCycleScheduleCounters` (job cron de outra ME). Retorna linhas
 * afetadas (0 se `id` nao existe; 1 se atualizou).
 *
 * Implementacao canonica em 2 chamadas (SELECT + UPDATE) para preservar
 * 100% Drizzle tipado (RV-12); `null` inicial e tratado como 0 antes do
 * incremento. Aceita `delta` positivo (padrao +1, uso canonico no submit)
 * ou negativo (uso em cancelamento/reversao — se o caller preferir).
 *
 * A race condition tolerada aqui vale a pena mesmo com 2 chamadas: dois
 * submits concorrentes podem sobrescrever um ao outro; a reconciliacao
 * diaria corrige. Precisao exata em tempo real nao e critica — o valor
 * so alimenta barra de progresso na UI.
 */
export async function incrementCycleScheduleCounter(
  db: RoipDatabase,
  id: number,
  delta = 1,
): Promise<number> {
  const [row] = await db
    .select({ totalRespondidos: cycleSchedule.totalRespondidos })
    .from(cycleSchedule)
    .where(eq(cycleSchedule.id, id))
    .limit(1);
  if (!row) return 0;
  const novoValor = (row.totalRespondidos ?? 0) + delta;
  const [res] = await db
    .update(cycleSchedule)
    .set({ totalRespondidos: novoValor })
    .where(eq(cycleSchedule.id, id));
  return res.affectedRows;
}
