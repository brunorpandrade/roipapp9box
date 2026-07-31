// ROIP APP 9BOX — passo M3 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.5 (INSERT em `alerts`).
//
// Regra literal:
//   - Grava linha em `alerts` com `suprimidoPorCooldown` provisoriamente
//     `false`. Captura `alertId` retornado do INSERT.
//   - Campos `cicloDbId`, `fatorId` e `scoreValor` sao populados
//     APENAS para NR-1 (via `emitAlertPostGravacao`). Para os demais
//     tipos, permanecem `NULL`.
//   - Se M4 subsequente marcar supressao, executa (na mesma transacao):
//       UPDATE alerts SET suprimidoPorCooldown = true WHERE id = ?
//
// Contrato canonico:
// - Funcao com I/O. Recebe `db` + payload canonico.
// - Retorno: `{ alertId: number }`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `M3InsertPayload` (tipo) → consumido por `emitAlert.ts` e testes.
//   - `stepM3InsertAlert` → consumido por `emitAlert.ts` e testes.

import type { RoipDatabase } from '../../../db/client';
import { alerts } from '../../../db/schema';

import { type AlertEscopo, type AlertSeveridade, type AlertTipo } from '../typeDictionary';

/**
 * Payload canonico de M3 (§8.5 linha 771-782). Espelha a estrutura da
 * tabela `alerts` do DOC 01 §14.1 sem tocar campos NR-1 (cicloDbId,
 * fatorId, scoreValor) — aqueles sao populados apenas por
 * `emitAlertPostGravacao`, nao pelo pipeline principal.
 */
export interface M3InsertPayload {
  readonly companyId: number;
  readonly tipo: AlertTipo;
  readonly severidade: AlertSeveridade;
  readonly escopo: AlertEscopo | null;
  readonly escopoDepartamentoId: number | null;
  readonly escopoEmployeeId: number | null;
  readonly metadados: unknown; // JSON opaco §4 — o motor nao inspeciona
}

/**
 * Resultado canonico do INSERT M3. `alertId` capturado do `insertId`
 * do driver mysql2.
 */
export interface M3Result {
  readonly alertId: number;
}

/**
 * Aplica passo M3 canonico. INSERT bit-exact conforme §8.5.
 * `suprimidoPorCooldown` e provisoriamente `false` — o passo M4
 * decide se atualiza para `true` na mesma transacao logica.
 */
export async function stepM3InsertAlert(
  db: RoipDatabase,
  payload: M3InsertPayload,
): Promise<M3Result> {
  const [res] = await db.insert(alerts).values({
    companyId: payload.companyId,
    tipo: payload.tipo,
    severidade: payload.severidade,
    escopo: payload.escopo,
    escopoDepartamentoId: payload.escopoDepartamentoId,
    escopoEmployeeId: payload.escopoEmployeeId,
    suprimidoPorCooldown: false,
    metadados: payload.metadados as object | null,
  });
  return { alertId: res.insertId };
}
