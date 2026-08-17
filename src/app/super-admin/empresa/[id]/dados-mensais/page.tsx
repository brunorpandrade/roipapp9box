// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// dados-mensais` (§14.13, ME-079a). DÉCIMA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.13 (integral: header + abas + navegação por mês +
//   comportamento por status + tabela editável).
// - CAMADA_AUTH §10.4 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §3.11 (routers `monthlyData.*` +
//   `monthlyClosure.*`) + §3.12 (validações canônicas de campo) + §4
//   (fechamento mensal, desbloqueio e recálculo).
// - CAMADA_DADOS §4.3 (`companyMonthlyData`) + §7.1-§7.2
//   (`performanceData/Variable`) + §7.6-§7.7 (closure + unlock).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.6.1 (ficha).
//
// Pattern §2.1 canônico preservado via consumo dos helpers
// `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl` → `page.tsx`. `DadosMensaisClient` renderizado
// abaixo do Layout.
//
// **RV-08.** Nenhuma decisão aqui — loaders inline no server component
// (padrão §2.1 B8).
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { DadosMensaisClient } from './DadosMensaisClient';
import { currentMes, parseCompanyIdParam, parseTabParam, resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Loader server-side: closure status do mês atual (leitura direta)
// -----------------------------------------------------------------------

// prettier-ignore
import {
  getMonthlyClosureStatusByMonth,
} from '../../../../../server/services/monthlyClosureStatus';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  // ME-080a — `?tab=` na URL controla aba inicial (default `rh`).
  // Consumido para linkagem canônica a partir do CompanyLandingClient
  // (card "Dados do mês — Líderes" → `?tab=lider`).
  readonly searchParams?: Promise<{ tab?: string }>;
}

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

    // Status inicial do mês atual para SSR.
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
          // CompanyDisplayInfo nao inclui logoUrl.
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
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
