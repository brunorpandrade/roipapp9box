'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { createDashboardRouter } from '../../../server/routers/dashboard';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import { buildQuarterView, type EixoXDetalhe, type QuarterView } from './internals';

const SESSION_COOKIE = 'session';

/** Retorno de `loadEixoXDetalheAction`. */
export interface LoadEixoXResult {
  readonly ok: boolean;
  readonly detalhe: EixoXDetalhe | null;
  readonly error?: string;
}

/** Retorno de `loadDashboardQuarterAction`. */
export interface LoadQuarterResult {
  readonly ok: boolean;
  readonly view: QuarterView | null;
  readonly error?: string;
}

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

/** Carrega o snapshot de um trimestre (navegacao Anterior/Proximo). */
export async function loadDashboardQuarterAction(input: {
  employeeId: number;
  trimestre: string;
}): Promise<LoadQuarterResult> {
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
    const dash = await caller.getEmployeeDashboard({
      employeeId: input.employeeId,
      trimestre: input.trimestre,
    });
    const view = buildQuarterView({
      trimestre: input.trimestre,
      quarterly: dash.latestQuarterly,
      plenitude: dash.latestPlenitude,
      nineBox: dash.latestNineBox,
      assiduidadeMedia: dash.assiduidadeMedia,
    });
    return { ok: true, view };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar o trimestre.';
    return { ok: false, view: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Carrega o detalhamento do Eixo X (variaveis) de um trimestre. */
export async function loadEixoXDetalheAction(input: {
  employeeId: number;
  trimestre: string;
}): Promise<LoadEixoXResult> {
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
    const detalhe = await caller.getEixoXDetalhe({
      employeeId: input.employeeId,
      trimestre: input.trimestre,
    });
    return { ok: true, detalhe };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar o detalhamento.';
    return { ok: false, detalhe: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Gera (ou atualiza) o Diagnostico IA do trimestre atual do colaborador. */
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
