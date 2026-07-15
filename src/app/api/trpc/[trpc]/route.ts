// ROIP APP 9BOX — adapter tRPC para o App Router do Next 15 (ME-021).
//
// Handler unico de fetch (Web Request → Web Response) para todas as
// procedures sob `/api/trpc/*`. tRPC 11 expoe `fetchRequestHandler`, que
// case com o modelo de route handlers do Next 15 (funcoes GET/POST que
// recebem e devolvem `Request`/`Response` nativos).
//
// Transporte da sessao reemitida (S013, DOC 02 §5.2): o middleware `authed`
// (trpc.ts) grava o token sliding renovado em `ctx.reissuedToken.value`.
// Como cada request cria seu proprio contexto, capturamos a referencia do
// contexto no `createContext` e, apos o handler resolver, lemos o slot e —
// havendo reemissao — publicamos no header de resposta `x-roip-session`. O
// front, ao ver o header, substitui o token armazenado. Nao poluimos o body
// de cada resolver com dados de sessao.

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '../../../../server/routers';
import { createContext, type Context } from '../../../../server/trpc';

const TRPC_ENDPOINT = '/api/trpc';

async function handler(req: Request): Promise<Response> {
  // Capturamos o contexto desta request para ler `reissuedToken` depois.
  let captured: Context | null = null;

  const response = await fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req,
    router: appRouter,
    createContext: (opts) => {
      const ctx = createContext(opts);
      captured = ctx;
      return ctx;
    },
  });

  const reissued = captured === null ? null : (captured as Context).reissuedToken.value;
  if (reissued !== null) {
    response.headers.set('x-roip-session', reissued);
  }

  return response;
}

export { handler as GET, handler as POST };
