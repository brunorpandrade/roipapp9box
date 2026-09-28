// ROIP APP 9BOX — /meus-dados page canonica (ME-082; ME 3.5 D6 migra
// menu para `loadPlatformMenuCtxCookie` para habilitar toggle em
// C-level+isRH).
//
// Origem canonica: DOC 02 §4.6 + DOC 05 §14.5.
//
// Rota transversal (DOC 02 §10.2 allow para super_admin, rh, rh_lider,
// clevel, lider; deny colaborador puro via middleware/matrix). Render
// condicional H1a (Super Admin) vs H1b (demais perfis administrativos)
// resolvido pelo payload retornado por `myData.getForCurrentUser`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX, ReactNode } from 'react';
import { cookies } from 'next/headers';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { findCompanyDisplayInfo } from '../../lib/logs/companyHistoryLog';
import type { MenuItem } from '../../lib/menu/menuConfig';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
// eslint-disable-next-line @stylistic/max-len -- path canonico do guard
import { requireAuthenticatedNonCollaborator } from '../../lib/routes/requireAuthenticatedNonCollaborator';
import { loadPlatformMenuCtxCookie } from '../../lib/session/platformMenuCookie';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { myDataRouter } from '../../server/routers/myData';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { MeusDadosClient } from './MeusDadosClient';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

const SESSION_COOKIE = 'session';
const createMyDataCaller = createCallerFactory(myDataRouter);
const loaderRateLimiter = createRateLimiter();

export default async function MeusDadosPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  const guard = requireAuthenticatedNonCollaborator(session);
  if (guard.kind === 'unauthenticated') {
    redirect('/');
  }

  const activeSession = guard.session;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  const rawToken = sessionCookie?.value ?? '';

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: loaderRateLimiter,
        bearerToken: rawToken,
        ip: null,
      }),
    );
    const payload = await caller.getForCurrentUser();

    let menuItems: readonly MenuItem[] | null = null;
    let companyDisplayName: string | undefined;
    let companyLogoUrl: string | undefined;
    let showNotificationBell = false;
    let panelToggleNode: ReactNode = undefined;

    if (activeSession.kind === 'super_admin') {
      const profileKey = resolveProfileKey({
        session: activeSession,
        isRH: false,
        isLider: false,
        acessoTotal: false,
        hasDescendingChain: false,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      });
      const items = resolveMenuItems(profileKey, false);
      if (items === null) {
        throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
      }
      menuItems = items;
      showNotificationBell = true;
    } else {
      companyDisplayName = activeSession.companyDisplayName;
      companyLogoUrl = activeSession.companyLogoUrl ?? undefined;
      // ME 3.5 D6 — menu via cookie helper (habilita toggle em C-level+isRH).
      const menu = await loadPlatformMenuCtxCookie(client.db, activeSession);
      if (menu === null) {
        redirect('/');
      }
      menuItems = menu.menuItems;
      showNotificationBell = menu.showNotificationBell;
      panelToggleNode = menu.canToggleMenuMode ? (
        <PainelToggle currentMode={menu.menuMode} />
      ) : undefined;
    }

    let companyLogoResolved: string | null = null;
    if (activeSession.kind === 'platform') {
      const companyInfo = await findCompanyDisplayInfo(client.db, activeSession.companyId);
      if (companyInfo !== null) {
        companyDisplayName = companyInfo.nomeFantasia;
        companyLogoResolved = companyInfo.logoUrl;
      }
    }

    const displayName =
      activeSession.kind === 'super_admin' ? activeSession.displayName : activeSession.displayName;

    return (
      <Layout
        menuItems={menuItems}
        panelToggle={panelToggleNode}
        header={{
          leftMode: activeSession.kind === 'super_admin' ? 'super_admin_global' : 'in_company',
          companyDisplayName,
          companyLogoUrl: companyLogoResolved ?? companyLogoUrl ?? undefined,
          user: { displayName },
          showNotificationBell,
        }}
      >
        <MeusDadosClient payload={payload} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
