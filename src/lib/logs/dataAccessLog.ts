// ROIP APP 9BOX — helpers canonicos do log de acesso individual (ME-057b).
//
// Origem canonica:
// - DOC 05 §14.22 (Rota `/logs/acesso-individual` RH e
//   `/super-admin/logs/acesso-individual` Bruno) — mockup canonico
//   `log_acesso_individual_v1.html`.
// - CC043 (canonizada em ME-057b) — mockup prevalece sobre texto §14.22.
//   Consequencias bit-exact: (i) ordem de colunas
//   "Data/hora · Agente · Titular · Tipo de acesso · Contexto";
//   (ii) coluna 5 chama-se "Contexto" (bate com schema DOC 01 §14.2);
//   (iii) busca unificada em 1 campo (nome do titular OU CPF OU nome
//   do agente); (iv) label do default do dropdown de tipo de acesso e
//   "Todos os tipos de acesso"; (v) periodo via date-range picker
//   inline (dois inputs date HTML nativos).
// - DOC 01 §14.2 (`dataAccessLog`) — coluna `contexto` VARCHAR(255).
//   Agente polimorfico padrao B (agentType + agentId sem FK formal).
// - DOC 02 §10.6 (matriz — `/logs/acesso-individual` RH e RH-Lider;
//   `/super-admin/logs/acesso-individual` Bruno cross-empresa via
//   dropdown Empresa).
// - S313: faixa CNPJ ME-057b principal 10130..139; auxiliar 10140..149.
//
// Contrato canonico:
// - `parseDALFiltersFromSearchParams` — parseamento tolerante a
//   `Record<string, string | string[] | undefined>` (Next 15) para
//   `DALFilters`. Filtros ausentes / invalidos caem no default canonico.
// - `loadDataAccessLogPage` — query Drizzle tipada (RV-12) com filtros +
//   paginacao + count total. Recebe `scopeCompanyId: number | null` —
//   quando NULL, escopo cross-empresa (Bruno); quando number, escopo
//   filtrado a essa empresa (RH ou Bruno selecionando pelo dropdown).
// - `resolveTipoAcessoLabel` — mapeamento canonico enum → label UI
//   (`Dashboard individual`, `Relatorio do Perfil Individual`,
//   `Exportacao em planilha`).
// - `normalizeSearchTitularAgente` — normaliza busca unificada, trim,
//   min 2 / max 100 chars (padrao ME-057a).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `DALFilters` (tipo) → consumido por page.tsx RH e Bruno,
//     actions.ts RH e Bruno, `dal-filters.test.ts`.
//   - `CANONICAL_DAL_DEFAULT_FILTERS` → consumido por
//     `parseDALFiltersFromSearchParams` (mesmo arquivo), page.tsx RH e
//     Bruno, `dal-filters.test.ts`.
//   - `parseDALFiltersFromSearchParams` → page.tsx RH e Bruno,
//     `dal-filters.test.ts`.
//   - `normalizeSearchTitularAgente` → `dal-filters.test.ts` e usado
//     internamente por `loadDataAccessLogPage` via
//     `parseDALFiltersFromSearchParams`.
//   - `loadDataAccessLogPage` → page.tsx RH e Bruno, actions.ts RH e
//     Bruno, `me057b-logs.test.ts` (integration).
//   - `resolveTipoAcessoLabel` → `DALLogsClient.tsx`,
//     `DALLogsBrunoClient.tsx`, `dal-filters.test.ts`.
//   - `DALListResult`, `DALListRow` (tipos) → page.tsx RH e Bruno,
//     actions.ts, clients.

import { and, count, desc, eq, gte, like, lte, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, companies, dataAccessLog, employees, superAdmins } from '../../db/schema';
import type { TipoAcesso } from '../../db/schema/enums';
import { TIPO_ACESSO_VALUES } from '../../db/schema/enums';

/**
 * Alias canonico de `employees` para uso como agente polimorfico
 * (`agentType='rh'|'lider'`) em LEFT JOIN — precisa ser distinto do JOIN
 * base do titular. RV-12: Drizzle `alias()` mantem tipagem completa.
 */
