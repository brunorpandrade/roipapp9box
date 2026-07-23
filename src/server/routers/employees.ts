// ROIP APP 9BOX — sub-router `employees` (ME-043 + ME-043b).
//
// Superficie tRPC de ESCRITA canonica sobre a tabela `employees`
// (DOC 01 §4.5). Cobre 6 das 8 procs canonicas do §16.7 do DOC 03
// apos a ME-043b — ME-043 entregou create/update/inactivate/reactivate/
// delete; ME-043b acrescenta `uploadCSV` (§16.6) reusando `create` como
// via canonica de INSERT por linha (RV-13 preservada; padrao S185
// replicado da ME-048; contrato S186 compartilhado via S193 do
// `_shared/uploadResult.ts`).
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
//     liderados ativos (S148 — bloqueio canonico apontando ao fluxo M2 v2
//     `leadershipTransfer.execute` §14.9 como salvaguarda backend).
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
//   - `employees.uploadCSV`   — RH + Bruno (ME-043b, §16.6). Parser
//     unificado XLSX+CSV via `exceljs 4.4.0` (S184-rev canonizada na
//     ME-048; `wb.csv.read(stream)` retorna o mesmo `Worksheet` que
//     `wb.xlsx.load(buf)`, permitindo pipeline unico). Cabecalho
//     canonico validado antes das linhas; linha valida delega a
//     `employees.create` via caller tRPC interno (S185 replicado com
//     `EmployeesFacade.create` — `DEFAULT_EMPLOYEES_FACADE` produz o
//     caller sobre `createEmployeesRouter()` compartilhando o `ctx`).
//     Linha invalida agrega em `LinhaErro` sem abortar (semantica
//     canonica §16.6 — modal de resumo pos-upload).
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
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
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

import {
  createCallerFactory,
  roleProcedure,
  router,
  type AuthenticatedUser,
  type Context,
} from '../trpc';

import type { LinhaErro, UploadResult } from './_shared/uploadResult';

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
// Constantes canonicas do uploadCSV (§16.6 — S190, S191)
// ============================================================

/**
 * S190 — cabecalho canonico literal do arquivo de cadastro em massa
 * (14 colunas, linha 1 do arquivo). Ordem canonica fixa; qualquer
 * divergencia sobe BAD_REQUEST global com `MSG_UPLOAD_CABECALHOS_INVALIDOS`.
 * Rotulos derivados de §16.2 (formulario canonico) e §4.5 (schema).
 */
export const COLUNAS_CANONICAS_EMPLOYEES = [
  'Nome completo',
  'CPF',
  'E-mail',
  'Data de nascimento',
  'Data de admissao',
  'CBO',
  'Descricao do CBO',
  'Departamento',
  'Senioridade',
  'Nivel hierarquico',
  'Familia de funcao',
  'Ativar como Lider',
  'Ativar como RH',
  'Nome do lider direto',
] as const;

/** S191 — mapa canonico rotulo humano → literal do enum `jobFamily`. */
export const MAP_FAMILIA_FUNCAO: Record<string, (typeof JOB_FAMILY_VALUES)[number]> = {
  'Vendas e comercial': 'vendas_comercial',
  'Producao e operacoes': 'producao_operacoes',
  'Tecnico e especialista': 'tecnico_especialista',
  'Administrativo e suporte': 'administrativo_suporte',
  'Atendimento e relacionamento': 'atendimento_relacionamento',
  'Lideranca e gestao': 'lideranca_gestao',
};

/** S191 — mapa canonico rotulo humano → literal do enum `senioridade`. */
export const MAP_SENIORIDADE: Record<string, 'junior' | 'pleno' | 'senior'> = {
  Junior: 'junior',
  Pleno: 'pleno',
  Senior: 'senior',
};

/** S191 — mapa canonico rotulo humano → literal do enum `nivelHierarquico`. */
export const MAP_NIVEL_HIERARQUICO: Record<string, NivelHierarquico> = {
  Operacional: 'operacional',
  Tatico: 'tatico',
  Estrategico: 'estrategico',
};

/**
 * S191 — rotulos canonicos exatos de `departamento` (identicos aos 19
 * valores literais do enum §4.5 — sem transformacao). Set derivado do
 * enum para lookup O(1) preservando a tipagem literal.
 */
export const SET_DEPARTAMENTO_CANONICO: ReadonlySet<string> = new Set(DEPARTAMENTO_VALUES);

