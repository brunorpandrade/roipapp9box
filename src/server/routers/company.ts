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
import { JOB_FAMILY_VALUES } from '../../db/schema/enums';
import {
  CnpjDuplicateError,
  CreateCompanyInputSchema,
  CreateCompanyValidationError,
  executeCreateCompany,
  MSG_LGPD_EMAIL_VAZIO,
  MSG_LGPD_NOME_VAZIO,
  normalizeCreateCompanyInput,
} from '../../lib/company/createCompanyInput';
import {
  assertAnoFiscalImmutabilityWhenLocked,
  hasAnyMetaROIChanged,
  normalizeUpdateCompanyParametersInput,
  UpdateCompanyParametersInputSchema,
  UpdateCompanyValidationError,
  type NormalizedUpdate,
} from '../../lib/company/updateCompanyInput';
import {
  getCompanyForUpdate,
  hasFirstQuarterCalculated,
  updateCompanyParameters,
  updateCompanyStatus,
} from '../services/companies';
import {
  upsertJobFamilyVariables,
  type JobFamilyVariableInput,
} from '../services/companyJobFamilies';
import { insertTransferLogEntry } from '../services/responsavelFinanceiroTransferLog';
import { provisionInitialPassword } from '../services/credentialProvisioning';

import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// ME-075 — mensagens canonicas bit-exact `updateJobFamilies`
// ============================================================

/**
 * §DOC 05 §13.1 Aba 2 (mockup linha 427) — soma dos pesos das 4 variaveis
 * de uma familia deve totalizar exatamente 100%. Mensagem canonica bit-
 * exact analogica ao padrao §2.3 do DOC 03.
 */
export const MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA =
  'A soma dos pesos das 4 variáveis desta família deve totalizar 100%.' as const;

/**
 * §DOC 01 §12.2 (`variableIndex` INT 0 a 3) — o array de 4 variaveis deve
 * cobrir bit-exact os indices {0,1,2,3} sem repeticoes nem lacunas.
 */
export const MSG_JOB_FAMILY_INDICES_INVALIDOS =
  'As 4 variáveis devem cobrir os índices 0, 1, 2 e 3 (sem lacunas ou repetições).' as const;

/**
 * §DOC 05 §13.1 Aba 2 (mockup linha 352) — familia 6 `lideranca_gestao`
 * (`estrutural:true`) tem nomes e unidades FIXOS. Valores hard-coded
 * canonicos bit-exact abaixo. O peso permanece livre (mockup mantem input
 * de peso editavel para todas as familias).
 */
export const LIDERANCA_GESTAO_VAR_NAMES = [
  'Organização e produtividade',
  'Responsabilização pelos resultados',
  'Gestão da equipe',
  'Motivação e engajamento',
] as const;

/** §DOC 05 §13.1 Aba 2 (mockup linha 352) — unidades fixas familia 6. */
export const LIDERANCA_GESTAO_VAR_UNITS = [
  'pontos (1-5)',
  'pontos (1-5)',
  'pontos (1-5)',
  'pontos (1-5)',
] as const;

/** Schema canonico bit-exact de UMA variavel de job family. */
export const JOB_FAMILY_VARIABLE_INPUT_SCHEMA = z.object({
  variableIndex: z.number().int().min(0).max(3),
  variableName: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(50),
  weight: z.number().min(0).max(100),
});

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
  /**
   * ME-080b Dispatch 2b — senha inicial provisionada quando o novo
   * titular RF e um employee sem `passwordHash` (RF exige acesso ao
   * painel). C-level ja tem senha desde o create; presente aqui apenas
   * no cenario employee-sem-senha. `null` nos demais casos.
   */
  senhaInicial: string | null;
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

/**
 * ME-075 canonica bit-exact — hook fire-and-forget canonico bit-exact
 * §DOC 03 §3.9 (S499). Chamado apos COMMIT bem-sucedido de
 * `updateParameters` **quando qualquer `metaROI*` altera**. Assinatura
 * canonica: recebe `(companyId, nivelHierarquico?)` — o motor real
 * dispara `triggerRetroactiveRecalculation`. Default no-op documentado;
 * wire-up completo com o motor `quarterlyCalculation` acontecera na
 * ME-Primeiro-Cliente (ou ME futura que consolide o Bloco B6).
 */
