'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { createDashboardRouter } from '../../../server/routers/dashboard';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

const SESSION_COOKIE = 'session';

/** Retorno de `generateDiagnosticoAction`. */
export interface GenerateDiagnosticoResult {
  readonly ok: boolean;
  readonly texto: string | null;
  readonly geradoEm: string | null;
  readonly error?: string;
}

async function requireToken(): Promise<string> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }
  return token;
}

/**
 * Gera (ou atualiza) o Diagnostico IA do trimestre atual do colaborador.
 * O backend (`dashboard.generateDiagnostico`, §6.6) aplica o guard de
 * trimestre atual, escopo PC1f e permissao; erros voltam como mensagem.
 */
export async function generateDiagnosticoAction(input: {
  employeeId: number;
  trimestre: string;
}): Promise<GenerateDiagnosticoResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDashboardRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const result = await caller.generateDiagnostico({
      employeeId: input.employeeId,
      trimestre: input.trimestre,
    });
    const geradoEm =
      result.diagnosticoGeradoEm !== null ? result.diagnosticoGeradoEm.toISOString() : null;
    return { ok: true, texto: result.diagnostico, geradoEm };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar o diagnóstico.';
    return { ok: false, texto: null, geradoEm: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}
