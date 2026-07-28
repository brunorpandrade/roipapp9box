// ROIP APP 9BOX — motor `aiChatService` (ME-052, S267).
//
// Motor unico canonico do Chat IA (DOC 04 §5). Composicao do
// contexto por nivel (§5.5), extensao condicional pelo bloco
// `perfil_individual` (§5.3), aplicacao de bloqueios canonicos por
// permissao (§5.6), recomposicao a cada chamada (§5.7), chamada
// canonica via wrapper `claudeCall` (S258 Facade DI), persistencia
// em `aiConversations` segundo §11.2 (mensagem user sempre gravada;
// resposta assistant so no sucesso).
//
// Regime canonico (S263 — MVP):
//   - Aceita apenas `dashboardLevel ∈ {'equipe', 'individual'}`.
//   - Nivel `global` e `departamento` sao BLOQUEADOS no ponto de
//     entrada (`sendChatMessage`) — defesa em profundidade contra
//     bypass da validacao Zod do router.
//
// Governanca de custo canonica (§2.3): Chat IA NAO consome
// `apiUsageLog`. Este motor nao faz UPSERT em `apiUsageLog`. A
// telemetria universal §2.6 e emitida via `onTelemetry` do
// `claudeCall`.
//
// Politica de falha canonica (§11.2):
//   - `insertAiConversation({role: 'user'})` executa ANTES da
//     chamada a Claude API.
//   - Chamada falhou (retry esgotado): retorna outcome estruturado
//     com `kind: 'failed_claude'` — o assistant NAO e gravado. Uma
//     nova mensagem do usuario reconstroi o contexto do zero.
//   - Chamada ok: `insertAiConversation({role: 'assistant', content:
//     result.content})`.
//
// Chamador canonico: `aiChat.sendMessage` (router `aiChat`).
// Testes: `tests/unit/aiChatService.test.ts` +
// `tests/integration/aiChat-router.test.ts`.

import type { RoipDatabase } from '../../db/client';
import { insertAiConversation } from './aiConversations';
import { AI_CHAT_SYSTEM_PROMPT } from './aiChatSystemPrompt';
import {
  DEFAULT_CLAUDE_CALL_FACADE,
  type ClaudeCallFacade,
  type ClaudeCallResult,
  type ClaudeCallStatus,
  type ClaudeCallSurface,
} from './claudeCall';
import type {
  ChatIaDashboardLevel,
  ChatIaUserType,
  DashboardEquipeContextArgs,
  DashboardEquipeContextPayload,
  DashboardIndividualContextArgs,
  DashboardIndividualContextPayload,
} from './_shared/dashboardContextTypes';
import { loadDashboardEquipeContext } from './_shared/dashboardEquipeContext';
import { loadDashboardIndividualContext } from './_shared/dashboardIndividualContext';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * `max_tokens` canonico do Chat IA. Respostas concisas por padrao
 * (§9.2 §6 — "tipica entre 3 e 8 linhas"); teto de 2000 tokens cobre
 * respostas mais longas quando o gestor pede analise aprofundada.
 */
export const AI_CHAT_MAX_TOKENS = 2_000;

/** `temperature` canonica do Chat IA. Interpretacao estavel. */
export const AI_CHAT_TEMPERATURE = 0.5;

/**
 * Niveis canonicos suportados pelo Chat IA no MVP (S263). Consumido
 * pelo `z.enum(...)` do router.
 */
export const CHAT_IA_LEVELS_MVP: readonly ChatIaDashboardLevel[] = [
  'equipe',
  'individual',
] as const;

/**
 * Tamanho maximo canonico da mensagem do usuario. Bloqueio no router
 * antes de gravar em `aiConversations.content` (§5.8 canonico).
 */
export const CHAT_IA_USER_MESSAGE_MAX_CHARS = 2_000 as const;

/**
 * Mensagem canonica exata de fallback §11.2 do DOC 04. Exportada
 * como constante para assercao literal em testes (S206). Aparece
 * dentro do drawer, no lugar da resposta `assistant` que nao foi
 * gerada.
 */
export const MSG_CHAT_IA_FALLBACK =
  'Não foi possível processar sua pergunta agora. Tente novamente em alguns instantes.';

/**
 * Superficie canonica de telemetria por nivel (§2.6). Consumida
 * pelo wrapper `claudeCall`.
 */
export function chatIaSurfaceFromLevel(level: ChatIaDashboardLevel): ClaudeCallSurface {
  return level === 'equipe' ? 'aiChat_equipe' : 'aiChat_individual';
}

