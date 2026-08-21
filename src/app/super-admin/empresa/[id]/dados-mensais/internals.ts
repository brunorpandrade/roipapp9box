// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/dados-mensais` (§14.13, ME-079a +
// refactor ME-086b).
//
// Refactor canonico ME-086b (D-086b-2 B aprovada): helpers puros de
// UI (constantes, tipos, formatadores de mes) foram MIGRADOS
// canonicamente para `src/components/dados-mensais/internals.ts` para
// consumo compartilhado pelo `DadosMensaisClient.tsx` compartilhado.
// Este arquivo passa a conter apenas o que e canonicamente exclusivo
// da rota Bruno server-side: `parseCompanyIdParam`, `resolveDatabaseUrl`,
// + reexport de `parseTabParam` e `currentMes` (consumidos pela
// `page.tsx`).
//
// Padrao S366 CC068 preservado bit-exact: `page.tsx` importa daqui.
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam` → `page.tsx`.
//   - `resolveDatabaseUrl` → `page.tsx` + `actions.ts`.
//   - `parseTabParam` (reexport) → `page.tsx`.
//   - `currentMes` (reexport) → `page.tsx`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

// Reexport bit-exact do modulo canonico compartilhado ME-086b.
// Preserva assinaturas do consumo pela `page.tsx` + pelo teste legado
// `tests/integration/me079a-dados-mensais-page.test.ts` sem alteracao
// bit-exact (RV-13 preservado — todo consumidor real anterior ao
// refactor continua funcionando).
export {
  currentMes,
  DADOS_MENSAIS_TAB_DEFAULT,
  DADOS_MENSAIS_TABS,
  formatMesLabel,
  nextMes,
  parseTabParam,
  prevMes,
  STATUS_COLORS,
  STATUS_LABELS,
  TAB_LABELS,
  type DadosMensaisTab,
  type StatusMes,
} from '../../../../../components/dados-mensais/internals';

// -----------------------------------------------------------------------
// Parse canonico de params (exclusivo desta rota — [id] dinamico)
// -----------------------------------------------------------------------

/**
 * Parse canonico de `params.id` — aceita apenas inteiros positivos.
 * Padrao consolidado ME-074 a ME-078b.
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
 * Resolve DATABASE_URL do ambiente. Padrao consolidado ME-074+.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
