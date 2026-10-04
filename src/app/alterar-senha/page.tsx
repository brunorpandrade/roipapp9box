// ROIP APP 9BOX — /alterar-senha page canonica (refactor ME-082; ME 3.5
// D6 migra menu para `loadPlatformMenuCtxCookie` para habilitar toggle
// em C-level+isRH).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { findCompanyDisplayInfo } from '../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { loadPlatformMenuCtxCookie } from '../../lib/session/platformMenuCookie';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

import { AlterarSenhaClient } from './AlterarSenhaClient';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../lib/session/headerUser';

function resolvePainelHref(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): string {
  switch (role) {
    case 'rh':
    case 'rh_lider':
      return '/painel-rh';
    case 'clevel':
      return '/painel-clevel';
    case 'lider':
      return '/painel-lider';
  }
}

export default async function AlterarSenhaPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
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
      throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
    }
    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'super_admin_global',
          user: headerUserFromSession(session),
          showNotificationBell: true,
        }}
      >
        <AlterarSenhaClient
          titularKind="super_admin"
          forcado={false}
          destinoAposTroca="/meus-dados"
          displayName={session.displayName}
        />
      </Layout>
    );
  }

  const forcado = session.passwordSet === false;

  if (forcado) {
    const painelHref = resolvePainelHref(session.role);
    return (
      <AlterarSenhaClient
        titularKind="platform"
        forcado
        destinoAposTroca={painelHref}
        displayName={session.displayName}
      />
    );
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — menu via cookie helper (habilita toggle em C-level+isRH).
    const menu = await loadPlatformMenuCtxCookie(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    const menuItems = menu.menuItems;
    const showNotificationBell = menu.showNotificationBell;
    const panelToggleNode = menu.canToggleMenuMode ? (
      <PainelToggle currentMode={menu.menuMode} />
    ) : undefined;

    const companyInfo = await findCompanyDisplayInfo(client.db, session.companyId);
    const companyDisplayName = companyInfo?.nomeFantasia ?? session.companyDisplayName;
    const companyLogoUrl = companyInfo?.logoUrl ?? session.companyLogoUrl ?? undefined;

    return (
      <Layout
        menuItems={menuItems}
        panelToggle={panelToggleNode}
        header={{
          leftMode: 'in_company',
          companyDisplayName,
          companyLogoUrl,
          user: headerUserFromSession(session),
          showNotificationBell,
        }}
      >
        <AlterarSenhaClient
          titularKind="platform"
          forcado={false}
          destinoAposTroca="/meus-dados"
          displayName={session.displayName}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
