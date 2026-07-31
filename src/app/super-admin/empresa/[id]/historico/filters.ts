// ROIP APP 9BOX — filters canonicos /super-admin/empresa/[id]/historico
// (ME-057c Bloco A — Historico da empresa §14.21).
//
// Origem canonica:
// - DOC 05 §14.21 — 3 filtros canonicos: Periodo (dropdown padrao
//   canonico "Ultimos 30 dias / Ultimos 90 dias default / Ultimos 12
//   meses / Personalizado..."), Tipo de evento (dropdown: Todos default +
//   4 tipos canonicos + opcao desabilitada canonica literal "Mudança de
//   meta de ROI (indisponível — placeholder)"), Ator (busca textual
//   livre).
// - Mockup canonico `historico_empresa_v1.html` linhas 168-183.
// - S324 canonizada nesta ME: filtro "Ator" e LIKE sobre nome do ator
//   resolvido de cada fonte (executor canonico primario).
//
// Contrato canonico:
// - `HistoricoFilters` — estado dos filtros.
// - `CANONICAL_HISTORICO_DEFAULT_FILTERS` — valores default §14.21
//   (Periodo = 90 dias, Tipo = null, Ator = "", pagina 1, pageSize 25).
// - `parseHistoricoFiltersFromSearchParams` — parse tolerante.
// - `resolvePeriodoRange` — traduz enum periodo em `[inicio, fim]`.
// - `normalizeAtorBusca` — validacao/normalizacao do input livre de ator.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HistoricoFilters` (tipo) → `page.tsx`, `actions.ts`,
//     `HistoricoClient.tsx`, `companyHistoryLog.ts`, testes.
//   - `PERIODO_VALUES`, `PeriodoValue` → `HistoricoClient.tsx`
//     (dropdown), testes.
//   - `CANONICAL_HISTORICO_DEFAULT_FILTERS` → `page.tsx` (fallback),
//     testes.
//   - `parseHistoricoFiltersFromSearchParams` → `page.tsx`, testes.
//   - `resolvePeriodoRange` → `companyHistoryLog.ts`, testes.
//   - `normalizeAtorBusca`, `ATOR_BUSCA_MIN_LEN`, `ATOR_BUSCA_MAX_LEN`
//     → `HistoricoClient.tsx`, `companyHistoryLog.ts`, testes.

import { HISTORY_EVENT_TYPE_VALUES, type HistoryEventType } from './mappings';

// -----------------------------------------------------------------------
// Tipos e constantes canonicas
// -----------------------------------------------------------------------

/** Opcoes canonicas de periodo §14.21 (mockup linhas 170-173). */
export const PERIODO_VALUES = ['30', '90', '365', 'personalizado'] as const;
export type PeriodoValue = (typeof PERIODO_VALUES)[number];

/**
 * Limites canonicos do input livre "Ator" §14.21. `ATOR_BUSCA_MIN_LEN`
 * evita LIKE excessivamente aberto (`%%` sobre milhares de nomes seria
 * degradacao de UX); `ATOR_BUSCA_MAX_LEN` protege contra input abusivo.
 * Valores alinhados com padroes S324 aplicados em ME-057b (busca CC043
 * do DAL usa min 2 / max 100 — mesmos valores para consistencia).
 */
export const ATOR_BUSCA_MIN_LEN = 2;
export const ATOR_BUSCA_MAX_LEN = 100;

export interface HistoricoFilters {
  readonly periodo: PeriodoValue;
  readonly periodoPersonalizadoInicio: Date | null;
  readonly periodoPersonalizadoFim: Date | null;
  readonly tipo: HistoryEventType | null;
  readonly atorBusca: string;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}

/**
 * Default canonico §14.21: periodo "Ultimos 90 dias" (mockup linha 171
 * marca `selected` em `value="90"`), Tipo = null (Todos), Ator = "" (sem
 * filtro), pagina 1, pageSize 25 (default do mockup linha 213).
 */
