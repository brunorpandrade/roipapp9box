// ROIP APP 9BOX — motor canonico `monthlyClosureOrchestrator` (ME-031).
//
// Consolida os 6 hooks canonicos do DOC 03 §18 + §4 + DOC 06 §13.7 +
// §15.1. Motor puro: zero resolver tRPC exposto, chamado por jobs cron
// (a virem em MEs futuras) e por outros motores. Sucede o motor irmao
// `cycleScheduleEngine` (ME-030) — que este orchestrator invoca via
// `updateCycleSchedule` para transicionar `cycleSchedule` do tipo
// `fechamento_mensal` para `fechado` na cascata canonica.
//
// Convencoes canonicas desta ME (herdadas de S043-S045 da ME-030):
//   - `now` sempre parametro explicito. Nunca `new Date()` interno — o
//     motor e deterministico, testavel com datas literais, e o caller
//     (job cron ou outro motor) e responsavel pelo relogio canonico.
//   - Motores irmaos ainda-nao-existentes injetados via dependency
//     injection (S046). Padrao no-op documentado (constantes
//     `NOOP_EVALUATE_MONTHLY_ALERTS`, `NOOP_EVALUATE_ADMIN_ALERTS`,
//     `NOOP_TRIGGER_QUARTERLY_CALCULATION`, `NOOP_RECALCULATE_QUARTER`).
//     Ligacao real acontece no caller em ME futura — sem editar este
//     motor. `EmitAutoAlert` reusado do `cycleScheduleEngine`.
//   - Deteccao canonica de `houveAlteracao` (S047) por comparacao
//     temporal contra `desbloqueadoEm` em 3 tabelas: `performanceData.
//     updatedAt`, `companyMonthlyData.updatedAt`, `performanceVariableData.
//     createdAt` (esta tabela nao tem `updatedAt` — INSERT novo eh o
//     sinal canonico; edicao da mesma variable via UPSERT nao e detectada,
//     lacuna canonicamente tolerada — DOC 06 §13.7).
//   - `runDailyClosureJob` opera por empresa (S048) — canonico DOC 06
//     §15.1 "instancia unica por empresa" com "fuso local da empresa".
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME (RV-13).
//
// Cascata canonica de `runDailyClosureJob(companyId, now)` (DOC 06 §15.1):
//   1) `refreshCycleSchedule(companyId, now)` — motor irmao ME-030.
//   2) `updateCycleScheduleStatuses(now, emitAutoAlert)` — motor irmao.
//   3) Expiracao de janelas de desbloqueio da empresa (§13.7) —
//      `expireUnlockWindow(companyId, mes, now, ...)` para cada mes com
//      `expiraEm < now` e status ainda `desbloqueado`.
//   4) Fechamento automatico do mes subsequente no dia 11 fuso local
//      (§4.2) — transiciona `monthlyClosureStatus.status` de `aberto`
//      para `fechado` para o mes imediatamente anterior; encadeia
//      `processClosedMonth(companyId, mes, now, ...)` para cada mes
//      recem-fechado.
//
// Cascata canonica de `processClosedMonth(companyId, mes, now)` (§4 + §18.1):
//   1) `evaluateMonthlyAlerts(companyId, mes)` — DI, dispara P08+B1+D049.
//   2) `updateCycleSchedule('fechamento_mensal', mes, now, emitAutoAlert)`
//      — cascade para `cycleSchedule` (aciona `ciclo_mensal_fechado`).
//   3) Marca `monthlyClosureStatus.processadoEm = now` (auditoria).
//   4) `checkAndTriggerQuarterlyCalculation(companyId, mes, now, ...)`.
//
// Cascata canonica de `expireUnlockWindow(companyId, mes, now)` (§13.7):
//   1) Le status corrente; se != `desbloqueado`, NOOP (protecao contra
//      concorrencia; alinhado ao SELECT FOR UPDATE canonico do §13.7).
//   2) UPDATE `monthlyClosureStatus.status = fechado`,
//      `dataFechamento = now`.
//   3) Le a linha mais recente de `monthlyUnlockLog` para o par
//      (companyId, mes) — a que representa a janela recem-expirada.
//   4) Detecta `houveAlteracao` por comparacao temporal (S047).
//   5) `markMonthlyUnlockJanelaExpirada(logId, houveAlteracao)`.
//   6) Se `houveAlteracao=true`, chama `recalculateAfterUnlock`.

