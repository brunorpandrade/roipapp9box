// ROIP APP 9BOX — server actions do /meus-dados (ME-082).
//
// Pattern S511 canonico + createCallerFactory: delega a
// `myData.updateName` da router tRPC via caller server-side. Mesmo
// padrao consolidado em src/app/alterar-senha/actions.ts (ME-080b
// Dispatch 3) e demais actions do B8.
//
// **RV-12.** Sem SQL cru. Delega a Drizzle tipado via myDataRouter.
// **RV-13.** Consumido por MeusDadosClient.tsx (mesma ME).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { myDataRouter } from '../../server/routers/myData';
import { createCallerFactory, createContextInner } from '../../server/trpc';

const SESSION_COOKIE = 'session';

const createMyDataCaller = createCallerFactory(myDataRouter);
const actionRateLimiter = createRateLimiter();

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

/**
 * ME-082 — atualiza o nome do Super Admin autenticado (H1a — DOC 05
 * §14.5 fluxo edicao). Cliente propaga `novoNome` imediatamente no
 * card, header e avatar (recalculo das iniciais) sem re-fetch.
 *
 * Validacao canonica (redundante server-side): trim().length > 0 &&
 * length <= 100. Zod da procedure ja reprova violacao com mensagens
 * canonicas literais §14.5.
 *
 * Guard canonico: requireSuperAdmin dentro da procedure lanca
 * FORBIDDEN quando qualquer outro perfil chegar aqui (defense-in-depth
 * ao guard client — H1b nao renderiza [Editar]).
 */
export async function atualizarNomeAction(input: {
  readonly nome: string;
}): Promise<ActionResult<{ readonly novoNome: string }>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createMyDataCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.updateName({ nome: input.nome });
    return { ok: true, data: { novoNome: result.novoNome } };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
