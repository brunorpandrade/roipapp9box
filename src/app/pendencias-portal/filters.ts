// ROIP APP 9BOX — filters canonicos de `/pendencias-portal` (ME-058
// §14.23 S326).
//
// Origem canonica:
// - DOC 05 §14.23 linha 2614-2620 (Barra de filtros — 6 filtros com
//   wrap responsivo): (1) Busca nome/CPF/cargo, (2) Departamento,
//   (3) Lider direto, (4) Instrumento, (5) Status, (6) Ciclo.
// - `DEPARTAMENTO_VALUES` (§15.1 DOC 01) — enum canonico de 19 valores
//   consumido pelo filtro 2.
// - `PORTAL_INSTRUMENT_VALUES` (§15.3 DOC 01, extraida em ME-058) — 4
//   valores canonicos consumidos pelo filtro 4.
// - DOC 05 §14.23 linha 2615: busca com debounce 300ms (aplicado no
//   cliente; motor recebe string ja normalizada).
//
// Contrato canonico:
// - `PendenciasFilters` — shape uniforme de filtros aplicados. Consumido
//   pelo motor `pendenciasEngine.ts` (queries com AND canonico) e pelo
//   cliente `PendenciasClient.tsx` (state do URL/form).
// - `parsePendenciasFilters` — parsing safe de query params (URLSearchParams
//   ou objeto plano). Retorna filtros normalizados; valores invalidos
//   viram `null` silenciosamente (canonicamente: filtros invalidos nao
//   filtram — nao lancam erro, para nao quebrar navegacao).
// - `CANONICAL_PENDENCIAS_DEFAULT_FILTERS` — filtros default canonicos
//   (todos null — sem filtro aplicado, retorna empresa toda).
// - `normalizeSearchTerm` — normalizacao canonica da busca (trim +
//   lowercase; caracteres especiais preservados; comprimento min/max
//   canonicos).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `PendenciasFilters` → consumido por `pendenciasEngine.ts`,
//     `page.tsx`, `PendenciasClient.tsx`, `actions.ts`, testes.
//   - `parsePendenciasFilters` → consumido por `page.tsx` (URL params),
//     `actions.ts` (form data) e `pendencias-filters.test.ts`.
//   - `CANONICAL_PENDENCIAS_DEFAULT_FILTERS` → consumido por `page.tsx`
//     (carga inicial), `PendenciasClient.tsx` (reset) e
//     `pendencias-filters.test.ts`.
//   - `normalizeSearchTerm` → consumido por `pendenciasEngine.ts` e
//     `pendencias-filters.test.ts`.

import {
  DEPARTAMENTO_VALUES,
  PORTAL_INSTRUMENT_VALUES,
  type Departamento,
  type PortalInstrumentType,
} from '../../db/schema/enums';
import type { PendenciaStatus } from './mappings';

// -----------------------------------------------------------------------
// Contrato canonico dos filtros §14.23
// -----------------------------------------------------------------------

/**
 * Shape canonico dos filtros aplicaveis a `/pendencias-portal`. Cada
 * campo `null` significa "sem filtro" (retorna todos os valores). Ordem
 * dos campos espelha a barra de filtros do DOC 05 §14.23.
 */
export interface PendenciasFilters {
  /** Filtro 1 §14.23 — busca por nome/CPF/cargo (LIKE case-insensitive). */
  readonly q: string | null;
  /** Filtro 2 §14.23 — departamento canonico §15.1. */
  readonly departamento: Departamento | null;
  /** Filtro 3 §14.23 — id do lider direto (employees.id). */
  readonly liderDiretoId: number | null;
  /** Filtro 4 §14.23 — tipo canonico de instrumento §15.3. */
  readonly instrumento: PortalInstrumentType | null;
  /** Filtro 5 §14.23 — status canonico da pendencia. */
  readonly status: PendenciaStatus | null;
  /** Filtro 6 §14.23 — cicloReferencia (ex: "2026-T1"). */
  readonly cicloReferencia: string | null;
}

/**
 * Filtros default canonicos — todos `null` (sem filtro aplicado). Carga
 * inicial de `/pendencias-portal` usa este objeto; cliente reseta para
 * este ao acionar `[Limpar filtros]` (§14.23 estado empty por filtro).
 */
export const CANONICAL_PENDENCIAS_DEFAULT_FILTERS: PendenciasFilters = Object.freeze({
  q: null,
  departamento: null,
  liderDiretoId: null,
  instrumento: null,
  status: null,
  cicloReferencia: null,
});

// -----------------------------------------------------------------------
// Constantes canonicas de normalizacao
// -----------------------------------------------------------------------

/**
 * Comprimento minimo canonico da busca §14.23 filtro 1. Termos com < 2
 * caracteres viram `null` (evita LIKE '%' catastrofico e alinha com S324
 * ATOR_BUSCA_MIN_LEN da ME-057c).
 */
export const SEARCH_MIN_LEN = 2;

/**
 * Comprimento maximo canonico da busca §14.23 filtro 1. Truncado ao
 * limite (alinhado com S324 ATOR_BUSCA_MAX_LEN da ME-057c).
 */
export const SEARCH_MAX_LEN = 100;

/**
 * Comprimento maximo canonico de `cicloReferencia` — espelho da coluna
 * VARCHAR(20) de `cycleSchedule.cicloReferencia`. Valores maiores viram
 * `null`.
 */
const CICLO_REFERENCIA_MAX_LEN = 20;

// -----------------------------------------------------------------------
// Guardas canonicas
// -----------------------------------------------------------------------

