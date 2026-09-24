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
import { verifyToken } from '../../server/auth/jwt';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { authRouter } from '../../server/routers/auth';
import { setSessionCookie, type SessionKind } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

const SESSION_COOKIE = 'session';

const createAuthCaller = createCallerFactory(authRouter);
const actionRateLimiter = createRateLimiter();

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
 * NOTA canonica sobre cookie (§5.7 "exceto a sessao atual"):
 * `auth.changePassword` re-emite o JWT com o pwv derivado do NOVO
 * passwordHash e o publica em `ctx.reissuedToken.value`. Como a chamada
 * e via createCallerFactory (nao pelo endpoint tRPC HTTP), o adapter de
 * fetch nao existe para publicar o header `x-roip-session`; portanto
 * este action LE `ctx.reissuedToken.value` e grava o cookie `session`
 * novo via `setSessionCookie`. Sem isso, o cookie do browser
 * permaneceria com o pwv antigo e o proximo render server-side
 * (`getServerSession`, que agora compara pwv — §5.7) invalidaria a
 * propria sessao que originou a troca, derrubando o usuario em
 * `/meus-dados` com UNAUTHORIZED. Gravar o cookie realiza a regra
 * canonica: invalida todas as sessoes EXCETO a atual.
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
    const ctx = createContextInner({
      db: client.db,
      rateLimiter: actionRateLimiter,
      bearerToken: token,
      ip: null,
    });
    const caller = createAuthCaller(ctx);
    await caller.changePassword({
      senhaAtual: input.senhaAtual,
      novaSenha: input.novaSenha,
    });
    // §5.7 "exceto a sessao atual": grava no browser o cookie `session`
    // reemitido com o pwv novo. `changePassword` sempre preenche
    // `ctx.reissuedToken.value` no sucesso (Super Admin e plataforma).
    const reissuedToken = ctx.reissuedToken.value;
    if (reissuedToken !== null) {
      const verified = await verifyToken(reissuedToken);
      const kind: SessionKind =
        verified.valid && verified.token.kind === 'super_admin' ? 'super_admin' : 'platform';
      await setSessionCookie(reissuedToken, kind);
    }
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
