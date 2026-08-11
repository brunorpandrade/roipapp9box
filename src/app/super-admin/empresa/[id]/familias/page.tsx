// ROIP APP 9BOX — rota canonica Bruno
// `/super-admin/empresa/[id]/familias` (§13.1 Aba 2, ME-075).
//
// Origem canonica:
// - CAMADA_UI §13.1 Aba 2 (Familias de funcao — 6 familias × 4 variaveis).
// - CAMADA_DADOS §12.2 (`companyJobFamilies` — UPSERT por familia).
// - CAMADA_AUTENTICACAO_AUTORIZACAO §10.9 (cadastro de empresa —
//   exclusivo Bruno) + §12 (matriz de acoes administrativas).
// - MASTER_ESCOPO_B8.md §2.1 (pattern) + §3.2 (ficha).
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

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
import {
  buildInitialFamiliesState,
  loadJobFamiliesForCompany,
  parseCompanyIdParam,
  resolveDatabaseUrl,
} from './internals';

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

    const persisted = await loadJobFamiliesForCompany(client.db, companyId);
    const initialFamilies = buildInitialFamiliesState(persisted);

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
        <FamiliasClient
          companyId={companyId}
          companyNomeFantasia={company.nomeFantasia}
          initialFamilies={initialFamilies}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
