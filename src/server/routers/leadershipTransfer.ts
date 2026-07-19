// ROIP APP 9BOX — sub-router `leadershipTransfer` (ME-045, DOC 03 §14).
//
// Padrao canonico UNICO de transferencia de liderados M2 v2 (§14). Cobre
// as 4 procs canonicas do §14.12:
//
//   - `leadershipTransfer.canInactivate({ employeeId })` — Bruno + RH
//     (§14.2). Retorna se ha ao menos 1 candidato elegivel na empresa
//     para receber liderados; se `false`, retorna mensagem canonica de
//     bloqueio previo §14.11 primeira linha.
//   - `leadershipTransfer.getCandidates({ employeeId, companyId,
//     tentativaLiderados })` — Bruno + RH (§14.3). Retorna os 5 grupos
//     canonicos ordenados alfabeticamente com contador "X liderados"
//     por candidato (§14.6). Cabecalhos visuais e badges sao DOC 05 —
//     esta camada retorna apenas as listas nomeadas.
//   - `leadershipTransfer.checkEmailForPromotion({ candidatoId })` —
//     Bruno + RH (§14.5). Retorna se o candidato Grupo 4 possui e-mail
//     cadastrado (pre-condicao canonica de promocao a lider).
//   - `leadershipTransfer.execute({ liderOriginalId, mapeamento,
//     candidatosGrupo4, reason, motivoSaida })` — Bruno + RH.
//     Transacao atomica canonica §14.9 em 7 passos: canInactivate;
//     gerar transferBatchId (UUID v4); validar loop condicional §14.4;
//     validar e-mail dos candidatos Grupo 4 §14.5; fechar historicos +
//     inserir novos vinculos §14.9-4; UPDATE isLider=true dos Grupo 4
//     §14.9-5; UPDATE status='inativo' + INSERT terminationEvents §12.6
//     (E01 — semantica de fusao aprovada, motivoSaida capturado no modal
//     canonico `delta_modal_inativacao_motivo_saida_v1.html` ANTES do
//     M2 v2 abrir); COMMIT.
//
// Encapsulamento canonico §14.8 (S146): a transferencia NAO gera
// `notifications` nem `alerts`; NAO ha hook DI de notificacao (nem
// no-op). `employeeLeaderHistory` e a UNICA superficie de auditoria.
//
// Convencoes canonicas herdadas de ME-043:
//   - Guards de perfil por `roleProcedure(['super_admin','rh','rh_lider'])`
//     mapeamento canonico de "Bruno e RH" da §14.12.
//   - Zod integral do input. Mensagens canonicas literais §14.11
//     exportadas para asserts verbatim (S145).
//   - Transacao 100% Drizzle tipado (RV-12, L54). Sem SQL cru.
//   - DI factory de `now`/`generateBatchId` (S144, padrao S100/S084)
//     para testes deterministicos de dataInicio, dataFim e transferBatchId.
//   - Uma statement por linha (RV-14).
//   - Sem code dead (RV-13) — todo export tem chamador nesta ME.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/leadershipTransfer-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, asc, count, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  MOTIVO_TERMINATION_VALUES,
  cLevelMembers,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
} from '../../db/schema';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** §14.7 — tamanho minimo canonico da justificativa 100-500. */
export const REASON_MIN_LENGTH = 100 as const;

/** §14.7 — tamanho maximo canonico da justificativa 100-500. */
export const REASON_MAX_LENGTH = 500 as const;

// ============================================================
// Mensagens canonicas literais §14.11 (S145)
// ============================================================

/**
 * §14.11 primeira linha — bloqueio previo canInactivate=false.
 * Placeholder `{nome}` substituido dinamicamente pelo router com o nome
 * do lider sendo inativado. A constante mantem o placeholder para os
 * testes asseriarem a estrutura literal.
 */
