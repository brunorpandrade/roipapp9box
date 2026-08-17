// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// clevel-rh` (§5.4 + §13.9 derivado + §3.5 MASTER_ESCOPO_B8, ME-078a).
// QUINTA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §5.4 (botões `[C-level]`/`[RH]` da landing) + §3.2 (menu
//   item 7) + §13.9 (Cadastro RH — botão `[+ Cadastrar novo RH]`).
// - CAMADA_AUTH §10.3 linha 807 (Bruno atravessa `/super-admin/
//   empresa/[id]/…`) + §10.9 (rotas dentro-de-empresa exclusivas Bruno)
//   + §12 (matriz — isRH toggle exclusivo Bruno; RF exclusivo Bruno).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §4.5 (`employees`).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico bit-exact) + §3.5
//   (ficha canônica desta ME).
//
// Pattern §2.1 canônico bit-exact preservado bit-exact via consumo dos
// helpers `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl`, `loadCLevelRHPage`, `parseTabParam`,
// `CLevelRHClient` renderizado abaixo do Layout.
//
// **RV-08.** Nenhuma decisão aqui — todos os loaders são helpers puros
// pré-decididos em `internals.ts` + procs `cLevelMembers.list` /
// `employees.listRH`.
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

import { CLevelRHClient } from './CLevelRHClient';
import { parseCompanyIdParam, parseTabParam, resolveDatabaseUrl } from './internals';

// Imports server-only: loaders dos routers (seguros em server component,
// proibidos em client component via internals.ts).
import { listCLevelsForCompany } from '../../../../../server/routers/cLevelMembers';
import { listRHForCompany } from '../../../../../server/routers/employees';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ tab?: string }>;
}

export default async function CLevelRHPage(props: PageProps): Promise<JSX.Element> {
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

  const search = await props.searchParams;
  const initialTab = parseTabParam(search.tab);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    // Carga inicial canonico bit-exact das 2 abas — loaders importados
    // diretamente dos routers (server component pode; client nao).
    const [clevels, rhs] = await Promise.all([
      listCLevelsForCompany(client.db, companyId),
      listRHForCompany(client.db, companyId),
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

    // D088 canonico bit-exact — passa `companyId` para substituir place-
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
              C-level e RH
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
          <CLevelRHClient
            companyId={companyId}
            initialTab={initialTab}
            initialClevels={clevels}
            initialRHs={rhs}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
