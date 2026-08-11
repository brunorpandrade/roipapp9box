// ROIP APP 9BOX — filters canonicos /super-admin/empresa/[id]/todos-os-
// colaboradores (§14.10 + §20, ME-076).
//
// Origem canonica:
// - CAMADA_UI §14.10 — 7 filtros base + busca global + 8o filtro dropdown
//   "Papel funcional" (§20).
// - Mockup canonico `painel_principal_fase7_v5.html` (base) + delta
//   canonico bit-exact `delta_todos_colaboradores_v2.html` (badges L/RH/RF
//   + 8o filtro).
// - CAMADA_UI §14.10 linha canonica: "Status (Ativo / Inativo / Todos —
//   default Ativo) — S416".
// - CAMADA_UI §14.10 linha canonica: "Paginacao server-side com seletor
//   25/50/100 (default 50)".
//
// Contrato canonico:
// - `ColaboradoresFilters` — estado dos 8 filtros + busca + paginacao +
//   ordenacao.
// - `CANONICAL_COLABORADORES_DEFAULT_FILTERS` — valores default §14.10
//   (Status = ativo, papel = todos, page 1, pageSize 50, sortBy = name asc).
// - `parseColaboradoresFiltersFromSearchParams` — parse tolerante Next 15.
//
// **RV-13.** Cada export tem chamador na propria ME:
// - `ColaboradoresFilters` (tipo) → `page.tsx`, `actions.ts`,
//   `TodosColaboradoresClient.tsx`, testes.
// - `CANONICAL_COLABORADORES_DEFAULT_FILTERS` → `page.tsx` (fallback),
//   testes.
// - `parseColaboradoresFiltersFromSearchParams` → `page.tsx`, testes.
// - `BUSCA_MAX_LEN` → `TodosColaboradoresClient.tsx`.

import {
  DEPARTAMENTO_VALUES,
  JOB_FAMILY_VALUES,
  NIVEL_HIERARQUICO_VALUES,
  type Departamento,
  type JobFamily,
  type NivelHierarquico,
} from '../../../../../db/schema';
import {
  LIST_EMPLOYEES_SORT_FIELDS,
  LIST_EMPLOYEES_SORT_ORDERS,
  PAPEL_FUNCIONAL_VALUES,
  type ListEmployeesFilters,
  type ListEmployeesPageSize,
  type ListEmployeesSortField,
  type ListEmployeesSortOrder,
  type PapelFuncional,
} from '../../../../../server/services/employees';

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact
// -----------------------------------------------------------------------

/** §14.10 — limite canonico bit-exact do input de busca global. */
export const BUSCA_MAX_LEN = 200;

/**
 * §14.10 — status canonicos bit-exact do filtro "Status" (linha 4 dos
 * filtros §14.10). Ordem canonica bit-exact preservada.
 */
export const STATUS_FILTER_VALUES = ['ativo', 'inativo', 'todos'] as const;
export type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

/**
 * §14.10 — senioridade canonica bit-exact do filtro "Senioridade" (linha
 * 5 dos filtros §14.10).
 */
export const SENIORIDADE_FILTER_VALUES = ['junior', 'pleno', 'senior'] as const;
export type SenioridadeFilterValue = (typeof SENIORIDADE_FILTER_VALUES)[number];

// -----------------------------------------------------------------------
// Tipo canonico bit-exact do estado dos filtros
// -----------------------------------------------------------------------

/**
 * §14.10 — estado canonico bit-exact dos 8 filtros + busca global +
 * paginacao + ordenacao. Espelha `ListEmployeesFilters` do service com
 * a diferenca de que `dataAdmissao*` e `dataCadastro*` sao serializados
 * como ISO string no wire (parse convert to `Date`). Aqui ja usamos
 * `Date | null` para consumo direto do service.
 */
