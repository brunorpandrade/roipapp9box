'use server';

// ROIP APP 9BOX — server action `setMenuMode` (ME 3.5 Dispatch 4).
//
// Persiste o modo do menu ('clevel' | 'rh') em cookie server-readable
// (HttpOnly, SameSite=Strict, Path=/, session cookie) e redireciona
// para a rota inicial canonica do novo modo:
//
//   - modo 'rh'     → /painel-rh
//   - modo 'clevel' → /painel-clevel
//
// Regua de acesso canonica (defense-in-depth): apenas C-level com
// `cLevelMembers.isRH === true` pode alternar. As demais roles nunca
// veem o toggle no cliente (RV-13 via `canToggleMenuMode` em
// `PlatformMenuContext`), mas o server action valida a matriz do
// mesmo jeito (RV-11 defense-in-depth — cliente nao e authority).
//
// Regras canonicas de escrita do cookie (D3 aprovado em bloco):
//   - name: MENU_MODE_COOKIE_NAME ('roip.menu.mode')
//   - httpOnly: true (SSR le; JS cliente nao le nem escreve)
//   - sameSite: 'strict' (nao vaza em cross-site)
//   - path: '/' (vale em toda a plataforma)
//   - sem maxAge (session cookie — limpa ao fechar navegador)
//
// **RV-12.** Zero SQL cru — persistencia via Drizzle
// (`loadCLevelSessionContext`).
// **RV-13.** Consumidor real: `<PainelToggle />` (client component do
// D4) via `<form action={setMenuModeAction}>`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { MENU_MODE_COOKIE_NAME, parseMenuMode, type MenuMode } from '../../lib/menu/menuMode';
import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import { getServerSession } from '../../server/session/serverSession';

/** Rota inicial canonica de cada modo (D3, opcao A aprovada em bloco). */
const HOME_BY_MODE: Record<MenuMode, string> = {
  clevel: '/painel-clevel',
  rh: '/painel-rh',
};

/**
 * Server action canonica. Recebe um FormData com o campo `mode` (valor
 * canonico 'clevel' | 'rh'). Valida a sessao, valida que o titular e
 * C-level com `isRH=true`, escreve o cookie e redireciona para a home
 * do novo modo.
 *
 * Erros silenciosos (redirect para '/' sem cookie novo) sao canonicos
 * para caso de:
 *   - sessao ausente ou expirada;
 *   - role diferente de 'clevel';
 *   - clevel sem isRH=true;
 *   - registro em `cLevelMembers` ausente (sessao invalida);
 *   - `mode` no FormData fora do enum canonico.
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
  if (session === null || session.kind !== 'platform' || session.role !== 'clevel') {
    redirect('/');
  }

  // Defense-in-depth: mesmo caminho de decisao do menuMode do D3 —
  // apenas C-level com `cLevelMembers.isRH=true` alterna.
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const cctx = await loadCLevelSessionContext(client.db, session.companyId, session.userId);
    if (cctx === null || cctx.isRH !== true) {
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
