// ROIP APP 9BOX — server actions canonicas da rota base RH
// `/colaborador/novo` (§13.4, ME-084). Rota variante do padrao dual-
// route L123.
//
// Pattern S315 + hibrido `createCallerFactory`: 3 actions RH-facing
// bit-exact simetricas as 3 do super-admin (`criar/definirRF/pesquisar`
// LiderCandidatos`) — mesmos callers do router `employees` e
// `company`, mesmos schemas, mesmas transacoes atomicas. Diferenca
// canonica bit-exact: guard `requireRHOrSuperAdmin` (nao `requireSuper
// Admin`).
//
// Racional D-ME084-3 Opcao A: cada rota tem suas actions. Actions RH
// aqui delegam bit-exact aos mesmos callers do router — router
// internamente aplica `assertCompanyScope` + `assertCanChangeIsRH`
// defense-in-depth §2.4.
//
// **RV-13.** 3 actions consumidas por `ColaboradorNovoClient` via prop
// injecao (variant='rh') no `page.tsx` desta rota.
//
// **RV-12.** Zero SQL cru — callers tipados Drizzle.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../db/client';
import { requireRHOrSuperAdmin } from '../../../lib/routes/requireRHOrSuperAdmin';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { createCompanyRouter } from '../../../server/routers/company';
import type { SetResponsavelFinanceiroResult } from '../../../server/routers/company';
import {
  createEmployeesRouter,
  searchLiderCandidatesForCompany,
  type CreateEmployeeResult,
  type SearchLiderCandidatesResult,
} from '../../../server/routers/employees';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import { resolveDatabaseUrl } from '../../todos-os-colaboradores/internals';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366)
// -----------------------------------------------------------------------

const employeesRouter = createEmployeesRouter();
const createEmployeesCaller = createCallerFactory(employeesRouter);

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
// Action canonica bit-exact — pesquisar candidatos a lider (§14.3)
// -----------------------------------------------------------------------

/**
 * §14.3 canonica — autocomplete de lider inicial (variante RH).
 * Delega bit-exact a `searchLiderCandidatesForCompany` (identico ao
 * super-admin). Guard `requireRHOrSuperAdmin` bloqueia acesso indevido.
 * `companyId` derivado da sessao para RH — Bruno aqui recebe erro
 * (rota base nao e canonica para Bruno; ele usa super-admin).
 */
export async function pesquisarLiderCandidatosRHAction(input: {
  readonly companyId: number;
  readonly query: string;
  readonly excludeEmployeeId?: number;
}): Promise<ActionResult<SearchLiderCandidatesResult>> {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, 'pesquisarLiderCandidatosRHAction');
  if (authed.kind === 'super_admin') {
    return {
      ok: false,
      message: 'Super Admin deve usar rota /super-admin/empresa/[id]/…',
    };
  }
  const companyId = authed.companyId;
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
// Action canonica bit-exact — criar colaborador (§13.4)
// -----------------------------------------------------------------------

/**
 * §13.4 canonica bit-exact — server action de cadastro de colaborador
 * pela variante RH. Delega ao caller `employees.create` via
 * `createCallerFactory` preservando transacao atomica (INSERT
 * employees + INSERT placeholder + INSERT employeeLeaderHistory + hook
 * onLeaderActivated).
 *
 * Guard defense-in-depth: `requireRHOrSuperAdmin` no topo + router
 * `employees` aplica `assertCanChangeIsRH` (bloqueia RH tentando ativar
 * isRH via input manipulado). Toggle isRH ja e canonicamente ocultado
 * pelo ColaboradorForm quando variant='rh', mas guard back-end
 * garante bit-exact §12 DOC 02.
 */
export async function criarColaboradorRHAction(input: {
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
  readonly matricula?: string;
}): Promise<ActionResult<CreateEmployeeResult>> {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, 'criarColaboradorRHAction');
  if (authed.kind === 'super_admin') {
    return {
      ok: false,
      message: 'Super Admin deve usar rota /super-admin/empresa/[id]/…',
    };
  }
  const companyId = authed.companyId;
  if (Number.isInteger(input.companyId) && input.companyId > 0 && input.companyId !== companyId) {
    return { ok: false, message: 'companyId divergente da sessao.' };
  }

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
    // Escopo canonico: usa companyId da sessao (nao do input).
    const inputWithCanonicalCompany = { ...input, companyId };
    const result = await caller.create(
      inputWithCanonicalCompany as Parameters<typeof caller.create>[0],
    );
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
// Action canonica bit-exact — definir responsavel financeiro (§5.5)
// -----------------------------------------------------------------------

/**
 * §5.5 canonica bit-exact — transferencia/atribuicao de RF (variante RH).
 * NOTA canonica: em variant='rh', o toggle "Ativar como Responsavel
 * financeiro" (Secao 5 de ColaboradorForm) e canonicamente OCULTO. Esta
 * action existe para preservar simetria bit-exact do contrato do
 * `ColaboradorNovoClient`, mas o RH nunca deveria envia-la. Se o RH
 * enviar (via manipulacao client-side), o guard back-end em
 * `company.setResponsavelFinanceiro` rejeita canonicamente (DOC 02 §5:
 * RF exclusivo Bruno). Aqui apenas encaminhamos para o caller — a
 * rejeicao vem do router.
 */
export async function definirRFRHAction(input: {
  readonly companyId: number;
  readonly newHolderType: 'employee' | 'cLevel';
  readonly newHolderId: number;
  readonly justificativa?: string;
}): Promise<ActionResult<SetResponsavelFinanceiroResult>> {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, 'definirRFRHAction');
  if (authed.kind === 'super_admin') {
    return {
      ok: false,
      message: 'Super Admin deve usar rota /super-admin/empresa/[id]/…',
    };
  }
  const companyId = authed.companyId;
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
