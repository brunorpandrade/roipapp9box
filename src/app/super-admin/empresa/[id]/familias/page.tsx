// ROIP APP 9BOX — rota canonica Bruno
// `/super-admin/empresa/[id]/familias` (ME-075 + ME-1.17.2).
//
// ME-1.17.2 — expansao para contemplar as decisoes D1..D9:
// (D1) Canonicas inativas visiveis no mesmo grid com toggle. (D2) 20
// slots custom nao aparecem como placeholders — apenas as ativadas +
// botao "+ Nova". (D4) Nome editavel inline. (D5) Setas up/down.
// (D6) Guard de desativacao (counts por familia). (D7) Save por
// familia. (D8) Trava liderança. (D9) Warning prospectivo de pesos.
//
// Carga canonica consolidada via `loadFamiliasPageData` — expoe
// settings + variaveis persistidas + contagem de colaboradores em
// uma unica Promise.all paralelizada.
//
// RV-14: um statement por linha, 100 cols.

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { companies } from '../../../../../db/schema';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { FamiliasClient } from './FamiliasClient';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../../../../lib/session/headerUser';
import { loadFamiliasPageData, parseCompanyIdParam } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function SuperAdminCompanyFamiliasPage(
  props: PageProps,
): Promise<JSX.Element> {
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
    const rows = await client.db
      .select({
        id: companies.id,
        nomeFantasia: companies.nomeFantasia,
        logoUrl: companies.logoUrl,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const company = rows[0];
    if (company === undefined) {
      notFound();
    }

    // ME-1.17.2 — carga unica canonica: settings + variaveis + counts.
    const pageData = await loadFamiliasPageData(client.db, companyId);

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
      throw new Error(`Menu canônico ausente para ${profileKey} — inconsistência §3`);
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
        <FamiliasClient
          companyId={companyId}
          companyNomeFantasia={company.nomeFantasia}
          pageData={pageData}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
