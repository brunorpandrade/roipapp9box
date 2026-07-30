// ROIP APP 9BOX — helpers canonicos de filtros /notificacoes (ME-057a).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — barra de filtros com 6
//   controles: Tipo, Severidade, Periodo, Status, Buscar colaborador,
//   Limpar filtros.
// - DOC 05 §14.19 — cap client-side 500 IDs por selecao acumulada;
//   toast canonico literal ao tentar marcar a 501a.
//
// Contrato canonico:
// - Modulo puro (sem I/O). Consumido por `page.tsx` (server, parse
//   querystring canonico) + `NotificacoesClient.tsx` (client, aplicacao
//   e reset dos filtros).
// - Todas as datas trafegam como `Date` em UTC. A conversao para
//   MySQL DATETIME e responsabilidade do consumidor Drizzle
//   (`.toISOString()` implicito via mysql2 driver).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `NotificacoesFilters` (tipo), `parseFiltersFromSearchParams`,
//     `resolvePeriodoRange`, `validateSearchColaborador`,
//     `SELECAO_LOTE_CAP`, `TOAST_LIMITE_SELECAO_MSG` → `page.tsx` e
//     `NotificacoesClient.tsx`, mais testes unit.

import {
  CANONICAL_DEFAULT_CATEGORIA,
  CANONICAL_DEFAULT_PAGE,
  CANONICAL_DEFAULT_PAGE_SIZE,
  CANONICAL_DEFAULT_PERIODO,
  CANONICAL_DEFAULT_SEARCH_COLABORADOR,
  CANONICAL_DEFAULT_SEVERIDADE,
  CANONICAL_DEFAULT_STATUS,
  CANONICAL_PAGE_SIZE_VALUES,
  CATEGORIA_UI_VALUES,
  PERIODO_UI_VALUES,
  SEVERIDADE_UI_VALUES,
  STATUS_UI_VALUES,
  type CanonicalPageSize,
  type CategoriaUi,
  type PeriodoUi,
  type SeveridadeUi,
  type StatusUi,
} from './mappings';

// -----------------------------------------------------------------------
// Tipo canonico do estado consolidado dos filtros
// -----------------------------------------------------------------------

/**
 * Estado canonico dos filtros da rota `/notificacoes`. Fonte unica de
 * verdade compartilhada entre server (`page.tsx` initial state via
 * parse de searchParams) e client (`NotificacoesClient.tsx` estado
 * interativo com hidratacao a partir do initial state).
 *
 * Campos derivados NAO ficam aqui (ex: range de datas resolvido).
 * `resolvePeriodoRange(periodo, personalizadoInicio, personalizadoFim,
 * hoje)` calcula sob demanda.
 */
export interface NotificacoesFilters {
  readonly categoria: CategoriaUi;
  readonly severidade: SeveridadeUi;
  readonly periodo: PeriodoUi;
  /**
   * Data inicial do periodo personalizado. Presente somente quando
   * `periodo === 'personalizado'`. UTC. Formato YYYY-MM-DD (dia inteiro
   * inicial).
   */
  readonly periodoPersonalizadoInicio: string | null;
  /**
   * Data final do periodo personalizado. Presente somente quando
   * `periodo === 'personalizado'`. UTC. Formato YYYY-MM-DD (dia inteiro
   * final, inclusivo).
   */
  readonly periodoPersonalizadoFim: string | null;
  readonly status: StatusUi;
  /**
   * String de busca ja trimada e validada (comprimento >= 2 e <= 100
   * apos trim). Vazio significa "sem filtro de busca" (default).
   */
  readonly searchColaborador: string;
  readonly page: number;
  readonly pageSize: CanonicalPageSize;
}

// -----------------------------------------------------------------------
// Defaults canonicos consolidados
// -----------------------------------------------------------------------

export const CANONICAL_DEFAULT_FILTERS: NotificacoesFilters = {
  categoria: CANONICAL_DEFAULT_CATEGORIA,
  severidade: CANONICAL_DEFAULT_SEVERIDADE,
  periodo: CANONICAL_DEFAULT_PERIODO,
  periodoPersonalizadoInicio: null,
  periodoPersonalizadoFim: null,
  status: CANONICAL_DEFAULT_STATUS,
  searchColaborador: CANONICAL_DEFAULT_SEARCH_COLABORADOR,
  page: CANONICAL_DEFAULT_PAGE,
  pageSize: CANONICAL_DEFAULT_PAGE_SIZE,
};

// -----------------------------------------------------------------------
// Parse de query string
// -----------------------------------------------------------------------

