// ROIP APP 9BOX — orquestrador canonico dos jobs cron (ME-063a).
//
// Origem canonica:
// - DOC 06 §15 (Inventario canonico dos jobs cron da camada).
// - DOC 06 §15.2 (Ordem canonica de execucao).
// - DOC 06 §15.3 (Idempotencia canonica de cada job).
// - DOC 06 §15.4 (Comportamento canonico em falha de job cron).
// - DOC 06 §11.2, §11.3, §11.4 (workers de e-mail religados em ME-060).
//
// Contrato canonico:
// - Factory `createCronScheduler` retorna orquestrador canonico com
//   dependencias injetaveis (bit-exact ao padrao `emailQueueJob.ts` de
//   ME-060 — factory DI, sem side effects no import, testavel
//   ponta-a-ponta).
// - Registry canonico associa `CronJobName` -> `CronCadence` + handler
//   canonico. Nomes canonicos bit-exact ao DOC 06 §15.1 (RV-09).
// - `runByName` executa um job pelo nome, com try/catch canonico (§15.4:
//   log estruturado + sem retry automatico dentro do mesmo ciclo).
// - `listRegistered` retorna a lista canonica dos jobs registrados
//   (usado por testes + telemetria).
// - Em ME-063a, registro canonico dos 3 workers de e-mail JA RELIGADOS
//   em ME-060 (§15.1.5 runEmailQueueJob, §15.1.6 resetStuckEmailQueue,
//   §15.1.7 runWeeklyDigestJob).
// - Prospectivamente, o type `CronJobName` inclui os 4 jobs canonicos de
//   ME-063b (§15.1.1 runDailyClosureJob, §15.1.2 runDailyInstrumentStatusJob,
//   §15.1.4 refreshCycleScheduleCounters, §15.1.8 archiveAiConversationsJob);
//   ME-063b estende o registry canonicamente sem alterar este arquivo.
// - Job canonico §15.1.3 `runDailyClimateAggregationJob` fica FORA do
//   escopo canonico desta camada (DOC 06 §15.1.3 literal: "fora do escopo
//   direto desta camada"). Nao aparece em `CronJobName` deste modulo.
// - Job canonico §15.1.9 (cron do dia 11) canonicamente NAO e job
//   independente — e execucao condicional interna de
//   `updateCycleScheduleStatuses` (JA RELIGADO em ME-061). Nao aparece
//   em `CronJobName`.
//
// **Nao invoca cron externo.** Este scheduler e um orquestrador em
// runtime — em producao ele e invocado por um cron externo (crontab,
// node-cron, systemd timer, Vercel Cron, etc.) que chama `runByName`
// com o nome canonico da cadencia disparada. O scheduler encapsula a
// resolucao nome -> handler + logging canonico + medicao de duracao.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `CronJobName` (tipo) → `createCronScheduler` + testes.
//   - `CronCadence` (tipo) → `createCronScheduler` + testes.
//   - `CronJobExecutionResult` (tipo) → `runByName` + testes.
//   - `CronJobHandler` (tipo) → `createCronScheduler` + testes.
//   - `RegisteredCronJob` (tipo) → `createCronScheduler` +
//     `listRegistered` + testes.
//   - `CronSchedulerContract` (tipo) → `createCronScheduler` + testes.
//   - `CronSchedulerDependencies` (tipo) → `createCronScheduler` +
//     testes.
//   - `DEFAULT_CRON_SCHEDULER_DEPENDENCIES` → `createCronScheduler` +
//     testes.
//   - `CRON_JOB_CADENCE_BY_NAME` → `createCronScheduler` + testes.
//   - `createCronScheduler` → testes de integracao (ME-063a).

import type { RoipDatabase } from '../../db/client';
import { sendEmailViaSmtp, type SmtpEnvelope, type SmtpSendResult } from '../../lib/email';
import { runEmailQueueJob, type EmailQueueJobResult } from './emailQueueJob';
import { resetStuckEmailQueue } from './resetStuckEmailQueueJob';
import { runWeeklyDigestJob, type WeeklyDigestJobResult } from './weeklyDigestJob';

// -----------------------------------------------------------------------
// Types canonicos
// -----------------------------------------------------------------------

