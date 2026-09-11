import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { cookies } from 'next/headers';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
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

  const isRH =
    session.kind === 'platform' && (session.role === 'rh' || session.role === 'rh_lider');
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (!isRH) {
    redirect('/access-denied?rota=/nr1');
  }

  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (bearerToken === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rhFlagsResult = await loadRhSessionFlags(client.db, session.userId);
    const rhFlags = rhFlagsResult ?? {
      isRH: true,
      isLider: session.role === 'rh_lider',
      isResponsavelFinanceiro: false,
      hasDescendingChain: false,
    };

    const profileKey = resolveProfileKey({
      session,
      isRH: true,
      isLider: session.role === 'rh_lider',
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error('Perfil RH não reconhecido.');
    }

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
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <Nr1Client {...clientProps} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
