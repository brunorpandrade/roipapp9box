// ROIP APP 9BOX — rota nativa `/dashboard-empresa` (ESPEC §7 empresa +
// §8 matriz de acesso + §11 cards; DOC 02 §3.3 + §10.4 linha 853;
// ME §8.06). Dá a RH, RH-Líder e C-level de acesso total o dashboard
// agregado da empresa — o mesmo da rota Bruno (financeiro §3.3 +
// turnover §11), reusando `EmpresaDashboardClient` e
// `loadCompanyAggregatePage` (RV-14). C-level restrito e líder ficam na
// própria cadeia (recortes) — barrados por `canViewCompanyAggregate`.
// Bruno segue pela rota dedicada
// `/super-admin/empresa/[id]/dashboard-empresa`.
//
// Guard defense-in-depth espelhando `/organograma` e `/dashboard-recorte`
// (§10.4): redirect do super_admin, roles permitidas, escopo hierárquico
// por perfil (§11.9 PC1h). Só escopo total (null) alcança o agregado da
// empresa (ESPEC §8 + §10.4 linha 853).
//
// **RV-13.** Todo import consumido. **RV-14.** 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import {
  canViewCompanyAggregate,
  NATIVE_EMPRESA_DASHBOARD_HREF,
} from '../../lib/scope/companyAggregateAccess';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { loadCompanyAggregatePage } from '../../server/services/companyAggregate';
import { resolveHierarchicalScope } from '../../server/services/hierarchicalScope';
import { getServerSession } from '../../server/session/serverSession';

import {
  EmpresaDashboardClient, // rota Bruno reaproveitada (RV-14 — §8.06.4)
} from '../super-admin/empresa/[id]/dashboard-empresa/EmpresaDashboardClient';

interface PageProps {
  readonly searchParams: Promise<{ trimestre?: string }>;
}

const ALLOWED_ROLES = ['rh', 'rh_lider', 'clevel', 'lider'] as const;

export default async function DashboardEmpresaNativoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (!ALLOWED_ROLES.includes(session.role as (typeof ALLOWED_ROLES)[number])) {
    redirect('/access-denied?rota=/dashboard-empresa');
  }

  const { trimestre: trimestrePedido } = await props.searchParams;
  const companyId = session.companyId;
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }

    // §11.9 PC1h — escopo por perfil. RH/RH-Líder e C-level total: null
    // (sem restrição). C-level restrito e líder: Set da cadeia própria.
    let scope: ReadonlySet<string> | null;
    if (session.role === 'clevel') {
      const cFlags = menu.cLevel;
      if (cFlags === null) {
        redirect('/access-denied?rota=/dashboard-empresa');
      }
      scope = await resolveHierarchicalScope(
        client.db,
        { role: session.role, userId: session.userId, companyId },
        { cLevelCount: cFlags.cLevelCount, acessoTotal: cFlags.acessoTotal },
      );
    } else {
      scope = await resolveHierarchicalScope(client.db, {
        role: session.role,
        userId: session.userId,
        companyId,
      });
    }

    // ESPEC §8 + DOC 02 §10.4 (linha 853): o agregado da empresa é só de
    // escopo total. Perfil restrito (líder, C-level restrito) fica na
    // própria cadeia — recortes pela rota `/dashboard-recorte`.
    if (!canViewCompanyAggregate(scope)) {
      redirect('/access-denied?rota=/dashboard-empresa');
    }

    const data = await loadCompanyAggregatePage(client.db, companyId, trimestrePedido ?? null);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
              Dashboard da empresa
            </h1>
            <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
              {session.companyDisplayName}
            </p>
          </div>
          <EmpresaDashboardClient data={data} basePath={NATIVE_EMPRESA_DASHBOARD_HREF} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
