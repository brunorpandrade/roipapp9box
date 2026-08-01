// ROIP APP 9BOX — orquestrador canonico dos jobs cron (ME-063a + ME-063b).
//
// Origem canonica:
// - DOC 06 §15 (Inventario canonico dos jobs cron da camada).
// - DOC 06 §15.2 (Ordem canonica de execucao).
// - DOC 06 §15.3 (Idempotencia canonica de cada job).
// - DOC 06 §15.4 (Comportamento canonico em falha de job cron).
// - DOC 06 §11.2, §11.3, §11.4 (workers de e-mail religados em ME-060).
// - DOC 06 §16.1, §16.2 (runDailyInstrumentStatusJob + archiveAiConversationsJob).
// - DOC 06 §14.8, §15.1.4 (refreshCycleScheduleCounters).
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
// - Em ME-063b (S354), extensao canonica do registry para os 4 jobs
//   operacionais restantes (§15.1.1 runDailyClosureJob, §15.1.2
//   runDailyInstrumentStatusJob, §15.1.4 refreshCycleScheduleCounters,
//   §15.1.8 archiveAiConversationsJob). Handlers consomem os motores
//   canonicos JA RELIGADOS em MEs anteriores (S244 estendido —
//   `monthlyClosureOrchestrator` ME-050/051, `cycleScheduleEngine`
//   ME-030 + ME-063b, `nr1CalculationEngine` ME-049cd, `aiConversations`
//   ME-054). Nenhum motor novo — wrappers cron canonicos apenas.
// - Wrappers canonicos por-empresa (`runDailyClosureJob` §15.1.1 +
//   `archiveAiConversationsJob` §15.1.8) iteram sobre `companies` com
//   `status='ativa'` e delegam ao motor por empresa. Idempotencia
//   canonica (§15.3) preservada pelo proprio motor.
// - `runDailyInstrumentStatusJob` (§15.1.2 + §16.1) e canonicamente
//   GLOBAL — os ciclos NR-1 nao tem fuso local (schema `copsoqCycles`
//   usa DATE sem tz). Cadencia `daily_local_per_company` significa
//   apenas que o cron externo dispara com a mesma frequencia canonica
//   do `runDailyClosureJob`; execucao dupla no mesmo dia e no-op por
//   idempotencia canonica do motor NR-1.
// - **Template L** (§12.8) NAO e enfileirado por nenhum job cron —
//   canonicamente disparado apenas via `emailDispatcher.enqueueTransactional`
//   pelo caller `/pendencias-portal/actions.ts` (server action RH +
//   Bruno, cooldown 72h em `portalReminderLog`). Confirmado bit-exact
//   contra DOC 06 §12.8 + §12.9, DOC 01 §12.1 (schema
//   `portalReminderLog.sentByType ENUM('employee','superAdmin')` —
//   sem tipo 'system'/'cron'), DOC 05 §5.5 (nota canonica de
//   coexistencia). RV-09 dirigida na abertura ME-063b + L102 canonizada
//   ME-063a.
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
//   - `createCronScheduler` → testes de integracao (ME-063a + ME-063b).
//   - Resultados canonicos ME-063b (`RunDailyClosureJobBatchResult`,
//     `RunDailyInstrumentStatusJobResult`,
//     `ArchiveAiConversationsBatchResult`) → tipos de retorno dos
//     makers + testes de integracao.

