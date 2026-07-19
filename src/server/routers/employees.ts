// ROIP APP 9BOX — sub-router `employees` (ME-043).
//
// Primeira superficie tRPC de ESCRITA canonica sobre a tabela `employees`
// (DOC 01 §4.5). Cobre 5 das 8 procs canonicas do §16.7 do DOC 03:
//
//   - `employees.create`      — RH + Bruno. Transacao atomica: INSERT
//     `employees` + INSERT `individualProfilePlaceholders`
//     (userType='employee', status='pendente' — §10.12); INSERT em
//     `employeeLeaderHistory` quando `liderInicialId` informado.
//   - `employees.update`      — RH + Bruno. Atualiza campos permitidos.
//     Toggle `isRH` restrito a Bruno (DOC 02 §12); toggle `isLider` RH +
//     Bruno; toggle `isResponsavelFinanceiro` REJEITADO integralmente
//     nesta ME (S127 — nomeacao/transferencia RF vive em
//     `company.setResponsavelFinanceiro` na ME-044).
//   - `employees.inactivate`  — RH + Bruno. `motivoSaida` obrigatorio
//     (§12.6). Bloqueios canonicos: RF sem substituto (§5.6); lider com
//     liderados ativos (S126 — bloqueio R1 transitorio ate ME-045 M2 v2).
//     Transacao atomica: UPDATE `status='inativo'` + INSERT
//     `employeeTerminationEvents` (snapshots §12.6) + CLOSE do vinculo
//     ativo em `employeeLeaderHistory` (`dataFim=now`).
//   - `employees.reactivate`  — RH + Bruno. UPDATE `status='ativo'`.
//     INSERT novo `employeeLeaderHistory` quando `novoLiderId` informado.
//   - `employees.delete`      — Bruno EXCLUSIVO (§16.4, DOC 02 §12).
//     Deleta apenas se `status='inativo'` E sem historico analitico E
//     nao e RF. Transacao: DELETE do placeholder + DELETE das metas +
//     DELETE do colaborador. Erros de FK residuais convertidos em
//     CONFLICT canonico (salvaguarda).
//
// Fora do escopo (S127 — comando de abertura ME-043):
//   - Ativacao/transferencia de Responsavel financeiro (§5.4/§5.5).
//     `isResponsavelFinanceiro` NAO e campo permitido em `create` nem em
//     `update`; input com `true` sobe BAD_REQUEST canonico.
//   - Alerta D050 (§5.9) — nao dispara aqui porque o gatilho canonico e
//     `company.setResponsavelFinanceiro` (ME-044), nao o `create`.
//
// Convencoes canonicas herdadas de ME-036/ME-039/ME-042:
//   - Guards de perfil por `roleProcedure` (S034); guard cruzado de
//     `companyId` no handler (§2.4) — Super Admin atravessa (§2.4).
//   - Zod integral do input; CPF normalizado (S125 — 11 digitos apos
//     `stripNonDigits`; sem algoritmo canonico dos DVs por omissao do
//     DOC 03 §16); mensagens canonicas literais exportadas para asserts
//     verbatim nos testes (padrao S073/S091).
//   - Transacoes 100% Drizzle tipado (RV-12 + L54) — sem execucao crua
//     de instrucoes SQL, sem template literal de query bruta.
//   - Sem code dead (RV-13) — cada export tem chamador nesta ME (o
//     router e chamado no appRouter; helpers sao consumidos pelas procs;
//     constantes e tipos sao consumidos pelos testes).
//   - Uma statement por linha (RV-14).

