// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/colaborador/[employeeId]/editar` (§13.5,
// ME-078b-refactor).
//
// Pattern S315 canônica + padrão híbrido `createCallerFactory`.
// 10 actions cobrindo: search líder, update, RF, canInactivate,
// inactivate, execute transferência, getCandidates, listLiderados,
// reactivate, delete.
//
// **RV-13.** Todas as 10 actions consumidas por
// `ColaboradorEditarClient.tsx`.
//
// **RV-12.** Zero SQL cru — procedures tRPC + queries tipadas Drizzle.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { employeeLeaderHistory, employees } from '../../../../../../../db/schema';
import { createRateLimiter } from '../../../../../../../server/auth/rateLimit';
import { createCompanyRouter } from '../../../../../../../server/routers/company';
import type { SetResponsavelFinanceiroResult } from '../../../../../../../server/routers/company';
import {
  createEmployeesRouter,
  searchLiderCandidatesForCompany,
  type DeleteEmployeeResult,
  type InactivateEmployeeResult,
  type ReactivateEmployeeResult,
  type SearchLiderCandidatesResult,
  type UpdateEmployeeResult,
} from '../../../../../../../server/routers/employees';
import {
  createLeadershipTransferRouter,
  type CanInactivateResult,
  type ExecuteResult,
  type GetCandidatesResult,
} from '../../../../../../../server/routers/leadershipTransfer';
import { getServerSession } from '../../../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const employeesRouter = createEmployeesRouter();
const createEmployeesCaller = createCallerFactory(employeesRouter);

const companyRouter = createCompanyRouter();
const createCompanyCaller = createCallerFactory(companyRouter);

const ltRouter = createLeadershipTransferRouter();
const createLTCaller = createCallerFactory(ltRouter);

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

async function requireSuperAdmin(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin`);
  }
}

// -----------------------------------------------------------------------
// Contrato canônico bit-exact
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// 1. Pesquisar candidatos a líder (§14.3)
// -----------------------------------------------------------------------

export async function pesquisarLiderCandidatosEditarAction(input: {
  readonly companyId: number;
  readonly query: string;
  readonly excludeEmployeeId?: number;
}): Promise<ActionResult<SearchLiderCandidatesResult>> {
  await requireSuperAdmin('pesquisarLiderCandidatosEditarAction');

  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId invalido.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const result = await searchLiderCandidatesForCompany(
      client.db,
      input.companyId,
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

export async function atualizarColaboradorAction(input: {
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
// 3. Definir responsável financeiro (§5.5)
// -----------------------------------------------------------------------

export async function definirRFEditarAction(input: {
  readonly companyId: number;
  readonly newHolderType: 'employee' | 'cLevel';
  readonly newHolderId: number;
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
    const result = await caller.setResponsavelFinanceiro(input);
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
// 4. Verificar elegibilidade de inativação (§14.1)
// -----------------------------------------------------------------------

export async function verificarInativacaoAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<CanInactivateResult>> {
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

export async function inativarColaboradorAction(input: {
  readonly employeeId: number;
  readonly motivoSaida: 'voluntario' | 'involuntario';
}): Promise<ActionResult<InactivateEmployeeResult>> {
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
// 6. Executar transferência de liderança (§14.9)
// -----------------------------------------------------------------------

/**
 * §14.9 canônica bit-exact — executa a transferência de liderados +
 * inativação atômica do líder original. Aceita input na shape do
 * EXECUTE_INPUT_SCHEMA Zod (`liderOriginalId`, `mapeamento`,
 * `candidatosGrupo4`, `reason`, `motivoSaida`).
 *
 * O client (`ColaboradorEditarClient.tsx`) é responsável por traduzir
 * o formato `TransferMapping` do modal para o formato Zod antes de
 * chamar esta action.
 */
export async function executarTransferenciaAction(input: {
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
// 7. Buscar candidatos para transferência (§14.3)
// -----------------------------------------------------------------------

export async function buscarCandidatosTransferenciaAction(input: {
  readonly employeeId: number;
  readonly companyId: number;
  readonly tentativaLiderados: readonly {
    readonly lideradoId: number;
  }[];
}): Promise<ActionResult<GetCandidatesResult>> {
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
      companyId: input.companyId,
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
// 8. Listar liderados diretos ativos (bug fix — procedure inexistente
//    no router tRPC; criada como action com query Drizzle direta)
// -----------------------------------------------------------------------

/**
 * Retorno canônico de `listarLideradosAction`. Cada item carrega os
 * campos necessários para o `ModalTransferenciaLiderados` (§14.2):
 * `employeeId`, `name`, `cargo`, `departamento`.
 */
export interface LideradoItem {
  readonly employeeId: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
}

/**
 * Query Drizzle direta (RV-12 conforme) — lista liderados diretos
 * ativos do employee-líder alvo. Padrão idêntico ao
 * `countActiveLiderados` em `employees.ts`, mas retornando dados
 * completos para o modal M2 v2.
 *
 * Guard via `requireSuperAdmin` + `getServerSession` (cookie-based).
 */
export async function listarLideradosAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<readonly LideradoItem[]>> {
  await requireSuperAdmin('listarLideradosAction');

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

export async function reativarColaboradorAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<ReactivateEmployeeResult>> {
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

export async function excluirColaboradorAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<DeleteEmployeeResult>> {
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
// ME-080b Dispatch 2c — actions canonicas de regeneracao de credencial
// -----------------------------------------------------------------------

/**
 * ME-080b Dispatch 2c — regenera matricula do colaborador. A matricula
 * atual deixa de funcionar imediatamente no portal (CPF+matricula). O
 * cliente confirma via `RegenerateConfirmModal` antes de invocar.
 * Delega a `employees.regenerateMatricula` via createCallerFactory (S511).
 */
export async function regenerarMatriculaColaboradorAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<{ matricula: string }>> {
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

/**
 * ME-080b Dispatch 2c — regenera senha inicial do colaborador. So valida
 * para colaboradores com acesso ao painel (Lider, RH ou RF). A senha
 * atual deixa de funcionar imediatamente.
 * Delega a `employees.regeneratePassword` via createCallerFactory (S511).
 */
export async function regenerarSenhaColaboradorAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<{ senhaInicial: string }>> {
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
// ME-080b Dispatch 3.3 (S519) — reatribuicao individual de lider.
// -----------------------------------------------------------------------

/**
 * ME-080b Dispatch 3.3 (S519) — chama `employees.reassignLider` via
 * createCallerFactory (S511). Troca silenciosa: nao exige justificativa
 * livre; fecha historia ativa + INSERT nova com REASON canonico
 * `REASON_REATRIBUICAO_INDIVIDUAL`.
 *
 * Input polimorfico: exatamente um de {newLiderEmployeeId, newLiderClevelId}.
 * Cliente e responsavel por passar apenas o campo aplicavel.
 */
export async function reatribuirLiderColaboradorAction(input: {
  readonly employeeId: number;
  readonly newLiderEmployeeId?: number;
  readonly newLiderClevelId?: number;
}): Promise<ActionResult<{ changed: boolean; newHistoryId: number | null }>> {
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
