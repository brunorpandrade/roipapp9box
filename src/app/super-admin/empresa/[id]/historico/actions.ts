// ROIP APP 9BOX — server actions /super-admin/empresa/[id]/historico
// (ME-057c Bloco A — Historico da empresa §14.21).
//
// Origem canonica:
// - DOC 05 §14.21 — re-fetch via server action quando o cliente altera
//   filtros/paginacao.
// - DOC 02 §10.3 + §9.1 — guard Bruno defense-in-depth. `/super-admin/
//   empresa/*` (matchPrefix) e restrito a `super_admin` no middleware;
//   este action revalida `session.kind` como defense-in-depth (S317
//   canonizada em ME-057b).
// - S299/S315/S325: 1 conversa = 1 sub-ME = 1 commit; ator canonico
//   literal quando aplicavel (S322).
//
// Contrato canonico:
// - `listarHistoricoAction(companyId, filters)` — retorna
//   `HistoryLoadResult`. Guard Bruno + guard existencia da empresa
//   (S323 preserva cross-tenant safety).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `listarHistoricoAction` → `HistoricoClient.tsx` (onChange filtros
//     + paginacao), `me057c-historico.test.ts`.

'use server';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import {
  findCompanyDisplayInfo,
  loadCompanyHistoryPage,
  type HistoryLoadResult,
} from '../../../../../lib/logs/companyHistoryLog';
import { getServerSession } from '../../../../../server/session/serverSession';

import { type HistoricoFilters } from './filters';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Re-fetch canonico do historico consolidado em mudanca de filtro ou
 * paginacao. Guard Bruno defense-in-depth ao middleware `/super-admin/
 * empresa/*`. Cross-tenant safe: sem `companyId` valido, throw
 * imediato antes de qualquer query.
 */
export async function listarHistoricoAction(
  companyId: number,
  filters: HistoricoFilters,
): Promise<HistoryLoadResult> {
  const session = await getServerSession();
  if (session === null || session.kind !== 'super_admin') {
    throw new Error('listarHistoricoAction: acesso restrito ao Super Admin (§9.1 / §10.3)');
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('listarHistoricoAction: companyId invalido');
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      throw new Error(`listarHistoricoAction: empresa ${companyId} nao encontrada`);
    }
    return await loadCompanyHistoryPage(client.db, companyId, filters);
  } finally {
    await closeDbClient(client);
  }
}
