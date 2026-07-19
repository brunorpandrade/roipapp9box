// ROIP APP 9BOX — sub-router `company` (ME-044).
//
// Primeira superficie tRPC de escrita canonica de PAPEIS FUNCIONAIS de
// empresa. Cobre 1 proc do §5.5 do DOC 03: `setResponsavelFinanceiro`.
// Nesta ME apenas esta proc — outras superficies de `company.*` (perfil
// da empresa, metas, thresholds) ficam para MEs posteriores do Bloco B3.
//
// Procedure canonica (DOC 03 §5.5):
//   - `company.setResponsavelFinanceiro` — Bruno EXCLUSIVO
//     (`roleProcedure(['super_admin'])`). Atribui ou transfere o papel
//     de Responsavel financeiro para outro titular (employee OU cLevel)
//     da mesma empresa, em transacao atomica com log dedicado append-only
//     em `responsavelFinanceiroTransferLog`.
//
// Discriminacao de cenario (§5.5):
//   - SEM RF vigente (primeira atribuicao): `eventType='atribuido'`;
//     `previousHolderType='none'`, `previousHolderId=null`; `reason`
//     preenchido com literal canonico `REASON_ATRIBUIDO_CANONICA`.
//     Justificativa do payload IGNORADA se enviada (nao ha algo a
//     justificar — nao ha transferencia). Nenhum UPDATE de flag do
//     titular anterior (nao existe).
//   - COM RF vigente (transferencia): `eventType='transferido'`;
//     `previousHolderType/Id` do titular vigente; `reason` = justificativa
//     do payload validada 100-500 (§2.2). Sem justificativa =
//     `BAD_REQUEST` com mensagem canonica.
//
// Transacao atomica canonica (§5.5) — 4 passos:
//   1. Resolve titular vigente varrendo `employees` E `cLevelMembers`
//      dentro da transacao com `.for('update')` — fonte da verdade da
//      invariante "no maximo um RF por empresa" (sem UNIQUE parcial no
//      schema; enforcement de codigo).
//   2. Valida elegibilidade do novo titular (§5.3): mesma empresa, ativo,
//      diferente do vigente.
//   3. Se ha titular vigente: UPDATE flag=false do anterior.
//   4. UPDATE flag=true do novo + INSERT em `responsavelFinanceiroTransferLog`
//      via `insertTransferLogEntry` do service canonico.
//
// Pos-commit: hook D050 `EmitD050Facade` fire-and-forget. DI no-op por
// default — o motor de notificacoes canonico (DOC 06 §8) nascera em MEs
// do Bloco B6 e sera injetado aqui sem editar este router. Padrao S049.
//
// Fora do escopo desta ME:
//   - `eventType='removido'` (remocao sem substituto) — nao existe
//     superficie canonica para isso ate a proxima onda; §5.6 canoniza
//     que RF sempre tem substituto na inativacao.
//   - Notificacoes reais em `notifications` (D050) — motor B6.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/company-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  employees,
  responsavelFinanceiroTransferLog,
} from '../../db/schema';
import { insertTransferLogEntry } from '../services/responsavelFinanceiroTransferLog';

import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas (§5.5 / §2.2)
// ============================================================

/** §2.2 — piso da regra 100-500 aplicada em `reason` de transferencia. */
export const JUSTIFICATIVA_TRANSFER_MIN = 100 as const;

/** §2.2 — teto da regra 100-500 aplicada em `reason` de transferencia. */
export const JUSTIFICATIVA_TRANSFER_MAX = 500 as const;

/**
 * §5.5 — literal canonico do `reason` no cenario `atribuido` (primeira
 * atribuicao). Preenche a coluna `reason` NOT NULL do schema quando nao
 * ha justificativa (nao ha transferencia a justificar).
 */
export const REASON_ATRIBUIDO_CANONICA = 'Primeira atribuicao de Responsavel financeiro' as const;

// ============================================================
// Mensagens canonicas literais (testadas verbatim)
// ============================================================

