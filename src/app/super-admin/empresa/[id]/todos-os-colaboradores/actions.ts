// ROIP APP 9BOX — server actions canonicas da rota Bruno
// `/super-admin/empresa/[id]/todos-os-colaboradores` (§14.10, ME-076).
//
// Pattern S315 canonizada em ME-057b: server actions Next 15 App Router
// atuam como wrappers thin sobre os services canonicos + validacoes
// puras. Guard canonico bit-exact `requireSuperAdmin` server-side
// (defense-in-depth ao middleware `/super-admin/empresa/`).
//
// **RV-13.** `listarColaboradoresAction` consumido por
// `TodosColaboradoresClient.tsx` (refetch em cada mudanca de filtro /
// paginacao / ordenacao / busca).
// ME-fila5 D2 acrescenta 3 actions canonicas para o Item 5.5:
// `downloadTemplateColaboradoresAction`, `exportSpreadsheetColabora-
// doresAction`, `uploadCSVColaboradoresAction`. As 3 delegam as procs
// tRPC canonicas via caller factory + bearerToken do cookie (padrao
// preserva 100% da matriz de autorizacao das procs).
//
// **RV-12.** Zero SQL cru — service tipado Drizzle.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import {
  createEmployeesRouter,
  UPLOAD_CONTENT_TYPES,
  type EmployeesDownloadResult,
  type UploadCSVResult,
} from '../../../../../server/routers/employees';
import {
  listEmployeesPaginated,
  type ListEmployeesResult,
} from '../../../../../server/services/employees';
import { getServerSession } from '../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';

import { colaboradoresFiltersToServiceInput, type ColaboradoresFilters } from './filters';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Guard canonico bit-exact
// -----------------------------------------------------------------------

async function requireSuperAdmin(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin (§10.3 CAMADA_AUTH)`);
  }
}

// -----------------------------------------------------------------------
// Action canonica bit-exact — listar colaboradores (§14.10)
// -----------------------------------------------------------------------

/**
 * §14.10 — refetch server-side canonica bit-exact da listagem de
 * colaboradores. Chamada pelo `TodosColaboradoresClient.tsx` sempre que
 * o usuario altera filtro, busca, ordenacao ou paginacao. Retorna o
 * resultado tipado (`rows`, `totalCount`, `filtersApplied`).
 */
export async function listarColaboradoresAction(
  companyId: number,
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  await requireSuperAdmin('listarColaboradoresAction');

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('listarColaboradoresAction: companyId invalido.');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const serviceInput = colaboradoresFiltersToServiceInput(filters);
    const result = await listEmployeesPaginated(client.db, companyId, serviceInput);
    return result;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// ME-fila5 D2 — actions canonicas do Item 5.5 (procs tRPC via caller)
// -----------------------------------------------------------------------
//
// Racional arquitetural canonico: em vez de reimplementar autorizacao +
// guard + logica de negocio, cada action monta um `Context` canonico
// bit-a-bit ao pipeline HTTP tRPC (`createContext` do route.ts) usando
// o bearer token do cookie `session` do request e chama a proc via
// caller factory. Padrao preserva:
// - Matriz de autorizacao das procs (`roleProcedure`).
// - Guard cruzado `assertCompanyScope` (§2.4).
// - PC1a canonica (herda do service via proc).
// - Erros TRPCError com codigos e mensagens canonicas.

const SESSION_COOKIE_NAME = 'session' as const;

/**
 * Constroi Context tRPC canonico com bearer token do cookie da request
 * atual. Consumido pelas 3 actions ME-fila5 D2 para chamar as procs
 * via caller factory sem burlar o pipeline de autenticacao.
 */
async function buildAuthenticatedCallerContext() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  const bearerToken = cookie === undefined ? null : cookie.value;
  const client = createDbClient(resolveDatabaseUrl());
  const ctx = createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: null,
  });
  return { ctx, client };
}

/**
 * §14.10 — ME-fila5 D2. Gera XLSX canonico do template de cadastro em
 * massa (14 rotulos canonicos exatos). Consumido pelo modal
 * `ImportarPlanilhaModal.tsx` (bloco 1 — "Baixe o modelo") + botao
 * `[📄 Baixar planilha modelo]` do cabecalho.
 */
export async function downloadTemplateColaboradoresAction(
  companyId: number,
): Promise<EmployeesDownloadResult> {
  await requireSuperAdmin('downloadTemplateColaboradoresAction');
  const { ctx, client } = await buildAuthenticatedCallerContext();
  try {
    const factory = createCallerFactory(createEmployeesRouter());
    const caller = factory(ctx);
    return await caller.downloadTemplate({ companyId });
  } finally {
    await closeDbClient(client);
  }
}

/**
 * §14.10 — ME-fila5 D2. Gera XLSX canonico da lista atual de
 * colaboradores (respeitando filtros + busca + ordenacao). PC1a herdada
 * do service. Consumido pelo botao `[📥 Exportar planilha]`.
 */
export async function exportSpreadsheetColaboradoresAction(
  companyId: number,
  filters: ColaboradoresFilters,
): Promise<EmployeesDownloadResult> {
  await requireSuperAdmin('exportSpreadsheetColaboradoresAction');
  const { ctx, client } = await buildAuthenticatedCallerContext();
  try {
    const serviceInput = colaboradoresFiltersToServiceInput(filters);
    const factory = createCallerFactory(createEmployeesRouter());
    const caller = factory(ctx);
    return await caller.exportSpreadsheet({
      companyId,
      filters: {
        busca: serviceInput.busca,
        departamento: serviceInput.departamento,
        liderId: serviceInput.liderId,
        liderIdTipo: serviceInput.liderIdTipo,
        nivelHierarquico: serviceInput.nivelHierarquico,
        status: serviceInput.status,
        senioridade: serviceInput.senioridade,
        jobFamily: serviceInput.jobFamily,
        dataAdmissaoInicio: serviceInput.dataAdmissaoInicio,
        dataAdmissaoFim: serviceInput.dataAdmissaoFim,
        dataCadastroInicio: serviceInput.dataCadastroInicio,
        dataCadastroFim: serviceInput.dataCadastroFim,
        papelFuncional: serviceInput.papelFuncional,
      },
      sortBy: serviceInput.sortBy,
      sortOrder: serviceInput.sortOrder,
    });
  } finally {
    await closeDbClient(client);
  }
}

/**
 * §16.6 — ME-fila5 D2. Executa upload em massa consumindo a proc
 * canonica `employees.uploadCSV` (canonizada em ME-043b). Recebe
 * `xlsxBase64` do modal client-side (canonicamente `.xlsx` apenas — o
 * backend aceita `csv` tambem por defesa em profundidade).
 */
export async function uploadCSVColaboradoresAction(
  companyId: number,
  xlsxBase64: string,
): Promise<UploadCSVResult> {
  await requireSuperAdmin('uploadCSVColaboradoresAction');
  const { ctx, client } = await buildAuthenticatedCallerContext();
  try {
    const factory = createCallerFactory(createEmployeesRouter());
    const caller = factory(ctx);
    return await caller.uploadCSV({
      companyId,
      contentBase64: xlsxBase64,
      contentType: UPLOAD_CONTENT_TYPES[0],
    });
  } finally {
    await closeDbClient(client);
  }
}
