// ROIP APP 9BOX — rota Bruno `/super-admin/empresa/[id]/dashboard-empresa`
// (ESPEC §7 empresa + §10 + §14.25; ME §8.06.4). Primeiro dashboard
// agregado. Segue o pattern das rotas dentro-de-empresa (CAMADA_AUTH
// §10.3/§10.9 — exclusivo de Bruno; guard defense-in-depth ao
// middleware). Loaders puros em `companyAggregate`.
//
// **RV-13.** Todo import consumido. **RV-14.** 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { loadCompanyAggregatePage } from '../../../../../server/services/companyAggregate';
import { getServerSession } from '../../../../../server/session/serverSession';

import { EmpresaDashboardClient } from './EmpresaDashboardClient';
import { parseCompanyIdParam } from '../organograma/internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ trimestre?: string }>;
}

export default async function DashboardEmpresaPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const { trimestre: trimestrePedido } = await props.searchParams;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const data = await loadCompanyAggregatePage(client.db, companyId, trimestrePedido ?? null);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
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
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
              Dashboard da empresa
            </h1>
            <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
              {company.nomeFantasia}
            </p>
          </div>
          <EmpresaDashboardClient
            data={data}
            basePath={`/super-admin/empresa/${companyId}/dashboard-empresa`}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
