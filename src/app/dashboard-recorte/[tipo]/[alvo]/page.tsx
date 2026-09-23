// ROIP APP 9BOX — rota nativa `/dashboard-recorte/[tipo]/[alvo]` (ESPEC
// §7 recortes + §8 matriz de acesso; ME §8.06.6b). Dá acesso multipersona
// aos dashboards agregados de departamento, equipe direta e cadeia total:
// RH e C-level total veem qualquer recorte; C-level restrito e líder só os
// da própria cadeia (PC1h). Bruno segue pela rota dedicada
// `/super-admin/empresa/[id]/dashboard-recorte/...`.
//
// Guard defense-in-depth espelhando `/organograma` (§10.4): redirect do
// super_admin, roles permitidas, escopo hierárquico por perfil. A
// autorização do alvo específico é feita por `canAccessRecorte` (PC1h).
// Loader e client reaproveitados da rota Bruno (RV-14).
//
// **RV-13.** Todo import consumido. **RV-14.** 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../db/client';
import { COLORS } from '../../../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../../../lib/session/platformMenuContext';
import {
  loadRecorteAggregatePage,
  type RecorteAlvo,
} from '../../../../server/services/companyAggregate';
import { resolveHierarchicalScope } from '../../../../server/services/hierarchicalScope';
import { canAccessRecorte, resolveRecorteAlvo } from '../../../../server/services/recorteAccess';
import { getServerSession } from '../../../../server/session/serverSession';
import {
  RecorteDashboardClient, // rota Bruno reaproveitada (RV-14 — §8.06.6b)
} from '../../../super-admin/empresa/[id]/dashboard-recorte/[tipo]/[alvo]/RecorteDashboardClient';

interface PageProps {
  readonly params: Promise<{ tipo: string; alvo: string }>;
  readonly searchParams: Promise<{ trimestre?: string }>;
}

const ALLOWED_ROLES = ['rh', 'rh_lider', 'clevel', 'lider'] as const;

export default async function DashboardRecorteNativoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (!ALLOWED_ROLES.includes(session.role as (typeof ALLOWED_ROLES)[number])) {
    redirect('/access-denied?rota=/dashboard-recorte');
  }

  const { tipo, alvo: alvoRaw } = await props.params;
  if (tipo !== 'departamento' && tipo !== 'equipe' && tipo !== 'cadeia') {
    notFound();
  }
  const { trimestre: trimestrePedido } = await props.searchParams;

  const companyId = session.companyId;
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }

    const resolvido = await resolveRecorteAlvo(client.db, companyId, tipo, alvoRaw);
    if (resolvido === null) {
      notFound();
    }
    const alvo: RecorteAlvo = resolvido.alvo;

    // §11.9 PC1h — escopo por perfil. RH/RH-Líder e C-level total: null
    // (sem restrição). C-level restrito e líder: Set da cadeia própria.
    let scope: ReadonlySet<string> | null;
    let selfNodeId: string;
    if (session.role === 'clevel') {
      const cFlags = menu.cLevel;
      if (cFlags === null) {
        redirect('/access-denied?rota=/dashboard-recorte');
      }
      scope = await resolveHierarchicalScope(
        client.db,
        { role: session.role, userId: session.userId, companyId },
        { cLevelCount: cFlags.cLevelCount, acessoTotal: cFlags.acessoTotal },
      );
      selfNodeId = `clevel-${session.userId}`;
    } else {
      scope = await resolveHierarchicalScope(client.db, {
        role: session.role,
        userId: session.userId,
        companyId,
      });
      selfNodeId = `employee-${session.userId}`;
    }

    const autorizado = await canAccessRecorte(client.db, companyId, scope, selfNodeId, alvo);
    if (!autorizado) {
      redirect('/access-denied?rota=/dashboard-recorte');
    }

    const data = await loadRecorteAggregatePage(
      client.db,
      companyId,
      trimestrePedido ?? null,
      alvo,
    );
    const basePath = `/dashboard-recorte/${tipo}/${alvoRaw}`;

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
              {resolvido.titulo}
            </h1>
            <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
              {session.companyDisplayName}
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
