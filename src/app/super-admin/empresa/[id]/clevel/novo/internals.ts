// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/clevel/novo` (§13.2, ME-078a).
//
// Padrão S366 CC068. Loaders + parse + tipos consumidos pelo `page.tsx`
// server component e pelo `CLevelNovoClient` client component.
//
// Origem canônica:
// - CAMADA_UI §13.2 (Cadastro C-level integral).
// - CAMADA_AUTH §10.9 (rota exclusiva Bruno) + §12 (RF exclusivo Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §16.1 (Cadastro C-level canônico)
//   + §16.7 (routers).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §5.1
//   (`responsavelFinanceiroTransferLog`).
// - MASTER_ESCOPO_B8.md §2.1 + §3.5.
//
// **RV-13.** Todo export consumido: `parseCompanyIdParam` +
// `resolveDatabaseUrl` + `loadCLevelNovoPage` → `page.tsx`; tipo
// `CLevelNovoPageData` → `page.tsx` + `CLevelNovoClient`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../../../db/client';
import { cLevelMembers, employees } from '../../../../../../db/schema';
import { countActiveCLevelsForCompany } from '../../../../../../server/routers/cLevelMembers';

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Info canônica sobre o RF atual da empresa
// -----------------------------------------------------------------------

export interface CurrentRFInfo {
  readonly entityType: 'employee' | 'clevel';
  readonly entityId: number;
  readonly name: string;
}

/**
 * §5.5 canônica bit-exact — busca o Responsável financeiro atual da
 * empresa (união bit-exact de `employees` e `cLevelMembers` conforme
 * cardinalidade global máxima 1 por empresa). Retorna `null` quando
 * empresa sem RF. Consumido pelo loader da página `/clevel/novo` para
 * calibrar o toggle RF do form.
 */
export async function findCurrentRF(
  db: RoipDatabase,
  companyId: number,
): Promise<CurrentRFInfo | null> {
  const empRows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.isResponsavelFinanceiro, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);
  const empRow = empRows[0];
  if (empRow !== undefined) {
    return { entityType: 'employee', entityId: empRow.id, name: empRow.name };
  }

  const clRows = await db
    .select({ id: cLevelMembers.id, name: cLevelMembers.name })
    .from(cLevelMembers)
    .where(
      and(
        eq(cLevelMembers.companyId, companyId),
        eq(cLevelMembers.isResponsavelFinanceiro, true),
        eq(cLevelMembers.status, 'ativo'),
      ),
    )
    .limit(1);
  const clRow = clRows[0];
  if (clRow !== undefined) {
    return { entityType: 'clevel', entityId: clRow.id, name: clRow.name };
  }

  return null;
}

// -----------------------------------------------------------------------
// Tipo do page data
// -----------------------------------------------------------------------

export interface CLevelNovoPageData {
  /** Contexto A canônico bit-exact §13.2 — banner "primeiro C-level". */
  readonly isFirstCLevel: boolean;
  /** RF atual da empresa (null quando empresa sem RF). */
  readonly currentRF: CurrentRFInfo | null;
}

// -----------------------------------------------------------------------
// Loader canônico bit-exact
// -----------------------------------------------------------------------

export async function loadCLevelNovoPage(
  db: RoipDatabase,
  companyId: number,
): Promise<CLevelNovoPageData> {
  const [count, currentRF] = await Promise.all([
    countActiveCLevelsForCompany(db, companyId),
    findCurrentRF(db, companyId),
  ]);
  return {
    isFirstCLevel: count === 0,
    currentRF,
  };
}