/** §2.4 — guard cruzado companyId (salvaguarda; Bruno atravessa). */
export const MSG_COMPANY_MISMATCH_RF = 'Empresa nao pertence ao seu escopo.' as const;

/** §5.5 — empresa alvo nao encontrada pelo id. */
export const MSG_COMPANY_NAO_ENCONTRADA_RF = 'Empresa nao encontrada.' as const;

/** §5.5 — novo titular nao encontrado (varredura em employees/cLevelMembers). */
export const MSG_NEW_HOLDER_NAO_ENCONTRADO_RF = 'Novo titular nao encontrado.' as const;

/** §5.3 — novo titular inativo. */
export const MSG_NEW_HOLDER_INATIVO_RF =
  'Novo titular esta inativo e nao pode receber o papel.' as const;

/** §5.3 — novo titular pertence a outra empresa. */
export const MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF =
  'Novo titular nao pertence a esta empresa.' as const;

/** §5.5 — novo titular ja e o vigente. */
export const MSG_NEW_HOLDER_JA_E_RF =
  'O titular indicado ja e o Responsavel financeiro vigente.' as const;

/** §2.2 — justificativa de transferencia < 100 chars. */
export const MSG_TRANSFER_JUSTIFICATIVA_MIN =
  'A justificativa deve ter no minimo 100 caracteres.' as const;

/** §2.2 — justificativa de transferencia > 500 chars. */
export const MSG_TRANSFER_JUSTIFICATIVA_MAX =
  'A justificativa deve ter no maximo 500 caracteres.' as const;

/** §5.5 — justificativa obrigatoria quando existe RF vigente (transferencia). */
export const MSG_TRANSFER_JUSTIFICATIVA_OBRIGATORIA =
  'Transferencia de Responsavel financeiro exige justificativa.' as const;

// ============================================================
// Schema Zod canonico de entrada
// ============================================================

/**
 * §5.5 — input canonico de `setResponsavelFinanceiro`.
 * - `newHolderType` casa 1:1 com o enum do schema (`cLevel` camelCase, nao
 *   `clevel`; a coluna do banco usa a forma canonica do DOC 01).
 * - `justificativa` opcional no schema Zod. Obrigatoriedade e validacao
 *   100-500 vivem no handler (depende do cenario resolvido pela transacao).
 */
export const SET_RF_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  newHolderType: z.enum(['employee', 'cLevel']),
  newHolderId: z.number().int().positive(),
  justificativa: z.string().optional(),
});

// ============================================================
// Contratos publicos exportados (RV-13 — testados)
// ============================================================

/** Retorno canonico do `setResponsavelFinanceiro`. */
export interface SetResponsavelFinanceiroResult {
  transferLogId: number;
  eventType: 'atribuido' | 'transferido';
  previousHolder: {
    type: 'employee' | 'cLevel' | 'none';
    id: number | null;
  };
  newHolder: {
    type: 'employee' | 'cLevel';
    id: number;
  };
}

// ============================================================
// DI (padrao S049/S100 estendido)
// ============================================================

/**
 * Fachada canonica do gatilho D050 (`responsavel_financeiro_nomeado`). O
 * router chama apos COMMIT bem-sucedido; o motor real (DOC 06 §8, Bloco
 * B6) sera injetado sem editar este router. Assinatura canonica: recebe
 * `(companyId, newHolderType, newHolderId)` — o motor real le contexto
 * adicional (nome, e-mail) via SELECT proprio. Default no-op documentado.
 */
export type EmitD050Facade = (
  companyId: number,
  newHolderType: 'employee' | 'cLevel',
  newHolderId: number,
) => Promise<void>;

/** No-op canonico de D050 — motor real virá em ME futura do B6. */
export const DEFAULT_D050_HOOK: EmitD050Facade = async () => {
  // Motor de notificacoes ainda nao existe (DOC 06 §8).
};

