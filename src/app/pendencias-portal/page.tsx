// ROIP APP 9BOX — rota canonica `/pendencias-portal` (ME-058 §14.23;
// ME 3.5 D6 admite clevel+isRH).
//
// Origem canonica:
// - DOC 05 §14.23 (Rota `/pendencias-portal`) — carga inicial com filtros
//   default; 3 cards resumo, 6 filtros, tabela 11 colunas, ordenacao
//   tripla canonica S328.
// - DOC 02 §10.4 + §9.9 — matrix.ts §10.4 restringe roles; clevel
//   liberado desde ME 3.5 D5 com guard fino server-side.
//
// ME 3.5 D6: substitui `loadRhSessionFlags`+`resolveProfileKey`+
// `resolveMenuItems` pelo helper canonico `loadRhLikePageContext`.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { loadPendenciasPage } from '../../lib/pendencias/pendenciasEngine';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { getServerSession } from '../../server/session/serverSession';

import { PendenciasClient } from './PendenciasClient';
import { parsePendenciasFilters } from './filters';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../lib/session/headerUser';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PendenciasPortalPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    // Bruno usa /super-admin/empresa/[id]/pendencias-portal.
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — helper unico admite rh/rh_lider/clevel+isRH.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/pendencias-portal');
    }

    const rawParams = (await props.searchParams) ?? {};
    const filters = parsePendenciasFilters(rawParams);

    const initialResult = await loadPendenciasPage({
      db: client.db,
      companyId: session.companyId,
      filters,
      page: 1,
      pageSize: 50,
    });

    return (
      <Layout
        menuItems={rhCtx.menuItems}
        panelToggle={
          rhCtx.canToggleMenuMode ? <PainelToggle currentMode={rhCtx.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: headerUserFromSession(session),
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: 0,
              }}
            >
              Pendências no portal
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Colaboradores com instrumentos pendentes ou atrasados no portal do colaborador. Envie
              lembretes individualmente ou em massa; cooldown de 72 horas por (colaborador,
              instrumento).
            </p>
          </div>
          <PendenciasClient
            companyId={null}
            initialResult={initialResult}
            initialFilters={filters}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