/**
 * Parse tolerante do querystring canonico. Valores invalidos caem no
 * default canonico (nao lanca) — o consumidor server component recebe
 * sempre um estado renderizavel. Valores desconhecidos sao ignorados
 * silenciosamente (nao ha efeito colateral).
 *
 * Regras canonicas:
 * - `categoria`: um dos `CATEGORIA_UI_VALUES` ou default.
 * - `severidade`: um dos `SEVERIDADE_UI_VALUES` ou default.
 * - `periodo`: um dos `PERIODO_UI_VALUES` ou default.
 * - `pInicio`/`pFim`: strings YYYY-MM-DD validas (regex simples). Se
 *   `periodo !== 'personalizado'`, sao ignoradas e viram null.
 * - `status`: um dos `STATUS_UI_VALUES` ou default.
 * - `q`: string; apos trim, se comprimento < 2 vira '' (nao filtra); se
 *   > 100, e truncada em 100 (defense-in-depth contra abuso).
 * - `page`: inteiro positivo (>=1) ou default (1).
 * - `pageSize`: um dos `CANONICAL_PAGE_SIZE_VALUES` (25|50|100) ou
 *   default (25).
 */
export function parseFiltersFromSearchParams(
  params: Readonly<Record<string, string | string[] | undefined>>,
): NotificacoesFilters {
  const readSingle = (key: string): string | undefined => {
    const raw = params[key];
    if (raw === undefined) {
      return undefined;
    }
    if (Array.isArray(raw)) {
      return raw[0];
    }
    return raw;
  };

  const categoriaRaw = readSingle('categoria');
  const categoria =
    categoriaRaw !== undefined && (CATEGORIA_UI_VALUES as readonly string[]).includes(categoriaRaw)
      ? (categoriaRaw as CategoriaUi)
      : CANONICAL_DEFAULT_CATEGORIA;

  const severidadeRaw = readSingle('severidade');
  const severidade =
    severidadeRaw !== undefined &&
    (SEVERIDADE_UI_VALUES as readonly string[]).includes(severidadeRaw)
      ? (severidadeRaw as SeveridadeUi)
      : CANONICAL_DEFAULT_SEVERIDADE;

  const periodoRaw = readSingle('periodo');
  const periodo =
    periodoRaw !== undefined && (PERIODO_UI_VALUES as readonly string[]).includes(periodoRaw)
      ? (periodoRaw as PeriodoUi)
      : CANONICAL_DEFAULT_PERIODO;

  const pInicioRaw = readSingle('pInicio');
  const pFimRaw = readSingle('pFim');
  const isValidYmd = (v: string | undefined): v is string =>
    v !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const periodoPersonalizadoInicio =
    periodo === 'personalizado' && isValidYmd(pInicioRaw) ? pInicioRaw : null;
  const periodoPersonalizadoFim =
    periodo === 'personalizado' && isValidYmd(pFimRaw) ? pFimRaw : null;

  const statusRaw = readSingle('status');
  const status =
    statusRaw !== undefined && (STATUS_UI_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as StatusUi)
      : CANONICAL_DEFAULT_STATUS;

  const qRaw = readSingle('q');
  const searchColaborador = normalizeSearchColaborador(qRaw ?? '');

  const pageRaw = readSingle('page');
  const pageParsed = pageRaw !== undefined ? Number.parseInt(pageRaw, 10) : Number.NaN;
  const page = Number.isFinite(pageParsed) && pageParsed >= 1 ? pageParsed : CANONICAL_DEFAULT_PAGE;

  const pageSizeRaw = readSingle('pageSize');
  const pageSizeParsed = pageSizeRaw !== undefined ? Number.parseInt(pageSizeRaw, 10) : Number.NaN;
  const pageSize = (CANONICAL_PAGE_SIZE_VALUES as readonly number[]).includes(pageSizeParsed)
    ? (pageSizeParsed as CanonicalPageSize)
    : CANONICAL_DEFAULT_PAGE_SIZE;

  return {
    categoria,
    severidade,
    periodo,
    periodoPersonalizadoInicio,
    periodoPersonalizadoFim,
    status,
    searchColaborador,
    page,
    pageSize,
  };
}

// -----------------------------------------------------------------------
// Validacao de busca por colaborador
// -----------------------------------------------------------------------

/**
 * Comprimento minimo canonico (§14.19) da busca por colaborador APOS
 * trim. Menos de 2 caracteres nao filtra (comportamento canonico:
 * campo vazio == sem filtro).
 */
export const SEARCH_MIN_LENGTH = 2 as const;

/**
 * Comprimento maximo canonico (§14.19) da busca por colaborador APOS
 * trim. Trunca acima disso para defense-in-depth.
 */
export const SEARCH_MAX_LENGTH = 100 as const;

/**
 * Normaliza o input da busca canonica §14.19: aplica trim, valida
 * comprimento minimo (< 2 vira '') e maximo (trunca em 100). Retorna
 * string canonica pronta para uso em WHERE `LIKE '%...%'`.
 */
