// ROIP APP 9BOX — rota canonica `/meu-portal/perfil-individual`
// (ME-B10-04, S246-C + S255, DOC 05 §7.5).
//
// Server component canonico da resposta ao Perfil Individual no canal
// platform (S246-C — respondente autenticado por sessao platform).
// Padrao herdado da rota `/meu-portal/radar-nr1` da ME-B10-03 com
// dois ajustes canonicos:
// - Shell dedicado `PerfilIndividualFormShell` (nao `Nr1FormShell`
//   nem `LikertFormShell`) — divergencias materiais fundamentadas
//   no proprio shell.
// - Sem passagem de `trimestreAtual` — o Perfil Individual e one-shot
//   na vida do colaborador (DOC 03 §10.3) e o shell resolve
//   `assessmentId` internamente via `POST /api/portal/profile-form-state`.
//
// Guard cruzado platform (§10.7 CAMADA_AUTH): rejeita sessao ausente
// e super_admin. Card ausente do `loadMeuPortalData` -> redirect para
// `/meu-portal`. Estados canonicos suportados no card (§10.12):
// `pendente`, `em_andamento`, `aguardando_nova_resposta`.
// Placeholder `respondido` e suprimido pelo `pendenciasEngine`
// (§10.12 DOC 03) — card nao aparece, rota redireciona se acessada
// diretamente.
//
// C-level do respondente logado tem tratamento canonico bit-a-bit
// igual A/D/NR-1: o backend `profile-form-state` e
// `submit-profile-assessment` valida titularType via portalToken.
// Bloqueio de visualizacao do relatorio final por outros usuarios
// (PC1e §10.11 aplicado a `individualProfile.getReport`) e escopo
// da camada de leitura, fora do B10.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { PerfilIndividualFormShell } from '../../../components/instruments/PerfilIndividualFormShell';
import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadRhSessionFlags } from '../../../lib/session/rhSessionFlags';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { loadCompanyForRhPanel, loadMeuPortalData } from '../../painel-rh/internals';

const HREF_PENDENCIAS = '/meu-portal';

export default async function PerfilIndividualPlatformPage(): Promise<JSX.Element> {
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
    const card = data.pendencias.find((p) => p.instrumento === 'meuPerfil');
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
        <PerfilIndividualFormShell canalAutenticacao="platform" hrefPendencias={HREF_PENDENCIAS} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