/** S189 — content types aceitos no `uploadCSV`. */
export const UPLOAD_CONTENT_TYPES = ['xlsx', 'csv'] as const;

/**
 * S196 — teto canonico de linhas por upload. Protege memoria contra
 * arquivo abusivo (cabecalho valido + 10^6 linhas) e nao existe no
 * canonico como numero explicito; escolhido como 10.000 (largamente
 * suficiente para PMEs alvo — DOC 00). Excedente sobe BAD_REQUEST
 * global com `MSG_UPLOAD_LINHAS_EXCEDIDAS`.
 */
export const UPLOAD_MAX_LINHAS = 10_000 as const;

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
 * S148 — fechamento canonico de R1 na ME-045. O DOC 03 §16.3 canoniza que
 * a inativacao de lider com liderados ativos ACIONA o fluxo canonico
 * M2 v2 (§14). O fluxo M2 v2 e ENTRADA UNICA de inativacao de lider com
 * liderados — vive em `leadershipTransfer.execute` (§14.9). Esta procedure
 * (`employees.inactivate`) permanece como salvaguarda backend defensiva
 * para casos de race condition ou chamada API direta que contorne a UI;
 * na hipotese normal a UI direciona ao M2 v2 antes desta procedure ser
 * chamada. A mensagem canonica de fechamento aponta explicitamente o
 * metodo canonico.
 */
export const MSG_LIDER_COM_LIDERADOS_USE_M2V2 =
  'Este colaborador possui liderados ativos. Use leadershipTransfer.execute ' +
  'para transferir liderados e inativar em transacao atomica canonica (§14.9).';

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
// Mensagens canonicas do uploadCSV (§16.6 — S073/S091 replicado; S196)
// ============================================================

/**
 * §16.6 — cabecalho do arquivo divergente dos 14 rotulos canonicos em
 * ordem. Mensagem global (aborta upload); nao entra em `LinhaErro`.
 */
export const MSG_UPLOAD_CABECALHOS_INVALIDOS = 'Cabecalhos do arquivo invalidos.' as const;

/** S189 — `contentType` fora do conjunto canonico `{xlsx, csv}`. */
export const MSG_UPLOAD_CONTENT_TYPE_INVALIDO =
  'Tipo de arquivo invalido. Aceitos: xlsx e csv.' as const;

/** S196 — teto de linhas excedido (proteção de memoria). */
export const MSG_UPLOAD_LINHAS_EXCEDIDAS =
  'Arquivo excede o limite canonico de 10000 linhas de dados.' as const;

/** §16.6 — payload base64 vazio, corrompido ou nao decodificavel. */
export const MSG_UPLOAD_ARQUIVO_INVALIDO = 'Arquivo invalido ou corrompido.' as const;

/** §16.6 — algum campo obrigatorio da linha esta vazio (§16.2). */
export const MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO = 'Campo obrigatorio vazio.' as const;

/** §16.6 — mesmo CPF aparece em duas ou mais linhas do proprio arquivo. */
export const MSG_UPLOAD_CPF_DUPLICADO_ARQUIVO = 'CPF duplicado dentro do arquivo.' as const;

/** §16.6 — CPF ja existe na empresa (dedupe canonico — linha ignorada). */
export const MSG_UPLOAD_CPF_JA_EXISTE = 'CPF ja cadastrado nesta empresa.' as const;

/** §16.6 — nome do lider direto informado nao corresponde a lider ativo. */
export const MSG_UPLOAD_LIDER_NAO_ENCONTRADO = 'Lider direto nao encontrado.' as const;

/**
 * S192 — dois ou mais lideres ativos com nome identico na empresa
 * impedem a resolucao univoca; linha ignorada com esta mensagem.
 */
export const MSG_UPLOAD_LIDER_AMBIGUO =
  'Lider direto ambiguo — ha mais de um lider ativo com este nome.' as const;

/** S191 — rotulo de Departamento/Familia/Senioridade/Nivel nao canonico. */
export const MSG_UPLOAD_ENUM_INVALIDO = 'Valor invalido para o campo.' as const;

/** §16.6 — data invalida (formato ou valor). */
export const MSG_UPLOAD_DATA_INVALIDA = 'Data invalida.' as const;

/** §16.6 — CPF nao normaliza para 11 digitos (S125 superficial). */
export const MSG_UPLOAD_CPF_INVALIDO = 'CPF invalido.' as const;

