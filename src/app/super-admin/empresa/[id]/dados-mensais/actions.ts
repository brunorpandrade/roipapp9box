// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/dados-mensais` (§14.13, ME-079a).
//
// Pattern S315 canônica + padrão híbrido `createCallerFactory`
// (ME-078b-refactor). 5 actions cobrindo: load form (RH + Líderes),
// save RH, save Líder, get closure status, unlock month.
//
// **RV-13.** Todas as 5 actions consumidas por
// `DadosMensaisClient.tsx`.
//
// **RV-12.** Zero SQL cru — procedures tRPC via caller.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import {
  createMonthlyClosureRouter,
  type StatusMesClosure,
  type UltimoDesbloqueioResumo,
} from '../../../../../server/routers/monthlyClosure';
import {
  createMonthlyDataRouter,
  type MonthlyInputFormResult,
  type SaveMonthlyDataResult,
  type LeaderStatusRow,
} from '../../../../../server/routers/monthlyData';
import {
  createSpreadsheetsRouter,
  type DownloadResult,
  type UploadResult,
} from '../../../../../server/routers/spreadsheets';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const monthlyDataRouter = createMonthlyDataRouter();
const createMonthlyDataCaller = createCallerFactory(monthlyDataRouter);

const monthlyClosureRouter = createMonthlyClosureRouter();
const createMonthlyClosureCaller = createCallerFactory(monthlyClosureRouter);

const spreadsheetsRouter = createSpreadsheetsRouter();
const createSpreadsheetsCaller = createCallerFactory(spreadsheetsRouter);

const actionRateLimiter = createRateLimiter();

// -----------------------------------------------------------------------
// Helpers locais (não exportados — CC068)
// -----------------------------------------------------------------------

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

// -----------------------------------------------------------------------
// Contrato canônico bit-exact
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// Tipo de resultado da closure status
// -----------------------------------------------------------------------

export interface ClosureStatusResult {
  status: StatusMesClosure;
  ultimoDesbloqueio: UltimoDesbloqueioResumo | null;
}

// -----------------------------------------------------------------------
// 1. Carregar formulário mensal (§14.13 — aba RH ou Líderes)
// -----------------------------------------------------------------------

export async function loadMonthlyFormAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider';
  readonly liderId?: number;
  readonly liderTipo?: 'employee' | 'clevel';
}): Promise<ActionResult<MonthlyInputFormResult>> {
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
    const result = await caller.getMonthlyInputForm(input);
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
    const result = await caller.saveMonthlyRHData(input as SaveInput);
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
// 3. Salvar dados do Líder (§14.14)
// -----------------------------------------------------------------------

export async function saveMonthlyLeaderDataAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly liderId: number;
  readonly liderTipo: 'employee' | 'clevel';
  readonly liderados: Array<{
    employeeId: number;
    variaveis: Array<{
      variableIndex: number;
      demanda: string;
      executado: string;
    }>;
  }>;
}): Promise<ActionResult<SaveMonthlyDataResult>> {
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
    const result = await caller.saveMonthlyLeaderData({
      companyId: input.companyId,
      mes: input.mes,
      liderId: input.liderId,
      liderTipo: input.liderTipo,
      liderados: input.liderados,
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
// 4. Obter status de fechamento do mês (§14.13)
// -----------------------------------------------------------------------

export async function getClosureStatusAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<ClosureStatusResult>> {
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
      companyId: input.companyId,
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
// 5. Desbloquear mês (§14.17 — Bruno desbloqueia direto)
// -----------------------------------------------------------------------

export async function unlockMonthAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider' | 'faturamento';
  readonly justificativa: string;
}): Promise<ActionResult> {
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
    await caller.unlockMonth({
      companyId: input.companyId,
      mes: input.mes,
      aba: input.aba,
      justificativa: input.justificativa,
    });
    return { ok: true, data: null };
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
// 6. Listar status dos líderes (§14.13 — Aba Líderes visão geral)
// -----------------------------------------------------------------------

export async function getLeadersStatusAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<ActionResult<LeaderStatusRow[]>> {
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
      companyId: input.companyId,
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
// ME-fila5 D3 — Item 5.6 — Actions canonicas de import/export mensal
// -----------------------------------------------------------------------
//
// Wire-in dos botoes [📄 Baixar planilha modelo] + [📤 Importar em massa]
// nas abas RH e Lider do `DadosMensaisClient` (variant='super_admin').
// Delegam bit-a-bit as 4 procs canonicas de `spreadsheets.ts` via caller
// factory + bearer token do cookie. Padrao S315 identico ao Item 5.5.

/**
 * ME-fila5 D3 §3.11 — Baixa XLSX canonico do template RH mensal pre-
 * preenchido com colaboradores ativos da empresa. Consumido pelo modal
 * `ImportarPlanilhaModal` variant='monthly-rh' + botao standalone.
 */
export async function downloadRHTemplateAction(input: {
  readonly companyId: number;
  readonly mes: string;
}): Promise<DownloadResult> {
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
    return await caller.downloadRHTemplate({
      companyId: input.companyId,
      mes: input.mes,
    });
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-fila5 D3 §3.11 — Faz upload em massa dos dados RH mensais via
 * XLSX. Delega `spreadsheets.uploadRHData` que reusa `saveMonthlyRHData`
 * (mesma logica canonica do preenchimento manual). Retorna `UploadResult`
 * com contadores + erros por linha para exibicao no modal.
 */
export async function uploadRHDataAction(input: {
  readonly companyId: number;
  readonly mes: string;
  readonly xlsxBase64: string;
  readonly diasUteis?: number;
}): Promise<UploadResult> {
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
    return await caller.uploadRHData({
      companyId: input.companyId,
      mes: input.mes,
      xlsxBase64: input.xlsxBase64,
      diasUteis: input.diasUteis,
    });
  } finally {
    await closeDbClient(client);
  }
}
