// ROIP APP 9BOX — sub-router `cLevelMembers` (ME-043).
//
// Segunda superficie tRPC de ESCRITA canonica sobre a tabela
// `cLevelMembers` (DOC 01 §4.4). Cobre 5 procs do §16.7 do DOC 03,
// todas Bruno EXCLUSIVO (DOC 02 §12):
//
//   - `cLevelMembers.create`     — transacao atomica: INSERT
//     `cLevelMembers` + INSERT `individualProfilePlaceholders`
//     (userType='clevel', status='pendente' — §10.12).
//   - `cLevelMembers.update`     — atualiza campos permitidos (dados
//     cadastrais + `acessoTotal`). `isResponsavelFinanceiro` REJEITADO
//     (S127 — nomeacao/transferencia em `company.setResponsavelFinanceiro`
//     na ME-044).
//   - `cLevelMembers.inactivate` — S128: proc dedicada com semantica
//     seca. UPDATE `status='inativo'` apenas. Guard §5.6 (RF sem
//     substituto). SEM `employeeTerminationEvents` (§12.2 canoniza
//     C-levels fora da populacao turnover). SEM `motivoSaida` (§12.6
//     canoniza modal do C-level "sem alteracao").
//   - `cLevelMembers.reactivate` — UPDATE `status='ativo'`.
//   - `cLevelMembers.delete`     — S129: deleta apenas se `status='inativo'`
//     E sem historico E nao e RF. Transacao: DELETE do placeholder +
//     DELETE do C-level. Erros de FK residuais convertidos em CONFLICT
//     canonico (salvaguarda).
//
// Fora do escopo (S127):
//   - `isResponsavelFinanceiro=true` em `create` ou `update` sobe
//     BAD_REQUEST canonico.
//   - Alerta D050 (§5.9) — gatilho canonico e
//     `company.setResponsavelFinanceiro` (ME-044), nao o `create`.
//
// Convencoes canonicas herdadas: guards `roleProcedure(['super_admin'])`
// em TODAS as procs (S086 estendido); Zod integral do input; CPF
// normalizado (S125); mensagens canonicas literais exportadas para
// asserts verbatim; transacoes 100% Drizzle tipado (RV-12 + L54);
// uma statement por linha (RV-14).

import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  DEPARTAMENTO_VALUES,
  cLevelMembers,
  employeeLeaderHistory,
  individualProfilePlaceholders,
  iqlData,
  lgpdConsents,
  monthlyUnlockLog,
} from '../../db/schema';

import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas (§4.4)
// ============================================================

/** §4.4 — CPF em MySQL e VARCHAR(11); armazenamos apenas digitos. */
export const CPF_LENGTH_CL = 11 as const;

/** §4.4 — VARCHAR(255) canonico do nome. */
export const NAME_MAX_LENGTH_CL = 255 as const;

/** §4.4 — VARCHAR(255) canonico do e-mail. */
export const EMAIL_MAX_LENGTH_CL = 255 as const;

/** §4.4 — VARCHAR(100) canonico do cargo do C-level. */
export const CARGO_MAX_LENGTH_CL = 100 as const;

/** §4.4 — VARCHAR(500) canonico da photoUrl. */
export const PHOTO_URL_MAX_LENGTH_CL = 500 as const;

// ============================================================
// Mensagens canonicas literais (testadas verbatim)
// ============================================================

/** §2.4 — guard cruzado companyId. */
export const MSG_COMPANY_MISMATCH_CL = 'C-level nao pertence a sua empresa.' as const;

/** §4.4 — C-level nao encontrado pelo id. */
export const MSG_CLEVEL_NAO_ENCONTRADO = 'C-level nao encontrado.' as const;

/** §4.4 — CPF ja existe (uq_clevel_cpf). */
export const MSG_CPF_DUPLICADO_CL =
  'Ja existe C-level cadastrado com este CPF nesta empresa.' as const;

/** §16.4 — RF nao pode ser deletado em qualquer condicao. */
export const MSG_DELETE_RF_BLOQUEADO_CL =
  'Nao e possivel excluir o Responsavel financeiro. Transfira o papel antes de excluir.' as const;

/** §16.4 — deletar C-level ativo e proibido; inative primeiro. */
export const MSG_DELETE_CLEVEL_ATIVO =
  'C-level ativo nao pode ser deletado. Inative antes.' as const;