import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  getPreviousMonth,
  getMonthInTimezone,
  getDayInTimezone,
  getYearInTimezone,
  formatMensalCicloReferencia,
} from '../../lib/cycleDates';
import { mesToTrimestre } from '../../lib/quarterlyPeriod';
import {
  companies,
  companyMonthlyData,
  monthlyClosureStatus,
  monthlyUnlockLog,
  performanceData,
  performanceVariableData,
} from '../../db/schema';
import type { EmitAutoAlert } from './cycleScheduleEngine';
import {
  NOOP_EMIT_AUTO_ALERT,
  refreshCycleSchedule,
  updateCycleSchedule,
  updateCycleScheduleStatuses,
} from './cycleScheduleEngine';

// ============================================================
// Dependency injection — S046 (padrao S043 estendido)
// ============================================================

/**
 * Motor de alertas mensais (DOC 06 §8.11). Chamado por `processClosedMonth`.
 * Motor real ainda nao existe (ME futura). Assinatura canonica:
 * `(companyId, mes) => Promise<void>`. Ligacao real acontece no caller
 * quando o motor de alertas nascer — sem editar este orchestrator.
 */
export type EvaluateMonthlyAlerts = (companyId: number, mes: string) => Promise<void>;

/**
 * Motor de alertas administrativos (DOC 06 §8.11). Chamado por
 * `processClosedMonth` quando fechamento detecta empresa sem RF
 * atribuido (D049 — DOC 03 §4.8). Motor real ainda nao existe.
 */
export type EvaluateAdminAlerts = (
  tipo: 'fechamento_bloqueado_sem_resp_financeiro',
  companyId: number,
  mes: string,
) => Promise<void>;

/**
 * Motor de calculo trimestral (DOC 03 §3.11 `triggerQuarterlyCalculation`).
 * Chamado por `checkAndTriggerQuarterlyCalculation` quando o terceiro
 * mes do trimestre fecha e os 3 meses do trimestre estao fechados. Motor
 * real ainda nao existe (ME futura).
 */
export type TriggerQuarterlyCalculation = (companyId: number, trimestre: string) => Promise<void>;

/**
 * Motor de recalculo trimestral retroativo (DOC 03 §3.10 + §3.11
 * `recalculateAfterUnlock`). Chamado por `recalculateAfterUnlock` e
 * `triggerRetroactiveRecalculation`. Assinatura canonica alinhada ao
 * `TriggerQuarterlyCalculation` — a diferenca canonica e que o caller
 * marca `performanceMultiplierLog.ajusteRetroativo = true` (DOC 03 §3.10).
 * Motor real ainda nao existe.
 */
export type RecalculateQuarter = (companyId: number, trimestre: string) => Promise<void>;

export const NOOP_EVALUATE_MONTHLY_ALERTS: EvaluateMonthlyAlerts = async () => {
  // Motor de alertas mensais ainda nao existe (DOC 06 §8 — ME futura).
};

export const NOOP_EVALUATE_ADMIN_ALERTS: EvaluateAdminAlerts = async () => {
  // Motor de alertas administrativos ainda nao existe.
};

export const NOOP_TRIGGER_QUARTERLY_CALCULATION: TriggerQuarterlyCalculation = async () => {
  // Motor de calculo trimestral (Eixo X) ainda nao existe (DOC 03 §3.11
  // — ME futura). Deixado como no-op canonico para desacoplar ordem.
};

export const NOOP_RECALCULATE_QUARTER: RecalculateQuarter = async () => {
  // Motor de recalculo trimestral retroativo ainda nao existe.
};

/**
 * Cascata de dependencias canonicas dos hooks. Todos os campos sao
 * opcionais — o default e a constante no-op correspondente. Passar
 * apenas o que o caller precisa exercitar (comum em teste).
 */
export interface OrchestratorDependencies {
  emitAutoAlert?: EmitAutoAlert;
  evaluateMonthlyAlerts?: EvaluateMonthlyAlerts;
  evaluateAdminAlerts?: EvaluateAdminAlerts;
  triggerQuarterlyCalculation?: TriggerQuarterlyCalculation;
  recalculateQuarter?: RecalculateQuarter;
}

