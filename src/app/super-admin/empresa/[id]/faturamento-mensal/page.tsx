// ROIP APP 9BOX — rota Bruno `/super-admin/empresa/[id]/
// faturamento-mensal` (ME-fila7 construcao dispatch 1). Variante
// super-admin da tela de Faturamento mensal (§14.15). Reutiliza o
// `FaturamentoClient` compartilhado.
//
// Origem canonica:
// - DOC 05 §14.15 (tela) + §3.2 / §14.15 (item no menu dentro-de-empresa).
// - DOC 02 §3.2 (Bruno com acesso pleno — aplicado em `revenue`).
// - Padrao §2.1 super-admin (ME-079b /nr1).
//
// **RV-13.** Todo import consumido. `FaturamentoClient` renderizado
// abaixo do Layout.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { FaturamentoClient } from '../../../../../components/faturamento/FaturamentoClient';
import { currentMesUTC } from '../../../../../components/faturamento/internals';
import type { FaturamentoClientProps } from '../../../../../components/faturamento/internals';
import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import { createMonthlyClosureRouter } from '../../../../../server/routers/monthlyClosure';
import { createRevenueRouter } from '../../../../../server/routers/revenue';
import { getServerSession } from '../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';

import { parseCompanyIdParam } from './internals';

const SESSION_COOKIE = 'session';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function FaturamentoSuperAdminPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? '';

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const mesInicial = currentMesUTC();
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken: token,
    });
    const revenueCaller = createCallerFactory(createRevenueRouter())(ctx);
    const closureCaller = createCallerFactory(createMonthlyClosureRouter())(ctx);
    const fat = await revenueCaller.getFaturamento({ companyId, mes: mesInicial });
    const closure = await closureCaller.getClosureStatus({ companyId, mes: mesInicial });
    const resumo = await revenueCaller.getCardResumoPendente({ companyId });

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu ausente para ${profileKey}.`);
    }

    const clientProps: FaturamentoClientProps = {
      variant: 'super_admin',
      companyId,
      mesInicial,
      faturamentoInicial: fat.faturamentoBruto,
      statusInicial: closure.status,
      mesesPendentes: resumo.count,
    };

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <FaturamentoClient {...clientProps} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
