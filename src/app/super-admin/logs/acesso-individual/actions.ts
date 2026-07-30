// ROIP APP 9BOX — server actions /super-admin/logs/acesso-individual
// (Bruno) — ME-057b Bloco C.
//
// Origem canonica:
// - DOC 05 §14.22 subtitle Bruno + CC043.
// - DOC 02 §10.6 + §9.14 — guard Bruno defense-in-depth.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `listarDALLogsBrunoAction` → DALLogsBrunoClient.tsx (onChange
//     filtros + paginacao + dropdown Empresa), me057b-logs.test.ts.

'use server';

import { closeDbClient, createDbClient } from '../../../../db/client';
import {
  loadDataAccessLogPage,
  type DALFilters,
  type DALListResult,
} from '../../../../lib/logs/dataAccessLog';
import { getServerSession } from '../../../../server/session/serverSession';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Re-fetch canonico dos logs DAL para Bruno. Escopo canonico:
 * cross-empresa (`scopeCompanyId=null`). Dropdown Empresa aplica
 * filtro server-side via `filters.empresaId`.
 */
export async function listarDALLogsBrunoAction(filters: DALFilters): Promise<DALListResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'super_admin') {
    throw new Error('listarDALLogsBrunoAction: acesso restrito ao Super Admin (§9.14)');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await loadDataAccessLogPage(client.db, null, filters);
  } finally {
    await closeDbClient(client);
  }
}
