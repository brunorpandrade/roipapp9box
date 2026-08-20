// ROIP APP 9BOX — rota base RH `/central-relatorios` (ME-B9-CR,
// dual-route L123 canonizado em ME-084 pareado com
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` ME-079a).
//
// Origem canonica:
// - CAMADA_UI §12 integral (Central de Relatorios).
// - CAMADA_AUTH §9.15 (/central-relatorios — RH/RH-Lider/Bruno; C-level e
//   Lider bloqueados).
// - CAMADA_AUTH §10.7 (Bruno usa `/super-admin/empresa/[id]/…`, mas
//   matriz allow em `/central-relatorios` mantida defense-in-depth).
// - CAMADA_NEGOCIO §13 (6 cards + procs).
//
// Diferencas canonicas bit-exact vs rota Super Admin:
// - Rota base (sem prefixo `/super-admin/empresa/[id]`).
// - `companyId` derivado de `session.companyId` (nao de `params.id`).
// - Guard defensivo bit-exact ao padrao ME-084 (`/todos-os-colaboradores`):
//   super_admin redirect `/super-admin`; role fora de rh/rh_lider redirect
//   `/access-denied?rota=/central-relatorios`.
// - Header `leftMode: 'in_company'` sem `superAdminContext`.
// - Menu `MENU_RH` / `MENU_RH_LIDER_C1` / `MENU_RH_LIDER_C2` conforme
//   `resolveMenuFlagsForRH` derivar do RH autenticado.
// - `RelatoriosClient` compartilhado bit-exact via import de
//   `src/components/central-relatorios/RelatoriosClient` com prop
//   `variant='rh'` + 6 actions RH-facing injetadas.
// - Board deck one-pager escondido do render (D-CR-3).
//
// **RV-13.** Todo import consumido no runtime Next 15:
// - `getServerSession`, `redirect` → guard + guard cruzado.
// - `createDbClient`/`closeDbClient` → transacao unica com finally.
// - `resolveMenuFlagsForRH` → menu §3.3-§3.5.
// - `resolveProfileKey`, `resolveMenuItems` → gera menu canonico.
// - `Layout` → shell canonico bit-exact.
// - `RelatoriosClient` → renderiza a Central compartilhada.
// - 6 actions RH-facing → props `actions` injetadas.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { RelatoriosClient } from '../../components/central-relatorios/RelatoriosClient';
import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../db/schema';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

import {
  generateRelatorioExecutivoClevelAction,
  generateRelatorioExecutivoRHAction,
  listClosedQuartersClevelAction,
  listClosedQuartersRHAction,
  listDepartmentsClevelAction,
  listDepartmentsRHAction,
  listLeadersClevelAction,
  listLeadersRHAction,
  startExecutiveReportDownloadTokenClevelAction,
  startExecutiveReportDownloadTokenRHAction,
  startReportDownloadTokenClevelAction,
  startReportDownloadTokenRHAction,
} from './actions';
import { resolveDatabaseUrl } from './internals';

/**
 * §5.4 / §5.5 — resolve flags canonicas de perfil para o menu §3.3-§3.5.
 * Bit-exact ao helper local de `/todos-os-colaboradores/page.tsx`
 * (ME-084). Nao extraimos ainda para helper compartilhado (L125 nao se
 * aplica — extracao pode entrar em ME futura quando >=3 pages
 * consumirem).
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
 * Flags default canonicas para C-level — usadas apenas quando o guard
 * resolve para branch RH/RH-Lider (nao ha C-level na sessao para
 * carregar). Bit-exact ao padrao ME-084.
 */
function defaultCLevelFlags(): { readonly cLevelCount: number; readonly acessoTotal: boolean } {
  return { cLevelCount: 0, acessoTotal: false };
}

/**
 * ME-B9-CR3 (D-CENTRAL-CLEVEL) — resolve flags reais de C-level (§12.2:
 * `acessoTotal=true` obrigatorio; CF nega). Bit-exact ao padrao usado em
 * `/painel-clevel/page.tsx`.
 */
async function resolveCLevelFlags(
  db: ReturnType<typeof createDbClient>['db'],
  userId: number,
  companyId: number,
): Promise<{
  readonly acessoTotal: boolean;
  readonly cLevelCount: number;
} | null> {
  const memberRows = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, userId))
    .limit(1);
  const member = memberRows[0];
  if (member === undefined) {
    return null;
  }
  const countRows = await db
    .select({ id: cLevelMembers.id })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
  return {
    // Coluna canonica com `.default(true)`; Drizzle infere `boolean | null`.
    // Fallback bit-exact ao pattern usado em `/painel-clevel/page.tsx`.
    acessoTotal: member.acessoTotal ?? true,
    cLevelCount: countRows.length,
  };
}

export default async function CentralRelatoriosRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.3 canonica: Bruno usa `/super-admin` (contexto dentro-de-empresa
  // via prefixo dedicado); rota base sem `companyId` nao faz sentido para
  // ele. Padrao bit-exact `/todos-os-colaboradores` (ME-084).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  // Guard defense-in-depth ao middleware `matrix.ts` §10.7 (matriz
  // canonica ampliada pela ME-B9-CR3 — super_admin/rh/rh_lider/clevel
  // allow; lider deny). C-level requer `acessoTotal=true` (§12.2 CAMADA_UI
  // — CF nao acessa) — filtro delegado ao guard interno abaixo.
  if (session.role !== 'rh' && session.role !== 'rh_lider' && session.role !== 'clevel') {
    redirect('/access-denied?rota=/central-relatorios');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Branch canonico ME-B9-CR3: role='clevel' segue caminho dedicado
    // (§12.2 CAMADA_UI: exige acessoTotal=true; CF cai em access-denied).
    if (session.role === 'clevel') {
      const cFlags = await resolveCLevelFlags(client.db, session.userId, session.companyId);
      if (cFlags === null || !cFlags.acessoTotal) {
        redirect('/access-denied?rota=/central-relatorios');
      }
      const menuFlagsClevel = { isRH: false, isLider: false, hasDescendingChain: false };
      const profileKeyClevel = resolveProfileKey({
        session,
        isRH: menuFlagsClevel.isRH,
        isLider: menuFlagsClevel.isLider,
        acessoTotal: cFlags.acessoTotal,
        hasDescendingChain: menuFlagsClevel.hasDescendingChain,
        cLevelCount: cFlags.cLevelCount,
        isSuperAdminInCompany: false,
      });
      const menuItemsClevel = resolveMenuItems(profileKeyClevel, false);
      if (menuItemsClevel === null) {
        throw new Error(`Menu canonico ausente para ${profileKeyClevel} — inconsistencia §3`);
      }
      return (
        <Layout
          menuItems={menuItemsClevel}
          header={{
            leftMode: 'in_company',
            companyDisplayName: session.companyDisplayName,
            companyLogoUrl: session.companyLogoUrl ?? undefined,
            user: { displayName: session.displayName },
            showNotificationBell: false,
          }}
        >
          <RelatoriosClient
            companyId={session.companyId}
            companyName={session.companyDisplayName}
            variant="clevel"
            actions={{
              listClosedQuarters: listClosedQuartersClevelAction,
              listDepartments: listDepartmentsClevelAction,
              listLeaders: listLeadersClevelAction,
              generateRelatorioExecutivo: generateRelatorioExecutivoClevelAction,
              startReportDownloadToken: startReportDownloadTokenClevelAction,
              startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenClevelAction,
            }}
          />
        </Layout>
      );
    }

    // Branch canonico RH puro / RH-Lider (bit-exact ao pre-CR3).
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
        <RelatoriosClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          variant="rh"
          actions={{
            listClosedQuarters: listClosedQuartersRHAction,
            listDepartments: listDepartmentsRHAction,
            listLeaders: listLeadersRHAction,
            generateRelatorioExecutivo: generateRelatorioExecutivoRHAction,
            startReportDownloadToken: startReportDownloadTokenRHAction,
            startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenRHAction,
          }}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
