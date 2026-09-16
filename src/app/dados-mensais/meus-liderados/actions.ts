// ROIP APP 9BOX — server actions canonicas da rota
// `/dados-mensais/meus-liderados` (§14.14, ME-fila1-01).
//
// 6 actions bit-a-bit canonicas — subset das 8 actions do padrao
// `/dados-mensais` (RH) reduzido a superficie canonica §14.14:
//   1. `loadMonthlyFormAction` — carga do formulario aba='lider'
//      (proc `monthlyData.getMonthlyInputForm`).
//   2. `saveMonthlyLeaderDataAction` — persistencia (proc
//      `monthlyData.saveMonthlyLeaderData`).
//   3. `getClosureStatusAction` — status do mes (proc
//      `monthlyClosure.getClosureStatus`).
//   4. `criarSolicitacaoDesbloqueioAction` — modal §14.16 (proc
//      `cycleUnlockRequests.create`).
//   5. `hasPendingUnlockAction` — badge canonico D053 (proc
//      `cycleUnlockRequests.hasPending`).
//   6. `listMesesFechadosAction` — select do modal §14.16 (query
//      direta Drizzle no `monthlyClosureStatus`).
//
// NAO expoe:
//   - `getLeadersStatus` — tela nao tem aba "Lideres" (§14.14 e uma
//     unica tabela de liderados diretos, sem sub-abas).
//   - `listCompanyLeaders` — liderId e sempre `session.userId`; sem
//     dropdown de escolha de lider (o proprio usuario e o titular).
//   - `unlockMonth` — §14.17 exclusivo Bruno.
//
// Guard canonico: `requireLiderRHLiderOrClevel` (ME-fila1-01). Aceita
// 4 perfis platform: `rh` (renderiza estado vazio, mas o guard aceita
// para o caso do page.tsx precisar chamar getClosureStatus mesmo em
// RH puro por simetria SSR); `rh_lider`, `clevel`, `lider`.
//
// **RV-13.** Todas as 6 actions consumidas por `page.tsx` (injetadas
// via prop `actions` no `MeusLideradosClient` compartilhado).
// **RV-12.** Zero SQL cru — services + Drizzle tipado ou procs tRPC.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../db/client';
import { monthlyClosureStatus } from '../../../db/schema';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import {
  deriveLiderTipoFromRole,
  requireLiderRHLiderOrClevel,
} from '../../../lib/routes/requireLiderRHLiderOrClevel';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import {
  createCycleUnlockRequestsRouter,
  NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
} from '../../../server/routers/cycleUnlockRequests';
import { createMonthlyClosureRouter } from '../../../server/routers/monthlyClosure';
import {
  createMonthlyDataRouter,
  type MonthlyInputFormResult,
  type SaveMonthlyDataResult,
} from '../../../server/routers/monthlyData';
import {
  createSpreadsheetsRouter,
  type DownloadResult,
  type UploadResult,
} from '../../../server/routers/spreadsheets';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

// -----------------------------------------------------------------------
// Instancias module-level canonicas (padrao S366)
// -----------------------------------------------------------------------

const monthlyDataRouter = createMonthlyDataRouter();
const createMonthlyDataCaller = createCallerFactory(monthlyDataRouter);

const monthlyClosureRouter = createMonthlyClosureRouter();
const createMonthlyClosureCaller = createCallerFactory(monthlyClosureRouter);

const spreadsheetsRouter = createSpreadsheetsRouter();
const createSpreadsheetsCaller = createCallerFactory(spreadsheetsRouter);

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

// -----------------------------------------------------------------------
// Contrato canonico bit-a-bit das actions (identico ao padrao ME-086b)
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

/**
 * Retorno canonico da closure status. Subset do `ClosureStatusResult`
 * (§3.11) — o cliente `MeusLideradosClient` consome apenas `status`
 * para calcular editabilidade e badges (paridade bit-a-bit com o
 * consumo do `DadosMensaisClient` RH). Detalhes de `ultimoDesbloqueio`
 * (justificativa, expiraEm) sao registrados em log administrativo e
 * expostos por Bruno via §14.17 — nao pelo lider/rh_lider/clevel.
 */
export interface MeusLideradosClosureStatus {
  readonly status: 'aberto' | 'fechado' | 'desbloqueado';
}

/** Retorno canonico da listagem de meses fechados (select modal). */
export interface MeusLideradosMesFechado {
  readonly mes: string;
  readonly label: string;
}

// -----------------------------------------------------------------------
// 1. Carregar formulario mensal (§14.14 — aba='lider' apenas)
// -----------------------------------------------------------------------

