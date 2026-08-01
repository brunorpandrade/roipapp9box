// ROIP APP 9BOX — factories canonicas de religacao dos hooks NOOP (ME-059).
//
// Origem canonica:
// - DOC 06 §8.11 (inventario canonico dos hooks do DOC 03 → alertEngine).
// - RV-13 (cada motor gerado tem chamador na propria ME).
//
// Contrato canonico:
// - Cada factory recebe `db` (Drizzle) + `now` opcional e devolve uma
//   funcao com a assinatura canonica do hook consumidor. A funcao
//   invoca o motor real (`emitAlert` ou `emitAlertPostGravacao`)
//   populando os campos canonicos correspondentes.
// - Este arquivo e o unico ponto de conexao entre a camada de motor
//   (`src/lib/alerts/`) e os motores existentes que expoem hooks
//   NOOP (`cycleScheduleEngine`, `monthlyClosureOrchestrator`,
//   `nr1CalculationEngine`). Nenhum dos motores existentes importa
//   deste modulo — a integracao acontece no CALLER (job cron ou
//   proprio DOC 03).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `createAutoAlertHook` → consumido por
//     `tests/integration/alerts-hooks-integration.test.ts`
//     (exercita o pipeline end-to-end passando `updateCycleSchedule`
//     com o hook religado).
//   - `createNr1AlertFacade` → consumido pelo mesmo teste (exercita
//     `nr1CalculationEngine.evaluateNR1Alerts` com facade religada).
//   - `createAdminAlertHook` → consumido pelo mesmo teste (exercita
//     `processClosedMonth` com hook D049 religado).
//   - `createAdminUnlockAlertHook` (ME-061) → consumido por
//     `tests/integration/alerts-hooks-admin-unlock.test.ts` (factory
//     unitaria) e por `tests/integration/cadeia-canonica-me059-me060-me061.test.ts`
//     (cadeia end-to-end create → alerta enfileirado → e-mail canonico).
//     No wiring de producao, e passado ao `createCycleUnlockRequestsRouter`
//     em `src/server/routers/index.ts` como `evaluateAdminAlertsFactory`
//     (padrao Facade DI S244) — o factory recebe `ctx.db` no request.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, cycleUnlockRequests, employees, monthlyUnlockLog } from '../../db/schema';
import type { EmitAutoAlert } from '../../server/services/cycleScheduleEngine';
import type { EvaluateAdminAlerts } from '../../server/services/monthlyClosureOrchestrator';
import type {
  EmitAlertPostGravacaoInput as Nr1FacadeInput,
  Nr1AlertFacade,
} from '../../server/services/nr1CalculationEngine';
import type { EvaluateAdminUnlockAlerts } from '../../server/routers/cycleUnlockRequests';

import { emitAlert } from './emitAlert';
import { emitAlertPostGravacao } from './emitAlertPostGravacao';

/**
 * Factory canonica que produz `EmitAutoAlert` religado ao motor.
 *
 * Consumido por: `updateCycleScheduleStatuses` e `updateCycleSchedule`
 * (via passagem de parametro pelo caller, e.g. job cron ME futura).
 *
 * Mapeamento canonico (§8.11 hook 6 evaluateAutoAlerts):
 * - `tipoCiclo='instrumento_c'` → emitAlert('ciclo_instrumento_encerrado').
 * - `tipoCiclo='fechamento_mensal'` → emitAlert('ciclo_mensal_fechado').
 * - Outros tipos (radar_nr1, instrumento_a, instrumento_d): silencioso.
 *   Y8 canonizada — Instrumentos A e D nunca fecham automaticamente;
 *   NR-1 e coberto por `evaluateNR1Alerts`.
 *
 * O `escopo='empresa'` e `escopoDepartamentoId=null` e
 * `escopoEmployeeId=null` sao canonicos para ambos os tipos §3.7 —
 * ciclos administrativos tem escopo empresa exclusivamente.
 */
export function createAutoAlertHook(db: RoipDatabase, now?: Date): EmitAutoAlert {
  return async (companyId, tipoCiclo, cicloReferencia) => {
    if (tipoCiclo === 'instrumento_c') {
      await emitAlert(db, {
        companyId,
        tipo: 'ciclo_instrumento_encerrado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { cicloReferencia },
        linkContext: { companyId },
        now,
      });
      return;
    }
    if (tipoCiclo === 'fechamento_mensal') {
      await emitAlert(db, {
        companyId,
        tipo: 'ciclo_mensal_fechado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { cicloReferencia },
        linkContext: { companyId },
        now,
      });
      return;
    }
    // Outros tipos (radar_nr1, instrumento_a, instrumento_d): sem
    // alerta canonico (§8.11 hook 6). Silencio determinístico.
  };
}

