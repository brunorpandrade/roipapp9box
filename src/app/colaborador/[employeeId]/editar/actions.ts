// ROIP APP 9BOX — server actions canonicas da rota base RH
// `/colaborador/[employeeId]/editar` (§13.5, ME-084). Rota variante do
// padrao dual-route L123.
//
// Pattern S315 + hibrido `createCallerFactory` (S511): 13 actions RH-
// facing bit-exact simetricas as 13 do super-admin. Diferenca canonica
// bit-exact: guard `requireRHOrSuperAdmin` (nao `requireSuperAdmin`).
//
// Racional D-ME084-3 Opcao A: cada rota tem suas actions. Actions RH
// aqui delegam bit-exact aos mesmos callers do router — router
// internamente aplica `assertCompanyScope` (RH so opera na propria
// empresa) + `assertCanChangeIsRH` (bloqueia RH ativando `isRH` de
// outro colaborador) defense-in-depth §2.4.
//
// **RV-13.** As 13 actions consumidas por `ColaboradorEditarClient`
// via bag `actions` injetada no `page.tsx` desta rota.
//
// **RV-12.** Zero SQL cru — callers tipados Drizzle + 1 query Drizzle
// direta (`listarLideradosRHAction`) simetrica a `listarLideradosAction`
// super-admin.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../db/client';
import { employeeLeaderHistory, employees } from '../../../../db/schema';
import { requireRHOrSuperAdmin } from '../../../../lib/routes/requireRHOrSuperAdmin';
import { createRateLimiter } from '../../../../server/auth/rateLimit';
import { createCompanyRouter } from '../../../../server/routers/company';
import type { SetResponsavelFinanceiroResult } from '../../../../server/routers/company';
import {
  createEmployeesRouter,
  searchLiderCandidatesForCompany,
  type DeleteEmployeeResult,
  type InactivateEmployeeResult,
  type ReactivateEmployeeResult,
  type SearchLiderCandidatesResult,
  type UpdateEmployeeResult,
} from '../../../../server/routers/employees';
import {
  createLeadershipTransferRouter,
  type CanInactivateResult,
  type ExecuteResult,
  type GetCandidatesResult,
} from '../../../../server/routers/leadershipTransfer';
import { getServerSession } from '../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../server/trpc';

import { resolveDatabaseUrl } from '../../../todos-os-colaboradores/internals';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366)
// -----------------------------------------------------------------------

const employeesRouter = createEmployeesRouter();
const createEmployeesCaller = createCallerFactory(employeesRouter);

const companyRouter = createCompanyRouter();
const createCompanyCaller = createCallerFactory(companyRouter);

const ltRouter = createLeadershipTransferRouter();
const createLTCaller = createCallerFactory(ltRouter);

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
 * Guard canonico bit-exact ME-084 — resolve sessao e valida perfil RH
 * ou Super Admin. Bruno recebe erro canonico (rota base nao e canonica
 * para ele — usa super-admin dedicada). Retorna o `companyId` derivado
 * da sessao para RH (usado em queries diretas e em validacao de input).
 */
async function requireRHSessionAndCompanyId(actionName: string): Promise<number> {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, actionName);
  if (authed.kind === 'super_admin') {
    throw new Error(`${actionName}: Super Admin deve usar rota /super-admin/empresa/[id]/…`);
  }
  return authed.companyId;
}

// -----------------------------------------------------------------------
// Contrato canonico bit-exact
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// 1. Pesquisar candidatos a lider (§14.3)
// -----------------------------------------------------------------------

