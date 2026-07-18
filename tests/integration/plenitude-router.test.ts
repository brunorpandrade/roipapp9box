// ROIP APP 9BOX — teste de integracao do sub-router `plenitude`
// (ME-042).
//
// Exercita a proc publica canonica do sub-dominio Eixo Y — leitura
// (DOC 03 §6.8 setima linha + §19.4 nona linha) contra MySQL real via
// `createCallerFactory`. Cobre:
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `getPlenitudeData` retorna a linha crua quando existe, `null`
//     quando ausente. Guard §3.13 (inativo) e S066 (cadeia direta de
//     lider). NOT_FOUND para colaborador inexistente ou fora da
//     empresa informada.
//   - Contratos publicos exportados (`TRIMESTRE_INPUT_SCHEMA_PLENITUDE`
//     como Zod schema, tipo `PlenitudeDataResult`).
//
// Padrao S009 estendido (S076/S109/S123) — faixa CNPJ dedicada da ME-042
// (790..799). Uma company local por describe, CNPJ unico. L32 cleanup
// em afterAll (todas as tabelas com FK compartilhada + fixture global
// superAdmins id=1 preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  plenitudeData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createPlenitudeRouter,
  type PlenitudeDataResult,
  TRIMESTRE_INPUT_SCHEMA_PLENITUDE,
} from '../../src/server/routers/plenitude';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me042-plenitude';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me042-plen';

// ============================================================
// Geradores unicos (padrao S009 estendido — S123 faixa 790..799)
// ============================================================

