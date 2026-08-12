// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/clevel/[cLevelId]/editar` (§13.3, ME-078a).
//
// Padrão S366 CC068. Loaders + parse + tipos consumidos pelo `page.tsx`
// server component e pelo `CLevelEditarClient` client component.
//
// Origem canônica:
// - CAMADA_UI §13.3 (Edição C-level integral) + mockup canônico
//   `edicao_clevel_v1.html`.
// - CAMADA_AUTH §10.9 (rota exclusiva Bruno) + §12 (RF exclusivo Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §16.3 (bloqueios de inativação)
//   + §16.4 (deleção canônica) + §16.7 (routers).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §4.6 (`employeeLeaderHistory`)
//   + §5.1 (`responsavelFinanceiroTransferLog`).
// - MASTER_ESCOPO_B8.md §2.1 + §3.5.
//
// **RV-13.** Todo export consumido: `parseCompanyIdParam` +
// `parseCLevelIdParam` + `resolveDatabaseUrl` + `loadCLevelEditarPage`
// → `page.tsx`; tipo `CLevelEditarPageData` → `page.tsx` +
// `CLevelEditarClient`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../../../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../../../../../../db/schema';
import {
  countActiveCLevelsForCompany,
  findCLevelById,
  type GetByIdCLevelResult,
} from '../../../../../../../server/routers/cLevelMembers';

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

export function parseCLevelIdParam(raw: string): number | null {
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
// Contagem de liderados diretos ativos (D8 aprovada ME-078a)
// -----------------------------------------------------------------------

/**
 * §13.3 + D8 canônica bit-exact — conta os liderados diretos ativos
 * vinculados ao C-level via `employeeLeaderHistory`. Consumido para
 * determinar se o botão `[Inativar C-level]` opera diretamente ou
 * exibe modal bloqueador "transferência disponível a partir da ME-078b".
 */
export async function countActiveLideradosDiretos(
  db: RoipDatabase,
  clevelId: number,
): Promise<number> {
  const rows = await db
    .select({ empId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.clevelId, clevelId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.status, 'ativo'),
      ),
    );
  return rows.length;
}

// -----------------------------------------------------------------------
// Tipo do page data
// -----------------------------------------------------------------------

export interface CLevelEditarPageData {
  readonly clevel: GetByIdCLevelResult;
  /** Contexto A canônico §13.3 — banner "único C-level cadastrado". */
  readonly isOnlyCLevel: boolean;
  /** RF atual da empresa (null quando empresa sem RF). */
  readonly currentRF: CurrentRFInfo | null;
  /** D8 canônica — quantos liderados diretos ativos. */
  readonly activeLideradosCount: number;
}

// -----------------------------------------------------------------------
// Loader canônico bit-exact
// -----------------------------------------------------------------------

export async function loadCLevelEditarPage(
  db: RoipDatabase,
  companyId: number,
  cLevelId: number,
): Promise<CLevelEditarPageData | null> {
  const clevel = await findCLevelById(db, cLevelId);
  if (clevel === null) {
    return null;
  }
  if (clevel.companyId !== companyId) {
    return null;
  }

  const [activeCount, currentRF, lideradosCount] = await Promise.all([
    countActiveCLevelsForCompany(db, companyId),
    findCurrentRF(db, companyId),
    countActiveLideradosDiretos(db, cLevelId),
  ]);

  return {
    clevel,
    isOnlyCLevel: activeCount <= 1,
    currentRF,
    activeLideradosCount: lideradosCount,
  };
}