function resolveDeps(deps: OrchestratorDependencies): Required<OrchestratorDependencies> {
  return {
    emitAutoAlert: deps.emitAutoAlert ?? NOOP_EMIT_AUTO_ALERT,
    evaluateMonthlyAlerts: deps.evaluateMonthlyAlerts ?? NOOP_EVALUATE_MONTHLY_ALERTS,
    evaluateAdminAlerts: deps.evaluateAdminAlerts ?? NOOP_EVALUATE_ADMIN_ALERTS,
    triggerQuarterlyCalculation:
      deps.triggerQuarterlyCalculation ?? NOOP_TRIGGER_QUARTERLY_CALCULATION,
    recalculateQuarter: deps.recalculateQuarter ?? NOOP_RECALCULATE_QUARTER,
  };
}

// ============================================================
// Resultados canonicos exportados
// ============================================================

/**
 * Resultado canonico de `runDailyClosureJob`. Traz o inventario do que
 * a cascata efetivamente fez na passagem — util para telemetria de job
 * (DOC 06 §15.4) e para os testes.
 */
export interface RunDailyClosureJobResult {
  refreshedCycleScheduleRows: number;
  paraAtrasado: number;
  paraFechadoInCycleSchedule: number;
  janelasExpiradas: number;
  mesesFechadosDia11: string[];
}

/**
 * Resultado canonico de `processClosedMonth`. `processadoEmMarcado`
 * confirma que a auditoria (`monthlyClosureStatus.processadoEm`) foi
 * gravada; `trimestreDisparado` indica se
 * `checkAndTriggerQuarterlyCalculation` chegou a acionar o calculo do
 * trimestre.
 */
export interface ProcessClosedMonthResult {
  processadoEmMarcado: boolean;
  trimestreDisparado: string | null;
}

/**
 * Resultado canonico de `checkAndTriggerQuarterlyCalculation`. Reflete
 * a semantica canonica DOC 03 §3.11: so dispara quando o mes fechado eh
 * o TERCEIRO do trimestre e os 3 meses do trimestre estao fechados.
 */
export interface CheckAndTriggerQuarterlyCalculationResult {
  triggered: boolean;
  trimestre: string | null;
  motivo: 'ok' | 'nao_e_terceiro_mes' | 'trimestre_incompleto' | 'mes_invalido';
}

/**
 * Resultado canonico de `expireUnlockWindow`. Reflete a transacao
 * canonica DOC 06 §13.7: retorno completo permite ao caller (job cron)
 * telemetrar sem re-consultar.
 */
export interface ExpireUnlockWindowResult {
  expirada: boolean;
  houveAlteracao: boolean;
  recalculoDisparado: boolean;
  motivo: 'ok' | 'nao_desbloqueado' | 'sem_unlock_log';
}

// ============================================================
// Hook 4 — expireUnlockWindow (DOC 06 §13.7)
// ============================================================

/**
 * Deteccao canonica de `houveAlteracao` (S047 — DOC 06 §13.7). Compara
 * `updatedAt`/`createdAt` das 3 tabelas relevantes ao par (companyId,
 * mes) contra `desbloqueadoEm` da janela. Retorna `true` se qualquer
 * linha foi tocada durante a janela.
 *
 * Notas canonicas:
 *   - `performanceData.updatedAt` (onUpdateNow) captura RH mensal e
 *     recalculo do motor.
 *   - `companyMonthlyData.updatedAt` (onUpdateNow) captura RH (custo,
 *     faturamento, diasUteis).
 *   - `performanceVariableData.createdAt` — tabela sem `updatedAt`
 *     proprio, entao INSERT novo eh o sinal canonico. UPSERT sobre
 *     variable existente nao e detectada — lacuna tolerada (DOC 06
 *     §13.7 "algum campo relevante alterado" — INSERT novo satisfaz).
 */
