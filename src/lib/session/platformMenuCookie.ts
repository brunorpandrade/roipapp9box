// ROIP APP 9BOX — helper canonico `loadPlatformMenuCtxCookie`
// (ME 3.5 Dispatch 5).
//
// Wrapper server-side de `loadPlatformMenuContext` que le o cookie
// `roip.menu.mode` via `next/headers` e passa o modo resolvido para o
// contexto de menu. Consumido pelos server components de painel-rh e
// painel-clevel para habilitar automaticamente o toggle "Painel
// C-level / Painel RH" quando `role='clevel' AND isRH=true`.
//
// Callsites nao-atualizados continuam usando `loadPlatformMenuContext`
// direto (D3 mantem o parametro opcional `menuMode` com default 'clevel',
// preservando o comportamento historico bit-a-bit — RV-13). Em uma
// futura passada, todos os ~15 callsites podem migrar para este wrapper
// sem regressao.
//
// **RV-13.** Consumidores reais: `src/app/painel-rh/page.tsx` e
// `src/app/painel-clevel/page.tsx` (Dispatch 5).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';

import type { RoipDatabase } from '../../db/client';
import { MENU_MODE_COOKIE_NAME, resolveMenuMode } from '../menu/menuMode';

import {
  loadPlatformMenuContext,
  type PlatformMenuContext,
  type PlatformSession,
} from './platformMenuContext';

/**
 * Le o cookie `roip.menu.mode` (server-readable) e chama
 * `loadPlatformMenuContext` com o modo resolvido. Cookie ausente ou
 * corrompido → fallback canonico `MENU_MODE_DEFAULT` ('clevel').
 */
export async function loadPlatformMenuCtxCookie(
  db: RoipDatabase,
  session: PlatformSession,
): Promise<PlatformMenuContext | null> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(MENU_MODE_COOKIE_NAME)?.value;
  const menuMode = resolveMenuMode(rawCookie);
  return loadPlatformMenuContext(db, session, menuMode);
}
