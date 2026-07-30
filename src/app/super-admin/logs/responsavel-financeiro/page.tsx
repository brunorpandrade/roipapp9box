// ROIP APP 9BOX — rota canonica /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A).
//
// Origem canonica:
// - DOC 05 §14.20 (Rota) + mockup canonico + CC043 (aprovada em
//   ME-057b) — mockup prevalece: colunas em ordem "Empresa, Data/hora,
//   Tipo, De, Para, Justificativa, Acao"; "Executado por" no modal.
// - DOC 02 §10.8 + §9.12 (matriz — exclusivo Bruno; middleware ja
//   aplica; este page.tsx faz guard defensivo defense-in-depth).
// - DOC 01 §14 (`responsavelFinanceiroTransferLog`) + M002.
// - S299/S313: faixa CNPJ ME-057b principal 10130..139 (test); esta
//   pagina em runtime nao restringe por CNPJ, apenas por acesso Bruno.
// - Pattern ME-056/ME-057a reutilizado bit-exact.
//
// Contrato canonico:
// - Server component: query inicial (primeira pagina) + lista de
//   empresas para popular o dropdown. Client component
//   (`RFLogsClient.tsx`) recebe esses valores como initial state e
//   consome `listarRFLogsAction` para re-fetch em mudanca de filtro
//   ou paginacao.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `RFLogListRow`, `RFLogListResult`, `EmpresaOption` (tipos) →
//     RFLogsClient.tsx, actions.ts, tests.
//   - `loadRFLogsPage` → actions.ts (re-fetch), me057b-logs.test.ts.
//   - `loadEmpresasList` → page.tsx (mesmo arquivo — chamador local),
//     actions.ts, me057b-logs.test.ts.
//   - default export → runtime Next 15.

import { redirect } from 'next/navigation';
import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../../../db/client';
import {
  cLevelMembers,
  companies,
  employees,
  responsavelFinanceiroTransferLog,
  superAdmins,
} from '../../../../db/schema';
import type { RfEventType } from '../../../../db/schema/enums';
import { COLORS } from '../../../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

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

import { RFLogsClient } from './RFLogsClient';
import {
  CANONICAL_RF_DEFAULT_FILTERS,
  parseRFFiltersFromSearchParams,
  resolvePeriodoRange,
  type RFLogsFilters,
} from './filters';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

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
// Rota canonica /super-admin/logs/responsavel-financeiro (§14.20)
// -----------------------------------------------------------------------

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RFLogsPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard §10.8 + §9.12 (defense-in-depth ao middleware — matrix.ts).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseRFFiltersFromSearchParams(rawParams);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const [empresas, listResult] = await Promise.all([
      loadEmpresasList(client.db),
      loadRFLogsPage(client.db, filters),
    ]);

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'super_admin_global',
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: 0,
              }}
            >
              Logs de Responsável financeiro
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
              aria-live="polite"
            >
              {listResult.totalCount} eventos
            </p>
          </div>
          <RFLogsClient initialResult={listResult} initialFilters={filters} empresas={empresas} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Fallback canonico (Next 15 chama sem searchParams em contexto de
// teste unit isolado)
// -----------------------------------------------------------------------

export function getRFCanonicalDefaultFilters(): RFLogsFilters {
  return CANONICAL_RF_DEFAULT_FILTERS;
}