async function detectAlteracaoDuranteJanela(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  desbloqueadoEm: Date,
): Promise<boolean> {
  const perfTocado = await db
    .select({ id: performanceData.id })
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        eq(performanceData.mes, mes),
        gte(performanceData.updatedAt, desbloqueadoEm),
      ),
    )
    .limit(1);
  if (perfTocado.length > 0) return true;

  const companyTocado = await db
    .select({ id: companyMonthlyData.id })
    .from(companyMonthlyData)
    .where(
      and(
        eq(companyMonthlyData.companyId, companyId),
        eq(companyMonthlyData.mes, mes),
        gte(companyMonthlyData.updatedAt, desbloqueadoEm),
      ),
    )
    .limit(1);
  if (companyTocado.length > 0) return true;

  const perfIds = await db
    .select({ id: performanceData.id })
    .from(performanceData)
    .where(and(eq(performanceData.companyId, companyId), eq(performanceData.mes, mes)));
  if (perfIds.length > 0) {
    const varTocado = await db
      .select({ id: performanceVariableData.id })
      .from(performanceVariableData)
      .where(
        and(
          inArray(
            performanceVariableData.performanceDataId,
            perfIds.map((r) => r.id),
          ),
          gte(performanceVariableData.createdAt, desbloqueadoEm),
        ),
      )
      .limit(1);
    if (varTocado.length > 0) return true;
  }

  return false;
}

/**
 * DOC 06 §13.7. Expira a janela de 24h de desbloqueio de um mes,
 * transicionando `monthlyClosureStatus.status` de `desbloqueado` para
 * `fechado`. Se `houveAlteracao=true` (detectado por comparacao
 * temporal S047), aciona `recalculateAfterUnlock` para reprocessar o
 * trimestre afetado.
 *
 * Idempotente: se o status corrente nao for `desbloqueado`, NOOP
 * (retorna `motivo='nao_desbloqueado'`). Se nao houver `monthlyUnlockLog`
 * correspondente, transiciona status e retorna `motivo='sem_unlock_log'`
 * — cenario canonicamente raro mas possivel (dado sujo historico).
 */
export async function expireUnlockWindow(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  now: Date,
  deps: OrchestratorDependencies = {},
): Promise<ExpireUnlockWindowResult> {
  const [current] = await db
    .select({ status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)))
    .limit(1);

  if (!current || current.status !== 'desbloqueado') {
    return {
      expirada: false,
      houveAlteracao: false,
      recalculoDisparado: false,
      motivo: 'nao_desbloqueado',
    };
  }

  await db
    .update(monthlyClosureStatus)
    .set({ status: 'fechado', dataFechamento: now })
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)));

  const [ultimoLog] = await db
    .select({ id: monthlyUnlockLog.id, desbloqueadoEm: monthlyUnlockLog.desbloqueadoEm })
    .from(monthlyUnlockLog)
    .where(and(eq(monthlyUnlockLog.companyId, companyId), eq(monthlyUnlockLog.mes, mes)))
    .orderBy(desc(monthlyUnlockLog.desbloqueadoEm), desc(monthlyUnlockLog.id))
    .limit(1);

  if (!ultimoLog || !ultimoLog.desbloqueadoEm) {
    return {
      expirada: true,
      houveAlteracao: false,
      recalculoDisparado: false,
      motivo: 'sem_unlock_log',
    };
  }

  const houveAlteracao = await detectAlteracaoDuranteJanela(
    db,
    companyId,
    mes,
    ultimoLog.desbloqueadoEm,
  );

  await db
    .update(monthlyUnlockLog)
    .set({ houveAlteracao })
    .where(eq(monthlyUnlockLog.id, ultimoLog.id));

  let recalculoDisparado = false;
  if (houveAlteracao) {
    recalculoDisparado = await recalculateAfterUnlock(db, companyId, mes, deps);
  }

  return { expirada: true, houveAlteracao, recalculoDisparado, motivo: 'ok' };
}

// ============================================================
// Hook 5 — recalculateAfterUnlock (DOC 03 §4.5 + §3.10)
// ============================================================

/**
 * DOC 03 §4.5 + §3.10. Chamado por `expireUnlockWindow` quando
 * `houveAlteracao=true`. Deriva o trimestre canonico do mes desbloqueado
 * e delega o recalculo ao motor Eixo X via DI `recalculateQuarter`
 * (motor real em ME futura — default no-op).
 *
 * Retorna `true` se o recalculo foi disparado (mes valido); `false` se
 * `mes` nao bate no formato canonico `YYYY-MM` (cenario improvavel dado
 * o schema mas defensivo).
 */