/**
 * Nome canonico bit-exact de cada job cron da camada (DOC 06 §15.1).
 *
 * Ativos em ME-063a (§15.1.5 / §15.1.6 / §15.1.7):
 * - `'runEmailQueueJob'` — cron 1 min (§15.1.5).
 * - `'resetStuckEmailQueue'` — cron 10 min (§15.1.6).
 * - `'runWeeklyDigestJob'` — cron horario UTC (§15.1.7).
 *
 * Prospectivamente registrados em ME-063b (via extensao canonica do
 * registry, sem alterar este type):
 * - `'runDailyClosureJob'` — cron diario 00:00 fuso local por empresa
 *   (§15.1.1).
 * - `'runDailyInstrumentStatusJob'` — cron diario, executado apos
 *   `runDailyClosureJob` na ordem canonica (§15.1.2 + §16.1).
 * - `'refreshCycleScheduleCounters'` — cron diario 00:15 UTC (§15.1.4 +
 *   §14.9).
 * - `'archiveAiConversationsJob'` — cron diario 03:00 UTC (§15.1.8 +
 *   §16.2).
 */
export type CronJobName =
  | 'runEmailQueueJob'
  | 'resetStuckEmailQueue'
  | 'runWeeklyDigestJob'
  | 'runDailyClosureJob'
  | 'runDailyInstrumentStatusJob'
  | 'refreshCycleScheduleCounters'
  | 'archiveAiConversationsJob';

/**
 * Cadencia canonica bit-exact de cada job cron da camada (DOC 06 §15.1).
 *
 * - `'every_1_min'` — cron a cada 1 minuto (§15.1.5 `runEmailQueueJob`).
 * - `'every_10_min'` — cron a cada 10 minutos (§15.1.6
 *   `resetStuckEmailQueue`).
 * - `'every_hour_utc'` — cron horario UTC (§15.1.7 `runWeeklyDigestJob`).
 * - `'daily_00_00_local_per_company'` — cron diario 00:00 no fuso local
 *   da empresa (§15.1.1 `runDailyClosureJob` — instancia unica por
 *   empresa).
 * - `'daily_local_per_company'` — cron diario no fuso local da empresa
 *   (§15.1.2 `runDailyInstrumentStatusJob` — executado apos
 *   `runDailyClosureJob` na ordem canonica §15.2).
 * - `'daily_00_15_utc'` — cron diario 00:15 UTC (§15.1.4
 *   `refreshCycleScheduleCounters`).
 * - `'daily_03_00_utc'` — cron diario 03:00 UTC (§15.1.8
 *   `archiveAiConversationsJob`).
 */
export type CronCadence =
  | 'every_1_min'
  | 'every_10_min'
  | 'every_hour_utc'
  | 'daily_00_00_local_per_company'
  | 'daily_local_per_company'
  | 'daily_00_15_utc'
  | 'daily_03_00_utc';

/**
 * Mapa canonico literal `CronJobName -> CronCadence` (DOC 06 §15.1).
 * Fonte unica de referencia canonica para telemetria + testes.
 */
export const CRON_JOB_CADENCE_BY_NAME: Readonly<Record<CronJobName, CronCadence>> = {
  runEmailQueueJob: 'every_1_min',
  resetStuckEmailQueue: 'every_10_min',
  runWeeklyDigestJob: 'every_hour_utc',
  runDailyClosureJob: 'daily_00_00_local_per_company',
  runDailyInstrumentStatusJob: 'daily_local_per_company',
  refreshCycleScheduleCounters: 'daily_00_15_utc',
  archiveAiConversationsJob: 'daily_03_00_utc',
} as const;

/**
 * Resultado canonico de execucao de um job (§15.4).
 * - `status='ok'`: handler concluiu sem lancar. `outcome` carrega o
 *   payload canonico especifico do job (tipado como `unknown` no
 *   contrato para preservar coesao — testes fazem narrowing).
 * - `status='error'`: handler lancou. `error` carrega mensagem canonica
 *   para log estruturado.
 * - `durationMs`: medicao canonica do tempo total via
 *   `Date.now()` — usado em telemetria.
 */