import { TRPCError } from '@trpc/server';
import { and, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import type { NivelHierarquico } from '../../db/schema';
import {
  DEPARTAMENTO_VALUES,
  JOB_FAMILY_VALUES,
  MOTIVO_TERMINATION_VALUES,
  NIVEL_HIERARQUICO_VALUES,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
  instrumentA_responses,
  instrumentC_assessments,
  performanceData,
  plenitudeData,
} from '../../db/schema';

import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** §4.5 — CPF em MySQL e VARCHAR(11); armazenamos apenas digitos. */
export const CPF_LENGTH = 11 as const;

/** §4.5 — VARCHAR(255) canonico do nome. */
export const NAME_MAX_LENGTH = 255 as const;

/** §4.5 — VARCHAR(255) canonico do e-mail. */
export const EMAIL_MAX_LENGTH = 255 as const;

/** §4.5 — VARCHAR(10) canonico do codigo CBO. */
export const CBO_MAX_LENGTH = 10 as const;

/** §4.5 — VARCHAR(255) canonico da descricao CBO. */
export const DESCRICAO_CBO_MAX_LENGTH = 255 as const;

/** §4.5 — VARCHAR(500) canonico da photoUrl. */
export const PHOTO_URL_MAX_LENGTH = 500 as const;

/**
 * §4.6 — VARCHAR(500) do `reason` de `employeeLeaderHistory`. No cadastro
 * inicial (ME-043) o vinculo NAO e uma transferencia §14 — o reason
 * canonico curto e literal abaixo, distinto do padrao 100-500 (§2) que
 * so se aplica a transferencia (D047, M2 v2 §14.7).
 */
export const REASON_CADASTRO_INICIAL = 'Cadastro inicial do colaborador' as const;

/**
 * §4.6 — reason canonico da reativacao (novo vinculo pos-reativacao).
 * Analogo ao `REASON_CADASTRO_INICIAL`; distinto do padrao 100-500.
 */
export const REASON_REATIVACAO = 'Reativacao do colaborador' as const;

// ============================================================
// Mensagens canonicas literais (testadas verbatim — padrao S073/S091)
// ============================================================

/** §2.4 guard cruzado companyId — Super Admin atravessa, demais restritos. */
export const MSG_COMPANY_MISMATCH_EMP = 'Colaborador nao pertence a sua empresa.' as const;

/** §4.5 — colaborador nao encontrado pelo id (soft NOT_FOUND canonico). */
export const MSG_EMPLOYEE_NAO_ENCONTRADO = 'Colaborador nao encontrado.' as const;

/** §4.5 — CPF ja existe na mesma empresa (uq_employee_cpf). */
export const MSG_CPF_DUPLICADO =
  'Ja existe colaborador cadastrado com este CPF nesta empresa.' as const;

/** §16.4 — deletar colaborador ativo e proibido; inative primeiro. */
export const MSG_DELETE_COLABORADOR_ATIVO =
  'Colaborador ativo nao pode ser deletado. Inative antes.' as const;

/** §16.4 — deletar colaborador com historico analitico e proibido. */
export const MSG_DELETE_COM_HISTORICO =
  'Colaborador possui dados historicos. Deletar nao e permitido; mantenha inativo.' as const;

/**
 * §16.4 (literal do DOC 03 §16.4 quinta linha) — RF nao pode ser deletado
 * em qualquer condicao. Reproducao literal, sem cedilha do texto
 * canonico ("possivel excluir").
 */
export const MSG_DELETE_RF_BLOQUEADO =
  'Nao e possivel excluir o Responsavel financeiro. Transfira o papel antes de excluir.' as const;

/**
 * §5.6 (literal) — inativar colaborador com `isResponsavelFinanceiro=true`
 * exibe modal bloqueador com este texto exato. Mensagem reproducao
 * literal do §5.6 primeira nota. Autoridade canonica: DOC 03 §5.6.
 */
export const MSG_INACTIVATE_RF_BLOQUEADO =
  'Este colaborador e o Responsavel financeiro da empresa. Antes de inativar, ' +
  'atribua o papel de Responsavel financeiro a outro colaborador.';

/**
 * S126 — mensagem transitoria R1 (comando de abertura ME-043).
 *
 * O DOC 03 §16.3 canoniza que a inativacao de lider com liderados ativos
 * ACIONA o fluxo M2 v2 (§14). Como o fluxo M2 v2 vive na ME-045
 * (`leadershipTransfer.execute` + procs auxiliares §14.12) e ainda nao
 * existe no repositorio, esta ME retorna CONFLICT com o texto literal
 * abaixo — bloqueio conservador declarado no R1 do plano. A ME-045
 * substitui a chamada por invocacao do fluxo transacional canonico e
 * esta constante torna-se dead code (removida na mesma ME junto com o
 * respectivo teste). NAO exportar de outro modulo.
 */
export const MSG_LIDER_COM_LIDERADOS_R1_TRANSITORIA =
  'Este colaborador possui liderados ativos. Transfira a lideranca antes de inativar.' as const;

/**
 * §12.6 — motivoSaida obrigatorio para colaborador comum. Mensagem
 * canonica exata literal §12.6 segunda nota.
 */
export const MSG_MOTIVO_SAIDA_OBRIGATORIO =
  'Selecione o motivo de saida (voluntario ou involuntario) antes de confirmar a inativacao.';

/**
 * S127 — toggle RF fora da ME-043. Input com
 * `isResponsavelFinanceiro=true` sobe BAD_REQUEST com esta mensagem.
 * Aponta o consumidor canonico da ME-044.
 */
export const MSG_TOGGLE_RF_FORA_ESCOPO =
  'Alteracao de Responsavel financeiro nao e permitida por esta rota; ' +
  'use company.setResponsavelFinanceiro.';

/**
 * §12 DOC 02 — ativar `isRH` de colaborador e Bruno exclusivo. RH nao
 * pode ativar `isRH` de outro colaborador. Mensagem exposta para o
 * teste asseriar o guard literal.
 */
export const MSG_ISRH_APENAS_BRUNO = 'Apenas o Super Admin pode alterar o acesso como RH.' as const;

/**
 * §4.5 — colaborador ja esta inativo (pre-condicao violada em `inactivate`
 * ou `delete`).
 */
export const MSG_JA_INATIVO = 'Colaborador ja esta inativo.' as const;

/**
 * §4.5 — colaborador ja esta ativo (pre-condicao violada em `reactivate`).
 */
export const MSG_JA_ATIVO = 'Colaborador ja esta ativo.' as const;

/**
 * §4.5 — o novo lider informado no `reactivate` (ou no `create`) nao
 * pertence a mesma empresa OU nao e lider ativo.
 */
export const MSG_LIDER_INICIAL_INVALIDO =
  'Lider informado nao existe, nao pertence a esta empresa ou nao esta ativo.' as const;

// ============================================================
// Codigos MySQL usados como salvaguarda de conversao para TRPCError
// ============================================================

/** MySQL2 errno canonico para duplicidade de UNIQUE (uq_employee_cpf). */
export const MYSQL_ERR_DUP_ENTRY = 1062 as const;

/**
 * MySQL2 errno canonico para violacao de FK ON DELETE RESTRICT residual
 * (salvaguarda do `delete` — L18 exemplifica que o chamador nao deve
 * confiar em pre-check exaustivo, especialmente em concorrencia).
 */
export const MYSQL_ERR_ROW_IS_REFERENCED = 1451 as const;

// ============================================================
// Schemas Zod canonicos (RV-12 + validacao completa por API)
// ============================================================

const cpfSchemaBase = z
  .string()
  .transform((v) => v.replace(/\D+/g, ''))
  .refine((v) => v.length === CPF_LENGTH, {
    message: 'CPF deve ter 11 digitos apos normalizacao.',
  });

/** §4.5 — CPF canonico normalizado para 11 digitos (S125 superficial). */
export const CPF_SCHEMA_EMP = cpfSchemaBase;

const emailSchema = z.string().email({ message: 'E-mail invalido.' }).max(EMAIL_MAX_LENGTH);

const dateFieldSchema = z.union([z.date(), z.string().transform((v) => new Date(v))]);

/**
 * §4.5 — input canonico de `employees.create`. `isResponsavelFinanceiro`
 * e explicitamente ausente do schema — nao ha caminho para ativa-lo por
 * esta rota (S127). `isRH` opcional (default false); a autorizacao
 * (Bruno-exclusivo para ativar) e validada no handler.
 */
export const CREATE_EMPLOYEE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  cpf: CPF_SCHEMA_EMP,
  email: emailSchema.optional(),
  photoUrl: z.string().url().max(PHOTO_URL_MAX_LENGTH).optional(),
  dataNascimento: dateFieldSchema,
  dataAdmissao: dateFieldSchema,
  cbo: z.string().min(1).max(CBO_MAX_LENGTH),
  descricaoCBO: z.string().min(1).max(DESCRICAO_CBO_MAX_LENGTH),
  jobFamily: z.enum(JOB_FAMILY_VALUES),
  senioridade: z.enum(['junior', 'pleno', 'senior']),
  nivelHierarquico: z.enum(NIVEL_HIERARQUICO_VALUES),
  departamento: z.enum(DEPARTAMENTO_VALUES),
  isRH: z.boolean().optional(),
  isLider: z.boolean().optional(),
  liderInicialId: z.number().int().positive().optional(),
});