export const MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO =
  'Nao e possivel inativar {nome}. Nao ha nenhum outro C-level ou colaborador com ' +
  'isLider=true ativo na empresa. Cadastre outro C-level ou promova um colaborador a ' +
  'Lider antes de prosseguir.';

/** §14.11 segunda linha — loop condicional violado §14.4. */
export const MSG_LOOP_CONDICIONAL_VIOLADO =
  'Este colaborador precisa ter novo lider atribuido antes de poder liderar outros.';

/** §14.11 terceira linha — e-mail vazio ao promover Grupo 4 §14.5. */
export const MSG_EMAIL_VAZIO_GRUPO_4 =
  'E-mail obrigatorio para ativar acesso como Lider. Cadastre o e-mail em C3e antes.';

/** §14.11 quarta linha — justificativa abaixo do minimo 100. */
export const MSG_JUSTIFICATIVA_MIN_100 = 'A justificativa deve ter no minimo 100 caracteres.';

/** §14.11 quinta linha — justificativa acima do maximo 500. */
export const MSG_JUSTIFICATIVA_MAX_500 = 'A justificativa deve ter no maximo 500 caracteres.';

/** §2.4 — guard cruzado de escopo empresa quebrou. */
export const MSG_COMPANY_MISMATCH_LT = 'Colaborador nao pertence a sua empresa.' as const;

/** Alvo `employeeId` do canInactivate/execute inexistente. */
export const MSG_EMPLOYEE_NAO_ENCONTRADO_LT = 'Colaborador nao encontrado.' as const;

/** Alvo `candidatoId` do checkEmailForPromotion inexistente. */
export const MSG_CANDIDATO_NAO_ENCONTRADO_LT = 'Candidato nao encontrado.' as const;

/** Novo lider indicado no mapeamento nao existe / nao esta ativo / cross-company. */
export const MSG_NOVO_LIDER_INVALIDO_LT =
  'Novo lider indicado nao existe, nao pertence a esta empresa ou nao esta ativo.';

/** Reason ausente no schema Zod — mesma familia da MIN. */
export function buildReasonMinMessage(): string {
  return MSG_JUSTIFICATIVA_MIN_100;
}

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** Input canonico de `canInactivate`. */
export const CAN_INACTIVATE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
});

/** Input canonico de `getCandidates`. */
export const GET_CANDIDATES_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
  companyId: z.number().int().positive(),
  tentativaLiderados: z
    .array(
      z.object({
        lideradoId: z.number().int().positive(),
      }),
    )
    .max(500),
});

/** Input canonico de `checkEmailForPromotion`. */
export const CHECK_EMAIL_INPUT_SCHEMA = z.object({
  candidatoId: z.number().int().positive(),
});

/** Linha do mapeamento canonico §14.12 quarta linha. */
export const MAPEAMENTO_ITEM_SCHEMA = z.object({
  lideradoId: z.number().int().positive(),
  novoLiderId: z.number().int().positive(),
  novoLiderTipo: z.enum(['employee', 'cLevel']),
});

/** Item de candidato Grupo 4 §14.12 quarta linha. */
export const CANDIDATO_GRUPO_4_ITEM_SCHEMA = z.object({
  candidatoId: z.number().int().positive(),
});

/**
 * Input canonico de `execute` — inclui `motivoSaida` (E01 aprovado). O
 * modal C3e canonico captura antes do M2 v2 abrir; o Passo 6 do §14.9
 * estende com INSERT em `employeeTerminationEvents` §12.6.
 */
