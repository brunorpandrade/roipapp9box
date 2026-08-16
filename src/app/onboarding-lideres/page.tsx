// ROIP APP 9BOX — rota canônica RH `/onboarding-lideres` (§14.27,
// ME-080c-patch1). Variante RH da mesma rota implementada pela ME-080c
// para Bruno super-admin em `/super-admin/empresa/[id]/onboarding-lideres`.
//
// Origem canônica:
// - CAMADA_UI §14.27 (integral).
// - CAMADA_AUTH §10.6 (RH + RH-Lider acessam; C-level/Líder/Colaborador
//   bloqueados via matrix.ts + defense-in-depth aqui).
// - CAMADA_OPERACOES §21 integral (mesmo ciclo de vida canônico).
// - CAMADA_DADOS §4.5 + §14.3 + §14.4.
// - Padrão pendencias-portal — Client + actions + internals vivem em
//   `/onboarding-lideres/` (rota RH raiz); rota super-admin importa
//   dali via path relativo.
//
// **RV-13.** Cada import consumido:
//   - `OnboardingLideresClient`, `OnboardingCardInitial` do Client
//     compartilhado.
//   - `resolveDatabaseUrl` do internals compartilhado.
//   - `createLeaderOnboardingRouter` para loader inline SSR.
//
// **RV-08.** Nenhuma decisão do Manus — session.companyId vem da JWT do
// RH autenticado, não do path.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { employeeLeaderHistory, employees } from '../../db/schema';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createLeaderOnboardingRouter } from '../../server/routers/leaderOnboarding';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { OnboardingLideresClient, type OnboardingCardInitial } from './OnboardingLideresClient';
import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const leaderOnboardingRouter = createLeaderOnboardingRouter();
const createLeaderOnboardingCaller = createCallerFactory(leaderOnboardingRouter);
const pageRateLimiter = createRateLimiter();

const SESSION_COOKIE = 'session';

/**
 * Resolve flags canônicas de perfil para o menu (padrão pendencias-portal).
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

export default async function OnboardingLideresRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard defense-in-depth ao matrix.ts §10.6 + §9.13.
  if (session.kind === 'super_admin') {
    // Bruno usa /super-admin/empresa/[id]/onboarding-lideres.
    // Rota base sem companyId não faz sentido — redireciona ao painel
    // global (padrão canônico consolidado ME-057c).
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/onboarding-lideres');
  }

  // Token da sessão para o caller SSR (padrão S511 canônica).
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (bearerToken === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menuFlags = await resolveMenuFlagsForRH(client.db, session.userId);
    const profileKey = resolveProfileKey({
      session,
      isRH: menuFlags.isRH,
      isLider: menuFlags.isLider,
      acessoTotal: false,
      hasDescendingChain: menuFlags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    // Loader inline: kanban initialCards via caller.list.
    // §21.4 bloqueio absoluto já é aplicado dentro do router para
    // rh_lider (não vê próprio card).
    const caller = createLeaderOnboardingCaller(
      createContextInner({
        db: client.db,
        rateLimiter: pageRateLimiter,
        bearerToken,
      }),
    );
    const rows = await caller.list({ companyId: session.companyId });
    const initialCards: OnboardingCardInitial[] = rows.map((r) => ({
      employeeId: r.employeeId,
      nome: r.nome,
      cargo: r.cargo,
      departamento: r.departamento,
      onboardingEstagio: r.onboardingEstagio,
      countLiderados: r.countLiderados,
      entradaEstagioAtualIso: r.entradaEstagioAtual.toISOString(),
    }));

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
        <OnboardingLideresClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          initialCards={initialCards}
          initialNowIso={new Date().toISOString()}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
