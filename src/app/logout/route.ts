// ROIP APP 9BOX — rota canonica `/logout` (ME-Rota-C-D075).
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
//   1. `clearSessionCookie()` — apaga o cookie `session` httpOnly.
//   2. `redirect('/')` — encaminha ao login unificado.
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

export async function GET(): Promise<Response> {
  await clearSessionCookie();
  redirect('/');
}
