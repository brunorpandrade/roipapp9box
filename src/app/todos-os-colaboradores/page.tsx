// ROIP APP 9BOX — rota base RH `/todos-os-colaboradores` (§14.10,
// ME-084; ME 3.5 D6 migra menu para `loadPlatformMenuCtxCookie` para
// habilitar o toggle Painel C-level / Painel RH em C-level+isRH).
//
// Origem canonica:
// - CAMADA_UI §14.10 (integral) + §14.10.1 + §20.
// - CAMADA_AUTH §10.4 linha 816 + §11.1 (PC1a canonica).
// - CAMADA_NEGOCIO §15 (listagem + filtros + paginacao).
//
// ME 3.5 D6: migracao pontual de `loadPlatformMenuContext` para
// `loadPlatformMenuCtxCookie` — o menu passa a respeitar o cookie
// `roip.menu.mode` e o Layout ganha `panelToggle` quando o C-level
// tem `isRH=true`. Guard de admissao pre-existente mantido bit-exact.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuCtxCookie } from '../../lib/session/platformMenuCookie';
import { getServerSession } from '../../server/session/serverSession';
import { carregarFichaCadastralAction } from '../_shared/fichaCadastral/actions';

import { TodosColaboradoresClient } from './_client';

import {
  downloadMatriculasColaboradoresRHAction,
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
import { headerUserFromSession } from '../../lib/session/headerUser';

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
  if (session.role !== 'rh' && session.role !== 'rh_lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/todos-os-colaboradores');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — menu via cookie helper (habilita toggle em C-level+isRH).
    const menu = await loadPlatformMenuCtxCookie(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    const isCLevel = session.role === 'clevel';
    // §10.4: CF (`clevel_restricted`) nao acessa esta rota.
    if (isCLevel && menu.profileKey !== 'clevel_full' && menu.profileKey !== 'rh') {
      redirect('/access-denied?rota=/todos-os-colaboradores');
    }
    // ME 3.5.1 Debito B (§3.1 operação v15) — C-level+isRH em MODO
    // Painel RH (menu.profileKey === 'rh') opera como RH nativo:
    // toolbar completa (4 botoes canonicos §14.10), edicao de cadastro
    // permitida e listagem sem `hideActionsButtons`. Apenas C-level em
    // MODO C-level (profileKey === 'clevel_full') mantem o branch
    // read-only historico da ME-fila6 D1.
    const isCLevelReadOnly = isCLevel && menu.profileKey === 'clevel_full';

    const companyId = session.companyId;
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const serviceFilters = colaboradoresFiltersToServiceInput(filters);
    const pageData = await loadTodosColaboradoresPageForRH(client.db, companyId, serviceFilters);

    return (
      <Layout
        menuItems={menu.menuItems}
        panelToggle={
          menu.canToggleMenuMode ? <PainelToggle currentMode={menu.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: headerUserFromSession(session),
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
          {isCLevelReadOnly ? (
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
              downloadMatriculasAction={downloadMatriculasColaboradoresRHAction}
            />
          )}
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
