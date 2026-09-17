// ROIP APP 9BOX — rota platform `/faturamento-mensal` (ME-fila7
// construcao dispatch 1). Exclusiva do Responsavel financeiro
// (rh/rh_lider/lider/clevel com `isResponsavelFinanceiro=true`). Bruno
// usa a variante `/super-admin/empresa/[id]/faturamento-mensal`.
//
// Origem canonica:
// - DOC 05 §14.15 (tela) + §3.3-§3.9 (item condicional no menu).
// - DOC 02 §3.2 (matriz de permissao — aplicada em `revenue`).
// - Padrao dual-route L123 (ME-088 /nr1).
//
// **RV-13.** Todo import consumido. `FaturamentoClient` renderizado
// abaixo do Layout.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { FaturamentoClient } from '../../components/faturamento/FaturamentoClient';
import { currentMesUTC } from '../../components/faturamento/internals';
import type { FaturamentoClientProps } from '../../components/faturamento/internals';
import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createMonthlyClosureRouter } from '../../server/routers/monthlyClosure';
import { createRevenueRouter } from '../../server/routers/revenue';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

const SESSION_COOKIE = 'session';

export default async function FaturamentoMensalPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.kind !== 'platform') {
    redirect('/');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menuCtx = await loadPlatformMenuContext(client.db, session);
    if (menuCtx === null) {
      redirect('/');
    }
    if (!menuCtx.isResponsavelFinanceiro) {
      redirect('/access-denied?rota=/faturamento-mensal');
    }

    const companyId = session.companyId;
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

    const clientProps: FaturamentoClientProps = {
      variant: 'rh',
      companyId,
      mesInicial,
      faturamentoInicial: fat.faturamentoBruto,
      statusInicial: closure.status,
      mesesPendentes: resumo.count,
    };

    return (
      <Layout
        menuItems={menuCtx.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: menuCtx.showNotificationBell,
        }}
      >
        <FaturamentoClient {...clientProps} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
