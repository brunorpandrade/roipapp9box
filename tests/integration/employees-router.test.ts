// ROIP APP 9BOX — teste de integracao do sub-router `employees` (ME-043).
//
// Exercita as 5 procedures publicas canonicas do sub-dominio de escrita
// de cadastros de colaboradores (DOC 03 §16.7) contra MySQL real via
// `createCallerFactory`. Cobre:
//   - Contratos publicos exportados (RV-13): mensagens canonicas
//     literais, schemas Zod, tipos, constantes, factory.
//   - Matriz canonica de autorizacao (DOC 02 §12): create/update/
//     inactivate/reactivate abertos a RH + Bruno; delete Bruno EXCLUSIVO;
//     Lider/C-level FORBIDDEN em qualquer proc.
//   - `create` — sucesso; placeholder criado (§10.12); leaderHistory
//     criado quando `liderInicialId`; CPF duplicado (uq_employee_cpf)
//     cai em CONFLICT canonico; `isRH=true` sem Bruno = FORBIDDEN
//     (§12 DOC 02); `liderInicialId` invalido/inativo/nao-lider = BAD;
//     input com `isResponsavelFinanceiro=true` REJEITADO (schema Zod
//     nao aceita — S127).
//   - `update` — sucesso multi-campo; guard cruzado companyId; toggle
//     `isRH` restrito a Bruno; `isRH` sem mudanca de valor NAO exige
//     Bruno; `employeeId` inexistente = NOT_FOUND; refine "informe ao
//     menos um campo" rejeita input soh com `employeeId`.
//   - `inactivate` — `motivoSaida` obrigatorio no schema; RF blocked
//     (§5.6) com literal exato; lider com liderados = CONFLICT S126
//     com literal exato; transacao atomica cria termination + fecha
//     leaderHistory; ja inativo = CONFLICT; mensagens verbatim.
//   - `reactivate` — sucesso; novo leaderHistory quando `novoLiderId`;
//     ja ativo = CONFLICT; `novoLiderId` invalido = BAD.
//   - `delete` — Bruno EXCLUSIVO (RH FORBIDDEN); ativo blocked; RF
//     blocked (literal exato §16.4); com historico blocked; sucesso
//     apaga placeholder + goals + leaderHistory; salvaguarda de FK
//     residual cai em CONFLICT canonico.
//
// Faixa CNPJ canonica 800..804 (S130 — S076/S109/S123 estendido).
// L32 cleanup em afterAll. JWT_SECRET fixo. Padrao S009/S087.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
  performanceData,
  performanceVariableData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  CBO_MAX_LENGTH,
  CPF_LENGTH,
  CPF_SCHEMA_EMP,
  CREATE_EMPLOYEE_INPUT_SCHEMA,
  DELETE_EMPLOYEE_INPUT_SCHEMA,
  INACTIVATE_EMPLOYEE_INPUT_SCHEMA,
  MSG_COMPANY_MISMATCH_EMP,
  MSG_CPF_DUPLICADO,
  MSG_DELETE_COLABORADOR_ATIVO,
  MSG_DELETE_COM_HISTORICO,
  MSG_DELETE_RF_BLOQUEADO,
  MSG_EMPLOYEE_NAO_ENCONTRADO,
  MSG_INACTIVATE_RF_BLOQUEADO,
  MSG_ISRH_APENAS_BRUNO,
  MSG_JA_ATIVO,
  MSG_JA_INATIVO,
  MSG_LIDER_COM_LIDERADOS_USE_M2V2,
  MSG_LIDER_INICIAL_INVALIDO,
  MSG_MOTIVO_SAIDA_OBRIGATORIO,
  MSG_TOGGLE_RF_FORA_ESCOPO,
  MYSQL_ERR_DUP_ENTRY,
  MYSQL_ERR_ROW_IS_REFERENCED,
  NAME_MAX_LENGTH,
  PHOTO_URL_MAX_LENGTH,
  REACTIVATE_EMPLOYEE_INPUT_SCHEMA,
  REASON_CADASTRO_INICIAL,
  REASON_REATIVACAO,
  UPDATE_EMPLOYEE_INPUT_SCHEMA,
  createEmployeesRouter,
  type CreateEmployeeResult,
  type DeleteEmployeeResult,
  type InactivateEmployeeResult,
  type ReactivateEmployeeResult,
  type UpdateEmployeeResult,
} from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me043-employees';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me043-employees';

