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
//
// **RV-12.** Zero SQL cru — service tipado Drizzle.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { closeDbClient, createDbClient } from '../../db/client';
import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin';
import { listEmployeesPaginated, type ListEmployeesResult } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';

import { colaboradoresFiltersToServiceInput, type ColaboradoresFilters } from './filters';
import { resolveDatabaseUrl } from './internals';

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

  // Escopo canonico bit-exact: RH usa companyId da sessao; super_admin
  // chegando aqui (uso indevido — rota canonica dele e super-admin)
  // recebe FORBIDDEN via `assertCompanyScope` do service se `companyId
  // Ignored` divergir. Preserva contrato do refetchAction
  // (`(companyId, filters) => Promise<Result>`).
  if (authed.kind === 'super_admin') {
    throw new Error(
      'listarColaboradoresRHAction: Super Admin deve usar rota /super-admin/empresa/[id]/…',
    );
  }
  const companyId = authed.companyId;
  // Validacao paranoica: se o cliente enviou companyId diferente do
  // canonico da sessao, aborta. Guard defense-in-depth.
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
