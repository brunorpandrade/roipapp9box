// ROIP APP 9BOX — barrel canonico de `src/server/jobs/` (ME-060).
//
// Origem canonica:
// - DOC 06 §11.2, §11.3, §11.4, §11.5.
//
// Contrato canonico:
// - API publica dos 3 workers de e-mail desta ME. Consumida por testes
//   de integracao e (em producao) por um cron scheduler externo (que
//   sera adicionado em ME-063 — B6 sub-e, junto com os demais jobs cron
//   consolidados).
//
// **RV-13.** Cada export tem chamador na propria ME (via testes).

export {
  EMAIL_QUEUE_JOB_BATCH_LIMIT,
  EMAIL_QUEUE_JOB_BORDA_SEGURANCA_MS,
  EMAIL_QUEUE_JOB_MAX_RETRIES,
  runEmailQueueJob,
} from './emailQueueJob';
export type {
  EmailQueueJobDependencies,
  EmailQueueJobItemOutcome,
  EmailQueueJobResult,
} from './emailQueueJob';

export {
  RESET_STUCK_EMAIL_QUEUE_THRESHOLD_MS,
  resetStuckEmailQueue,
} from './resetStuckEmailQueueJob';

export { processDigestForCompany, runWeeklyDigestJob } from './weeklyDigestJob';
export type {
  DigestOutcome,
  WeeklyDigestJobDependencies,
  WeeklyDigestJobResult,
} from './weeklyDigestJob';