export async function pesquisarLiderCandidatosEditarRHAction(input: {
  readonly companyId: number;
  readonly query: string;
  readonly excludeEmployeeId?: number;
}): Promise<ActionResult<SearchLiderCandidatesResult>> {
  const companyId = await requireRHSessionAndCompanyId('pesquisarLiderCandidatosEditarRHAction');
  if (Number.isInteger(input.companyId) && input.companyId > 0 && input.companyId !== companyId) {
    return { ok: false, message: 'companyId divergente da sessao.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const result = await searchLiderCandidatesForCompany(
      client.db,
      companyId,
      input.query,
      input.excludeEmployeeId,
    );
    return { ok: true, data: result };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 2. Atualizar colaborador (§13.5)
// -----------------------------------------------------------------------

export async function atualizarColaboradorRHAction(input: {
  readonly employeeId: number;
  readonly name?: string;
  readonly email?: string;
  readonly photoUrl?: string;
  readonly dataNascimento?: string;
  readonly cargo?: string;
  readonly cbo?: string;
  readonly descricaoCBO?: string;
  readonly jobFamily?: string;
  readonly senioridade?: string;
  readonly nivelHierarquico?: string;
  readonly departamento?: string;
  readonly isRH?: boolean;
  readonly isLider?: boolean;
}): Promise<ActionResult<UpdateEmployeeResult>> {
  await requireRHSessionAndCompanyId('atualizarColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    // Router `employees.update` internamente aplica `assertCompanyScope`
    // (RH so edita colaboradores da propria empresa) + `assertCanChange
    // IsRH` (bloqueia RH tentando ativar isRH via input manipulado).
    // Toggle isRH ja e canonicamente ocultado pelo ColaboradorForm
    // quando variant='rh', mas guard back-end garante bit-exact §12.
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
// 3. Definir responsavel financeiro (§5.5)
// -----------------------------------------------------------------------

/**
 * §5.5 canonica bit-exact — variante RH. NOTA canonica: toggle RF e
 * ocultado pelo ColaboradorForm quando variant='rh'. Esta action existe
 * para simetria bit-exact do contrato; se o RH enviar (via manipulacao
 * client-side), o router `company.setResponsavelFinanceiro` rejeita
 * canonicamente (DOC 02 §5: RF exclusivo Bruno).
 */
export async function definirRFEditarRHAction(input: {
  readonly companyId: number;
  readonly newHolderType: 'employee' | 'cLevel';
  readonly newHolderId: number;
  readonly justificativa?: string;
}): Promise<ActionResult<SetResponsavelFinanceiroResult>> {
  const companyId = await requireRHSessionAndCompanyId('definirRFEditarRHAction');
  if (Number.isInteger(input.companyId) && input.companyId > 0 && input.companyId !== companyId) {
    return { ok: false, message: 'companyId divergente da sessao.' };
  }

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
    const inputWithCanonicalCompany = { ...input, companyId };
    const result = await caller.setResponsavelFinanceiro(inputWithCanonicalCompany);
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
// 4. Verificar elegibilidade de inativacao (§14.1)
// -----------------------------------------------------------------------

export async function verificarInativacaoRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<CanInactivateResult>> {
  await requireRHSessionAndCompanyId('verificarInativacaoRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLTCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.canInactivate(input);
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
// 5. Inativar colaborador (§12.6)
// -----------------------------------------------------------------------

export async function inativarColaboradorRHAction(input: {
  readonly employeeId: number;
  readonly motivoSaida: 'voluntario' | 'involuntario';
}): Promise<ActionResult<InactivateEmployeeResult>> {
  await requireRHSessionAndCompanyId('inativarColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
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
// 6. Executar transferencia de lideranca (§14.9)
// -----------------------------------------------------------------------

export async function executarTransferenciaRHAction(input: {
  readonly liderOriginalId: number;
  readonly mapeamento: readonly {
    readonly lideradoId: number;
    readonly novoLiderId: number;
    readonly novoLiderTipo: 'employee' | 'cLevel';
  }[];
  readonly candidatosGrupo4: readonly {
    readonly candidatoId: number;
  }[];
  readonly reason: string;
  readonly motivoSaida: 'voluntario' | 'involuntario';
}): Promise<ActionResult<ExecuteResult>> {
  await requireRHSessionAndCompanyId('executarTransferenciaRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLTCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.execute({
      liderOriginalId: input.liderOriginalId,
      mapeamento: [...input.mapeamento].map((m) => ({ ...m })),
      candidatosGrupo4: [...input.candidatosGrupo4].map((c) => ({ ...c })),
      reason: input.reason,
      motivoSaida: input.motivoSaida,
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
// 7. Buscar candidatos para transferencia (§14.3)
// -----------------------------------------------------------------------

export async function buscarCandidatosTransferenciaRHAction(input: {
  readonly employeeId: number;
  readonly companyId: number;
  readonly tentativaLiderados: readonly {
    readonly lideradoId: number;
  }[];
}): Promise<ActionResult<GetCandidatesResult>> {
  const companyId = await requireRHSessionAndCompanyId('buscarCandidatosTransferenciaRHAction');
  if (Number.isInteger(input.companyId) && input.companyId > 0 && input.companyId !== companyId) {
    return { ok: false, message: 'companyId divergente da sessao.' };
  }

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLTCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.getCandidates({
      employeeId: input.employeeId,
      companyId,
      tentativaLiderados: [...input.tentativaLiderados].map((t) => ({ ...t })),
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
// 8. Listar liderados diretos ativos — RV-12 query Drizzle direta
// -----------------------------------------------------------------------

export interface LideradoItem {
  readonly employeeId: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
}

export async function listarLideradosRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<readonly LideradoItem[]>> {
  await requireRHSessionAndCompanyId('listarLideradosRHAction');

  if (!Number.isInteger(input.employeeId) || input.employeeId <= 0) {
    return { ok: false, message: 'employeeId invalido.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({
        employeeId: employees.id,
        name: employees.name,
        cargo: employees.cargo,
        departamento: employees.departamento,
      })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employeeLeaderHistory.employeeId, employees.id))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, input.employeeId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.status, 'ativo'),
        ),
      )
      .orderBy(asc(employees.name));

    return { ok: true, data: rows };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 9. Reativar colaborador
// -----------------------------------------------------------------------

export async function reativarColaboradorRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<ReactivateEmployeeResult>> {
  await requireRHSessionAndCompanyId('reativarColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
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
// 10. Excluir colaborador (§16.4)
// -----------------------------------------------------------------------

export async function excluirColaboradorRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<DeleteEmployeeResult>> {
  await requireRHSessionAndCompanyId('excluirColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
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
// 11. Regenerar matricula (ME-080b Dispatch 2c)
// -----------------------------------------------------------------------

export async function regenerarMatriculaColaboradorRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<{ matricula: string }>> {
  await requireRHSessionAndCompanyId('regenerarMatriculaColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.regenerateMatricula({ employeeId: input.employeeId });
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

// -----------------------------------------------------------------------
// 12. Regenerar senha (ME-080b Dispatch 2c)
// -----------------------------------------------------------------------

export async function regenerarSenhaColaboradorRHAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<{ senhaInicial: string }>> {
  await requireRHSessionAndCompanyId('regenerarSenhaColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.regeneratePassword({ employeeId: input.employeeId });
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
// 13. Reatribuir lider individual (ME-080b Dispatch 3.3 / S519)
// -----------------------------------------------------------------------

export async function reatribuirLiderColaboradorRHAction(input: {
  readonly employeeId: number;
  readonly newLiderEmployeeId?: number;
  readonly newLiderClevelId?: number;
}): Promise<ActionResult<{ changed: boolean; newHistoryId: number | null }>> {
  await requireRHSessionAndCompanyId('reatribuirLiderColaboradorRHAction');

  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createEmployeesCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.reassignLider({
      employeeId: input.employeeId,
      ...(input.newLiderEmployeeId !== undefined
        ? { newLiderEmployeeId: input.newLiderEmployeeId }
        : {}),
      ...(input.newLiderClevelId !== undefined ? { newLiderClevelId: input.newLiderClevelId } : {}),
    });
    return {
      ok: true,
      data: { changed: result.changed, newHistoryId: result.newHistoryId },
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