export async function recalculateAfterUnlock(
  _db: RoipDatabase,
  companyId: number,
  mes: string,
  deps: OrchestratorDependencies = {},
): Promise<boolean> {
  const resolved = resolveDeps(deps);
  const trimestre = mesToTrimestre(mes);
  if (!trimestre) return false;
  await resolved.recalculateQuarter(companyId, trimestre);
  return true;
}

// ============================================================
// Hook 6 — triggerRetroactiveRecalculation (DOC 03 §3.9 + §3.11)
// ============================================================

/**
 * DOC 03 §3.9 + §3.11. Recalculo retroativo trimestral disparado por
 * alteracao de `metaROI` no cadastro da empresa ou manualmente por Bruno.
 * Trimestre eh parametro canonico do caller (formato `YYYY-QN`).
 * Delegacao para o motor Eixo X via DI `recalculateQuarter`.
 *
 * Design canonico: mesmo mecanismo de `recalculateAfterUnlock`. A
 * diferenca canonica reside no caller — que grava
 * `performanceMultiplierLog.ajusteRetroativo = true` para trilha de
 * auditoria. Aqui, o orchestrator apenas dispara o recalculo.
 */
export async function triggerRetroactiveRecalculation(
  _db: RoipDatabase,
  companyId: number,
  trimestre: string,
  deps: OrchestratorDependencies = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  await resolved.recalculateQuarter(companyId, trimestre);
}

// ============================================================
// Hook 3 — checkAndTriggerQuarterlyCalculation (DOC 03 §3.11)
// ============================================================

/**
 * DOC 03 §3.11. Chamado por `processClosedMonth`. So dispara o calculo
 * trimestral quando:
 *   1) O mes recem-fechado eh o terceiro do trimestre (Mar/Jun/Set/Dez).
 *   2) Os 3 meses do trimestre estao com
 *      `monthlyClosureStatus.status='fechado'`.
 *
 * Se o mes nao eh o terceiro, retorna `motivo='nao_e_terceiro_mes'`. Se
 * eh o terceiro mas algum dos 2 anteriores nao esta fechado, retorna
 * `motivo='trimestre_incompleto'` — cenario canonico quando ha meses
 * historicos ainda `desbloqueado` ou historicamente incompleto.
 */