export const CANONICAL_HISTORICO_DEFAULT_FILTERS: HistoricoFilters = {
  periodo: '90',
  periodoPersonalizadoInicio: null,
  periodoPersonalizadoFim: null,
  tipo: null,
  atorBusca: '',
  page: 1,
  pageSize: 25,
};

// -----------------------------------------------------------------------
// Parse tolerante de searchParams (Next 15)
// -----------------------------------------------------------------------

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePeriodo(raw: string | undefined): PeriodoValue {
  if (raw === undefined || raw === '') return '90';
  if ((PERIODO_VALUES as readonly string[]).includes(raw)) {
    return raw as PeriodoValue;
  }
  return '90';
}

function parseTipo(raw: string | undefined): HistoryEventType | null {
  if (raw === undefined || raw === '') return null;
  if ((HISTORY_EVENT_TYPE_VALUES as readonly string[]).includes(raw)) {
    return raw as HistoryEventType;
  }
  return null;
}

function parseDateOrNull(raw: string | undefined): Date | null {
  if (raw === undefined || raw === '') return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
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
 * Normaliza input livre "Ator" §14.21 aplicando trim + colapso de
 * whitespace. Retorna string vazia quando o input nao atende
 * `ATOR_BUSCA_MIN_LEN` (evita LIKE `%a%` degradado). Truncamento em
 * `ATOR_BUSCA_MAX_LEN` protege contra abuso.
 */
export function normalizeAtorBusca(raw: string | undefined): string {
  if (raw === undefined) return '';
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < ATOR_BUSCA_MIN_LEN) return '';
  if (trimmed.length > ATOR_BUSCA_MAX_LEN) {
    return trimmed.slice(0, ATOR_BUSCA_MAX_LEN);
  }
  return trimmed;
}

/**
 * Parse tolerante de searchParams (`Record<string, string | string[] |
 * undefined>`). Chaves canonicas:
 *   - `periodo` (`30 | 90 | 365 | personalizado`, default `90`).
 *   - `de` (data inicio — apenas usado se periodo=`personalizado`).
 *   - `ate` (data fim — apenas usado se periodo=`personalizado`).
 *   - `tipo` (`respfin | desbloqueio | transferencia | solicitacao`).
 *   - `ator` (string livre, normalizada).
 *   - `page`, `pageSize` (padroes canonicos).
 */
export function parseHistoricoFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): HistoricoFilters {
  const periodo = parsePeriodo(pickFirst(params.periodo));
  return {
    periodo,
    periodoPersonalizadoInicio:
      periodo === 'personalizado' ? parseDateOrNull(pickFirst(params.de)) : null,
    periodoPersonalizadoFim:
      periodo === 'personalizado' ? parseDateOrNull(pickFirst(params.ate)) : null,
    tipo: parseTipo(pickFirst(params.tipo)),
    atorBusca: normalizeAtorBusca(pickFirst(params.ator)),
    page: parsePage(pickFirst(params.page)),
    pageSize: parsePageSize(pickFirst(params.pageSize)),
  };
}

// -----------------------------------------------------------------------
// Resolver periodo → [inicio, fim]
// -----------------------------------------------------------------------

/**
 * Traduz `periodo` (enum canonico) em janela `[inicio, fim]`. Semantica:
 *   - `30` → [agora - 30 dias, agora].
 *   - `90` → [agora - 90 dias, agora].
 *   - `365` → [agora - 365 dias, agora].
 *   - `personalizado` → [inicio || null, fim || null] (usuario pode
 *     preencher apenas um lado; consumidor decide semantica).
 *
 * `now` injetavel para testes deterministicos. Alinhado bit-exact com
 * `resolvePeriodoRange` do ME-057b (padrao S204).
 */
export function resolvePeriodoRange(
  periodo: PeriodoValue,
  personalizadoInicio: Date | null,
  personalizadoFim: Date | null,
  now: Date,
): { inicio: Date | null; fim: Date | null } {
  if (periodo === 'personalizado') {
    return { inicio: personalizadoInicio, fim: personalizadoFim };
  }
  const days = periodo === '30' ? 30 : periodo === '90' ? 90 : 365;
  const inicio = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { inicio, fim: now };
}
