// ROIP APP 9BOX — rota RH-Lider `/minha-equipe` (§14.11 + §5.5,
// ME-085). Substitui bit-exact o stub §5.2 ME-083 por implementacao
// funcional canonica.
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
// - N7-A: reutiliza `loadRhSessionFlags` de `../painel-rh/internals`
//   bit-exact (variante canonicamente correta com `status='ativo'`);
//   NAO refatora `resolveMenuFlagsForRH` das 5 pages ME-084 nesta ME.
//   Debito D-B9-MENU-FLAGS-DIVERGENTES registrado para ME-B9-
//   fechamento.
// - D-ME085-7 A: contador dinamico "N liderado(s) direto(s)"
//   respeitando filtros ativos (usa `totalCount` do result que ja
//   escopa via `enforceRHLiderScope`).
// - D-ME085-8 A: apenas subtitulo canonico §14.11 ("Meus liderados
//   diretos ativos") — sem razao social secundaria.
//
// Padrao S366 CC068: `page.tsx` exporta apenas o default. Helpers
// vivem em `internals.ts` irmao; refetch action em `actions.ts`.
//
// Middleware `matrix.ts` linhas 214-222 ja restringe RH puro (deny)
// + super_admin (redirect_super_admin). Guard defense-in-depth abaixo
// cobre edge cases (matriz alterada, cookie stale) + refina escopo v1
// para RH-Lider apenas (lider/clevel autorizados pela matriz mas fora
// do escopo canonico ME-085 caem em access-denied).
//
// **RV-13 canonica.** Todo import consumido no runtime Next 15:
// - `getServerSession`, `redirect` → guard.
// - `createDbClient`/`closeDbClient` → transacao unica com finally.
// - `loadCompanyForRhPanel`, `loadRhSessionFlags` → dados de sessao
//   (reuso canonico bit-exact do padrao `/painel-rh` — N7-A).
// - `resolveProfileKey`, `resolveMenuItems` → menu canonico §3.4/§3.5.
// - `Layout` → shell canonico.
// - `parseColaboradoresFiltersFromSearchParams` → parse query string.
// - `loadMinhaEquipePageForRHLider` → 3 queries paralelas.
// - `TodosColaboradoresClient` → renderiza a tabela via _client shim.
// - `listarMinhaEquipeAction` → prop `refetchAction`.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';

import { loadCompanyForRhPanel } from '../painel-rh/internals';

import { TodosColaboradoresClient } from './_client';

import { listarMinhaEquipeAction } from './actions';
import { parseColaboradoresFiltersFromSearchParams } from './filters';
import {
  enforceRHLiderScope,
  loadMinhaEquipePageForRHLider,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MinhaEquipePage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // §10.4 linha 817: Bruno em `/minha-equipe` → redirect canonico
  // `/super-admin` (rota indisponivel para Super Admin §13.7).
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
  // D-ME085-1 A: escopo canonico ME-085 restrito a RH-Lider (C1 + C2).
  // RH puro: deny canonico §10.4 (middleware ja bloqueia; defense-in-
  // depth aqui). Lider/C-level: autorizados na matriz mas fora do
  // escopo v1 — access-denied ate canonizacao futura.
  if (session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/minha-equipe');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const flags = await loadRhSessionFlags(client.db, session.userId);
    if (flags === null) {
      // Registro deletado entre emissao e verificacao — sessao invalida.
      redirect('/');
    }
    const company = await loadCompanyForRhPanel(client.db, session.companyId);
    if (company === null) {
      // Empresa deletada entre emissao e verificacao — sessao invalida.
      redirect('/');
    }
    // §3.4 / §3.5 — resolve menu canonico do RH-Lider C1 ou C2 conforme
    // `hasDescendingChain` (calculado em `loadRhSessionFlags` com filtro
    // canonico `status='ativo'` — N7-A).
    const profileKey = resolveProfileKey({
      session,
      isRH: flags.isRH,
      isLider: flags.isLider,
      acessoTotal: false,
      hasDescendingChain: flags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const companyId = session.companyId;
    const rawParams = (await props.searchParams) ?? {};
    // Parse tolerante Next 15 → aplica override RH-Lider (defense-in-
    // depth: cliente nao pode escapar do escopo via URL manipulada).
    const parsedFilters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const scopedFilters = enforceRHLiderScope(parsedFilters, session.userId);
    const pageData = await loadMinhaEquipePageForRHLider(
      client.db,
      companyId,
      session.userId,
      scopedFilters,
    );

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
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
