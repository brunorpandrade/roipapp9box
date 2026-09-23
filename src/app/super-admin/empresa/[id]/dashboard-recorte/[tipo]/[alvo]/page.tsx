// ROIP APP 9BOX — rota Bruno
// `/super-admin/empresa/[id]/dashboard-recorte/[tipo]/[alvo]` (ESPEC §7
// recortes + §10; ME §8.06.5). Dashboards agregados de departamento,
// equipe direta e cadeia total. Guard super_admin (defense-in-depth ao
// middleware; acesso multipersona vem com a navegação analítica §8.06.6).
// Loaders puros em `companyAggregate`.
//
// **RV-13.** Todo import consumido. **RV-14.** 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { COLORS } from '../../../../../../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../../../lib/session/resolveProfileKey';
import {
  loadRecorteAggregatePage,
  type RecorteAlvo,
} from '../../../../../../../server/services/companyAggregate';
import { resolveRecorteAlvo } from '../../../../../../../server/services/recorteAccess';
import { Layout } from '../../../../../../../components/shell/Layout';
import { getServerSession } from '../../../../../../../server/session/serverSession';
import { parseCompanyIdParam } from '../../../organograma/internals';

import { RecorteDashboardClient } from './RecorteDashboardClient';

interface PageProps {
  readonly params: Promise<{ id: string; tipo: string; alvo: string }>;
  readonly searchParams: Promise<{ trimestre?: string }>;
}

export default async function DashboardRecortePage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId, tipo, alvo: alvoRaw } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }
  if (tipo !== 'departamento' && tipo !== 'equipe' && tipo !== 'cadeia') {
    notFound();
  }

  const { trimestre: trimestrePedido } = await props.searchParams;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const resolvido = await resolveRecorteAlvo(client.db, companyId, tipo, alvoRaw);
    if (resolvido === null) {
      notFound();
    }
    const alvo: RecorteAlvo = resolvido.alvo;

    const data = await loadRecorteAggregatePage(
      client.db,
      companyId,
      trimestrePedido ?? null,
      alvo,
    );

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

    const basePath = `/super-admin/empresa/${companyId}/dashboard-recorte/${tipo}/${alvoRaw}`;

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
              {resolvido.titulo}
            </h1>
            <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
              {company.nomeFantasia}
            </p>
          </div>
          <RecorteDashboardClient data={data} basePath={basePath} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
