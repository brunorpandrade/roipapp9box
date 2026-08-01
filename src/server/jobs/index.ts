// ROIP APP 9BOX — barrel canonico de `src/server/jobs/` (ME-060 + ME-063a).
//
// Origem canonica:
// - DOC 06 §11.2, §11.3, §11.4, §11.5 (workers de e-mail).
// - DOC 06 §15 (Inventario canonico dos jobs cron + orquestracao).
//
// Contrato canonico:
// - API publica dos 3 workers de e-mail de ME-060 + orquestrador
//   canonico do scheduler cron de ME-063a. Consumido por testes de
//   integracao e (em producao) pelo cron externo que chama
//   `scheduler.runByName(name)` conforme a cadencia canonica.
// - ME-063b estendera este barrel canonicamente com os 4 jobs cron
//   restantes (`runDailyClosureJob`, `runDailyInstrumentStatusJob`,
//   `refreshCycleScheduleCounters`, `archiveAiConversationsJob`) sem
//   remover exports existentes.
//
// **RV-13.** Cada export tem chamador na propria ME (via workers +
// scheduler + testes).

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

export {
  CRON_JOB_CADENCE_BY_NAME,
  DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
  createCronScheduler,
} from './scheduler';
export type {
  CronCadence,
  CronJobExecutionResult,
  CronJobHandler,
  CronJobName,
  CronSchedulerContract,
  CronSchedulerDependencies,
  RegisteredCronJob,
} from './scheduler';