export interface CronJobExecutionResult {
  readonly name: CronJobName;
  readonly cadence: CronCadence;
  readonly status: 'ok' | 'error';
  readonly durationMs: number;
  readonly outcome?: unknown;
  readonly error?: string;
}

/**
 * Handler canonico de um job cron. Assinatura bit-exact ao padrao dos
 * workers de e-mail religados em ME-060 (`(db, now) => Promise<...>`).
 * Retorna o `outcome` canonico especifico do job (`EmailQueueJobResult`,
 * `WeeklyDigestJobResult`, numero de linhas afetadas em
 * `resetStuckEmailQueue`, etc.). O scheduler encapsula o handler em
 * try/catch + medicao de duracao.
 */
export type CronJobHandler = (db: RoipDatabase, now: Date) => Promise<unknown>;

/**
 * Registro canonico de um job cron: nome + cadencia + handler.
 * Estrutura canonica retornada por `listRegistered` (telemetria + testes).
 */
export interface RegisteredCronJob {
  readonly name: CronJobName;
  readonly cadence: CronCadence;
  readonly handler: CronJobHandler;
}

/**
 * Dependencias canonicas injetaveis do scheduler. Bit-exact ao padrao
 * DI de `EmailQueueJobDependencies` / `WeeklyDigestJobDependencies` de
 * ME-060. Em producao, todos os defaults ficam ativos; em testes, o
 * caller injeta stubs para `sendEmail` (transporte SMTP).
 */
export interface CronSchedulerDependencies {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
}

/**
 * Default canonico das dependencias — envio SMTP real via
 * `sendEmailViaSmtp` (ME-060). Testes substituem por stub que captura
 * as chamadas.
 */
export const DEFAULT_CRON_SCHEDULER_DEPENDENCIES: CronSchedulerDependencies = {
  sendEmail: sendEmailViaSmtp,
};

/**
 * Contrato canonico do scheduler retornado por `createCronScheduler`.
 * Duas operacoes canonicas:
 *
 * - `runByName(name, db, now)` — executa o job registrado com o `name`
 *   canonico. Encapsula try/catch + medicao de duracao. Nunca lanca —
 *   retorna `CronJobExecutionResult` com `status='ok'|'error'`. Log
 *   estruturado canonico via `console.log` (padrao ME-060). Se `name`
 *   nao esta registrado, retorna `status='error'` com mensagem
 *   canonica.
 *
 * - `listRegistered()` — retorna lista canonica dos jobs registrados
 *   neste scheduler. Ordem canonica de insercao preservada.
 */
export interface CronSchedulerContract {
  runByName(name: CronJobName, db: RoipDatabase, now: Date): Promise<CronJobExecutionResult>;
  listRegistered(): readonly RegisteredCronJob[];
}

// -----------------------------------------------------------------------
// Logging canonico
// -----------------------------------------------------------------------

function logCronEvent(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: 'cron.job.execution', ...payload }));
}

function logCronWarn(payload: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event: 'cron.job.warn', ...payload }));
}

// -----------------------------------------------------------------------
// Handlers canonicos dos jobs ativos em ME-063a
// -----------------------------------------------------------------------

/**
 * Handler canonico do `runEmailQueueJob` (§15.1.5 / §11.2). Consome
 * dependencia `sendEmail` do scheduler para preservar bit-exact a
 * assinatura canonica do worker de ME-060.
 */
function makeRunEmailQueueJobHandler(deps: CronSchedulerDependencies): CronJobHandler {
  return async (db, now): Promise<EmailQueueJobResult> => {
    return runEmailQueueJob(db, now, { sendEmail: deps.sendEmail });
  };
}

/**
 * Handler canonico do `resetStuckEmailQueue` (§15.1.6 / §11.3). Nao
 * requer dependencias injetaveis — apenas `db` + `now`.
 */
function makeResetStuckEmailQueueHandler(): CronJobHandler {
  return async (db, now): Promise<number> => {
    return resetStuckEmailQueue(db, now);
  };
}

/**
 * Handler canonico do `runWeeklyDigestJob` (§15.1.7 / §11.4 + §11.5).
 * Consome dependencia `sendEmail` do scheduler.
 */
