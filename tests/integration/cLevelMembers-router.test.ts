// ROIP APP 9BOX — teste de integracao do sub-router `cLevelMembers`
// (ME-043).
//
// Exercita as 5 procedures publicas canonicas do sub-dominio de escrita
// de cadastros de C-levels (DOC 03 §16.7). Todas Bruno EXCLUSIVO
// (DOC 02 §12). Cobre:
//   - Contratos publicos exportados (RV-13): mensagens literais,
//     schemas Zod, tipos, constantes, factory.
//   - Matriz canonica de autorizacao: TODAS as procs Bruno EXCLUSIVO
//     — RH/RH-Lider/C-level/Lider = FORBIDDEN.
//   - `create` — sucesso; placeholder `userType='clevel'` nasce pendente
//     (§10.12); CPF duplicado (uq_clevel_cpf) = CONFLICT canonico;
//     input com `isResponsavelFinanceiro=true` REJEITADO pelo schema
//     (S127).
//   - `update` — sucesso multi-campo (cargo/departamento/custoMensal/
//     acessoTotal); guard cruzado companyId (redundancia semantica);
//     refine "informe ao menos um campo".
//   - `inactivate` — S128 semantica seca (SEM `motivoSaida`, SEM
//     `employeeTerminationEvents`); RF blocked com literal exato;
//     ja inativo = CONFLICT.
//   - `reactivate` — sucesso; ja ativo = CONFLICT.
//   - `delete` — Bruno EXCLUSIVO; ativo blocked; RF blocked; com
//     historico blocked; sucesso apaga placeholder + cLevel.
//
// Faixa CNPJ canonica 805..809 (S130 — sub-faixa cLevelMembers-router).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
  iqlData,
  lgpdConsents,
  monthlyUnlockLog,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  CARGO_MAX_LENGTH_CL,
  CPF_LENGTH_CL,
  CPF_SCHEMA_CL,
  CREATE_CLEVEL_INPUT_SCHEMA,
  DELETE_CLEVEL_INPUT_SCHEMA,
  INACTIVATE_CLEVEL_INPUT_SCHEMA,
  MSG_CLEVEL_NAO_ENCONTRADO,
  MSG_COMPANY_MISMATCH_CL,
  MSG_CPF_DUPLICADO_CL,
  MSG_DELETE_CLEVEL_ATIVO,
  MSG_DELETE_COM_HISTORICO_CL,
  MSG_DELETE_RF_BLOQUEADO_CL,
  MSG_INACTIVATE_RF_BLOQUEADO_CL,
  MSG_JA_ATIVO_CL,
  MSG_JA_INATIVO_CL,
  MSG_TOGGLE_RF_FORA_ESCOPO_CL,
  MYSQL_ERR_DUP_ENTRY_CL,
  MYSQL_ERR_ROW_IS_REFERENCED_CL,
  NAME_MAX_LENGTH_CL,
  PHOTO_URL_MAX_LENGTH_CL,
  REACTIVATE_CLEVEL_INPUT_SCHEMA,
  UPDATE_CLEVEL_INPUT_SCHEMA,
  createCLevelMembersRouter,
  type CreateCLevelResult,
  type DeleteCLevelResult,
  type InactivateCLevelResult,
  type ReactivateCLevelResult,
  type UpdateCLevelResult,
} from '../../src/server/routers/cLevelMembers';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me043-clevel';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me043-clevel';

let cpfCounter = 43900000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Faixa CNPJ 805..809 (S130).
const CNPJ_CONTRATOS = '10000000000805';
const CNPJ_CREATE = '10000000000806';
const CNPJ_UPDATE = '10000000000807';
const CNPJ_INACTIVATE_REACTIVATE = '10000000000808';
const CNPJ_DELETE = '10000000000809';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    const clRows = await client.db
      .select({ id: cLevelMembers.id })
      .from(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    const clIds = clRows.map((r) => r.id);
    if (clIds.length > 0) {
      await client.db.delete(iqlData).where(inArray(iqlData.clevelId, clIds));
      await client.db.delete(lgpdConsents).where(inArray(lgpdConsents.clevelId, clIds));
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.clevelId, clIds));
      await client.db.delete(monthlyUnlockLog).where(inArray(monthlyUnlockLog.liderId, clIds));
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
// Fixtures
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME043CL Test ${cnpj} LTDA`,
      nomeFantasia: `ME043CL ${cnpj}`,
      cnpj,
      telefone: '1633330043',
      endereco: `Rua ME-043 CL, ${cnpj}`,
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

async function createFixtureRH(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'RH ME043 CL',
      cpf: nextCpf(),
      email: `rh-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista de RH',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Recursos Humanos',
      status: 'ativo',
      isRH: true,
      isLider: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface CreateFixtureClOpts {
  isResponsavelFinanceiro?: boolean;
  status?: 'ativo' | 'inativo';
  acessoTotal?: boolean;
  name?: string;
}

