// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/app/super-admin/logs/responsavel-financeiro/page.tsx` (ME-070,
// padrao S366 CC068).
//
// Origem canonica S366 (ME-069/ME-070, CC068): Next 15 App Router
// aceita em `page.tsx` apenas `export default` + Route Segment Config
// + `generateMetadata`/`generateStaticParams`/`generateViewport`/
// `metadata`. Qualquer outro export publico faz `next build` reprovar.
//
// Segregacao canonica: tipos publicos consumidos por
// `RFLogsClient.tsx`/`actions.ts`/testes, funcoes de query de dados e
// helper de fallback migram para modulo irmao `internals.ts`.
//
// Este modulo preserva bit-exact os simbolos migrados da ME-057b.
// Zero mudanca de comportamento, autorizacao (Bruno §10.8), SQL ou
// payload.
//
// RV-13: cada export tem chamador:
// - `RFLogListRow` + `RFLogListResult` + `EmpresaOption` consumidos
//   por `./page.tsx`, `./RFLogsClient.tsx`, `./actions.ts` e
//   `tests/integration/me057b-logs.test.ts`.
// - `loadEmpresasList` + `loadRFLogsPage` consumidas por `./page.tsx`,
//   `./actions.ts` e teste.
// - `getRFCanonicalDefaultFilters` consumida por `./page.tsx`
//   (fallback quando Next 15 chama sem searchParams em contexto de
//   teste unit isolado) e teste.

import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { type RoipDatabase } from '../../../../db/client';
import {
  cLevelMembers,
  companies,
  employees,
  responsavelFinanceiroTransferLog,
  superAdmins,
} from '../../../../db/schema';
import type { RfEventType } from '../../../../db/schema/enums';

import { CANONICAL_RF_DEFAULT_FILTERS, resolvePeriodoRange, type RFLogsFilters } from './filters';

// -----------------------------------------------------------------------
// Aliases canonicos para LEFT JOIN polimorfico De/Para (RV-12).
// -----------------------------------------------------------------------

/** Alias `employees` para "De" quando previousHolderType='employee'. */
const deEmp = alias(employees, 'deEmp');
/** Alias `cLevelMembers` para "De" quando previousHolderType='cLevel'. */
const deCl = alias(cLevelMembers, 'deCl');
/** Alias `employees` para "Para" quando newHolderType='employee'. */
const paraEmp = alias(employees, 'paraEmp');
/** Alias `cLevelMembers` para "Para" quando newHolderType='cLevel'. */
const paraCl = alias(cLevelMembers, 'paraCl');

// -----------------------------------------------------------------------
// Tipos publicos do resultado
// -----------------------------------------------------------------------

/**
 * Linha canonica da tabela §14.20 (CC043 aplicada). Colunas em ordem:
 * Empresa, Data/hora, Tipo, De, Para, Justificativa (truncada UI),
 * Acao. Campo `executadoPor` viaja para consumo do modal `[Ver
 * detalhes]`.
 */
export interface RFLogListRow {
  readonly id: number;
  readonly createdAt: Date;
  readonly companyId: number;
  readonly companyDisplayName: string;
  readonly eventType: RfEventType;
  readonly deNome: string | null;
  readonly paraNome: string | null;
  readonly executadoPorNome: string;
  readonly reason: string;
}

export interface RFLogListResult {
  readonly rows: readonly RFLogListRow[];
  readonly totalCount: number;
  readonly filtersApplied: RFLogsFilters;
}

/** Opcao canonica do dropdown de empresa. */
export interface EmpresaOption {
  readonly id: number;
  readonly nomeFantasia: string;
}

// -----------------------------------------------------------------------
// Query canonica de empresas (dropdown)
// -----------------------------------------------------------------------

/**
 * Lista todas as empresas ativas para popular o dropdown de filtro
 * `Empresa`. Ordenacao alfabetica (`nomeFantasia ASC`).
 */
export async function loadEmpresasList(db: RoipDatabase): Promise<readonly EmpresaOption[]> {
  const rows = await db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
    })
    .from(companies)
    .orderBy(asc(companies.nomeFantasia));
  return rows;
}

// -----------------------------------------------------------------------
// Query canonica de logs RF (server-side, Drizzle tipado RV-12)
// -----------------------------------------------------------------------

/**
 * Carrega uma pagina do log de transferencias de RF aplicando os filtros
 * canonicos §14.20 (CC043). Fonte unica de query — invocada pelo server
 * component e por `listarRFLogsAction`.
 *
 * Resolucao polimorfica dos holders "De" e "Para":
 * - `previousHolderType = 'employee'` → nome via employees.id =
 *   previousHolderId.
 * - `previousHolderType = 'cLevel'` → nome via cLevelMembers.id =
 *   previousHolderId.
 * - `previousHolderType = 'none'` → NULL (representado como "—" na UI).
 * Idem para `newHolderType`.
 *
 * Nome do "Executado por" resolvido via superAdmins (FK real
 * actorSuperAdminId).
 */
