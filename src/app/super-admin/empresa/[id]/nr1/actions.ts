// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/nr1` (§14.28, ME-079b).
//
// Pattern S315 canônica + padrão híbrido `createCallerFactory`
// (ME-078b-refactor). 6 actions cobrindo: getCycleDetails (refetch),
// getCollectionStatus, configureCycle, editClosingDate, cancelCycle,
// startDownloadToken.
//
// **RV-13.** Todas as 6 actions consumidas por `Nr1Client.tsx`.
// **RV-12.** Zero SQL cru — procedures tRPC via caller.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import {
  createNr1Router,
  type GetCycleDetailsResultNr1,
  type GetCollectionStatusResultNr1,
  type StartDownloadTokenResultNr1,
} from '../../../../../server/routers/nr1';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const nr1Router = createNr1Router();
const createNr1Caller = createCallerFactory(nr1Router);
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
// 1. getCycleDetails (refetch pós-mutação)
// -----------------------------------------------------------------------

export async function getCycleDetailsAction(input: {
  readonly companyId: number;
  readonly cicloDbId?: number;
  readonly fatorId?: number;
}): Promise<ActionResult<GetCycleDetailsResultNr1>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getCycleDetails({
      companyId: input.companyId,
      cicloDbId: input.cicloDbId,
      fatorId: input.fatorId,
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
// 2. getCollectionStatus (gauge ciclo aberto)
// -----------------------------------------------------------------------

export async function getCollectionStatusAction(input: {
  readonly cicloDbId: number;
}): Promise<ActionResult<GetCollectionStatusResultNr1>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getCollectionStatus({
      cicloDbId: input.cicloDbId,
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
// 3. configureCycle (criar ciclo agendado)
// -----------------------------------------------------------------------

export async function configureCycleAction(input: {
  readonly companyId: number;
  readonly dataAbertura: string;
  readonly dataFechamento: string;
}): Promise<ActionResult> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    await caller.configureCycle({
      companyId: input.companyId,
      dataAbertura: input.dataAbertura,
      dataFechamento: input.dataFechamento,
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
// 4. editClosingDate (editar data de fechamento)
// -----------------------------------------------------------------------

export async function editClosingDateAction(input: {
  readonly cicloDbId: number;
  readonly novaDataFechamento: string;
  readonly justificativa: string;
}): Promise<ActionResult> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    await caller.editClosingDate({
      cicloDbId: input.cicloDbId,
      dataFechamento: input.novaDataFechamento,
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
// 5. cancelCycle (cancelar ciclo agendado)
// -----------------------------------------------------------------------

export async function cancelCycleAction(input: {
  readonly cicloDbId: number;
}): Promise<ActionResult> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    await caller.cancelCycle({
      cicloDbId: input.cicloDbId,
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
// 6. startDownloadToken (token efêmero para PDF)
// -----------------------------------------------------------------------

export async function startDownloadTokenAction(input: {
  readonly cicloDbId: number;
}): Promise<ActionResult<StartDownloadTokenResultNr1>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.startDownloadToken({
      cicloDbId: input.cicloDbId,
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