/** §16.6 — e-mail com formato invalido. */
export const MSG_UPLOAD_EMAIL_INVALIDO = 'E-mail invalido.' as const;

/**
 * §16.6 — booleano fora de `{SIM, NAO}` (case-insensitive; vazio = NAO).
 * Aplicavel a colunas "Ativar como Lider" e "Ativar como RH".
 */
export const MSG_UPLOAD_BOOLEANO_INVALIDO = 'Valor invalido — use SIM ou NAO.' as const;

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

/**
 * §16.6 (ME-043b) — input canonico de `employees.uploadCSV`.
 * `contentBase64` transporta o arquivo XLSX ou CSV integralmente em
 * Base64. `contentType` canoniza o parser aplicavel (S189). A validacao
 * profunda (cabecalho, colunas, linhas) ocorre apos a decodificacao,
 * dentro do proprio handler.
 */
export const UPLOAD_CSV_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  contentBase64: z.string().min(1),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
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

/**
 * Retorno canonico do `uploadCSV` (S186, alias direto — o contrato
 * `UploadResult` e canonizado no modulo compartilhado `_shared/
 * uploadResult.ts`; S193).
 */
export type UploadCSVResult = UploadResult;

// ============================================================
// Facade canonica de reuso via caller tRPC interno (S185, S194)
// ============================================================

/**
 * S194 — abstracao injetavel que expoe a proc canonica `employees.create`
 * a chamadores INTERNOS do proprio sub-router (concretamente:
 * `employees.uploadCSV`). Producao usa `DEFAULT_EMPLOYEES_FACADE` que
 * abre um caller tRPC sobre o proprio router compartilhando o `ctx`
 * (JWT verificado, db conectado, guards de autorizacao aplicados);
 * testes injetam mock para isolar o parser dos efeitos colaterais do
 * INSERT canonico ou para exercitar erros determinados por linha.
 *
 * Preserva RV-13 (unica via de INSERT em `employees` e a proc `create`);
 * reusa transacao canonica S126 (INSERT employees + placeholder +
 * leaderHistory quando `liderInicialId`); reusa integralmente todas as
 * mensagens canonicas literais e todos os guards (§2.4, §12 DOC 02).
 */
export interface EmployeesFacade {
  create(
    ctx: Context,
    input: z.infer<typeof CREATE_EMPLOYEE_INPUT_SCHEMA>,
  ): Promise<CreateEmployeeResult>;
}

/**
 * Default canonico: caller tRPC interno do proprio `createEmployeesRouter`
 * compartilhando o `ctx`. O caller e instanciado on-demand no handler
 * do `uploadCSV` (nunca em tempo de importacao), portanto NAO cria
 * loop de instanciacao — `createEmployeesRouter()` interno e chamado
 * apenas quando ha upload em curso, e o factory retorna um objeto
 * router pronto sem executar os handlers.
 */
export const DEFAULT_EMPLOYEES_FACADE: EmployeesFacade = {
  async create(ctx, input) {
    const factory = createCallerFactory(createEmployeesRouter());
    const caller = factory(ctx);
    return await caller.create(input);
  },
};

// ============================================================
// Dependencias injetaveis (DI factory — padrao S100/S084)
// ============================================================

/**
 * Dependencias do sub-router `employees`. `now` injetavel para testes
 * deterministicos das transacoes atomicas (dataInativacao, dataFim,
 * dataInicio do vinculo). `employeesFacade` (S194) injetavel para
 * isolar o parser do `uploadCSV` nos testes — producao usa
 * `DEFAULT_EMPLOYEES_FACADE`. Sem hook de motor: o Perfil Individual
 * §10.12 e criado DIRETAMENTE nas transacoes de `create` (INSERT
 * canonico), nao via DI — o motor de assessment do §10 (ME-049a)
 * NAO consome hook aqui, apenas le `individualProfilePlaceholders`.
 */
export interface EmployeesRouterDeps {
  now?: () => Date;
  employeesFacade?: EmployeesFacade;
}