export async function loadRFLogsPage(
  db: RoipDatabase,
  filters: RFLogsFilters,
): Promise<RFLogListResult> {
  const now = new Date();
  const range = resolvePeriodoRange(
    filters.periodo,
    filters.periodoPersonalizadoInicio,
    filters.periodoPersonalizadoFim,
    now,
  );

  const clauses = [];
  if (filters.empresaId !== null) {
    clauses.push(eq(responsavelFinanceiroTransferLog.companyId, filters.empresaId));
  }
  if (filters.eventType !== null) {
    clauses.push(eq(responsavelFinanceiroTransferLog.eventType, filters.eventType));
  }
  if (range.inicio !== null) {
    clauses.push(gte(responsavelFinanceiroTransferLog.createdAt, range.inicio));
  }
  if (range.fim !== null) {
    clauses.push(lte(responsavelFinanceiroTransferLog.createdAt, range.fim));
  }
  const whereExpr = clauses.length > 0 ? and(...clauses) : undefined;

  // LEFT JOINs polimorficos para holders via `alias()` tipado (RV-12).
  const rowsPromise = db
    .select({
      id: responsavelFinanceiroTransferLog.id,
      createdAt: responsavelFinanceiroTransferLog.createdAt,
      companyId: responsavelFinanceiroTransferLog.companyId,
      companyDisplayName: companies.nomeFantasia,
      eventType: responsavelFinanceiroTransferLog.eventType,
      previousHolderType: responsavelFinanceiroTransferLog.previousHolderType,
      previousHolderId: responsavelFinanceiroTransferLog.previousHolderId,
      newHolderType: responsavelFinanceiroTransferLog.newHolderType,
      newHolderId: responsavelFinanceiroTransferLog.newHolderId,
      deEmpNome: deEmp.name,
      deClNome: deCl.name,
      paraEmpNome: paraEmp.name,
      paraClNome: paraCl.name,
      executadoPorNome: superAdmins.name,
      reason: responsavelFinanceiroTransferLog.reason,
    })
    .from(responsavelFinanceiroTransferLog)
    .innerJoin(companies, eq(companies.id, responsavelFinanceiroTransferLog.companyId))
    .innerJoin(superAdmins, eq(superAdmins.id, responsavelFinanceiroTransferLog.actorSuperAdminId))
    .leftJoin(
      deEmp,
      and(
        eq(responsavelFinanceiroTransferLog.previousHolderType, 'employee'),
        eq(deEmp.id, responsavelFinanceiroTransferLog.previousHolderId),
      ),
    )
    .leftJoin(
      deCl,
      and(
        eq(responsavelFinanceiroTransferLog.previousHolderType, 'cLevel'),
        eq(deCl.id, responsavelFinanceiroTransferLog.previousHolderId),
      ),
    )
    .leftJoin(
      paraEmp,
      and(
        eq(responsavelFinanceiroTransferLog.newHolderType, 'employee'),
        eq(paraEmp.id, responsavelFinanceiroTransferLog.newHolderId),
      ),
    )
    .leftJoin(
      paraCl,
      and(
        eq(responsavelFinanceiroTransferLog.newHolderType, 'cLevel'),
        eq(paraCl.id, responsavelFinanceiroTransferLog.newHolderId),
      ),
    )
    .where(whereExpr)
    .orderBy(
      desc(responsavelFinanceiroTransferLog.createdAt),
      desc(responsavelFinanceiroTransferLog.id),
    )
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countPromise = db
    .select({ n: count() })
    .from(responsavelFinanceiroTransferLog)
    .where(whereExpr);

  const [rawRows, countRows] = await Promise.all([rowsPromise, countPromise]);

  const rows: RFLogListRow[] = rawRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt ?? new Date(0),
    companyId: r.companyId,
    companyDisplayName: r.companyDisplayName,
    eventType: r.eventType,
    deNome: r.deEmpNome ?? r.deClNome ?? null,
    paraNome: r.paraEmpNome ?? r.paraClNome ?? null,
    executadoPorNome: r.executadoPorNome,
    reason: r.reason,
  }));

  const totalCount = Number(countRows[0]?.n ?? 0);

  return { rows, totalCount, filtersApplied: filters };
}

// -----------------------------------------------------------------------
// Fallback canonico (Next 15 chama sem searchParams em contexto de
// teste unit isolado)
// -----------------------------------------------------------------------

export function getRFCanonicalDefaultFilters(): RFLogsFilters {
  return CANONICAL_RF_DEFAULT_FILTERS;
}
