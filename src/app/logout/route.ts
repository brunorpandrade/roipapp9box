// ROIP APP 9BOX — rota canonica `/logout` (ME-Rota-C-D075 + ME-072-fix3).
//
// Origem canonica:
// - `menuConfig.ts` MENU_SUPER_ADMIN_GLOBAL + MENU_RH + demais menus
//   canonicos §3 registram `href: '/logout'` como ultimo item comum.
// - DOC 02 §5.1 (Super Admin — sessao encerra apenas por acao explicita).
// - DOC 02 §5.2 (perfis administrativos — logout invalida cookie).
//
// Contrato canonico bit-exact:
// - `GET /logout` — Route Handler canonico Next 15 App Router.
// - Passos:
//   1. Se o request e prefetch automatico do Next 15 (header
//      `Next-Router-Prefetch: 1` ou `Purpose: prefetch`), retorna 204
//      sem tocar no cookie. Isso protege contra apagamento silencioso
//      da sessao por prefetch de `<Link href="/logout">` visivel no
//      viewport (bug canonico bit-exact detectado em ME-072-fix3 —
//      GET com side effect destrutivo e anti-pattern).
//   2. Caso contrario, `clearSessionCookie()` — apaga o cookie
//      `session` httpOnly.
//   3. `redirect('/')` — encaminha ao login unificado.
// - Sem branching por role: todos os perfis vao para `/` apos logout.
//   O Super Admin encontra em `/` o botao rodape `[Acessar como
//   Super Admin]` (§14.1) para retornar ao login proprio.
// - S366 + CC068 canonicamente preservados bit-exact: este arquivo
//   exporta apenas `GET` (Route Handler aceito por Next 15).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `GET` → runtime Next 15 App Router (rota `/logout` acionada por
//     clique no menu item "Sair" de cada perfil).

import { redirect } from 'next/navigation';

import { clearSessionCookie } from '../../server/session/serverSession';

/**
 * Detecta se o request e um prefetch automatico do Next 15 App Router.
 * Next 15 injeta `Next-Router-Prefetch: 1` em prefetches de RSC. Alguns
 * browsers tambem enviam `Purpose: prefetch` (padrao HTML link rel=prefetch).
 */
function isPrefetchRequest(req: Request): boolean {
  return (
    req.headers.get('Next-Router-Prefetch') === '1' ||
    req.headers.get('next-router-prefetch') === '1' ||
    req.headers.get('Purpose') === 'prefetch' ||
    req.headers.get('purpose') === 'prefetch'
  );
}

export async function GET(req: Request): Promise<Response> {
  if (isPrefetchRequest(req)) {
    // Prefetch canonico do Next 15 — retorna 204 No Content sem tocar
    // no cookie. O clique real do usuario nao envia estes headers e
    // dispara o fluxo normal abaixo.
    return new Response(null, { status: 204 });
  }
  await clearSessionCookie();
  redirect('/');
}