import { and, eq, lte } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies, copsoqCycles } from '../../db/schema';
import { sendEmailViaSmtp, type SmtpEnvelope, type SmtpSendResult } from '../../lib/email';
import { archiveAiConversationsBefore } from '../services/aiConversations';
import {
  NOOP_EMIT_AUTO_ALERT,
  refreshCycleScheduleCounters,
  type EmitAutoAlert,
  type RefreshCycleScheduleCountersResult,
} from '../services/cycleScheduleEngine';
import {
  NOOP_EVALUATE_ADMIN_ALERTS,
  NOOP_EVALUATE_MONTHLY_ALERTS,
  NOOP_RECALCULATE_QUARTER,
  NOOP_TRIGGER_QUARTERLY_CALCULATION,
  runDailyClosureJob,
  type EvaluateAdminAlerts,
  type EvaluateMonthlyAlerts,
  type RecalculateQuarter,
  type RunDailyClosureJobResult,
  type TriggerQuarterlyCalculation,
} from '../services/monthlyClosureOrchestrator';
import {
  closeNr1Cycle,
  DEFAULT_NR1_ALERT_FACADE,
  openScheduledNr1Cycles,
  type CloseNr1CycleResult,
  type Nr1AlertFacade,
  type OpenScheduledNr1CyclesResult,
} from '../services/nr1CalculationEngine';
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
 * ME-060 (S244 estendido em ME-063b). Em producao, todos os defaults
 * ficam ativos; em testes, o caller injeta stubs para `sendEmail`
 * (transporte SMTP) e para as deps canonicas do
 * `monthlyClosureOrchestrator` (emitAutoAlert, evaluateMonthlyAlerts,
 * evaluateAdminAlerts, triggerQuarterlyCalculation, recalculateQuarter)
 * + `nr1AlertFacade` do `closeNr1Cycle`.
 *
 * **Sem uso interno de `new Date()`.** Todos os handlers consomem o
 * `now` propagado por `runByName` (padrao deterministico canonico).
 *
 * **Idempotencia canonica preservada pelos motores.** O scheduler nao
 * adiciona chave `(companyId, data)` — a idempotencia canonica (§15.3)
 * esta canonicamente embutida em cada motor via filtro SQL
 * (`WHERE status='...'`, `WHERE archivedAt IS NULL`,
 * verificacoes de status corrente).
 */
export interface CronSchedulerDependencies {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
  readonly emitAutoAlert: EmitAutoAlert;
  readonly evaluateMonthlyAlerts: EvaluateMonthlyAlerts;
  readonly evaluateAdminAlerts: EvaluateAdminAlerts;
  readonly triggerQuarterlyCalculation: TriggerQuarterlyCalculation;
  readonly recalculateQuarter: RecalculateQuarter;
  readonly nr1AlertFacade: Nr1AlertFacade;
}

/**
 * Default canonico das dependencias — envio SMTP real via
 * `sendEmailViaSmtp` (ME-060) + NOOPs canonicos dos motores (S244
 * estendido em ME-063b). Testes substituem por stubs que capturam
 * as chamadas / injetam comportamento determinado.
 */
