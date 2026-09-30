// ROIP APP 9BOX — rota canonica `/painel-rh` (Painel RH §5.5, ME-083).
//
// ME 3.5 D6 patch3 — unifica o branch clevel+isRH com o branch RH puro:
// o C-level operando como RH renderiza o PainelRHClient completo com os
// mesmos cards, contadores e secoes que um RH nativo veria (validacao
// empirica Michelle/Embrastec S9). A antiga landing simplificada do D5
// e substituida.
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta APENAS o default. Todo
// helper, tipo e loader vive no `internals.ts` irmao; toda render vive
// no `PainelRHClient.tsx` (client component).
//
// Origem canonica:
// - DOC 05 §5.5 (Painel RH — 5 secoes canonicas com variacao por cenario
//   RH puro / RH-Lider C1 / RH-Lider C2).
// - DOC 05 §5.1 (estrutura comum a paineis).
// - DOC 05 §5.8 (Card resumo "Pendencias no portal" — RH puro/RHL1/RHL2).
// - DOC 05 §4 (Header canonico `leftMode='in_company'`).
// - DOC 02 §10.3 linha 808 (matriz Bruno redirect_painel; RH, RH-Lider
//   e clevel+isRH allow; Lider deny).
// - DOC 02 §5.2 (sessao sliding 8h).
// - DOC 02 §11.3 PC1c (guarda de agregados analiticos — total colaboradores
//   ativos exibido ao RH INCLUI C-levels).
//
// **RV-13 canonica.** `PainelRHPage` (default) → runtime Next 15.
// **RV-11 canonica.** Todas as queries executam contra MySQL real via
// Drizzle tipado.
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { listActiveLeaders } from '../../server/services/painelNavigation';
import { loadTurnoverCard } from '../../server/services/turnoverPanel';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { countPendenciasEmpresa } from '../../lib/pendencias/pendenciasEngine';
import { getServerSession } from '../../server/session/serverSession';
import {
  loadDepartmentCounts,
  loadLandingCounts,
  loadMesAtualClosureStatus,
  loadOnboardingSummaryCounts,
} from '../super-admin/empresa/[id]/internals';

import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';

import { liberarRetesteAction } from './actions';
import { PainelRHClient } from './PainelRHClient';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import {
  loadCadeiaIndiretaData,
  loadCompanyForRhPanel,
  loadMeuPortalData,
  loadMinhaEquipeData,
  loadPerfisIndividuaisInconsistentes,
} from './internals';

export default async function PainelRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // ME-083 D-ME083-4 aprovado bit-exact — Bruno em `/painel-rh` redirect
  // para `/super-admin` (matriz DOC 02 §10.3 linha 808).
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  // ME-080b Dispatch 3 — gate "primeiro acesso": senha inicial ainda
  // nao trocada → `/alterar-senha`. Preservado bit-exact.
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 patch3 — helper unico admite rh puro, rh_lider e
    // clevel+isRH=true. Retorna null quando a sessao nao pode operar
    // como RH nesta rota.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
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

    const showsMinhaEquipe =
      rhCtx.profileKey === 'rh_lider_c1' || rhCtx.profileKey === 'rh_lider_c2';
    const showsCadeiaIndireta = rhCtx.profileKey === 'rh_lider_c2';

    // ME 3.5 D6 patch3 — `loadMeuPortalData` recebe `userType='clevel'`
    // quando a sessao e um C-level operando como RH (a funcao ja aceita
    // esse discriminador canonico desde a assinatura pre-existente).
    const meuPortalUserType: 'employee' | 'clevel' = rhCtx.isCLevelActingAsRH
      ? 'clevel'
      : 'employee';

    const [minhaEquipe, cadeiaIndireta, meuPortal, perfisIndividuaisInconsistentes] =
      await Promise.all([
        showsMinhaEquipe ? loadMinhaEquipeData(client.db, session.userId) : Promise.resolve(null),
        showsCadeiaIndireta
          ? loadCadeiaIndiretaData(client.db, session.userId)
          : Promise.resolve(null),
        loadMeuPortalData(client.db, session.companyId, session.userId, meuPortalUserType),
        loadPerfisIndividuaisInconsistentes(client.db, session.companyId),
      ]);

    const turnoverCard = await loadTurnoverCard(client.db, session.companyId);
    // ME-UX-CONSOLIDACAO-P3b D4b — lista canonica de lideres ativos
    // alimenta o card "Ver equipes" (rota nativa `/dashboard-recorte/
    // equipe/[alvo]`). Ordem alfabetica preservada bit-a-bit.
    const activeLeaders = await listActiveLeaders(client.db, session.companyId);

    return (
      <Layout
        menuItems={rhCtx.menuItems}
        panelToggle={
          rhCtx.canToggleMenuMode ? <PainelToggle currentMode={rhCtx.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          // Sino canonico §4.1 — Bruno + RH puro/RH-Lider recebem sino;
          // C-level operando como RH segue a regra canonica de C-level
          // (sem sino).
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <PainelRHClient
          company={company}
          turnoverCard={turnoverCard}
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
          perfisIndividuaisInconsistentes={perfisIndividuaisInconsistentes}
          perfilInconsistenteActions={{ liberarReteste: liberarRetesteAction }}
          activeLeaders={activeLeaders}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