export async function checkAndTriggerQuarterlyCalculation(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  deps: OrchestratorDependencies = {},
): Promise<CheckAndTriggerQuarterlyCalculationResult> {
  const trimestre = mesToTrimestre(mes);
  if (!trimestre) {
    return { triggered: false, trimestre: null, motivo: 'mes_invalido' };
  }

  // A checagem canonica de "terceiro mes" e feita re-derivando os meses
  // do trimestre e verificando se `mes` e o ultimo. Evita duplicacao de
  // parse ao reusar `getQuarterMonths` implicitamente via ordenacao.
  const trimestreParsed = trimestre.match(/^(\d{4})-Q([1-4])$/);
  if (!trimestreParsed) {
    return { triggered: false, trimestre, motivo: 'mes_invalido' };
  }
  const ano = parseInt(trimestreParsed[1]!, 10);
  const trimestreNum = parseInt(trimestreParsed[2]!, 10);
  const ultimoMesDoTrimestre = trimestreNum * 3;
  const mesNumero = parseInt(mes.slice(5, 7), 10);
  if (mesNumero !== ultimoMesDoTrimestre) {
    return { triggered: false, trimestre, motivo: 'nao_e_terceiro_mes' };
  }

  const mesesDoTrimestre = [
    formatMensalCicloReferencia(ano, ultimoMesDoTrimestre - 2),
    formatMensalCicloReferencia(ano, ultimoMesDoTrimestre - 1),
    formatMensalCicloReferencia(ano, ultimoMesDoTrimestre),
  ];

  const statusRows = await db
    .select({ mes: monthlyClosureStatus.mes, status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(
      and(
        eq(monthlyClosureStatus.companyId, companyId),
        inArray(monthlyClosureStatus.mes, mesesDoTrimestre),
      ),
    );

  const todosFechados = statusRows.length === 3 && statusRows.every((r) => r.status === 'fechado');
  if (!todosFechados) {
    return { triggered: false, trimestre, motivo: 'trimestre_incompleto' };
  }

  const resolved = resolveDeps(deps);
  await resolved.triggerQuarterlyCalculation(companyId, trimestre);
  return { triggered: true, trimestre, motivo: 'ok' };
}

// ============================================================
// Hook 2 — processClosedMonth (DOC 03 §4 + §18.1)
// ============================================================

/**
 * DOC 03 §4 + §18.1. Chamado apos transicao canonica de
 * `monthlyClosureStatus.status` para `fechado` (seja pelo dia 11
 * automatico dentro de `runDailyClosureJob`, seja pela transicao
 * manual `desbloqueado -> fechado` via expiracao — nesse ultimo caso
 * `expireUnlockWindow` ja lida com o recalculo retroativo e NAO chama
 * este hook para nao duplicar avaliacao de alertas).
 *
 * Cascata canonica:
 *   1) `evaluateMonthlyAlerts(companyId, mes)` — DI (P08 + B1 + D049
 *      conforme §8.11 do DOC 06). O hook do DOC 06 e responsavel por
 *      detectar o cenario D049 (empresa sem RF) e disparar
 *      `evaluateAdminAlerts` internamente — aqui o orchestrator so
 *      chama `evaluateMonthlyAlerts` uma vez.
 *   2) `updateCycleSchedule('fechamento_mensal', mes, now, emitAutoAlert)`
 *      — cascata para `cycleSchedule` (aciona `ciclo_mensal_fechado` se
 *      linha nao estava fechada).
 *   3) Marca `processadoEm = now` na linha correspondente para
 *      auditoria canonica.
 *   4) `checkAndTriggerQuarterlyCalculation(companyId, mes, now, deps)`.
 */
export async function processClosedMonth(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  now: Date,
  deps: OrchestratorDependencies = {},
): Promise<ProcessClosedMonthResult> {
  const resolved = resolveDeps(deps);

  await resolved.evaluateMonthlyAlerts(companyId, mes);

  await updateCycleSchedule(db, companyId, 'fechamento_mensal', mes, now, resolved.emitAutoAlert);

  const [updated] = await db
    .update(monthlyClosureStatus)
    .set({ processadoEm: now })
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)));
  const processadoEmMarcado = updated.affectedRows > 0;

  const quarterly = await checkAndTriggerQuarterlyCalculation(db, companyId, mes, deps);

  return {
    processadoEmMarcado,
    trimestreDisparado: quarterly.triggered ? quarterly.trimestre : null,
  };
}

// ============================================================
// Hook 1 — runDailyClosureJob (DOC 06 §15.1 + §13.7 + DOC 03 §4.2)
// ============================================================

/**
 * DOC 06 §15.1 + §13.7 + DOC 03 §4.2. Ponto de entrada canonico do
 * cron diario 00:00 fuso local da empresa. Orquestra a cascata
 * completa:
 *
 *   1) `refreshCycleSchedule(companyId, now)` — mantem `cycleSchedule`
 *      populado no horizonte de 6 meses (motor irmao ME-030).
 *   2) `updateCycleScheduleStatuses(now, emitAutoAlert)` — executa as
 *      transicoes canonicas globais de `cycleSchedule` (aberto ->
 *      atrasado; fechado no dia 11 para C e mensal).
 *   3) Expiracao de janelas de desbloqueio: para cada
 *      `monthlyUnlockLog` cujo `expiraEm < now` e cujo par
 *      (companyId, mes) esta ainda `desbloqueado`, chama
 *      `expireUnlockWindow`. A deteccao usa o par (companyId, mes) da
 *      empresa alvo — nao itera globalmente (S048: instancia por
 *      empresa).
 *   4) Fechamento automatico do dia 11 (§4.2): se `now` no fuso local
 *      da empresa e dia 11, transiciona `monthlyClosureStatus.status`
 *      de `aberto` para `fechado` para o mes imediatamente anterior,
 *      encadeia `processClosedMonth` para cada mes recem-fechado.
 *
 * Idempotente por design: reexecucao no mesmo dia nao duplica linhas
 * (todas as transicoes verificam status corrente). Falha canonica se
 * `companyId` nao aparece em `companies` — sobe como excecao do
 * `refreshCycleSchedule`.
 */
