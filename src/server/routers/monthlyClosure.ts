// ROIP APP 9BOX — sub-router `monthlyClosure` (ME-037).
//
// Oitava ME do Bloco B3. Fecha o loop operacional do Eixo X: hoje o
// sistema escreve o mensal (monthlyData, ME-036), calcula (motor
// monthlyClosureOrchestrator ME-031 + roiCalculationEngine ME-033) e le
// (quarterlyCalculation/economicDiagnosis/dashboard ME-034/ME-035), mas
// nenhuma superficie tRPC transiciona o estado do mes
// `aberto -> fechado -> desbloqueado`. Este router e essa superficie.
//
// Procedures canonicas (DOC 03 §3.11 — 4 procs sob o namespace
// `monthlyClosure`; a leitura literal do §3.11 lista exatamente estas
// quatro — S082):
//   - `monthlyClosure.getClosureStatus`        — DOC 03 §3.11 + §4.1
//   - `monthlyClosure.unlockMonth`             — DOC 03 §4.1 + §4.4
//   - `monthlyClosure.closeMonthScheduled`     — DOC 03 §3.11 + §4.2 (interna cron)
//   - `monthlyClosure.triggerMonthlyProcessing`— DOC 03 §3.11 (interna hook)
//
// NAO pertencem a este namespace (correcao RV-09 sobre a parafrase de
// abertura): `recalculateAfterUnlock` e `triggerQuarterlyCalculation` sao
// procs de `quarterlyCalculation` (§3.11) — a primeira ja entregue na
// ME-034. Incluir aqui seria duplicata sem chamador novo (RV-13).
//
// Convencoes canonicas herdadas de S049/S060 (ME-032/ME-034/ME-036):
//   - `unlockMonth` (S083): desbloqueio manual DIRETO por Bruno,
//     distinto do `cycleUnlockRequests.decide` (aprovacao de solicitacao
//     de terceiro). Input canonico espelha o `create` — `aba` e
//     obrigatoria (§4.1 gatilhos 4/5/6: desbloqueio por aba `rh`,
//     `lider` com liderId, `faturamento`). A transacao atomica espelha o
//     `decide`-aprovada (§4.4 passos 2/4/5), sem a linha de
//     `cycleUnlockRequests`: INSERT em `monthlyUnlockLog`
//     (`houveAlteracao=false`, `expiraEm=now+24h`, `unlockRequestId=NULL`
//     marcando origem "desbloqueio direto") + UPDATE
//     `monthlyClosureStatus.status='desbloqueado'`. `.for('update')` no
//     SELECT de estado. Rejeita 409 se ja `desbloqueado` (mensagem
//     canonica literal §4.4 passo 2).
//   - DI factory `createMonthlyClosureRouter(deps)` (S084): injeta os
//     hooks do motor ME-031 (`processClosedMonth`, `runDailyClosureJob`)
//     por default REAL (motor existe) e `now` injetavel (default
//     `() => new Date()`) para testes deterministicos. Sem no-op de
//     motor: os dois hooks apontam para o orchestrator canonico.
//   - `closeMonthScheduled` / `triggerMonthlyProcessing` (S085): procs
//     internas de cron/hook expostas via `roleProcedure(['super_admin'])`
//     — nao ha perfil "cron" no JWT canonico; o super_admin e o unico
//     claim capaz de aciona-las. O wiring de cron real e escopo DOC 06.
//   - `unlockMonth` exclusivo de Bruno (S086) via
//     `roleProcedure(['super_admin'])`. `getClosureStatus` legivel por
//     todo perfil administrativo com guard cruzado companyId no handler
//     (§2.4).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Transacao atomica via
//     `db.transaction(async (tx) => ...)` com `.for('update')`.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13).
//   - Timezone server-time UTC via `now` injetavel — precedente S081.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/monthlyClosure-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { monthlyClosureStatus, monthlyUnlockLog } from '../../db/schema';
import {
  processClosedMonth as processClosedMonthEngine,
  runDailyClosureJob as runDailyClosureJobEngine,
  type OrchestratorDependencies,
  type ProcessClosedMonthResult,
  type RunDailyClosureJobResult,
} from '../services/monthlyClosureOrchestrator';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** Janela canonica de edicao pos-desbloqueio: 24 horas (§4.1). */
export const UNLOCK_WINDOW_HOURS = 24 as const;

/** Milissegundos em 24 horas — usado no calculo de `expiraEm`. */
const UNLOCK_WINDOW_MS = UNLOCK_WINDOW_HOURS * 60 * 60 * 1000;

