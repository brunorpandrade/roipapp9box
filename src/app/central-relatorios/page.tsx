// ROIP APP 9BOX — rota base RH `/central-relatorios` (ME-B9-CR,
// dual-route L123 canonizado em ME-084 pareado com
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` ME-079a).
//
// Origem canonica:
// - CAMADA_UI §12 integral (Central de Relatorios).
// - CAMADA_AUTH §9.15 (/central-relatorios — RH/RH-Lider/Bruno; C-level e
//   Lider bloqueados).
// - CAMADA_AUTH §10.7 (Bruno usa `/super-admin/empresa/[id]/…`, mas
//   matriz allow em `/central-relatorios` mantida defense-in-depth).
// - CAMADA_NEGOCIO §13 (6 cards + procs).
//
// Diferencas canonicas bit-exact vs rota Super Admin:
// - Rota base (sem prefixo `/super-admin/empresa/[id]`).
// - `companyId` derivado de `session.companyId` (nao de `params.id`).
// - Guard defensivo bit-exact ao padrao ME-084 (`/todos-os-colaboradores`):
//   super_admin redirect `/super-admin`; role fora de rh/rh_lider redirect
//   `/access-denied?rota=/central-relatorios`.
// - Header `leftMode: 'in_company'` sem `superAdminContext`.
// - Menu `MENU_RH` / `MENU_RH_LIDER_C1` / `MENU_RH_LIDER_C2` conforme
//   `resolveMenuFlagsForRH` derivar do RH autenticado.
// - `RelatoriosClient` compartilhado bit-exact via import de
//   `src/components/central-relatorios/RelatoriosClient` com prop
//   `variant='rh'` + 6 actions RH-facing injetadas.
// - Board deck one-pager escondido do render (D-CR-3).
//
// **RV-13.** Todo import consumido no runtime Next 15:
// - `getServerSession`, `redirect` → guard + guard cruzado.
// - `createDbClient`/`closeDbClient` → transacao unica com finally.
// - `resolveMenuFlagsForRH` → menu §3.3-§3.5.
// - `resolveProfileKey`, `resolveMenuItems` → gera menu canonico.
// - `Layout` → shell canonico bit-exact.
// - `RelatoriosClient` → renderiza a Central compartilhada.
// - 6 actions RH-facing → props `actions` injetadas.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { RelatoriosClient } from '../../components/central-relatorios/RelatoriosClient';
import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { getServerSession } from '../../server/session/serverSession';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

import {
  generateRelatorioExecutivoClevelAction,
  generateRelatorioExecutivoRHAction,
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

  // §10.3 canonica: Bruno usa `/super-admin` (contexto dentro-de-empresa
  // via prefixo dedicado); rota base sem `companyId` nao faz sentido para
  // ele. Padrao bit-exact `/todos-os-colaboradores` (ME-084).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  // Guard defense-in-depth ao middleware `matrix.ts` §10.7 (matriz
  // canonica ampliada pela ME-B9-CR3 — super_admin/rh/rh_lider/clevel
  // allow; lider deny). C-level requer `acessoTotal=true` (§12.2 CAMADA_UI
  // — CF nao acessa) — filtro delegado ao guard interno abaixo.
  if (session.role !== 'rh' && session.role !== 'rh_lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/central-relatorios');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME-fila6 D1 — helper unico: CU/CT passam, CF nega (antes o filtro
    // era apenas `acessoTotal` e o RF do C-level era ignorado no menu).
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    if (session.role === 'clevel') {
      if (menu.profileKey !== 'clevel_full') {
        redirect('/access-denied?rota=/central-relatorios');
      }
      return (
        <Layout
          menuItems={menu.menuItems}
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
            }}
          />
        </Layout>
      );
    }

    return (
      <Layout
        menuItems={menu.menuItems}
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
          }}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
