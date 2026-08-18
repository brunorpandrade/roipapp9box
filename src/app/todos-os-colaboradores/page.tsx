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

import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { employeeLeaderHistory, employees } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

import { TodosColaboradoresClient } from './_client';

import { listarColaboradoresRHAction } from './actions';
import {
  colaboradoresFiltersToServiceInput,
  parseColaboradoresFiltersFromSearchParams,
} from './filters';
import { loadTodosColaboradoresPageForRH, resolveDatabaseUrl } from './internals';

/**
 * §5.4 / §5.5 — resolve flags canonicas de perfil para o menu §3.3-§3.5.
 * Bit-exact ao `resolveMenuFlagsForRH` de `/pendencias-portal/page.tsx`
 * (ME-058), reaproveitado bit-exact em ME-084. Nao extraimos ainda para
 * helper compartilhado (L125 nao se aplica — funcao localizada com o
 * page.tsx nas duas rotas B8/B9; extracao pode entrar em ME futura
 * quando ≥3 pages consumirem).
 */
async function resolveMenuFlagsForRH(
  db: ReturnType<typeof createDbClient>['db'],
  userId: number,
): Promise<{
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly hasDescendingChain: boolean;
}> {
  const rows = await db
    .select({ isRH: employees.isRH, isLider: employees.isLider })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const emp = rows[0];
  const isRH = emp?.isRH ?? false;
  const isLider = emp?.isLider ?? false;

  if (!isLider) {
    return { isRH, isLider, hasDescendingChain: false };
  }
  const chainRows = await db
    .select({ id: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, userId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.isLider, true),
      ),
    )
    .limit(1);
  return { isRH, isLider, hasDescendingChain: chainRows.length > 0 };
}

/**
 * Flags default canonicas para C-level — nao consumidas na rota RH
 * (matrix.ts §10.4 nega C-level puro nesta v1 do B9). Guard defensivo
 * apenas para satisfazer contrato de `resolveProfileKey`.
 */
function defaultCLevelFlags(): { readonly cLevelCount: number; readonly acessoTotal: boolean } {
  return { cLevelCount: 0, acessoTotal: false };
}

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TodosColaboradoresRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.3 canonica linha 808: Bruno usa /super-admin (contexto dentro-
  // de-empresa via prefixo dedicado); rota base sem `companyId` nao faz
  // sentido para ele. Padrao bit-exact `/pendencias-portal` (ME-058) +
  // `/painel-rh` (ME-083). Preserva DOC 02 §10.3 canonico bit-exact
  // (D-ME083-4 aprovada).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  // Guard defense-in-depth ao middleware `matrix.ts` §10.4 (matriz
  // canonica linha 816 — RH puro/RHL1/RHL2 acessam; demais bloqueados).
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/todos-os-colaboradores');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menuFlags = await resolveMenuFlagsForRH(client.db, session.userId);
    const cFlags = defaultCLevelFlags();
    const profileKey = resolveProfileKey({
      session,
      isRH: menuFlags.isRH,
      isLider: menuFlags.isLider,
      acessoTotal: cFlags.acessoTotal,
      hasDescendingChain: menuFlags.hasDescendingChain,
      cLevelCount: cFlags.cLevelCount,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const companyId = session.companyId;
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseColaboradoresFiltersFromSearchParams(rawParams);
    const serviceFilters = colaboradoresFiltersToServiceInput(filters);
    const pageData = await loadTodosColaboradoresPageForRH(client.db, companyId, serviceFilters);

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
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
          <TodosColaboradoresClient
            companyId={companyId}
            initialResult={pageData.listResult}
            initialFilters={filters}
            initialDepartamentos={pageData.departamentos}
            initialLideres={pageData.lideres}
            variant="rh"
            novoColaboradorHref="/colaborador/novo"
            editarColaboradorHrefBase="/colaborador"
            refetchAction={listarColaboradoresRHAction}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