/**
 * Factory canonica que produz `Nr1AlertFacade` religado ao motor.
 *
 * Consumido por: `evaluateNR1Alerts` e `closeNR1Cycle` (via injecao
 * pelo caller — job cron ME futura). O `DEFAULT_NR1_ALERT_FACADE`
 * (NOOP) permanece exportado do `nr1CalculationEngine.ts` para
 * compatibilidade — este factory substitui em producao.
 *
 * Mapeamento canonico (§8.11 hook 5 evaluateNR1Alerts):
 * - Input.tipo `'nr1_fator_critico' | 'nr1_ciclo_fechado'` →
 *   emitAlertPostGravacao com fatorId da Fase 6.
 * - Severidade padrao `'atencao'` (both types — §3.1).
 */
export function createNr1AlertFacade(db: RoipDatabase, now?: Date): Nr1AlertFacade {
  return {
    emitAlertPostGravacao: async (input: Nr1FacadeInput) => {
      await emitAlertPostGravacao(db, {
        alertId: input.alertId,
        companyId: input.companyId,
        tipo: input.tipo,
        severidade: 'atencao',
        escopoDepartamentoId: input.escopoDepartamentoId,
        fatorId: input.fatorId,
        cicloDbId: input.cicloDbId,
        now,
      });
    },
  };
}

/**
 * Factory canonica que produz `EvaluateAdminAlerts` religado ao motor
 * para D049 (`fechamento_bloqueado_sem_resp_financeiro`).
 *
 * Consumido por: `processClosedMonth` (via injecao). O contrato canonico
 * atual do hook e restrito a este unico tipo (`EvaluateAdminAlerts`
 * signature ja fixa em `monthlyClosureOrchestrator.ts` — ver ME-058
 * decisao S198 escrita restringida).
 *
 * Mapeamento canonico:
 * - D049: severidade 'critico', escopo 'empresa', trilha 'apenas_bruno'
 *   (§3.8.1). Link para `/super-admin/empresa/{companyId}`.
 * - Metadados canonicos: `{ mes }` — mes de referencia do fechamento
 *   bloqueado.
 */
export function createAdminAlertHook(db: RoipDatabase, now?: Date): EvaluateAdminAlerts {
  return async (tipo, companyId, mes) => {
    if (tipo !== 'fechamento_bloqueado_sem_resp_financeiro') {
      // Signature futura pode ampliar; por ora o motor rejeita tipos
      // que nao sejam D049 canonicamente aceitos pelo signature.
      return;
    }
    await emitAlert(db, {
      companyId,
      tipo: 'fechamento_bloqueado_sem_resp_financeiro',
      severidade: 'critico',
      escopo: 'empresa',
      escopoDepartamentoId: null,
      escopoEmployeeId: null,
      metadados: { mes },
      linkContext: { companyId },
      now,
    });
  };
}

