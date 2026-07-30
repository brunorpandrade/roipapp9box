// ROIP APP 9BOX — server actions /logs/acesso-individual (RH) —
// ME-057b Bloco B.
//
// Origem canonica:
// - DOC 05 §14.22 + CC043.
// - DOC 02 §10.6 + §9.14 — guard RH puro + RH-Lider C1/C2
//   defense-in-depth.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `listarDALLogsRHAction` → DALLogsClient.tsx (onChange filtros +
//     paginacao), me057b-logs.test.ts.

'use server';

import { closeDbClient, createDbClient } from '../../../db/client';
import {
  loadDataAccessLogPage,
  type DALFilters,
  type DALListResult,
} from '../../../lib/logs/dataAccessLog';
import { getServerSession } from '../../../server/session/serverSession';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Re-fetch canonico dos logs DAL para RH. Escopo canonico: propria
 * empresa. Guard §10.6 + §9.14 defense-in-depth.
 */
export async function listarDALLogsRHAction(filters: DALFilters): Promise<DALListResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'platform') {
    throw new Error('listarDALLogsRHAction: acesso restrito a RH (§9.14)');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    throw new Error('listarDALLogsRHAction: acesso restrito a RH (§9.14)');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await loadDataAccessLogPage(client.db, session.companyId, filters);
  } finally {
    await closeDbClient(client);
  }
}
