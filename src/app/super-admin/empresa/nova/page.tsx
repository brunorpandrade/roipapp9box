// ROIP APP 9BOX — rota canonica /super-admin/empresa/nova
// (ME-Rota-C-D074 — fechamento canonico bit-exact de D074).
//
// Origem canonica:
// - DOC 05 §5.3 (botao [+ Cadastrar nova empresa] no painel Super Admin
//   global) → destino canonico bit-exact desta rota.
// - DOC 05 §13.1 (Aba 1 "Parametros gerais" — 9 secoes canonicas com save
//   unico bit-exact). Referencia visual: `cadastro_empresa_v1.html` +
//   `delta_cadastro_empresa_lgpd_v1.html`.
// - DOC 05 §18.7 (mensagens canonicas literais bit-exact para toast e
//   validacoes).
// - DOC 05 §5.4 (redirect pos-save para /super-admin/empresa/[id] —
//   dashboard da empresa recem-criada).
// - DOC 02 §10.3 + §9.1 — exclusivo Bruno; middleware ja aplica; este
//   page.tsx faz guard defensivo defense-in-depth (S317).
// - DOC 05 §3.1 (menu Super Admin global) — mesma sidebar do painel
//   global (Bruno esta fora de escopo de empresa nesta rota).
//
// Contrato canonico bit-exact:
// - Server component: valida sessao Super Admin (defense-in-depth
//   §10.3); resolve `resolveMenuItems` do menu global (§3.1); renderiza
//   `NovaEmpresaClient` dentro do `Layout` canonico.
//
// **RV-13.** Cada export tem chamador na propria ME:
// - `NovaEmpresaPage` (default export) → runtime Next 15 App Router.
//
// **S366 + CC068** canonicamente preservados bit-exact — este arquivo
// exporta APENAS o default (`page.tsx` Next 15 App Router aceita apenas
// default export para Route Segment). Helpers em `NovaEmpresaClient.tsx`
// irmao (client component 'use client').

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { COLORS } from '../../../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

import { NovaEmpresaClient } from './NovaEmpresaClient';

export default async function NovaEmpresaPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware). `/super-admin/*`
  // ja e restrito a `super_admin` no middleware; este guard revalida
  // localmente por defesa em profundidade (S317 canonizada em ME-057b).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  // Menu global §3.1 (Bruno fora de escopo de empresa nesta rota).
  const profileKey = resolveProfileKey({
    session,
    isRH: false,
    isLider: false,
    acessoTotal: false,
    hasDescendingChain: false,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
  });

  const menuItems = resolveMenuItems(profileKey, false);
  if (menuItems === null) {
    throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
  }

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: 'super_admin_global',
        user: { displayName: session.displayName },
        showNotificationBell: true,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.text.primary,
              margin: 0,
            }}
          >
            Cadastrar nova empresa
          </h1>
          <p
            style={{
              fontSize: 13,
              color: COLORS.text.secondary,
              margin: '4px 0 0 0',
            }}
          >
            Preencha os parâmetros gerais da nova empresa. A aba &quot;Famílias de função&quot; será
            habilitada após o primeiro salvamento (§13.1 DOC 05).
          </p>
        </div>
        <NovaEmpresaClient />
      </div>
    </Layout>
  );
}
