// ROIP APP 9BOX — worker canonico `resetStuckEmailQueue` (ME-060 §11.3).
//
// Origem canonica:
// - DOC 06 §11.3 (worker `resetStuckEmailQueue` cron 10 min).
//
// Reproducao canonica da query §11.3:
//   UPDATE emailQueue
//   SET status = 'pendente'
//   WHERE status = 'processando'
//     AND updatedAt < NOW() - INTERVAL 10 MINUTE
//
// Contrato canonico:
// - Cron 10 min. Executa a query canonica com `updatedAt < now -
//   THRESHOLD_MS` e devolve linhas presas ao estado `pendente` para
//   reprocessamento.
// - **Sem log de erro** (§11.3 canonizacao explicita). Linhas presas em
//   `processando` por >10 min indicam worker crashado; devolver a fila e
//   o comportamento canonico correto e nao requer sinalizacao.
// - Retorna a quantidade de linhas resetadas (para telemetria/testes).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `RESET_STUCK_EMAIL_QUEUE_THRESHOLD_MS` → `resetStuckEmailQueue` +
//     testes.
//   - `resetStuckEmailQueue` → testes de integracao (Bloco 3 desta ME).

import { and, eq, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { emailQueue } from '../../db/schema';

/** Limite canonico de tempo em `processando` antes de devolver a fila. */
export const RESET_STUCK_EMAIL_QUEUE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Devolve a `pendente` toda linha canonicamente presa em `processando`
 * por mais que `RESET_STUCK_EMAIL_QUEUE_THRESHOLD_MS`. Retorna a
 * quantidade de linhas afetadas.
 */
export async function resetStuckEmailQueue(db: RoipDatabase, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RESET_STUCK_EMAIL_QUEUE_THRESHOLD_MS);
  const [result] = await db
    .update(emailQueue)
    .set({ status: 'pendente' })
    .where(and(eq(emailQueue.status, 'processando'), lt(emailQueue.updatedAt, cutoff)));
  return result.affectedRows;
}