let cpfCounter = 42000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me042${seq}`;
}

// ============================================================
// Fixture — companies + employees + plenitudeData
// ============================================================

const CNPJ_GUARDS = '10000000000790';
const CNPJ_LIDER = '10000000000791';
const CNPJ_INATIVO = '10000000000792';
const CNPJ_PRESENCA = '10000000000793';
const CNPJ_CROSS_A = '10000000000794';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) {
    return;
  }
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db.delete(plenitudeData).where(inArray(plenitudeData.employeeId, empIds));
    }
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
      razaoSocial: `ME042P Test ${cnpj} LTDA`,
      nomeFantasia: `ME042P Test ${cnpj}`,
      cnpj,
      telefone: '1633330042',
      endereco: `Rua ME-042, ${cnpj}`,
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
  if (!row) {
    throw new Error('createCompany: sem id');
  }
  createdCompanyIds.push(row.id);
  return row.id;
}

async function createEmployee(
  companyId: number,
  opts: { status?: 'ativo' | 'inativo' } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Emp ${nextCpf()}`,
      cpf: nextCpf(),
      email: `emp-${companyId}-${nextCpf()}@example.com`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '252105',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function createCLevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLevel ${nextCpf()}`,
      cpf: nextCpf(),
      email: `cl-${companyId}-${nextCpf()}@example.com`,
      dataNascimento: new Date('1970-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Diretor',
      departamento: 'Diretoria',
      custoMensal: '15000.00',
      acessoTotal: true,
      status: 'ativo',
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createCLevel: sem id');
  }
  return row.id;
}

async function createPlenitudeLine(
  companyId: number,
  employeeId: number,
  trimestre: string,
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    scoreA: '85.00',
    scoreC: '80.00',
    plenitudeScore: '82.00',
    faixaPlenitude: 'alta',
    divergencia: '5.00',
    alertaDivergencia: false,
    engajamentoA: '90.00',
    engajamentoC: '85.00',
    desenvolvimentoA: '80.00',
    desenvolvimentoC: '75.00',
    pertencimentoA: '90.00',
    pertencimentoC: '85.00',
    realizacaoA: '80.00',
    realizacaoC: '75.00',
    calculadoEm: new Date('2025-04-11T14:00:00Z'),
  });
}

async function linkLeader(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture de teste plenitude-router ME-042',
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
  const testRouter = createPlenitudeRouter();
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
// 1) Guards de autorizacao
// ============================================================

describe('plenitude — guards de autorizacao', () => {
  let companyId: number;
  let otherCompanyId: number;
  let employeeId: number;
  let clevelId: number;
  let otherRhId: number;
  let otherClevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    otherCompanyId = await createCompany(CNPJ_CROSS_A);
    employeeId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    otherRhId = await createEmployee(otherCompanyId);
    otherClevelId = await createCLevel(otherCompanyId);
    await createPlenitudeLine(companyId, employeeId, '2025-Q1');
  });

  it('sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('RH da mesma empresa -> OK e retorna a linha', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(employeeId);
    expect(result!.trimestre).toBe('2025-Q1');
    expect(result!.faixaPlenitude).toBe('alta');
  });

  it('super_admin atravessa companyId -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(employeeId);
  });

  it('clevel da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(employeeId);
  });

  it('RH de outra empresa -> FORBIDDEN (guard cruzado §2.4)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', otherRhId, otherCompanyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('clevel de outra empresa -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', otherClevelId, otherCompanyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 2) Guard S066 — cadeia direta de lider
// ============================================================

describe('plenitude — S066 cadeia direta de lider', () => {
  let companyId: number;
  let liderId: number;
  let outroLiderId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIDER);
    liderId = await createEmployee(companyId);
    outroLiderId = await createEmployee(companyId);
    liderado = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
    await createPlenitudeLine(companyId, liderado, '2025-Q1');
    await createPlenitudeLine(companyId, liderId, '2025-Q1');
  });

  it('lider vendo proprio dashboard -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: liderId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(liderId);
  });

  it('lider com liderado direto -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: liderado,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(liderado);
  });

  it('lider fora da cadeia direta -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', outroLiderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId: liderado, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 3) Guard §3.13 — colaborador inativo
// ============================================================

describe('plenitude — §3.13 colaborador inativo', () => {
  let companyId: number;
  let adminId: number;
  let liderId: number;
  let clevelId: number;
  let inativoId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INATIVO);
    adminId = await createEmployee(companyId);
    liderId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    inativoId = await createEmployee(companyId, { status: 'inativo' });
    await linkLeader(inativoId, liderId);
    await createPlenitudeLine(companyId, inativoId, '2025-Q1');
  });

  it('Bruno consulta plenitude de inativo -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: inativoId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe(inativoId);
  });

  it('RH consulta plenitude de inativo -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', adminId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: inativoId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
  });

  it('RH-Lider consulta plenitude de inativo -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh_lider', adminId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: inativoId,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
  });

  it('Lider consulta plenitude de inativo -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId: inativoId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('C-level consulta plenitude de inativo -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId: inativoId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 4) Contrato de resposta e semantica de ausencia
// ============================================================

describe('plenitude — contrato de resposta', () => {
  let companyId: number;
  let employeeComData: number;
  let employeeSemData: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_PRESENCA);
    employeeComData = await createEmployee(companyId);
    employeeSemData = await createEmployee(companyId);
    await createPlenitudeLine(companyId, employeeComData, '2025-Q1');
  });

  it('linha presente -> retorna PlenitudeDataResult com colunas canonicas', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result: PlenitudeDataResult | null = await caller.getPlenitudeData({
      companyId,
      employeeId: employeeComData,
      trimestre: '2025-Q1',
    });
    expect(result).not.toBeNull();
    expect(result!.plenitudeScore).toBe('82.00');
    expect(result!.faixaPlenitude).toBe('alta');
    expect(result!.alertaDivergencia).toBe(false);
    expect(result!.engajamentoA).toBe('90.00');
    expect(result!.engajamentoC).toBe('85.00');
    expect(result!.desenvolvimentoA).toBe('80.00');
    expect(result!.realizacaoC).toBe('75.00');
  });

  it('linha ausente -> retorna null (nao NOT_FOUND)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: employeeSemData,
      trimestre: '2025-Q1',
    });
    expect(result).toBeNull();
  });

  it('linha ausente em trimestre distinto -> null', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getPlenitudeData({
      companyId,
      employeeId: employeeComData,
      trimestre: '2025-Q4',
    });
    expect(result).toBeNull();
  });

  it('colaborador inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId, employeeId: 999999999, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ============================================================
// 5) Guard NOT_FOUND cross-company e schema
// ============================================================

describe('plenitude — cross-company e schema Zod', () => {
  let companyA: number;
  let companyB: number;
  let empA: number;

  beforeAll(async () => {
    companyA = await createCompany('10000000000796');
    companyB = await createCompany('10000000000797');
    empA = await createEmployee(companyA);
    await createPlenitudeLine(companyA, empA, '2025-Q1');
  });

  it('super_admin consulta employee de companyA passando companyB -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({
        companyId: companyB,
        employeeId: empA,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('trimestre com formato invalido -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({
        companyId: companyA,
        employeeId: empA,
        trimestre: '2025Q1',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('TRIMESTRE_INPUT_SCHEMA_PLENITUDE bate `YYYY-QN` canonico', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_PLENITUDE.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_PLENITUDE.safeParse('2025-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_PLENITUDE.safeParse('2025-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_PLENITUDE.safeParse('25-Q1').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_PLENITUDE.safeParse('').success).toBe(false);
  });

  it('id invalido no input -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPlenitudeData({ companyId: -1, employeeId: empA, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.getPlenitudeData({ companyId: companyA, employeeId: 0, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
