// ROIP APP 9BOX — filters canonicos de `/cycle-management` (ME-B9.1
// §14.18).
//
// Origem canonica:
// - DOC 05 §14.18 (Rota `/cycle-management` — Area 2 — tabela
//   `cycleSchedule`): 3 filtros canonicos (Instrumento, Status,
//   Periodo) + paginacao server-side 25/50/100.
// - Mockup `cycle_management_v1.html` — defaults e opcoes bit-exact.
//
// Contrato canonico:
// - `CycleScheduleFilters` — shape uniforme dos 3 filtros aplicados +
//   paginacao. Consumido pelo router `cycleSchedule.listByCompanyFiltered`
//   e pelo cliente `CycleManagementClient.tsx` (state do URL/form).
// - `parseCycleScheduleFilters` — parsing safe de query params.
//   Valores invalidos viram defaults canonicos silenciosamente.
// - `CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS` — defaults canonicos.
// - `PAGINATION_PAGE_SIZE_VALUES` — valores canonicos 25/50/100.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `CycleScheduleFilters` → consumido por `page.tsx`,
//     `CycleManagementClient.tsx`, `actions.ts`, `cycleSchedule` router
//     e testes.
//   - `parseCycleScheduleFilters` → consumido por `page.tsx` (URL
//     params) e teste.
//   - `CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS` → consumido por
//     `page.tsx` (carga inicial), `CycleManagementClient.tsx` (reset) e
//     teste.
//   - `PAGINATION_PAGE_SIZE_VALUES` → consumido por
//     `CycleManagementClient.tsx` (dropdown de paginacao) e teste.
//   - `PeriodoFiltro` + `PAGINATION_DEFAULT_PAGE_SIZE` → consumidos pelo
//     cliente/action e teste.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TIPO_CICLO_VALUES, type TipoCiclo } from '../../db/schema/enums';

import type { StatusCiclo } from './mappings';

// -----------------------------------------------------------------------
// Enum canonico do filtro "Periodo" §14.18
// -----------------------------------------------------------------------

/**
 * Opcoes canonicas do dropdown de periodo DOC 05 §14.18:
 *   - 'trimestre_atual' (default)
 *   - 'trimestre_anterior'
 *   - 'ultimos_90_dias'
 */
export type PeriodoFiltro = 'trimestre_atual' | 'trimestre_anterior' | 'ultimos_90_dias';

const PERIODO_VALUES: readonly PeriodoFiltro[] = [
  'trimestre_atual',
  'trimestre_anterior',
  'ultimos_90_dias',
];

// -----------------------------------------------------------------------
// Paginacao canonica §14.18 — 25/50/100 (default 25)
// -----------------------------------------------------------------------

export const PAGINATION_PAGE_SIZE_VALUES = [25, 50, 100] as const;

export type PaginationPageSize = (typeof PAGINATION_PAGE_SIZE_VALUES)[number];

export const PAGINATION_DEFAULT_PAGE_SIZE: PaginationPageSize = 25;

function isPageSize(n: number): n is PaginationPageSize {
  return PAGINATION_PAGE_SIZE_VALUES.includes(n as PaginationPageSize);
}

// -----------------------------------------------------------------------
// Contrato canonico dos filtros §14.18
// -----------------------------------------------------------------------

/**
 * Shape canonico dos filtros aplicaveis a `/cycle-management` Area 2.
 * `null` = sem filtro (retorna todos os valores daquela coluna).
 */
export interface CycleScheduleFilters {
  /** Filtro Instrumento §14.18 (null = todos). */
  readonly tipoCiclo: TipoCiclo | null;
  /** Filtro Status §14.18 (null = todos). */
  readonly status: StatusCiclo | null;
  /** Filtro Periodo §14.18 (default 'trimestre_atual'). */
  readonly periodo: PeriodoFiltro;
  /** Pagina corrente (1-indexed). */
  readonly page: number;
  /** Tamanho da pagina canonico 25/50/100. */
  readonly pageSize: PaginationPageSize;
}

/**
 * Defaults canonicos DOC 05 §14.18. Todos "todos" / "trimestre atual" /
 * pagina 1 / 25 por pagina.
 */
export const CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS: CycleScheduleFilters = {
  tipoCiclo: null,
  status: null,
  periodo: 'trimestre_atual',
  page: 1,
  pageSize: PAGINATION_DEFAULT_PAGE_SIZE,
};

// -----------------------------------------------------------------------
// Parsing safe de query params
// -----------------------------------------------------------------------

type RawParams = Record<string, string | string[] | undefined>;

function readSingle(raw: string | string[] | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const value = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Parsing canonico de searchParams para `CycleScheduleFilters`. Valores
 * invalidos ou ausentes caem no default canonico — nunca lanca.
 */
export function parseCycleScheduleFilters(raw: RawParams): CycleScheduleFilters {
  const tipoRaw = readSingle(raw.tipoCiclo);
  const statusRaw = readSingle(raw.status);
  const periodoRaw = readSingle(raw.periodo);
  const pageRaw = readSingle(raw.page);
  const pageSizeRaw = readSingle(raw.pageSize);

  const tipoCiclo =
    tipoRaw !== null && TIPO_CICLO_VALUES.includes(tipoRaw as TipoCiclo)
      ? (tipoRaw as TipoCiclo)
      : null;

  const status =
    statusRaw === 'aberto' || statusRaw === 'atrasado' || statusRaw === 'fechado'
      ? (statusRaw as StatusCiclo)
      : null;

  const periodo =
    periodoRaw !== null && PERIODO_VALUES.includes(periodoRaw as PeriodoFiltro)
      ? (periodoRaw as PeriodoFiltro)
      : CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS.periodo;

  const pageNum = pageRaw !== null ? Number.parseInt(pageRaw, 10) : NaN;
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  const pageSizeNum = pageSizeRaw !== null ? Number.parseInt(pageSizeRaw, 10) : NaN;
  const pageSize =
    Number.isFinite(pageSizeNum) && isPageSize(pageSizeNum)
      ? (pageSizeNum as PaginationPageSize)
      : PAGINATION_DEFAULT_PAGE_SIZE;

  return { tipoCiclo, status, periodo, page, pageSize };
}