// ============================================================
// Mensagens canonicas literais (testadas verbatim)
// ============================================================

/**
 * §4.4 passo 2 — tentativa de desbloqueio de mes que ja esta
 * `desbloqueado`. Mensagem canonica exata (compartilhada com o
 * `cycleUnlockRequests.decide`).
 */
export const MSG_MES_JA_DESBLOQUEADO =
  'Este mês já está desbloqueado. Aguarde o fim da janela atual antes de aprovar nova solicitação.';

/** §4.1 — desbloqueio so se aplica a mes `fechado`. */
export const MSG_MES_NAO_FECHADO =
  'Apenas um mês fechado pode ser desbloqueado. Este mês não está fechado.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * Zod schema canonico do mes `YYYY-MM` (varchar(7) das tabelas mensais).
 * Reescrito local ao sub-router para desacoplar dos demais (RV-13).
 */
export const MES_INPUT_SCHEMA_CLOSURE = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: 'Mes canonico deve seguir o formato YYYY-MM.',
});

/** Enum canonico de `aba` de desbloqueio (§4.1 — bate com ABA_UNLOCK_VALUES). */
export const ABA_UNLOCK_SCHEMA_CLOSURE = z.enum(['rh', 'lider', 'faturamento']);

/** Enum canonico de tipo de lider (§4.4 — presente quando aba='lider'). */
export const LIDER_TIPO_SCHEMA_CLOSURE = z.enum(['employee', 'clevel']);

/** Justificativa canonica administrativa 100-500 (§2). */
export const JUSTIFICATIVA_SCHEMA_CLOSURE = z
  .string()
  .min(100, { message: 'A justificativa deve ter no mínimo 100 caracteres.' })
  .max(500, { message: 'A justificativa deve ter no máximo 500 caracteres.' });

/** Enum canonico de status do mes (§4.1). */
export const STATUS_MES_CLOSURE_VALUES = ['aberto', 'fechado', 'desbloqueado'] as const;

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/** Estado de status do mes (§4.1). */
export type StatusMesClosure = (typeof STATUS_MES_CLOSURE_VALUES)[number];

/**
 * Resumo do ultimo desbloqueio do mes (§3.11 — `ultimoDesbloqueio`).
 * `null` quando o mes nunca foi desbloqueado.
 */
export interface UltimoDesbloqueioResumo {
  justificativa: string;
  desbloqueadoEm: Date | null;
  desbloqueadoPor: number;
  aba: 'rh' | 'lider' | 'faturamento';
  liderId: number | null;
  expiraEm: Date;
  houveAlteracao: boolean;
}

/**
 * Retorno canonico de `getClosureStatus` (§3.11). `dataFechamento` e
 * `expiraEm` sao nulos conforme o estado; `ultimoDesbloqueio` e o resumo
 * do log mais recente (null se nunca desbloqueado).
 */
export interface ClosureStatusResult {
  companyId: number;
  mes: string;
  status: StatusMesClosure;
  dataFechamento: Date | null;
  expiraEm: Date | null;
  ultimoDesbloqueio: UltimoDesbloqueioResumo | null;
}

/** Retorno canonico de `unlockMonth`. */
export interface UnlockMonthResult {
  unlockLogId: number;
  status: 'desbloqueado';
  expiraEm: Date;
}

// ============================================================
// Dependencias injetaveis (S084 — DI factory)
// ============================================================

/**
 * Hooks de motor + relogio injetaveis. Os dois hooks de motor apontam,
 * por default, para o orchestrator canonico ME-031 (motor REAL, ja
 * existe — sem no-op). `now` default `() => new Date()`.
 */
export interface MonthlyClosureRouterDeps {
  processClosedMonth?: (
    db: RoipDatabase,
    companyId: number,
    mes: string,
    now: Date,
    deps?: OrchestratorDependencies,
  ) => Promise<ProcessClosedMonthResult>;
  runDailyClosureJob?: (
    db: RoipDatabase,
    companyId: number,
    now: Date,
    deps?: OrchestratorDependencies,
  ) => Promise<RunDailyClosureJobResult>;
  now?: () => Date;
}

interface ResolvedDeps {
  processClosedMonth: NonNullable<MonthlyClosureRouterDeps['processClosedMonth']>;
  runDailyClosureJob: NonNullable<MonthlyClosureRouterDeps['runDailyClosureJob']>;
  now: () => Date;
}

