// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/dados-mensais` (§14.13, ME-079a).
//
// Padrão S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, função auxiliar
// e loader vive neste `internals.ts` irmão.
//
// IMPORTANTE (CC071): este módulo é importado por `DadosMensaisClient.
// tsx` (client component — `'use client'`). Portanto, NÃO pode importar
// VALUE-LEVEL de routers, services, db/client ou qualquer módulo que
// transite por `mysql2`, `node:crypto` ou `node:buffer`. Apenas
// constantes puras, tipos (import type) e funções sem side-effects.
//
// Origem canônica:
// - CAMADA_UI §14.13 (dados mensais RH — abas + navegação por mês +
//   comportamento por status).
// - CAMADA_AUTH §10.4 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §3.11 + §3.12 (validações canônicas de campo).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.6.1 (ficha).
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam`, `resolveDatabaseUrl` → `page.tsx` +
//     `actions.ts`.
//   - `DADOS_MENSAIS_TABS`, `DadosMensaisTab`,
//     `DADOS_MENSAIS_TAB_DEFAULT` → `DadosMensaisClient.tsx`.
//   - `formatMesLabel`, `prevMes`, `nextMes`, `currentMes` →
//     `DadosMensaisClient.tsx`.
//   - `STATUS_LABELS` → `DadosMensaisClient.tsx`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canônicas bit-exact
// -----------------------------------------------------------------------

/** §14.13 — 2 abas horizontais da rota `/dados-mensais`. */
export const DADOS_MENSAIS_TABS = ['rh', 'lider'] as const;

/** Tipo canônico das abas. */
export type DadosMensaisTab = (typeof DADOS_MENSAIS_TABS)[number];

/** Aba default canônica — sempre RH na chegada (§14.13). */
export const DADOS_MENSAIS_TAB_DEFAULT: DadosMensaisTab = 'rh';

// ME-080a — parser de `?tab=` na URL. Padrão idêntico ao `clevel-rh`
// (parseTabParam). Aceita apenas valores canônicos; qualquer outro
// devolve o default `rh`. Consumido por `page.tsx` para calcular
// `initialTab` passado ao Client.
export function parseTabParam(raw: string | undefined): DadosMensaisTab {
  if (raw === 'lider') {
    return 'lider';
  }
  return DADOS_MENSAIS_TAB_DEFAULT;
}

/** §14.13 rótulos canônicos das abas. */
export const TAB_LABELS: Record<DadosMensaisTab, string> = {
  rh: 'Dados do RH',
  lider: 'Dados dos líderes',
};

/** §14.13 rótulos canônicos de status do mês. */
export const STATUS_LABELS = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  desbloqueado: 'Desbloqueado',
} as const;

/** §14.13 cores canônicas de status do mês. */
export const STATUS_COLORS = {
  aberto: { bg: '#DCFCE7', text: '#166534' },
  fechado: { bg: '#F3F4F6', text: '#374151' },
  desbloqueado: { bg: '#FEF3C7', text: '#92400E' },
} as const;

/** Status possíveis do mês. */
export type StatusMes = 'aberto' | 'fechado' | 'desbloqueado';

// -----------------------------------------------------------------------
// Helpers de mês (puras, sem side-effects)
// -----------------------------------------------------------------------

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/**
 * Retorna o mês atual no formato canônico `YYYY-MM`.
 */
export function currentMes(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Formata `YYYY-MM` para rótulo em português (ex: "Junho 2026").
 */
export function formatMesLabel(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) {
    return mes;
  }
  return `${MESES_PT[monthIdx]} ${year}`;
}

/**
 * Navega para o mês anterior de `YYYY-MM`.
 */
export function prevMes(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  let y = Number(yearStr);
  let m = Number(monthStr);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Navega para o mês seguinte de `YYYY-MM`.
 */
export function nextMes(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  let y = Number(yearStr);
  let m = Number(monthStr);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

/**
 * Parse canônico de `params.id` — aceita apenas inteiros positivos.
 * Padrão consolidado ME-074 a ME-078b.
 */
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

/**
 * Resolve DATABASE_URL do ambiente. Padrão consolidado ME-074+.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
