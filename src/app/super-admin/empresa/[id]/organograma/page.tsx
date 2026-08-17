// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// organograma` (§14.9, ME-077). QUARTA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + modo normal +
//   comportamento clique por tipo de nó) + §2.6 (cores dos nós).
// - CAMADA_AUTH §10.3 linha 807 (Bruno atravessa `/super-admin/
//   empresa/[id]/…`) + §10.9 (rotas dentro-de-empresa exclusivas Bruno)
//   + §11.2 PC1b (não aplicável a Bruno).
// - CAMADA_NEGOCIO §15.7 (regra visual PC1b não aplicável a Bruno).
// - CAMADA_DADOS §4.4/§4.5/§4.6.
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico bit-exact) + §3.4
//   (ficha canônica desta ME).
//
// Pattern §2.1 canônico bit-exact preservado bit-exact via consumo dos
// helpers `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl`, `loadOrganogramaPage` → `page.tsx`.
// `OrganogramaClient` → renderizado abaixo do Layout.
//
// **RV-08.** Nenhuma decisão aqui — todos os loaders são helpers puros
// pré-decididos em `internals.ts` + service `orgTree.ts`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { OrganogramaClient } from './OrganogramaClient';
import { loadOrganogramaPage, parseCompanyIdParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function OrganogramaPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware `/super-admin/
  // empresa/`).
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

    const pageData = await loadOrganogramaPage(client.db, companyId);
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

    // D088 canônico bit-exact — passa `companyId` para substituir place-
    // holder `[id]` nos hrefs do menu §3.2.
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
              Organograma
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
          <OrganogramaClient
            companyId={companyId}
            initialRoot={pageData.root}
            applyPC1b={pageData.applyPC1b}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