// ============================================================
// Composicao canonica do user prompt (§8.3)
// ============================================================

interface IndividualUserPromptInput {
  level: 'individual';
  payload: DashboardIndividualContextPayload;
}

interface EquipeUserPromptInput {
  level: 'equipe';
  payload: DashboardEquipeContextPayload;
}

type ChatIaUserPromptInput = IndividualUserPromptInput | EquipeUserPromptInput;

/**
 * Compoe o user prompt canonico (mensagem inicial da conversa) a
 * partir do payload do contexto. Wrapping textual §8.3.1 / §8.3.2 +
 * JSON literal serializado.
 */
export function composeChatIaUserPrompt(input: ChatIaUserPromptInput): string {
  if (input.level === 'individual') {
    const preamble =
      // eslint-disable-next-line @stylistic/max-len -- preambulo canonico literal §8.3.1
      'Contexto do dashboard individual do colaborador que você está ajudando o gestor a analisar. Todos os dados abaixo foram calculados pelos motores determinísticos do backend. Você nunca calcula, nunca deriva, nunca corrige nenhum número. Você interpreta.';
    const trailer =
      // eslint-disable-next-line @stylistic/max-len -- trailer canonico literal §8.3.1
      'Estou pronto para receber perguntas do gestor sobre este colaborador. Responderei em linguagem executiva, sem jargão técnico dos motores ou do assessment.';
    return `${preamble}\n\n${JSON.stringify(input.payload, null, 2)}\n\n${trailer}`;
  }
  const preamble =
    // eslint-disable-next-line @stylistic/max-len -- preambulo canonico literal §8.3.2
    'Contexto do dashboard de equipe. Todos os dados agregados foram calculados pelos motores determinísticos do backend.';
  const trailer = 'Estou pronto para receber perguntas sobre esta equipe.';
  return `${preamble}\n\n${JSON.stringify(input.payload, null, 2)}\n\n${trailer}`;
}

// ============================================================
// Facade DI canonica (S205/S258)
// ============================================================

/**
 * Dependencias injetaveis do motor Chat IA. `claudeCallFacade` e
 * substituido por stub deterministico nos testes de integracao. Os
 * loaders de contexto sao injetaveis para permitir teste unit sem
 * banco de dados real.
 */
export interface AiChatServiceDeps {
  db: RoipDatabase;
  claudeCallFacade: ClaudeCallFacade;
  loadIndividualContext: (
    db: RoipDatabase,
    args: DashboardIndividualContextArgs,
  ) => Promise<DashboardIndividualContextPayload | null>;
  loadEquipeContext: (
    db: RoipDatabase,
    args: DashboardEquipeContextArgs,
  ) => Promise<DashboardEquipeContextPayload | null>;
}

/** Factory canonica com defaults reais. */
export function createDefaultAiChatServiceDeps(db: RoipDatabase): AiChatServiceDeps {
  return {
    db,
    claudeCallFacade: DEFAULT_CLAUDE_CALL_FACADE,
    loadIndividualContext: loadDashboardIndividualContext,
    loadEquipeContext: loadDashboardEquipeContext,
  };
}

// ============================================================
// Argumentos canonicos do `sendChatMessage`
// ============================================================

/**
 * Argumentos canonicos de `sendChatMessage`. `contextId` interpretado
 * pelo motor conforme §10.2 do DOC 01:
 *   - `individual` → `employees.id` do colaborador visualizado.
 *   - `equipe`     → `employees.id` do lider.
 * `viewerUserId` e `viewerUserType` sao usados para bloqueios §5.6.
 */
export interface SendChatMessageArgs {
  companyId: number;
  dashboardLevel: ChatIaDashboardLevel;
  contextId: number;
  content: string;
  viewerRole: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider';
  viewerUserId: number;
  viewerUserType: ChatIaUserType;
}

/** Union discriminado do outcome canonico de `sendChatMessage`. */
export type SendChatMessageOutcome =
  | {
      kind: 'ok';
      /** Texto integral da resposta `assistant`. */
      assistantContent: string;
      /** Id do registro `assistant` gravado em `aiConversations`. */
      assistantId: number;
      /** Id do registro `user` gravado em `aiConversations`. */
      userId: number;
      /** Metadados de telemetria propagados do `claudeCall`. */
      telemetryCallId: string;
    }
  | {
      kind: 'context_not_found';
      /** Id do registro `user` (gravado antes da checagem — §11.2). */
      userId: number;
    }
  | {
      kind: 'failed_claude';
      status: Exclude<ClaudeCallStatus, 'sucesso'>;
      /** Id do registro `user` (gravado sempre — §11.2). */
      userId: number;
      /**
       * Mensagem canonica exata §11.2 exposta ao frontend. Constante
       * `MSG_CHAT_IA_FALLBACK`.
       */
      message: string;
    };

