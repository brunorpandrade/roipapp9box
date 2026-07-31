// ROIP APP 9BOX — passo M6 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.8 (Decisao de canal).
//
// Regra literal (aplicada para cada destinatario processado em M5):
//   1. `severidade='critico'` → `imediato`.
//   2. `severidade='atencao'` e tipo em lista de override → `imediato`.
//      Caso contrario → `digest_semanal`.
//   3. `severidade='observacao'` → `digest_semanal`.
//   4. `severidade='info'` → sem enfileiramento em `emailQueue`. Fim
//      para este destinatario — apenas linha em notifications
//      (ja gravada em M5).
//
// Nota canonica sobre M6 pos-M5: o §8.8 aplica M6 "para cada
// destinatario processado em M5" — ou seja, o M6 e um DECISOR por
// destinatario, delegando a chamada real ao M7 quando cabe. Este step
// implementa a decisao pura (thin wrapper sobre `severity.resolveCanal`);
// o M7 e chamado pelo `emitAlert` orquestrador em loop.
//
// Contrato canonico:
// - Funcao pura sem I/O. Thin wrapper sobre `severity.resolveCanal`.
// - Consumida por `emitAlert.ts` para decidir se chama M7 ou nao.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `stepM6Channel` → consumido por `emitAlert.ts` e testes.

import { type CanalDecisao, resolveCanal } from '../severity';
import { type AlertSeveridade, type AlertTipo } from '../typeDictionary';

/**
 * Aplica passo M6 canonico. Delega diretamente a `resolveCanal` — o
 * separator entre `severity.ts` (regra pura) e este step (posicao no
 * pipeline) e canonico do §8 arquitetura em 3 camadas.
 */
export function stepM6Channel(severidade: AlertSeveridade, tipo: AlertTipo): CanalDecisao {
  return resolveCanal(severidade, tipo);
}
