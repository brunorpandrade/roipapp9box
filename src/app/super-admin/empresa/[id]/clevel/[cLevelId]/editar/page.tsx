// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// clevel/[cLevelId]/editar` (§13.3, ME-078a). SÉTIMA rota de código do
// bloco B8.
//
// Origem canônica:
// - CAMADA_UI §13.3 (Edição C-level integral) + mockup canônico
//   `edicao_clevel_v1.html` + delta RF.
// - CAMADA_AUTH §10.3 + §10.9 + §12.
// - CAMADA_NEGOCIO §5 + §16.3 + §16.4 + §16.7.
// - CAMADA_DADOS §4.4 + §4.6 + §5.1.
// - MASTER_ESCOPO_B8.md §2.1 + §3.5.
//
// Pattern §2.1 canônico bit-exact.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { COLORS } from '../../../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../../../server/session/serverSession';

import { CLevelEditarClient } from './CLevelEditarClient';
import {
  loadCLevelEditarPage,
  parseCLevelIdParam,
  parseCompanyIdParam,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly params: Promise<{ id: string; cLevelId: string }>;
}

export default async function CLevelEditarPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId, cLevelId: rawCLevelId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }
  const cLevelId = parseCLevelIdParam(rawCLevelId);
  if (cLevelId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const pageData = await loadCLevelEditarPage(client.db, companyId, cLevelId);
    if (pageData === null) {
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
              Edição de C-level
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {pageData.clevel.name} — {company.nomeFantasia}
            </p>
          </div>
          <CLevelEditarClient
            companyId={companyId}
            clevel={pageData.clevel}
            isOnlyCLevel={pageData.isOnlyCLevel}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
            activeLideradosCount={pageData.activeLideradosCount}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
