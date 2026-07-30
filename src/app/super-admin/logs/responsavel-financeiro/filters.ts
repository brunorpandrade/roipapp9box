// ROIP APP 9BOX — filters canonicos /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A).
//
// Origem canonica:
// - DOC 05 §14.20 (Rota `/super-admin/logs/responsavel-financeiro`) —
//   3 filtros: Empresa (select), Periodo (dropdown padrao canonico),
//   Tipo de evento (dropdown: Todos / Atribuicao / Transferencia /
//   Remocao — CC043 aplicada: labels do mockup em substantivo, values
//   do enum `atribuido/transferido/removido`).
// - Mockup canonico `logs_responsavel_financeiro_v1.html` linhas
//   179-183: dropdown periodo com opcoes canonicas
//   "Ultimos 30 dias / Ultimos 90 dias (default) / Ultimos 12 meses /
//   Personalizado...".
// - DOC 01 §14 (`responsavelFinanceiroTransferLog.eventType` enum
//   canonico `atribuido | transferido | removido`).
//
// Contrato canonico:
// - `RFLogsFilters` — estado dos filtros (todos opcionais).
// - `CANONICAL_RF_DEFAULT_FILTERS` — valores default canonicos §14.20
//   (Periodo = ultimos 90 dias, demais nulos).
// - `parseRFFiltersFromSearchParams` — parse tolerante.
// - `resolvePeriodoRange` — resolve enum periodo em par [inicio, fim].
// - `RFEventType` (re-export) e `RF_EVENT_TYPE_VALUES` (para narrowing).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `RFLogsFilters` (tipo) → page.tsx, actions.ts, RFLogsClient.tsx,
//     `me057b-logs.test.ts`.
//   - `PERIODO_VALUES` (const) → RFLogsClient.tsx (dropdown), tests.
//   - `CANONICAL_RF_DEFAULT_FILTERS` → page.tsx (fallback), tests.
//   - `parseRFFiltersFromSearchParams` → page.tsx, actions.ts.
//   - `resolvePeriodoRange` → page.tsx, actions.ts, tests.

import type { RfEventType } from '../../../../db/schema/enums';
import { RF_EVENT_TYPE_VALUES } from '../../../../db/schema/enums';

// -----------------------------------------------------------------------
// Tipos e constantes canonicas
// -----------------------------------------------------------------------

/** Opcoes canonicas de periodo §14.20 (dropdown do mockup). */
export const PERIODO_VALUES = ['30', '90', '365', 'personalizado'] as const;
export type PeriodoValue = (typeof PERIODO_VALUES)[number];

export interface RFLogsFilters {
  readonly empresaId: number | null;
  readonly periodo: PeriodoValue;
  readonly periodoPersonalizadoInicio: Date | null;
  readonly periodoPersonalizadoFim: Date | null;
  readonly eventType: RfEventType | null;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}

/**
 * Default canonico §14.20: periodo "Ultimos 90 dias" (mockup linha 181
 * marca `selected` em `value="90"`). Demais filtros ausentes.
 */
export const CANONICAL_RF_DEFAULT_FILTERS: RFLogsFilters = {
  empresaId: null,
  periodo: '90',
  periodoPersonalizadoInicio: null,
  periodoPersonalizadoFim: null,
  eventType: null,
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

function parseEventType(raw: string | undefined): RfEventType | null {
  if (raw === undefined || raw === '') return null;
  if ((RF_EVENT_TYPE_VALUES as readonly string[]).includes(raw)) {
    return raw as RfEventType;
  }
  return null;
}

function parsePeriodo(raw: string | undefined): PeriodoValue {
  if (raw === undefined || raw === '') return '90';
  if ((PERIODO_VALUES as readonly string[]).includes(raw)) {
    return raw as PeriodoValue;
  }
  return '90';
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
 * Parse tolerante de searchParams (`Record<string, string | string[] |
 * undefined>`). Chaves canonicas:
 *   - `empresa` (int positivo).
 *   - `periodo` (`30 | 90 | 365 | personalizado`, default `90`).
 *   - `de` (data inicio — apenas usado se periodo=`personalizado`).
 *   - `ate` (data fim — apenas usado se periodo=`personalizado`).
 *   - `tipo` (`atribuido | transferido | removido`).
 *   - `page`, `pageSize` (padroes canonicos).
 */
export function parseRFFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): RFLogsFilters {
  const periodo = parsePeriodo(pickFirst(params.periodo));
  return {
    empresaId: parseIntOrNull(pickFirst(params.empresa)),
    periodo,
    periodoPersonalizadoInicio:
      periodo === 'personalizado' ? parseDateOrNull(pickFirst(params.de)) : null,
    periodoPersonalizadoFim:
      periodo === 'personalizado' ? parseDateOrNull(pickFirst(params.ate)) : null,
    eventType: parseEventType(pickFirst(params.tipo)),
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
 * `now` injetavel para testes deterministicos.
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
