// ROIP APP 9BOX — rota canonica Bruno
// `/super-admin/empresa/[id]/bloco-clima` (ME-B2-01b Fase 2 hotfix2).
//
// Tela de detalhamento canonica do Bloco Clima e Engajamento: filtro
// de escopo (Empresa | Departamento) + gauge donut nota geral +
// timeline barras+linha dos ultimos trimestres + 4 dimensoes ROIP
// com sanfona canonica (notas por questao 0-10).
//
// ME-B2-01f (01/10/2026) — searchParam `tri=<YYYY-QN>` ortogonal ao
// `dep=` para navegacao temporal canonica. Loader sanitiza input e
// faz fallback para o trimestre mais recente quando o pedido nao
// existe canonicamente.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import {
  listDepartamentosAtivosClimate,
  loadBlocoClimaDashboardData,
  loadEmpresaScopeClimateCounts,
} from '../../../../../server/services/blocoClimaDashboard';
import { getServerSession } from '../../../../../server/session/serverSession';

import { parseCompanyIdParam } from '../organograma/internals';
import { BlocoClimaDetailClient } from './BlocoClimaDetailClient';
import { headerUserFromSession } from '../../../../../lib/session/headerUser';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ dep?: string; tri?: string }>;
}

export default async function BlocoClimaDetailPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const { dep: depParam, tri: triParam } = await props.searchParams;
  const departamento = depParam === undefined || depParam.trim() === '' ? null : depParam;
  const trimestrePedido = triParam === undefined || triParam.trim() === '' ? null : triParam;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const data = await loadBlocoClimaDashboardData(client.db, {
      companyId,
      escopo: departamento === null ? 'empresa' : 'departamento',
      escopoReferencia: departamento,
      liderId: null,
      liderTipo: null,
      trimestreSelecionado: trimestrePedido,
    });
    const trimestreContextual = data?.trimestreSelecionado ?? trimestrePedido;
    const departamentosAtivos = await listDepartamentosAtivosClimate(
      client.db,
      companyId,
      trimestreContextual,
    );
    const empresaScope = await loadEmpresaScopeClimateCounts(
      client.db,
      companyId,
      trimestreContextual,
    );

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
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
          user: headerUserFromSession(session),
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <BlocoClimaDetailClient
          data={data}
          companyId={companyId}
          departamentosAtivos={departamentosAtivos}
          empresaScope={empresaScope}
          departamentoAtual={departamento}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