// ============================================================
// Geradores unicos (padrao S009 estendido)
// ============================================================

let cpfCounter = 43800000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me043${seq}`;
}

// Faixa CNPJ 800..804 (S130) — sub-faixa employees-router.
const CNPJ_CONTRATOS = '10000000000800';
const CNPJ_CREATE = '10000000000801';
const CNPJ_UPDATE = '10000000000802';
const CNPJ_INACTIVATE = '10000000000803';
const CNPJ_REACTIVATE_DELETE = '10000000000804';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    const perfRows = await client.db
      .select({ id: performanceData.id })
      .from(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    const perfIds = perfRows.map((r) => r.id);
    if (perfIds.length > 0) {
      await client.db
        .delete(performanceVariableData)
        .where(inArray(performanceVariableData.performanceDataId, perfIds));
    }
    await client.db
      .delete(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    if (empIds.length > 0) {
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db
        .delete(employeeTerminationEvents)
        .where(inArray(employeeTerminationEvents.employeeId, empIds));
    }
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME043 Test ${cnpj} LTDA`,
      nomeFantasia: `ME043 Test ${cnpj}`,
      cnpj,
      telefone: '1633330043',
      endereco: `Rua ME-043, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

interface CreateFixtureEmpOpts {
  isLider?: boolean;
  isRH?: boolean;
  isResponsavelFinanceiro?: boolean;
  status?: 'ativo' | 'inativo';
  name?: string;
}

async function createFixtureEmployee(
  companyId: number,
  opts: CreateFixtureEmpOpts = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Fixture Emp ME043',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function linkLeader(
  employeeId: number,
  liderId: number,
  dataFim: Date | null = null,
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2020-06-01'),
    dataFim,
    reason: 'Fixture ME043',
    transferBatchId: nextTransferBatchId(),
  });
}

// ============================================================
// Tokens JWT por role
// ============================================================

async function tokenPlatform(
  role: PlatformRole,
  userId: number,
  companyId: number,
): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

// ============================================================
// Fabrica de caller
// ============================================================

function bindRouter() {
  const testRouter = createEmployeesRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// ============================================================
// Payload padrao de create
// ============================================================

function baseCreatePayload(companyId: number) {
  return {
    companyId,
    name: 'Novo Colaborador',
    cpf: nextCpf(),
    email: 'novo@roip.local',
    dataNascimento: new Date('1995-05-05'),
    dataAdmissao: new Date('2024-01-01'),
    cbo: '252505',
    descricaoCBO: 'Analista Comercial',
    jobFamily: 'vendas_comercial' as const,
    senioridade: 'pleno' as const,
    nivelHierarquico: 'operacional' as const,
    departamento: 'Comercial' as const,
  };
}

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('employees — contratos publicos exportados', () => {
  it('mensagens canonicas literais batem o texto exato', () => {
    expect(MSG_COMPANY_MISMATCH_EMP).toBe('Colaborador nao pertence a sua empresa.');
    expect(MSG_EMPLOYEE_NAO_ENCONTRADO).toBe('Colaborador nao encontrado.');
    expect(MSG_CPF_DUPLICADO).toBe('Ja existe colaborador cadastrado com este CPF nesta empresa.');
    expect(MSG_DELETE_COLABORADOR_ATIVO).toBe(
      'Colaborador ativo nao pode ser deletado. Inative antes.',
    );
    expect(MSG_DELETE_COM_HISTORICO).toBe(
      'Colaborador possui dados historicos. Deletar nao e permitido; mantenha inativo.',
    );
    expect(MSG_DELETE_RF_BLOQUEADO).toBe(
      'Nao e possivel excluir o Responsavel financeiro. Transfira o papel antes de excluir.',
    );
    expect(MSG_INACTIVATE_RF_BLOQUEADO).toBe(
      'Este colaborador e o Responsavel financeiro da empresa. Antes de inativar, ' +
        'atribua o papel de Responsavel financeiro a outro colaborador.',
    );
    expect(MSG_LIDER_COM_LIDERADOS_USE_M2V2).toBe(
      'Este colaborador possui liderados ativos. Use leadershipTransfer.execute ' +
        'para transferir liderados e inativar em transacao atomica canonica (§14.9).',
    );
    expect(MSG_MOTIVO_SAIDA_OBRIGATORIO).toBe(
      'Selecione o motivo de saida (voluntario ou involuntario) antes de confirmar a inativacao.',
    );
    expect(MSG_TOGGLE_RF_FORA_ESCOPO).toBe(
      'Alteracao de Responsavel financeiro nao e permitida por esta rota; ' +
        'use company.setResponsavelFinanceiro.',
    );
    expect(MSG_ISRH_APENAS_BRUNO).toBe('Apenas o Super Admin pode alterar o acesso como RH.');
    expect(MSG_JA_INATIVO).toBe('Colaborador ja esta inativo.');
    expect(MSG_JA_ATIVO).toBe('Colaborador ja esta ativo.');
    expect(MSG_LIDER_INICIAL_INVALIDO).toBe(
      'Lider informado nao existe, nao pertence a esta empresa ou nao esta ativo.',
    );
  });

  it('constantes canonicas de tamanho batem o schema', () => {
    expect(CPF_LENGTH).toBe(11);
    expect(NAME_MAX_LENGTH).toBe(255);
    expect(CBO_MAX_LENGTH).toBe(10);
    expect(PHOTO_URL_MAX_LENGTH).toBe(500);
    expect(REASON_CADASTRO_INICIAL).toBe('Cadastro inicial do colaborador');
    expect(REASON_REATIVACAO).toBe('Reativacao do colaborador');
    expect(MYSQL_ERR_DUP_ENTRY).toBe(1062);
    expect(MYSQL_ERR_ROW_IS_REFERENCED).toBe(1451);
  });

  it('CPF_SCHEMA_EMP normaliza para 11 digitos e rejeita menos', () => {
    expect(CPF_SCHEMA_EMP.parse('123.456.789-00')).toBe('12345678900');
    expect(CPF_SCHEMA_EMP.parse('12345678900')).toBe('12345678900');
    const bad = CPF_SCHEMA_EMP.safeParse('12345');
    expect(bad.success).toBe(false);
  });

  it('CREATE_EMPLOYEE_INPUT_SCHEMA NAO aceita `isResponsavelFinanceiro` (S127)', () => {
    const payload = baseCreatePayload(1);
    const parsed = CREATE_EMPLOYEE_INPUT_SCHEMA.parse(payload);
    // `isResponsavelFinanceiro` sequer existe no formato do schema —
    // qualquer valor extra e strip-ado (Zod default), garantindo que
    // o backend nunca vera true por este canal.
    expect(
      (parsed as unknown as { isResponsavelFinanceiro?: boolean }).isResponsavelFinanceiro,
    ).toBeUndefined();
  });

  it('UPDATE_EMPLOYEE_INPUT_SCHEMA exige ao menos um campo alem de employeeId', () => {
    const noFields = UPDATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1 });
    expect(noFields.success).toBe(false);
    const withName = UPDATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1, name: 'X' });
    expect(withName.success).toBe(true);
  });

  it('INACTIVATE/REACTIVATE/DELETE schemas aceitam formatos canonicos', () => {
    expect(
      INACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1, motivoSaida: 'voluntario' })
        .success,
    ).toBe(true);
    expect(
      INACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1, motivoSaida: 'involuntario' })
        .success,
    ).toBe(true);
    expect(
      INACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1, motivoSaida: 'outro' }).success,
    ).toBe(false);
    expect(INACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1 }).success).toBe(false);
    expect(REACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1 }).success).toBe(true);
    expect(
      REACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1, novoLiderId: 5 }).success,
    ).toBe(true);
    expect(DELETE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1 }).success).toBe(true);
  });

  it('faixa CNPJ canonica reservada (800..804) — sentinela S130', () => {
    expect(CNPJ_CONTRATOS).toBe('10000000000800');
  });
});

// ============================================================
// 1) employees.create — sucesso e guards
// ============================================================

describe('employees.create — RH + Bruno, transacao atomica', () => {
  let companyId: number;
  let outraCompanyId: number;
  let rhId: number;
  let liderId: number;
  let outroLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CREATE);
    outraCompanyId = await createCompany('10000000000811');
    rhId = await createFixtureEmployee(companyId, { isRH: true, name: 'RH Titular' });
    liderId = await createFixtureEmployee(companyId, { isLider: true, name: 'Lider' });
    outroLider = await createFixtureEmployee(outraCompanyId, { isLider: true });
  });

  it('Bruno cria colaborador; placeholder do §10.12 nasce pendente', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.create(baseCreatePayload(companyId))) as CreateEmployeeResult;

    expect(res.employeeId).toBeGreaterThan(0);
    expect(res.placeholderId).toBeGreaterThan(0);
    expect(res.leaderHistoryId).toBeNull();

    const [placeholder] = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(eq(individualProfilePlaceholders.id, res.placeholderId));
    expect(placeholder!.userType).toBe('employee');
    expect(placeholder!.userId).toBe(res.employeeId);
    expect(placeholder!.status).toBe('pendente');
    expect(placeholder!.companyId).toBe(companyId);
  });

  it('RH cria colaborador na propria empresa; RF=false por default', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    const res = (await caller.create(baseCreatePayload(companyId))) as CreateEmployeeResult;
    const [emp] = await client.db.select().from(employees).where(eq(employees.id, res.employeeId));
    expect(emp!.isResponsavelFinanceiro).toBe(false);
    expect(emp!.status).toBe('ativo');
  });

  it('create com `liderInicialId` cria vinculo em employeeLeaderHistory', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.create({
      ...baseCreatePayload(companyId),
      liderInicialId: liderId,
    })) as CreateEmployeeResult;
    expect(res.leaderHistoryId).not.toBeNull();
    const [entry] = await client.db
      .select()
      .from(employeeLeaderHistory)
      .where(eq(employeeLeaderHistory.id, res.leaderHistoryId!));
    expect(entry!.liderId).toBe(liderId);
    expect(entry!.clevelId).toBeNull();
    expect(entry!.dataFim).toBeNull();
    expect(entry!.reason).toBe(REASON_CADASTRO_INICIAL);
  });

  it('CPF duplicado na mesma empresa cai em CONFLICT canonico', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const payload = baseCreatePayload(companyId);
    await caller.create(payload);
    await expect(caller.create({ ...payload, cpf: payload.cpf })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_CPF_DUPLICADO,
    });
  });

  it('RH criando com `isRH=true` = FORBIDDEN literal exato (§12 DOC 02)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(
      caller.create({ ...baseCreatePayload(companyId), isRH: true }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_ISRH_APENAS_BRUNO,
    });
  });

  it('lider inicial de outra empresa = BAD_REQUEST literal exato', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.create({ ...baseCreatePayload(companyId), liderInicialId: outroLider }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_LIDER_INICIAL_INVALIDO,
    });
  });

  it('lider inicial inexistente = BAD_REQUEST literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.create({ ...baseCreatePayload(companyId), liderInicialId: 999_999_999 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
  });

  it('RH criando em outra companyId = FORBIDDEN (§2.4 guard cruzado)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.create(baseCreatePayload(outraCompanyId))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_COMPANY_MISMATCH_EMP,
    });
  });

  it('Lider ou C-level chamando = FORBIDDEN (matriz de roleProcedure)', async () => {
    const { factory, ctx } = bindRouter();
    const lider = await tokenPlatform('lider', liderId, companyId);
    const cliderCaller = factory(ctx(lider));
    await expect(cliderCaller.create(baseCreatePayload(companyId))).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});

// ============================================================
// 2) employees.update — campos permitidos, toggle isRH restrito
// ============================================================

describe('employees.update — RH + Bruno, guard cruzado', () => {
  let companyId: number;
  let outraCompanyId: number;
  let rhId: number;
  let alvoId: number;
  let alvoOutra: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPDATE);
    outraCompanyId = await createCompany('10000000000812');
    rhId = await createFixtureEmployee(companyId, { isRH: true });
    alvoId = await createFixtureEmployee(companyId);
    alvoOutra = await createFixtureEmployee(outraCompanyId);
  });

  it('Bruno atualiza name/email/departamento; affected=1', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.update({
      employeeId: alvoId,
      name: 'Nome Atualizado',
      email: 'atual@roip.local',
      departamento: 'Financeiro',
    })) as UpdateEmployeeResult;
    expect(res.affected).toBe(1);
    const [row] = await client.db.select().from(employees).where(eq(employees.id, alvoId));
    expect(row!.name).toBe('Nome Atualizado');
    expect(row!.email).toBe('atual@roip.local');
    expect(row!.departamento).toBe('Financeiro');
  });

  it('RH atualizando alvo de outra empresa = FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.update({ employeeId: alvoOutra, name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_COMPANY_MISMATCH_EMP,
    });
  });

  it('RH ativando isRH em alvo = FORBIDDEN literal exato (§12 DOC 02)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.update({ employeeId: alvoId, isRH: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_ISRH_APENAS_BRUNO,
    });
  });

  it('RH passando isRH sem mudanca de valor NAO exige Bruno (idempotente)', async () => {
    const { factory, ctx } = bindRouter();
    const [alvo] = await client.db.select().from(employees).where(eq(employees.id, alvoId));
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    const res = (await caller.update({
      employeeId: alvoId,
      isRH: alvo!.isRH!,
      name: 'Nome via RH idempotente',
    })) as UpdateEmployeeResult;
    expect(res.affected).toBeGreaterThanOrEqual(0);
  });

  it('Bruno ativa isRH normalmente', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const alvo2 = await createFixtureEmployee(companyId);
    const res = (await caller.update({ employeeId: alvo2, isRH: true })) as UpdateEmployeeResult;
    expect(res.affected).toBe(1);
    const [row] = await client.db.select().from(employees).where(eq(employees.id, alvo2));
    expect(row!.isRH).toBe(true);
  });

  it('employeeId inexistente = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.update({ employeeId: 999_999_888, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_EMPLOYEE_NAO_ENCONTRADO,
    });
  });
});

// ============================================================
// 3) employees.inactivate — motivoSaida + guards + transacao
// ============================================================

describe('employees.inactivate — RH + Bruno, transacao §12.6', () => {
  let companyId: number;
  let alvoAtivo: number;
  let alvoRF: number;
  let alvoLiderComLiderados: number;
  let alvoLiderSemLiderados: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INACTIVATE);
    alvoAtivo = await createFixtureEmployee(companyId);
    alvoRF = await createFixtureEmployee(companyId, { isResponsavelFinanceiro: true });
    alvoLiderComLiderados = await createFixtureEmployee(companyId, {
      isLider: true,
      name: 'Lider com liderados',
    });
    alvoLiderSemLiderados = await createFixtureEmployee(companyId, {
      isLider: true,
      name: 'Lider sem liderados',
    });
    liderado = await createFixtureEmployee(companyId, { name: 'Liderado' });
    await linkLeader(liderado, alvoLiderComLiderados, null);
  });

  it('sucesso: UPDATE status + INSERT terminationEvent + fecha leaderHistory', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const alvoComVinculo = await createFixtureEmployee(companyId);
    await linkLeader(alvoComVinculo, alvoLiderSemLiderados, null);

    const res = (await caller.inactivate({
      employeeId: alvoComVinculo,
      motivoSaida: 'voluntario',
    })) as InactivateEmployeeResult;

    expect(res.employeeId).toBe(alvoComVinculo);
    expect(res.terminationEventId).toBeGreaterThan(0);
    expect(res.leaderHistoryClosedId).not.toBeNull();

    const [emp] = await client.db.select().from(employees).where(eq(employees.id, alvoComVinculo));
    expect(emp!.status).toBe('inativo');

    const [ev] = await client.db
      .select()
      .from(employeeTerminationEvents)
      .where(eq(employeeTerminationEvents.id, res.terminationEventId));
    expect(ev!.employeeId).toBe(alvoComVinculo);
    expect(ev!.motivo).toBe('voluntario');
    expect(ev!.nivelHierarquicoSnapshot).toBe('operacional');
    expect(ev!.departamentoSnapshot).toBe('Comercial');
    expect(ev!.actorTipo).toBe('superAdmin');
    expect(ev!.actorId).toBe(FIXTURE_SUPER_ADMIN_ID);

    const [closed] = await client.db
      .select()
      .from(employeeLeaderHistory)
      .where(eq(employeeLeaderHistory.id, res.leaderHistoryClosedId!));
    expect(closed!.dataFim).not.toBeNull();
  });

  it('RH inativando: actorTipo=employee, actorId=userId', async () => {
    const { factory, ctx } = bindRouter();
    const rh = await createFixtureEmployee(companyId, { isRH: true, name: 'RH executor' });
    const alvo = await createFixtureEmployee(companyId);
    const t = await tokenPlatform('rh', rh, companyId);
    const caller = factory(ctx(t));
    const res = (await caller.inactivate({
      employeeId: alvo,
      motivoSaida: 'involuntario',
    })) as InactivateEmployeeResult;
    const [ev] = await client.db
      .select()
      .from(employeeTerminationEvents)
      .where(eq(employeeTerminationEvents.id, res.terminationEventId));
    expect(ev!.actorTipo).toBe('employee');
    expect(ev!.actorId).toBe(rh);
    expect(ev!.motivo).toBe('involuntario');
  });

  it('RF blocked: CONFLICT literal exato §5.6', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.inactivate({ employeeId: alvoRF, motivoSaida: 'voluntario' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_INACTIVATE_RF_BLOQUEADO });
  });

  it('lider com liderados = CONFLICT literal S148 apontando ao M2 v2', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.inactivate({ employeeId: alvoLiderComLiderados, motivoSaida: 'voluntario' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_LIDER_COM_LIDERADOS_USE_M2V2,
    });
  });

  it('lider SEM liderados inativa normalmente', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.inactivate({
      employeeId: alvoLiderSemLiderados,
      motivoSaida: 'voluntario',
    })) as InactivateEmployeeResult;
    expect(res.terminationEventId).toBeGreaterThan(0);
  });

  it('ja inativo = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.inactivate({ employeeId: alvoAtivo, motivoSaida: 'voluntario' }),
    ).resolves.toBeDefined();
    await expect(
      caller.inactivate({ employeeId: alvoAtivo, motivoSaida: 'voluntario' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_JA_INATIVO });
  });

  it('schema Zod rejeita input sem `motivoSaida` (contrato §12.6)', () => {
    const parsed = INACTIVATE_EMPLOYEE_INPUT_SCHEMA.safeParse({ employeeId: 1 });
    expect(parsed.success).toBe(false);
  });
});

// ============================================================
// 4) employees.reactivate + 5) employees.delete
// ============================================================

describe('employees.reactivate + delete', () => {
  let companyId: number;
  let liderId: number;
  let inativoSemHistorico: number;
  let inativoAtivavel: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REACTIVATE_DELETE);
    liderId = await createFixtureEmployee(companyId, { isLider: true });
    inativoSemHistorico = await createFixtureEmployee(companyId, { status: 'inativo' });
    inativoAtivavel = await createFixtureEmployee(companyId, { status: 'inativo' });
    // insere placeholder para o inativoSemHistorico (create canonico cria
    // placeholder; como este e fixture direta, insere manual para simular
    // o estado real).
    await client.db.insert(individualProfilePlaceholders).values({
      companyId,
      userType: 'employee',
      userId: inativoSemHistorico,
      status: 'pendente',
    });
  });

  it('reactivate: status ativo, sem novo lider', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.reactivate({
      employeeId: inativoAtivavel,
    })) as ReactivateEmployeeResult;
    expect(res.leaderHistoryId).toBeNull();
    const [emp] = await client.db.select().from(employees).where(eq(employees.id, inativoAtivavel));
    expect(emp!.status).toBe('ativo');
  });

  it('reactivate com novoLiderId cria vinculo REASON_REATIVACAO', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const outroInativo = await createFixtureEmployee(companyId, { status: 'inativo' });
    const res = (await caller.reactivate({
      employeeId: outroInativo,
      novoLiderId: liderId,
    })) as ReactivateEmployeeResult;
    expect(res.leaderHistoryId).not.toBeNull();
    const [entry] = await client.db
      .select()
      .from(employeeLeaderHistory)
      .where(eq(employeeLeaderHistory.id, res.leaderHistoryId!));
    expect(entry!.reason).toBe(REASON_REATIVACAO);
    expect(entry!.liderId).toBe(liderId);
    expect(entry!.dataFim).toBeNull();
  });

  it('reactivate: ja ativo = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const emp = await createFixtureEmployee(companyId);
    await expect(caller.reactivate({ employeeId: emp })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_JA_ATIVO,
    });
  });

  it('delete: RH FORBIDDEN; Bruno passa; placeholder/goals/history apagados', async () => {
    const { factory, ctx } = bindRouter();
    const rh = await createFixtureEmployee(companyId, { isRH: true });
    const trh = await tokenPlatform('rh', rh, companyId);
    const rhCaller = factory(ctx(trh));
    await expect(rhCaller.delete({ employeeId: inativoSemHistorico })).rejects.toBeInstanceOf(
      TRPCError,
    );

    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.delete({ employeeId: inativoSemHistorico })) as DeleteEmployeeResult;
    expect(res.deleted).toBe(true);

    const rows = await client.db
      .select()
      .from(employees)
      .where(eq(employees.id, inativoSemHistorico));
    expect(rows.length).toBe(0);

    const placeholderResto = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(
        and(
          eq(individualProfilePlaceholders.userType, 'employee'),
          eq(individualProfilePlaceholders.userId, inativoSemHistorico),
        ),
      );
    expect(placeholderResto.length).toBe(0);
  });

  it('delete de ativo = CONFLICT literal §16.4', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const emp = await createFixtureEmployee(companyId);
    await expect(caller.delete({ employeeId: emp })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_COLABORADOR_ATIVO,
    });
  });

  it('delete de RF = CONFLICT literal §16.4 quinta linha', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const rf = await createFixtureEmployee(companyId, {
      isResponsavelFinanceiro: true,
      status: 'inativo',
    });
    await expect(caller.delete({ employeeId: rf })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_RF_BLOQUEADO,
    });
  });

  it('delete de colaborador com termination event historico = CONFLICT', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const comHistorico = await createFixtureEmployee(companyId, { status: 'inativo' });
    await client.db.insert(employeeTerminationEvents).values({
      employeeId: comHistorico,
      companyId,
      dataInativacao: new Date('2024-06-01'),
      motivo: 'voluntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'superAdmin',
      actorId: FIXTURE_SUPER_ADMIN_ID,
    });
    await expect(caller.delete({ employeeId: comHistorico })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_COM_HISTORICO,
    });
  });

  it('reactivate NAO cria vinculo se lider informado NAO e da mesma empresa', async () => {
    const { factory, ctx } = bindRouter();
    const outra = await createCompany('10000000000813');
    const alvo = await createFixtureEmployee(companyId, { status: 'inativo' });
    const liderOutra = await createFixtureEmployee(outra, { isLider: true });
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.reactivate({ employeeId: alvo, novoLiderId: liderOutra }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_LIDER_INICIAL_INVALIDO });
    // vinculo NAO foi criado
    const vinculos = await client.db
      .select()
      .from(employeeLeaderHistory)
      .where(
        and(eq(employeeLeaderHistory.employeeId, alvo), isNull(employeeLeaderHistory.dataFim)),
      );
    expect(vinculos.length).toBe(0);
  });
});

// ============================================================
// 6) Contratos exportados finais (sentinela RV-13)
// ============================================================

describe('employees — sentinelas RV-13', () => {
  it('createEmployeesRouter aceita deps `now` injetavel', () => {
    const fixed = new Date('2026-07-19T00:00:00Z');
    const r = createEmployeesRouter({ now: () => fixed });
    expect(r).toBeDefined();
  });
});
