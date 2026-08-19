// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// relatorios-e-exportacoes` (§12, ME-079a). DÉCIMA PRIMEIRA rota de
// código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §12 integral (Central de Relatórios e Exportações).
// - CAMADA_AUTH §10.7 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §13 (6 cards + procs + governança de custo).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.6.3 (ficha).
//
// Pattern §2.1 canônico preservado via consumo dos helpers
// `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido.
// **RV-08.** Nenhuma decisão aqui.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { RelatoriosClient } from '../../../../../components/central-relatorios/RelatoriosClient';
import {
  generateRelatorioExecutivoAction,
  listClosedQuartersAction,
  listDepartmentsAction,
  listLeadersAction,
  startExecutiveReportDownloadTokenAction,
  startReportDownloadTokenAction,
} from './actions';
import { parseCompanyIdParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function RelatoriosPage(props: PageProps): Promise<JSX.Element> {
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

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

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
      throw new Error(`Menu canonico ausente para ${profileKey}`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          // CompanyDisplayInfo nao inclui logoUrl.
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{
          companyDisplayName: company.nomeFantasia,
        }}
      >
        <RelatoriosClient
          companyId={companyId}
          companyName={company.nomeFantasia}
          variant="super_admin"
          actions={{
            listClosedQuarters: listClosedQuartersAction,
            listDepartments: listDepartmentsAction,
            listLeaders: listLeadersAction,
            generateRelatorioExecutivo: generateRelatorioExecutivoAction,
            startReportDownloadToken: startReportDownloadTokenAction,
            startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenAction,
          }}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
