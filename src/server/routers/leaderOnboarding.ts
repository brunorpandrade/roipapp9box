// ROIP APP 9BOX — sub-router `leaderOnboarding` (ME-062, DOC 06 §21).
//
// Vertical residual operacional do Bloco B6 sub-d: operacao canonica
// do kanban de onboarding de lideres. Consumida pelas telas do RH
// (`/onboarding-lideres`) e do Super Admin (`/super-admin/empresa/[id]/onboarding-lideres`).
//
// Superficies canonicas do §21:
//   - `list({ companyId })` — lista o kanban da empresa (colaboradores
//     ativos com `isLider=true`, agrupados por `onboardingEstagio`).
//     §21.4 bloqueio absoluto: remove silenciosamente a linha do proprio
//     titular quando o caller e o proprio lider (evita expor existencia
//     do proprio card).
//   - `getDetail({ employeeId })` — detalhe canonico de um card
//     (estagio atual + historico de mudancas + anotacoes). §21.4:
//     403 canonico quando `session.employeeId === employeeId`.
//   - `updateStage({ employeeId, novoEstagio, texto })` — transacao
//     atomica canonica do §21.2 (INSERT em `leaderOnboardingNotes`
//     SEMPRE + condicional INSERT em `leaderOnboardingStageLog` +
//     UPDATE em `employees.onboardingEstagio` quando estagio muda).
//     Anotacao obrigatoria 100-500 caracteres (padrao transversal
//     DOC 03 §2).
//   - `getSummaryCounts({ companyId })` — contadores canonicos da
//     miniatura (§21.3). SUM(estagio) por status ativo/isLider=true.
//
// Autorizacao canonica: Bruno + RH + RH-Lider (padrao consolidado
// com `leaderOnboardingNotes` e `leaderOnboardingStageLog` — §21.2
// aceita 'super_admin' e 'rh' no enum `autorTipo`; 'rh_lider' segue
// como RH para efeito de autoria).
//
// Facade DI (S244) preservada canonicamente: `deps.now` (padrao
// consolidado ME-045+, injetavel em testes deterministicos).
//
// **Sem gatilho de alerta canonico** (§21.2 nota — mudanca de estagio
// de onboarding e evento operacional interno, nao dispara alerta no
// pipeline anti-ruido).
//
// **Sem integracao com Change log** (§21 — operacao interna do RH,
// sem historico agregado da empresa).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `createLeaderOnboardingRouter` → consumido por `routers/index.ts`.
//   - `LeaderOnboardingRouter` type → consumido por `routers/index.ts`
//     via `ReturnType`.
//   - Constantes canonicas de mensagem exportadas para reuso em testes.

import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ONBOARDING_ESTAGIO_VALUES, type OnboardingEstagio } from '../../db/schema/enums';
import {
  employeeLeaderHistory,
  employees,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
} from '../../db/schema';
import { TRPCError } from '@trpc/server';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Mensagens canonicas literais (DOC 06 §21 + DOC 03 §2)
// ============================================================

/** §21.4 bloqueio absoluto — 403 canonico ao proprio titular. */
export const MSG_LEADER_ONB_ACESSO_PROPRIO =
  'Você não tem permissão para acessar esta informação.' as const;

/** §14 mismatch de empresa (padrao transversal). */
export const MSG_LEADER_ONB_COMPANY_MISMATCH = 'Empresa não pertence ao seu escopo.' as const;

/** §21.2 — colaborador nao encontrado. */
export const MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO = 'Colaborador não encontrado.' as const;

/** §21.2 — colaborador nao e lider (`isLider=false`) — nao ha card. */
export const MSG_LEADER_ONB_NAO_E_LIDER =
  'Este colaborador não é líder e não possui card no kanban de onboarding.' as const;

/** §21.2 — colaborador inativo — nao ha card. */
export const MSG_LEADER_ONB_INATIVO =
  'Este colaborador está inativo e não possui card no kanban de onboarding.' as const;

/** §2.3 — justificativa canonica 100-500 (menor limite). */
export const MSG_ANOTACAO_MIN_100 = 'A anotação deve ter no mínimo 100 caracteres.' as const;

/** §2.3 — justificativa canonica 100-500 (maior limite). */
export const MSG_ANOTACAO_MAX_500 = 'A anotação deve ter no máximo 500 caracteres.' as const;