/** DI default: relogio real + facade default. */
export const DEFAULT_EMPLOYEES_ROUTER_DEPS: Required<EmployeesRouterDeps> = {
  now: () => new Date(),
  employeesFacade: DEFAULT_EMPLOYEES_FACADE,
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
// Helpers do uploadCSV §16.6 (ME-043b — RV-13 preservada; padrao S049
// helper local por sub-router — leitura de workbook duplica o padrao
// generico de `spreadsheets.ts` com especializacao para CSV unificado
// via `wb.csv.read(Readable.from([csv]))`).
// ============================================================

/**
 * S189 — decodifica Base64 → Buffer e delega ao parser exceljs 4.4.0
 * conforme `contentType`. XLSX via `wb.xlsx.load(buffer)`; CSV via
 * `wb.csv.read(Readable)` — ambos retornam o mesmo tipo `Worksheet`.
 * Falhas de decodificacao/parse sobem `BAD_REQUEST` global.
 */
export async function readEmployeesWorkbook(
  contentBase64: string,
  contentType: (typeof UPLOAD_CONTENT_TYPES)[number],
): Promise<ExcelJS.Worksheet> {
  let buf: Buffer;
  try {
    buf = Buffer.from(contentBase64, 'base64');
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
  }
  if (buf.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
  }
  const wb = new ExcelJS.Workbook();
  if (contentType === 'xlsx') {
    try {
      // exceljs 4.4.0 typing herdado do Buffer classico (pre-Node 22);
      // cast documentado no precedente de `spreadsheets.ts:753`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buf as any);
    } catch {
      throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
    }
    const ws = wb.worksheets[0];
    if (!ws) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
    }
    return ws;
  }
  // contentType === 'csv'
  try {
    const stream = Readable.from([buf.toString('utf8')]);
    const ws = await wb.csv.read(stream);
    return ws;
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
  }
}

/**
 * Le uma celula preservando string; null/undefined vira ''. Padrao
 * canonico herdado de `spreadsheets.ts` — celulas RichText retornam
 * `{text}`, celulas Date retornam `Date` (convertido via toString).
 */
export function upCellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getRow(row).getCell(col).value;
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'object' && v !== null && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').trim();
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

/**
 * Numero de linhas com conteudo em qualquer coluna (equivalente ao
 * helper `usedRowCount` de `spreadsheets.ts`, replicado por S049).
 */
export function upUsedRowCount(ws: ExcelJS.Worksheet): number {
  let last = 0;
  ws.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    if (rowNumber > last) {
      last = rowNumber;
    }
  });
  return last;
}

/**
 * Parseia data no formato DD/MM/AAAA ou ISO YYYY-MM-DD. Retorna
 * `Date` valida ou `null` se invalida. `Date` sem componente de hora
 * (00:00:00 UTC) para casar com o tipo `date` do Drizzle §4.5.
 */
export function upParseData(raw: string): Date | null {
  const s = raw.trim();
  if (s === '') {
    return null;
  }
  // ISO YYYY-MM-DD.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return upBuildDateSafe(y, m, d);
  }
  // BR DD/MM/AAAA.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = Number(br[3]);
    return upBuildDateSafe(y, m, d);
  }
  return null;
}

/**
 * Constroi `Date` UTC 00:00:00 validando que os campos batem (rejeita
 * `31/02/2000` que o construtor `Date` aceitaria como `03/03/2000`).
 */
export function upBuildDateSafe(y: number, m: number, d: number): Date | null {
  if (y < 1900 || y > 2100) {
    return null;
  }
  if (m < 1 || m > 12) {
    return null;
  }
  if (d < 1 || d > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y) {
    return null;
  }
  if (dt.getUTCMonth() !== m - 1) {
    return null;
  }
  if (dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/**
 * Parseia booleano no dominio canonico `{SIM, NAO}` (case-insensitive;
 * trim; vazio ou undefined → `false`; qualquer outra string →
 * `undefined` indicando erro para o chamador registrar `LinhaErro`).
 */
export function upParseSimNao(raw: string): boolean | undefined {
  const s = raw.trim().toUpperCase();
  if (s === '') {
    return false;
  }
  if (s === 'SIM') {
    return true;
  }
  if (s === 'NAO' || s === 'NÃO') {
    return false;
  }
  return undefined;
}

/**
 * S192 — resolve nome do lider direto em `employees.id` da mesma empresa,
 * exigindo `isLider=true` e `status='ativo'`. Retorna o id univoco,
 * `'not_found'` ou `'ambiguous'`. `LIMIT 2` e suficiente para
 * caracterizar ambiguidade (>= 2 = ambiguo; a terceira ocorrencia nao
 * altera o veredito canonico).
 */
export async function upResolveLiderPorNome(
  db: RoipDatabase,
  companyId: number,
  nome: string,
): Promise<{ tipo: 'ok'; liderId: number } | { tipo: 'not_found' | 'ambiguous' }> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.name, nome),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(2);
  if (rows.length === 0) {
    return { tipo: 'not_found' };
  }
  if (rows.length > 1) {
    return { tipo: 'ambiguous' };
  }
  return { tipo: 'ok', liderId: rows[0]!.id };
}

