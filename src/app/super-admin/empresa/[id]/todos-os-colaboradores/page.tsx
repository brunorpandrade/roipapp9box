// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/todos-
// os-colaboradores` (§14.10, ME-076). TERCEIRA rota de codigo do bloco
// B8.
//
// Origem canonica:
// - CAMADA_UI §14.10 (14 colunas + 8 filtros + acoes + badges) +
//   §14.10.1 (badges L/RH/RF inline no Nome) + §20 (dropdown
//   sincronizado).
// - CAMADA_AUTENTICACAO_AUTORIZACAO §10.3 linha 807 (Bruno atravessa
//   `/super-admin/empresa/[id]/…`) + §10.9 (rotas dentro-de-empresa
//   exclusivas Bruno) + §12 (matriz de acoes administrativas).
// - CAMADA_NEGOCIO §15 (listagem + filtros + paginacao) + §16.6 (upload
//   incremental — diferido).
// - CAMADA_DADOS §4.5 `employees` + §4.6 `employeeLeaderHistory` + §9.1
//   `individualProfileAssessments`.
// - MASTER_ESCOPO_B8.md §2.1 (pattern canonico bit-exact) + §3.3 (ficha
//   canonica desta ME).
//
// Pattern §2.1 canonico bit-exact preservado bit-exact via consumo dos
// helpers `getServerSession`, `resolveProfileKey`, `resolveMenuItems`
// (com fix D088 canonico bit-exact), `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl`, `loadTodosColaboradoresPage`,
// `parseColaboradoresFiltersFromSearchParams` → `page.tsx`.
// `TodosColaboradoresClient` → renderizado abaixo do Layout.
//
// **RV-08.** Nenhuma decisao aqui — todos os loaders sao helpers puros
// pre-decididos em `internals.ts`.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { TodosColaboradoresClient } from './TodosColaboradoresClient';
import {
  colaboradoresFiltersToServiceInput,
  parseColaboradoresFiltersFromSearchParams,
} from './filters';
import { loadTodosColaboradoresPage, parseCompanyIdParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TodosColaboradoresPage(props: PageProps): Promise<JSX.Element> {
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

    const rawParams = (await props.searchParams) ?? {};
    const filters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const serviceFilters = colaboradoresFiltersToServiceInput(filters);
    const pageData = await loadTodosColaboradoresPage(client.db, companyId, serviceFilters);

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
              Todos os colaboradores
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.text.secondary,
                }}
              >
                {pageData.listResult.totalCount} colaborador(es)
              </span>
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
          <TodosColaboradoresClient
            companyId={companyId}
            initialResult={pageData.listResult}
            initialFilters={filters}
            initialDepartamentos={pageData.departamentos}
            initialLideres={pageData.lideres}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
