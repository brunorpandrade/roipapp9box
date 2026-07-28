// ROIP APP 9BOX — sub-router `aiChat` (ME-052, S265).
//
// Superficie tRPC canonica do Chat IA (DOC 04 §5). 3 procs canonicas
// do §5.8:
//   - `aiChat.sendMessage` — envia nova mensagem, recompoe contexto,
//     chama Claude, persiste e devolve a resposta ao drawer.
//   - `aiChat.getHistory` — historico ativo (`archivedAt IS NULL`).
//   - `aiChat.getArchivedHistory` — historico arquivado paginado.
//
// Regime canonico (S263 — MVP):
//   - `dashboardLevel` aceita apenas `'equipe' | 'individual'`. Zod
//     `.enum(CHAT_IA_LEVELS_MVP)` bloqueia `'global'` e
//     `'departamento'` na entrada.
//   - Compatibilidade forward: schema `aiConversations` mantem os 4
//     valores canonicos do enum `dashboardLevel`; corte esta apenas
//     na superficie tRPC + no motor.
//
// Autorizacao canonica:
//   - `roleProcedure(['super_admin','rh','rh_lider','clevel','lider'])`
//     — mesma superficie do dashboard base.
//   - Guards especificos (cadeia direta de lider, cross-empresa) sao
//     aplicados aqui, ANTES da chamada ao motor.
//
// Chamador: `appRouter` em `routers/index.ts`.
// Testes: `tests/integration/aiChat-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { aiConversations, employees } from '../../db/schema';
import type { ChatIaUserType } from '../services/_shared/dashboardContextTypes';
import {
  CHAT_IA_LEVELS_MVP,
  CHAT_IA_USER_MESSAGE_MAX_CHARS,
  createDefaultAiChatServiceDeps,
  sendChatMessage,
  type AiChatServiceDeps,
  type SendChatMessageArgs,
  type SendChatMessageOutcome,
} from '../services/aiChatService';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas exportadas (S206 — assercao literal em teste)
// ============================================================

/**
 * Mensagem canonica exata para input Zod bloqueando `global` ou
 * `departamento` (S263). Exposta como constante para assercao literal.
 */
export const MSG_CHAT_IA_LEVEL_FORA_MVP =
  'Nivel de dashboard nao suportado pelo Chat IA no MVP. Somente equipe e individual sao aceitos.';

/**
 * Mensagem canonica exata quando o contexto do dashboard (colaborador
 * ou lider) nao existe.
 */
export const MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO =
  'Contexto do dashboard nao encontrado ou fora de escopo.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** Nivel canonico aceito (S263). Zod bloqueia global/departamento. */
export const CHAT_IA_LEVEL_SCHEMA = z.enum(CHAT_IA_LEVELS_MVP);

/** Input canonico de `aiChat.sendMessage`. */
export const SEND_MESSAGE_INPUT_SCHEMA = z.object({
  dashboardLevel: CHAT_IA_LEVEL_SCHEMA,
  contextId: z.number().int().positive(),
  content: z.string().min(1).max(CHAT_IA_USER_MESSAGE_MAX_CHARS),
});

/** Input canonico de `aiChat.getHistory`. */
export const GET_HISTORY_INPUT_SCHEMA = z.object({
  dashboardLevel: CHAT_IA_LEVEL_SCHEMA,
  contextId: z.number().int().positive(),
});

/** Corte canonico da paginacao do historico arquivado. */
export const CHAT_IA_ARCHIVED_PAGE_SIZE_CAP = 50 as const;

