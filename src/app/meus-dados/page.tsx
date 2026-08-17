// ROIP APP 9BOX — /meus-dados page canonica (ME-082).
//
// Origem canonica: DOC 02 §4.6 + DOC 05 §14.5.
//
// Rota transversal (DOC 02 §10.2 allow para super_admin, rh, rh_lider,
// clevel, lider; deny colaborador puro via middleware/matrix). Render
// condicional H1a (Super Admin) vs H1b (demais perfis administrativos)
// resolvido pelo payload retornado por `myData.getForCurrentUser`.
//
// Pattern S511 canonico (loader inline via createCallerFactory) +
// pattern §2.1 canonico do MASTER_ESCOPO (Layout + resolveMenuItems +
// resolveProfileKey).
//
// Flags para resolveProfileKey em H1b — RV-09 obrigatoria:
//   - isRH, isLider: derivados do role platform (rh=>isRH; rh_lider=>
//     isRH+isLider; lider=>isLider; clevel => ambos false).
//   - hasDescendingChain: query sobre employeeLeaderHistory para
//     identificar cenario C1 (falso) vs C2 (verdadeiro) em rh_lider e
//     lider.
//   - cLevelCount, acessoTotal: para C-level, distingue clevel_full
//     (1 C-level OU acessoTotal=true) de clevel_restricted.
//
// **RV-13.** Todos os imports consumidos.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../db/schema';
import { findCompanyDisplayInfo } from '../../lib/logs/companyHistoryLog';
import type { MenuItem } from '../../lib/menu/menuConfig';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
// eslint-disable-next-line @stylistic/max-len -- path canonico do guard
import { requireAuthenticatedNonCollaborator } from '../../lib/routes/requireAuthenticatedNonCollaborator';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { myDataRouter } from '../../server/routers/myData';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { MeusDadosClient } from './MeusDadosClient';

const SESSION_COOKIE = 'session';
const createMyDataCaller = createCallerFactory(myDataRouter);
const loaderRateLimiter = createRateLimiter();

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

export default async function MeusDadosPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  const guard = requireAuthenticatedNonCollaborator(session);
  if (guard.kind === 'unauthenticated') {
    // Rota transversal — Super Admin cai em /login-super-admin; demais
    // caem em /. Nao ha cookie valido para distinguir, entao / e o
    // destino canonico (login unificado inclui link para super-admin).
    redirect('/');
  }

  const activeSession = guard.session;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  const rawToken = sessionCookie?.value ?? '';

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // 1. Payload H1a/H1b via caller tRPC (RV-13: myDataRouter tem
    //    chamador na mesma ME).
    const caller = createMyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: loaderRateLimiter,
        bearerToken: rawToken,
        ip: null,
      }),
    );
    const payload = await caller.getForCurrentUser();

    // 2. Resolucao canonica de menu + header conforme perfil.
    let menuItems: readonly MenuItem[] | null = null;
    let companyDisplayName: string | undefined;
    let companyLogoUrl: string | undefined;
    let isResponsavelFinanceiro = false;
    let showNotificationBell = false;

    if (activeSession.kind === 'super_admin') {
      // Super Admin em rota transversal (fora do contexto in_company).
      // Menu canonico: MENU_SUPER_ADMIN_GLOBAL (isSuperAdminInCompany=false).
      const profileKey = resolveProfileKey({
        session: activeSession,
        isRH: false,
        isLider: false,
        acessoTotal: false,
        hasDescendingChain: false,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      });
      const items = resolveMenuItems(profileKey, false);
      if (items === null) {
        throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
      }
      menuItems = items;
      showNotificationBell = true;
    } else {
      // Platform: rh, rh_lider, clevel ou lider.
      companyDisplayName = activeSession.companyDisplayName;
      companyLogoUrl = activeSession.companyLogoUrl ?? undefined;
      const role = activeSession.role;
      let isRH = false;
      let isLider = false;
      let acessoTotal = false;
      let hasDescendingChain = false;
      let cLevelCount = 0;

      if (role === 'clevel') {
        // C-level: precisa de acessoTotal (do proprio C-level) e do
        // cLevelCount da empresa.
        const clevelRows = await client.db
          .select({ acessoTotal: cLevelMembers.acessoTotal })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, activeSession.userId))
          .limit(1);
        const cRow = clevelRows[0];
        acessoTotal = cRow?.acessoTotal ?? true;
        const totalRows = await client.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(cLevelMembers)
          .where(
            and(
              eq(cLevelMembers.companyId, activeSession.companyId),
              eq(cLevelMembers.status, 'ativo'),
            ),
          );
        cLevelCount = Number(totalRows[0]?.count ?? 0);
        // isResponsavelFinanceiro do C-level (§11.5 do menu).
        const clevelRfRows = await client.db
          .select({ rf: cLevelMembers.isResponsavelFinanceiro })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, activeSession.userId))
          .limit(1);
        isResponsavelFinanceiro = clevelRfRows[0]?.rf ?? false;
      } else {
        // rh, rh_lider, lider — vive em employees.
        isRH = role === 'rh' || role === 'rh_lider';
        isLider = role === 'rh_lider' || role === 'lider';
        showNotificationBell = role === 'rh' || role === 'rh_lider';

        if (role === 'rh_lider' || role === 'lider') {
          // hasDescendingChain: existe pelo menos 1 liderado direto do
          // usuario que tambem e lider? (DOC canonical resolveProfileKey
          // §51-59.)
          const chainRows = await client.db
            .select({ id: employees.id })
            .from(employeeLeaderHistory)
            .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
            .where(
              and(
                eq(employeeLeaderHistory.liderId, activeSession.userId),
                isNull(employeeLeaderHistory.dataFim),
                eq(employees.isLider, true),
              ),
            )
            .limit(1);
          hasDescendingChain = chainRows.length > 0;
        }

        const empRfRows = await client.db
          .select({ rf: employees.isResponsavelFinanceiro })
          .from(employees)
          .where(eq(employees.id, activeSession.userId))
          .limit(1);
        isResponsavelFinanceiro = empRfRows[0]?.rf ?? false;
      }

      const profileKey = resolveProfileKey({
        session: activeSession,
        isRH,
        isLider,
        acessoTotal,
        hasDescendingChain,
        cLevelCount,
        isSuperAdminInCompany: false,
      });
      const items = resolveMenuItems(profileKey, isResponsavelFinanceiro);
      if (items === null) {
        throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
      }
      menuItems = items;
    }

    // 3. Company display info para header (in_company perfis).
    let companyLogoResolved: string | null = null;
    if (activeSession.kind === 'platform') {
      const companyInfo = await findCompanyDisplayInfo(client.db, activeSession.companyId);
      if (companyInfo !== null) {
        companyDisplayName = companyInfo.nomeFantasia;
        companyLogoResolved = companyInfo.logoUrl;
      }
    }

    const displayName =
      activeSession.kind === 'super_admin' ? activeSession.displayName : activeSession.displayName;

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: activeSession.kind === 'super_admin' ? 'super_admin_global' : 'in_company',
          companyDisplayName,
          companyLogoUrl: companyLogoResolved ?? companyLogoUrl ?? undefined,
          user: { displayName },
          showNotificationBell,
        }}
      >
        <MeusDadosClient payload={payload} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