// ============================================================
// Constantes canonicas
// ============================================================

/** §2.3 — padrao transversal 100-500 (DOC 03). */
export const ANOTACAO_MIN_CHARS = 100 as const;
export const ANOTACAO_MAX_CHARS = 500 as const;

// ============================================================
// Schemas Zod dos inputs canonicos
// ============================================================

export const LIST_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
});

export const GET_DETAIL_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
});

export const UPDATE_STAGE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
  novoEstagio: z.enum(ONBOARDING_ESTAGIO_VALUES),
  texto: z
    .string()
    .min(ANOTACAO_MIN_CHARS, { message: MSG_ANOTACAO_MIN_100 })
    .max(ANOTACAO_MAX_CHARS, { message: MSG_ANOTACAO_MAX_500 }),
});

export const GET_SUMMARY_COUNTS_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
});

// ============================================================
// Tipos canonicos de retorno
// ============================================================

export interface ListCardEntry {
  employeeId: number;
  nome: string;
  cargo: string;
  departamento: string;
  onboardingEstagio: OnboardingEstagio;
  // ME-080c — 2 campos aditivos canônicos §14.27 (rota
  // `/onboarding-lideres`): número de liderados diretos ativos +
  // instante de entrada no estágio atual (para badge tempo permanência
  // e ordenação canônica descendente). `entradaEstagioAtual` é o
  // `MAX(createdAt)` do `leaderOnboardingStageLog` filtrado por
  // `estagioNovo = onboardingEstagio` do próprio líder; quando o líder
  // nunca teve mudança registrada (kanban recém-criado), fallback
  // canônico = `employees.createdAt`.
  countLiderados: number;
  entradaEstagioAtual: Date;
}

export interface GetDetailResult {
  employeeId: number;
  nome: string;
  departamento: string;
  onboardingEstagio: OnboardingEstagio;
  stageHistory: Array<{
    id: number;
    estagioAnterior: OnboardingEstagio | null;
    estagioNovo: OnboardingEstagio;
    autorTipo: 'super_admin' | 'rh';
    autorId: number;
    createdAt: Date;
  }>;
  notes: Array<{
    id: number;
    autorTipo: 'super_admin' | 'rh';
    autorId: number;
    texto: string;
    createdAt: Date;
  }>;
}

export interface UpdateStageResult {
  employeeId: number;
  noteId: number;
  stageLogId: number | null;
  estagioAnterior: OnboardingEstagio | null;
  estagioNovo: OnboardingEstagio;
}

export interface SummaryCounts {
  treinar: number;
  em_treinamento: number;
  treinado: number;
  reciclagem: number;
}

// ============================================================
// Helpers internos canonicos (RV-13)
// ============================================================

/**
 * §2.4 — guard cruzado: super_admin atravessa; demais roles restritos ao
 * proprio `companyId` do JWT. Lanca FORBIDDEN canonico ao mismatch.
 */
export function assertCompanyScopeOnb(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_LEADER_ONB_COMPANY_MISMATCH,
    });
  }
}

/**
 * §21.2 — `autorTipo` canonico da sessao. 'rh' e 'rh_lider' consolidam
 * como `'rh'` (o enum canonico de autoria e binario: super_admin | rh).
 * `autorId` e o `superAdminId` (super_admin) ou `userId` (rh/rh_lider).
 */
export function resolveAutorOnb(user: AuthenticatedUser): {
  autorTipo: 'super_admin' | 'rh';
  autorId: number;
} {
  if (user.role === 'super_admin') {
    return { autorTipo: 'super_admin', autorId: user.superAdminId };
  }
  return { autorTipo: 'rh', autorId: user.userId };
}

/**
 * §21.4 bloqueio absoluto — retorna `true` quando o caller autenticado
 * e o proprio titular (`session.userId === employeeId` em role
 * platform).
 */
function isSelfEmployee(user: AuthenticatedUser, employeeId: number): boolean {
  if (user.role === 'super_admin') return false;
  return user.userId === employeeId;
}

// ============================================================
// Dependencias injetaveis (Facade DI — S244 padrao consolidado)
// ============================================================

export interface LeaderOnboardingRouterDeps {
  now?: () => Date;
}

const DEFAULT_LEADER_ONBOARDING_ROUTER_DEPS: Required<LeaderOnboardingRouterDeps> = {
  now: () => new Date(),
};

