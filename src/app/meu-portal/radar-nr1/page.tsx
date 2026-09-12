// ROIP APP 9BOX — rota canonica `/meu-portal/radar-nr1`
// (ME-B10-03, S246-C + S254, DOC 05 §7.4).
//
// Server component canonico da resposta ao Radar NR-1 no canal
// platform (S246-C — respondente autenticado por sessao platform).
// Padrao herdado das rotas `/meu-portal/{auto-avaliacao,lideranca-direta}`
// da ME-B10-02, com dois ajustes canonicos:
// - Shell dedicado `Nr1FormShell` (nao `LikertFormShell`).
// - Sem passagem de `trimestreAtual` — o `Nr1FormShell` resolve
//   `cicloDbId` internamente via `POST /api/portal/nr1-form-state`.
//
// Guard cruzado platform (§10.7 CAMADA_AUTH): rejeita sessao ausente
// e super_admin. C-level (S239) recebe redirect para `/meu-portal`
// quando o card de pendencia esta ausente do `loadMeuPortalData` —
// mesmo tratamento adotado em A/D. O backend `nr1-form-state` bloqueia
// C-level com 403 canonico se a rota for acessada diretamente.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Nr1FormShell } from '../../../components/instruments/Nr1FormShell';
import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadRhSessionFlags } from '../../../lib/session/rhSessionFlags';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { loadCompanyForRhPanel, loadMeuPortalData } from '../../painel-rh/internals';

const HREF_PENDENCIAS = '/meu-portal';

export default async function RadarNr1PlatformPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await loadCompanyForRhPanel(client.db, session.companyId);
    if (company === null) {
      redirect('/');
    }

    const rhFlags = await loadRhSessionFlags(client.db, session.userId);
    const isRH = rhFlags !== null ? rhFlags.isRH : false;
    const isLider =
      rhFlags !== null ? rhFlags.isLider : session.role === 'lider' || session.role === 'rh_lider';
    const hasDescendingChain = rhFlags !== null ? rhFlags.hasDescendingChain : false;
    const isResponsavelFinanceiro = rhFlags !== null ? rhFlags.isResponsavelFinanceiro : false;

    const profileKey = resolveProfileKey({
      session,
      isRH,
      isLider,
      acessoTotal: false,
      hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const userType: 'employee' | 'clevel' = session.role === 'clevel' ? 'clevel' : 'employee';
    const data = await loadMeuPortalData(client.db, session.companyId, session.userId, userType);
    const card = data.pendencias.find((p) => p.instrumento === 'radarNR1');
    if (card === undefined) {
      redirect(HREF_PENDENCIAS);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <Nr1FormShell canalAutenticacao="platform" hrefPendencias={HREF_PENDENCIAS} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