export const EXECUTE_INPUT_SCHEMA = z.object({
  liderOriginalId: z.number().int().positive(),
  mapeamento: z.array(MAPEAMENTO_ITEM_SCHEMA).min(1).max(500),
  candidatosGrupo4: z.array(CANDIDATO_GRUPO_4_ITEM_SCHEMA).max(500),
  reason: z
    .string()
    .min(REASON_MIN_LENGTH, { message: MSG_JUSTIFICATIVA_MIN_100 })
    .max(REASON_MAX_LENGTH, { message: MSG_JUSTIFICATIVA_MAX_500 }),
  motivoSaida: z.enum(MOTIVO_TERMINATION_VALUES),
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/** Retorno canonico de `canInactivate`. */
export interface CanInactivateResult {
  canInactivate: boolean;
  reason: string;
}

/** Item canonico de candidato dentro de um grupo. */
export interface CandidateItem {
  id: number;
  tipo: 'employee' | 'cLevel';
  name: string;
  cargo: string;
  departamento: string;
  liderados: number;
}

/**
 * Retorno canonico de `getCandidates` — 5 grupos canonicos §14.3. Ordem
 * dos grupos e fixa. Ordenacao dentro de cada grupo e alfabetica por
 * `name`.
 */
export interface GetCandidatesResult {
  grupo1_cLevelsAtivos: CandidateItem[];
  grupo2_mesmoDepartamento: CandidateItem[];
  grupo3_demaisLideres: CandidateItem[];
  grupo4_colaboradoresNaoLideres: CandidateItem[];
  grupo5_liderasDestaTransferencia: CandidateItem[];
  departamentoDoLiderInativado: string;
}

/** Retorno canonico de `checkEmailForPromotion`. */
export interface CheckEmailResult {
  hasEmail: boolean;
  email: string | undefined;
}

/** Retorno canonico de `execute` §14.9. */
export interface ExecuteResult {
  transferBatchId: string;
  sucesso: true;
  terminationEventId: number;
  leaderHistoryClosedIds: number[];
  leaderHistoryInsertedIds: number[];
  grupo4PromovidosIds: number[];
}

// ============================================================
// Dependencias injetaveis (DI factory — S144)
// ============================================================

/**
 * DI canonica: relogio `now` (test-determinismo de dataFim/dataInicio/
 * dataInativacao) e gerador `generateBatchId` de UUID v4 (test-
 * determinismo de transferBatchId). Padrao S100/S084 estendido.
 */
export interface LeadershipTransferRouterDeps {
  now?: () => Date;
  generateBatchId?: () => string;
}

/** DI default: relogio real, UUID v4 real. */
export const DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS: Required<LeadershipTransferRouterDeps> = {
  now: () => new Date(),
  generateBatchId: () => crypto.randomUUID(),
};

// ============================================================
// Helpers internos (RV-13 — consumidos pelas procs)
// ============================================================

/**
 * §2.4 — guard cruzado de escopo empresa. Super Admin atravessa; demais
 * roles restritos ao proprio `companyId` do JWT.
 */
export function assertCompanyScopeLT(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_LT });
  }
}

/**
 * §13.1 padrao B — polimorfico do INSERT em `employeeTerminationEvents`.
 * Bruno → `superAdmin` + `superAdminId`; RH/RH-Lider → `employee` +
 * `userId`. Enum `actorTipo` canonico bate `['employee','superAdmin']`.
 */
export function resolveActorForTerminationLT(user: AuthenticatedUser): {
  actorTipo: 'employee' | 'superAdmin';
  actorId: number;
} {
  if (user.role === 'super_admin') {
    return { actorTipo: 'superAdmin', actorId: user.superAdminId };
  }
  return { actorTipo: 'employee', actorId: user.userId };
}

/**
 * §14.2 — contagem de C-levels ativos da empresa. Consumida por
 * `canInactivate` para determinar elegibilidade.
 */
async function countActiveCLevels(db: RoipDatabase, companyId: number): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
  return Number(rows[0]?.n ?? 0);
}

/**
 * §14.2 — contagem de colaboradores comuns com `isLider=true` ativos da
 * empresa, EXCLUINDO o proprio `employeeId` (que esta sendo inativado).
 */