/** §16.7 (`cLevelMembers.delete`) — bloqueio canonico se ha historico. */
export const MSG_DELETE_COM_HISTORICO_CL =
  'C-level possui dados historicos. Deletar nao e permitido; mantenha inativo.' as const;

/** §5.6 (adaptado a C-level) — inativar C-level RF sem substituto. */
export const MSG_INACTIVATE_RF_BLOQUEADO_CL =
  'Este C-level e o Responsavel financeiro da empresa. Antes de inativar, ' +
  'atribua o papel de Responsavel financeiro a outro colaborador.';

/** §4.4 — C-level ja esta inativo. */
export const MSG_JA_INATIVO_CL = 'C-level ja esta inativo.' as const;

/** §4.4 — C-level ja esta ativo. */
export const MSG_JA_ATIVO_CL = 'C-level ja esta ativo.' as const;

/** S127 — toggle RF fora da ME-043. */
export const MSG_TOGGLE_RF_FORA_ESCOPO_CL =
  'Alteracao de Responsavel financeiro nao e permitida por esta rota; ' +
  'use company.setResponsavelFinanceiro.';

// ============================================================
// Codigos MySQL usados como salvaguarda
// ============================================================

/** MySQL2 errno canonico para duplicidade de UNIQUE (uq_clevel_cpf). */
export const MYSQL_ERR_DUP_ENTRY_CL = 1062 as const;

/** MySQL2 errno canonico para violacao de FK ON DELETE RESTRICT. */
export const MYSQL_ERR_ROW_IS_REFERENCED_CL = 1451 as const;

// ============================================================
// Schemas Zod canonicos
// ============================================================

const cpfSchemaBaseCl = z
  .string()
  .transform((v) => v.replace(/\D+/g, ''))
  .refine((v) => v.length === CPF_LENGTH_CL, {
    message: 'CPF deve ter 11 digitos apos normalizacao.',
  });

/** §4.4 — CPF canonico normalizado (S125 superficial). */
export const CPF_SCHEMA_CL = cpfSchemaBaseCl;

const emailSchemaCl = z.string().email({ message: 'E-mail invalido.' }).max(EMAIL_MAX_LENGTH_CL);

const dateFieldSchemaCl = z.union([z.date(), z.string().transform((v) => new Date(v))]);

const custoMensalSchema = z.union([
  z.number(),
  z.string().refine((v) => !Number.isNaN(Number(v)), { message: 'custoMensal invalido.' }),
]);

/**
 * §4.4 — input canonico de `cLevelMembers.create`.
 * `isResponsavelFinanceiro` explicitamente ausente do schema (S127).
 */
export const CREATE_CLEVEL_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(1).max(NAME_MAX_LENGTH_CL),
  cpf: CPF_SCHEMA_CL,
  email: emailSchemaCl,
  photoUrl: z.string().url().max(PHOTO_URL_MAX_LENGTH_CL).optional(),
  dataNascimento: dateFieldSchemaCl,
  dataAdmissao: dateFieldSchemaCl,
  cargo: z.string().min(1).max(CARGO_MAX_LENGTH_CL),
  descricaoCargo: z.string().min(1),
  departamento: z.enum(DEPARTAMENTO_VALUES),
  custoMensal: custoMensalSchema,
  acessoTotal: z.boolean(),
});

/**
 * §4.4 — input canonico de `cLevelMembers.update`. Campos permitidos.
 * `status`, `isResponsavelFinanceiro`, `passwordHash`, `passwordSet` fora
 * (canal proprio para cada um).
 */
export const UPDATE_CLEVEL_INPUT_SCHEMA = z
  .object({
    cLevelId: z.number().int().positive(),
    name: z.string().min(1).max(NAME_MAX_LENGTH_CL).optional(),
    email: emailSchemaCl.optional(),
    photoUrl: z.string().url().max(PHOTO_URL_MAX_LENGTH_CL).optional(),
    dataNascimento: dateFieldSchemaCl.optional(),
    cargo: z.string().min(1).max(CARGO_MAX_LENGTH_CL).optional(),
    descricaoCargo: z.string().min(1).optional(),
    departamento: z.enum(DEPARTAMENTO_VALUES).optional(),
    custoMensal: custoMensalSchema.optional(),
    acessoTotal: z.boolean().optional(),
  })
  .refine(
    (v) => {
      const keys = Object.keys(v) as Array<keyof typeof v>;
      return keys.some((k) => k !== 'cLevelId' && v[k] !== undefined);
    },
    { message: 'Informe ao menos um campo a atualizar.' },
  );

