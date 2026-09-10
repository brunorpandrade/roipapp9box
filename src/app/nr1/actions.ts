'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDbClient, closeDbClient } from '../../db/client';
import { getServerSession } from '../../server/session/serverSession';
import { createNr1Router } from '../../server/routers/nr1';
import { createCallerFactory, createContextInner } from '../../server/trpc';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { resolveDatabaseUrl } from './internals';

const SESSION_COOKIE = 'session';

async function requireRH(): Promise<{ token: string }> {
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
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }

  return { token };
}

export async function configureCycleAction(input: {
  companyId: number;
  dataAbertura: string;
  dataFechamento: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { token } = await requireRH();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const router = createNr1Router();
    const caller = createCallerFactory(router)(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    await caller.configureCycle(input);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao configurar ciclo.';
    return { ok: false, error: message };
  } finally {
    await closeDbClient(client);
  }
}