const agentEmp = alias(employees, 'agentEmp');

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Estado canonico dos filtros da rota. Todos os campos opcionais — filtro
 * ausente equivale a "sem restricao". `search` unificado em uma unica
 * string (CC043 — mockup canonico usa 1 campo de busca).
 */
export interface DALFilters {
  readonly search: string | null;
  readonly tipoAcesso: TipoAcesso | null;
  readonly periodoInicio: Date | null;
  readonly periodoFim: Date | null;
  readonly empresaId: number | null;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}

export const CANONICAL_DAL_DEFAULT_FILTERS: DALFilters = {
  search: null,
  tipoAcesso: null,
  periodoInicio: null,
  periodoFim: null,
  empresaId: null,
  page: 1,
  pageSize: 25,
};

/** Linha canonica da tabela renderizada §14.22 (CC043 aplicada). */
export interface DALListRow {
  readonly id: number;
  readonly createdAt: Date;
  readonly agentType: 'super_admin' | 'rh' | 'lider' | 'clevel';
  readonly agentId: number;
  readonly agentName: string;
  readonly titularEmployeeId: number;
  readonly titularName: string;
  readonly titularCpf: string;
  readonly tipoAcesso: TipoAcesso;
  readonly contexto: string | null;
  readonly companyId: number;
  readonly companyDisplayName: string;
}

export interface DALListResult {
  readonly rows: readonly DALListRow[];
  readonly totalCount: number;
  readonly filtersApplied: DALFilters;
}

// -----------------------------------------------------------------------
// Mapeamento canonico enum → label UI (CC043 aplicada)
// -----------------------------------------------------------------------

/**
 * Labels canonicos §14.22 (bit-exact ao mockup + linhas 2585 do DOC 05).
 * Consumido pelo dropdown de filtro (com prefixo "Todos os tipos de
 * acesso") e pela renderizacao de badge da tabela.
 */
const TIPO_ACESSO_LABEL: Readonly<Record<TipoAcesso, string>> = {
  dashboard_individual: 'Dashboard individual',
  relatorio_perfil_individual: 'Relatório do Perfil Individual',
  exportacao_planilha: 'Exportação em planilha',
};

export function resolveTipoAcessoLabel(tipo: TipoAcesso): string {
  return TIPO_ACESSO_LABEL[tipo];
}

/** Label canonico do default do dropdown (CC043 — texto do mockup). */
export const TIPO_ACESSO_LABEL_TODOS = 'Todos os tipos de acesso';

// -----------------------------------------------------------------------
// Normalizadores canonicos
// -----------------------------------------------------------------------

/**
 * Normaliza a busca unificada (CC043 — 1 campo). Retorna:
 *   - null se input <2 chars (trim aplicado, incluindo string vazia).
 *   - string truncada em 100 chars caso exceda.
 *
 * O componente de UI e responsavel por validar min-length antes de
 * disparar (spec canonica ME-057a §14.19). Backend aceita null como
 * "sem filtro de busca".
 */
export function normalizeSearchTitularAgente(input: string | null): string | null {
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed.length < 2) return null;
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

// -----------------------------------------------------------------------
// Parse canonico dos filtros a partir de searchParams
// -----------------------------------------------------------------------

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseTipoAcesso(raw: string | undefined): TipoAcesso | null {
  if (raw === undefined || raw === '') return null;
  if ((TIPO_ACESSO_VALUES as readonly string[]).includes(raw)) {
    return raw as TipoAcesso;
  }
  return null;
}

