// ROIP APP 9BOX — server action de refetch da rota `/cadeia-indireta`
// (DOC 05 §14.12, ME-fila6 D1).
//
// Recalcula o acesso e o escopo a cada chamada (defense-in-depth): o
// cliente nao escolhe `companyId`, lider nem conjunto de ids.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import type { ListEmployeesResult } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';

import type { ColaboradoresFilters } from '../minha-equipe/filters';

import { listCadeiaIndireta, resolveCadeiaIndiretaAccess } from './internals';

export async function listarCadeiaIndiretaAction(
  companyIdIgnored: number,
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'platform') {
    throw new Error('listarCadeiaIndiretaAction: acesso restrito.');
  }
  const companyId = session.companyId;
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    throw new Error('listarCadeiaIndiretaAction: companyId divergente da sessao.');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const access = await resolveCadeiaIndiretaAccess(client.db, session);
    if (access === null) {
      throw new Error('listarCadeiaIndiretaAction: acesso restrito.');
    }
    return await listCadeiaIndireta(client.db, companyId, access.scopeEmployeeIds, filters);
  } finally {
    await closeDbClient(client);
  }
}