/** Input canonico de `aiChat.getArchivedHistory`. */
export const GET_ARCHIVED_HISTORY_INPUT_SCHEMA = z.object({
  dashboardLevel: CHAT_IA_LEVEL_SCHEMA,
  contextId: z.number().int().positive(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(CHAT_IA_ARCHIVED_PAGE_SIZE_CAP).default(20),
});

// ============================================================
// Facade DI canonica (S205/S258) — para stub em teste de integracao
// ============================================================

/**
 * Facade canonica do motor Chat IA — permite substituir por stub
 * deterministico em teste de integracao sem tocar o wrapper
 * `claudeCall`.
 */
export interface AiChatServiceFacade {
  sendChatMessage: (args: SendChatMessageArgs) => Promise<SendChatMessageOutcome>;
}

/**
 * Dependencias canonicas do sub-router `aiChat`. `deps.serviceFactory`
 * recebe o `db` do contexto e devolve a Facade — permite testes
 * substituirem o motor por stub sem instanciar Claude API.
 */
export interface AiChatRouterDeps {
  serviceFactory?: (db: RoipDatabase) => AiChatServiceFacade;
}

/**
 * Factory canonica default: instancia o motor real com
 * `DEFAULT_CLAUDE_CALL_FACADE`.
 */
export const DEFAULT_AI_CHAT_ROUTER_DEPS: Required<AiChatRouterDeps> = {
  serviceFactory: (db: RoipDatabase) => {
    const deps: AiChatServiceDeps = createDefaultAiChatServiceDeps(db);
    return {
      sendChatMessage: (args) => sendChatMessage(deps, args),
    };
  },
};

// ============================================================
// Helpers de derivacao de identidade
// ============================================================

/**
 * Deriva `userType` canonico do `ctx.user`. Consumido para o INSERT
 * em `aiConversations.userType` (enum canonico 3 valores) e para o
 * `viewerUserType` do motor.
 */
export function deriveUserTypeFromCtx(user: AuthenticatedUser): ChatIaUserType {
  if (user.role === 'super_admin') {
    return 'super_admin';
  }
  if (user.role === 'clevel') {
    return 'clevel';
  }
  return 'employee';
}

/**
 * Deriva o `userId` canonico do `ctx.user` (super_admin usa
 * `superAdminId`; demais usam `userId`).
 */
export function deriveUserIdFromCtx(user: AuthenticatedUser): number {
  if (user.role === 'super_admin') {
    return user.superAdminId;
  }
  return user.userId;
}

/**
 * Deriva `companyId` canonico. Super_admin (opera global) precisa
 * receber o `companyId` de outra fonte — resolvido no handler via
 * lookup do contextId. Este helper cobre apenas o caminho dos
 * perfis administrativos com companyId no JWT.
 */
export function deriveCompanyIdFromCtxOrNull(user: AuthenticatedUser): number | null {
  if (user.role === 'super_admin') {
    return null;
  }
  return user.companyId;
}

// ============================================================
// Guards canonicos aplicados ao input
// ============================================================

interface ResolvedScope {
  companyId: number;
  employeeIdParaLoader: number;
}

/**
 * Resolve o `companyId` real e valida cross-empresa. Cobre os dois
 * casos canonicos:
 *   - `individual`: `contextId` e `employees.id` do colaborador.
 *   - `equipe`: `contextId` e `employees.id` do lider.
 * Super_admin atravessa (le do banco); demais roles cruzam contra o
 * proprio `ctx.user.companyId`.
 */
async function resolveScopeOrThrow(
  db: RoipDatabase,
  user: AuthenticatedUser,
  contextId: number,
): Promise<ResolvedScope> {
  const [row] = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      status: employees.status,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(eq(employees.id, contextId))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
    });
  }
  if (user.role !== 'super_admin') {
    if (user.companyId !== row.companyId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
      });
    }
  }
  // Guard §3.13 do dashboard base: colaborador inativo → apenas Bruno
  // e RH.
  if (row.status === 'inativo') {
    const allowsInactive =
      user.role === 'super_admin' || user.role === 'rh' || user.role === 'rh_lider';
    if (!allowsInactive) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Chat IA sobre colaborador inativo restrito a Bruno e RH.',
      });
    }
  }
  return {
    companyId: row.companyId,
    employeeIdParaLoader: row.id,
  };
}

/**
 * Guard canonico S066 aplicado a `lider`: acesso restrito a cadeia
 * direta (ou ao proprio dashboard/equipe). Chamado apos `resolveScope`.
 */