export interface ColaboradoresFilters {
  readonly busca: string;
  readonly departamento: Departamento | null;
  readonly liderId: number | null;
  readonly nivelHierarquico: NivelHierarquico | null;
  readonly status: StatusFilterValue;
  readonly senioridade: SenioridadeFilterValue | null;
  readonly jobFamily: JobFamily | null;
  readonly dataAdmissaoInicio: Date | null;
  readonly dataAdmissaoFim: Date | null;
  readonly dataCadastroInicio: Date | null;
  readonly dataCadastroFim: Date | null;
  readonly papelFuncional: PapelFuncional;
  readonly sortBy: ListEmployeesSortField;
  readonly sortOrder: ListEmployeesSortOrder;
  readonly page: number;
  readonly pageSize: ListEmployeesPageSize;
}

/**
 * §14.10 — defaults canonicos bit-exact: Status = "ativo" (S416 canonica
 * bit-exact), papelFuncional = "todos", ordenacao por nome ascendente,
 * page 1, pageSize 50 (default canonico bit-exact do dropdown §14.10).
 */
export const CANONICAL_COLABORADORES_DEFAULT_FILTERS: ColaboradoresFilters = {
  busca: '',
  departamento: null,
  liderId: null,
  nivelHierarquico: null,
  status: 'ativo',
  senioridade: null,
  jobFamily: null,
  dataAdmissaoInicio: null,
  dataAdmissaoFim: null,
  dataCadastroInicio: null,
  dataCadastroFim: null,
  papelFuncional: 'todos',
  sortBy: 'name',
  sortOrder: 'asc',
  page: 1,
  pageSize: 50,
};

// -----------------------------------------------------------------------
// Parse tolerante de searchParams (Next 15)
// -----------------------------------------------------------------------

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function normalizeBusca(raw: string | undefined): string {
  if (raw === undefined) return '';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length > BUSCA_MAX_LEN) return trimmed.slice(0, BUSCA_MAX_LEN);
  return trimmed;
}

function parseDepartamento(raw: string | undefined): Departamento | null {
  if (raw === undefined || raw === '') return null;
  if ((DEPARTAMENTO_VALUES as readonly string[]).includes(raw)) {
    return raw as Departamento;
  }
  return null;
}

function parseNivelHierarquico(raw: string | undefined): NivelHierarquico | null {
  if (raw === undefined || raw === '') return null;
  if ((NIVEL_HIERARQUICO_VALUES as readonly string[]).includes(raw)) {
    return raw as NivelHierarquico;
  }
  return null;
}

function parseStatus(raw: string | undefined): StatusFilterValue {
  if (raw === undefined || raw === '') return 'ativo';
  if ((STATUS_FILTER_VALUES as readonly string[]).includes(raw)) {
    return raw as StatusFilterValue;
  }
  return 'ativo';
}

function parseSenioridade(raw: string | undefined): SenioridadeFilterValue | null {
  if (raw === undefined || raw === '') return null;
  if ((SENIORIDADE_FILTER_VALUES as readonly string[]).includes(raw)) {
    return raw as SenioridadeFilterValue;
  }
  return null;
}

function parseJobFamily(raw: string | undefined): JobFamily | null {
  if (raw === undefined || raw === '') return null;
  if ((JOB_FAMILY_VALUES as readonly string[]).includes(raw)) {
    return raw as JobFamily;
  }
  return null;
}

function parsePapelFuncional(raw: string | undefined): PapelFuncional {
  if (raw === undefined || raw === '') return 'todos';
  if ((PAPEL_FUNCIONAL_VALUES as readonly string[]).includes(raw)) {
    return raw as PapelFuncional;
  }
  return 'todos';
}

function parseSortBy(raw: string | undefined): ListEmployeesSortField {
  if (raw === undefined || raw === '') return 'name';
  if ((LIST_EMPLOYEES_SORT_FIELDS as readonly string[]).includes(raw)) {
    return raw as ListEmployeesSortField;
  }
  return 'name';
}

