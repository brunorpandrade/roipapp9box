// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// clevel/novo` (§13.2, ME-078a). SEXTA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §13.2 (Cadastro C-level integral) + delta canônico
//   `delta_toggle_resp_financeiro_clevel_v1.html`.
// - CAMADA_AUTH §10.3 linha 807 + §10.9 (rota exclusiva Bruno) + §12
//   (RF exclusivo Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §16.1 (Cadastro C-level) + §16.7
//   (routers).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §5.1
//   (`responsavelFinanceiroTransferLog`).
// - MASTER_ESCOPO_B8.md §2.1 (pattern) + §3.5 (ficha ME-078).
//
// Pattern §2.1 canônico bit-exact.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../../db/client';
import { COLORS } from '../../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../../server/session/serverSession';

import { CLevelNovoClient } from './CLevelNovoClient';
import { loadCLevelNovoPage, parseCompanyIdParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function CLevelNovoPage(props: PageProps): Promise<JSX.Element> {
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

    const pageData = await loadCLevelNovoPage(client.db, companyId);

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
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: 0,
              }}
            >
              Cadastro de C-level
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {company.nomeFantasia}
            </p>
          </div>
          <CLevelNovoClient
            companyId={companyId}
            isFirstCLevel={pageData.isFirstCLevel}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
