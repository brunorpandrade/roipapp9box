// ROIP APP 9BOX — rota canonica `/cycle-management` (ME-B9.1 §14.18).
//
// Origem canonica:
// - DOC 05 §14.18 (Rota `/cycle-management` — Gestao de ciclos).
// - DOC 02 §10.5 — matrix.ts libera super_admin, rh, rh_lider; nega
//   clevel e lider (access-denied canonico §9.6).
// - Mockup canonico `cycle_management_v1.html`.
//
// Padrao canonico L123 bit-exact ao `/pendencias-portal`:
//   - Platform (RH/RH-Lider/C-level+isRH) renderiza aqui.
//   - Super Admin redireciona para `/super-admin` (gemea dedicada
//     `/super-admin/desbloqueios` — D-B9.1-SA-DESBLOQ, fora desta ME).
//   - C-level puro ou lider: `loadRhLikePageContext` retorna null →
//     redirect para `/access-denied?rota=/cycle-management`.
//
// **RV-13.** Consumido pelo roteador do Next (App Router).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { ToastProvider } from '../../components/ui/Toast';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { COLORS } from '../../lib/design-tokens/colors';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { getServerSession } from '../../server/session/serverSession';

import { CycleManagementClient } from './CycleManagementClient';
import {
  cancelUnlockRequestAction,
  criarSolicitacaoDesbloqueioAction,
  listCalendarioAction,
  listCycleScheduleAction,
  listHistoricoUnlockRequestsAction,
  listMesesFechadosAction,
  listPendingUnlockRequestsAction,
} from './actions';
import { CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS, parseCycleScheduleFilters } from './filters';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CycleManagementPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    // Bruno canonicamente opera via `/super-admin/desbloqueios` + rota
    // dedicada. D-B9.1-SA-DESBLOQ cobre essa interface — fora desta ME.
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/cycle-management');
    }

    const rawParams = (await props.searchParams) ?? {};
    const initialFilters = parseCycleScheduleFilters(rawParams);

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
          user: { displayName: session.displayName },
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <ToastProvider>
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
                Gestão de ciclos
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: COLORS.text.secondary,
                  margin: '4px 0 0 0',
                }}
              >
                {session.companyDisplayName} · visão consolidada dos ciclos e fluxo de desbloqueio.
              </p>
            </div>
            <CycleManagementClient
              companyId={session.companyId}
              initialFilters={initialFilters}
              defaultFilters={CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS}
              actions={{
                listCycleSchedule: listCycleScheduleAction,
                listPending: listPendingUnlockRequestsAction,
                listHistorico: listHistoricoUnlockRequestsAction,
                listCalendario: listCalendarioAction,
                cancelUnlockRequest: cancelUnlockRequestAction,
                createUnlockRequest: criarSolicitacaoDesbloqueioAction,
                listMesesFechados: listMesesFechadosAction,
              }}
            />
          </div>
        </ToastProvider>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