function resolveDeps(deps: MonthlyClosureRouterDeps): ResolvedDeps {
  return {
    processClosedMonth: deps.processClosedMonth ?? processClosedMonthEngine,
    runDailyClosureJob: deps.runDailyClosureJob ?? runDailyClosureJobEngine,
    now: deps.now ?? (() => new Date()),
  };
}

// ============================================================
// Guards e helpers canonicos
// ============================================================

/**
 * Guard canonico cruzado (§2.4): super_admin atravessa; demais roles
 * cruzam contra o `companyId` do proprio JWT. Reusado por
 * `getClosureStatus` (as demais procs sao exclusivas de super_admin, que
 * sempre atravessa).
 */
function assertCompanyScope(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Acesso negado ao mês desta empresa.',
    });
  }
}

/**
 * Resolve o `superAdminId` do titular. As procs que o consomem sao
 * `roleProcedure(['super_admin'])`, entao o discriminante e sempre
 * super_admin — mas o guard explicito documenta a invariante e satisfaz
 * o narrowing do TypeScript.
 */
function requireSuperAdminId(user: AuthenticatedUser): number {
  if (user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Esta operação é exclusiva do Super Admin.',
    });
  }
  return user.superAdminId;
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `monthlyClosure` com dependencias injetadas
 * (S084). Producao chama sem argumentos — os defaults apontam para o
 * motor canonico ME-031. Testes injetam `now` fixo e, quando querem
 * isolar o router do motor, hooks fake que registram a chamada.
 */
