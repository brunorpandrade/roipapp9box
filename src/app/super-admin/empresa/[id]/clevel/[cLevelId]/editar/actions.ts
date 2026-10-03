// ROIP APP 9BOX — server actions canonicas da rota Bruno
// `/super-admin/empresa/[id]/clevel/[cLevelId]/editar` (§13.3,
// ME-078b-refactor).
//
// Pattern S315 canonica + padrao hibrido `createCallerFactory`.
// 4 procedures delegadas: `cLevelMembers.update`, `.inactivate`,
// `.reactivate`, `.delete`.
//
// ME 3.5 D5 patch2 — `atualizarCLevelAction` passa a aceitar `isRH?:
// boolean`, encaminhado a procedure `cLevelMembers.update`. Semantica
// canonica: apenas Super Admin passa no guard `roleProcedure(['super_
// admin'])`, cumprindo D9 §12 DOC 02 (heranca via role guard).
//
// **RV-13.** Todas as 4 actions consumidas por `CLevelEditarClient.tsx`.
//
// **RV-12.** Zero SQL cru — procedures tRPC usam helpers tipados Drizzle.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { createRateLimiter } from '../../../../../../../server/auth/rateLimit';
import {
  createCLevelMembersRouter,
  type DeleteCLevelResult,
  type InactivateCLevelResult,
  type ReactivateCLevelResult,
  type UpdateCLevelResult,
} from '../../../../../../../server/routers/cLevelMembers';
import {
  createCompanyRouter,
  type SetResponsavelFinanceiroResult,
} from '../../../../../../../server/routers/company';
import { createCallerFactory, createContextInner } from '../../../../../../../server/trpc';
import { resolveDatabaseUrl } from '../../../../../../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366)
// -----------------------------------------------------------------------

const cLevelRouter = createCLevelMembersRouter();
const createCLevelCaller = createCallerFactory(cLevelRouter);
const companyRouter = createCompanyRouter();
const createCompanyCaller = createCallerFactory(companyRouter);
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
// Contrato canonico bit-exact
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// Action canonica bit-exact — atualizar C-level (§13.3)
// -----------------------------------------------------------------------

export async function atualizarCLevelAction(input: {
  readonly cLevelId: number;
  readonly name?: string;
  readonly email?: string;
  // ME-B9.3 — `null` canonico = remocao da foto do C-level (patch limpa).
  readonly photoUrl?: string | null;
  readonly dataNascimento?: string;
  // Hotfix pós-ME 3.5.1 — campo cadastral corrigível bit-a-bit ao
  // `dataNascimento` acima. Router `UPDATE_CLEVEL_INPUT_SCHEMA`
  // aceita `dataAdmissao` a partir deste patch.
  readonly dataAdmissao?: string;
  readonly cargo?: string;
  readonly descricaoCargo?: string;
  readonly departamento?: string;
  readonly custoMensal?: number;
  readonly acessoTotal?: boolean;
  readonly isRH?: boolean;
}): Promise<ActionResult<UpdateCLevelResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.update(input as Parameters<typeof caller.update>[0]);
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
// Action canonica bit-exact — inativar C-level (§12.6)
// -----------------------------------------------------------------------

export async function inativarCLevelAction(input: {
  readonly cLevelId: number;
}): Promise<ActionResult<InactivateCLevelResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.inactivate(input);
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
// Action canonica bit-exact — reativar C-level
// -----------------------------------------------------------------------

export async function reativarCLevelAction(input: {
  readonly cLevelId: number;
}): Promise<ActionResult<ReactivateCLevelResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.reactivate(input);
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
// Action canonica bit-exact — excluir C-level (§16.4)
// -----------------------------------------------------------------------

export async function excluirCLevelAction(input: {
  readonly cLevelId: number;
}): Promise<ActionResult<DeleteCLevelResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.delete(input);
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
// ME-080b Dispatch 2c — actions canonicas de regeneracao de credencial
// -----------------------------------------------------------------------

/**
 * ME-080b Dispatch 2c — regenera matricula do C-level. A matricula atual
 * deixa de funcionar imediatamente no portal (CPF+matricula). O cliente
 * confirma via `RegenerateConfirmModal` antes de invocar.
 * Delega a `cLevelMembers.regenerateMatricula` via createCallerFactory (S511).
 */
export async function regenerarMatriculaCLevelAction(input: {
  readonly cLevelId: number;
}): Promise<ActionResult<{ matricula: string }>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.regenerateMatricula({ cLevelId: input.cLevelId });
    return { ok: true, data: { matricula: result.matricula } };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-080b Dispatch 2c — regenera senha inicial do C-level. C-level sempre
 * tem acesso ao painel — sem guard "sem acesso ao painel". A senha atual
 * deixa de funcionar imediatamente.
 * Delega a `cLevelMembers.regeneratePassword` via createCallerFactory (S511).
 */
export async function regenerarSenhaCLevelAction(input: {
  readonly cLevelId: number;
}): Promise<ActionResult<{ senhaInicial: string }>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.regeneratePassword({ cLevelId: input.cLevelId });
    return { ok: true, data: { senhaInicial: result.senhaInicial } };
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
// ME-080b Dispatch 3.1 (S517) — action canonica para ativar C-level como
// Responsavel financeiro. Necessaria porque `atualizarCLevelAction` NAO
// aceita `isResponsavelFinanceiro` no payload — RF muda por endpoint
// dedicado `company.setResponsavelFinanceiro`. Antes deste dispatch, a
// tela de edicao do C-level montava o toggle mas silenciosamente o
// ignorava no save.
// -----------------------------------------------------------------------

export async function definirRFCLevelEditarAction(input: {
  readonly companyId: number;
  readonly cLevelId: number;
  readonly justificativa?: string;
}): Promise<ActionResult<SetResponsavelFinanceiroResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCompanyCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.setResponsavelFinanceiro({
      companyId: input.companyId,
      newHolderType: 'cLevel',
      newHolderId: input.cLevelId,
      ...(input.justificativa !== undefined ? { justificativa: input.justificativa } : {}),
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
