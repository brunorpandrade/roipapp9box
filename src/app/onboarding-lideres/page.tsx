// ROIP APP 9BOX — rota canônica RH `/onboarding-lideres` (§14.27,
// ME-080c-patch1; ME 3.5 D6 admite clevel+isRH).
//
// Origem canônica:
// - CAMADA_UI §14.27 (integral).
// - CAMADA_AUTH §10.6 (ampliada ME 3.5 D6 — clevel liberado; guard
//   fino server-side).
// - CAMADA_OPERACOES §21 integral.
//
// ME 3.5 D6: substitui `loadRhSessionFlags`+`resolveProfileKey`+
// `resolveMenuItems` pelo helper canonico `loadRhLikePageContext`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createLeaderOnboardingRouter } from '../../server/routers/leaderOnboarding';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { OnboardingLideresClient, type OnboardingCardInitial } from './OnboardingLideresClient';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const leaderOnboardingRouter = createLeaderOnboardingRouter();
const createLeaderOnboardingCaller = createCallerFactory(leaderOnboardingRouter);
const pageRateLimiter = createRateLimiter();

const SESSION_COOKIE = 'session';

export default async function OnboardingLideresRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    // Bruno usa /super-admin/empresa/[id]/onboarding-lideres.
    redirect('/super-admin');
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
    // ME 3.5 D6 — helper unico admite rh/rh_lider/clevel+isRH.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/onboarding-lideres');
    }

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
        menuItems={rhCtx.menuItems}
        panelToggle={
          rhCtx.canToggleMenuMode ? <PainelToggle currentMode={rhCtx.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
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