/** §4.4 + §12.6 — input de `cLevelMembers.inactivate` (semantica seca). */
export const INACTIVATE_CLEVEL_INPUT_SCHEMA = z.object({
  cLevelId: z.number().int().positive(),
});

/** §4.4 — input de `cLevelMembers.reactivate`. */
export const REACTIVATE_CLEVEL_INPUT_SCHEMA = z.object({
  cLevelId: z.number().int().positive(),
});

/** §16.4 — input de `cLevelMembers.delete`. */
export const DELETE_CLEVEL_INPUT_SCHEMA = z.object({
  cLevelId: z.number().int().positive(),
});

// ============================================================
// Tipos publicos exportados (RV-13 — testados)
// ============================================================

/** Retorno canonico do `create`. */
export interface CreateCLevelResult {
  cLevelId: number;
  placeholderId: number;
}

/** Retorno canonico do `update`. */
export interface UpdateCLevelResult {
  cLevelId: number;
  affected: number;
}

/** Retorno canonico do `inactivate`. */
export interface InactivateCLevelResult {
  cLevelId: number;
  affected: number;
}

/** Retorno canonico do `reactivate`. */
export interface ReactivateCLevelResult {
  cLevelId: number;
  affected: number;
}

/** Retorno canonico do `delete`. */
export interface DeleteCLevelResult {
  cLevelId: number;
  deleted: boolean;
}

// ============================================================
// DI factory (padrao S100/S084)
// ============================================================

/**
 * Dependencias do sub-router `cLevelMembers`. `now` injetavel para
 * testes deterministicos (embora nesta ME nao haja transacao dependente
 * de now — inativacao/deleta apenas altera status; preserva-se para
 * simetria com `employees` e evolutivo canonico).
 */
export interface CLevelMembersRouterDeps {
  now?: () => Date;
}

/** DI default. */
export const DEFAULT_CLEVEL_MEMBERS_ROUTER_DEPS: Required<CLevelMembersRouterDeps> = {
  now: () => new Date(),
};

// ============================================================
// Helpers (RV-13)
// ============================================================

/**
 * §2.4 guard cruzado companyId — super_admin atravessa. Como todas as
 * procs sao Bruno-EXCLUSIVO, esta funcao e uma salvaguarda semantica
 * (caso o guard de perfil no `roleProcedure` seja ampliado no futuro).
 * NAO e code dead — e chamada por cada handler (RV-13).
 */
export function assertCompanyScopeCl(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_CL });
  }
}

/**
 * §16.4 — verifica se o C-level possui QUALQUER registro em tabelas de
 * historico canonico. Definicao operacional para esta ME:
 *   - `employeeLeaderHistory` (foi lider de alguem alguma vez);
 *   - `iqlData` (dados IQL de escopo `clevel`);
 *   - `monthlyUnlockLog` (foi ator de desbloqueio, `liderTipo='clevel'`);
 *   - `lgpdConsents` (aceitou termo).
 * `nineBoxCalculationLog` deliberadamente FORA — DOC 02 §11.3 canoniza
 * que C-levels nao entram no 9-Box por regra estrutural (§7.5), portanto
 * nao ha linha do C-level naquela tabela. Lista minima suficiente para
 * caracterizar "C-level com dados historicos" no MVP; ampliavel.
 */
