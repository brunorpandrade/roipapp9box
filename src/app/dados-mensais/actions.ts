// ROIP APP 9BOX — server actions canonicas da rota base RH
// `/dados-mensais` (§14.13 + §14.16, ME-086b).
//
// Pareada canonicamente com a rota Super Admin
// `/super-admin/empresa/[id]/dados-mensais` (ME-079a) no padrao
// dual-route L123 canonizado em ME-084 + ME-B9-CR. Todas as 8 actions
// desta rota:
//   - Usam `requireRHOrSuperAdmin` (ME-084) como guard canonico
//     (aceita `session.kind === 'super_admin'` OU
//     `session.kind === 'platform'` com `role IN {'rh', 'rh_lider'}`).
//   - Derivam `companyId` de `session.companyId` para RH/RH-Lider
//     via `resolveEffectiveCompanyId` (bit-exact ao padrao
//     `/central-relatorios` ME-B9-CR).
//   - Delegam para procedures tRPC via caller — defense-in-depth §2.4
//     preservada bit-exact (routers aplicam auth adicional).
//
// Actions canonicas bit-exact ME-086b (8):
//   1. `loadMonthlyFormAction` — carga do formulario RH (proc
//      `getMonthlyInputForm`).
//   2. `saveMonthlyRHDataAction` — persistencia RH (proc
//      `saveMonthlyRHData`).
//   3. `getClosureStatusAction` — status do mes (proc
//      `getClosureStatus`).
//   4. `getLeadersStatusAction` — status de preenchimento por lider
//      (proc `getLeadersStatus`).
//   5. `criarSolicitacaoDesbloqueioAction` — modal §14.16 (proc
//      `cycleUnlockRequests.create`).
//   6. `hasPendingUnlockAction` — badge canonico D051/D052/D053 (proc
//      `cycleUnlockRequests.hasPending`).
//   7. `listMesesFechadosAction` — select do modal (query direta
//      Drizzle no `monthlyClosureStatus`).
//   8. `listCompanyLeadersRHAction` — select de lider condicional do
//      modal (service `listActiveLeadersAndClevelsByCompany`).
//
// **RV-13.** Todas as 8 actions consumidas por `page.tsx` (injetadas
// via prop `actions` no `DadosMensaisClient` compartilhado).
// **RV-12.** Zero SQL cru — services + Drizzle tipado ou procs tRPC.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import type {
  DadosMensaisClosureStatus,
  DadosMensaisLeaderOption,
  DadosMensaisMesFechado,
} from '../../components/dados-mensais/internals';
import { closeDbClient, createDbClient } from '../../db/client';
import { monthlyClosureStatus } from '../../db/schema';
import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin';
import { createRateLimiter } from '../../server/auth/rateLimit';
import {
  createCycleUnlockRequestsRouter,
  NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
} from '../../server/routers/cycleUnlockRequests';
import { createMonthlyClosureRouter } from '../../server/routers/monthlyClosure';
import {
  createMonthlyDataRouter,
  type LeaderStatusRow,
  type MonthlyInputFormResult,
  type SaveMonthlyDataResult,
} from '../../server/routers/monthlyData';
import { listActiveLeadersAndClevelsByCompany } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366)
// -----------------------------------------------------------------------

const monthlyDataRouter = createMonthlyDataRouter();
const createMonthlyDataCaller = createCallerFactory(monthlyDataRouter);

const monthlyClosureRouter = createMonthlyClosureRouter();
const createMonthlyClosureCaller = createCallerFactory(monthlyClosureRouter);

const cycleUnlockRequestsRouter = createCycleUnlockRequestsRouter({
  evaluateAdminAlertsFactory: NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
});
const createCycleUnlockRequestsCaller = createCallerFactory(cycleUnlockRequestsRouter);

const actionRateLimiter = createRateLimiter();

// -----------------------------------------------------------------------
// Helpers locais (nao exportados — CC068)
// -----------------------------------------------------------------------

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

/**
 * Resolve `companyId` efetivo a partir do escopo canonico da sessao.
 * Para RH/RH-Lider (`kind='platform'`): retorna `session.companyId`
 * bit-exact. Para Super Admin: retorna o `inputCompanyId` que ele
 * passou. Bit-exact ao padrao ME-B9-CR.
 */
function resolveEffectiveCompanyId(
  session: ReturnType<typeof requireRHOrSuperAdmin>,
  inputCompanyId: number,
): number {
  if (session.kind === 'platform') {
    return session.companyId;
  }
  return inputCompanyId;
}

// -----------------------------------------------------------------------
// Contrato canonico bit-exact das actions
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// 1. Carregar formulario mensal (§14.13 — aba RH ou Lider)
// -----------------------------------------------------------------------

