// ROIP APP 9BOX — rota canonica `/meu-portal` (ME-B9-fechamento CORR2 —
// D-B9F-PORTAL-COLABORADOR-404 ENCERRADO — S238-B + S239-C).
//
// Rota autenticada acessivel a todos os usuarios platform (rh,
// rh_lider, clevel, lider) que renderiza uma visao dedicada das
// pendencias do PROPRIO usuario logado nos instrumentos do portal
// (perfil individual, auto-avaliacao, avaliacao de lideranca direta,
// radar NR-1). Substitui bit-a-bit o `href="/colaborador"` da Secao 4
// que caia em 404.
//
// Colaborador puro autentica-se via link por token (S037 preservado
// bit-a-bit) — nao entra por esta rota.
//
// Origem canonica:
// - CAMADA_UI §5.5 (Secao 4 versao inline no painel RH — mesma
//   fonte canonica de dados).
// - CAMADA_UI nova secao §14.24 (rota dedicada — canonizar em MASTER
//   pos-CORR2).
// - CAMADA_AUTH nova regra §10.7 (matriz `/meu-portal` — allow
//   platform completa; deny super_admin com redirect canonico).
//
// **RV-13.** `MeuPortalPage` (default) → runtime Next 15.
// **RV-11.** Queries via `loadMeuPortalData` do painel-rh (reuso
// canonico bit-a-bit do `pendenciasEngine`).
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

import { loadCompanyForRhPanel, loadMeuPortalData } from '../painel-rh/internals';

import { MeuPortalClient } from './MeuPortalClient';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

export default async function MeuPortalPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // Super admin canonicamente redireciona para seu painel proprio
  // (matrix §10.7 — nao acessa `/meu-portal`, pois nao e "usuario da
  // empresa" e nao tem pendencias em instrumentos).
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await loadCompanyForRhPanel(client.db, session.companyId);
    if (company === null) {
      redirect('/');
    }

    // Menu canonico — precisamos das flags do RH para os cenarios
    // rh puro / rh_lider; para clevel e lider puros as flags do
    // `loadRhSessionFlags` retornam null (nao sao employees RH). Nesse
    // caso resolvemos flags default a partir da propria session.role.
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

    // C-level respondente e `session.userId` referindo `cLevelMembers.id`;
    // demais roles sao employees.
    const userType: 'employee' | 'clevel' = session.role === 'clevel' ? 'clevel' : 'employee';
    const data = await loadMeuPortalData(client.db, session.companyId, session.userId, userType);

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
        <MeuPortalClient
          userName={session.displayName}
          companyName={company.nomeFantasia}
          data={data}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