export function normalizeSearchColaborador(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) {
    return '';
  }
  if (trimmed.length > SEARCH_MAX_LENGTH) {
    return trimmed.slice(0, SEARCH_MAX_LENGTH);
  }
  return trimmed;
}

/**
 * Valida o input da busca canonica. Diferente de `normalize`, retorna
 * um objeto explicativo. Usado pelo client component para decidir se
 * deve disparar a query ou aguardar mais caracteres. `reason` `too_short`
 * cobre '' e < 2 chars — o consumidor UI trata ambos como "sem query
 * ainda", diferenca cosmetica de mensagem se necessario.
 */
export function validateSearchColaborador(
  raw: string,
):
  | { readonly valid: true; readonly trimmed: string }
  | { readonly valid: false; readonly reason: 'too_short' | 'truncated' } {
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) {
    return { valid: false, reason: 'too_short' };
  }
  if (trimmed.length > SEARCH_MAX_LENGTH) {
    return { valid: false, reason: 'truncated' };
  }
  return { valid: true, trimmed };
}

// -----------------------------------------------------------------------
// Resolucao canonica de range de datas
// -----------------------------------------------------------------------

/**
 * Resultado canonico de `resolvePeriodoRange`. `from` inclusivo, `to`
 * exclusivo (limite superior do intervalo). Quando `periodo ===
 * 'personalizado'` e as datas nao sao validas, retorna `null` — o
 * consumidor renderiza estado vazio canonico ate o usuario preencher.
 */
export interface PeriodoRange {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Calcula o range canonico de datas para uma opcao de periodo.
 *
 * Regras canonicas:
 * - `ultimos_7d`: [hoje-7d 00:00 UTC, hoje+1d 00:00 UTC).
 * - `ultimos_30d` (default): [hoje-30d 00:00 UTC, hoje+1d 00:00 UTC).
 * - `ultimos_90d`: [hoje-90d 00:00 UTC, hoje+1d 00:00 UTC).
 * - `personalizado`: [pInicio 00:00 UTC, pFim+1d 00:00 UTC). Se qualquer
 *   das datas estiver ausente ou invalida → `null`.
 *
 * `to` sempre exclusivo. Consumidor Drizzle traduz para
 * `createdAt >= from AND createdAt < to`.
 */
export function resolvePeriodoRange(
  periodo: PeriodoUi,
  personalizadoInicio: string | null,
  personalizadoFim: string | null,
  hoje: Date,
): PeriodoRange | null {
  const startOfDayUtc = (d: Date): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const addDaysUtc = (d: Date, days: number): Date => {
    const copy = new Date(d.getTime());
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  };

  const tomorrow = startOfDayUtc(addDaysUtc(hoje, 1));

  if (periodo === 'ultimos_7d') {
    return { from: startOfDayUtc(addDaysUtc(hoje, -7)), to: tomorrow };
  }
  if (periodo === 'ultimos_30d') {
    return { from: startOfDayUtc(addDaysUtc(hoje, -30)), to: tomorrow };
  }
  if (periodo === 'ultimos_90d') {
    return { from: startOfDayUtc(addDaysUtc(hoje, -90)), to: tomorrow };
  }

  // personalizado
  if (personalizadoInicio === null || personalizadoFim === null) {
    return null;
  }
  const inicio = parseYmdUtc(personalizadoInicio);
  const fim = parseYmdUtc(personalizadoFim);
  if (inicio === null || fim === null) {
    return null;
  }
  if (fim.getTime() < inicio.getTime()) {
    return null;
  }
  return { from: inicio, to: startOfDayUtc(addDaysUtc(fim, 1)) };
}

/**
 * Converte string YYYY-MM-DD em Date UTC (inicio do dia). Retorna null
 * se formato invalido ou data logicamente invalida (ex: 2026-02-31).
 */
function parseYmdUtc(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (match === null) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  // Se JS "corrigiu" data invalida (Feb 31 → Mar 3), rejeita
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

// -----------------------------------------------------------------------
// Cap client-side de selecao em lote (§14.19)
// -----------------------------------------------------------------------

/**
 * Cap canonico §14.19: maximo de IDs em selecao acumulada client-side
 * (paginas nao afetam — as selecoes se acumulam ao trocar paginas).
 * Tentar marcar a 501a linha dispara o toast canonico literal.
 */
export const SELECAO_LOTE_CAP = 500 as const;

/**
 * Mensagem canonica literal §14.19 do toast vermelho ao atingir cap.
 * Bit-exact do DOC 05.
 */
export const TOAST_LIMITE_SELECAO_MSG = 'Limite de 500 notificações por seleção atingido.';