// ============================================================
// Motor canonico
// ============================================================

/**
 * Envia uma nova mensagem do usuario ao Chat IA. Fluxo canonico:
 *   1. Bloqueia canonicamente `dashboardLevel` fora do MVP (S263).
 *   2. Grava mensagem `user` em `aiConversations` (§11.2 — sempre).
 *   3. Recompoe contexto do zero (§5.7).
 *   4. Se contexto = null (colaborador/lider inexistente), retorna
 *      outcome `context_not_found` — router traduz para NOT_FOUND.
 *   5. Chama Claude API via `claudeCallFacade`.
 *   6. Se falha: outcome `failed_claude` — assistant nao e gravado.
 *   7. Se ok: grava mensagem `assistant` e retorna outcome `ok`.
 */
export async function sendChatMessage(
  deps: AiChatServiceDeps,
  args: SendChatMessageArgs,
): Promise<SendChatMessageOutcome> {
  // 1. Bloqueio canonico defesa-em-profundidade (S263). O router ja
  //    valida via Zod; este guard protege contra chamada direta do
  //    motor em teste.
  if (!CHAT_IA_LEVELS_MVP.includes(args.dashboardLevel)) {
    throw new Error(`sendChatMessage: dashboardLevel '${args.dashboardLevel}' fora do MVP (S263)`);
  }

  // 2. Grava mensagem `user` ANTES da chamada (§11.2 — sempre).
  const userMessageId = await insertAiConversation(deps.db, {
    companyId: args.companyId,
    userId: args.viewerUserId,
    userType: args.viewerUserType,
    dashboardLevel: args.dashboardLevel,
    contextId: args.contextId,
    role: 'user',
    content: args.content,
  });

  // 3. Recompoe contexto do zero (§5.7).
  let userPrompt: string;
  if (args.dashboardLevel === 'individual') {
    const payload = await deps.loadIndividualContext(deps.db, {
      companyId: args.companyId,
      employeeId: args.contextId,
      viewerRole: args.viewerRole,
      viewerUserId: args.viewerUserId,
      viewerUserType: args.viewerUserType,
    });
    if (payload === null) {
      return { kind: 'context_not_found', userId: userMessageId };
    }
    userPrompt = composeChatIaUserPrompt({ level: 'individual', payload });
  } else {
    const payload = await deps.loadEquipeContext(deps.db, {
      companyId: args.companyId,
      liderId: args.contextId,
      viewerRole: args.viewerRole,
      viewerUserId: args.viewerUserId,
      viewerUserType: args.viewerUserType,
    });
    if (payload === null) {
      return { kind: 'context_not_found', userId: userMessageId };
    }
    userPrompt = composeChatIaUserPrompt({ level: 'equipe', payload });
  }

  // 4. Chama Claude API via Facade DI. Texto plano (jsonExpected =
  //    false — §2.2 texto plano corrompido nao dispara retry).
  const result: ClaudeCallResult = await deps.claudeCallFacade.claudeCall({
    systemPrompt: AI_CHAT_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: AI_CHAT_MAX_TOKENS,
    temperature: AI_CHAT_TEMPERATURE,
    jsonExpected: false,
    telemetry: {
      companyId: args.companyId,
      surface: chatIaSurfaceFromLevel(args.dashboardLevel),
      userId: args.viewerUserId,
      userType: args.viewerUserType,
    },
  });

  // 5. Falha canonica §11.2 — assistant nao e gravado.
  if (!result.ok) {
    return {
      kind: 'failed_claude',
      status: result.status,
      userId: userMessageId,
      message: MSG_CHAT_IA_FALLBACK,
    };
  }

  // 6. Sucesso — grava mensagem `assistant`.
  const assistantMessageId = await insertAiConversation(deps.db, {
    companyId: args.companyId,
    userId: args.viewerUserId,
    userType: args.viewerUserType,
    dashboardLevel: args.dashboardLevel,
    contextId: args.contextId,
    role: 'assistant',
    content: result.content,
  });

  return {
    kind: 'ok',
    assistantContent: result.content,
    assistantId: assistantMessageId,
    userId: userMessageId,
    telemetryCallId: result.telemetry.callId,
  };
}
