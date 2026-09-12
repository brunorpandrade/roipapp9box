// ROIP APP 9BOX — rota canonica `/meu-portal/lideranca-direta`
// (ME-B10-02, S246-C + S253, DOC 05 §7.3).
//
// Server component canonico da resposta ao Instrumento D no canal
// platform. Padrao bit-a-bit da rota `/meu-portal/auto-avaliacao` com
// dois ajustes:
// - Catalogo `INSTRUMENT_D_CATALOG`.
// - Endpoint `POST /api/portal/save-instrument-d`.
//
// Cadencia canonica §8.6 (S156): D existe apenas em Q1 e Q3. Se nao
// houver card ativo, redireciona para `/meu-portal`. Bloqueio C-level
// respondendo D e imposto pelo backend (§8.6 Bloqueio 3 -> 403).

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { LikertFormShell } from '../../../components/instruments/LikertFormShell';
import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { INSTRUMENT_D_CATALOG } from '../../../lib/instruments/instrumentDCatalog';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadRhSessionFlags } from '../../../lib/session/rhSessionFlags';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { loadCompanyForRhPanel, loadMeuPortalData } from '../../painel-rh/internals';

const HREF_PENDENCIAS = '/meu-portal';

export default async function LiderancaDiretaPlatformPage(): Promise<JSX.Element> {
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
    const card = data.pendencias.find((p) => p.instrumento === 'avaliacaoLiderancaDireta');
    if (card === undefined || card.cicloReferencia === null || card.cicloReferencia.length === 0) {
      redirect(HREF_PENDENCIAS);
    }
    const trimestre: string = card.cicloReferencia;

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
        <LikertFormShell
          titulo="Avaliação da liderança direta"
          subtitulo={`Trimestre ${trimestre}`}
          trimestreAtual={trimestre}
          catalogo={INSTRUMENT_D_CATALOG}
          canalAutenticacao="platform"
          endpointSubmit="/api/portal/save-instrument-d"
          hrefPendencias={HREF_PENDENCIAS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
