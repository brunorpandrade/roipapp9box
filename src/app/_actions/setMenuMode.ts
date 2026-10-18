'use server';

// ROIP APP 9BOX — server action `setMenuMode` (ME 3.5 Dispatch 4 +
// ampliacao ME-1.16 Conversa 4b Despacho B — D-B8).
//
// Persiste o modo do menu ('clevel' | 'rh' | 'lider') em cookie
// server-readable (HttpOnly, SameSite=Strict, Path=/, session cookie) e
// redireciona para a rota inicial canonica do novo modo:
//
//   - modo 'rh'     → /painel-rh
//   - modo 'clevel' → /painel-clevel
//   - modo 'lider'  → /painel-lider
//
// Regua de acesso canonica (defense-in-depth): dois cenarios canonicos:
//
//   (a) C-level com `cLevelMembers.isRH === true` alterna 'clevel' <->
//       'rh' (precedente ME 3.5).
//   (b) RH-Lider (`role='rh_lider'`) com liderados ativos > 0 alterna
//       'rh' <-> 'lider' (ampliacao ME-1.16).
//
// As demais roles nunca veem o toggle no cliente, mas o server action
// valida a matriz do mesmo jeito (RV-11 defense-in-depth).
//
// Regras canonicas de escrita do cookie (D3 aprovado em bloco):
//   - name: MENU_MODE_COOKIE_NAME ('roip.menu.mode')
//   - httpOnly: true (SSR le; JS cliente nao le nem escreve)
//   - sameSite: 'strict' (nao vaza em cross-site)
//   - path: '/' (vale em toda a plataforma)
//   - sem maxAge (session cookie — limpa ao fechar navegador)
//
// **RV-12.** Zero SQL cru — persistencia via Drizzle
// (`loadCLevelSessionContext`, `loadRhSessionFlags`).
// **RV-13.** Consumidor real: `<PainelToggle />` (client component do
// D4) via `<form action={setMenuModeAction}>`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { MENU_MODE_COOKIE_NAME, parseMenuMode, type MenuMode } from '../../lib/menu/menuMode';
import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
import { getServerSession } from '../../server/session/serverSession';

/** Rota inicial canonica de cada modo (ME-1.16 — expandido com 'lider'). */
const HOME_BY_MODE: Record<MenuMode, string> = {
  clevel: '/painel-clevel',
  rh: '/painel-rh',
  lider: '/painel-lider',
};

/**
 * Server action canonica. Recebe um FormData com o campo `mode` (valor
 * canonico 'clevel' | 'rh' | 'lider'). Valida a sessao, valida que o
 * titular tem direito ao modo alvo, escreve o cookie e redireciona para
 * a home do novo modo.
 *
 * Erros silenciosos (redirect para '/' sem cookie novo) sao canonicos
 * para caso de:
 *   - sessao ausente ou expirada;
 *   - role fora dos cenarios canonicos;
 *   - clevel sem isRH=true alvo em 'rh';
 *   - rh_lider sem liderados ativos alvo em 'lider';
 *   - registro ausente (sessao invalida);
 *   - `mode` no FormData fora do enum canonico ou incompativel com a role.
 *
 * Sem TRPCError aqui — o server action e chamado direto pelo `<form>`,
 * e o front nao renderiza mensagem de erro (o toggle nao teria como
 * aparecer se a regua tivesse quebrado no server side).
 */
export async function setMenuModeAction(formData: FormData): Promise<void> {
  const raw = formData.get('mode');
  const mode = parseMenuMode(typeof raw === 'string' ? raw : null);
  if (mode === null) {
    redirect('/');
  }

  const session = await getServerSession();
  if (session === null || session.kind !== 'platform') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Cenario (a) — C-level com isRH=true alterna clevel <-> rh.
    if (session.role === 'clevel') {
      if (mode === 'lider') {
        redirect('/');
      }
      const cctx = await loadCLevelSessionContext(client.db, session.companyId, session.userId);
      if (cctx === null || cctx.isRH !== true) {
        redirect('/');
      }
    } else if (session.role === 'rh_lider') {
      // Cenario (b) — RH-Lider com liderados ativos alterna rh <-> lider.
      if (mode === 'clevel') {
        redirect('/');
      }
      const flags = await loadRhSessionFlags(client.db, session.userId);
      if (flags === null) {
        redirect('/');
      }
      if (mode === 'lider' && flags.countLiderados <= 0) {
        redirect('/');
      }
    } else {
      // Outras roles (rh puro, lider puro) nunca alternam.
      redirect('/');
    }
  } finally {
    await closeDbClient(client);
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: MENU_MODE_COOKIE_NAME,
    value: mode,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    // sem maxAge → session cookie
  });

  redirect(HOME_BY_MODE[mode]);
}