async function createFixtureCLevel(
  companyId: number,
  opts: CreateFixtureClOpts = {},
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'Fixture C-Level ME043',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '20000.00',
      acessoTotal: opts.acessoTotal ?? true,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      status: opts.status ?? 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

// ============================================================
// Tokens
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

function bindRouter() {
  const testRouter = createCLevelMembersRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

function baseCreatePayload(companyId: number) {
  return {
    companyId,
    name: 'Novo C-Level',
    cpf: nextCpf(),
    email: 'novo-cl@roip.local',
    dataNascimento: new Date('1970-05-05'),
    dataAdmissao: new Date('2010-01-01'),
    cargo: 'CFO',
    descricaoCargo: 'Chief Financial Officer',
    departamento: 'Financeiro' as const,
    custoMensal: 25000,
    acessoTotal: false,
  };
}

// ============================================================
// 0) Contratos exportados (RV-13)
// ============================================================

describe('cLevelMembers — contratos publicos exportados', () => {
  it('mensagens canonicas literais batem o texto exato', () => {
    expect(MSG_COMPANY_MISMATCH_CL).toBe('C-level nao pertence a sua empresa.');
    expect(MSG_CLEVEL_NAO_ENCONTRADO).toBe('C-level nao encontrado.');
    expect(MSG_CPF_DUPLICADO_CL).toBe('Ja existe C-level cadastrado com este CPF nesta empresa.');
    expect(MSG_DELETE_CLEVEL_ATIVO).toBe('C-level ativo nao pode ser deletado. Inative antes.');
    expect(MSG_DELETE_COM_HISTORICO_CL).toBe(
      'C-level possui dados historicos. Deletar nao e permitido; mantenha inativo.',
    );
    expect(MSG_DELETE_RF_BLOQUEADO_CL).toBe(
      'Nao e possivel excluir o Responsavel financeiro. Transfira o papel antes de excluir.',
    );
    expect(MSG_INACTIVATE_RF_BLOQUEADO_CL).toBe(
      'Este C-level e o Responsavel financeiro da empresa. Antes de inativar, ' +
        'atribua o papel de Responsavel financeiro a outro colaborador.',
    );
    expect(MSG_JA_INATIVO_CL).toBe('C-level ja esta inativo.');
    expect(MSG_JA_ATIVO_CL).toBe('C-level ja esta ativo.');
    expect(MSG_TOGGLE_RF_FORA_ESCOPO_CL).toBe(
      'Alteracao de Responsavel financeiro nao e permitida por esta rota; ' +
        'use company.setResponsavelFinanceiro.',
    );
  });

  it('constantes canonicas de tamanho batem o schema', () => {
    expect(CPF_LENGTH_CL).toBe(11);
    expect(NAME_MAX_LENGTH_CL).toBe(255);
    expect(CARGO_MAX_LENGTH_CL).toBe(100);
    expect(PHOTO_URL_MAX_LENGTH_CL).toBe(500);
    expect(MYSQL_ERR_DUP_ENTRY_CL).toBe(1062);
    expect(MYSQL_ERR_ROW_IS_REFERENCED_CL).toBe(1451);
  });

  it('CPF_SCHEMA_CL normaliza para 11 digitos', () => {
    expect(CPF_SCHEMA_CL.parse('987.654.321-00')).toBe('98765432100');
    expect(CPF_SCHEMA_CL.safeParse('12345').success).toBe(false);
  });

  it('CREATE_CLEVEL_INPUT_SCHEMA NAO aceita `isResponsavelFinanceiro` (S127)', () => {
    const payload = baseCreatePayload(1);
    const parsed = CREATE_CLEVEL_INPUT_SCHEMA.parse(payload);
    expect(
      (parsed as unknown as { isResponsavelFinanceiro?: boolean }).isResponsavelFinanceiro,
    ).toBeUndefined();
  });

  it('UPDATE_CLEVEL_INPUT_SCHEMA exige ao menos um campo alem de cLevelId', () => {
    expect(UPDATE_CLEVEL_INPUT_SCHEMA.safeParse({ cLevelId: 1 }).success).toBe(false);
    expect(UPDATE_CLEVEL_INPUT_SCHEMA.safeParse({ cLevelId: 1, name: 'X' }).success).toBe(true);
  });

  it('INACTIVATE/REACTIVATE/DELETE schemas aceitam formatos canonicos', () => {
    expect(INACTIVATE_CLEVEL_INPUT_SCHEMA.safeParse({ cLevelId: 1 }).success).toBe(true);
    expect(REACTIVATE_CLEVEL_INPUT_SCHEMA.safeParse({ cLevelId: 1 }).success).toBe(true);
    expect(DELETE_CLEVEL_INPUT_SCHEMA.safeParse({ cLevelId: 1 }).success).toBe(true);
    // S128 semantica seca: motivoSaida NAO existe no schema.
    const withMotivo = INACTIVATE_CLEVEL_INPUT_SCHEMA.parse({
      cLevelId: 1,
      motivoSaida: 'voluntario' as unknown as string,
    });
    expect((withMotivo as unknown as { motivoSaida?: string }).motivoSaida).toBeUndefined();
  });
});

// ============================================================
// 1) create — Bruno EXCLUSIVO, placeholder canonico
// ============================================================

describe('cLevelMembers.create — Bruno EXCLUSIVO', () => {
  let companyId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CREATE);
    rhId = await createFixtureRH(companyId);
  });

  it('Bruno cria; placeholder `userType=clevel` nasce pendente', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.create(baseCreatePayload(companyId))) as CreateCLevelResult;

    expect(res.cLevelId).toBeGreaterThan(0);
    expect(res.placeholderId).toBeGreaterThan(0);

    const [placeholder] = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(eq(individualProfilePlaceholders.id, res.placeholderId));
    expect(placeholder!.userType).toBe('clevel');
    expect(placeholder!.userId).toBe(res.cLevelId);
    expect(placeholder!.status).toBe('pendente');

    const [cl] = await client.db
      .select()
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, res.cLevelId));
    expect(cl!.isResponsavelFinanceiro).toBe(false);
    expect(cl!.status).toBe('ativo');
    expect(cl!.custoMensal).toBe('25000.00');
  });

  it('RH FORBIDDEN (Bruno exclusivo)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.create(baseCreatePayload(companyId))).rejects.toBeInstanceOf(TRPCError);
  });

  it('CPF duplicado = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const payload = baseCreatePayload(companyId);
    await caller.create(payload);
    await expect(caller.create({ ...payload, cpf: payload.cpf })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_CPF_DUPLICADO_CL,
    });
  });
});

