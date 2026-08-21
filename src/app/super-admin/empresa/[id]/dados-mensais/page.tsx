// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/
// dados-mensais` (§14.13, ME-079a + refactor ME-086b).
//
// Refactor canonico ME-086b: componente `DadosMensaisClient` foi
// canonicamente extraido para `src/components/dados-mensais/`
// (D-086b-2 B aprovada — padrao bit-exact `RelatoriosClient` ME-B9-CR).
// Esta rota agora consome o compartilhado com `variant='super_admin'`
// + injecao canonica das actions super-admin (bit-exact ao original
// pre-ME-086b).
//
// Origem canonica:
// - CAMADA_UI §14.13 (integral).
// - CAMADA_AUTH §10.4 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §11.
// - CAMADA_DADOS §4.3 + §7.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam`,
// `resolveDatabaseUrl`, `currentMes`, `parseTabParam` → `page.tsx`.
// `DadosMensaisClient` compartilhado renderizado abaixo do Layout.
// Actions super-admin injetadas via prop `actions` (D-086b-2 B).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { DadosMensaisClient } from '../../../../../components/dados-mensais/DadosMensaisClient';
import type { DadosMensaisClientActions } from '../../../../../components/dados-mensais/internals';
import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';
// prettier-ignore
import {
  getMonthlyClosureStatusByMonth,
} from '../../../../../server/services/monthlyClosureStatus';

import {
  getClosureStatusAction,
  getLeadersStatusAction,
  loadMonthlyFormAction,
  saveMonthlyRHDataAction,
  unlockMonthAction,
} from './actions';
import { currentMes, parseCompanyIdParam, parseTabParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  // ME-080a — `?tab=` na URL controla aba inicial (default `rh`).
  readonly searchParams?: Promise<{ tab?: string }>;
}

// -----------------------------------------------------------------------
// Actions canonicas super-admin injetadas via prop (D-086b-2 B)
// -----------------------------------------------------------------------

const SUPER_ADMIN_ACTIONS: DadosMensaisClientActions = {
  loadMonthlyForm: loadMonthlyFormAction,
  saveMonthlyRHData: saveMonthlyRHDataAction,
  getClosureStatus: getClosureStatusAction,
  getLeadersStatus: getLeadersStatusAction,
  unlockMonth: unlockMonthAction,
  // Actions especificas de variant='rh' NAO injetadas (RH-only).
};

export default async function DadosMensaisPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware
  // `/super-admin/empresa/`).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    // Status inicial do mes atual para SSR.
    const mes = currentMes();
    const closureRow = await getMonthlyClosureStatusByMonth(client.db, companyId, mes);
    const initialStatus = closureRow?.status ?? 'aberto';

    // ME-080a — resolve aba inicial a partir de `?tab=` (default `rh`).
    const rawSearch = (await props.searchParams) ?? {};
    const initialTab = parseTabParam(rawSearch.tab);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });

    // D088 — passa `companyId` para substituir placeholder `[id]`
    // nos hrefs do menu §3.2.
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{
          companyDisplayName: company.nomeFantasia,
        }}
      >
        <DadosMensaisClient
          companyId={companyId}
          companyName={company.nomeFantasia}
          initialMes={mes}
          initialStatus={initialStatus}
          initialTab={initialTab}
          variant="super_admin"
          actions={SUPER_ADMIN_ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