export async function loadMonthlyFormAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<MonthlyInputFormResult>> {
  const session = requireLiderRHLiderOrClevel(await getServerSession(), 'loadMonthlyFormAction');
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
    const liderTipo = deriveLiderTipoFromRole(session.role);
    const result = await caller.getMonthlyInputForm({
      companyId: session.companyId,
      mes: input.mes,
      aba: 'lider',
      liderId: session.userId,
      liderTipo,
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
// 2. Salvar dados do lider (§14.14)
// -----------------------------------------------------------------------

export async function saveMonthlyLeaderDataAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly liderados: ReadonlyArray<{
    readonly employeeId: number;
    readonly variaveis: ReadonlyArray<{
      readonly variableIndex: number;
      readonly demanda: string;
      readonly executado: string;
    }>;
  }>;
}): Promise<ActionResult<SaveMonthlyDataResult>> {
  const session = requireLiderRHLiderOrClevel(
    await getServerSession(),
    'saveMonthlyLeaderDataAction',
  );
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
    const liderTipo = deriveLiderTipoFromRole(session.role);
    type SaveInput = Parameters<typeof caller.saveMonthlyLeaderData>[0];
    const liderados = input.liderados.map((l) => ({
      employeeId: l.employeeId,
      variaveis: l.variaveis.map((v) => ({
        variableIndex: v.variableIndex,
        demanda: v.demanda,
        executado: v.executado,
      })),
    }));
    const result = await caller.saveMonthlyLeaderData({
      companyId: session.companyId,
      mes: input.mes,
      liderId: session.userId,
      liderTipo,
      liderados,
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
// 3. Status de fechamento do mes (§14.14)
// -----------------------------------------------------------------------

export async function getClosureStatusAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<MeusLideradosClosureStatus>> {
  const session = requireLiderRHLiderOrClevel(await getServerSession(), 'getClosureStatusAction');
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
      companyId: session.companyId,
      mes: input.mes,
    });
    return {
      ok: true,
      data: {
        status: result.status,
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
// 4. Criar solicitacao de desbloqueio (§14.16 modal, aba='lider')
// -----------------------------------------------------------------------

export async function criarSolicitacaoDesbloqueioAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly justificativa: string;
}): Promise<ActionResult<{ readonly id: number }>> {
  const session = requireLiderRHLiderOrClevel(
    await getServerSession(),
    'criarSolicitacaoDesbloqueioAction',
  );
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
    const liderTipo = deriveLiderTipoFromRole(session.role);
    type CreateInput = Parameters<typeof caller.create>[0];
    const result = await caller.create({
      companyId: session.companyId,
      mes: input.mes,
      aba: 'lider',
      liderId: session.userId,
      liderTipo,
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
// 5. Solicitacao pendente? (§14.14 badge canonico D053)
// -----------------------------------------------------------------------

export async function hasPendingUnlockAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<
  ActionResult<{
    readonly hasPending: boolean;
    readonly requestedAt: string | null;
  }>
> {
  const session = requireLiderRHLiderOrClevel(await getServerSession(), 'hasPendingUnlockAction');
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
      companyId: session.companyId,
      mes: input.mes,
      aba: 'lider',
      liderId: session.userId,
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
// 6. Listar meses fechados (§14.16 select do modal)
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
}): Promise<ActionResult<MeusLideradosMesFechado[]>> {
  const session = requireLiderRHLiderOrClevel(await getServerSession(), 'listMesesFechadosAction');
  // Defensive: nao usamos `input.companyId` bit-a-bit — sempre resolvido
  // do escopo canonico da sessao (defense-in-depth §2.4).
  void input;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({ mes: monthlyClosureStatus.mes })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, session.companyId),
          eq(monthlyClosureStatus.status, 'fechado'),
        ),
      )
      .orderBy(asc(monthlyClosureStatus.mes));

    // Ordem decrescente (mais recente primeiro) para UX do modal
    const mesesFechados: MeusLideradosMesFechado[] = rows
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
// ME-fila5 D3 — Item 5.6 — Actions canonicas Lider de import/export mensal
// -----------------------------------------------------------------------

/**
 * ME-fila5 D3 §3.11 — Baixa XLSX do template Lider mensal pre-preenchido
 * com liderados do lider autenticado + colunas dinamicas CC3 configuradas
 * na empresa.
 *
 * ME-fila6 D1 — `liderId` e `liderTipo` passam a ser derivados da sessao
 * (antes vinham do input, e o `page.tsx` montava closures inline que o
 * Next 15 rejeita na fronteira Server -> Client, gerando erro 500). A
 * action e injetada diretamente no `MeusLideradosClient`.
 */
export async function downloadLeaderTemplateLeaderAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<DownloadResult> {
  const session = requireLiderRHLiderOrClevel(
    await getServerSession(),
    'downloadLeaderTemplateLeaderAction',
  );
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const bearerToken = await resolveRawToken();
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: actionRateLimiter,
      bearerToken,
      ip: null,
    });
    const caller = createSpreadsheetsCaller(ctx);
    return await caller.downloadLeaderTemplate({
      companyId: session.companyId,
      mes: input.mes,
      liderId: session.userId,
      liderTipo: deriveLiderTipoFromRole(session.role),
    });
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-fila5 D3 §3.11 — Faz upload em massa dos dados Lider mensais via
 * XLSX. Reusa `saveMonthlyLeaderData` internamente. Retorna `UploadResult`.
 *
 * ME-fila6 D1 — `liderId` e `liderTipo` derivados da sessao (mesmo
 * racional de `downloadLeaderTemplateLeaderAction`).
 */
export async function uploadLeaderDataLeaderAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly xlsxBase64: string;
}): Promise<UploadResult> {
  const session = requireLiderRHLiderOrClevel(
    await getServerSession(),
    'uploadLeaderDataLeaderAction',
  );
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const bearerToken = await resolveRawToken();
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: actionRateLimiter,
      bearerToken,
      ip: null,
    });
    const caller = createSpreadsheetsCaller(ctx);
    return await caller.uploadLeaderData({
      companyId: session.companyId,
      mes: input.mes,
      liderId: session.userId,
      liderTipo: deriveLiderTipoFromRole(session.role),
      xlsxBase64: input.xlsxBase64,
    });
  } finally {
    await closeDbClient(client);
  }
}