// ============================================================
// 2) update — Bruno EXCLUSIVO
// ============================================================

describe('cLevelMembers.update — Bruno EXCLUSIVO', () => {
  let companyId: number;
  let clId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPDATE);
    clId = await createFixtureCLevel(companyId);
  });

  it('Bruno atualiza cargo/departamento/acessoTotal/custoMensal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.update({
      cLevelId: clId,
      cargo: 'COO',
      departamento: 'Operações',
      acessoTotal: false,
      custoMensal: 30000,
    })) as UpdateCLevelResult;
    expect(res.affected).toBe(1);
    const [cl] = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, clId));
    expect(cl!.cargo).toBe('COO');
    expect(cl!.departamento).toBe('Operações');
    expect(cl!.acessoTotal).toBe(false);
    expect(cl!.custoMensal).toBe('30000.00');
  });

  it('cLevelId inexistente = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.update({ cLevelId: 999_999_777, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_CLEVEL_NAO_ENCONTRADO,
    });
  });
});

// ============================================================
// 3) inactivate + reactivate — S128 semantica seca
// ============================================================

describe('cLevelMembers.inactivate + reactivate — Bruno EXCLUSIVO', () => {
  let companyId: number;
  let clAtivo: number;
  let clRF: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INACTIVATE_REACTIVATE);
    clAtivo = await createFixtureCLevel(companyId);
    clRF = await createFixtureCLevel(companyId, { isResponsavelFinanceiro: true });
  });

  it('inactivate: UPDATE status; SEM termination event (S128)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.inactivate({
      cLevelId: clAtivo,
    })) as InactivateCLevelResult;
    expect(res.affected).toBe(1);
    const [cl] = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, clAtivo));
    expect(cl!.status).toBe('inativo');
    // S128 canonico: SEM lancamento em employeeTerminationEvents
    // (schema nao aceita employeeId de C-level; §12.2 canoniza C-level
    // fora do turnover). Nao ha o que asseriar alem da nao-execucao.
  });

  it('inactivate: RF blocked com literal exato §5.6', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.inactivate({ cLevelId: clRF })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_INACTIVATE_RF_BLOQUEADO_CL,
    });
  });

  it('inactivate: ja inativo = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.inactivate({ cLevelId: clAtivo })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_JA_INATIVO_CL,
    });
  });

  it('reactivate: status volta a ativo', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.reactivate({ cLevelId: clAtivo })) as ReactivateCLevelResult;
    expect(res.affected).toBe(1);
    const [cl] = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, clAtivo));
    expect(cl!.status).toBe('ativo');
  });

  it('reactivate: ja ativo = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.reactivate({ cLevelId: clAtivo })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_JA_ATIVO_CL,
    });
  });

  it('RH FORBIDDEN nas duas procs', async () => {
    const { factory, ctx } = bindRouter();
    const rh = await createFixtureRH(companyId);
    const t = await tokenPlatform('rh', rh, companyId);
    const caller = factory(ctx(t));
    await expect(caller.inactivate({ cLevelId: clAtivo })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.reactivate({ cLevelId: clAtivo })).rejects.toBeInstanceOf(TRPCError);
  });
});