// ============================================================
// Factory canonica
// ============================================================

/**
 * Factory canonica do sub-router `leaderOnboarding`. Padrao S244:
 * `deps.now` injetavel via closure em testes deterministicos; producao
 * usa `new Date()` real.
 */
export function createLeaderOnboardingRouter(deps: LeaderOnboardingRouterDeps = {}) {
  const effectiveDeps: Required<LeaderOnboardingRouterDeps> = {
    ...DEFAULT_LEADER_ONBOARDING_ROUTER_DEPS,
    ...deps,
  };

  return router({
    // --------------------------------------------------------
    // leaderOnboarding.list — RH + Bruno + RH-Lider
    // --------------------------------------------------------
    list: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(LIST_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<ListCardEntry[]> => {
        assertCompanyScopeOnb(ctx.user, input.companyId);

        // ME-080c — SELECT estendido para §14.27: cargo + createdAt
        // (fallback de `entradaEstagioAtual`). Query base restrita a
        // lideres ativos da empresa; ordenacao final DESC por dias no
        // estagio (mais antigo no topo) e resolvida em pos-processamento
        // por ser calculada.
        const rows = await ctx.db
          .select({
            employeeId: employees.id,
            nome: employees.name,
            cargo: employees.cargo,
            departamento: employees.departamento,
            onboardingEstagio: employees.onboardingEstagio,
            createdAt: employees.createdAt,
          })
          .from(employees)
          .where(
            and(
              eq(employees.companyId, input.companyId),
              eq(employees.isLider, true),
              eq(employees.status, 'ativo'),
            ),
          )
          .orderBy(asc(employees.name));

        // §21.4 bloqueio absoluto: caso improvavel de um lider (com role
        // 'rh_lider') chamar sua propria empresa via este router, remove
        // silenciosamente seu proprio card do resultado. Como o listar
        // exige role 'super_admin' | 'rh' | 'rh_lider', o cenario canonico
        // e o RH-Lider consultando o kanban sem se ver.
        const filtered = rows.filter((r) => {
          if (r.employeeId === null || r.employeeId === undefined) return false;
          if (r.onboardingEstagio === null) return false;
          return !isSelfEmployee(ctx.user, r.employeeId);
        });

        if (filtered.length === 0) {
          return [];
        }

        const empIds = filtered.map((r) => r.employeeId);

        // ME-080c — count canonico de liderados diretos ATIVOS por
        // lider `employee` (§14.6 padrao consolidado
        // leadershipTransfer). Usa employeeLeaderHistory com dataFim
        // IS NULL + employees.status='ativo' + companyId escopado.
        const liderCountRows = await ctx.db
          .select({
            liderId: employeeLeaderHistory.liderId,
            n: count(),
          })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employeeLeaderHistory.employeeId, employees.id))
          .where(
            and(
              inArray(employeeLeaderHistory.liderId, empIds),
              isNull(employeeLeaderHistory.dataFim),
              eq(employees.status, 'ativo'),
              eq(employees.companyId, input.companyId),
            ),
          )
          .groupBy(employeeLeaderHistory.liderId);
        const countByLider = new Map<number, number>();
        for (const r of liderCountRows) {
          if (r.liderId !== null) {
            countByLider.set(r.liderId, Number(r.n));
          }
        }

        // ME-080c — entrada canonica no estagio atual: MAX(createdAt)
        // do stageLog onde estagioNovo == estagio corrente do lider.
        // Fallback (nunca teve stageLog OU estagio atual nunca foi
        // inserido no log) = employees.createdAt (assume-se que o
        // lider entrou em 'treinar' na criacao — §21.1 ciclo de vida).
        const stageLogRows = await ctx.db
          .select({
            employeeId: leaderOnboardingStageLog.employeeId,
            estagioNovo: leaderOnboardingStageLog.estagioNovo,
            createdAt: leaderOnboardingStageLog.createdAt,
          })
          .from(leaderOnboardingStageLog)
          .where(inArray(leaderOnboardingStageLog.employeeId, empIds))
          .orderBy(desc(leaderOnboardingStageLog.createdAt));
        // Map: employeeId -> entradaEstagioAtual (mais recente com
        // estagioNovo == estagio corrente). Ordenacao desc do SELECT
        // garante que o primeiro match encontrado eh o mais recente.
        const estagioByEmp = new Map<number, OnboardingEstagio>();
        for (const r of filtered) {
          estagioByEmp.set(r.employeeId, r.onboardingEstagio as OnboardingEstagio);
        }
        const entradaByEmp = new Map<number, Date>();
        for (const row of stageLogRows) {
          const estagioAtual = estagioByEmp.get(row.employeeId);
          if (estagioAtual === undefined) {
            continue;
          }
          if (row.estagioNovo !== estagioAtual) {
            continue;
          }
          if (entradaByEmp.has(row.employeeId)) {
            continue;
          }
          entradaByEmp.set(row.employeeId, row.createdAt ?? new Date(0));
        }

        const nowInstant = effectiveDeps.now();
        const enriched = filtered.map((r) => {
          const entrada = entradaByEmp.get(r.employeeId) ?? r.createdAt ?? new Date(0);
          const dias = Math.floor(
            (nowInstant.getTime() - entrada.getTime()) / (24 * 60 * 60 * 1000),
          );
          return {
            employeeId: r.employeeId,
            nome: r.nome,
            cargo: r.cargo,
            departamento: r.departamento,
            onboardingEstagio: r.onboardingEstagio as OnboardingEstagio,
            countLiderados: countByLider.get(r.employeeId) ?? 0,
            entradaEstagioAtual: entrada,
            _dias: dias,
          };
        });

        // §14.27 ordenacao canonica: dias no estagio DESC (mais antigo
        // no topo). Empate → asc por nome (determinismo).
        enriched.sort((a, b) => {
          if (b._dias !== a._dias) {
            return b._dias - a._dias;
          }
          return a.nome.localeCompare(b.nome, 'pt-BR');
        });

        return enriched.map((r) => ({
          employeeId: r.employeeId,
          nome: r.nome,
          cargo: r.cargo,
          departamento: r.departamento,
          onboardingEstagio: r.onboardingEstagio,
          countLiderados: r.countLiderados,
          entradaEstagioAtual: r.entradaEstagioAtual,
        }));
      }),

    // --------------------------------------------------------
    // leaderOnboarding.getDetail — RH + Bruno + RH-Lider
    // --------------------------------------------------------
    getDetail: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_DETAIL_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetDetailResult> => {
        // §21.4 bloqueio absoluto — 403 canonico ao proprio titular.
        if (isSelfEmployee(ctx.user, input.employeeId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: MSG_LEADER_ONB_ACESSO_PROPRIO,
          });
        }

        const empRows = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            nome: employees.name,
            departamento: employees.departamento,
            onboardingEstagio: employees.onboardingEstagio,
            isLider: employees.isLider,
            status: employees.status,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const emp = empRows[0];
        if (!emp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO,
          });
        }
        assertCompanyScopeOnb(ctx.user, emp.companyId);
        if (emp.isLider !== true) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: MSG_LEADER_ONB_NAO_E_LIDER,
          });
        }
        if (emp.status === 'inativo') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: MSG_LEADER_ONB_INATIVO,
          });
        }

        const stageHistoryRows = await ctx.db
          .select()
          .from(leaderOnboardingStageLog)
          .where(eq(leaderOnboardingStageLog.employeeId, input.employeeId))
          .orderBy(asc(leaderOnboardingStageLog.createdAt), asc(leaderOnboardingStageLog.id));

        const notesRows = await ctx.db
          .select()
          .from(leaderOnboardingNotes)
          .where(eq(leaderOnboardingNotes.employeeId, input.employeeId))
          .orderBy(desc(leaderOnboardingNotes.createdAt), desc(leaderOnboardingNotes.id));

        return {
          employeeId: emp.id,
          nome: emp.nome,
          departamento: emp.departamento,
          onboardingEstagio: (emp.onboardingEstagio ?? 'treinar') as OnboardingEstagio,
          stageHistory: stageHistoryRows.map((r) => ({
            id: r.id,
            estagioAnterior: (r.estagioAnterior ?? null) as OnboardingEstagio | null,
            estagioNovo: r.estagioNovo as OnboardingEstagio,
            autorTipo: r.autorTipo,
            autorId: r.autorId,
            createdAt: r.createdAt ?? new Date(0),
          })),
          notes: notesRows.map((r) => ({
            id: r.id,
            autorTipo: r.autorTipo,
            autorId: r.autorId,
            texto: r.texto,
            createdAt: r.createdAt ?? new Date(0),
          })),
        };
      }),

    // --------------------------------------------------------
    // leaderOnboarding.updateStage — RH + Bruno + RH-Lider
    // --------------------------------------------------------
    updateStage: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(UPDATE_STAGE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UpdateStageResult> => {
        // §21.4 bloqueio absoluto — 403 canonico ao proprio titular.
        if (isSelfEmployee(ctx.user, input.employeeId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: MSG_LEADER_ONB_ACESSO_PROPRIO,
          });
        }

        const empRows = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            onboardingEstagio: employees.onboardingEstagio,
            isLider: employees.isLider,
            status: employees.status,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const emp = empRows[0];
        if (!emp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO,
          });
        }
        assertCompanyScopeOnb(ctx.user, emp.companyId);
        if (emp.isLider !== true) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: MSG_LEADER_ONB_NAO_E_LIDER,
          });
        }
        if (emp.status === 'inativo') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: MSG_LEADER_ONB_INATIVO,
          });
        }

        const autor = resolveAutorOnb(ctx.user);
        const estagioAtual = (emp.onboardingEstagio ?? 'treinar') as OnboardingEstagio;
        const nowInstant = effectiveDeps.now();

        return await ctx.db.transaction(async (tx) => {
          // Sub-passo 2 §21.2: INSERT canonico de anotacao (SEMPRE).
          const [noteInserted] = await tx
            .insert(leaderOnboardingNotes)
            .values({
              companyId: emp.companyId,
              employeeId: emp.id,
              autorTipo: autor.autorTipo,
              autorId: autor.autorId,
              texto: input.texto,
              createdAt: nowInstant,
            })
            .$returningId();
          if (!noteInserted) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'INSERT em leaderOnboardingNotes nao retornou id.',
            });
          }
          const noteId = noteInserted.id;

          // Sub-passo 3 §21.2: se estagio muda, INSERT em stageLog +
          // UPDATE em employees.onboardingEstagio (mesma transacao).
          let stageLogId: number | null = null;
          if (estagioAtual !== input.novoEstagio) {
            const [stageInserted] = await tx
              .insert(leaderOnboardingStageLog)
              .values({
                companyId: emp.companyId,
                employeeId: emp.id,
                estagioAnterior: estagioAtual,
                estagioNovo: input.novoEstagio,
                autorTipo: autor.autorTipo,
                autorId: autor.autorId,
                createdAt: nowInstant,
              })
              .$returningId();
            if (!stageInserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em leaderOnboardingStageLog nao retornou id.',
              });
            }
            stageLogId = stageInserted.id;

            await tx
              .update(employees)
              .set({ onboardingEstagio: input.novoEstagio })
              .where(eq(employees.id, emp.id));
          }

          return {
            employeeId: emp.id,
            noteId,
            stageLogId,
            estagioAnterior: estagioAtual === input.novoEstagio ? null : estagioAtual,
            estagioNovo: input.novoEstagio,
          };
        });
      }),

    // --------------------------------------------------------
    // leaderOnboarding.getSummaryCounts — RH + Bruno + RH-Lider
    // --------------------------------------------------------
    getSummaryCounts: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_SUMMARY_COUNTS_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<SummaryCounts> => {
        assertCompanyScopeOnb(ctx.user, input.companyId);

        // §21.3 SQL canonico: SUM(estagio) por status ativo/isLider=true.
        // Emulado via SELECT tipado (Drizzle) + agregacao no processo —
        // volume canonico e baixo (numero de lideres por empresa).
        const rows = await ctx.db
          .select({
            onboardingEstagio: employees.onboardingEstagio,
          })
          .from(employees)
          .where(
            and(
              eq(employees.companyId, input.companyId),
              eq(employees.isLider, true),
              eq(employees.status, 'ativo'),
            ),
          );

        const counts: SummaryCounts = {
          treinar: 0,
          em_treinamento: 0,
          treinado: 0,
          reciclagem: 0,
        };
        for (const r of rows) {
          if (r.onboardingEstagio === null) continue;
          const key = r.onboardingEstagio as OnboardingEstagio;
          counts[key] += 1;
        }
        return counts;
      }),
  });
}

/** Tipo canonico do sub-router (consumido por `routers/index.ts`). */
export type LeaderOnboardingRouter = ReturnType<typeof createLeaderOnboardingRouter>;