function parseDateOrNull(raw: string | undefined): Date | null {
  if (raw === undefined || raw === '') return null;
  // Aceita formatos YYYY-MM-DD ou ISO 8601 completos. Rejeita silenciosamente
  // qualquer coisa que nao parseie (retorna null).
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePageSize(raw: string | undefined): 25 | 50 | 100 {
  const n = parseIntOrNull(raw);
  if (n === 25 || n === 50 || n === 100) return n;
  return 25;
}

function parsePage(raw: string | undefined): number {
  const n = parseIntOrNull(raw);
  if (n === null || n < 1) return 1;
  return n;
}

/**
 * Parse tolerante a `searchParams` do Next 15. Sempre retorna um
 * `DALFilters` valido — nunca lanca. Chaves canonicas aceitas:
 *   - `q` (busca unificada — titular ou CPF ou agente).
 *   - `tipo` (enum `TipoAcesso`).
 *   - `de` (data inicio ISO ou YYYY-MM-DD).
 *   - `ate` (data fim ISO ou YYYY-MM-DD).
 *   - `empresa` (int positivo — apenas Bruno consome).
 *   - `page` (int positivo, default 1).
 *   - `pageSize` (25 | 50 | 100, default 25).
 */
export function parseDALFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): DALFilters {
  return {
    search: normalizeSearchTitularAgente(pickFirst(params.q) ?? null),
    tipoAcesso: parseTipoAcesso(pickFirst(params.tipo)),
    periodoInicio: parseDateOrNull(pickFirst(params.de)),
    periodoFim: parseDateOrNull(pickFirst(params.ate)),
    empresaId: parseIntOrNull(pickFirst(params.empresa)),
    page: parsePage(pickFirst(params.page)),
    pageSize: parsePageSize(pickFirst(params.pageSize)),
  };
}

// -----------------------------------------------------------------------
// Query canonica da lista (server-side, Drizzle tipado RV-12)
// -----------------------------------------------------------------------

/**
 * Carrega uma pagina do log de acesso individual aplicando os filtros
 * canonicos §14.22 (CC043 aplicada). Fonte unica de query — invocada
 * tanto pelo server component (renderizacao inicial) quanto pelo
 * `listarDALAction` (re-fetch em mudancas de filtro/paginacao).
 *
 * Convencao canonica:
 * - `scopeCompanyId: number | null` e o guard obrigatorio de escopo.
 *   Quando number, restringe a essa empresa (RH consumindo propria
 *   empresa; ou Bruno tendo selecionado uma empresa no dropdown).
 *   Quando null, cross-empresa (Bruno sem filtro de empresa).
 * - Busca unificada (`search`): OR entre `employees.name` do titular,
 *   `employees.cpf` do titular e nome do agente resolvido conforme
 *   `agentType` (`superAdmins.name`, `employees.name` ou
 *   `cLevelMembers.name`). LEFT JOIN polimorfico canonico padrao B.
 * - Filtro de `tipoAcesso` traduz enum ao WHERE canonico.
 * - Filtros de `periodoInicio` e `periodoFim` aplicam range em
 *   `createdAt` (>= inicio; <= fim). Fim exclusivo no dia (< inicio_de_
 *   dia_seguinte) fica a cargo do consumidor.
 * - Ordenacao canonica: `createdAt DESC, id DESC` (mais recente
 *   primeiro; ID como desempate deterministico).
 * - Paginacao server-side: LIMIT `pageSize` OFFSET `(page-1)*pageSize`.
 */