/** Dependencias injetaveis do sub-router. */
export interface CompanyRouterDeps {
  emitD050?: EmitD050Facade;
  now?: () => Date;
}

/** DI default: hook no-op + relogio real. */
export const DEFAULT_COMPANY_ROUTER_DEPS: Required<CompanyRouterDeps> = {
  emitD050: DEFAULT_D050_HOOK,
  now: () => new Date(),
};

// ============================================================
// Codigos MySQL usados como salvaguarda (L77)
// ============================================================

/** MySQL2 errno canonico para duplicidade de UNIQUE. */
export const MYSQL_ERR_DUP_ENTRY_RF = 1062 as const;

/** MySQL2 errno canonico para violacao de FK ON DELETE RESTRICT. */
export const MYSQL_ERR_ROW_IS_REFERENCED_RF = 1451 as const;

// ============================================================
// Helpers (RV-13)
// ============================================================

/**
 * §2.4 guard cruzado companyId — super_admin atravessa. Como a proc e
 * Bruno EXCLUSIVO, esta funcao e salvaguarda semantica (RV-13 satisfeita:
 * chamada pelo handler; RV-08 satisfeita: nao amplia decisao do Manus).
 */
export function assertCompanyScopeRf(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_RF });
  }
}

/**
 * §2.2 canonico — valida a justificativa 100-500 no cenario `transferido`.
 * Aplicado apenas quando existe titular vigente (cenario 'transferido').
 * No cenario 'atribuido' a justificativa e ignorada e nao passa por aqui.
 */
export function assertJustificativaTransfer(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: MSG_TRANSFER_JUSTIFICATIVA_OBRIGATORIA,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length < JUSTIFICATIVA_TRANSFER_MIN) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_TRANSFER_JUSTIFICATIVA_MIN });
  }
  if (trimmed.length > JUSTIFICATIVA_TRANSFER_MAX) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_TRANSFER_JUSTIFICATIVA_MAX });
  }
  return trimmed;
}

/**
 * Modelo canonico do titular vigente. `type='none'` quando nenhum
 * employee/cLevel da empresa tem `isResponsavelFinanceiro=true`.
 */
export interface CurrentHolder {
  type: 'employee' | 'cLevel' | 'none';
  id: number | null;
}

/**
 * §5.5 — resolve o titular vigente varrendo `employees` E `cLevelMembers`
 * dentro da transacao com `.for('update')`. Fonte da verdade da invariante
 * "no maximo um RF por empresa": nao existe UNIQUE parcial no schema, o
 * enforcement e por codigo. Caso patologico de dois RFs simultaneos (falha
 * de invariante anterior) resolvido pelo `.limit(1)` — o UPDATE seguinte
 * corrige apenas UM, deixando o outro para deteccao operacional.
 *
 * `RoipDbTx` e o tipo de callback do `.transaction(async (tx) => ...)` do
 * Drizzle mysql-core; tipamos por generico da `db` original para evitar
 * dependencia adicional do runtime.
 */
export async function resolveCurrentHolderInTx(
  tx: RoipDatabase,
  companyId: number,
): Promise<CurrentHolder> {
  const empRows = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.isResponsavelFinanceiro, true)))
    .for('update')
    .limit(1);
  if (empRows[0] !== undefined) {
    return { type: 'employee', id: empRows[0].id };
  }
  const clRows = await tx
    .select({ id: cLevelMembers.id })
    .from(cLevelMembers)
    .where(
      and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.isResponsavelFinanceiro, true)),
    )
    .for('update')
    .limit(1);
  if (clRows[0] !== undefined) {
    return { type: 'cLevel', id: clRows[0].id };
  }
  return { type: 'none', id: null };
}

/**
 * §5.3 — valida elegibilidade do novo titular. Regras canonicas minimas:
 *   - Existencia (SELECT retornou linha).
 *   - Escopo empresa: `companyId` do titular === `companyId` da empresa alvo.
 *   - Status ativo (`status='ativo'`).
 * Guards mais estritos (perfil administrativo obrigatorio) ficam para MEs
 * futuras se a norma canonica evoluir; a interpretacao segura hoje e o
 * piso acima.
 */
