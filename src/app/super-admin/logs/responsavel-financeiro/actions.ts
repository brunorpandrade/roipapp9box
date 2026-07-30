// ROIP APP 9BOX — server actions /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A).
//
// Origem canonica:
// - DOC 05 §14.20 + CC043 — re-fetch via server action quando o cliente
//   altera filtros/paginacao.
// - DOC 02 §10.8 + §9.12 — guard Bruno defense-in-depth.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `listarRFLogsAction` → RFLogsClient.tsx (onChange filtros +
//     paginacao), me057b-logs.test.ts.

'use server';

import { closeDbClient, createDbClient } from '../../../../db/client';
import { getServerSession } from '../../../../server/session/serverSession';

import { loadRFLogsPage, type RFLogListResult } from './page';
import { type RFLogsFilters } from './filters';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Re-fetch canonico dos logs RF em mudanca de filtro ou paginacao. Guard
 * Bruno defense-in-depth ao middleware.
 */
export async function listarRFLogsAction(filters: RFLogsFilters): Promise<RFLogListResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'super_admin') {
    throw new Error('listarRFLogsAction: acesso restrito ao Super Admin (§9.12)');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await loadRFLogsPage(client.db, filters);
  } finally {
    await closeDbClient(client);
  }
}
