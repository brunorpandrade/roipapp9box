// ROIP APP 9BOX — helpers canonicos de menuMode (ME 3.5 Dispatch 3 +
// ampliacao ME-1.16 Conversa 4b Despacho B — D-B8).
//
// Escopo canonicamente aprovado:
//   - `session.role` continua sendo o enum fechado de 5 valores (§2.2
//     DOC 02); NAO cria roles novas.
//   - Duas identidades canonicas usam o toggle:
//       (a) C-level com `cLevelMembers.isRH=true` → alterna 'clevel' <->
//           'rh' (preserva comportamento historico da ME 3.5).
//       (b) RH-Lider (`role='rh_lider'`) com liderados ativos > 0 →
//           alterna 'rh' <-> 'lider' (ampliacao ME-1.16).
//   - O menu de cada modo continua sendo o menu canonico ja existente
//     (§3.3 MENU_RH, §3.6/§3.7 MENU_LIDER_*, §3.8/§3.9 MENU_CLEVEL_*).
//
// Este arquivo abriga:
//   - Tipo `MenuMode` (ampliado para incluir 'lider').
//   - Constante `MENU_MODE_COOKIE_NAME`.
//   - Funcao pura `parseMenuMode(raw)` tolerante a cookie corrompido.
//   - Funcao pura `resolveMenuMode(rawCookie)` com fallback canonico.
//
// **RV-13.** Consumidores reais: `loadPlatformMenuContext`,
// `loadPlatformMenuCtxCookie`, `setMenuModeAction`, teste unit
// `tests/unit/me-3-5-d3-menu-mode.test.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Modo canonico do menu. Dois cenarios canonicos usam alternancia:
 *
 *   (a) C-level com `cLevelMembers.isRH=true` → `'clevel'` | `'rh'`.
 *   (b) RH-Lider com liderados ativos > 0 → `'rh'` | `'lider'`.
 *
 * Nos demais casos (clevel sem isRH, lider puro, rh puro sem liderados)
 * o modo e ignorado — o toggle nem renderiza.
 */
export type MenuMode = 'clevel' | 'rh' | 'lider';

/**
 * Nome canonico do cookie server-readable que persiste o modo do menu
 * entre requests. Escrito pela server action `setMenuMode`; lido pelo
 * `loadPlatformMenuContext`.
 *
 * Atributos canonicos aplicados na escrita:
 *   - `httpOnly: true` — SSR le; JS do cliente nao le nem escreve.
 *   - `sameSite: 'strict'` — nao vaza em requests cross-site.
 *   - `path: '/'` — vale em toda a plataforma.
 *   - sem `maxAge` — session cookie (limpa ao fechar navegador).
 */
export const MENU_MODE_COOKIE_NAME = 'roip.menu.mode' as const;

/** Modo canonico padrao quando o cookie esta ausente, invalido ou corrompido. */
export const MENU_MODE_DEFAULT: MenuMode = 'clevel';

/**
 * Parser puro tolerante do valor do cookie. Retorna `null` para valores
 * fora do enum canonico (`clevel`, `rh` ou `lider`) — o consumidor
 * decide o fallback (tipicamente `MENU_MODE_DEFAULT`).
 *
 * Trata cookie ausente, string vazia, valor desconhecido ou qualquer
 * outro input nao esperado como `null` (nao lanca).
 */
export function parseMenuMode(raw: string | null | undefined): MenuMode | null {
  if (raw === 'clevel') {
    return 'clevel';
  }
  if (raw === 'rh') {
    return 'rh';
  }
  if (raw === 'lider') {
    return 'lider';
  }
  return null;
}

/**
 * Resolvedor canonico: parseia o cookie e aplica o fallback
 * `MENU_MODE_DEFAULT` quando invalido ou ausente. Zero I/O — recebe o
 * valor cru ja lido pelo consumidor.
 */
export function resolveMenuMode(rawCookie: string | null | undefined): MenuMode {
  const parsed = parseMenuMode(rawCookie);
  if (parsed === null) {
    return MENU_MODE_DEFAULT;
  }
  return parsed;
}