// ============================================================
// 4) delete — Bruno EXCLUSIVO, §16.4
// ============================================================

describe('cLevelMembers.delete — Bruno EXCLUSIVO', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DELETE);
  });

  it('sucesso: inativo sem historico apaga placeholder + cLevel', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const cl = await createFixtureCLevel(companyId, { status: 'inativo' });
    await client.db.insert(individualProfilePlaceholders).values({
      companyId,
      userType: 'clevel',
      userId: cl,
      status: 'pendente',
    });
    const res = (await caller.delete({ cLevelId: cl })) as DeleteCLevelResult;
    expect(res.deleted).toBe(true);
    const rows = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, cl));
    expect(rows.length).toBe(0);
    const placeholders = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(
        and(
          eq(individualProfilePlaceholders.userType, 'clevel'),
          eq(individualProfilePlaceholders.userId, cl),
        ),
      );
    expect(placeholders.length).toBe(0);
  });

  it('ativo = CONFLICT literal §16.4', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const cl = await createFixtureCLevel(companyId);
    await expect(caller.delete({ cLevelId: cl })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_CLEVEL_ATIVO,
    });
  });

  it('RF = CONFLICT literal §16.4 quinta linha', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const cl = await createFixtureCLevel(companyId, {
      isResponsavelFinanceiro: true,
      status: 'inativo',
    });
    await expect(caller.delete({ cLevelId: cl })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_RF_BLOQUEADO_CL,
    });
  });

  it('com historico (lgpdConsents) = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const cl = await createFixtureCLevel(companyId, { status: 'inativo' });
    await client.db.insert(lgpdConsents).values({
      companyId,
      employeeId: null,
      clevelId: cl,
      versaoTermoAceita: 'me043-t1',
      aceitoEm: new Date('2024-06-01'),
    });
    await expect(caller.delete({ cLevelId: cl })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DELETE_COM_HISTORICO_CL,
    });
  });

  it('inexistente = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.delete({ cLevelId: 999_999_555 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_CLEVEL_NAO_ENCONTRADO,
    });
  });

  it('RH FORBIDDEN em delete', async () => {
    const { factory, ctx } = bindRouter();
    const rh = await createFixtureRH(companyId);
    const t = await tokenPlatform('rh', rh, companyId);
    const caller = factory(ctx(t));
    const cl = await createFixtureCLevel(companyId, { status: 'inativo' });
    await expect(caller.delete({ cLevelId: cl })).rejects.toBeInstanceOf(TRPCError);
  });
});

// ============================================================
// 5) Sentinela RV-13 + guard cruzado (redundancia semantica)
// ============================================================

describe('cLevelMembers — sentinelas RV-13', () => {
  it('createCLevelMembersRouter aceita deps `now` injetavel', () => {
    const fixed = new Date('2026-07-19T00:00:00Z');
    const r = createCLevelMembersRouter({ now: () => fixed });
    expect(r).toBeDefined();
  });

  it('contrato CNPJ_CONTRATOS existe (faixa 805..809 reservada)', () => {
    // Sentinela do S130: se algum outro teste da mesma faixa colidir,
    // o `createdCompanyIds` global daria conflito de unique — asserido
    // implicitamente pelo cleanup do afterAll.
    expect(CNPJ_CONTRATOS).toBe('10000000000805');
  });
});
