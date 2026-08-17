// ROIP APP 9BOX — rota canonica `/painel-rh` (Painel RH §5.5, ME-083).
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta APENAS o default. Todo
// helper, tipo e loader vive no `internals.ts` irmao; toda render vive
// no `PainelRHClient.tsx` (client component). Segregacao canonica bit-
// exact vs padrao S306 pre-existente (ME-056 mantinha helpers embutidos).
//
// Origem canonica:
// - DOC 05 §5.5 (Painel RH — 5 secoes canonicas com variacao por cenario
//   RH puro / RH-Lider C1 / RH-Lider C2).
// - DOC 05 §5.1 (estrutura comum a paineis).
// - DOC 05 §5.8 (Card resumo "Pendencias no portal" — RH puro/RHL1/RHL2).
// - DOC 05 §4 (Header canonico `leftMode='in_company'` — DECISAO
//   D-ME083-3 aprovada bit-exact).
// - DOC 02 §10.3 linha 808 (matriz Bruno redirect_painel; RH e RH-Lider
//   allow; C-level e Lider deny — DECISAO D-ME083-4 aprovada bit-exact).
// - DOC 02 §5.2 (sessao sliding 8h).
// - DOC 02 §11.3 PC1c (guarda de agregados analiticos — total colaboradores
//   ativos exibido ao RH INCLUI C-levels).
// - Mockup canonico primario: `painel_principal_fase7_v5.html`.
//
// **RV-13 canonica.** `PainelRHPage` (default) → runtime Next 15.
// **RV-08 canonica.** Zero decisao de implementacao — todos os loaders
// sao helpers puros pre-decididos em `internals.ts` + `../super-admin/
// empresa/[id]/internals.ts` (reuso canonico D-ME083-2).
// **RV-11 canonica.** Todas as queries executam contra MySQL real via
// Drizzle tipado.
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { countPendenciasEmpresa } from '../../lib/pendencias/pendenciasEngine';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';
import {
  loadDepartmentCounts,
  loadLandingCounts,
  loadMesAtualClosureStatus,
  loadOnboardingSummaryCounts,
} from '../super-admin/empresa/[id]/internals';

import { PainelRHClient } from './PainelRHClient';
import {
  loadCadeiaIndiretaData,
  loadCompanyForRhPanel,
  loadMeuPortalData,
  loadMinhaEquipeData,
  loadRhSessionFlags,
  resolveDatabaseUrl,
} from './internals';

export default async function PainelRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // ME-083 D-ME083-4 aprovado bit-exact — Bruno em `/painel-rh` redirect
  // para `/super-admin` (matriz DOC 02 §10.3 linha 808). Impersonation
  // fica em `/painel-rh-preview` (D-RH-IMPERSONATION, fora do B9).
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  // ME-080b Dispatch 3 — gate "primeiro acesso": senha inicial ainda
  // nao trocada → `/alterar-senha`. Preservado bit-exact.
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  // Middleware §10.3 ja bloqueia C-level/Lider aqui — defense-in-depth.
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const flags = await loadRhSessionFlags(client.db, session.userId);
    if (flags === null) {
      // Registro deletado entre emissao e verificacao — sessao invalida.
      redirect('/');
    }

    const company = await loadCompanyForRhPanel(client.db, session.companyId);
    if (company === null) {
      // Empresa deletada entre emissao e verificacao — sessao invalida.
      redirect('/');
    }

    const now = new Date();
    const [counts, departmentCounts, onboardingSummary, mesAtualClosure, totalPendenciasPortal] =
      await Promise.all([
        loadLandingCounts(client.db, session.companyId),
        loadDepartmentCounts(client.db, session.companyId),
        loadOnboardingSummaryCounts(client.db, session.companyId),
        loadMesAtualClosureStatus(client.db, session.companyId, now),
        countPendenciasEmpresa({ db: client.db, companyId: session.companyId, now }),
      ]);

    const profileKey = resolveProfileKey({
      session,
      isRH: flags.isRH,
      isLider: flags.isLider,
      acessoTotal: false,
      hasDescendingChain: flags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const showsMinhaEquipe = profileKey === 'rh_lider_c1' || profileKey === 'rh_lider_c2';
    const showsCadeiaIndireta = profileKey === 'rh_lider_c2';

    const [minhaEquipe, cadeiaIndireta, meuPortal] = await Promise.all([
      showsMinhaEquipe ? loadMinhaEquipeData(client.db, session.userId) : Promise.resolve(null),
      showsCadeiaIndireta
        ? loadCadeiaIndiretaData(client.db, session.userId)
        : Promise.resolve(null),
      loadMeuPortalData(client.db, session.userId),
    ]);

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          // Regra Q1 canonica §4.1: sino para Bruno e RH.
          showNotificationBell: true,
        }}
      >
        <PainelRHClient
          company={company}
          counts={counts}
          departmentCounts={departmentCounts}
          onboardingSummary={onboardingSummary}
          mesAtualClosure={mesAtualClosure}
          totalPendenciasPortal={totalPendenciasPortal}
          showsMinhaEquipe={showsMinhaEquipe}
          showsCadeiaIndireta={showsCadeiaIndireta}
          minhaEquipe={minhaEquipe}
          cadeiaIndireta={cadeiaIndireta}
          meuPortal={meuPortal}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
