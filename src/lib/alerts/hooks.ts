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

import type { RoipDatabase } from '../../db/client';
import type { EmitAutoAlert } from '../../server/services/cycleScheduleEngine';
import type { EvaluateAdminAlerts } from '../../server/services/monthlyClosureOrchestrator';
import type {
  EmitAlertPostGravacaoInput as Nr1FacadeInput,
  Nr1AlertFacade,
} from '../../server/services/nr1CalculationEngine';

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