/**
 * §4.5 — input canonico de `employees.update`. Campos permitidos apenas.
 * `status`, `isResponsavelFinanceiro`, `onboardingEstagio`, `passwordHash`
 * e `passwordSet` NAO aparecem — cada um tem canal proprio (inactivate/
 * reactivate para status; setResponsavelFinanceiro ME-044 para RF;
 * onboarding em ME futura; setters de credencial em `auth.*`).
 */
export const UPDATE_EMPLOYEE_INPUT_SCHEMA = z
  .object({
    employeeId: z.number().int().positive(),
    name: z.string().min(1).max(NAME_MAX_LENGTH).optional(),
    email: emailSchema.optional(),
    photoUrl: z.string().url().max(PHOTO_URL_MAX_LENGTH).optional(),
    dataNascimento: dateFieldSchema.optional(),
    cbo: z.string().min(1).max(CBO_MAX_LENGTH).optional(),
    descricaoCBO: z.string().min(1).max(DESCRICAO_CBO_MAX_LENGTH).optional(),
    jobFamily: z.enum(JOB_FAMILY_VALUES).optional(),
    senioridade: z.enum(['junior', 'pleno', 'senior']).optional(),
    nivelHierarquico: z.enum(NIVEL_HIERARQUICO_VALUES).optional(),
    departamento: z.enum(DEPARTAMENTO_VALUES).optional(),
    isRH: z.boolean().optional(),
    isLider: z.boolean().optional(),
  })
  .refine(
    (v) => {
      const keys = Object.keys(v) as Array<keyof typeof v>;
      return keys.some((k) => k !== 'employeeId' && v[k] !== undefined);
    },
    { message: 'Informe ao menos um campo a atualizar.' },
  );

