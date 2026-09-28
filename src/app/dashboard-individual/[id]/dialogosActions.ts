'use server';

// ROIP APP 9BOX — server actions dos Dialogos de desenvolvimento (ME
// Etapa 1 — Bloco 2). Ponte entre `DialogosDrawer.tsx` (client) e o
// sub-router tRPC `developmentDialogs`.
//
// Regra canonica Next 15 App Router: arquivos com `'use server'` SO
// exportam funcoes async. Tipos e constantes vivem em `dialogosTypes.ts`
// (importado abaixo). Recusa detectada por [11/11] `next build` na
// primeira tentativa de aplicacao — segregacao canonica agora.
//
// **RV-13.** Todas as 5 actions sao consumidas por `DialogosDrawer.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { createDevelopmentDialogsRouter } from '../../../server/routers/developmentDialogs';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import {
  MSG_ACTION_FALHA_GENERICA_DIALOGOS,
  type DialogoRow,
  type DialogosAffectedResult,
  type DialogosListResult,
  type DialogosSingleResult,
} from './dialogosTypes';

const SESSION_COOKIE = 'session';

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

/** Adaptador Date->ISO string (canonico Etapa 0). */
function toDialogoRow(row: {
  id: number;
  companyId: number;
  liderId: number;
  employeeId: number;
  titulo: string | null;
  corpo: string | null;
  status: 'verde' | 'vermelho';
  pendencia: boolean;
  arquivado: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DialogoRow {
  return {
    id: row.id,
    companyId: row.companyId,
    liderId: row.liderId,
    employeeId: row.employeeId,
    titulo: row.titulo,
    corpo: row.corpo,
    status: row.status,
    pendencia: row.pendencia,
    arquivado: row.arquivado,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lista dialogos ativos do colaborador (ordem: createdAt DESC). */
export async function dialogosListAction(input: {
  employeeId: number;
}): Promise<DialogosListResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDevelopmentDialogsRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.list({ employeeId: input.employeeId });
    return { ok: true, dialogs: res.dialogs.map(toDialogoRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA_DIALOGOS;
    return { ok: false, dialogs: [], error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Cria um dialogo novo com valores padrao canonicos (§14.26). */
export async function dialogosCreateAction(input: {
  employeeId: number;
}): Promise<DialogosSingleResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDevelopmentDialogsRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.create({ employeeId: input.employeeId });
    return { ok: true, dialog: toDialogoRow(res.dialog) };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA_DIALOGOS;
    return { ok: false, dialog: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Atualiza campos parciais (titulo/corpo/status/pendencia). */
export async function dialogosUpdateAction(input: {
  id: number;
  titulo?: string | null;
  corpo?: string | null;
  status?: 'verde' | 'vermelho';
  pendencia?: boolean;
}): Promise<DialogosSingleResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDevelopmentDialogsRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.update(input);
    return { ok: true, dialog: toDialogoRow(res.dialog) };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA_DIALOGOS;
    return { ok: false, dialog: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Arquiva (com confirmacao canonica no drawer). */
export async function dialogosArchiveAction(input: {
  id: number;
}): Promise<DialogosAffectedResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDevelopmentDialogsRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.archive({ id: input.id });
    return { ok: true, affected: res.affected };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA_DIALOGOS;
    return { ok: false, affected: 0, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/** Descarte fisico canonico (antes do primeiro salvamento — §14.26). */
export async function dialogosDiscardAction(input: {
  id: number;
}): Promise<DialogosAffectedResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDevelopmentDialogsRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.discard({ id: input.id });
    return { ok: true, affected: res.affected };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA_DIALOGOS;
    return { ok: false, affected: 0, error: message };
  } finally {
    await closeDbClient(client);
  }
}