async function assertLiderScopeOrThrow(
  db: RoipDatabase,
  user: AuthenticatedUser,
  dashboardLevel: 'equipe' | 'individual',
  contextId: number,
): Promise<void> {
  if (user.role !== 'lider') {
    return;
  }
  if (dashboardLevel === 'equipe') {
    if (user.userId !== contextId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
      });
    }
    return;
  }
  // level === 'individual': ou dashboard proprio, ou liderado direto.
  if (user.userId === contextId) {
    return;
  }
  const link = await getActiveLeaderHistoryByEmployee(db, contextId);
  if (!link || link.liderId !== user.userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
    });
  }
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `aiChat`. `deps` permite injetar
 * `serviceFactory` para stub em teste de integracao.
 */
export function createAiChatRouter(deps: AiChatRouterDeps = {}) {
  const routerDeps: Required<AiChatRouterDeps> = {
    ...DEFAULT_AI_CHAT_ROUTER_DEPS,
    ...deps,
  };

  return router({
    // ============================================================
    // Proc 1 — sendMessage (§5.8)
    // ============================================================
    sendMessage: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(SEND_MESSAGE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveScopeOrThrow(ctx.db, ctx.user, input.contextId);
        await assertLiderScopeOrThrow(ctx.db, ctx.user, input.dashboardLevel, input.contextId);
        const facade = routerDeps.serviceFactory(ctx.db);
        const outcome = await facade.sendChatMessage({
          companyId: scope.companyId,
          dashboardLevel: input.dashboardLevel,
          contextId: input.contextId,
          content: input.content,
          viewerRole: ctx.user.role,
          viewerUserId: deriveUserIdFromCtx(ctx.user),
          viewerUserType: deriveUserTypeFromCtx(ctx.user),
        });
        if (outcome.kind === 'context_not_found') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
          });
        }
        if (outcome.kind === 'failed_claude') {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: outcome.message,
          });
        }
        return {
          content: outcome.assistantContent,
          userMessageId: outcome.userId,
          assistantMessageId: outcome.assistantId,
        };
      }),

    // ============================================================
    // Proc 2 — getHistory (§5.8)
    // ============================================================
    getHistory: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_HISTORY_INPUT_SCHEMA)
      .query(async ({ ctx, input }) => {
        await resolveScopeOrThrow(ctx.db, ctx.user, input.contextId);
        await assertLiderScopeOrThrow(ctx.db, ctx.user, input.dashboardLevel, input.contextId);
        const userId = deriveUserIdFromCtx(ctx.user);
        const userType = deriveUserTypeFromCtx(ctx.user);
        const rows = await ctx.db
          .select()
          .from(aiConversations)
          .where(
            and(
              eq(aiConversations.userId, userId),
              eq(aiConversations.userType, userType),
              eq(aiConversations.dashboardLevel, input.dashboardLevel),
              eq(aiConversations.contextId, input.contextId),
              isNull(aiConversations.archivedAt),
            ),
          )
          .orderBy(aiConversations.createdAt, aiConversations.id);
        return { messages: rows };
      }),

    // ============================================================
    // Proc 3 — getArchivedHistory (§5.8)
    // ============================================================
    getArchivedHistory: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_ARCHIVED_HISTORY_INPUT_SCHEMA)
      .query(async ({ ctx, input }) => {
        await resolveScopeOrThrow(ctx.db, ctx.user, input.contextId);
        await assertLiderScopeOrThrow(ctx.db, ctx.user, input.dashboardLevel, input.contextId);
        const userId = deriveUserIdFromCtx(ctx.user);
        const userType = deriveUserTypeFromCtx(ctx.user);
        const offset = (input.page - 1) * input.pageSize;
        const rows = await ctx.db
          .select()
          .from(aiConversations)
          .where(
            and(
              eq(aiConversations.userId, userId),
              eq(aiConversations.userType, userType),
              eq(aiConversations.dashboardLevel, input.dashboardLevel),
              eq(aiConversations.contextId, input.contextId),
              isNotNull(aiConversations.archivedAt),
            ),
          )
          .orderBy(desc(aiConversations.createdAt), desc(aiConversations.id))
          .limit(input.pageSize)
          .offset(offset);
        return {
          messages: rows,
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
  });
}