export async function loadDataAccessLogPage(
  db: RoipDatabase,
  scopeCompanyId: number | null,
  filters: DALFilters,
): Promise<DALListResult> {
  const clauses = [];
  if (scopeCompanyId !== null) {
    clauses.push(eq(dataAccessLog.companyId, scopeCompanyId));
  } else if (filters.empresaId !== null) {
    // Bruno cross-empresa que aplicou o dropdown de empresa.
    clauses.push(eq(dataAccessLog.companyId, filters.empresaId));
  }
  if (filters.tipoAcesso !== null) {
    clauses.push(eq(dataAccessLog.tipoAcesso, filters.tipoAcesso));
  }
  if (filters.periodoInicio !== null) {
    clauses.push(gte(dataAccessLog.createdAt, filters.periodoInicio));
  }
  if (filters.periodoFim !== null) {
    clauses.push(lte(dataAccessLog.createdAt, filters.periodoFim));
  }
  if (filters.search !== null) {
    const pattern = `%${filters.search}%`;
    // Busca unificada CC043 (RV-12): casa nome titular OU CPF titular OU
    // nome do agente (resolvido via LEFT JOINs polimorficos abaixo). Cada
    // LEFT JOIN retorna NULL quando agentType nao casa; LIKE(NULL, x) e
    // NULL/false em MySQL, entao a semantica OR e preservada 100% tipada.
    clauses.push(
      or(
        like(employees.name, pattern),
        like(employees.cpf, pattern),
        like(superAdmins.name, pattern),
        like(cLevelMembers.name, pattern),
        like(agentEmp.name, pattern),
      )!,
    );
  }
  const whereExpr = clauses.length > 0 ? and(...clauses) : undefined;

  // LEFT JOIN polimorfico do agente: apenas UMA das 3 tabelas casara
  // conforme `agentType`. Alias `agentEmp` para `employees` distinto do
  // titular (`employees` base do titular) — via `alias()` tipado (RV-12).
  const rowsPromise = db
    .select({
      id: dataAccessLog.id,
      createdAt: dataAccessLog.createdAt,
      agentType: dataAccessLog.agentType,
      agentId: dataAccessLog.agentId,
      agentSuperAdminName: superAdmins.name,
      agentClevelName: cLevelMembers.name,
      agentEmpName: agentEmp.name,
      titularEmployeeId: dataAccessLog.titularEmployeeId,
      titularName: employees.name,
      titularCpf: employees.cpf,
      tipoAcesso: dataAccessLog.tipoAcesso,
      contexto: dataAccessLog.contexto,
      companyId: dataAccessLog.companyId,
      companyDisplayName: companies.nomeFantasia,
    })
    .from(dataAccessLog)
    .innerJoin(employees, eq(employees.id, dataAccessLog.titularEmployeeId))
    .innerJoin(companies, eq(companies.id, dataAccessLog.companyId))
    .leftJoin(
      superAdmins,
      and(eq(dataAccessLog.agentType, 'super_admin'), eq(superAdmins.id, dataAccessLog.agentId)),
    )
    .leftJoin(
      cLevelMembers,
      and(eq(dataAccessLog.agentType, 'clevel'), eq(cLevelMembers.id, dataAccessLog.agentId)),
    )
    .leftJoin(
      agentEmp,
      and(
        or(eq(dataAccessLog.agentType, 'rh'), eq(dataAccessLog.agentType, 'lider')),
        eq(agentEmp.id, dataAccessLog.agentId),
      ),
    )
    .where(whereExpr)
    .orderBy(desc(dataAccessLog.createdAt), desc(dataAccessLog.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countPromise = db
    .select({ n: count() })
    .from(dataAccessLog)
    .innerJoin(employees, eq(employees.id, dataAccessLog.titularEmployeeId))
    .leftJoin(
      superAdmins,
      and(eq(dataAccessLog.agentType, 'super_admin'), eq(superAdmins.id, dataAccessLog.agentId)),
    )
    .leftJoin(
      cLevelMembers,
      and(eq(dataAccessLog.agentType, 'clevel'), eq(cLevelMembers.id, dataAccessLog.agentId)),
    )
    .leftJoin(
      agentEmp,
      and(
        or(eq(dataAccessLog.agentType, 'rh'), eq(dataAccessLog.agentType, 'lider')),
        eq(agentEmp.id, dataAccessLog.agentId),
      ),
    )
    .where(whereExpr);

  const [rawRows, countRows] = await Promise.all([rowsPromise, countPromise]);

  const rows: DALListRow[] = rawRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt ?? new Date(0),
    agentType: r.agentType,
    agentId: r.agentId,
    agentName: r.agentSuperAdminName ?? r.agentClevelName ?? r.agentEmpName ?? '(agente removido)',
    titularEmployeeId: r.titularEmployeeId,
    titularName: r.titularName,
    titularCpf: r.titularCpf,
    tipoAcesso: r.tipoAcesso,
    contexto: r.contexto,
    companyId: r.companyId,
    companyDisplayName: r.companyDisplayName,
  }));

  const totalCount = Number(countRows[0]?.n ?? 0);

  return { rows, totalCount, filtersApplied: filters };
}
