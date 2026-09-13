// ROIP APP 9BOX — rota canonica `/meu-portal/auto-avaliacao`
// (ME-B10-02, S246-C + S253, DOC 05 §7.1).
//
// Server component canonico da resposta ao Instrumento A no canal
// platform (S246-C — respondente autenticado por sessao platform).
// Padrao herdado de `/meu-portal/page.tsx`:
// 1. `getServerSession` obrigatorio; redireciona super_admin ao painel
//    proprio e ausencia para `/`.
// 2. Resolve `titularType` do `session.role` bit-a-bit ao mapeamento
//    canonico (clevel -> 'clevel', demais -> 'employee').
// 3. Consulta `MeuPortalData` via `loadMeuPortalData` (mesmo helper
//    canonico ja consumido pelo `/meu-portal`) e filtra o card ativo
//    do instrumento. Sem card -> redireciona para `/meu-portal`.
// 4. `cicloReferencia` do card e injetado como `trimestreAtual` no
//    `LikertFormShell` com `canalAutenticacao: 'platform'`.
//
// Sem query ao `companies.timezone` porque o `cicloReferencia` ja e
// resolvido canonicamente pelo engine no timezone da empresa —
// sub-decisao adjacente L130 mais precisa e mais barata do que
// re-calcular no server component.
//
// C-level respondendo A: §6.2 S099 bloqueia no backend (403); esta
// rota nao encena guard adicional porque o card do engine ja filtra
// C-level de `avaliacaoLiderancaDireta` e o backend do save-A bloqueia
// C-level explicitamente.
//
// ME-B10-05 S257: `mobileHideSidebar={true}` — em viewport `< 1024px`
// o Layout oculta sidebar 256px + header 56px, deixando o
// `LikertFormShell` ocupar tela cheia. Desktop preserva bit-a-bit.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { LikertFormShell } from '../../../components/instruments/LikertFormShell';
import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { INSTRUMENT_A_CATALOG } from '../../../lib/instruments/instrumentACatalog';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadRhSessionFlags } from '../../../lib/session/rhSessionFlags';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { loadCompanyForRhPanel, loadMeuPortalData } from '../../painel-rh/internals';

const HREF_PENDENCIAS = '/meu-portal';

export default async function AutoAvaliacaoPlatformPage(): Promise<JSX.Element> {
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
    const card = data.pendencias.find((p) => p.instrumento === 'autoAvaliacao');
    if (card === undefined || card.cicloReferencia === null || card.cicloReferencia.length === 0) {
      redirect(HREF_PENDENCIAS);
    }
    const trimestre: string = card.cicloReferencia;

    return (
      <Layout
        menuItems={menuItems}
        mobileHideSidebar
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <LikertFormShell
          titulo="Autoavaliação"
          subtitulo={`Trimestre ${trimestre}`}
          trimestreAtual={trimestre}
          catalogo={INSTRUMENT_A_CATALOG}
          canalAutenticacao="platform"
          endpointSubmit="/api/portal/save-instrument-a"
          hrefPendencias={HREF_PENDENCIAS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