function parseSortOrder(raw: string | undefined): ListEmployeesSortOrder {
  if (raw === undefined || raw === '') return 'asc';
  if ((LIST_EMPLOYEES_SORT_ORDERS as readonly string[]).includes(raw)) {
    return raw as ListEmployeesSortOrder;
  }
  return 'asc';
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseDateOrNull(raw: string | undefined): Date | null {
  if (raw === undefined || raw === '') return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parsePageSize(raw: string | undefined): ListEmployeesPageSize {
  const n = parseIntOrNull(raw);
  if (n === 25 || n === 50 || n === 100) return n;
  return 50;
}

function parsePage(raw: string | undefined): number {
  const n = parseIntOrNull(raw);
  if (n === null || n < 1) return 1;
  return n;
}

/**
 * §14.10 — parse tolerante de searchParams (Next 15). Chaves canonicas
 * bit-exact:
 *   - `q` (busca global — normalizada com trim + cap `BUSCA_MAX_LEN`).
 *   - `dept` (departamento — enum §15.1).
 *   - `lider` (liderId — inteiro positivo).
 *   - `nivel` (nivelHierarquico — enum §15.3).
 *   - `status` (`ativo | inativo | todos`, default `ativo`).
 *   - `senior` (senioridade — enum).
 *   - `familia` (jobFamily — enum §15.3).
 *   - `admDe`, `admAte` (data admissao inicio/fim — ISO date).
 *   - `cadDe`, `cadAte` (data cadastro inicio/fim — ISO date).
 *   - `papel` (`todos | lider | rh | respfin | sem_papel`, §20).
 *   - `sortBy`, `sortOrder`, `page`, `pageSize` (padroes canonicos).
 */
export function parseColaboradoresFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ColaboradoresFilters {
  return {
    busca: normalizeBusca(pickFirst(params.q)),
    departamento: parseDepartamento(pickFirst(params.dept)),
    liderId: parseIntOrNull(pickFirst(params.lider)),
    nivelHierarquico: parseNivelHierarquico(pickFirst(params.nivel)),
    status: parseStatus(pickFirst(params.status)),
    senioridade: parseSenioridade(pickFirst(params.senior)),
    jobFamily: parseJobFamily(pickFirst(params.familia)),
    dataAdmissaoInicio: parseDateOrNull(pickFirst(params.admDe)),
    dataAdmissaoFim: parseDateOrNull(pickFirst(params.admAte)),
    dataCadastroInicio: parseDateOrNull(pickFirst(params.cadDe)),
    dataCadastroFim: parseDateOrNull(pickFirst(params.cadAte)),
    papelFuncional: parsePapelFuncional(pickFirst(params.papel)),
    sortBy: parseSortBy(pickFirst(params.sortBy)),
    sortOrder: parseSortOrder(pickFirst(params.sortOrder)),
    page: parsePage(pickFirst(params.page)),
    pageSize: parsePageSize(pickFirst(params.pageSize)),
  };
}

/**
 * §14.10 — converte `ColaboradoresFilters` para o payload canonico bit-
 * exact do service. Simetria total — ambos os tipos sao estruturalmente
 * equivalentes. Helper explicito para deixar a conversao rastreavel.
 */
export function colaboradoresFiltersToServiceInput(
  filters: ColaboradoresFilters,
): ListEmployeesFilters {
  return {
    busca: filters.busca,
    departamento: filters.departamento,
    liderId: filters.liderId,
    nivelHierarquico: filters.nivelHierarquico,
    status: filters.status,
    senioridade: filters.senioridade,
    jobFamily: filters.jobFamily,
    dataAdmissaoInicio: filters.dataAdmissaoInicio,
    dataAdmissaoFim: filters.dataAdmissaoFim,
    dataCadastroInicio: filters.dataCadastroInicio,
    dataCadastroFim: filters.dataCadastroFim,
    papelFuncional: filters.papelFuncional,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
