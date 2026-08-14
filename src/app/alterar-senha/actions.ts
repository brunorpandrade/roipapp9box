// ROIP APP 9BOX — server actions canonicas de `/alterar-senha`
// (ME-080b Dispatch 3).
//
// Pattern S511 canonico + createCallerFactory: delega a
// `auth.changePassword` da router tRPC. `auth.changePassword` ja
// contem toda a logica canonica (bcrypt.compare senha atual, politica
// de senha, bcrypt.hash nova, UPDATE por role, `passwordSet=true`
// para platform via Dispatch 3, re-emissao de JWT/pwv).

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { authRouter } from '../../server/routers/auth';
import { createCallerFactory, createContextInner } from '../../server/trpc';

const SESSION_COOKIE = 'session';

const createAuthCaller = createCallerFactory(authRouter);
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
 * ME-080b Dispatch 3 — troca de senha para platform (Lider/RH/RH-Lider/
 * C-level) OU Super Admin. `auth.changePassword` cuida da role interna.
 * Retorna sucesso simples — o client redireciona para o painel apos ok.
 *
 * NOTA canonica sobre cookie: `auth.changePassword` re-emite JWT com pwv
 * atualizado via `ctx.reissuedToken.value`. Como estamos chamando via
 * createCallerFactory (nao pelo endpoint tRPC HTTP), essa re-emissao
 * fica no contexto criado aqui e NAO chega automaticamente ao browser.
 * O usuario permanecera com o cookie antigo — mas como o backend so
 * verifica pwv no proximo request tRPC, e como o painel usa server
 * components (getServerSession consulta banco, nao pwv), a sessao
 * segue valida. Se o usuario chamar tRPC apos trocar senha, o guard
 * `authed` fara reissue automatica (mesmo mecanismo do login).
 */
export async function alterarSenhaAction(input: {
  readonly senhaAtual: string;
  readonly novaSenha: string;
}): Promise<ActionResult<{ passwordSet: boolean }>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createAuthCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    await caller.changePassword({
      senhaAtual: input.senhaAtual,
      novaSenha: input.novaSenha,
    });
    return { ok: true, data: { passwordSet: true } };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
