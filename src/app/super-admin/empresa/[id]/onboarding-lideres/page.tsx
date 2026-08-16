// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// onboarding-lideres` (§14.27, ME-080c). DÉCIMA QUARTA (e última) rota
// de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.27 (integral: kanban 4 colunas + card + modal +
//   ciclo de vida + miniatura).
// - CAMADA_AUTH §10.6 (rota acessível a Bruno via `/super-admin/`
//   e RH via `/onboarding-lideres` — esta ME cobre apenas a variante
//   Bruno; RH fica para outra ME).
// - CAMADA_OPERACOES §21 integral (ciclo de vida canônico + anotação
//   + mudança estágio + contadores + bloqueio absoluto §21.4).
// - CAMADA_DADOS §4.5 (`employees.onboardingEstagio`) + §14.3
//   (`leaderOnboardingNotes`) + §14.4 (`leaderOnboardingStageLog`).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.7.3 (ficha).
//
// Pattern §2.1 canônico preservado via consumo dos helpers
// `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`. Loader inline server-side carrega
// `initialCards` para SSR — cliente re-fetch pós-mutação via action.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl` → `page.tsx`. `OnboardingLideresClient`
// renderizado abaixo do Layout.
//
// **RV-08.** Nenhuma decisão aqui — loader inline no server component
// (padrão §2.1 B8).
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import { createLeaderOnboardingRouter } from '../../../../../server/routers/leaderOnboarding';
import { getServerSession } from '../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';

import {
  OnboardingLideresClient,
  type OnboardingCardInitial,
} from '../../../../onboarding-lideres/OnboardingLideresClient';
import { parseCompanyIdParam, resolveDatabaseUrl } from '../../../../onboarding-lideres/internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const leaderOnboardingRouter = createLeaderOnboardingRouter();
const createLeaderOnboardingCaller = createCallerFactory(leaderOnboardingRouter);
const pageRateLimiter = createRateLimiter();

const SESSION_COOKIE = 'session';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function OnboardingLideresPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware
  // `/super-admin/empresa/`).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  // Cookie session token para o caller SSR (padrão S511 canônica).
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (bearerToken === null) {
    redirect('/login-super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    // Loader inline: kanban initialCards via caller.list.
    const caller = createLeaderOnboardingCaller(
      createContextInner({
        db: client.db,
        rateLimiter: pageRateLimiter,
        bearerToken,
      }),
    );
    const rows = await caller.list({ companyId });
    const initialCards: OnboardingCardInitial[] = rows.map((r) => ({
      employeeId: r.employeeId,
      nome: r.nome,
      cargo: r.cargo,
      departamento: r.departamento,
      onboardingEstagio: r.onboardingEstagio,
      countLiderados: r.countLiderados,
      entradaEstagioAtualIso: r.entradaEstagioAtual.toISOString(),
    }));

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });

    // D088 — passa `companyId` para substituir placeholder `[id]`
    // nos hrefs do menu §3.2.
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{
          companyDisplayName: company.nomeFantasia,
        }}
      >
        <OnboardingLideresClient
          companyId={companyId}
          companyName={company.nomeFantasia}
          initialCards={initialCards}
          initialNowIso={new Date().toISOString()}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