/**
 * Factory canonica que produz `EvaluateAdminUnlockAlerts` religado ao
 * motor para P11 (fluxo administrativo de desbloqueio de mes fechado).
 *
 * Consumido por: `createCycleUnlockRequestsRouter` (via `evaluateAdminAlertsFactory`
 * — padrao Facade DI S244 canonizado em ME-061). Producao passa este
 * factory ao `appRouter` em `src/server/routers/index.ts`; testes passam
 * factories capturadoras deterministicas OU o factory legado direto.
 *
 * Mapeamento canonico (DOC 06 §8.11 hook 6 `evaluateAdminAlerts`
 * ramo P11 + DOC 06 §4.9-§4.11 snapshots + §3.6 severidades + §5
 * linkResolver + §7.1 trilha padrao RH+Bruno):
 *
 * - Signature `(tipo, requestId) => Promise<void>` (§8.11) — o factory
 *   carrega estado da solicitacao a partir do id (nao replica payload).
 * - Severidade canonica dos 3 tipos: `atencao` (§3.6.1/§3.6.2/§3.6.3)
 *   com override T1 para canal `imediato` aplicado no M6 (§6.5 regra 2).
 * - Escopo `empresa` para os 3 tipos; sem `escopoDepartamentoId` /
 *   `escopoEmployeeId` (§3.6).
 * - Trilha padrao (§7.1 — RH+Bruno) via `resolveDestinatarios` interno
 *   ao `emitAlert`.
 * - LinkContext canonico `{ companyId, mes }` — o `mes` e derivado da
 *   solicitacao. Roteamento condicional §5 (bruno vs rh) e aplicado no
 *   M5 pelo `resolveLinkDestino`.
 * - Isento de M1 (§3.6 — isencoes canonicas) — o M1 do pipeline nao
 *   suprime tipos administrativos por construcao (`stepM1Onboarding`
 *   ja excepciona-os no motor ME-059).
 * - Isento de M4 (§3.6 — cooldown nao se aplica a administrativos) —
 *   idem, `stepM4Cooldown` ja excepciona por tipo.
 *
 * Snapshots canonicos de `alerts.metadados` (§4.9-§4.11):
 *
 * - `desbloqueio_solicitado`: `{ cycleUnlockRequestId, mes, aba,
 *   liderNome | null, solicitanteEmployeeId, solicitanteNome,
 *   justificativa }`.
 * - `desbloqueio_aprovado`: `{ cycleUnlockRequestId, mes, aba,
 *   liderNome | null, solicitanteEmployeeId, solicitanteNome,
 *   decididoEm (ISO), comentarioAprovacao | null, monthlyUnlockLogId,
 *   expiraEm (ISO) }`.
 * - `desbloqueio_recusado`: `{ cycleUnlockRequestId, mes, aba,
 *   liderNome | null, solicitanteEmployeeId, solicitanteNome,
 *   decididoEm (ISO), motivoRecusa }`.
 *
 * Resolucao de nomes canonica:
 * - `solicitanteNome`: SELECT em `employees` ou `cLevelMembers`
 *   conforme `cycleUnlockRequests.solicitanteTipo` (`employee` |
 *   `clevel`). Se linha inexistente (soft delete concorrente),
 *   preserva string vazia para permitir gravacao — a rastreabilidade
 *   permanece via `solicitanteEmployeeId`.
 * - `liderNome`: presente somente quando `aba='lider'`; SELECT em
 *   `employees` ou `cLevelMembers` conforme `liderTipo`. `null` para
 *   `aba='rh'` ou `aba='faturamento'`.
 *
 * Resolucao de `monthlyUnlockLog` (apenas `desbloqueio_aprovado`):
 * SELECT em `monthlyUnlockLog` por `unlockRequestId = requestId`,
 * mais recente por `desbloqueadoEm DESC`. A transacao canonica de
 * §13.5 grava a linha DENTRO da transacao (COMMIT ja aconteceu quando
 * este factory eh chamado — o disparo eh pos-COMMIT fire-and-forget),
 * portanto a linha existe.
 *
 * Comportamento em falha:
 * - Solicitacao inexistente (requestId invalido ou soft delete
 *   concorrente): silencio canonico (log warning + return); alerta
 *   nao eh gerado. O motor nao lanca — o disparo eh fire-and-forget
 *   §8.12.
 * - `monthlyUnlockLog` inexistente para `desbloqueio_aprovado`:
 *   silencio canonico identico. Cenario patologico de crash entre
 *   COMMIT e disparo — decisao permanece efetiva via auditoria
 *   cross-tabela (§13.9), o alerta perde-se conforme §8.12.
 */
