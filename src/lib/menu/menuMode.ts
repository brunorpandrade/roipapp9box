// ROIP APP 9BOX — helpers canonicos de menuMode (ME 3.5 Dispatch 3).
//
// Escopo canonicamente aprovado em bloco (D2, D3):
//   - `session.role` continua sendo o enum de 5 valores fechado (§2.2
//     DOC 02); NAO cria role nova `clevel_rh`.
//   - Dupla identidade "C-level + operador de RH" e organizada
//     visualmente via toggle "Painel C-level / Painel RH" (Dispatch 4)
//     que persiste o modo em cookie server-readable.
//   - O menu de cada modo continua sendo o menu canonico ja existente
//     (§3.3 MENU_RH ou §3.8/3.9 MENU_CLEVEL_*) — nenhuma configuracao de
//     menu nova, apenas selecao entre configuracoes existentes.
//
// Este arquivo abriga:
//   - Tipo `MenuMode`.
//   - Constante `MENU_MODE_COOKIE_NAME` (nome canonico do cookie).
//   - Funcao pura `parseMenuMode(raw)` (tolerante a cookie corrompido).
//   - Funcao pura `resolveMenuMode(rawCookie)` com fallback canonico.
//
// I/O de cookie (`cookies()` do next/headers) fica no consumidor
// server-side (ex.: `loadPlatformMenuContext`) — aqui e apenas logica
// pura, testavel sem Next.
//
// **RV-13.** Consumidores reais: `loadPlatformMenuContext` (Dispatch 3);
// server action `setMenuMode` (Dispatch 4); teste unit unico
// `tests/unit/me-3-5-d3-menu-mode.test.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Modo canonico do menu para C-level que tambem opera RH (ME 3.5).
 *
 *   - 'clevel': mostra `MENU_CLEVEL_FULL` ou `MENU_CLEVEL_RESTRICTED`
 *      conforme `acessoTotal` e `cLevelCount` (comportamento historico
 *      pre-ME 3.5 preservado).
 *   - 'rh': mostra `MENU_RH` (§3.3) — mesmo menu que um RH puro veria.
 *
 * Consumido apenas quando `session.role === 'clevel' AND
 * cLevelMembers.isRH === true`. Para as demais roles (rh, rh_lider,
 * lider, super_admin) o modo e ignorado.
 */
export type MenuMode = 'clevel' | 'rh';

/**
 * Nome canonico do cookie server-readable que persiste o modo do menu
 * entre requests. Escrito pela server action `setMenuMode` (Dispatch 4);
 * lido pelo `loadPlatformMenuContext` (Dispatch 3).
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
 * fora do enum canonico (`clevel` ou `rh`) — o consumidor decide o
 * fallback (tipicamente `MENU_MODE_DEFAULT`).
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
