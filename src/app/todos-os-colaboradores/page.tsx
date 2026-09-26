// ROIP APP 9BOX — rota base RH `/todos-os-colaboradores` (§14.10,
// ME-084). Rota variante do padrao dual-route L123 canonizado em ME-080c
// (`/pendencias-portal` + `/onboarding-lideres`) + ME-083 (`/painel-rh`).
//
// Origem canonica:
// - CAMADA_UI §14.10 (integral) + §14.10.1 (badges L/RH/RF) + §20
//   (dropdown sincronizado).
// - CAMADA_AUTH §10.4 linha 816 (RH puro/RHL1/RHL2 acessam; CU/CT
//   tambem — mas eles usam MENU_CLEVEL_*, fora do escopo B9 v1) + §11.1
//   (PC1a canonica).
// - CAMADA_NEGOCIO §15 (listagem + filtros + paginacao).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - MASTER_ESCOPO_B9 §3.3 (ficha ME-084 aprovada em D-B9-3).
//
// Diferencas canonicas bit-exact vs rota super-admin:
// - Rota base (sem prefixo `/super-admin/empresa/[id]`).
// - Escopa `companyId` derivado de `session.companyId` (nao de
//   `params.id`).
// - Guard defensivo bit-exact: se `session.kind !== 'platform'` OU
//   `session.role NOT IN {'rh', 'rh_lider'}`, redirect canonico.
// - Header `leftMode: 'in_company'` (bit-exact `/pendencias-portal`)
//   sem `superAdminContext` (RH nao e super-admin).
// - Menu `MENU_RH_PURO` / `MENU_RH_LIDER_C1` / `MENU_RH_LIDER_C2`
//   conforme `resolveMenuFlagsForRH` derivar do RH autenticado.
// - `TodosColaboradoresClient` compartilhado bit-exact via import de
//   `../super-admin/empresa/[id]/todos-os-colaboradores/…` com prop
//   `variant='rh'` + hrefs base `/colaborador/…` + `refetchAction`
//   RH-facing.
//
// **RV-13 canonica.** Todo import consumido no runtime Next 15:
// - `getServerSession`, `redirect`, `notFound` → guard + guard cruzado.
// - `createDbClient`/`closeDbClient` → transacao unica com finally.
// - `resolveMenuFlagsForRH` → menu §3.3-§3.5.
// - `resolveProfileKey`, `resolveMenuItems` → gera menu canonico.
// - `Layout` → shell canonico bit-exact.
// - `parseColaboradoresFiltersFromSearchParams`,
//   `colaboradoresFiltersToServiceInput` → parse query string §14.10.
// - `loadTodosColaboradoresPageForRH` → 3 queries paralelas.
// - `TodosColaboradoresClient` → renderiza a tabela.
// - `listarColaboradoresRHAction` → prop `refetchAction`.
//
// **RV-08.** Zero decisao — todos os pontos ambiguos pre-decididos em
// D-ME084-1 a D-ME084-7 aprovadas em bloco por Bruno.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.
//
// ME-fila6 D1 (D-CLEVEL-TODOS-COLABORADORES-403):
// - DOC 02 §10.4: CU ✓, CT ✓, CF ✗. O guard aceitava apenas RH; C-level
//   com menu §3.8 caia em acesso negado. Agora C-level `clevel_full`
//   acessa; CF segue para `/access-denied`.
// - DOC 05 §14.10: para C-level os 4 botoes do cabecalho ficam ocultos e
//   a ficha cadastral nao exibe `[✎ Editar cadastro]`.
// - Menu/RF/sino via `loadPlatformMenuContext` (sino apenas RH — §4.1).

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { getServerSession } from '../../server/session/serverSession';
import { carregarFichaCadastralAction } from '../_shared/fichaCadastral/actions';

import { TodosColaboradoresClient } from './_client';

import {
  downloadTemplateColaboradoresRHAction,
  exportSpreadsheetColaboradoresRHAction,
  listarColaboradoresCLevelAction,
  listarColaboradoresRHAction,
  uploadCSVColaboradoresRHAction,
} from './actions';
import {
  colaboradoresFiltersToServiceInput,
  parseColaboradoresFiltersFromSearchParams,
} from './filters';
import { loadTodosColaboradoresPageForRH } from './internals';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TodosColaboradoresRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.3: Bruno usa o prefixo `/super-admin/empresa/[id]/…`.
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  // Guard defense-in-depth ao middleware `matrix.ts` §10.4 — RH puro,
  // RH-Lider e C-level passam; C-level ainda e refinado abaixo (CF nega).
  if (session.role !== 'rh' && session.role !== 'rh_lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/todos-os-colaboradores');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    const isCLevel = session.role === 'clevel';
    // §10.4: CF (`clevel_restricted`) nao acessa esta rota.
    if (isCLevel && menu.profileKey !== 'clevel_full') {
      redirect('/access-denied?rota=/todos-os-colaboradores');
    }

    const companyId = session.companyId;
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const serviceFilters = colaboradoresFiltersToServiceInput(filters);
    const pageData = await loadTodosColaboradoresPageForRH(client.db, companyId, serviceFilters);

    return (
      <Layout
        menuItems={menu.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: menu.showNotificationBell,
        }}
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
              {session.companyDisplayName}
            </p>
          </div>
          {isCLevel ? (
            <TodosColaboradoresClient
              companyId={companyId}
              initialResult={pageData.listResult}
              initialFilters={filters}
              initialDepartamentos={pageData.departamentos}
              initialLideres={pageData.lideres}
              searchIndex={pageData.searchIndex}
              variant="rh"
              novoColaboradorHref="/colaborador/novo"
              editarColaboradorHrefBase="/colaborador"
              refetchAction={listarColaboradoresCLevelAction}
              fichaCadastralAction={carregarFichaCadastralAction}
              canEditCadastro={false}
              hideActionsButtons
            />
          ) : (
            <TodosColaboradoresClient
              companyId={companyId}
              initialResult={pageData.listResult}
              initialFilters={filters}
              initialDepartamentos={pageData.departamentos}
              initialLideres={pageData.lideres}
              searchIndex={pageData.searchIndex}
              variant="rh"
              novoColaboradorHref="/colaborador/novo"
              editarColaboradorHrefBase="/colaborador"
              refetchAction={listarColaboradoresRHAction}
              fichaCadastralAction={carregarFichaCadastralAction}
              downloadTemplateAction={downloadTemplateColaboradoresRHAction}
              exportSpreadsheetAction={exportSpreadsheetColaboradoresRHAction}
              uploadCSVAction={uploadCSVColaboradoresRHAction}
            />
          )}
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