/** §12.6 — input de `employees.inactivate` com `motivoSaida` obrigatorio. */
export const INACTIVATE_EMPLOYEE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
  motivoSaida: z.enum(MOTIVO_TERMINATION_VALUES),
});

/** §4.5 — input de `employees.reactivate`. `novoLiderId` opcional. */
export const REACTIVATE_EMPLOYEE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
  novoLiderId: z.number().int().positive().optional(),
});

/** §16.4 — input de `employees.delete`. */
export const DELETE_EMPLOYEE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/** Retorno canonico do `create` — id do novo colaborador. */
export interface CreateEmployeeResult {
  employeeId: number;
  placeholderId: number;
  leaderHistoryId: number | null;
}

/** Retorno canonico do `update` — quantas linhas foram afetadas. */
export interface UpdateEmployeeResult {
  employeeId: number;
  affected: number;
}

/** Retorno canonico do `inactivate` — id do evento append-only. */
export interface InactivateEmployeeResult {
  employeeId: number;
  terminationEventId: number;
  leaderHistoryClosedId: number | null;
}

/** Retorno canonico do `reactivate`. */
export interface ReactivateEmployeeResult {
  employeeId: number;
  leaderHistoryId: number | null;
}

/** Retorno canonico do `delete`. */
export interface DeleteEmployeeResult {
  employeeId: number;
  deleted: boolean;
}

// ============================================================
// Dependencias injetaveis (DI factory — padrao S100/S084)
// ============================================================

/**
 * Dependencias do sub-router `employees`. `now` injetavel para testes
 * deterministicos das transacoes atomicas (dataInativacao, dataFim,
 * dataInicio do vinculo). Sem hook de motor: o Perfil Individual §10.12
 * e criado DIRETAMENTE nas transacoes de `create` (INSERT canonico),
 * nao via DI — o motor de assessment do §10 (ME-049a) NAO consome
 * hook aqui, apenas le `individualProfilePlaceholders`.
 */
export interface EmployeesRouterDeps {
  now?: () => Date;
}

/** DI default: relogio real. */
export const DEFAULT_EMPLOYEES_ROUTER_DEPS: Required<EmployeesRouterDeps> = {
  now: () => new Date(),
};