export async function assertNewHolderEligibility(
  tx: RoipDatabase,
  companyId: number,
  newHolderType: 'employee' | 'cLevel',
  newHolderId: number,
): Promise<void> {
  if (newHolderType === 'employee') {
    const rows = await tx
      .select({
        companyId: employees.companyId,
        status: employees.status,
      })
      .from(employees)
      .where(eq(employees.id, newHolderId))
      .for('update')
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new TRPCError({ code: 'NOT_FOUND', message: MSG_NEW_HOLDER_NAO_ENCONTRADO_RF });
    }
    if (row.companyId !== companyId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF,
      });
    }
    if (row.status !== 'ativo') {
      throw new TRPCError({ code: 'CONFLICT', message: MSG_NEW_HOLDER_INATIVO_RF });
    }
    return;
  }
  const rows = await tx
    .select({
      companyId: cLevelMembers.companyId,
      status: cLevelMembers.status,
    })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, newHolderId))
    .for('update')
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: MSG_NEW_HOLDER_NAO_ENCONTRADO_RF });
  }
  if (row.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF });
  }
  if (row.status !== 'ativo') {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_NEW_HOLDER_INATIVO_RF });
  }
}

/**
 * Monta o payload tipado do INSERT no log — separado do handler para
 * ficar testavel isolado e para preservar RV-14 (uma statement por linha).
 */
export function buildTransferLogPayload(params: {
  companyId: number;
  previousHolder: CurrentHolder;
  newHolderType: 'employee' | 'cLevel';
  newHolderId: number;
  actorSuperAdminId: number;
  eventType: 'atribuido' | 'transferido';
  reason: string;
}): typeof responsavelFinanceiroTransferLog.$inferInsert {
  return {
    companyId: params.companyId,
    previousHolderType: params.previousHolder.type,
    previousHolderId: params.previousHolder.id,
    newHolderType: params.newHolderType,
    newHolderId: params.newHolderId,
    actorSuperAdminId: params.actorSuperAdminId,
    eventType: params.eventType,
    reason: params.reason,
  };
}

/**
 * L77 — converte errno do mysql2 em TRPCError canonico. Caminha a cadeia
 * `err → err.cause → …` ate profundidade 5 (DrizzleQueryError embala em
 * `.cause`). Como nao ha UNIQUE parcial em `isResponsavelFinanceiro` (o
 * enforcement e por codigo), o erro esperado aqui na pratica e FK residual
 * (que nao pode acontecer em setRF — nao ha DELETE); fallback re-throw.
 */
export function rethrowMysqlErrorRF(err: unknown): never {
  const chain: Array<{ errno?: number; code?: string }> = [];
  let node: unknown = err;
  for (let i = 0; i < 5 && node !== null && node !== undefined; i += 1) {
    const n = node as { errno?: number; code?: string; cause?: unknown };
    chain.push({ errno: n.errno, code: n.code });
    node = n.cause;
  }
  const dup = chain.find((n) => n.errno === MYSQL_ERR_DUP_ENTRY_RF || n.code === 'ER_DUP_ENTRY');
  if (dup) {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_NEW_HOLDER_JA_E_RF });
  }
  throw err as Error;
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica de `company` (S049/S100). Instanciada com
 * `DEFAULT_COMPANY_ROUTER_DEPS` no `appRouter`. Testes injetam capturadores
 * de `emitD050` e `now` fixo.
 */
