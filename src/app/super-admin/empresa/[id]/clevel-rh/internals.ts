// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/clevel-rh` (§5.4 + §13.9 derivado + §3.5
// MASTER_ESCOPO_B8, ME-078a).
//
// Padrão S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, função auxiliar
// e loader vive neste `internals.ts` irmão.
//
// IMPORTANTE: este módulo é importado por `CLevelRHClient.tsx` (client
// component — `'use client'`). Portanto, NÃO pode importar VALUE-LEVEL
// de routers, services, db/client ou qualquer módulo que transite por
// `mysql2`, `node:crypto` ou `node:buffer`. Apenas constantes puras,
// tipos (import type) e funções sem side-effects server.
//
// O loader `loadCLevelRHPage` vive em `page.tsx` (server component),
// que pode importar livremente de routers/services.
//
// Origem canônica:
// - CAMADA_UI §5.4 (botões `[C-level]` e `[RH]` da landing) + §3.2
//   (menu item 7 "C-level e RH" → `/clevel-rh`) + §13.9 (Cadastro RH).
// - CAMADA_AUTH §10.3 linha 807 + §10.9 (rotas dentro-de-empresa
//   exclusivas Bruno) + §12 (matriz — isRH toggle exclusivo Bruno; RF
//   exclusivo Bruno).
// - CAMADA_NEGOCIO §16.7 (routers de cadastro).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §4.5 (`employees`).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.5 (ficha ME-078).
//
// **RV-13.** Todo export tem consumidor real (`page.tsx` +
// `CLevelRHClient.tsx` + testes):
//   - `parseCompanyIdParam` → `page.tsx`.
//   - `resolveDatabaseUrl` → `page.tsx` + `actions.ts`.
//   - `getIniciaisFromName` → `CLevelRHClient.tsx` + testes.
//   - `CLEVEL_RH_TABS` → `CLevelRHClient.tsx`.
//   - `parseTabParam` → `page.tsx`.
//   - `CADASTRAR_RH_UNAVAILABLE_TOOLTIP` → `CLevelRHClient.tsx`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canônicas bit-exact
// -----------------------------------------------------------------------

/** §5.4 canônica bit-exact — 2 abas horizontais da rota `/clevel-rh`. */
export const CLEVEL_RH_TABS = ['clevels', 'rh'] as const;

/** Tipo canônico das abas. */
export type CLevelRHTab = (typeof CLEVEL_RH_TABS)[number];

/** Aba default canônica bit-exact — sempre C-levels na chegada. */
export const CLEVEL_RH_TAB_DEFAULT: CLevelRHTab = 'clevels';

/**
 * §13.9 — tooltip canônico bit-exact do botão `[+ Cadastrar novo RH]`
 * na Aba 2, renderizado DESABILITADO no MVP até ME-078b canonicamente
 * entregue (rota `/colaborador/novo?preset=rh`). Precedente canônico
 * S503.
 */
export const CADASTRAR_RH_UNAVAILABLE_TOOLTIP = 'Disponivel apos ME-078b.' as const;

// -----------------------------------------------------------------------
// Helpers de string canônicos
// -----------------------------------------------------------------------

/**
 * Extrai iniciais canônicas bit-exact do nome (primeira letra do primeiro
 * nome + primeira letra do último nome) em maiúsculas, para placeholder
 * de foto/avatar. Padrão bit-exact ao mockup canônico + ME-077.
 */
export function getIniciaisFromName(name: string): string {
  const partes = name.trim().split(/\s+/);
  const primeiraParte = partes[0];
  if (primeiraParte === undefined || primeiraParte.length === 0) {
    return '';
  }
  const ultimaParte = partes[partes.length - 1] ?? primeiraParte;
  const primeira = primeiraParte[0] ?? '';
  const ultima = ultimaParte[0] ?? '';
  return (primeira + ultima).toUpperCase();
}

/**
 * Normaliza a query string `?tab=…` para um `CLevelRHTab` canônico.
 * Aceita `'rh'` (aba RH) — qualquer outro valor cai no default
 * `'clevels'`.
 */
export function parseTabParam(raw: string | undefined): CLevelRHTab {
  if (raw === 'rh') {
    return 'rh';
  }
  return CLEVEL_RH_TAB_DEFAULT;
}

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

/**
 * Parse canônico bit-exact de `params.id` — aceita apenas inteiros
 * positivos. Padrão consolidado ME-074/075/076/077.
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
 * Resolve a URL canônica do banco a partir do ambiente. Padrão
 * consolidado ME-074/075/076/077.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}
