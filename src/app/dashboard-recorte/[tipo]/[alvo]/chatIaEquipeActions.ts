'use server';

// ROIP APP 9BOX — server actions do Assistente de lideranca (Chat IA)
// no dashboard-recorte/equipe (ME-UX-CONSOLIDACAO-P3a D3).
//
// Copia canonica das actions do dashboard-individual, adaptada para
// `dashboardLevel: 'equipe'` e `contextId: leaderId` (canonizacao S263
// + DOC 01 §10.2). O motor `sendChatMessage` do
// `aiChatService` ja aceita `equipe` bit-a-bit; aqui apenas mudamos o
// enum passado ao router `aiChat`.
//
// Debito de deduplicacao registrado: quando P3b estabilizar e cards
// de navegacao estiverem em producao, extrair helper canonico comum
// `chatIaAction<L>(dashboardLevel, contextId)` em
// `src/lib/chat-ia/` — evita 3 actions duplicadas por superficie.
//
// **RV-13.** As 3 actions sao consumidas por `AiChatDrawerEquipe.tsx`
// (mesmo diretorio) via `AiChatLauncherEquipe.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../../db/client';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../../server/auth/rateLimit';
import { createAiChatRouter } from '../../../../server/routers/aiChat';
import { getServerSession } from '../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../server/trpc';

import {
  MSG_ACTION_FALHA_GENERICA,
  type ChatIaGetArchivedHistoryResult,
  type ChatIaGetHistoryResult,
  type ChatIaMessage,
  type ChatIaSendMessageResult,
} from '../../../dashboard-individual/[id]/chatIaTypes';

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
 * Carrega o historico ativo do Assistente de lideranca no
 * dashboard-recorte/equipe para o par canonico `(userId, userType,
 * dashboardLevel='equipe', contextId=leaderId)`.
 */
export async function chatIaEquipeGetHistoryAction(input: {
  leaderId: number;
  leaderType: 'employee' | 'clevel';
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
      dashboardLevel: 'equipe',
      contextId: input.leaderId,
      contextType: input.leaderType,
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
 * Envia uma nova mensagem `user` ao motor Chat IA no nivel `equipe`.
 * Mesma semantica canonica das actions do individual: gravacao
 * garantida (§11.2), fallback canonico exposto ao drawer.
 */
export async function chatIaEquipeSendMessageAction(input: {
  leaderId: number;
  leaderType: 'employee' | 'clevel';
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
      dashboardLevel: 'equipe',
      contextId: input.leaderId,
      contextType: input.leaderType,
      content: input.content,
    });
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
 * Carrega uma pagina do historico arquivado (nivel equipe). Corte
 * canonico bit-a-bit da action do individual.
 */
export async function chatIaEquipeGetArchivedHistoryAction(input: {
  leaderId: number;
  leaderType: 'employee' | 'clevel';
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
      dashboardLevel: 'equipe',
      contextId: input.leaderId,
      contextType: input.leaderType,
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