export function createMonthlyClosureRouter(deps: MonthlyClosureRouterDeps = {}) {
  const resolved = resolveDeps(deps);

  return router({
    /**
     * §3.11 + §4.1 — leitura do estado canonico do mes. Retorna status,
     * `dataFechamento`, `expiraEm` (quando desbloqueado) e o resumo do
     * ultimo desbloqueio. Legivel por todo perfil administrativo com
     * guard cruzado companyId (§2.4).
     */
    getClosureStatus: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_CLOSURE,
        }),
      )
      .query(async ({ ctx, input }): Promise<ClosureStatusResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        const [statusRow] = await ctx.db
          .select()
          .from(monthlyClosureStatus)
          .where(
            and(
              eq(monthlyClosureStatus.companyId, input.companyId),
              eq(monthlyClosureStatus.mes, input.mes),
            ),
          )
          .limit(1);

        const status: StatusMesClosure = statusRow ? statusRow.status : 'aberto';
        const dataFechamento = statusRow ? statusRow.dataFechamento : null;

        const [lastUnlock] = await ctx.db
          .select()
          .from(monthlyUnlockLog)
          .where(
            and(
              eq(monthlyUnlockLog.companyId, input.companyId),
              eq(monthlyUnlockLog.mes, input.mes),
            ),
          )
          .orderBy(desc(monthlyUnlockLog.desbloqueadoEm), desc(monthlyUnlockLog.id))
          .limit(1);

        const ultimoDesbloqueio: UltimoDesbloqueioResumo | null = lastUnlock
          ? {
              justificativa: lastUnlock.justificativa,
              desbloqueadoEm: lastUnlock.desbloqueadoEm,
              desbloqueadoPor: lastUnlock.desbloqueadoPor,
              aba: lastUnlock.aba,
              liderId: lastUnlock.liderId,
              expiraEm: lastUnlock.expiraEm,
              houveAlteracao: lastUnlock.houveAlteracao ?? false,
            }
          : null;

        // `expiraEm` do resultado so e canonico quando o mes esta
        // efetivamente desbloqueado (§4.1). Em qualquer outro estado o
        // campo e null, mesmo que exista log historico.
        const expiraEm = status === 'desbloqueado' && lastUnlock ? lastUnlock.expiraEm : null;

        return {
          companyId: input.companyId,
          mes: input.mes,
          status,
          dataFechamento,
          expiraEm,
          ultimoDesbloqueio,
        };
      }),

    /**
     * §4.1 + §4.4 — desbloqueio manual DIRETO por Bruno (S083). Cria
     * linha em `monthlyUnlockLog` e transiciona
     * `monthlyClosureStatus.status` para `desbloqueado`, em transacao
     * atomica com `.for('update')`. Exclusivo de super_admin (S086).
     * Pre-condicao: mes em `status='fechado'`. Rejeita 409 se ja
     * `desbloqueado` (mensagem canonica §4.4 passo 2).
     */
    unlockMonth: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_CLOSURE,
          aba: ABA_UNLOCK_SCHEMA_CLOSURE,
          liderId: z.number().int().positive().optional(),
          liderTipo: LIDER_TIPO_SCHEMA_CLOSURE.optional(),
          justificativa: JUSTIFICATIVA_SCHEMA_CLOSURE,
        }),
      )
      .mutation(async ({ ctx, input }): Promise<UnlockMonthResult> => {
        const superAdminId = requireSuperAdminId(ctx.user);
        const now = resolved.now();
        const expiraEm = new Date(now.getTime() + UNLOCK_WINDOW_MS);

        return await ctx.db.transaction(async (tx) => {
          // Passo 1: SELECT ... FOR UPDATE do estado corrente do mes.
          const [statusRow] = await tx
            .select()
            .from(monthlyClosureStatus)
            .where(
              and(
                eq(monthlyClosureStatus.companyId, input.companyId),
                eq(monthlyClosureStatus.mes, input.mes),
              ),
            )
            .for('update')
            .limit(1);

          // Mes inexistente ou nao-fechado nao pode ser desbloqueado
          // (§4.1). `aberto` (implicito quando sem linha) e `aberto`
          // explicito caem no mesmo bloqueio.
          if (!statusRow || statusRow.status === 'aberto') {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
          }
          if (statusRow.status === 'desbloqueado') {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_MES_JA_DESBLOQUEADO });
          }

          // Passo 2: INSERT canonico em monthlyUnlockLog. Espelha o
          // §4.4 passo 4, com `unlockRequestId=NULL` (desbloqueio
          // direto, sem cycleUnlockRequests) e `houveAlteracao=false`.
          const [inserted] = await tx
            .insert(monthlyUnlockLog)
            .values({
              companyId: input.companyId,
              mes: input.mes,
              aba: input.aba,
              liderId: input.liderId ?? null,
              liderTipo: input.liderTipo ?? null,
              desbloqueadoPor: superAdminId,
              justificativa: input.justificativa,
              desbloqueadoEm: now,
              expiraEm,
              houveAlteracao: false,
              unlockRequestId: null,
              createdAt: now,
            })
            .$returningId();

          if (!inserted) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Falha ao registrar o desbloqueio (insert sem id).',
            });
          }

          // Passo 3: UPDATE monthlyClosureStatus -> desbloqueado
          // (§4.4 passo 5).
          await tx
            .update(monthlyClosureStatus)
            .set({ status: 'desbloqueado' })
            .where(
              and(
                eq(monthlyClosureStatus.companyId, input.companyId),
                eq(monthlyClosureStatus.mes, input.mes),
              ),
            );

          return {
            unlockLogId: inserted.id,
            status: 'desbloqueado' as const,
            expiraEm,
          };
        });
      }),

    /**
     * §3.11 + §4.2 — proc interna de cron diario 00:00 (fuso local da
     * empresa). Delega ao motor canonico `runDailyClosureJob` (ME-031),
     * que executa a cascata completa: refresh do horizonte, transicoes
     * de cycleSchedule, expiracao de janelas de desbloqueio e
     * fechamento automatico do dia 11 encadeando `processClosedMonth`.
     * Exposta guardada por super_admin (S085) — nao ha perfil "cron" no
     * JWT; o wiring de cron real e escopo DOC 06. Retorna o inventario
     * canonico da passagem.
     */
    closeMonthScheduled: roleProcedure(['super_admin'])
      .input(z.object({ companyId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }): Promise<RunDailyClosureJobResult> => {
        requireSuperAdminId(ctx.user);
        const now = resolved.now();
        return await resolved.runDailyClosureJob(ctx.db, input.companyId, now);
      }),

    /**
     * §3.11 — proc interna acionada apos fechamento de um mes especifico.
     * Delega ao motor canonico `processClosedMonth` (ME-031): dispara
     * alertas mensais, atualiza cycleSchedule, marca `processadoEm` e
     * encadeia o calculo trimestral quando o mes fechado e o terceiro do
     * trimestre. Exposta guardada por super_admin (S085).
     */
    triggerMonthlyProcessing: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_CLOSURE,
        }),
      )
      .mutation(async ({ ctx, input }): Promise<ProcessClosedMonthResult> => {
        requireSuperAdminId(ctx.user);
        const now = resolved.now();
        return await resolved.processClosedMonth(ctx.db, input.companyId, input.mes, now);
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type MonthlyClosureRouter = ReturnType<typeof createMonthlyClosureRouter>;