export function createCompanyRouter(deps: CompanyRouterDeps = {}) {
  const emitD050 = deps.emitD050 ?? DEFAULT_D050_HOOK;
  const now = deps.now ?? (() => new Date());
  return router({
    // --------------------------------------------------------
    // company.setResponsavelFinanceiro — Bruno EXCLUSIVO
    // --------------------------------------------------------
    setResponsavelFinanceiro: roleProcedure(['super_admin'])
      .input(SET_RF_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<SetResponsavelFinanceiroResult> => {
        // (1) Guard cruzado (salvaguarda semantica — Bruno atravessa).
        assertCompanyScopeRf(ctx.user, input.companyId);

        // (2) roleProcedure ja garantiu super_admin — extrai actor.
        if (ctx.user.role !== 'super_admin') {
          // Inalcancavel — narrowed pelo guard acima.
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_RF });
        }
        const actorSuperAdminId = ctx.user.superAdminId;

        // (3) Verifica existencia da empresa alvo (§5.5 pre-condicao).
        const companyRows = await ctx.db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (companyRows[0] === undefined) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }

        // (4) Transacao atomica canonica (§5.5).
        let result: SetResponsavelFinanceiroResult;
        try {
          result = await ctx.db.transaction(async (tx) => {
            // (4.a) Resolve titular vigente (fonte da verdade da invariante).
            const previousHolder = await resolveCurrentHolderInTx(tx, input.companyId);

            // (4.b) Novo === vigente = CONFLICT canonico.
            if (
              previousHolder.type === input.newHolderType &&
              previousHolder.id === input.newHolderId
            ) {
              throw new TRPCError({ code: 'CONFLICT', message: MSG_NEW_HOLDER_JA_E_RF });
            }

            // (4.c) Elegibilidade do novo titular (§5.3).
            await assertNewHolderEligibility(
              tx,
              input.companyId,
              input.newHolderType,
              input.newHolderId,
            );

            // (4.d) Determina cenario canonico.
            const eventType: 'atribuido' | 'transferido' =
              previousHolder.type === 'none' ? 'atribuido' : 'transferido';

            // (4.e) `reason` canonico por cenario.
            const reason =
              eventType === 'transferido'
                ? assertJustificativaTransfer(input.justificativa)
                : REASON_ATRIBUIDO_CANONICA;

            // (4.f) UPDATE flag=false do titular anterior (apenas em transferido).
            if (previousHolder.type === 'employee' && previousHolder.id !== null) {
              await tx
                .update(employees)
                .set({ isResponsavelFinanceiro: false })
                .where(eq(employees.id, previousHolder.id));
            } else if (previousHolder.type === 'cLevel' && previousHolder.id !== null) {
              await tx
                .update(cLevelMembers)
                .set({ isResponsavelFinanceiro: false })
                .where(eq(cLevelMembers.id, previousHolder.id));
            }

            // (4.g) UPDATE flag=true do novo titular.
            if (input.newHolderType === 'employee') {
              await tx
                .update(employees)
                .set({ isResponsavelFinanceiro: true })
                .where(eq(employees.id, input.newHolderId));
            } else {
              await tx
                .update(cLevelMembers)
                .set({ isResponsavelFinanceiro: true })
                .where(eq(cLevelMembers.id, input.newHolderId));
            }

            // (4.h) INSERT no log via service canonico.
            const payload = buildTransferLogPayload({
              companyId: input.companyId,
              previousHolder,
              newHolderType: input.newHolderType,
              newHolderId: input.newHolderId,
              actorSuperAdminId,
              eventType,
              reason,
            });
            const transferLogId = await insertTransferLogEntry(tx, payload);

            return {
              transferLogId,
              eventType,
              previousHolder,
              newHolder: {
                type: input.newHolderType,
                id: input.newHolderId,
              },
            };
          });
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          rethrowMysqlErrorRF(err);
        }

        // (5) Gatilho D050 pos-COMMIT — fire-and-forget (§5.9 canonico).
        // `now` reservado para simetria com outros routers (RV-13 consumo).
        void now;
        void emitD050(input.companyId, input.newHolderType, input.newHolderId).catch(() => {
          // Silencio canonico — motor real logara internamente.
        });

        return result;
      }),
  });
}

/** Tipo canonico do sub-router. */
export type CompanyRouter = ReturnType<typeof createCompanyRouter>;
