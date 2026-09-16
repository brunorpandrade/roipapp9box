// ROIP APP 9BOX — server actions canonicas da rota base RH
// `/todos-os-colaboradores` (§14.10, ME-084). Rota variante do padrao
// dual-route L123.
//
// Pattern S315 canonica: server actions Next 15 como wrappers thin
// sobre services canonicos + guard `requireRHOrSuperAdmin` no topo.
//
// Racional D-ME084-3 Opcao A aprovada: cada rota tem suas proprias
// actions com guard adequado. Actions RH aqui delegam bit-exact aos
// mesmos services da rota super-admin — router `employees` internamente
// aplica `assertCompanyScope` (garante RH so opera na propria empresa —
// derivada de `session.companyId`) preservando defense-in-depth §2.4.
//
// **RV-13.** `listarColaboradoresRHAction` consumida por
// `page.tsx` (via prop `refetchAction` do `TodosColaboradoresClient`).
// ME-fila5 D2 acrescenta 3 actions canonicas para o Item 5.5:
// `downloadTemplateColaboradoresRHAction`, `exportSpreadsheetColabora-
// doresRHAction`, `uploadCSVColaboradoresRHAction`.
//
// **RV-12.** Zero SQL cru — service tipado Drizzle.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { createRateLimiter } from '../../server/auth/rateLimit';
import {
  createEmployeesRouter,
  UPLOAD_CONTENT_TYPES,
  type EmployeesDownloadResult,
  type UploadCSVResult,
} from '../../server/routers/employees';
import { listEmployeesPaginated, type ListEmployeesResult } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { colaboradoresFiltersToServiceInput, type ColaboradoresFilters } from './filters';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

/**
 * §14.10 — refetch server-side canonica bit-exact da listagem de
 * colaboradores para a variante RH. Chamada pelo `TodosColaboradores-
 * Client` via prop `refetchAction` a cada mudanca de filtro / busca /
 * ordenacao / paginacao.
 *
 * Escopo canonico: `companyId` derivado da `session.companyId` do RH
 * autenticado. Bruno acessando esta rota (branch super_admin do guard)
 * teria de passar o `companyId` explicito — mas o padrao canonico Bruno
 * e usar a rota super-admin dedicada, portanto ignoramos o input
 * `companyIdIgnored` do primeiro parametro e sempre derivamos da sessao
 * para RH (defense-in-depth: RH nao pode listar de outra empresa nem
 * por manipulacao client-side). Para Bruno o input canonicamente e o
 * `session.companyId` sinalizando; se `session.kind === 'super_admin'`,
 * a rota super-admin dedicada e o caminho canonico e Bruno nao chega
 * aqui.
 *
 * PC1a canonica: `listEmployeesPaginated` ja opera apenas sobre
 * `employees` (nunca faz UNION com `cLevelMembers`). RH nao ve C-levels
 * nominalmente na listagem — comportamento canonico bit-exact preservado
 * do padrao MASTER_ESCOPO_B8 §3.3.
 */
export async function listarColaboradoresRHAction(
  companyIdIgnored: number,
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, 'listarColaboradoresRHAction');

  if (authed.kind === 'super_admin') {
    throw new Error(
      'listarColaboradoresRHAction: Super Admin deve usar rota /super-admin/empresa/[id]/…',
    );
  }
  const companyId = authed.companyId;
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    throw new Error('listarColaboradoresRHAction: companyId divergente da sessao.');
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

/**
 * ME-fila6 D1 — DOC 02 §10.4 + DOC 05 §14.10: refetch da listagem para
 * C-level `clevel_full` (C-level unico ou `acessoTotal=true`). CF
 * (`clevel_restricted`) e rejeitado. Escopo: empresa inteira da sessao.
 * Mesmo service da variante RH (lista apenas `employees`).
 */
export async function listarColaboradoresCLevelAction(
  companyIdIgnored: number,
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'platform' || session.role !== 'clevel') {
    throw new Error('listarColaboradoresCLevelAction: acesso restrito.');
  }
  const companyId = session.companyId;
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    throw new Error('listarColaboradoresCLevelAction: companyId divergente da sessao.');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null || menu.profileKey !== 'clevel_full') {
      throw new Error('listarColaboradoresCLevelAction: acesso restrito.');
    }
    const serviceInput = colaboradoresFiltersToServiceInput(filters);
    return await listEmployeesPaginated(client.db, companyId, serviceInput);
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// ME-fila5 D2 — actions canonicas do Item 5.5 (variantes RH)
// -----------------------------------------------------------------------

const SESSION_COOKIE_NAME = 'session' as const;

async function buildRHCallerContext(actionName: string) {
  const session = await getServerSession();
  const authed = requireRHOrSuperAdmin(session, actionName);
  if (authed.kind === 'super_admin') {
    throw new Error(`${actionName}: Super Admin deve usar rota /super-admin/empresa/[id]/…`);
  }
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
  return { ctx, client, companyId: authed.companyId };
}

/** §14.10 — ME-fila5 D2. Download template (variante RH). */
export async function downloadTemplateColaboradoresRHAction(
  companyIdIgnored: number,
): Promise<EmployeesDownloadResult> {
  const { ctx, client, companyId } = await buildRHCallerContext(
    'downloadTemplateColaboradoresRHAction',
  );
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    await closeDbClient(client);
    throw new Error('downloadTemplateColaboradoresRHAction: companyId divergente da sessao.');
  }
  try {
    const factory = createCallerFactory(createEmployeesRouter());
    const caller = factory(ctx);
    return await caller.downloadTemplate({ companyId });
  } finally {
    await closeDbClient(client);
  }
}

/** §14.10 — ME-fila5 D2. Export XLSX da lista atual (variante RH). */
export async function exportSpreadsheetColaboradoresRHAction(
  companyIdIgnored: number,
  filters: ColaboradoresFilters,
): Promise<EmployeesDownloadResult> {
  const { ctx, client, companyId } = await buildRHCallerContext(
    'exportSpreadsheetColaboradoresRHAction',
  );
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    await closeDbClient(client);
    throw new Error('exportSpreadsheetColaboradoresRHAction: companyId divergente da sessao.');
  }
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

/** §16.6 — ME-fila5 D2. Upload em massa (variante RH). */
export async function uploadCSVColaboradoresRHAction(
  companyIdIgnored: number,
  xlsxBase64: string,
): Promise<UploadCSVResult> {
  const { ctx, client, companyId } = await buildRHCallerContext('uploadCSVColaboradoresRHAction');
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    await closeDbClient(client);
    throw new Error('uploadCSVColaboradoresRHAction: companyId divergente da sessao.');
  }
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