export async function loadMonthlyFormAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider';
  readonly liderId?: number;
  readonly liderTipo?: 'employee' | 'clevel';
}): Promise<ActionResult<MonthlyInputFormResult>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'loadMonthlyFormAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMonthlyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getMonthlyInputForm({
      companyId,
      mes: input.mes,
      aba: input.aba,
      liderId: input.liderId,
      liderTipo: input.liderTipo,
    });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 2. Salvar dados RH (§14.13 — custo + faltas + diasUteis)
// -----------------------------------------------------------------------

export async function saveMonthlyRHDataAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly diasUteis: number;
  readonly colaboradores: ReadonlyArray<{
    readonly employeeId: number;
    readonly custoTotalMes: string;
    readonly faltas: number;
  }>;
}): Promise<ActionResult<SaveMonthlyDataResult>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'saveMonthlyRHDataAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMonthlyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    type SaveInput = Parameters<typeof caller.saveMonthlyRHData>[0];
    const result = await caller.saveMonthlyRHData({
      companyId,
      mes: input.mes,
      diasUteis: input.diasUteis,
      colaboradores: input.colaboradores,
    } as SaveInput);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 3. Status de fechamento do mes (§14.13)
// -----------------------------------------------------------------------

export async function getClosureStatusAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<DadosMensaisClosureStatus>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'getClosureStatusAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMonthlyClosureCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getClosureStatus({
      companyId,
      mes: input.mes,
    });
    return {
      ok: true,
      data: {
        status: result.status,
        ultimoDesbloqueio: result.ultimoDesbloqueio,
      },
    };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 4. Status de preenchimento por lider (§14.13 aba Lideres — read-only)
// -----------------------------------------------------------------------

export async function getLeadersStatusAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<LeaderStatusRow[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'getLeadersStatusAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMonthlyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getLeadersStatus({
      companyId,
      mes: input.mes,
    });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 5. Criar solicitacao de desbloqueio (§14.16 modal)
// -----------------------------------------------------------------------

export async function criarSolicitacaoDesbloqueioAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider' | 'faturamento';
  readonly liderId?: number;
  readonly liderTipo?: 'employee' | 'clevel';
  readonly justificativa: string;
}): Promise<ActionResult<{ readonly id: number }>> {
  const session = requireRHOrSuperAdmin(
    await getServerSession(),
    'criarSolicitacaoDesbloqueioAction',
  );
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCycleUnlockRequestsCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    type CreateInput = Parameters<typeof caller.create>[0];
    const result = await caller.create({
      companyId,
      mes: input.mes,
      aba: input.aba,
      liderId: input.liderId,
      liderTipo: input.liderTipo,
      justificativa: input.justificativa,
    } as CreateInput);
    return { ok: true, data: { id: result.id } };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 6. Solicitacao pendente? (§14.13 badge canonico D051/D052/D053)
// -----------------------------------------------------------------------

export async function hasPendingUnlockAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider' | 'faturamento';
  readonly liderId?: number;
}): Promise<
  ActionResult<{
    readonly hasPending: boolean;
    readonly requestedAt: string | null;
  }>
> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'hasPendingUnlockAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCycleUnlockRequestsCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    type HasPendingInput = Parameters<typeof caller.hasPending>[0];
    const result = await caller.hasPending({
      companyId,
      mes: input.mes,
      aba: input.aba,
      liderId: input.liderId,
    } as HasPendingInput);
    return {
      ok: true,
      data: {
        hasPending: result.hasPending,
        requestedAt: result.requestedAt !== null ? result.requestedAt.toISOString() : null,
      },
    };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 7. Listar meses fechados (§14.16 select do modal)
// -----------------------------------------------------------------------

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

function formatMesLabelServer(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) {
    return mes;
  }
  return `${MESES_PT[monthIdx]} ${year}`;
}

export async function listMesesFechadosAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<DadosMensaisMesFechado[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'listMesesFechadosAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({ mes: monthlyClosureStatus.mes })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, companyId),
          eq(monthlyClosureStatus.status, 'fechado'),
        ),
      )
      .orderBy(asc(monthlyClosureStatus.mes));

    // Ordem decrescente canonica (mais recente primeiro) para UX do modal
    const mesesFechados: DadosMensaisMesFechado[] = rows
      .map((r) => ({
        mes: r.mes,
        label: formatMesLabelServer(r.mes),
      }))
      .reverse();

    return { ok: true, data: mesesFechados };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 8. Listar lideres canonico (§14.16 select condicional do modal)
// -----------------------------------------------------------------------

export async function listCompanyLeadersRHAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<DadosMensaisLeaderOption[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'listCompanyLeadersRHAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await listActiveLeadersAndClevelsByCompany(client.db, companyId);
    const leaders: DadosMensaisLeaderOption[] = rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      name: r.name,
    }));
    return { ok: true, data: leaders };
  } finally {
    await closeDbClient(client);
  }
}