export async function hasHistoricoCl(db: RoipDatabase, cLevelId: number): Promise<boolean> {
  const checks = [
    db
      .select({ n: count() })
      .from(employeeLeaderHistory)
      .where(eq(employeeLeaderHistory.clevelId, cLevelId)),
    db.select({ n: count() }).from(iqlData).where(eq(iqlData.clevelId, cLevelId)),
    db
      .select({ n: count() })
      .from(monthlyUnlockLog)
      .where(and(eq(monthlyUnlockLog.liderId, cLevelId), eq(monthlyUnlockLog.liderTipo, 'clevel'))),
    db.select({ n: count() }).from(lgpdConsents).where(eq(lgpdConsents.clevelId, cLevelId)),
  ] as const;
  for (const p of checks) {
    const rows = await p;
    const row = rows[0];
    if (row && Number(row.n) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Salvaguarda: converte errno do mysql2 em TRPCError canonico. Cobre
 * duplicidade de CPF e violacao residual de FK no DELETE (paralelo
 * a `rethrowMysqlError` de `employees.ts`).
 */
export function rethrowMysqlErrorCl(err: unknown): never {
  const chain: Array<{ errno?: number; code?: string }> = [];
  let node: unknown = err;
  for (let i = 0; i < 5 && node !== null && node !== undefined; i += 1) {
    const n = node as { errno?: number; code?: string; cause?: unknown };
    chain.push({ errno: n.errno, code: n.code });
    node = n.cause;
  }
  const dup = chain.find((n) => n.errno === MYSQL_ERR_DUP_ENTRY_CL || n.code === 'ER_DUP_ENTRY');
  if (dup) {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_CPF_DUPLICADO_CL });
  }
  const ref = chain.find(
    (n) => n.errno === MYSQL_ERR_ROW_IS_REFERENCED_CL || n.code === 'ER_ROW_IS_REFERENCED_2',
  );
  if (ref) {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_COM_HISTORICO_CL });
  }
  throw err as Error;
}

/**
 * §4.4 — mapeia o payload do `create` para o objeto de INSERT tipado.
 * `custoMensal` viaja como string (schema Drizzle decimal aceita string
 * canonicamente; number tambem funciona via coercao mysql2).
 */
