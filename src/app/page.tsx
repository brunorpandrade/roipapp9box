// ROIP APP 9BOX — rota canonica `/` (login unificado — DOC 05 §14.1 +
// DOC 02 §4.1). ME-Rota-C-D075 — substitui stub ME-001 pela fundacao
// canonica bit-exact.
//
// Origem canonica:
// - DOC 05 §14.1 (login unificado — layout tela cheia, brand ROIP APP
//   no header, card centralizado 420px, background `#F9FAFB`).
// - DOC 02 §4.1 (fluxo canonico a-i backend + estados de UI).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
// - Referencia visual: `login_unificado_v1.html`.
//
// Contrato canonico bit-exact:
// - Server component: aterrissagem canonica bit-exact publica.
// - Se sessao valida ja existir, redireciona canonicamente:
//   - `session.kind === 'super_admin'` → `/super-admin`.
//   - `session.kind === 'platform'` → painel derivado do role
//     (`/painel-rh` para `rh` e `rh_lider`, `/painel-clevel` para
//     `clevel`, `/painel-lider` para `lider`).
// - Caso contrario, renderiza `<LoginUnifiedClient />` — client
//   component canonico bit-exact que hospeda o form CPF/senha + modal
//   `[Esqueci minha senha]` + botao rodape `[Acessar como Super Admin]`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HomePage` (default export) → runtime Next 15 App Router.
//
// **S366 + CC068** canonicamente preservados bit-exact — este arquivo
// exporta APENAS o default (`page.tsx` Next 15 App Router aceita apenas
// default export para Route Segment). Helpers em `LoginUnifiedClient.tsx`
// irmao (client component 'use client').

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getServerSession } from '../server/session/serverSession';

import { LoginUnifiedClient } from './LoginUnifiedClient';

export default async function HomePage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session !== null) {
    if (session.kind === 'super_admin') {
      redirect('/super-admin');
    }
    // session.kind === 'platform'
    if (session.role === 'rh' || session.role === 'rh_lider') {
      redirect('/painel-rh');
    }
    if (session.role === 'clevel') {
      redirect('/painel-clevel');
    }
    redirect('/painel-lider');
  }

  return <LoginUnifiedClient />;
}
