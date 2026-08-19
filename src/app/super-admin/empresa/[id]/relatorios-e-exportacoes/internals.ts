// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` (§12, ME-079a).
//
// Padrão S366 CC068 canonizado desde ME-070. CC071 compliant: zero
// imports VALUE-LEVEL de módulos server-only.
//
// Origem canônica:
// - CAMADA_UI §12 integral (§12.1-§12.11).
// - CAMADA_AUTH §10.7 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §13 (Central de Relatórios — 6 cards).
// - MASTER_ESCOPO_B8.md §2.1 + §3.6.3 (ficha).
//
// **RV-13.** Todo export consumido por `page.tsx`, `actions.ts` ou
// `RelatoriosClient.tsx`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact
// -----------------------------------------------------------------------
//
// **ME-B9-CR (L125):** as constantes UI compartilhadas com a rota
// `/central-relatorios` foram extraidas para
// `src/components/central-relatorios/internals.ts`:
//   - `CARD_DEFS`, `CardId`, `NIVEL_OPTIONS`, `NivelEscopo`, `ICON_COLORS`.
// Consumidas por `RelatoriosClient.tsx` (compartilhado) e pelas actions
// desta rota via import cross-directory. Este arquivo mantem apenas os
// helpers especificos do Super Admin (`parseCompanyIdParam`) + o helper
// duplicado por rota `resolveDatabaseUrl` + os canonicos ainda vivos
// (`DESKTOP_ONLY_MESSAGE`, `formatTrimestreLabel`).

/** §12.11 — Central é desktop-only. */
export const DESKTOP_ONLY_MESSAGE =
  'Esta tela está disponível apenas em dispositivos desktop ' + '(viewport ≥ 1024px).';

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

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

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}

/**
 * Formata trimestre canônico `YYYY-QN` para rótulo pt-BR.
 * Ex: "2025-Q4" → "4º trimestre de 2025".
 */
export function formatTrimestreLabel(tri: string): string {
  const match = /^(\d{4})-Q(\d)$/.exec(tri);
  if (match === null) {
    return tri;
  }
  const year = match[1];
  const q = match[2];
  return `${q}º trimestre de ${year}`;
}
