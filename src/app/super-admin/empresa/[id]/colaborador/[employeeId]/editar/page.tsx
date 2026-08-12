// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/
// colaborador/[employeeId]/editar` (§13.5, ME-078b). NONA rota de
// codigo do bloco B8.
//
// Pattern §2.1 canonico bit-exact.
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { COLORS } from '../../../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../../../server/session/serverSession';

import { ColaboradorEditarClient } from './ColaboradorEditarClient';
import {
  loadColaboradorEditarPage,
  parseCompanyIdParam,
  parseEmployeeIdParam,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly params: Promise<{ id: string; employeeId: string }>;
}

export default async function ColaboradorEditarPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId, employeeId: rawEmployeeId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }
  const employeeId = parseEmployeeIdParam(rawEmployeeId);
  if (employeeId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const pageData = await loadColaboradorEditarPage(client.db, companyId, employeeId);
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
              Editar colaborador
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {company.nomeFantasia} · {pageData.employee.name}
            </p>
          </div>
          <ColaboradorEditarClient
            companyId={companyId}
            initialEmployee={pageData.employee}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
