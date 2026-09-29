// ROIP APP 9BOX — rota base RH `/central-relatorios` (ME-B9-CR,
// dual-route L123; ME 3.5 D6 migra menu para `loadPlatformMenuCtx
// Cookie` para habilitar o toggle Painel C-level / Painel RH).
//
// Origem canonica:
// - CAMADA_UI §12 integral (Central de Relatorios).
// - CAMADA_AUTH §9.15 (RH/RH-Lider/Bruno; C-level `acessoTotal=true`).
// - CAMADA_NEGOCIO §13 (6 cards + procs).
//
// ME 3.5 D6: migracao pontual de `loadPlatformMenuContext` para
// `loadPlatformMenuCtxCookie` — habilita toggle em C-level+isRH.
// Guard de admissao pre-existente mantido bit-exact.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { RelatoriosClient } from '../../components/central-relatorios/RelatoriosClient';
import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { loadPlatformMenuCtxCookie } from '../../lib/session/platformMenuCookie';
import { getServerSession } from '../../server/session/serverSession';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

import {
  generateEvolucaoTrimestralXlsxClevelAction,
  generateEvolucaoTrimestralXlsxRHAction,
  generateRelatorioExecutivoClevelAction,
  generateRelatorioExecutivoRHAction,
  generateResumoDashboardXlsxClevelAction,
  generateResumoDashboardXlsxRHAction,
  listClosedQuartersClevelAction,
  listClosedQuartersRHAction,
  listDepartmentsClevelAction,
  listDepartmentsRHAction,
  listLeadersClevelAction,
  listLeadersRHAction,
  startExecutiveReportDownloadTokenClevelAction,
  startExecutiveReportDownloadTokenRHAction,
  startReportDownloadTokenClevelAction,
  startReportDownloadTokenRHAction,
} from './actions';

export default async function CentralRelatoriosRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/central-relatorios');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — menu via cookie helper (habilita toggle em C-level+isRH).
    const menu = await loadPlatformMenuCtxCookie(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    if (session.role === 'clevel') {
      // CU/CT/C-level+isRH acessam; CF (`clevel_restricted`) nao.
      if (menu.profileKey !== 'clevel_full' && menu.profileKey !== 'rh') {
        redirect('/access-denied?rota=/central-relatorios');
      }
      return (
        <Layout
          menuItems={menu.menuItems}
          panelToggle={
            menu.canToggleMenuMode ? <PainelToggle currentMode={menu.menuMode} /> : undefined
          }
          header={{
            leftMode: 'in_company',
            companyDisplayName: session.companyDisplayName,
            companyLogoUrl: session.companyLogoUrl ?? undefined,
            user: { displayName: session.displayName },
            showNotificationBell: false,
          }}
        >
          <RelatoriosClient
            companyId={session.companyId}
            companyName={session.companyDisplayName}
            variant="clevel"
            actions={{
              listClosedQuarters: listClosedQuartersClevelAction,
              listDepartments: listDepartmentsClevelAction,
              listLeaders: listLeadersClevelAction,
              generateRelatorioExecutivo: generateRelatorioExecutivoClevelAction,
              startReportDownloadToken: startReportDownloadTokenClevelAction,
              startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenClevelAction,
              generateResumoDashboardXlsx: generateResumoDashboardXlsxClevelAction,
              generateEvolucaoTrimestralXlsx: generateEvolucaoTrimestralXlsxClevelAction,
            }}
          />
        </Layout>
      );
    }

    return (
      <Layout
        menuItems={menu.menuItems}
        panelToggle={
          menu.canToggleMenuMode ? <PainelToggle currentMode={menu.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: menu.showNotificationBell,
        }}
      >
        <RelatoriosClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          variant="rh"
          actions={{
            listClosedQuarters: listClosedQuartersRHAction,
            listDepartments: listDepartmentsRHAction,
            listLeaders: listLeadersRHAction,
            generateRelatorioExecutivo: generateRelatorioExecutivoRHAction,
            startReportDownloadToken: startReportDownloadTokenRHAction,
            startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenRHAction,
            generateResumoDashboardXlsx: generateResumoDashboardXlsxRHAction,
            generateEvolucaoTrimestralXlsx: generateEvolucaoTrimestralXlsxRHAction,
          }}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
