// ROIP APP 9BOX — rota `/cadeia-indireta` (DOC 05 §14.12, ME-fila6 D1).
//
// Substitui o stub §5.2 da ME-083. Achados que motivaram a troca:
// - Para C-level o menu era resolvido com `loadRhSessionFlags` sobre o id
//   de `cLevelMembers` (colisao de ids com `employees`).
// - O guard aceitava qualquer `rh_lider`/`lider`/`clevel`, contrariando a
//   matriz §10.4 (RHL1, L1, CU e CT ✗).
// - A tabela §14.12 nao existia.
//
// Estrutura §14.12: titulo "Cadeia indireta" + subtitulo + contador;
// filtros e colunas de `/minha-equipe` (§14.11); badge RF ausente.
// Ficha cadastral §14.10: `[✎ Editar cadastro]` apenas para RH-Lider.
// Sino apenas RH (§4.1).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { getServerSession } from '../../server/session/serverSession';
import { carregarFichaCadastralAction } from '../_shared/fichaCadastral/actions';
import { TodosColaboradoresClient } from '../minha-equipe/_client';
import { parseColaboradoresFiltersFromSearchParams } from '../minha-equipe/filters';

import { listarCadeiaIndiretaAction } from './actions';
import {
  enforceCadeiaIndiretaFilters,
  loadCadeiaIndiretaPage,
  resolveCadeiaIndiretaAccess,
} from './internals';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CadeiaIndiretaPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  if (session.role !== 'rh_lider' && session.role !== 'clevel' && session.role !== 'lider') {
    redirect('/access-denied?rota=/cadeia-indireta');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const access = await resolveCadeiaIndiretaAccess(client.db, session);
    if (access === null) {
      redirect('/access-denied?rota=/cadeia-indireta');
    }
    const companyId = session.companyId;
    const rawParams = (await props.searchParams) ?? {};
    const filters = enforceCadeiaIndiretaFilters(
      parseColaboradoresFiltersFromSearchParams(rawParams),
    );
    const pageData = await loadCadeiaIndiretaPage(
      client.db,
      companyId,
      access.scopeEmployeeIds,
      filters,
    );

    return (
      <Layout
        menuItems={access.menu.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: access.menu.showNotificationBell,
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
              Cadeia indireta
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
              Colaboradores da cadeia descendente abaixo dos meus liderados diretos
            </p>
          </div>
          <TodosColaboradoresClient
            companyId={companyId}
            initialResult={pageData.listResult}
            initialFilters={filters}
            initialDepartamentos={pageData.departamentos}
            initialLideres={[]}
            variant="rh"
            novoColaboradorHref="/colaborador/novo"
            editarColaboradorHrefBase="/colaborador"
            refetchAction={listarCadeiaIndiretaAction}
            fichaCadastralAction={carregarFichaCadastralAction}
            canEditCadastro={session.role === 'rh_lider'}
            hideActionsButtons
            hideLiderFilter
            hideRfBadgeAndFilter
            hideLiderColumn
            emptyStateGlobalText={
              'Nenhum colaborador na cadeia descendente abaixo dos seus liderados diretos.'
            }
            emptyStateFilteredText={
              'Nenhum colaborador da cadeia indireta atende aos filtros aplicados.'
            }
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