/**
 * Estrutura interna canonica de uma linha ja parseada e pronta para
 * delegar ao `employees.create`. Nao exportada — consumida apenas pelo
 * `parseEmployeesUpload` e pelo handler do `uploadCSV`.
 */
interface UploadLinhaParsed {
  linha: number;
  input: z.infer<typeof CREATE_EMPLOYEE_INPUT_SCHEMA>;
}

/**
 * §16.6 — parser canonico do arquivo. Aborta com BAD_REQUEST global se
 * o cabecalho divergir; caso contrario percorre linhas 2..N acumulando
 * (a) linhas prontas em `linhas[]` (validas dentro do proprio arquivo)
 * e (b) `LinhaErro[]` para linhas ignoradas (campo vazio, enum invalido,
 * data invalida, CPF invalido, CPF duplicado dentro do proprio arquivo,
 * lider por nome nao encontrado/ambiguo). CPFs ja existentes na
 * empresa NAO sao detectados aqui (a proc `create` levanta `CONFLICT`
 * canonico via `uq_employee_cpf` — capturado no handler).
 */
export async function parseEmployeesUpload(
  db: RoipDatabase,
  companyId: number,
  ws: ExcelJS.Worksheet,
): Promise<{ linhas: UploadLinhaParsed[]; erros: LinhaErro[] }> {
  // 1) Cabecalho canonico exato.
  for (let i = 0; i < COLUNAS_CANONICAS_EMPLOYEES.length; i += 1) {
    const esperado = COLUNAS_CANONICAS_EMPLOYEES[i]!;
    const encontrado = upCellString(ws, 1, i + 1);
    if (encontrado !== esperado) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_CABECALHOS_INVALIDOS });
    }
  }

  const last = upUsedRowCount(ws);
  const totalLinhas = last - 1;
  if (totalLinhas > UPLOAD_MAX_LINHAS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_UPLOAD_LINHAS_EXCEDIDAS });
  }

  const linhas: UploadLinhaParsed[] = [];
  const erros: LinhaErro[] = [];
  const cpfsVistosNoArquivo = new Set<string>();

  for (let r = 2; r <= last; r += 1) {
    const nome = upCellString(ws, r, 1);
    const cpfRaw = upCellString(ws, r, 2);
    const email = upCellString(ws, r, 3);
    const dtNascRaw = upCellString(ws, r, 4);
    const dtAdmRaw = upCellString(ws, r, 5);
    const cbo = upCellString(ws, r, 6);
    const descCBO = upCellString(ws, r, 7);
    const departamentoRaw = upCellString(ws, r, 8);
    const senioridadeRaw = upCellString(ws, r, 9);
    const nivelRaw = upCellString(ws, r, 10);
    const familiaRaw = upCellString(ws, r, 11);
    const ativarLiderRaw = upCellString(ws, r, 12);
    const ativarRHRaw = upCellString(ws, r, 13);
    const nomeLider = upCellString(ws, r, 14);

    // Linha totalmente vazia — ignorada silenciosamente (semantica
    // §16.6: apenas linhas com conteudo entram no relatorio).
    const preenchida =
      nome !== '' ||
      cpfRaw !== '' ||
      email !== '' ||
      dtNascRaw !== '' ||
      dtAdmRaw !== '' ||
      cbo !== '' ||
      descCBO !== '' ||
      departamentoRaw !== '' ||
      senioridadeRaw !== '' ||
      nivelRaw !== '' ||
      familiaRaw !== '' ||
      ativarLiderRaw !== '' ||
      ativarRHRaw !== '' ||
      nomeLider !== '';
    if (!preenchida) {
      continue;
    }

    // Validacoes canonicas §16.2 — obrigatorios.
    if (nome === '') {
      erros.push({
        linha: r,
        coluna: 'Nome completo',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    if (cpfRaw === '') {
      erros.push({ linha: r, coluna: 'CPF', mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO });
      continue;
    }
    const cpf = cpfRaw.replace(/\D+/g, '');
    if (cpf.length !== CPF_LENGTH) {
      erros.push({ linha: r, coluna: 'CPF', mensagem: MSG_UPLOAD_CPF_INVALIDO });
      continue;
    }
    if (cpfsVistosNoArquivo.has(cpf)) {
      erros.push({ linha: r, coluna: 'CPF', mensagem: MSG_UPLOAD_CPF_DUPLICADO_ARQUIVO });
      continue;
    }

    if (dtNascRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Data de nascimento',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    const dtNasc = upParseData(dtNascRaw);
    if (!dtNasc) {
      erros.push({
        linha: r,
        coluna: 'Data de nascimento',
        mensagem: MSG_UPLOAD_DATA_INVALIDA,
      });
      continue;
    }
    if (dtAdmRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Data de admissao',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    const dtAdm = upParseData(dtAdmRaw);
    if (!dtAdm) {
      erros.push({
        linha: r,
        coluna: 'Data de admissao',
        mensagem: MSG_UPLOAD_DATA_INVALIDA,
      });
      continue;
    }
    if (cbo === '') {
      erros.push({ linha: r, coluna: 'CBO', mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO });
      continue;
    }
    if (descCBO === '') {
      erros.push({
        linha: r,
        coluna: 'Descricao do CBO',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    if (departamentoRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Departamento',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    if (!SET_DEPARTAMENTO_CANONICO.has(departamentoRaw)) {
      erros.push({ linha: r, coluna: 'Departamento', mensagem: MSG_UPLOAD_ENUM_INVALIDO });
      continue;
    }
    if (senioridadeRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Senioridade',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    const senioridade = MAP_SENIORIDADE[senioridadeRaw];
    if (!senioridade) {
      erros.push({ linha: r, coluna: 'Senioridade', mensagem: MSG_UPLOAD_ENUM_INVALIDO });
      continue;
    }
    if (nivelRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Nivel hierarquico',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    const nivelHierarquico = MAP_NIVEL_HIERARQUICO[nivelRaw];
    if (!nivelHierarquico) {
      erros.push({
        linha: r,
        coluna: 'Nivel hierarquico',
        mensagem: MSG_UPLOAD_ENUM_INVALIDO,
      });
      continue;
    }
    if (familiaRaw === '') {
      erros.push({
        linha: r,
        coluna: 'Familia de funcao',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }
    const jobFamily = MAP_FAMILIA_FUNCAO[familiaRaw];
    if (!jobFamily) {
      erros.push({
        linha: r,
        coluna: 'Familia de funcao',
        mensagem: MSG_UPLOAD_ENUM_INVALIDO,
      });
      continue;
    }

    const isLider = upParseSimNao(ativarLiderRaw);
    if (isLider === undefined) {
      erros.push({
        linha: r,
        coluna: 'Ativar como Lider',
        mensagem: MSG_UPLOAD_BOOLEANO_INVALIDO,
      });
      continue;
    }
    const isRH = upParseSimNao(ativarRHRaw);
    if (isRH === undefined) {
      erros.push({
        linha: r,
        coluna: 'Ativar como RH',
        mensagem: MSG_UPLOAD_BOOLEANO_INVALIDO,
      });
      continue;
    }

    let liderInicialId: number | undefined = undefined;
    if (nomeLider !== '') {
      const res = await upResolveLiderPorNome(db, companyId, nomeLider);
      if (res.tipo === 'not_found') {
        erros.push({
          linha: r,
          coluna: 'Nome do lider direto',
          mensagem: MSG_UPLOAD_LIDER_NAO_ENCONTRADO,
        });
        continue;
      }
      if (res.tipo === 'ambiguous') {
        erros.push({
          linha: r,
          coluna: 'Nome do lider direto',
          mensagem: MSG_UPLOAD_LIDER_AMBIGUO,
        });
        continue;
      }
      if (res.tipo !== 'ok') {
        // Unreachable — os dois branches acima cobrem 'not_found' e
        // 'ambiguous'; salvaguarda para o TS narrowing (o union do
        // retorno inclui `{tipo: 'not_found'|'ambiguous'}` sem
        // `liderId`).
        continue;
      }
      liderInicialId = res.liderId;
    }

    // E-mail e opcional para colaborador puro; obrigatorio se
    // `isLider=true` OU `isRH=true` (§16.2). Se preenchido, valida
    // formato basico (regex do zod aplicaria dentro do `create`, mas
    // preferimos capturar aqui como LinhaErro para preservar semantica
    // "processa todas as linhas").
    const emailNormalizado = email === '' ? undefined : email;
    if (emailNormalizado !== undefined) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado);
      if (!emailOk) {
        erros.push({ linha: r, coluna: 'E-mail', mensagem: MSG_UPLOAD_EMAIL_INVALIDO });
        continue;
      }
    }
    if ((isLider || isRH) && emailNormalizado === undefined) {
      erros.push({
        linha: r,
        coluna: 'E-mail',
        mensagem: MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
      });
      continue;
    }

    // Linha aprovada — agrega input canonico do `create`.
    cpfsVistosNoArquivo.add(cpf);
    linhas.push({
      linha: r,
      input: {
        companyId,
        name: nome,
        cpf,
        email: emailNormalizado,
        dataNascimento: dtNasc,
        dataAdmissao: dtAdm,
        cbo,
        descricaoCBO: descCBO,
        jobFamily,
        senioridade,
        nivelHierarquico,
        departamento: departamentoRaw as (typeof DEPARTAMENTO_VALUES)[number],
        isRH,
        isLider,
        liderInicialId,
      },
    });
  }

  return { linhas, erros };
}

/**
 * Converte um erro emitido pelo `EmployeesFacade.create` numa
 * `LinhaErro` canonica preservando a mensagem literal quando a proc
 * emite `TRPCError`, ou generalizando para 'Erro ao gravar linha.'
 * quando o motivo nao e canonico (salvaguarda).
 */
export function upErroFacadeToLinhaErro(err: unknown, linha: number): LinhaErro {
  if (err instanceof TRPCError) {
    // Mapeamento canonico do CPF ja existente na empresa (uq_employee_cpf
    // convertido em CONFLICT pelo `rethrowMysqlError`).
    if (err.message === MSG_CPF_DUPLICADO) {
      return {
        linha,
        coluna: 'CPF',
        mensagem: MSG_UPLOAD_CPF_JA_EXISTE,
      };
    }
    // Mapeamento canonico do guard §12 DOC 02: caller RH tentando
    // ativar `isRH=true` — preserva mensagem canonica literal.
    if (err.message === MSG_ISRH_APENAS_BRUNO) {
      return {
        linha,
        coluna: 'Ativar como RH',
        mensagem: err.message,
      };
    }
    return { linha, coluna: '-', mensagem: err.message };
  }
  return { linha, coluna: '-', mensagem: 'Erro ao gravar linha.' };
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
  const { now, employeesFacade } = { ...DEFAULT_EMPLOYEES_ROUTER_DEPS, ...deps };

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
              message: MSG_LIDER_COM_LIDERADOS_USE_M2V2,
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

    // --------------------------------------------------------
    // employees.uploadCSV — RH + Bruno (ME-043b, §16.6)
    // --------------------------------------------------------
    uploadCSV: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(UPLOAD_CSV_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UploadCSVResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Leitura + parse do arquivo (aborta com BAD_REQUEST global se
        // cabecalho invalido, tipo invalido, arquivo corrompido ou
        // teto de linhas estourado).
        const ws = await readEmployeesWorkbook(input.contentBase64, input.contentType);
        const { linhas, erros } = await parseEmployeesUpload(ctx.db, input.companyId, ws);

        if (linhas.length === 0) {
          return {
            ok: false,
            linhasProcessadas: erros.length,
            linhasSucesso: 0,
            linhasErro: erros.length,
            erros,
          };
        }

        // Delega linha a linha ao caller canonico (S185/S194). Erros
        // canonicos de negocio (`CPF duplicado`, `isRH apenas Bruno`,
        // etc.) sao capturados por linha para preservar semantica
        // §16.6 "processa todas".
        const sucessos: number[] = [];
        for (const linha of linhas) {
          try {
            await employeesFacade.create(ctx, linha.input);
            sucessos.push(linha.linha);
          } catch (err) {
            erros.push(upErroFacadeToLinhaErro(err, linha.linha));
          }
        }

        const linhasSucesso = sucessos.length;
        const linhasErro = erros.length;
        return {
          ok: linhasErro === 0 && linhasSucesso > 0,
          linhasProcessadas: linhasSucesso + linhasErro,
          linhasSucesso,
          linhasErro,
          erros,
        };
      }),
  });
}

/** Tipo canonico do sub-router (para composicao tipada no `appRouter`). */
export type EmployeesRouter = ReturnType<typeof createEmployeesRouter>;