// ============================================================
// Helpers internos (chamados pelas procs — RV-13)
// ============================================================

/**
 * §2.4 — guard cruzado: super_admin atravessa; demais roles restritos ao
 * proprio `companyId` do JWT. Lanca FORBIDDEN quando ha mismatch.
 */
export function assertCompanyScope(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
  }
}

/**
 * §12 DOC 02 — ativar/desativar `isRH` e Bruno exclusivo. Quando o
 * caller RH tenta trocar `isRH`, sobe FORBIDDEN canonico.
 */
export function assertCanChangeIsRH(user: AuthenticatedUser): void {
  if (user.role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_ISRH_APENAS_BRUNO });
  }
}

/**
 * §4.5 — retorna o `actorTipo`/`actorId` canonico do
 * `employeeTerminationEvents` a partir do usuario autenticado. Bruno
 * cai em `superAdmin`; RH/RH-Lider caem em `employee` (o `userId` do
 * token e o id em `employees` — DOC 02 §2.4). O schema
 * `employeeTerminationEvents.actorTipo` so aceita esses dois valores
 * (enum `['employee','superAdmin']`).
 */
export function resolveActorForTermination(user: AuthenticatedUser): {
  actorTipo: 'employee' | 'superAdmin';
  actorId: number;
} {
  if (user.role === 'super_admin') {
    return { actorTipo: 'superAdmin', actorId: user.superAdminId };
  }
  return { actorTipo: 'employee', actorId: user.userId };
}

/**
 * §4.5 — verifica se ha algum liderado ATIVO cujo vinculo aberto
 * (`dataFim IS NULL`) aponta para este `employeeId` como `liderId`.
 * Retorna a contagem via `count(*)` tipado (RV-12; sem SQL cru).
 * Consumido pelo guard S126 do `inactivate`.
 */
export async function countActiveLiderados(db: RoipDatabase, employeeId: number): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employeeLeaderHistory.employeeId, employees.id))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, employeeId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.status, 'ativo'),
      ),
    );
  const row = rows[0];
  return row ? Number(row.n) : 0;
}

/**
 * §16.4 — verifica se o colaborador possui QUALQUER registro em tabelas
 * de historico analitico canonico. Definicao operacional para esta ME:
 * `employeeTerminationEvents` (algum evento de saida — reativado),
 * `performanceData` (algum dado mensal ja lancado), `plenitudeData`
 * (algum calculo do Eixo Y), `instrumentA_responses` (respondeu A),
 * `instrumentC_assessments` (foi avaliado C). Lista minima suficiente
 * para caracterizar "colaborador com dados historicos" no MVP; ampliavel
 * em ME futura sem quebrar contrato. Retorna `true` no primeiro achado
 * (curto-circuito).
 */
export async function hasHistoricoAnalitico(
  db: RoipDatabase,
  employeeId: number,
): Promise<boolean> {
  const checks = [
    db
      .select({ n: count() })
      .from(employeeTerminationEvents)
      .where(eq(employeeTerminationEvents.employeeId, employeeId)),
    db
      .select({ n: count() })
      .from(performanceData)
      .where(eq(performanceData.employeeId, employeeId)),
    db.select({ n: count() }).from(plenitudeData).where(eq(plenitudeData.employeeId, employeeId)),
    db
      .select({ n: count() })
      .from(instrumentA_responses)
      .where(eq(instrumentA_responses.employeeId, employeeId)),
    db
      .select({ n: count() })
      .from(instrumentC_assessments)
      .where(eq(instrumentC_assessments.employeeId, employeeId)),
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
 * §4.5 — valida que o `liderInicialId`/`novoLiderId` informado (a) existe,
 * (b) pertence a mesma empresa, (c) esta ativo e (d) e lider (`isLider=
 * true`). Retorna a linha ou lanca BAD_REQUEST canonico.
 */
export async function assertLiderAtivoDaEmpresa(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
): Promise<void> {
  const rows = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      status: employees.status,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(eq(employees.id, liderId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
  }
  if (row.companyId !== companyId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
  }
  if (row.status !== 'ativo') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
  }
  if (row.isLider !== true) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
  }
}

/**
 * Salvaguarda: converte errno do mysql2 em TRPCError canonico. Cobre
 * (a) UNIQUE duplicado no INSERT (`uq_employee_cpf`) → CONFLICT
 * `MSG_CPF_DUPLICADO`; (b) ROW REFERENCED no DELETE → CONFLICT
 * `MSG_DELETE_COM_HISTORICO`. Fallback: relanca o erro original.
 */
export function rethrowMysqlError(err: unknown): never {
  const chain: Array<{ errno?: number; code?: string }> = [];
  let node: unknown = err;
  for (let i = 0; i < 5 && node !== null && node !== undefined; i += 1) {
    const n = node as { errno?: number; code?: string; cause?: unknown };
    chain.push({ errno: n.errno, code: n.code });
    node = n.cause;
  }
  const dup = chain.find((n) => n.errno === MYSQL_ERR_DUP_ENTRY || n.code === 'ER_DUP_ENTRY');
  if (dup) {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_CPF_DUPLICADO });
  }
  const ref = chain.find(
    (n) => n.errno === MYSQL_ERR_ROW_IS_REFERENCED || n.code === 'ER_ROW_IS_REFERENCED_2',
  );
  if (ref) {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_COM_HISTORICO });
  }
  throw err as Error;
}