async function countActiveLideresExcept(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
        ne(employees.id, employeeId),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * §14.6 — contagem de liderados diretos ATIVOS por lider `employee`.
 * Retorna `Map<liderId, N>` para preencher o contador `X liderados` de
 * cada candidato do Grupo 2/3/5.
 */
async function countLideradosByEmployeeLeader(
  db: RoipDatabase,
  companyId: number,
  liderIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (liderIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      liderId: employeeLeaderHistory.liderId,
      n: count(),
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employeeLeaderHistory.employeeId, employees.id))
    .where(
      and(
        inArray(employeeLeaderHistory.liderId, liderIds),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.status, 'ativo'),
        eq(employees.companyId, companyId),
      ),
    )
    .groupBy(employeeLeaderHistory.liderId);
  for (const r of rows) {
    if (r.liderId !== null) {
      map.set(r.liderId, Number(r.n));
    }
  }
  return map;
}

/**
 * §14.6 — contagem de liderados diretos ATIVOS por lider `cLevel`.
 * Retorna `Map<clevelId, N>` para o Grupo 1.
 */
async function countLideradosByCLevelLeader(
  db: RoipDatabase,
  companyId: number,
  clevelIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (clevelIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      clevelId: employeeLeaderHistory.clevelId,
      n: count(),
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employeeLeaderHistory.employeeId, employees.id))
    .where(
      and(
        inArray(employeeLeaderHistory.clevelId, clevelIds),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.status, 'ativo'),
        eq(employees.companyId, companyId),
      ),
    )
    .groupBy(employeeLeaderHistory.clevelId);
  for (const r of rows) {
    if (r.clevelId !== null) {
      map.set(r.clevelId, Number(r.n));
    }
  }
  return map;
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Factory canonica do sub-router `leadershipTransfer`. Aceita DI opcional
 * de `now` e `generateBatchId` (defaults reais). Padrao S144.
 */
