// ROIP APP 9BOX — rota employee-leader `/minha-equipe` (§14.11 + §5.5,
// ME-085; escopo ampliado na ME-B9-fechamento — S230-B — para cobrir
// Lider Cenario 1 e Cenario 2 alem de RH-Lider). Substitui bit-exact o
// stub §5.2 ME-083 por implementacao funcional canonica.
//
// Origem canonica:
// - CAMADA_UI §14.11 (ajustes vs §14.10 — 4 botoes ocultos, filtro
//   "Lider" omitido, coluna "Lider direto" omitida D-ME085-2 B, badge
//   RF ausente §14.10.1) + §14.10 (base herdada — 8 filtros, 14
//   colunas, empties, paginacao) + §5.5 (empty semantico canonico
//   "Voce nao tem liderados diretos ativos. Fale com o RH para incluir
//   colaboradores em sua equipe.").
// - CAMADA_AUTH §10.4 linha 817 (matriz — RH puro=deny; RH-Lider=allow;
//   escopo ME-085 canonico v1 restrito a RH-Lider — D-ME085-1 A
//   aprovada; lider/clevel autorizados na matriz caem em
//   `/access-denied?rota=/minha-equipe` ate canonizacao futura).
// - CAMADA_NEGOCIO §13.2 (`employeeLeaderHistory.dataFim IS NULL` =
//   vinculo ativo canonico) + §16.2 (badges + filtro "Papel funcional"
//   nas rotas P20).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - MASTER_ESCOPO_B9 §3.4 (ficha ME-085 — D-MASTER-B9-FICHA085 registra
//   correcao pendente da referencia canonica em ME-B9-fechamento).
//
// Decisoes canonicas aprovadas em bloco (D-ME085-1 a D-ME085-9 +
// N7-A):
// - D-ME085-1 A: apenas RH-Lider (C1 + C2). Guard inline rejeita
//   demais roles.
// - D-ME085-2 B: coluna "Lider direto" omitida por redundancia (via
//   `hideLiderColumn=true`).
// - D-ME085-3 B: props explicitas de comportamento (4 booleanas) no
//   `TodosColaboradoresClient` — sem nova variant.
// - D-ME085-4 B: empty semanticamente adequado (via
//   `emptyStateGlobalText` + `emptyStateFilteredText`).
// - D-ME085-5 A: guard inline (sem novo helper — extracao L125 para
//   ME futura quando >=3 rotas RH-Lider-only existirem).
// - N7-A (ME-085): helper de flags do painel-rh — substituido na
//   ME-fila6 D1 por `loadPlatformMenuContext`.
// - D-ME085-7 A: contador dinamico "N liderado(s) direto(s)"
//   respeitando filtros ativos (usa `totalCount` do result que ja
//   escopa via `enforceRHLiderScope`).
// - D-ME085-8 A: apenas subtitulo canonico §14.11 ("Meus liderados
//   diretos ativos") — sem razao social secundaria.
//
// Padrao S366 CC068: `page.tsx` exporta apenas o default. Helpers
// vivem em `internals.ts` irmao; refetch action em `actions.ts`.
//
// Middleware `matrix.ts` ja restringe RH puro (deny) + super_admin
// (redirect_super_admin). O guard abaixo e defense-in-depth.
//
// **RV-13.** Imports consumidos no runtime Next 15:
// - `getServerSession`, `redirect` → guard.
// - `createDbClient`/`closeDbClient` → conexao unica com finally.
// - `loadPlatformMenuContext` → menu §3.4-§3.9, RF e sino.
// - `Layout` → shell.
// - `parseColaboradoresFiltersFromSearchParams` → parse query string.
// - `enforceEmployeeLeaderScope`, `loadMinhaEquipePageForEmployeeLeader` → escopo.
// - `TodosColaboradoresClient` → renderiza a tabela via _client shim.
// - `listarMinhaEquipeAction` → prop `refetchAction`.
// - `carregarFichaCadastralAction` → pop-up de ficha cadastral §14.10.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
//
// ME-fila6 D1 (D-CLEVEL-MINHA-EQUIPE-SEM-LIDERADOS):
// - DOC 02 §10.4: `/minha-equipe` ✓ para CU, CT e CF. O guard aceitava
//   apenas RH-Lider e Lider. C-level agora acessa com escopo
//   `liderIdTipo='clevel'`; sem liderados diretos, a tabela mostra o
//   estado vazio §5.5 (o item de menu §3.8/§3.9 e mantido).
// - Menu/RF/sino via `loadPlatformMenuContext` (sino apenas RH — §4.1).
// - Ficha cadastral §14.10: `[✎ Editar cadastro]` apenas para RH-Lider.

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

import { listarMinhaEquipeAction } from './actions';
import { parseColaboradoresFiltersFromSearchParams } from './filters';
import { enforceEmployeeLeaderScope, loadMinhaEquipePageForEmployeeLeader } from './internals';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MinhaEquipePage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // §10.4: Bruno em `/minha-equipe` → redirect `/super-admin` (§13.7).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.kind !== 'platform') {
    redirect('/');
  }
  // ME-080b gate primeiro acesso — senha inicial ainda nao trocada.
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  // §10.4: RH puro nega (middleware ja bloqueia; defense-in-depth).
  if (session.role !== 'rh_lider' && session.role !== 'lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/minha-equipe');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      // Registro deletado entre emissao e verificacao — sessao invalida.
      redirect('/');
    }

    const companyId = session.companyId;
    const leaderTipo = session.role === 'clevel' ? 'clevel' : 'employee';
    const rawParams = (await props.searchParams) ?? {};
    // Parse tolerante → override de escopo (cliente nao escapa via URL).
    const parsedFilters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const scopedFilters = enforceEmployeeLeaderScope(parsedFilters, session.userId, leaderTipo);
    const pageData = await loadMinhaEquipePageForEmployeeLeader(
      client.db,
      companyId,
      session.userId,
      scopedFilters,
      leaderTipo,
    );

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
              Minha equipe
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.text.secondary,
                }}
              >
                {pageData.listResult.totalCount} liderado(s) direto(s)
              </span>
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Meus liderados diretos ativos
            </p>
          </div>
          <TodosColaboradoresClient
            companyId={companyId}
            initialResult={pageData.listResult}
            initialFilters={scopedFilters}
            initialDepartamentos={pageData.departamentos}
            initialLideres={pageData.lideres}
            variant="rh"
            novoColaboradorHref="/colaborador/novo"
            editarColaboradorHrefBase="/colaborador"
            refetchAction={listarMinhaEquipeAction}
            fichaCadastralAction={carregarFichaCadastralAction}
            canEditCadastro={session.role === 'rh_lider'}
            hideActionsButtons
            hideLiderFilter
            hideRfBadgeAndFilter
            hideLiderColumn
            emptyStateGlobalText={
              'Você não tem liderados diretos ativos. ' +
              'Fale com o RH para incluir colaboradores em sua equipe.'
            }
            emptyStateFilteredText="Nenhum liderado direto atende aos filtros aplicados."
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