export async function runDailyClosureJob(
  db: RoipDatabase,
  companyId: number,
  now: Date,
  deps: OrchestratorDependencies = {},
): Promise<RunDailyClosureJobResult> {
  const resolved = resolveDeps(deps);

  // Passo 1: refresh do horizonte
  const refreshResult = await refreshCycleSchedule(db, companyId, now);

  // Passo 2: transicoes canonicas de cycleSchedule
  const statusesResult = await updateCycleScheduleStatuses(db, now, resolved.emitAutoAlert);

  // Passo 3: expiracao de janelas de desbloqueio da empresa
  const [company] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    throw new Error(`runDailyClosureJob: company ${companyId} nao existe`);
  }
  const timeZone = company.timezone;

  const janelasVencidas = await db
    .select({ id: monthlyUnlockLog.id, mes: monthlyUnlockLog.mes })
    .from(monthlyUnlockLog)
    .innerJoin(
      monthlyClosureStatus,
      and(
        eq(monthlyClosureStatus.companyId, monthlyUnlockLog.companyId),
        eq(monthlyClosureStatus.mes, monthlyUnlockLog.mes),
      ),
    )
    .where(
      and(
        eq(monthlyUnlockLog.companyId, companyId),
        lt(monthlyUnlockLog.expiraEm, now),
        eq(monthlyClosureStatus.status, 'desbloqueado'),
      ),
    );

  // Deduplica por mes (uma mesma empresa-mes pode ter varios logs, mas
  // so um esta ativo por vez — protegido por §13.5 canonico).
  const mesesUnicos = Array.from(new Set(janelasVencidas.map((r) => r.mes)));
  let janelasExpiradas = 0;
  for (const mes of mesesUnicos) {
    const result = await expireUnlockWindow(db, companyId, mes, now, deps);
    if (result.expirada) janelasExpiradas += 1;
  }

  // Passo 4: fechamento automatico do dia 11 (§4.2)
  const mesesFechadosDia11: string[] = [];
  if (getDayInTimezone(now, timeZone) === 11) {
    const anoLocal = getYearInTimezone(now, timeZone);
    const mesLocal = getMonthInTimezone(now, timeZone);
    const anterior = getPreviousMonth(anoLocal, mesLocal);
    const mesAnteriorRef = formatMensalCicloReferencia(anterior.ano, anterior.mes);

    // Localiza a linha correspondente. Se nao existe, cria com status
    // `fechado` — canonico DOC 03 §4.1 default `aberto` na criacao
    // padrao; aqui, apos passagem do dia 11, a semantica canonica e
    // que o mes esta fechado.
    const [existing] = await db
      .select({ status: monthlyClosureStatus.status })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, companyId),
          eq(monthlyClosureStatus.mes, mesAnteriorRef),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(monthlyClosureStatus).values({
        companyId,
        mes: mesAnteriorRef,
        status: 'fechado',
        dataFechamento: now,
      });
      mesesFechadosDia11.push(mesAnteriorRef);
      await processClosedMonth(db, companyId, mesAnteriorRef, now, deps);
    } else if (existing.status === 'aberto') {
      await db
        .update(monthlyClosureStatus)
        .set({ status: 'fechado', dataFechamento: now })
        .where(
          and(
            eq(monthlyClosureStatus.companyId, companyId),
            eq(monthlyClosureStatus.mes, mesAnteriorRef),
          ),
        );
      mesesFechadosDia11.push(mesAnteriorRef);
      await processClosedMonth(db, companyId, mesAnteriorRef, now, deps);
    }
    // Se `existing.status` for `fechado` ou `desbloqueado`, nao faz
    // nada — idempotencia canonica.
  }

  return {
    refreshedCycleScheduleRows: refreshResult.total,
    paraAtrasado: statusesResult.paraAtrasado,
    paraFechadoInCycleSchedule: statusesResult.paraFechado.length,
    janelasExpiradas,
    mesesFechadosDia11,
  };
}
