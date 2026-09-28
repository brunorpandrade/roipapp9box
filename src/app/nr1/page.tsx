// ROIP APP 9BOX — rota canonica RH `/nr1` (§10.4).
//
// ME 3.5 D6: substitui o guard historico `role IN {'rh','rh_lider'}`
// pelo helper canonico `loadRhLikePageContext`, que admite tambem
// C-level com `cLevelMembers.isRH=true` (guard fino server-side
// bit-exact ao matrix.ts §10.4 ampliado).

import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { cookies } from 'next/headers';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createNr1Router } from '../../server/routers/nr1';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { Nr1Client, type Nr1ClientProps } from './Nr1Client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

const nr1Router = createNr1Router();
const createNr1Caller = createCallerFactory(nr1Router);
const pageRateLimiter = createRateLimiter();
const SESSION_COOKIE = 'session';

export default async function Nr1RHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (bearerToken === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 — helper unico substitui os antigos
    // `loadRhSessionFlags`+`resolveProfileKey`+`resolveMenuItems`. Admite
    // rh puro, rh_lider e clevel+isRH=true. Retorna null quando a sessao
    // nao pode operar como RH nesta rota.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/nr1');
    }

    const rhFlags = {
      isRH: rhCtx.isRH,
      isLider: rhCtx.isLider,
      isResponsavelFinanceiro: rhCtx.isResponsavelFinanceiro,
      hasDescendingChain: rhCtx.hasDescendingChain,
    };

    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: pageRateLimiter,
        bearerToken,
      }),
    );

    const cycleDetails = await caller.getCycleDetails({
      companyId: session.companyId,
    });

    const clientProps: Nr1ClientProps = {
      variant: 'rh',
      cycleDetails: cycleDetails as Nr1ClientProps['cycleDetails'],
      collectionStatus: { cicloId: 0, fatoresTotais: [], respondentes: [] },
      rhFlags,
      company: {
        id: session.companyId,
        displayName: session.companyDisplayName || 'Empresa',
      },
    };

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
          // Sino canonico §4.1 — Bruno + RH; C-level operando como RH
          // segue a regra canonica de C-level (sem sino).
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <Nr1Client {...clientProps} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