/**
 * §4.5 — mapeia o payload do `create` para o objeto de INSERT tipado do
 * Drizzle. Extraido em helper para clareza da procedure e reuso indireto
 * nos testes.
 */
export function buildEmployeeInsertPayload(
  input: z.infer<typeof CREATE_EMPLOYEE_INPUT_SCHEMA>,
): typeof employees.$inferInsert {
  return {
    companyId: input.companyId,
    name: input.name,
    cpf: input.cpf,
    email: input.email,
    photoUrl: input.photoUrl,
    dataNascimento: input.dataNascimento,
    dataAdmissao: input.dataAdmissao,
    cbo: input.cbo,
    descricaoCBO: input.descricaoCBO,
    jobFamily: input.jobFamily,
    senioridade: input.senioridade,
    nivelHierarquico: input.nivelHierarquico as NivelHierarquico,
    departamento: input.departamento,
    isRH: input.isRH ?? false,
    isLider: input.isLider ?? false,
    isResponsavelFinanceiro: false,
  };
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica de `employees` (S100/S084). Instanciada com
 * `DEFAULT_EMPLOYEES_ROUTER_DEPS` no `appRouter` (index.ts); os testes
 * injetam `now` explicito.
 */
export function createEmployeesRouter(deps: EmployeesRouterDeps = {}) {
  const { now } = { ...DEFAULT_EMPLOYEES_ROUTER_DEPS, ...deps };

  return router({
    // --------------------------------------------------------
    // employees.create — RH + Bruno
    // --------------------------------------------------------
    create: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(CREATE_EMPLOYEE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<CreateEmployeeResult> => {
        assertCompanyScope(ctx.user, input.companyId);
        // Ativar `isRH=true` durante o create e Bruno exclusivo (§12
        // DOC 02). RH cria colaboradores com `isRH=false` implicito ou
        // explicito. Sequer permitir true no input do RH e a regra.
        if (input.isRH === true) {
          assertCanChangeIsRH(ctx.user);
        }
        // §4.5 lider inicial: se informado, precisa ser lider ativo
        // da mesma empresa. Verifica ANTES da transacao para dar
        // BAD_REQUEST canonico sem consumir INSERTs.
        if (input.liderInicialId !== undefined) {
          await assertLiderAtivoDaEmpresa(ctx.db, input.companyId, input.liderInicialId);
        }

        try {
          return await ctx.db.transaction(async (tx) => {
            const payload = buildEmployeeInsertPayload(input);
            const [inserted] = await tx.insert(employees).values(payload).$returningId();
            if (!inserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em employees nao retornou id.',
              });
            }
            const employeeId = inserted.id;

            const [placeholderInserted] = await tx
              .insert(individualProfilePlaceholders)
              .values({
                companyId: input.companyId,
                userType: 'employee',
                userId: employeeId,
                status: 'pendente',
              })
              .$returningId();
            if (!placeholderInserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em individualProfilePlaceholders nao retornou id.',
              });
            }
            const placeholderId = placeholderInserted.id;

            let leaderHistoryId: number | null = null;
            if (input.liderInicialId !== undefined) {
              const dataInicio = new Date(now().toISOString().slice(0, 10));
              const [historyInserted] = await tx
                .insert(employeeLeaderHistory)
                .values({
                  employeeId,
                  liderId: input.liderInicialId,
                  clevelId: null,
                  dataInicio,
                  dataFim: null,
                  reason: REASON_CADASTRO_INICIAL,
                  transferBatchId: crypto.randomUUID(),
                })
                .$returningId();
              if (!historyInserted) {
                throw new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: 'INSERT em employeeLeaderHistory nao retornou id.',
                });
              }
              leaderHistoryId = historyInserted.id;
            }

            return { employeeId, placeholderId, leaderHistoryId };
          });
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          rethrowMysqlError(err);
        }
      }),

    // --------------------------------------------------------
    // employees.update — RH + Bruno
    // --------------------------------------------------------
    update: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(UPDATE_EMPLOYEE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UpdateEmployeeResult> => {
        const target = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO });
        }
        assertCompanyScope(ctx.user, row.companyId);

        if (input.isRH !== undefined && input.isRH !== row.isRH) {
          assertCanChangeIsRH(ctx.user);
        }

        const patch: Partial<typeof employees.$inferInsert> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.email !== undefined) patch.email = input.email;
        if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
        if (input.dataNascimento !== undefined) patch.dataNascimento = input.dataNascimento;
        if (input.cbo !== undefined) patch.cbo = input.cbo;
        if (input.descricaoCBO !== undefined) patch.descricaoCBO = input.descricaoCBO;
        if (input.jobFamily !== undefined) patch.jobFamily = input.jobFamily;
        if (input.senioridade !== undefined) patch.senioridade = input.senioridade;
        if (input.nivelHierarquico !== undefined) {
          patch.nivelHierarquico = input.nivelHierarquico as NivelHierarquico;
        }
        if (input.departamento !== undefined) patch.departamento = input.departamento;
        if (input.isRH !== undefined) patch.isRH = input.isRH;
        if (input.isLider !== undefined) patch.isLider = input.isLider;

        const [result] = await ctx.db
          .update(employees)
          .set(patch)
          .where(eq(employees.id, input.employeeId));
        return { employeeId: input.employeeId, affected: result.affectedRows };
      }),

    // --------------------------------------------------------
    // employees.inactivate — RH + Bruno
    // --------------------------------------------------------
    inactivate: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(INACTIVATE_EMPLOYEE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<InactivateEmployeeResult> => {
        const target = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO });
        }
        assertCompanyScope(ctx.user, row.companyId);
        if (row.status === 'inativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_JA_INATIVO });
        }
        if (row.isResponsavelFinanceiro === true) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_INACTIVATE_RF_BLOQUEADO });
        }
        if (row.isLider === true) {
          const liderados = await countActiveLiderados(ctx.db, input.employeeId);
          if (liderados > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: MSG_LIDER_COM_LIDERADOS_R1_TRANSITORIA,
            });
          }
        }

        const nowInstant = now();
        const actor = resolveActorForTermination(ctx.user);
        const departamentoSnapshot = row.departamento;
        const nivelSnapshot = row.nivelHierarquico;

        return await ctx.db.transaction(async (tx) => {
          const [updateResult] = await tx
            .update(employees)
            .set({ status: 'inativo' })
            .where(eq(employees.id, input.employeeId));
          if (updateResult.affectedRows !== 1) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'UPDATE employees affectedRows != 1.',
            });
          }

          const [terminationInserted] = await tx
            .insert(employeeTerminationEvents)
            .values({
              employeeId: input.employeeId,
              companyId: row.companyId,
              dataInativacao: nowInstant,
              motivo: input.motivoSaida,
              nivelHierarquicoSnapshot: nivelSnapshot,
              departamentoSnapshot,
              actorTipo: actor.actorTipo,
              actorId: actor.actorId,
            })
            .$returningId();
          if (!terminationInserted) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'INSERT em employeeTerminationEvents nao retornou id.',
            });
          }

          const activeHistory = await tx
            .select({ id: employeeLeaderHistory.id })
            .from(employeeLeaderHistory)
            .where(
              and(
                eq(employeeLeaderHistory.employeeId, input.employeeId),
                isNull(employeeLeaderHistory.dataFim),
              ),
            )
            .limit(1);
          let leaderHistoryClosedId: number | null = null;
          const active = activeHistory[0];
          if (active) {
            const dataFim = new Date(nowInstant.toISOString().slice(0, 10));
            const [closeResult] = await tx
              .update(employeeLeaderHistory)
              .set({ dataFim })
              .where(eq(employeeLeaderHistory.id, active.id));
            if (closeResult.affectedRows === 1) {
              leaderHistoryClosedId = active.id;
            }
          }

          return {
            employeeId: input.employeeId,
            terminationEventId: terminationInserted.id,
            leaderHistoryClosedId,
          };
        });
      }),

    // --------------------------------------------------------
    // employees.reactivate — RH + Bruno
    // --------------------------------------------------------
    reactivate: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(REACTIVATE_EMPLOYEE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<ReactivateEmployeeResult> => {
        const target = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO });
        }
        assertCompanyScope(ctx.user, row.companyId);
        if (row.status === 'ativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_JA_ATIVO });
        }
        if (input.novoLiderId !== undefined) {
          await assertLiderAtivoDaEmpresa(ctx.db, row.companyId, input.novoLiderId);
        }

        const nowInstant = now();
        return await ctx.db.transaction(async (tx) => {
          const [updateResult] = await tx
            .update(employees)
            .set({ status: 'ativo' })
            .where(eq(employees.id, input.employeeId));
          if (updateResult.affectedRows !== 1) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'UPDATE employees affectedRows != 1.',
            });
          }

          let leaderHistoryId: number | null = null;
          if (input.novoLiderId !== undefined) {
            const dataInicio = new Date(nowInstant.toISOString().slice(0, 10));
            const [historyInserted] = await tx
              .insert(employeeLeaderHistory)
              .values({
                employeeId: input.employeeId,
                liderId: input.novoLiderId,
                clevelId: null,
                dataInicio,
                dataFim: null,
                reason: REASON_REATIVACAO,
                transferBatchId: crypto.randomUUID(),
              })
              .$returningId();
            if (!historyInserted) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'INSERT em employeeLeaderHistory nao retornou id.',
              });
            }
            leaderHistoryId = historyInserted.id;
          }

          return { employeeId: input.employeeId, leaderHistoryId };
        });
      }),

    // --------------------------------------------------------
    // employees.delete — Bruno EXCLUSIVO
    // --------------------------------------------------------
    delete: roleProcedure(['super_admin'])
      .input(DELETE_EMPLOYEE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<DeleteEmployeeResult> => {
        const target = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const row = target[0];
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_EMPLOYEE_NAO_ENCONTRADO });
        }
        if (row.status === 'ativo') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_COLABORADOR_ATIVO });
        }
        if (row.isResponsavelFinanceiro === true) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_RF_BLOQUEADO });
        }
        const temHistorico = await hasHistoricoAnalitico(ctx.db, input.employeeId);
        if (temHistorico) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_DELETE_COM_HISTORICO });
        }

        try {
          return await ctx.db.transaction(async (tx) => {
            await tx
              .delete(individualProfilePlaceholders)
              .where(
                and(
                  eq(individualProfilePlaceholders.userType, 'employee'),
                  eq(individualProfilePlaceholders.userId, input.employeeId),
                ),
              );
            await tx.delete(employeeGoals).where(eq(employeeGoals.employeeId, input.employeeId));
            await tx
              .delete(employeeLeaderHistory)
              .where(eq(employeeLeaderHistory.employeeId, input.employeeId));
            const [deleteResult] = await tx
              .delete(employees)
              .where(eq(employees.id, input.employeeId));
            const deleted = deleteResult.affectedRows === 1;
            return { employeeId: input.employeeId, deleted };
          });
        } catch (err) {
          if (err instanceof TRPCError) {
            throw err;
          }
          rethrowMysqlError(err);
        }
      }),
  });
}

/** Tipo canonico do sub-router (para composicao tipada no `appRouter`). */
export type EmployeesRouter = ReturnType<typeof createEmployeesRouter>;