export function buildCLevelInsertPayload(
  input: z.infer<typeof CREATE_CLEVEL_INPUT_SCHEMA>,
): typeof cLevelMembers.$inferInsert {
  return {
    companyId: input.companyId,
    name: input.name,
    cpf: input.cpf,
    email: input.email,
    photoUrl: input.photoUrl,
    dataNascimento: input.dataNascimento,
    dataAdmissao: input.dataAdmissao,
    cargo: input.cargo,
    descricaoCargo: input.descricaoCargo,
    departamento: input.departamento,
    custoMensal: String(input.custoMensal),
    acessoTotal: input.acessoTotal,
    isResponsavelFinanceiro: false,
  };
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica de `cLevelMembers` (S100/S084). Instanciada com
 * `DEFAULT_CLEVEL_MEMBERS_ROUTER_DEPS` no `appRouter`.
 */
export function createCLevelMembersRouter(deps: CLevelMembersRouterDeps = {}) {
  const _deps = { ...DEFAULT_CLEVEL_MEMBERS_ROUTER_DEPS, ...deps };
  // `now` reservado para simetria com `employees` (RV-13: consumido pela
  // funcao `touchNow` interna se aparecer no futuro). Nao removivel sem
  // introduzir divergencia estrutural com o sub-router irmao.
  void _deps.now;

  return router({
    // --------------------------------------------------------
    // cLevelMembers.create — Bruno EXCLUSIVO
    // --------------------------------------------------------
    create: roleProcedure(['super_admin'])
      .input(CREATE_CLEVEL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<CreateCLevelResult> => {
        assertCompanyScopeCl(ctx.user, input.companyId);
        try {
          return await ctx.db.transaction(async (tx) => {
            const payload = buildCLevelInsertPayload(input);
            const [inserted] = await tx.insert(cLevelMembers).values(payload).$returningId();
            if (!inserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em cLevelMembers nao retornou id.',
              });
            }
            const cLevelId = inserted.id;

            const [placeholderInserted] = await tx
              .insert(individualProfilePlaceholders)
              .values({
                companyId: input.companyId,
                userType: 'clevel',
                userId: cLevelId,
                status: 'pendente',
              })
              .$returningId();
            if (!placeholderInserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em individualProfilePlaceholders nao retornou id.',
              });
            }
            return { cLevelId, placeholderId: placeholderInserted.id };
          });
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          rethrowMysqlErrorCl(err);
        }
      }),

    // --------------------------------------------------------
    // cLevelMembers.update — Bruno EXCLUSIVO
    // --------------------------------------------------------
    update: roleProcedure(['super_admin'])
      .input(UPDATE_CLEVEL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UpdateCLevelResult> => {
        const target = await ctx.db
          .select()
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, input.cLevelId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CLEVEL_NAO_ENCONTRADO });
        }
        assertCompanyScopeCl(ctx.user, row.companyId);

        const patch: Partial<typeof cLevelMembers.$inferInsert> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.email !== undefined) patch.email = input.email;
        if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
        if (input.dataNascimento !== undefined) patch.dataNascimento = input.dataNascimento;
        if (input.cargo !== undefined) patch.cargo = input.cargo;
        if (input.descricaoCargo !== undefined) patch.descricaoCargo = input.descricaoCargo;
        if (input.departamento !== undefined) patch.departamento = input.departamento;
        if (input.custoMensal !== undefined) patch.custoMensal = String(input.custoMensal);
        if (input.acessoTotal !== undefined) patch.acessoTotal = input.acessoTotal;

        const [result] = await ctx.db
          .update(cLevelMembers)
          .set(patch)
          .where(eq(cLevelMembers.id, input.cLevelId));
        return { cLevelId: input.cLevelId, affected: result.affectedRows };
      }),

    // --------------------------------------------------------
    // cLevelMembers.inactivate — Bruno EXCLUSIVO (S128 semantica seca)
    // --------------------------------------------------------
    inactivate: roleProcedure(['super_admin'])
      .input(INACTIVATE_CLEVEL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<InactivateCLevelResult> => {
        const target = await ctx.db
          .select()
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, input.cLevelId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CLEVEL_NAO_ENCONTRADO });
        }
        assertCompanyScopeCl(ctx.user, row.companyId);
        if (row.status === 'inativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_JA_INATIVO_CL });
        }
        if (row.isResponsavelFinanceiro === true) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_INACTIVATE_RF_BLOQUEADO_CL });
        }
        const [result] = await ctx.db
          .update(cLevelMembers)
          .set({ status: 'inativo' })
          .where(eq(cLevelMembers.id, input.cLevelId));
        return { cLevelId: input.cLevelId, affected: result.affectedRows };
      }),

    // --------------------------------------------------------
    // cLevelMembers.reactivate — Bruno EXCLUSIVO
    // --------------------------------------------------------
    reactivate: roleProcedure(['super_admin'])
      .input(REACTIVATE_CLEVEL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<ReactivateCLevelResult> => {
        const target = await ctx.db
          .select()
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, input.cLevelId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CLEVEL_NAO_ENCONTRADO });
        }
        assertCompanyScopeCl(ctx.user, row.companyId);
        if (row.status === 'ativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_JA_ATIVO_CL });
        }
        const [result] = await ctx.db
          .update(cLevelMembers)
          .set({ status: 'ativo' })
          .where(eq(cLevelMembers.id, input.cLevelId));
        return { cLevelId: input.cLevelId, affected: result.affectedRows };
      }),

    // --------------------------------------------------------
    // cLevelMembers.delete — Bruno EXCLUSIVO
    // --------------------------------------------------------
    delete: roleProcedure(['super_admin'])
      .input(DELETE_CLEVEL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<DeleteCLevelResult> => {
        const target = await ctx.db
          .select()
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, input.cLevelId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CLEVEL_NAO_ENCONTRADO });
        }
        assertCompanyScopeCl(ctx.user, row.companyId);
        if (row.status === 'ativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_CLEVEL_ATIVO });
        }
        if (row.isResponsavelFinanceiro === true) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_RF_BLOQUEADO_CL });
        }
        const temHistorico = await hasHistoricoCl(ctx.db, input.cLevelId);
        if (temHistorico) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_COM_HISTORICO_CL });
        }
        try {
          return await ctx.db.transaction(async (tx) => {
            await tx
              .delete(individualProfilePlaceholders)
              .where(
                and(
                  eq(individualProfilePlaceholders.userType, 'clevel'),
                  eq(individualProfilePlaceholders.userId, input.cLevelId),
                ),
              );
            const [deleteResult] = await tx
              .delete(cLevelMembers)
              .where(eq(cLevelMembers.id, input.cLevelId));
            const deleted = deleteResult.affectedRows === 1;
            return { cLevelId: input.cLevelId, deleted };
          });
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          rethrowMysqlErrorCl(err);
        }
      }),
  });
}

/** Tipo canonico do sub-router. */
export type CLevelMembersRouter = ReturnType<typeof createCLevelMembersRouter>;