/**
 * Guarda canonica type-safe: `raw` e valor canonico de Departamento?
 */
function isDepartamento(raw: string): raw is Departamento {
  return (DEPARTAMENTO_VALUES as readonly string[]).includes(raw);
}

/**
 * Guarda canonica type-safe: `raw` e valor canonico de PortalInstrumentType?
 */
function isPortalInstrument(raw: string): raw is PortalInstrumentType {
  return (PORTAL_INSTRUMENT_VALUES as readonly string[]).includes(raw);
}

/**
 * Guarda canonica type-safe: `raw` e valor canonico de PendenciaStatus?
 */
function isPendenciaStatus(raw: string): raw is PendenciaStatus {
  return raw === 'Pendente' || raw === 'Atrasado';
}

// -----------------------------------------------------------------------
// Normalizadores canonicos
// -----------------------------------------------------------------------

/**
 * Normalizacao canonica da busca §14.23 filtro 1. Retorna `null` quando:
 * - Termo `null` ou undefined.
 * - Termo apos trim tem `length < SEARCH_MIN_LEN`.
 * Trunca termo em `SEARCH_MAX_LEN` (protege LIKE de payload malicioso).
 * Preserva case original (a comparacao LIKE do MySQL sob collation
 * `utf8mb4_unicode_ci` e case-insensitive por padrao).
 */
export function normalizeSearchTerm(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LEN) {
    return null;
  }
  if (trimmed.length > SEARCH_MAX_LEN) {
    return trimmed.slice(0, SEARCH_MAX_LEN);
  }
  return trimmed;
}

/**
 * Normalizacao canonica de `liderDiretoId`. Aceita string numerica ou
 * numero. Retorna `null` para strings vazias, NaN, negativos, zero ou
 * invalido. Ponto flutuante e truncado para int (canonicamente ids sao
 * inteiros positivos).
 */
function normalizeLiderId(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

/**
 * Normalizacao canonica de `cicloReferencia`. Trim + valida comprimento
 * maximo (VARCHAR(20) do schema). Retorna `null` para vazio ou longo
 * demais.
 */
function normalizeCicloReferencia(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > CICLO_REFERENCIA_MAX_LEN) {
    return null;
  }
  return trimmed;
}

// -----------------------------------------------------------------------
// Parser canonico
// -----------------------------------------------------------------------

/**
 * Fonte de entrada canonica do parser. Aceita `URLSearchParams` (server
 * component consumindo `searchParams`) ou objeto plano `Record<string,
 * string | undefined>` (server action consumindo `FormData` convertido).
 * Ambos tratados uniformemente via `getParam` interno.
 */
export type PendenciasFilterInput = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Extrai valor de parametro `key` da fonte, retornando string ou `null`.
 * Uniformiza URLSearchParams (retorna string ou null via `.get`) e
 * Record plano (retorna string, string[] ou undefined via bracket).
 * Para arrays, considera apenas o primeiro valor (canonicamente filtros
 * sao single-select).
 */
function getParam(input: PendenciasFilterInput, key: string): string | null {
  if (input instanceof URLSearchParams) {
    return input.get(key);
  }
  const raw = input[key];
  if (raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    return raw.length === 0 ? null : (raw[0] ?? null);
  }
  return raw;
}

/**
 * Parsing canonico de filtros a partir de `URLSearchParams` (server
 * component) ou `Record<string, string>` (server action). Valores
 * ausentes/invalidos viram `null` silenciosamente — nunca lanca erro.
 * Aplicacao canonica dos normalizadores por campo.
 *
 * Chaves canonicas dos parametros de URL:
 * - `q` — busca (nome/CPF/cargo).
 * - `departamento` — enum §15.1.
 * - `lider` — id numerico do lider direto.
 * - `instrumento` — enum §15.3.
 * - `status` — 'Pendente' | 'Atrasado'.
 * - `ciclo` — cicloReferencia.
 */
export function parsePendenciasFilters(input: PendenciasFilterInput): PendenciasFilters {
  const rawQ = getParam(input, 'q');
  const q = normalizeSearchTerm(rawQ);

  const rawDept = getParam(input, 'departamento');
  const departamento = rawDept !== null && isDepartamento(rawDept) ? rawDept : null;

  const rawLider = getParam(input, 'lider');
  const liderDiretoId = normalizeLiderId(rawLider);

  const rawInstr = getParam(input, 'instrumento');
  const instrumento = rawInstr !== null && isPortalInstrument(rawInstr) ? rawInstr : null;

  const rawStatus = getParam(input, 'status');
  const status = rawStatus !== null && isPendenciaStatus(rawStatus) ? rawStatus : null;

  const rawCiclo = getParam(input, 'ciclo');
  const cicloReferencia = normalizeCicloReferencia(rawCiclo);

  return { q, departamento, liderDiretoId, instrumento, status, cicloReferencia };
}

/**
 * Predicado canonico: filtros aplicados sao equivalentes ao default
 * canonico (nenhum filtro efetivo)? Consumido por `PendenciasClient.tsx`
 * para decidir se exibe empty state global (§14.23 "Todos os
 * colaboradores estao em dia") vs empty state por filtro (§14.23
 * "Nenhuma pendencia atende aos filtros aplicados"), e por `page.tsx`
 * para decidir se emite Link canonico limpo.
 */
export function isDefaultFilters(filters: PendenciasFilters): boolean {
  return (
    filters.q === null &&
    filters.departamento === null &&
    filters.liderDiretoId === null &&
    filters.instrumento === null &&
    filters.status === null &&
    filters.cicloReferencia === null
  );
}