export type EmitMetaROIChangedHook = (
  companyId: number,
  nivelHierarquico?: 'operacional' | 'tatico' | 'estrategico',
) => Promise<void>;

/** No-op canonico de metaROI changed — motor real virá em ME futura. */
export const DEFAULT_META_ROI_CHANGED_HOOK: EmitMetaROIChangedHook = async () => {
  // Motor `quarterlyCalculation.triggerRetroactiveRecalculation` sera
  // wire-up completo na ME-Primeiro-Cliente; padrao S499 bit-exact.
};

/** Dependencias injetaveis do sub-router. */
export interface CompanyRouterDeps {
  emitD050?: EmitD050Facade;
  emitMetaROIChanged?: EmitMetaROIChangedHook;
  now?: () => Date;
}

/** DI default: hooks no-op + relogio real. */
export const DEFAULT_COMPANY_ROUTER_DEPS: Required<CompanyRouterDeps> = {
  emitD050: DEFAULT_D050_HOOK,
  emitMetaROIChanged: DEFAULT_META_ROI_CHANGED_HOOK,
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

/**
 * ME-075 canonica bit-exact — extrai errno canonico bit-exact do MySQL2
 * caminhando a cadeia `err → err.cause → ...` ate profundidade 5. Retorna
 * `null` se nao encontrar errno numerico. Consumido pelo handler canonico
 * bit-exact de `updateParameters` para converter ER_DUP_ENTRY em CONFLICT.
 */
export function extractMysqlErrnoFromError(err: unknown): number | null {
  let node: unknown = err;
  for (let i = 0; i < 5 && node !== null && node !== undefined; i += 1) {
    const n = node as { errno?: number; code?: string; cause?: unknown };
    if (typeof n.errno === 'number') {
      return n.errno;
    }
    if (n.code === 'ER_DUP_ENTRY') {
      return MYSQL_ERR_DUP_ENTRY_RF;
    }
    node = n.cause;
  }
  return null;
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
  const emitMetaROIChanged = deps.emitMetaROIChanged ?? DEFAULT_META_ROI_CHANGED_HOOK;
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
            // ME-080b Dispatch 2b — se novo titular e employee e nao tem
            // passwordHash, provisiona senha inicial no mesmo UPDATE
            // (RF exige acesso ao painel; e-mail+senha canonica).
            // C-level ja tem senha desde o create (cLevelMembers.create
            // Dispatch 2b sempre provisiona). Se employee ja tem senha
            // (foi Lider ou RH antes), preserva a senha atual.
            let senhaInicialProvisionada: string | null = null;
            if (input.newHolderType === 'employee') {
              const employeeRow = await tx
                .select({ passwordHash: employees.passwordHash })
                .from(employees)
                .where(eq(employees.id, input.newHolderId))
                .limit(1);
              const naoTemSenha =
                employeeRow[0]?.passwordHash === null || employeeRow[0]?.passwordHash === '';
              const patchEmp: Partial<typeof employees.$inferInsert> = {
                isResponsavelFinanceiro: true,
              };
              if (naoTemSenha) {
                const { plain, hash } = await provisionInitialPassword();
                patchEmp.passwordHash = hash;
                patchEmp.passwordSet = false;
                senhaInicialProvisionada = plain;
              }
              await tx.update(employees).set(patchEmp).where(eq(employees.id, input.newHolderId));
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
              senhaInicial: senhaInicialProvisionada,
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

    // --------------------------------------------------------
    // company.create — Bruno EXCLUSIVO (ME-Rota-C-D074, D074 FECHADA)
    // --------------------------------------------------------
    // Origem canonica:
    // - DOC 05 §5.3 (botao [+ Cadastrar nova empresa]) + §13.1 (Aba 1
    //   Parametros gerais — save unico das 9 secoes canonicas) +
    //   §18.7 (mensagens canonicas literais bit-exact).
    // - DOC 01 §4.2 (tabela companies — 35 colunas canonicas bit-exact).
    // - RV-08: zero decisoes Manus — Zod schema + `normalizeCreateCompanyInput`
    //   pre-decidem toda validacao canonica bit-exact (§13.1 linhas 1490-1497).
    // - RV-12: 100% Drizzle tipado — sem SQL cru.
    // - RV-13: chamador da procedure = `NovaEmpresaClient.tsx` via
    //   `criarEmpresaAction` (server action) + `companyCreate.test.ts`.
    //
    // Ordem canonica bit-exact:
    // 1. `roleProcedure(['super_admin'])` — Bruno EXCLUSIVO (§DOC 02 §10.3).
    // 2. Parse Zod (§18.7 mensagens literais bit-exact).
    // 3. Normalizacao canonica bit-exact (§DOC 01 §4.2 linha 180 — modo
    //    padrao forca mesInicioAnoFiscal=1 + mesKickoff∈{1,4,7,10};
    //    status FORCADO='inativa').
    // 4. INSERT via Drizzle tipado. Colisao de CNPJ (unique constraint):
    //    catch canonico bit-exact ER_DUP_ENTRY → TRPCError CONFLICT com
    //    mensagem canonica bit-exact MSG_CNPJ_DUPLICADO.
    // 5. Retorno canonico bit-exact `{ companyId: number }` para o cliente
    //    fazer o redirect §5.4 DOC 05.
    create: roleProcedure(['super_admin'])
      .input(CreateCompanyInputSchema)
      .mutation(async ({ ctx, input }): Promise<{ companyId: number }> => {
        // (1) Normalizacao canonica bit-exact §DOC 01 §4.2 (linha 180).
        // Aplica as regras server-side FORCE: modo padrao + status inativa.
        let normalized;
        try {
          normalized = normalizeCreateCompanyInput(input);
        } catch (err) {
          if (err instanceof CreateCompanyValidationError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.canonicalMessage });
          }
          throw err;
        }

        // (2) INSERT canonico bit-exact via helper puro (§RV-12/§RV-13).
        // Colisao de CNPJ (unique constraint bit-exact §4.2) capturada
        // canonicamente bit-exact e convertida em TRPCError CONFLICT.
        try {
          return await executeCreateCompany(ctx.db, normalized);
        } catch (err) {
          if (err instanceof CnpjDuplicateError) {
            throw new TRPCError({ code: 'CONFLICT', message: err.canonicalMessage });
          }
          throw err;
        }
      }),

    // --------------------------------------------------------
    // ME-075 — company.getById (D086)
    // --------------------------------------------------------
    // Retorna o registro completo canonico bit-exact da empresa para
    // popular o form de edicao §13.1 DOC 05. `roleProcedure(['super_admin'])`
    // — apenas Bruno acessa cadastro de empresa (§10.9 + §12 CAMADA_AUTH).
    getById: roleProcedure(['super_admin'])
      .input(z.object({ companyId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const rows = await ctx.db
          .select()
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        const row = rows[0];
        if (row === undefined) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }
        return row;
      }),

    // --------------------------------------------------------
    // ME-075 — company.updateParameters (D086)
    // --------------------------------------------------------
    // §13.1 DOC 05 (Aba 1) + §3.9 DOC 03 (retroatividade assimetrica) +
    // §16 DOC 03 (cadastros). UPDATE atomico de todos os campos exceto
    // `status`/`isDemo`/`id`/`createdAt`/`updatedAt`. Valida imutabilidade
    // pos-primeiro-trimestre §13.1 linha 1506 e dispara hook
    // `emitMetaROIChanged` fire-and-forget (S499) quando qualquer
    // `metaROI*` altera.
    updateParameters: roleProcedure(['super_admin'])
      .input(UpdateCompanyParametersInputSchema)
      .mutation(async ({ ctx, input }): Promise<{ updated: boolean }> => {
        // (1) Existencia da empresa + snapshot canonico bit-exact dos
        //     valores atuais para a validacao de imutabilidade + o
        //     predicado de retroatividade.
        const current = await getCompanyForUpdate(ctx.db, input.companyId);
        if (current === undefined) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }

        // (2) Predicado canonico bit-exact §13.1 linha 1506 — se ha
        //     algum trimestre calculado, valida imutabilidade dos 4
        //     campos de ano fiscal + kick-off.
        const locked = await hasFirstQuarterCalculated(ctx.db, input.companyId);
        try {
          assertAnoFiscalImmutabilityWhenLocked(
            locked,
            {
              modoAnoFiscal: current.modoAnoFiscal,
              mesInicioAnoFiscal: current.mesInicioAnoFiscal,
              mesKickoff: current.mesKickoff,
              kickoffDate: current.kickoffDate,
            },
            {
              modoAnoFiscal: input.modoAnoFiscal,
              mesInicioAnoFiscal: input.mesInicioAnoFiscal,
              mesKickoff: input.mesKickoff,
              kickoffDate: input.kickoffDate,
            },
          );
        } catch (err) {
          if (err instanceof UpdateCompanyValidationError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.canonicalMessage });
          }
          throw err;
        }

        // (3) Normalizacao canonica bit-exact (assertModoPadraoConstraints
        //     + conversao kickoffDate string → Date + optional → null).
        let normalized: NormalizedUpdate;
        try {
          normalized = normalizeUpdateCompanyParametersInput(input);
        } catch (err) {
          if (err instanceof UpdateCompanyValidationError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.canonicalMessage });
          }
          throw err;
        }

        // (4) UPDATE tipado via service (RV-12/RV-13). Colisao de CNPJ
        //     (unique constraint bit-exact §4.2) tratada da mesma forma
        //     canonica bit-exact que `create`.
        try {
          const affected = await updateCompanyParameters(ctx.db, input.companyId, normalized);
          if (affected === 0) {
            // Empresa desapareceu entre o SELECT e o UPDATE (race
            // patologica improvavel). Retorno canonico bit-exact NOT_FOUND.
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: MSG_COMPANY_NAO_ENCONTRADA_RF,
            });
          }
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          const errno = extractMysqlErrnoFromError(err);
          if (errno === MYSQL_ERR_DUP_ENTRY_RF) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'CNPJ já cadastrado na plataforma. Entre em contato com o suporte se necessário.',
            });
          }
          throw err;
        }

        // (5) §3.9 canonica bit-exact — dispara hook fire-and-forget
        //     `emitMetaROIChanged` (S499) se qualquer `metaROI*` alterou.
        //     Wire-up completo ficara em ME-Primeiro-Cliente.
        const changed = hasAnyMetaROIChanged(
          {
            metaROIOperacional: current.metaROIOperacional,
            metaROITatico: current.metaROITatico,
            metaROIEstrategico: current.metaROIEstrategico,
          },
          {
            metaROIOperacional: normalized.metaROIOperacional,
            metaROITatico: normalized.metaROITatico,
            metaROIEstrategico: normalized.metaROIEstrategico,
          },
        );
        if (changed) {
          // Fire-and-forget canonico bit-exact — falhas do hook nao
          // reverterao o UPDATE. Log ficara em ME futura de observability.
          void emitMetaROIChanged(input.companyId);
        }

        // Consumo do relogio canonico bit-exact (mantido para paridade
        // com `setResponsavelFinanceiro`; RV-13 satisfeita por leitura).
        void now();

        return { updated: true };
      }),

    // --------------------------------------------------------
    // ME-075 — company.setStatus (D086)
    // --------------------------------------------------------
    // §12 CAMADA_AUTH ("Ativar/inativar empresa (companies.setStatus)")
    // + §19.8 DOC 06 (encarregado LGPD obrigatorio antes de ativar).
    // Toggle canonico bit-exact ativa/inativa. Validacao LGPD roda
    // apenas no ramo `inativa → ativa`.
    setStatus: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          novoStatus: z.enum(['ativa', 'inativa']),
        }),
      )
      .mutation(async ({ ctx, input }): Promise<{ status: 'ativa' | 'inativa' }> => {
        // (1) Existencia da empresa.
        const rows = await ctx.db
          .select({
            id: companies.id,
            status: companies.status,
            encarregadoLgpdNome: companies.encarregadoLgpdNome,
            encarregadoLgpdEmail: companies.encarregadoLgpdEmail,
          })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        const current = rows[0];
        if (current === undefined) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }

        // (2) Idempotencia canonica: novoStatus === atual → no-op OK.
        if (current.status === input.novoStatus) {
          return { status: current.status };
        }

        // (3) §DOC 06 §19.8 — validacao LGPD apenas no ramo `ativa`.
        if (input.novoStatus === 'ativa') {
          if (current.encarregadoLgpdNome === null || current.encarregadoLgpdNome.trim() === '') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_LGPD_NOME_VAZIO,
            });
          }
          if (current.encarregadoLgpdEmail === null || current.encarregadoLgpdEmail.trim() === '') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_LGPD_EMAIL_VAZIO,
            });
          }
        }

        // (4) UPDATE tipado via service.
        const affected = await updateCompanyStatus(ctx.db, input.companyId, input.novoStatus);
        if (affected === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }
        return { status: input.novoStatus };
      }),

    // --------------------------------------------------------
    // ME-075 — company.updateJobFamilies (D086)
    // --------------------------------------------------------
    // §13.1 Aba 2 DOC 05 + §12.2 DOC 01. UPSERT das 4 variaveis de UMA
    // job family (save por familia — §13.1 mockup linha 399). Validacao
    // canonica bit-exact: soma pesos = 100; familia 6 nomes/unidades
    // preservados server-side conforme mockup linha 352 (`estrutural:true`).
    updateJobFamilies: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          jobFamily: z.enum(JOB_FAMILY_VALUES),
          variables: z.array(JOB_FAMILY_VARIABLE_INPUT_SCHEMA).length(4),
        }),
      )
      .mutation(async ({ ctx, input }): Promise<{ upserted: number }> => {
        // (1) Existencia da empresa.
        const rows = await ctx.db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (rows[0] === undefined) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_COMPANY_NAO_ENCONTRADA_RF,
          });
        }

        // (2) Guard canonico: os 4 variableIndex sao {0,1,2,3} em ordem.
        const indices = input.variables.map((v) => v.variableIndex).sort((a, b) => a - b);
        if (indices[0] !== 0 || indices[1] !== 1 || indices[2] !== 2 || indices[3] !== 3) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_JOB_FAMILY_INDICES_INVALIDOS,
          });
        }

        // (3) Soma dos pesos = 100 (mockup linha 427 canonico bit-exact).
        //     Tolerancia canonica bit-exact 0.01 para arredondamentos.
        const sum = input.variables.reduce((acc, v) => acc + v.weight, 0);
        if (Math.abs(sum - 100) > 0.01) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA,
          });
        }

        // (4) Actor canonico (Bruno super_admin).
        if (ctx.user.role !== 'super_admin') {
          // Inalcancavel — roleProcedure ja garantiu.
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_RF });
        }
        const updatedBy = ctx.user.superAdminId;

        // (5) UPSERT canonico bit-exact via service (pre-decisao 1
        //     `.onDuplicateKeyUpdate()`). Familia 6 (`lideranca_gestao`)
        //     tem `estrutural:true` no mockup linha 352 — nomes e unidades
        //     sao ignorados server-side em favor dos hard-coded (canonico
        //     bit-exact §13.1 Aba 2). O peso permanece livre.
        const finalVars: JobFamilyVariableInput[] =
          input.jobFamily === 'lideranca_gestao'
            ? input.variables.map((v) => ({
                variableIndex: v.variableIndex,
                variableName: LIDERANCA_GESTAO_VAR_NAMES[v.variableIndex as 0 | 1 | 2 | 3],
                unit: LIDERANCA_GESTAO_VAR_UNITS[v.variableIndex as 0 | 1 | 2 | 3],
                weight: v.weight,
              }))
            : input.variables;

        await upsertJobFamilyVariables(
          ctx.db,
          input.companyId,
          input.jobFamily,
          finalVars,
          updatedBy,
        );
        return { upserted: finalVars.length };
      }),
  });
}

/** Tipo canonico do sub-router. */
export type CompanyRouter = ReturnType<typeof createCompanyRouter>;