export function createAdminUnlockAlertHook(
  db: RoipDatabase,
  now?: Date,
): EvaluateAdminUnlockAlerts {
  return async (tipo, requestId) => {
    // (1) Carrega estado canonico da solicitacao.
    const requestRows = await db
      .select({
        id: cycleUnlockRequests.id,
        companyId: cycleUnlockRequests.companyId,
        solicitanteTipo: cycleUnlockRequests.solicitanteTipo,
        solicitanteId: cycleUnlockRequests.solicitanteId,
        mes: cycleUnlockRequests.mes,
        aba: cycleUnlockRequests.aba,
        liderId: cycleUnlockRequests.liderId,
        liderTipo: cycleUnlockRequests.liderTipo,
        justificativa: cycleUnlockRequests.justificativa,
        decididoEm: cycleUnlockRequests.decididoEm,
        comentarioAprovacao: cycleUnlockRequests.comentarioAprovacao,
        motivoRecusa: cycleUnlockRequests.motivoRecusa,
      })
      .from(cycleUnlockRequests)
      .where(eq(cycleUnlockRequests.id, requestId))
      .limit(1);
    const req = requestRows[0];
    if (req === undefined) {
      // Silencio canonico (§8.12) — solicitacao nao existe.
      return;
    }

    // (2) Resolve solicitanteNome canonicamente por tipo.
    const solicitanteNome = await resolveTitularNome(db, req.solicitanteTipo, req.solicitanteId);

    // (3) Resolve liderNome canonicamente quando aba='lider'.
    let liderNome: string | null = null;
    if (req.aba === 'lider' && req.liderId !== null && req.liderTipo !== null) {
      liderNome = await resolveTitularNome(db, req.liderTipo, req.liderId);
    }

    // (4) Monta e dispara pelo tipo canonico (§4.9-§4.11).
    if (tipo === 'desbloqueio_solicitado') {
      await emitAlert(db, {
        companyId: req.companyId,
        tipo: 'desbloqueio_solicitado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: {
          cycleUnlockRequestId: req.id,
          mes: req.mes,
          aba: req.aba,
          liderNome,
          solicitanteEmployeeId: req.solicitanteId,
          solicitanteNome,
          justificativa: req.justificativa,
        },
        linkContext: { companyId: req.companyId, mes: req.mes },
        now,
      });
      return;
    }

    if (tipo === 'desbloqueio_aprovado') {
      // Carrega monthlyUnlockLog mais recente vinculado a esta solicitacao
      // (§13.5 grava uma linha por aprovacao; solicitacao aprovada 1x tem
      // exatamente uma linha — LIMIT 1 defensivo).
      const logRows = await db
        .select({
          id: monthlyUnlockLog.id,
          expiraEm: monthlyUnlockLog.expiraEm,
        })
        .from(monthlyUnlockLog)
        .where(eq(monthlyUnlockLog.unlockRequestId, req.id))
        .orderBy(monthlyUnlockLog.desbloqueadoEm)
        .limit(1);
      const log = logRows[0];
      if (log === undefined) {
        // Silencio canonico (§8.12) — cenario patologico. Log de decisao
        // permanece efetivo via cycleUnlockRequests; auditoria cross-tabela
        // (§13.9) preserva rastreabilidade.
        return;
      }
      await emitAlert(db, {
        companyId: req.companyId,
        tipo: 'desbloqueio_aprovado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: {
          cycleUnlockRequestId: req.id,
          mes: req.mes,
          aba: req.aba,
          liderNome,
          solicitanteEmployeeId: req.solicitanteId,
          solicitanteNome,
          decididoEm: req.decididoEm !== null ? req.decididoEm.toISOString() : null,
          comentarioAprovacao: req.comentarioAprovacao,
          monthlyUnlockLogId: log.id,
          expiraEm: log.expiraEm.toISOString(),
        },
        linkContext: { companyId: req.companyId, mes: req.mes },
        now,
      });
      return;
    }

    if (tipo === 'desbloqueio_recusado') {
      await emitAlert(db, {
        companyId: req.companyId,
        tipo: 'desbloqueio_recusado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: {
          cycleUnlockRequestId: req.id,
          mes: req.mes,
          aba: req.aba,
          liderNome,
          solicitanteEmployeeId: req.solicitanteId,
          solicitanteNome,
          decididoEm: req.decididoEm !== null ? req.decididoEm.toISOString() : null,
          motivoRecusa: req.motivoRecusa,
        },
        linkContext: { companyId: req.companyId, mes: req.mes },
        now,
      });
      return;
    }
    // TypeScript ja exaurir os 3 tipos do union canonico; branch
    // inalcancavel. Mantido silente por seguranca canonica.
  };
}

/**
 * Resolve o nome canonico do titular (`employees` ou `cLevelMembers`)
 * conforme o tipo. Retorna string vazia se a linha nao existir (soft
 * delete concorrente ou id historico). Uso interno de
 * `createAdminUnlockAlertHook`.
 */
async function resolveTitularNome(
  db: RoipDatabase,
  titularTipo: 'employee' | 'clevel',
  titularId: number,
): Promise<string> {
  if (titularTipo === 'employee') {
    const rows = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, titularId))
      .limit(1);
    return rows[0]?.name ?? '';
  }
  const rows = await db
    .select({ name: cLevelMembers.name })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, titularId))
    .limit(1);
  return rows[0]?.name ?? '';
}