export function createLeadershipTransferRouter(deps: LeadershipTransferRouterDeps = {}) {
  const now = deps.now ?? DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS.now;
  const generateBatchId =
    deps.generateBatchId ?? DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS.generateBatchId;

  return router({
    // --------------------------------------------------------
    // leadershipTransfer.canInactivate — Bruno + RH
    // --------------------------------------------------------
    canInactivate: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(CAN_INACTIVATE_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<CanInactivateResult> => {
        const target = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            name: employees.name,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO_LT });
        }
        assertCompanyScopeLT(ctx.user, row.companyId);

        const nCLevels = await countActiveCLevels(ctx.db, row.companyId);
        const nLideres = await countActiveLideresExcept(ctx.db, row.companyId, input.employeeId);
        if (nCLevels + nLideres > 0) {
          return { canInactivate: true, reason: 'Ha candidatos elegiveis na empresa.' };
        }
        const literal = MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO.replace('{nome}', row.name);
        return { canInactivate: false, reason: literal };
      }),

    // --------------------------------------------------------
    // leadershipTransfer.getCandidates — Bruno + RH
    // --------------------------------------------------------
    getCandidates: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_CANDIDATES_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetCandidatesResult> => {
        assertCompanyScopeLT(ctx.user, input.companyId);
        const targetRows = await ctx.db
          .select({
            id: employees.id,
            departamento: employees.departamento,
            companyId: employees.companyId,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const target = targetRows[0];
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO_LT });
        }
        if (target.companyId !== input.companyId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_COMPANY_MISMATCH_LT });
        }

        const departamento = target.departamento;

        // Grupo 1: C-levels ativos da empresa.
        const clevelRows = await ctx.db
          .select({
            id: cLevelMembers.id,
            name: cLevelMembers.name,
            cargo: cLevelMembers.cargo,
            departamento: cLevelMembers.departamento,
          })
          .from(cLevelMembers)
          .where(
            and(eq(cLevelMembers.companyId, input.companyId), eq(cLevelMembers.status, 'ativo')),
          )
          .orderBy(asc(cLevelMembers.name));

        // Grupo 2: employees ativos, isLider=true, mesmo departamento, exceto o inativado.
        const grupo2Rows = await ctx.db
          .select({
            id: employees.id,
            name: employees.name,
            cargo: employees.descricaoCBO,
            departamento: employees.departamento,
          })
          .from(employees)
          .where(
            and(
              eq(employees.companyId, input.companyId),
              eq(employees.status, 'ativo'),
              eq(employees.isLider, true),
              eq(employees.departamento, departamento),
              ne(employees.id, input.employeeId),
            ),
          )
          .orderBy(asc(employees.name));

        // Grupo 3: employees ativos, isLider=true, outros departamentos.
        const grupo3Rows = await ctx.db
          .select({
            id: employees.id,
            name: employees.name,
            cargo: employees.descricaoCBO,
            departamento: employees.departamento,
          })
          .from(employees)
          .where(
            and(
              eq(employees.companyId, input.companyId),
              eq(employees.status, 'ativo'),
              eq(employees.isLider, true),
              ne(employees.departamento, departamento),
              ne(employees.id, input.employeeId),
            ),
          )
          .orderBy(asc(employees.name));

        // Grupo 4: employees ativos, isLider=false. §14.5 requer email para promocao.
        const tentativaIds = input.tentativaLiderados.map((t) => t.lideradoId);
        const grupo4Filters = [
          eq(employees.companyId, input.companyId),
          eq(employees.status, 'ativo'),
          eq(employees.isLider, false),
          ne(employees.id, input.employeeId),
        ];
        if (tentativaIds.length > 0) {
          grupo4Filters.push(notInArray(employees.id, tentativaIds));
        }
        const grupo4Rows = await ctx.db
          .select({
            id: employees.id,
            name: employees.name,
            cargo: employees.descricaoCBO,
            departamento: employees.departamento,
          })
          .from(employees)
          .where(and(...grupo4Filters))
          .orderBy(asc(employees.name));

        // Grupo 5: liderados desta transferencia (tentativa) — loop condicional §14.4.
        let grupo5Items: CandidateItem[] = [];
        if (tentativaIds.length > 0) {
          const grupo5Rows = await ctx.db
            .select({
              id: employees.id,
              name: employees.name,
              cargo: employees.descricaoCBO,
              departamento: employees.departamento,
            })
            .from(employees)
            .where(
              and(
                inArray(employees.id, tentativaIds),
                eq(employees.companyId, input.companyId),
                eq(employees.status, 'ativo'),
                ne(employees.id, input.employeeId),
              ),
            )
            .orderBy(asc(employees.name));
          const employeeCounts5 = await countLideradosByEmployeeLeader(
            ctx.db,
            input.companyId,
            grupo5Rows.map((r) => r.id),
          );
          grupo5Items = grupo5Rows.map((r) => ({
            id: r.id,
            tipo: 'employee' as const,
            name: r.name,
            cargo: r.cargo,
            departamento: r.departamento,
            liderados: employeeCounts5.get(r.id) ?? 0,
          }));
        }

        // Contadores §14.6 para Grupos 1, 2, 3.
        const clevelCounts = await countLideradosByCLevelLeader(
          ctx.db,
          input.companyId,
          clevelRows.map((r) => r.id),
        );
        const employeeIdsG2G3 = grupo2Rows.map((r) => r.id).concat(grupo3Rows.map((r) => r.id));
        const employeeCountsG2G3 = await countLideradosByEmployeeLeader(
          ctx.db,
          input.companyId,
          employeeIdsG2G3,
        );

        const grupo1: CandidateItem[] = clevelRows.map((r) => ({
          id: r.id,
          tipo: 'cLevel' as const,
          name: r.name,
          cargo: r.cargo,
          departamento: r.departamento,
          liderados: clevelCounts.get(r.id) ?? 0,
        }));
        const grupo2: CandidateItem[] = grupo2Rows.map((r) => ({
          id: r.id,
          tipo: 'employee' as const,
          name: r.name,
          cargo: r.cargo,
          departamento: r.departamento,
          liderados: employeeCountsG2G3.get(r.id) ?? 0,
        }));
        const grupo3: CandidateItem[] = grupo3Rows.map((r) => ({
          id: r.id,
          tipo: 'employee' as const,
          name: r.name,
          cargo: r.cargo,
          departamento: r.departamento,
          liderados: employeeCountsG2G3.get(r.id) ?? 0,
        }));
        const grupo4: CandidateItem[] = grupo4Rows.map((r) => ({
          id: r.id,
          tipo: 'employee' as const,
          name: r.name,
          cargo: r.cargo,
          departamento: r.departamento,
          liderados: 0,
        }));

        return {
          grupo1_cLevelsAtivos: grupo1,
          grupo2_mesmoDepartamento: grupo2,
          grupo3_demaisLideres: grupo3,
          grupo4_colaboradoresNaoLideres: grupo4,
          grupo5_liderasDestaTransferencia: grupo5Items,
          departamentoDoLiderInativado: departamento,
        };
      }),

    // --------------------------------------------------------
    // leadershipTransfer.checkEmailForPromotion — Bruno + RH
    // --------------------------------------------------------
    checkEmailForPromotion: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(CHECK_EMAIL_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<CheckEmailResult> => {
        const rows = await ctx.db
          .select({
            id: employees.id,
            email: employees.email,
            companyId: employees.companyId,
          })
          .from(employees)
          .where(eq(employees.id, input.candidatoId))
          .limit(1);
        const row = rows[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CANDIDATO_NAO_ENCONTRADO_LT });
        }
        assertCompanyScopeLT(ctx.user, row.companyId);
        const email = row.email ?? null;
        if (email === null || email.length === 0) {
          return { hasEmail: false, email: undefined };
        }
        return { hasEmail: true, email };
      }),

    // --------------------------------------------------------
    // leadershipTransfer.execute — Bruno + RH (transacao §14.9)
    // --------------------------------------------------------
    execute: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(EXECUTE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<ExecuteResult> => {
        // ------ Alvo do lider original ------
        const liderTarget = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            name: employees.name,
            isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
            status: employees.status,
            departamento: employees.departamento,
            nivelHierarquico: employees.nivelHierarquico,
          })
          .from(employees)
          .where(eq(employees.id, input.liderOriginalId))
          .limit(1);
        const lider = liderTarget[0];
        if (!lider) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO_LT });
        }
        assertCompanyScopeLT(ctx.user, lider.companyId);
        if (lider.status === 'inativo') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Colaborador ja esta inativo.' });
        }

        // ------ Passo 0: canInactivate ------
        const nCLevels = await countActiveCLevels(ctx.db, lider.companyId);
        const nLideres = await countActiveLideresExcept(
          ctx.db,
          lider.companyId,
          input.liderOriginalId,
        );
        if (nCLevels + nLideres === 0) {
          const literal = MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO.replace('{nome}', lider.name);
          throw new TRPCError({ code: 'CONFLICT', message: literal });
        }

        // ------ Passo 1: gerar transferBatchId ------
        const batchId = generateBatchId();

        // ------ Passos 2 e 3: validacoes canonicas de estrutura do mapping ------
        const liderosTransferidosSet = new Set<number>(input.mapeamento.map((m) => m.lideradoId));
        const candidatosGrupo4Set = new Set<number>(
          input.candidatosGrupo4.map((c) => c.candidatoId),
        );

        // Pre-fetch: cargas de dados dos novos lideres employee referidos.
        const novoLiderEmployeeIds = Array.from(
          new Set(
            input.mapeamento
              .filter((m) => m.novoLiderTipo === 'employee')
              .map((m) => m.novoLiderId),
          ),
        );
        const novoLiderCLevelIds = Array.from(
          new Set(
            input.mapeamento.filter((m) => m.novoLiderTipo === 'cLevel').map((m) => m.novoLiderId),
          ),
        );

        const novoLiderEmployeeRows =
          novoLiderEmployeeIds.length > 0
            ? await ctx.db
                .select({
                  id: employees.id,
                  companyId: employees.companyId,
                  status: employees.status,
                  isLider: employees.isLider,
                  email: employees.email,
                })
                .from(employees)
                .where(inArray(employees.id, novoLiderEmployeeIds))
            : [];
        const novoLiderEmployeeMap = new Map(novoLiderEmployeeRows.map((r) => [r.id, r]));

        const novoLiderCLevelRows =
          novoLiderCLevelIds.length > 0
            ? await ctx.db
                .select({
                  id: cLevelMembers.id,
                  companyId: cLevelMembers.companyId,
                  status: cLevelMembers.status,
                })
                .from(cLevelMembers)
                .where(inArray(cLevelMembers.id, novoLiderCLevelIds))
            : [];
        const novoLiderCLevelMap = new Map(novoLiderCLevelRows.map((r) => [r.id, r]));

        for (const m of input.mapeamento) {
          if (m.novoLiderTipo === 'cLevel') {
            const cl = novoLiderCLevelMap.get(m.novoLiderId);
            if (!cl || cl.companyId !== lider.companyId || cl.status !== 'ativo') {
              throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_NOVO_LIDER_INVALIDO_LT });
            }
            continue;
          }
          // novoLiderTipo === 'employee'
          const emp = novoLiderEmployeeMap.get(m.novoLiderId);
          if (!emp || emp.companyId !== lider.companyId || emp.status !== 'ativo') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_NOVO_LIDER_INVALIDO_LT });
          }
          // Classifica: Grupo 1/2/3 (isLider=true), Grupo 4 (promovido),
          // Grupo 5 (liderado transferido).
          const isG5 = liderosTransferidosSet.has(m.novoLiderId);
          const isG4 = candidatosGrupo4Set.has(m.novoLiderId);
          const isG123 = emp.isLider === true;
          if (isG5 || isG4 || isG123) {
            // Validacao §14.4 do loop condicional para G5: sempre satisfaz por construcao
            // (novoLider em liderosTransferidosSet significa existir
            // m'.lideradoId=m.novoLiderId).
            continue;
          }
          // Nao e G5, G4, nem G123 → mapping invalido §14.4.
          throw new TRPCError({ code: 'CONFLICT', message: MSG_LOOP_CONDICIONAL_VIOLADO });
        }

        // ------ Passo 3: validacao canonica de e-mail dos candidatos Grupo 4 ------
        for (const c of input.candidatosGrupo4) {
          const emp = novoLiderEmployeeMap.get(c.candidatoId);
          if (!emp) {
            // Candidato Grupo 4 declarado mas NAO usado como novoLider em nenhum mapping —
            // buscar do banco para validar email preservando semantica canonica §14.5.
            const solo = await ctx.db
              .select({
                id: employees.id,
                email: employees.email,
                companyId: employees.companyId,
                status: employees.status,
                isLider: employees.isLider,
              })
              .from(employees)
              .where(eq(employees.id, c.candidatoId))
              .limit(1);
            const s = solo[0];
            if (!s || s.companyId !== lider.companyId || s.status !== 'ativo') {
              throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_NOVO_LIDER_INVALIDO_LT });
            }
            if (s.email === null || s.email.length === 0) {
              throw new TRPCError({ code: 'CONFLICT', message: MSG_EMAIL_VAZIO_GRUPO_4 });
            }
            continue;
          }
          if (emp.email === null || emp.email.length === 0) {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_EMAIL_VAZIO_GRUPO_4 });
          }
        }

        // ------ Passos 4, 5, 6, 7 (transacao unica) ------
        const actor = resolveActorForTerminationLT(ctx.user);
        const nowInstant = now();
        const dataInicio = new Date(nowInstant.toISOString().slice(0, 10));

        return await ctx.db.transaction(async (tx) => {
          const closedIds: number[] = [];
          const insertedIds: number[] = [];

          // Passo 4 — fechar historicos ativos + inserir novos.
          for (const m of input.mapeamento) {
            const active = await tx
              .select({ id: employeeLeaderHistory.id })
              .from(employeeLeaderHistory)
              .where(
                and(
                  eq(employeeLeaderHistory.employeeId, m.lideradoId),
                  isNull(employeeLeaderHistory.dataFim),
                ),
              )
              .limit(1);
            const a = active[0];
            if (a) {
              await tx
                .update(employeeLeaderHistory)
                .set({ dataFim: dataInicio })
                .where(eq(employeeLeaderHistory.id, a.id));
              closedIds.push(a.id);
            }
            const newLiderId = m.novoLiderTipo === 'employee' ? m.novoLiderId : null;
            const newCLevelId = m.novoLiderTipo === 'cLevel' ? m.novoLiderId : null;
            const [inserted] = await tx
              .insert(employeeLeaderHistory)
              .values({
                employeeId: m.lideradoId,
                liderId: newLiderId,
                clevelId: newCLevelId,
                dataInicio,
                dataFim: null,
                reason: input.reason,
                transferBatchId: batchId,
              })
              .$returningId();
            if (!inserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT employeeLeaderHistory retornou sem id.',
              });
            }
            insertedIds.push(inserted.id);
          }

          // Passo 5 — UPDATE isLider=true dos Grupo 4 promovidos.
          const promovidosIds: number[] = [];
          for (const c of input.candidatosGrupo4) {
            const [res] = await tx
              .update(employees)
              .set({ isLider: true })
              .where(eq(employees.id, c.candidatoId));
            if (res.affectedRows === 1) {
              promovidosIds.push(c.candidatoId);
            }
          }

          // Passo 6 — UPDATE status='inativo' + INSERT terminationEvents (E01 §12.6).
          const [upd] = await tx
            .update(employees)
            .set({ status: 'inativo' })
            .where(eq(employees.id, input.liderOriginalId));
          if (upd.affectedRows !== 1) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'UPDATE employees status inativo affectedRows != 1.',
            });
          }
          const [termInserted] = await tx
            .insert(employeeTerminationEvents)
            .values({
              employeeId: input.liderOriginalId,
              companyId: lider.companyId,
              dataInativacao: nowInstant,
              motivo: input.motivoSaida,
              nivelHierarquicoSnapshot: lider.nivelHierarquico,
              departamentoSnapshot: lider.departamento,
              actorTipo: actor.actorTipo,
              actorId: actor.actorId,
            })
            .$returningId();
          if (!termInserted) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'INSERT employeeTerminationEvents retornou sem id.',
            });
          }

          // Fecha vinculo ATIVO do proprio lider inativado (se houver).
          const liderActiveLink = await tx
            .select({ id: employeeLeaderHistory.id })
            .from(employeeLeaderHistory)
            .where(
              and(
                eq(employeeLeaderHistory.employeeId, input.liderOriginalId),
                isNull(employeeLeaderHistory.dataFim),
              ),
            )
            .limit(1);
          const liderActive = liderActiveLink[0];
          if (liderActive) {
            await tx
              .update(employeeLeaderHistory)
              .set({ dataFim: dataInicio })
              .where(eq(employeeLeaderHistory.id, liderActive.id));
            closedIds.push(liderActive.id);
          }

          // Passo 7 — COMMIT (implicito no fim da callback).
          return {
            transferBatchId: batchId,
            sucesso: true as const,
            terminationEventId: termInserted.id,
            leaderHistoryClosedIds: closedIds,
            leaderHistoryInsertedIds: insertedIds,
            grupo4PromovidosIds: promovidosIds,
          };
        });
      }),
  });
}

/** Tipo canonico do sub-router. */
export type LeadershipTransferRouter = ReturnType<typeof createLeadershipTransferRouter>;
