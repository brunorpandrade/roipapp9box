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
//
// **RV-12.** Zero SQL cru — service tipado Drizzle.

'use server';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import {
  listEmployeesPaginated,
  type ListEmployeesResult,
} from '../../../../../server/services/employees';
import { getServerSession } from '../../../../../server/session/serverSession';

import { colaboradoresFiltersToServiceInput, type ColaboradoresFilters } from './filters';
import { resolveDatabaseUrl } from './internals';

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
