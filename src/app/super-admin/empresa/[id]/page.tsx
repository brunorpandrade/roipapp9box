// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]`
// (landing §5.4, ME-074). PRIMEIRA rota de codigo do bloco B8.
//
// Origem canonica:
// - CAMADA_UI §5.4 (estrutura landing) + §5.9-§5.10 (zonas placeholder)
//   + §5.2 (estado "Coleta de dados em andamento").
// - CAMADA_AUTENTICACAO_AUTORIZACAO §10.3 linha 807 (Bruno tem acesso
//   canonico bit-exact a /super-admin/empresa/[id] e todas sub-rotas)
//   + §9.1 (mensagem canonica do AccessDeniedPage) + §4.2 (indicador
//   contextual "Navegando como Super Admin").
// - CAMADA_NEGOCIO §5.7 (empresa sem RF — aviso amarelo canonico).
// - CAMADA_OPERACOES §21.3 (contadores canonicos onboarding-lideres).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canonico bit-exact) + §3.1 (ficha
//   canonica desta ME).
//
// Pattern §2.1 canonico bit-exact preservado bit-exact via consumo dos
// helpers da ME-057c/058: `getServerSession`, `resolveProfileKey`,
// `resolveMenuItems` (com fix D088 — passa companyId), `Layout` +
// `superAdminContext`.
//
// **RV-13 canonica.** `SuperAdminCompanyLandingPage` (default) →
// runtime Next 15. `CompanyLandingClient` (client component) importado
// e renderizado.
//
// **RV-08 canonica.** Nenhuma decisao de implementacao acontece aqui —
// todos os loaders sao helpers puros pre-decididos em `internals.ts`.
//
// **RV-11 canonica.** Todas as queries executam contra MySQL real via
// Drizzle tipado. Testes de integracao em `tests/integration/me074-
// landing.test.tsx` cobrem MySQL real.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../db/client';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

import { CompanyLandingClient } from './CompanyLandingClient';
import {
  loadCompanyForLanding,
  loadDepartmentCounts,
  loadLandingCounts,
  loadLastClosedQuarter,
  loadLastQuarterFaturamentoMedio,
  loadMesAtualClosureStatus,
  loadOnboardingSummaryCounts,
  parseCompanyIdParam,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function SuperAdminCompanyLandingPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware — matrix.ts
  // matchPrefix `/super-admin/empresa/`).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await loadCompanyForLanding(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const now = new Date();
    const [
      counts,
      departmentCounts,
      onboardingSummary,
      lastQuarter,
      lastQuarterFaturamentoMedio,
      mesAtualClosure,
    ] = await Promise.all([
      loadLandingCounts(client.db, companyId),
      loadDepartmentCounts(client.db, companyId),
      loadOnboardingSummaryCounts(client.db, companyId),
      loadLastClosedQuarter(client.db, companyId),
      loadLastQuarterFaturamentoMedio(client.db, companyId),
      loadMesAtualClosureStatus(client.db, companyId, now),
    ]);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
    // ME-074 D088: passa `companyId` para substituir placeholder canonico
    // `[id]` nos hrefs do menu §3.2 — sem isso, cliques nos itens caem em
    // rotas literais e retornam 404.
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <CompanyLandingClient
          company={company}
          counts={counts}
          departmentCounts={departmentCounts}
          onboardingSummary={onboardingSummary}
          lastQuarter={lastQuarter}
          lastQuarterFaturamentoMedio={lastQuarterFaturamentoMedio}
          mesAtualClosure={mesAtualClosure}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