export const DEFAULT_CRON_SCHEDULER_DEPENDENCIES: CronSchedulerDependencies = {
  sendEmail: sendEmailViaSmtp,
  emitAutoAlert: NOOP_EMIT_AUTO_ALERT,
  evaluateMonthlyAlerts: NOOP_EVALUATE_MONTHLY_ALERTS,
  evaluateAdminAlerts: NOOP_EVALUATE_ADMIN_ALERTS,
  triggerQuarterlyCalculation: NOOP_TRIGGER_QUARTERLY_CALCULATION,
  recalculateQuarter: NOOP_RECALCULATE_QUARTER,
  nr1AlertFacade: DEFAULT_NR1_ALERT_FACADE,
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
// Handlers canonicos ME-063b (§15.1.1, §15.1.2, §15.1.4, §15.1.8)
// -----------------------------------------------------------------------

/**
 * Resultado canonico do batch `runDailyClosureJob` (§15.1.1) — o
 * wrapper cron itera empresas ativas e delega ao motor por empresa.
 * Idempotencia canonica (§15.3) preservada pelo proprio motor
 * (`monthlyClosureOrchestrator.runDailyClosureJob`).
 */
export interface RunDailyClosureJobBatchResult {
  readonly companiesInspecionadas: number;
  readonly companiesProcessadas: number;
  readonly resultsByCompany: readonly {
    readonly companyId: number;
    readonly result: RunDailyClosureJobResult;
  }[];
}

/**
 * Resultado canonico do `runDailyInstrumentStatusJob` (§15.1.2 + §16.1).
 * O wrapper cron consome dois motores canonicos JA RELIGADOS em MEs
 * anteriores:
 * 1. `openScheduledNr1Cycles(db, now)` — global; transiciona
 *    `agendado -> aberto` os ciclos NR-1 cujo `dataAbertura <= hoje`
 *    (§16.1 passo 1).
 * 2. Para cada ciclo NR-1 em `status='aberto'` com `dataFechamento
 *    <= hoje`, chama `closeNr1Cycle(db, cicloDbId, now, deps)` —
 *    transiciona `aberto -> fechado` (§16.1 passo 2).
 *
 * Transicoes `pendente -> atrasado` de instrumentos A/C/D nao entram
 * aqui — sao canonicamente realizadas por `updateCycleScheduleStatuses`
 * dentro do `runDailyClosureJob` Hook 2 (§14.6 + §15.2).
 *
 * Idempotencia canonica (§15.3): ambos os motores verificam status
 * corrente antes de atualizar — reexecucao no mesmo dia e no-op.
 */
export interface RunDailyInstrumentStatusJobResult {
  readonly abertura: OpenScheduledNr1CyclesResult;
  readonly ciclosFechados: readonly CloseNr1CycleResult[];
}

/**
 * Resultado canonico do batch `archiveAiConversationsJob` (§15.1.8 +
 * §16.2). O wrapper cron itera empresas ativas e delega ao motor por
 * empresa. Idempotencia canonica (§15.3) preservada pelo proprio motor
 * (`aiConversations.archiveAiConversationsBefore` — cláusula
 * `WHERE archivedAt IS NULL AND createdAt < cutoff`).
 */
export interface ArchiveAiConversationsBatchResult {
  readonly companiesInspecionadas: number;
  readonly linhasArquivadasTotal: number;
  readonly resultsByCompany: readonly {
    readonly companyId: number;
    readonly linhasArquivadas: number;
  }[];
}

/**
 * Janela canonica de arquivamento do Chat IA (§16.2): mensagens com
 * `createdAt < now - 6 meses` sao arquivadas. Constante extraida para
 * inspecao dos testes.
 */
export const AI_CONVERSATIONS_ARCHIVE_MONTHS = 6;

/**
 * Handler canonico do `runDailyClosureJob` (§15.1.1 / §13.7 + §16.1).
 * Itera empresas com `status='ativa'` e delega ao motor canonico
 * `monthlyClosureOrchestrator.runDailyClosureJob(db, companyId, now, deps)`
 * por empresa (S048 canonico: instancia unica por empresa).
 *
 * Deps DI (S244 estendido em ME-063b) propagam bit-exact ao motor:
 * `emitAutoAlert`, `evaluateMonthlyAlerts`, `evaluateAdminAlerts`,
 * `triggerQuarterlyCalculation`, `recalculateQuarter`.
 *
 * Idempotencia canonica (§15.3) preservada pelo motor:
 * `WHERE status='desbloqueado' AND expiraEm < NOW()`; verificacao de
 * status corrente antes de transicionar; fechamento do dia 11 so
 * atinge o mes imediatamente anterior.
 *
 * Falha em uma empresa NAO interrompe o batch — cada empresa e
 * isolada em try/catch canonico interno. Falha e propagada como
 * excecao apenas se TODAS as empresas falharem (garante que o
 * `runByName` retorna `status='error'` apenas se o batch falhar por
 * completo; do contrario retorna `status='ok'` com o inventario das
 * empresas processadas com sucesso — semantica canonica de degradacao
 * gradual §15.4).
 */
function makeRunDailyClosureJobHandler(deps: CronSchedulerDependencies): CronJobHandler {
  return async (db, now): Promise<RunDailyClosureJobBatchResult> => {
    const empresasAtivas = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, 'ativa'));

    const results: { companyId: number; result: RunDailyClosureJobResult }[] = [];
    let processadasComSucesso = 0;
    let ultimoErro: unknown = null;

    for (const empresa of empresasAtivas) {
      try {
        const result = await runDailyClosureJob(db, empresa.id, now, {
          emitAutoAlert: deps.emitAutoAlert,
          evaluateMonthlyAlerts: deps.evaluateMonthlyAlerts,
          evaluateAdminAlerts: deps.evaluateAdminAlerts,
          triggerQuarterlyCalculation: deps.triggerQuarterlyCalculation,
          recalculateQuarter: deps.recalculateQuarter,
        });
        results.push({ companyId: empresa.id, result });
        processadasComSucesso += 1;
      } catch (err) {
        ultimoErro = err;
        logCronWarn({
          name: 'runDailyClosureJob',
          companyId: empresa.id,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (empresasAtivas.length > 0 && processadasComSucesso === 0) {
      throw ultimoErro instanceof Error
        ? ultimoErro
        : new Error('runDailyClosureJob: todas as empresas ativas falharam');
    }

    return {
      companiesInspecionadas: empresasAtivas.length,
      companiesProcessadas: processadasComSucesso,
      resultsByCompany: results,
    };
  };
}

/**
 * Handler canonico do `runDailyInstrumentStatusJob` (§15.1.2 + §16.1).
 * Consome bit-exact os motores NR-1 canonicos JA RELIGADOS em ME-049cd:
 *
 * 1. `openScheduledNr1Cycles(db, now)` — global; transiciona
 *    `agendado -> aberto` (§16.1 passo 1). Cria snapshots em
 *    `copsoqCycleSnapshot`.
 * 2. Para cada ciclo NR-1 com `status='aberto'` e `dataFechamento <=
 *    hoje` (comparacao canonica em UTC — schema `copsoqCycles` usa
 *    DATE sem tz), chama `closeNr1Cycle(db, cicloDbId, now, deps)` —
 *    transiciona `aberto -> fechado` com calculo canonico de scores,
 *    convergencia/divergencia, alertas.
 *
 * **Global sem loop por empresa.** Ciclos NR-1 sao canonicamente
 * globais (nao ha fuso local em `copsoqCycles.dataFechamento`). A
 * cadencia `daily_local_per_company` significa apenas que o cron
 * externo dispara com a mesma frequencia canonica do
 * `runDailyClosureJob`; execucao dupla no mesmo dia e no-op por
 * idempotencia canonica dos motores.
 *
 * Deps DI (S244 estendido em ME-063b): `nr1AlertFacade` propaga
 * bit-exact ao `closeNr1Cycle`.
 *
 * Idempotencia canonica (§15.3): ambos os motores verificam status
 * corrente (`agendado`/`aberto`) antes de atualizar. Reexecucao no
 * mesmo dia produz `abertura.ciclosAbertos=[]` +
 * `ciclosFechados=[]`.
 */
function makeRunDailyInstrumentStatusJobHandler(deps: CronSchedulerDependencies): CronJobHandler {
  return async (db, now): Promise<RunDailyInstrumentStatusJobResult> => {
    const abertura = await openScheduledNr1Cycles(db, now);

    const abertosParaFechar = await db
      .select({ id: copsoqCycles.id })
      .from(copsoqCycles)
      .where(and(eq(copsoqCycles.status, 'aberto'), lte(copsoqCycles.dataFechamento, now)));

    const ciclosFechados: CloseNr1CycleResult[] = [];
    for (const linha of abertosParaFechar) {
      const result = await closeNr1Cycle(db, linha.id, now, {
        alertFacade: deps.nr1AlertFacade,
      });
      ciclosFechados.push(result);
    }

    return { abertura, ciclosFechados };
  };
}

/**
 * Handler canonico do `refreshCycleScheduleCounters` (§15.1.4 +
 * §14.8). Reconciliacao diaria canonica dos contadores
 * `cycleSchedule.totalRespondidos` para linhas em `aberto`/`atrasado`.
 * Consume bit-exact `cycleScheduleEngine.refreshCycleScheduleCounters`
 * (Hook 5 — ME-063b S354).
 *
 * **NAO consome `updateCycleScheduleStatuses`** — este ja e
 * canonicamente executado dentro do `runDailyClosureJob` Hook 2
 * (§15.2 + §14.6). Consumo duplo violaria a ordem canonica e a
 * idempotencia (§15.3). Cadencia canonica §15.1.4: 00:15 UTC —
 * independente da cadencia por-empresa dos jobs §15.1.1/§15.1.2.
 *
 * Sem deps DI proprias — o motor e puro.
 *
 * Idempotencia canonica (§15.3): agregacao deterministica; UPDATE
 * canonico apenas se novo valor diverge do persistido.
 */
function makeRefreshCycleScheduleCountersHandler(): CronJobHandler {
  return async (db, now): Promise<RefreshCycleScheduleCountersResult> => {
    return refreshCycleScheduleCounters(db, now);
  };
}

/**
 * Handler canonico do `archiveAiConversationsJob` (§15.1.8 + §16.2).
 * Itera empresas com `status='ativa'` e delega ao motor canonico
 * `aiConversations.archiveAiConversationsBefore(db, companyId, cutoff,
 * archivedAt)` por empresa. `cutoff` canonico = `now - 6 meses`
 * (constante `AI_CONVERSATIONS_ARCHIVE_MONTHS`).
 *
 * Idempotencia canonica (§15.3) preservada pelo motor: clausula
 * `WHERE archivedAt IS NULL AND createdAt < cutoff` — reexecucao no
 * mesmo dia so arquiva o que ficou de fora da primeira passagem.
 *
 * Falha em uma empresa NAO interrompe o batch (mesma semantica
 * canonica do `runDailyClosureJob` — degradacao gradual §15.4).
 */
function makeArchiveAiConversationsJobHandler(): CronJobHandler {
  return async (db, now): Promise<ArchiveAiConversationsBatchResult> => {
    const empresasAtivas = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, 'ativa'));

    const cutoff = new Date(now.getTime());
    cutoff.setMonth(cutoff.getMonth() - AI_CONVERSATIONS_ARCHIVE_MONTHS);

    const results: { companyId: number; linhasArquivadas: number }[] = [];
    let linhasArquivadasTotal = 0;
    let processadasComSucesso = 0;
    let ultimoErro: unknown = null;

    for (const empresa of empresasAtivas) {
      try {
        const linhasArquivadas = await archiveAiConversationsBefore(db, empresa.id, cutoff, now);
        results.push({ companyId: empresa.id, linhasArquivadas });
        linhasArquivadasTotal += linhasArquivadas;
        processadasComSucesso += 1;
      } catch (err) {
        ultimoErro = err;
        logCronWarn({
          name: 'archiveAiConversationsJob',
          companyId: empresa.id,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (empresasAtivas.length > 0 && processadasComSucesso === 0) {
      throw ultimoErro instanceof Error
        ? ultimoErro
        : new Error('archiveAiConversationsJob: todas as empresas ativas falharam');
    }

    return {
      companiesInspecionadas: empresasAtivas.length,
      linhasArquivadasTotal,
      resultsByCompany: results,
    };
  };
}

// -----------------------------------------------------------------------
// Factory canonica
// -----------------------------------------------------------------------

/**
 * Cria orquestrador canonico dos jobs cron (§15.1 + §15.4). Em ME-063a
 * registrou os 3 workers de e-mail JA RELIGADOS em ME-060; em ME-063b
 * (S354) registra os 4 jobs operacionais restantes canonicos:
 * `runDailyClosureJob` (§15.1.1), `runDailyInstrumentStatusJob`
 * (§15.1.2), `refreshCycleScheduleCounters` (§15.1.4),
 * `archiveAiConversationsJob` (§15.1.8).
 *
 * **Registro canonico completo** — 7 dos 8 jobs canonicos do §15.1
 * (§15.1.3 `runDailyClimateAggregationJob` fica FORA por prescricao
 * literal do DOC 06 — "fora do escopo direto desta camada"; §15.1.9
 * cron do dia 11 nao e job independente).
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
  // → daily-based). ME-063a: 3 workers de e-mail. ME-063b: 4 jobs
  // operacionais.

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

  const runDailyClosureJobEntry: RegisteredCronJob = {
    name: 'runDailyClosureJob',
    cadence: CRON_JOB_CADENCE_BY_NAME.runDailyClosureJob,
    handler: makeRunDailyClosureJobHandler(deps),
  };
  registry.set('runDailyClosureJob', runDailyClosureJobEntry);

  const runDailyInstrumentStatusJobEntry: RegisteredCronJob = {
    name: 'runDailyInstrumentStatusJob',
    cadence: CRON_JOB_CADENCE_BY_NAME.runDailyInstrumentStatusJob,
    handler: makeRunDailyInstrumentStatusJobHandler(deps),
  };
  registry.set('runDailyInstrumentStatusJob', runDailyInstrumentStatusJobEntry);

  const refreshCycleScheduleCountersEntry: RegisteredCronJob = {
    name: 'refreshCycleScheduleCounters',
    cadence: CRON_JOB_CADENCE_BY_NAME.refreshCycleScheduleCounters,
    handler: makeRefreshCycleScheduleCountersHandler(),
  };
  registry.set('refreshCycleScheduleCounters', refreshCycleScheduleCountersEntry);

  const archiveAiConversationsJobEntry: RegisteredCronJob = {
    name: 'archiveAiConversationsJob',
    cadence: CRON_JOB_CADENCE_BY_NAME.archiveAiConversationsJob,
    handler: makeArchiveAiConversationsJobHandler(),
  };
  registry.set('archiveAiConversationsJob', archiveAiConversationsJobEntry);

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
