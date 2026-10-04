// ROIP APP 9BOX — rota canonica base RH `/dados-mensais` (§14.13,
// ME-086b; ME 3.5 D6 admite clevel+isRH).
//
// Origem canonica:
// - CAMADA_UI §14.13 (dados mensais RH — abas RH + Lideres +
//   navegacao por mes + comportamento por status).
// - CAMADA_AUTH §10.4 linha 825 (ampliada ME 3.5 D6 — clevel liberado
//   na rota; guard fino server-side).
// - CAMADA_NEGOCIO §11 (motor de dados mensais).
//
// ME 3.5 D6: substitui `loadRhSessionFlags`+`resolveProfileKey`+
// `resolveMenuItems` pelo helper canonico `loadRhLikePageContext`.
// Para clevel-as-RH, decisao canonica: aba inicial `rh` (default) e
// Aba Lideres canonicamente read-only (`profileKey='rh'` sintetiza
// RH puro; a variante `variant='rh'` ja e usada bit-exact).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { DadosMensaisClient } from '../../components/dados-mensais/DadosMensaisClient';
import type { DadosMensaisClientActions } from '../../components/dados-mensais/internals';
import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { getServerSession } from '../../server/session/serverSession';
import { getMonthlyClosureStatusByMonth } from '../../server/services/monthlyClosureStatus';

import {
  criarSolicitacaoDesbloqueioAction,
  getClosureStatusAction,
  getLeadersStatusAction,
  hasPendingUnlockAction,
  listCompanyLeadersRHAction,
  listMesesFechadosAction,
  loadMonthlyFormAction,
  saveMonthlyRHDataAction,
  downloadRHTemplateRHAction,
  uploadRHDataRHAction,
} from './actions';
import { currentMes, parseTabParam } from './internals';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../lib/session/headerUser';

interface PageProps {
  readonly searchParams?: Promise<{ tab?: string }>;
}

// -----------------------------------------------------------------------
// Actions canonicas RH-facing injetadas via prop (D-086b-2 B)
// -----------------------------------------------------------------------

const RH_ACTIONS: DadosMensaisClientActions = {
  loadMonthlyForm: loadMonthlyFormAction,
  saveMonthlyRHData: saveMonthlyRHDataAction,
  getClosureStatus: getClosureStatusAction,
  getLeadersStatus: getLeadersStatusAction,
  createUnlockRequest: criarSolicitacaoDesbloqueioAction,
  hasPendingRequest: hasPendingUnlockAction,
  listMesesFechados: listMesesFechadosAction,
  listCompanyLeaders: listCompanyLeadersRHAction,
  downloadRHTemplateMonthly: downloadRHTemplateRHAction,
  uploadRHDataMonthly: uploadRHDataRHAction,
};

export default async function DadosMensaisRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — helper unico admite rh/rh_lider/clevel+isRH. Para
    // clevel-as-RH, `profileKey='rh'` sintetizado ja canoniza a aba
    // inicial `rh` (default) + Aba Lideres read-only bit-exact.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/dados-mensais');
    }

    const mes = currentMes();
    const closureRow = await getMonthlyClosureStatusByMonth(client.db, session.companyId, mes);
    const initialStatus = closureRow?.status ?? 'aberto';

    const rawSearch = (await props.searchParams) ?? {};
    const initialTab = parseTabParam(rawSearch.tab);

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
        <DadosMensaisClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          initialMes={mes}
          initialStatus={initialStatus}
          initialTab={initialTab}
          variant="rh"
          actions={RH_ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
