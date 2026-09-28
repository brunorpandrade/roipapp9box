'use server';

// ROIP APP 9BOX — server actions do Chat IA (ME Etapa 1 — Bloco 1).
//
// Ponte canonica entre o `AiChatDrawer.tsx` (client) e o sub-router
// tRPC `aiChat` (ME-052 §5.8). Nao ha logica de negocio aqui: cada
// action instancia o caller do router `aiChat` via `createCallerFactory`
// (mesmo padrao das actions existentes `loadDashboardQuarterAction`,
// `generateDiagnosticoAction`), o router aplica canonicamente os guards
// `resolveScopeOrThrow` + `assertLiderScopeOrThrow` + Zod §5.8.
//
// Nivel: `individual` fixo nesta superficie. Extensao futura para
// `equipe` fica em ME propria (dashboard de equipe) — decisao S263
// canoniza os 2 niveis MVP; a superficie do dashboard individual so
// consome nivel `individual`.
//
// Regra canonica Next 15 App Router: arquivos com `'use server'` SO
// exportam funcoes async. Tipos e constantes vivem em `chatIaTypes.ts`
// (importado abaixo). Recusa detectada por [11/11] `next build` na
// primeira tentativa de aplicacao — segregacao canonica agora.
//
// **RV-13.** Todas as 3 actions sao consumidas por `AiChatDrawer.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { createAiChatRouter } from '../../../server/routers/aiChat';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import {
  MSG_ACTION_FALHA_GENERICA,
  type ChatIaGetArchivedHistoryResult,
  type ChatIaGetHistoryResult,
  type ChatIaMessage,
  type ChatIaSendMessageResult,
} from './chatIaTypes';

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

/**
 * Adaptador canonico do row do banco (Date `createdAt`) para o formato
 * serializavel `ChatIaMessage` (string ISO). `.toISOString()` UTC bit-a-bit
 * — canonizado pela Etapa 0 para datas atravessando fronteiras.
 */
function toChatIaMessage(row: {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}): ChatIaMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Carrega o historico ativo do Chat IA para o par `(userId, userType,
 * dashboardLevel, contextId)`. Filtra `archivedAt IS NULL`. Consumido no
 * `useEffect` inicial do drawer (§8.3 CAMADA_UI — historico ativo
 * exibido normalmente).
 */
export async function chatIaGetHistoryAction(input: {
  employeeId: number;
}): Promise<ChatIaGetHistoryResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createAiChatRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.getHistory({
      dashboardLevel: 'individual',
      contextId: input.employeeId,
    });
    return {
      ok: true,
      messages: res.messages.map(toChatIaMessage),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA;
    return { ok: false, messages: [], error: message };
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Envia uma nova mensagem `user` ao motor Chat IA. O router aplica
 * §5.7 (recomposicao do contexto), grava `user` sempre (§11.2), chama
 * Claude, grava `assistant` no sucesso.
 *
 * Contrato canonico:
 *   - Sucesso: retorna `userMessage` + `assistantMessage` (ambos com id
 *     do INSERT do router).
 *   - Falha §11.2 (Claude): router lanca INTERNAL_SERVER_ERROR com
 *     `MSG_CHAT_IA_FALLBACK` — capturamos e retornamos `ok: false` com
 *     esse literal para o drawer renderizar `[Tentar novamente]` (§8.2).
 *   - context_not_found: router lanca NOT_FOUND — retornamos `ok: false`
 *     com mensagem canonica exata.
 */
export async function chatIaSendMessageAction(input: {
  employeeId: number;
  content: string;
}): Promise<ChatIaSendMessageResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createAiChatRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const nowIso = new Date().toISOString();
    const res = await caller.sendMessage({
      dashboardLevel: 'individual',
      contextId: input.employeeId,
      content: input.content,
    });
    // Reconstroi os dois registros para o drawer sem depender de um
    // getHistory adicional (economiza uma round-trip). `createdAt`
    // aproximado pelo instante da chamada — o drawer refetcha ao abrir
    // se precisar do valor canonico do banco.
    return {
      ok: true,
      userMessage: {
        id: res.userMessageId,
        role: 'user',
        content: input.content,
        createdAt: nowIso,
      },
      assistantMessage: {
        id: res.assistantMessageId,
        role: 'assistant',
        content: res.content,
        createdAt: nowIso,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA;
    return { ok: false, userMessage: null, assistantMessage: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Carrega uma pagina do historico arquivado para o par canonico. Corte
 * `CHAT_IA_ARCHIVED_PAGE_SIZE_CAP = 50` aplicado pelo Zod do router;
 * consumidor default 20 itens por pagina (§8.3 sub-view somente-leitura).
 */
export async function chatIaGetArchivedHistoryAction(input: {
  employeeId: number;
  page: number;
  pageSize: number;
}): Promise<ChatIaGetArchivedHistoryResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createAiChatRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const res = await caller.getArchivedHistory({
      dashboardLevel: 'individual',
      contextId: input.employeeId,
      page: input.page,
      pageSize: input.pageSize,
    });
    return {
      ok: true,
      messages: res.messages.map(toChatIaMessage),
      page: res.page,
      pageSize: res.pageSize,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : MSG_ACTION_FALHA_GENERICA;
    return {
      ok: false,
      messages: [],
      page: input.page,
      pageSize: input.pageSize,
      error: message,
    };
  } finally {
    await closeDbClient(client);
  }
}
