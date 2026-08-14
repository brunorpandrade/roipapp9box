// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/colaborador/novo` (§13.4, ME-078b-refactor).
//
// Pattern S315 canônica + padrão híbrido `createCallerFactory`.
// 3 actions:
//   - `pesquisarLiderCandidatosAction` → chamada direta à função
//     standalone `searchLiderCandidatesForCompany` (sem lógica complexa
//     na procedure — apenas assertCompanyScope + delegate).
//   - `criarColaboradorAction` → via caller `employees.create`
//     (transação atômica complexa com hooks de onboarding).
//   - `definirRFAction` → via caller `company.setResponsavelFinanceiro`
//     (transação atômica com log de transferência).
//
// **RV-13.** Todas as 3 actions consumidas por
// `ColaboradorNovoClient.tsx`.
//
// **RV-12.** Zero SQL cru — procedures/helpers tipados Drizzle.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../../db/client';
import { createRateLimiter } from '../../../../../../server/auth/rateLimit';
import { createCompanyRouter } from '../../../../../../server/routers/company';
import type { SetResponsavelFinanceiroResult } from '../../../../../../server/routers/company';
import {
  createEmployeesRouter,
  searchLiderCandidatesForCompany,
  type CreateEmployeeResult,
  type SearchLiderCandidatesResult,
} from '../../../../../../server/routers/employees';
import { getServerSession } from '../../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const employeesRouter = createEmployeesRouter();
const createEmployeesCaller = createCallerFactory(employeesRouter);

const companyRouter = createCompanyRouter();
const createCompanyCaller = createCallerFactory(companyRouter);

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
// Action canônica bit-exact — pesquisar candidatos a líder (§14.3)
// -----------------------------------------------------------------------

/**
 * §14.3 canônica — autocomplete de líder inicial. Chamada direta à
 * função standalone `searchLiderCandidatesForCompany` (a procedure tRPC
 * apenas faz `assertCompanyScope` + delegate — sem lógica embarcada).
 * Guard: `requireSuperAdmin` via `getServerSession` (cookie-based).
 */
export async function pesquisarLiderCandidatosAction(input: {
  readonly companyId: number;
  readonly query: string;
  readonly excludeEmployeeId?: number;
}): Promise<ActionResult<SearchLiderCandidatesResult>> {
  await requireSuperAdmin('pesquisarLiderCandidatosAction');

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
// Action canônica bit-exact — criar colaborador (§13.4)
// -----------------------------------------------------------------------

/**
 * §13.4 canônica bit-exact — server action de cadastro de colaborador.
 * Delega à procedure `employees.create` via `createCallerFactory` para
 * preservar transação atômica (INSERT employees + INSERT placeholder +
 * INSERT employeeLeaderHistory + hook onLeaderActivated).
 */
export async function criarColaboradorAction(input: {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly email?: string;
  readonly dataNascimento: string;
  readonly dataAdmissao: string;
  readonly cargo: string;
  readonly cbo: string;
  readonly descricaoCBO: string;
  readonly jobFamily: string;
  readonly senioridade: string;
  readonly nivelHierarquico: string;
  readonly departamento: string;
  readonly isRH?: boolean;
  readonly isLider?: boolean;
  readonly liderInicialId?: number;
  readonly liderInicialClevelId?: number;
  /**
   * ME-080b Dispatch 2b — matricula opcional. Se ausente: gerada
   * automaticamente. Se presente: validada (formato AA00 + unicidade).
   */
  readonly matricula?: string;
}): Promise<ActionResult<CreateEmployeeResult>> {
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
    const result = await caller.create(input as Parameters<typeof caller.create>[0]);
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
// Action canônica bit-exact — definir responsável financeiro (§5.5)
// -----------------------------------------------------------------------

/**
 * §5.5 canônica bit-exact — transferência/atribuição de RF.
 * Delega à procedure `company.setResponsavelFinanceiro` via caller
 * (transação atômica com log de transferência, hooks D050).
 */
export async function definirRFAction(input: {
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
