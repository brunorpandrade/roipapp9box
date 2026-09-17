'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createMonthlyClosureRouter } from '../../server/routers/monthlyClosure';
import { createRevenueRouter } from '../../server/routers/revenue';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { enumerateJanelaDesc } from './internals';
import type { FaturamentoStatus, MesFaturamentoRow } from './internals';

const SESSION_COOKIE = 'session';
const JANELA_HISTORICO = 12;

/** Retorno de `loadFaturamentoMesAction`. */
export interface LoadMesResult {
  readonly ok: boolean;
  readonly faturamentoBruto: string | null;
  readonly status: FaturamentoStatus;
  readonly error?: string;
}

/** Retorno de `saveFaturamentoAction`. */
export interface SaveMesResult {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** Retorno de `loadHistoricoAction`. */
export interface HistoricoResult {
  readonly ok: boolean;
  readonly rows: readonly MesFaturamentoRow[];
  readonly error?: string;
}

/**
 * Garante sessao autenticada e devolve o token do cookie. Redireciona
 * para `/` quando ausente. Os guards de perfil (RF/Bruno) e de escopo de
 * empresa vivem no proprio router `revenue`/`monthlyClosure`.
 */
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

/** Le faturamento + status de um mes. */
export async function loadFaturamentoMesAction(input: {
  companyId: number;
  mes: string;
}): Promise<LoadMesResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken: token,
    });
    const revenueCaller = createCallerFactory(createRevenueRouter())(ctx);
    const closureCaller = createCallerFactory(createMonthlyClosureRouter())(ctx);
    const fat = await revenueCaller.getFaturamento({
      companyId: input.companyId,
      mes: input.mes,
    });
    const closure = await closureCaller.getClosureStatus({
      companyId: input.companyId,
      mes: input.mes,
    });
    return {
      ok: true,
      faturamentoBruto: fat.faturamentoBruto,
      status: closure.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar o mês.';
    return { ok: false, faturamentoBruto: null, status: 'aberto', error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Grava o faturamento bruto de um mes (backend aplica RF + nao-fechado). */
export async function saveFaturamentoAction(input: {
  companyId: number;
  mes: string;
  faturamentoBruto: string;
}): Promise<SaveMesResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createRevenueRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const result = await caller.saveFaturamento({
      companyId: input.companyId,
      mes: input.mes,
      faturamentoBruto: input.faturamentoBruto,
    });
    return { ok: true, created: result.created };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar o faturamento.';
    return { ok: false, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Le a janela de 12 meses (faturamento + status) terminando em `mesFinal`. */
export async function loadHistoricoAction(input: {
  companyId: number;
  mesFinal: string;
}): Promise<HistoricoResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken: token,
    });
    const revenueCaller = createCallerFactory(createRevenueRouter())(ctx);
    const closureCaller = createCallerFactory(createMonthlyClosureRouter())(ctx);
    const meses = enumerateJanelaDesc(input.mesFinal, JANELA_HISTORICO);
    const rows = await Promise.all(
      meses.map(async (mes): Promise<MesFaturamentoRow> => {
        const fat = await revenueCaller.getFaturamento({
          companyId: input.companyId,
          mes,
        });
        const closure = await closureCaller.getClosureStatus({
          companyId: input.companyId,
          mes,
        });
        return {
          mes,
          faturamentoBruto: fat.faturamentoBruto,
          status: closure.status,
        };
      }),
    );
    return { ok: true, rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar o histórico.';
    return { ok: false, rows: [], error: message };
  } finally {
    await closeDbClient(client);
  }
}