function makeRunWeeklyDigestJobHandler(deps: CronSchedulerDependencies): CronJobHandler {
  return async (db, now): Promise<WeeklyDigestJobResult> => {
    return runWeeklyDigestJob(db, now, { sendEmail: deps.sendEmail });
  };
}

// -----------------------------------------------------------------------
// Factory canonica
// -----------------------------------------------------------------------

/**
 * Cria orquestrador canonico dos jobs cron (§15.1 + §15.4). Em ME-063a
 * registra os 3 workers de e-mail JA RELIGADOS em ME-060; em ME-063b,
 * a factory sera estendida canonicamente para incluir os 4 jobs
 * restantes (`runDailyClosureJob`, `runDailyInstrumentStatusJob`,
 * `refreshCycleScheduleCounters`, `archiveAiConversationsJob`).
 *
 * Comportamento canonico:
 * - `runByName` encapsula o handler em try/catch. Sucesso →
 *   `{ status: 'ok', durationMs, outcome }`. Falha → `{ status: 'error',
 *   durationMs, error }` com log warn canonico. Nunca lanca (§15.4:
 *   log estruturado + Sentry; sem retry automatico dentro do mesmo
 *   ciclo).
 * - `runByName` com `name` nao registrado → retorna `status='error'`
 *   com mensagem canonica; log warn.
 * - `listRegistered` preserva ordem canonica de insercao (bit-exact ao
 *   §15.1 numerando).
 */
export function createCronScheduler(
  deps: CronSchedulerDependencies = DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
): CronSchedulerContract {
  const registry = new Map<CronJobName, RegisteredCronJob>();

  // Ordem canonica de insercao bit-exact ao §15.1 (cron interval-based
  // → daily-based). ME-063a registra apenas os 3 workers de e-mail.

  const runEmailQueueJobEntry: RegisteredCronJob = {
    name: 'runEmailQueueJob',
    cadence: CRON_JOB_CADENCE_BY_NAME.runEmailQueueJob,
    handler: makeRunEmailQueueJobHandler(deps),
  };
  registry.set('runEmailQueueJob', runEmailQueueJobEntry);

  const resetStuckEmailQueueEntry: RegisteredCronJob = {
    name: 'resetStuckEmailQueue',
    cadence: CRON_JOB_CADENCE_BY_NAME.resetStuckEmailQueue,
    handler: makeResetStuckEmailQueueHandler(),
  };
  registry.set('resetStuckEmailQueue', resetStuckEmailQueueEntry);

  const runWeeklyDigestJobEntry: RegisteredCronJob = {
    name: 'runWeeklyDigestJob',
    cadence: CRON_JOB_CADENCE_BY_NAME.runWeeklyDigestJob,
    handler: makeRunWeeklyDigestJobHandler(deps),
  };
  registry.set('runWeeklyDigestJob', runWeeklyDigestJobEntry);

  async function runByName(
    name: CronJobName,
    db: RoipDatabase,
    now: Date,
  ): Promise<CronJobExecutionResult> {
    const entry = registry.get(name);
    if (entry === undefined) {
      const cadence = CRON_JOB_CADENCE_BY_NAME[name];
      const errorMessage = `cron scheduler: job "${name}" nao registrado`;
      logCronWarn({ name, cadence, status: 'error', error: errorMessage });
      return {
        name,
        cadence,
        status: 'error',
        durationMs: 0,
        error: errorMessage,
      };
    }

    const startedAt = Date.now();
    try {
      const outcome = await entry.handler(db, now);
      const durationMs = Date.now() - startedAt;
      logCronEvent({
        name,
        cadence: entry.cadence,
        status: 'ok',
        durationMs,
      });
      return {
        name,
        cadence: entry.cadence,
        status: 'ok',
        durationMs,
        outcome,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logCronWarn({
        name,
        cadence: entry.cadence,
        status: 'error',
        durationMs,
        error: errorMessage,
      });
      return {
        name,
        cadence: entry.cadence,
        status: 'error',
        durationMs,
        error: errorMessage,
      };
    }
  }

  function listRegistered(): readonly RegisteredCronJob[] {
    return Array.from(registry.values());
  }

  return { runByName, listRegistered };
}
