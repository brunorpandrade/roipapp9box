// ROIP APP 9BOX — rota canonica `/login-super-admin` (DOC 05 §14.2 +
// DOC 02 §4.2). ME-Rota-C-D075 — fundacao pre-ME-072.
//
// Origem canonica:
// - DOC 05 §14.2 (login Super Admin — layout identico ao unificado,
//   selo "Area do Super Admin", campo e-mail, botao rodape
//   `[Voltar ao login principal]`).
// - DOC 02 §4.2 (fluxo canonico a-e backend).
// - DOC 02 §5.1 (JWT sem `exp` — sessao nunca expira).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
// - Referencia visual: `login_super_admin_v1.html`.
//
// Contrato canonico bit-exact:
// - Server component: aterrissagem canonica bit-exact publica.
// - Se sessao Super Admin ja valida, redireciona para `/super-admin`.
// - Se sessao platform valida, redireciona ao painel canonico do role.
// - Caso contrario, renderiza `<LoginSuperAdminClient />`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `LoginSuperAdminPage` (default) → runtime Next 15 App Router.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getServerSession } from '../../server/session/serverSession';

import { LoginSuperAdminClient } from './LoginSuperAdminClient';

export default async function LoginSuperAdminPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session !== null) {
    if (session.kind === 'super_admin') {
      redirect('/super-admin');
    }
    // session.kind === 'platform' — Bruno digitou URL do Super Admin
    // por engano estando logado como platform. Encaminha ao painel do
    // role (defense-in-depth).
    if (session.role === 'rh' || session.role === 'rh_lider') {
      redirect('/painel-rh');
    }
    if (session.role === 'clevel') {
      redirect('/painel-clevel');
    }
    redirect('/painel-lider');
  }

  return <LoginSuperAdminClient />;
}
