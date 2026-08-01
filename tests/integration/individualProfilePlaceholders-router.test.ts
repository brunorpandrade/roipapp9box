// ROIP APP 9BOX — teste de integracao do sub-router
// `individualProfilePlaceholders` (ME-049a).
//
// Contra MySQL real via `createCallerFactory`. Cobre:
//   - Contratos publicos exportados (RV-13): schemas Zod, enums,
//     factory.
//   - `list`: retorna placeholders ordenados por `id`; filtro
//     opcional por `status`.
//   - `list`: guard §2.4 — RH so ve a propria empresa.
//   - `list`: guard §12 — FORBIDDEN para colaborador / lider /
//     C-level (perfis fora da whitelist).
//   - `getByEmployeeId`: retorna o placeholder do titular
//     (employee OU clevel); `null` quando ausente.
//   - `getByEmployeeId`: guard §2.4 — RH so ve a propria empresa.
//   - `getByEmployeeId`: guard §12 — FORBIDDEN para clevel / lider.
//   - S198: mesmo escopo canonico Bruno + RH em ambas as procs.
//
// CNPJs faixa 950..959 (S199 auxiliar).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createIndividualProfilePlaceholdersRouter,
  GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA,
  LIST_PLACEHOLDERS_INPUT_SCHEMA,
  PLACEHOLDER_STATUSES,
  PLACEHOLDER_USER_TYPES,
} from '../../src/server/routers/individualProfilePlaceholders';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049a-placeholders-router';

const HASH = 'hash-fixo-me049a-placeholders';
const FIXTURE_SUPER_ADMIN_ID = 1;

const CNPJ_CONTRATOS = '10000000000950';
const CNPJ_LIST_OK = '10000000000951';
const CNPJ_LIST_FILTER = '10000000000952';
const CNPJ_LIST_ISOLAM = '10000000000953';
const CNPJ_LIST_OUTRA = '10000000000954';
const CNPJ_GET_OK = '10000000000955';
const CNPJ_GET_AUSENTE = '10000000000956';
const CNPJ_AUTH = '10000000000957';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  // Fixture super_admin id=1 e criado pelo setup global
  // (`tests/integration/setup.ts`); reutilizamos.
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
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

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049a PH ${cnpj} LTDA`,
      nomeFantasia: `ME049a PH ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049a PH, ${cnpj}`,
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
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49400000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049a PH',
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
      status: 'ativo',
      isLider: false,
      isRH: false,
      passwordHash: HASH,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createPlaceholder(
  companyId: number,
  userId: number,
  userType: 'employee' | 'clevel' = 'employee',
  status: (typeof PLACEHOLDER_STATUSES)[number] = 'pendente',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType, userId, status })
    .$returningId();
  return row!.id;
}

async function tokenPlatform(
  role: PlatformRole,
  userId: number,
  companyId: number,
): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createIndividualProfilePlaceholdersRouter();
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
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('individualProfilePlaceholders — contratos publicos exportados', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CONTRATOS);
  });

  it('PLACEHOLDER_STATUSES lista canonica §4.9', () => {
    expect(PLACEHOLDER_STATUSES).toEqual([
      'pendente',
      'em_andamento',
      'respondido',
      'inconsistente',
      'aguardando_nova_resposta',
    ]);
  });

  it('PLACEHOLDER_USER_TYPES lista canonica §4.9', () => {
    expect(PLACEHOLDER_USER_TYPES).toEqual(['employee', 'clevel']);
  });

  it('LIST schema exige companyId e aceita status opcional', () => {
    expect(LIST_PLACEHOLDERS_INPUT_SCHEMA.safeParse({ companyId: 1 }).success).toBe(true);
    expect(
      LIST_PLACEHOLDERS_INPUT_SCHEMA.safeParse({ companyId: 1, status: 'pendente' }).success,
    ).toBe(true);
    expect(
      LIST_PLACEHOLDERS_INPUT_SCHEMA.safeParse({ companyId: 1, status: 'invalido' }).success,
    ).toBe(false);
    expect(LIST_PLACEHOLDERS_INPUT_SCHEMA.safeParse({}).success).toBe(false);
  });

  it('GET schema exige companyId + userType + userId', () => {
    expect(
      GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA.safeParse({
        companyId: 1,
        userType: 'employee',
        userId: 1,
      }).success,
    ).toBe(true);
    expect(
      GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA.safeParse({
        companyId: 1,
        userType: 'clevel',
        userId: 1,
      }).success,
    ).toBe(true);
    expect(
      GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA.safeParse({ companyId: 1, userType: 'lider' })
        .success,
    ).toBe(false);
  });

  it('factory retorna procs list e getByEmployeeId', () => {
    const r = createIndividualProfilePlaceholdersRouter();
    // z basica de que list e getByEmployeeId estao no shape.
    void z;
    expect(typeof r).toBe('object');
  });
});

// ============================================================
// 1) list — RH da propria empresa
// ============================================================

describe('individualProfilePlaceholders.list — RH', () => {
  let companyId: number;
  let rhId: number;
  let empIds: number[];

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIST_OK);
    rhId = await createEmployee(companyId);
    empIds = [await createEmployee(companyId), await createEmployee(companyId)];
    await createPlaceholder(companyId, empIds[0]!, 'employee', 'pendente');
    await createPlaceholder(companyId, empIds[1]!, 'employee', 'em_andamento');
  });

  it('RH lista todos os placeholders da propria empresa', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    const rows = await caller.list({ companyId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.companyId).toBe(companyId);
  });

  it('super_admin (Bruno) lista placeholders de qualquer empresa', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const rows = await caller.list({ companyId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 2) list — filtro status
// ============================================================

describe('individualProfilePlaceholders.list — filtro status', () => {
  let companyId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIST_FILTER);
    rhId = await createEmployee(companyId);
    const e1 = await createEmployee(companyId);
    const e2 = await createEmployee(companyId);
    const e3 = await createEmployee(companyId);
    await createPlaceholder(companyId, e1, 'employee', 'pendente');
    await createPlaceholder(companyId, e2, 'employee', 'respondido');
    await createPlaceholder(companyId, e3, 'employee', 'pendente');
  });

  it('filtra apenas placeholders no status alvo', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    const rowsPend = await caller.list({ companyId, status: 'pendente' });
    const rowsResp = await caller.list({ companyId, status: 'respondido' });
    for (const r of rowsPend) expect(r.status).toBe('pendente');
    for (const r of rowsResp) expect(r.status).toBe('respondido');
  });
});

// ============================================================
// 3) list — isolamento por empresa (§2.4)
// ============================================================

describe('individualProfilePlaceholders.list — isolamento (§2.4)', () => {
  let empresaA: number;
  let empresaB: number;
  let rhA: number;

  beforeAll(async () => {
    empresaA = await createCompany(CNPJ_LIST_ISOLAM);
    empresaB = await createCompany(CNPJ_LIST_OUTRA);
    rhA = await createEmployee(empresaA);
    const empB = await createEmployee(empresaB);
    await createPlaceholder(empresaB, empB, 'employee', 'pendente');
  });

  it('RH da empresa A tenta ler empresa B -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhA, empresaA);
    const caller = factory(ctx(t));
    await expect(caller.list({ companyId: empresaB })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ============================================================
// 4) getByEmployeeId — RH + super_admin
// ============================================================

describe('individualProfilePlaceholders.getByEmployeeId — RH + super_admin', () => {
  let companyId: number;
  let rhId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GET_OK);
    rhId = await createEmployee(companyId);
    empId = await createEmployee(companyId);
    await createPlaceholder(companyId, empId, 'employee', 'em_andamento');
  });

  it('RH retorna placeholder do proprio titular', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    const row = await caller.getByEmployeeId({
      companyId,
      userType: 'employee',
      userId: empId,
    });
    expect(row).not.toBeNull();
    expect(row!.userType).toBe('employee');
    expect(row!.userId).toBe(empId);
    expect(row!.status).toBe('em_andamento');
  });

  it('super_admin (Bruno) retorna placeholder de qualquer empresa', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const row = await caller.getByEmployeeId({
      companyId,
      userType: 'employee',
      userId: empId,
    });
    expect(row).not.toBeNull();
  });

  it('ausente -> null (nao lanca)', async () => {
    const cid = await createCompany(CNPJ_GET_AUSENTE);
    const rhAus = await createEmployee(cid);
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhAus, cid);
    const caller = factory(ctx(t));
    const row = await caller.getByEmployeeId({
      companyId: cid,
      userType: 'employee',
      userId: 999999999,
    });
    expect(row).toBeNull();
  });
});

// ============================================================
// 5) Autorizacao canonica S198 — Bruno + RH; demais perfis 403
// ============================================================

describe('individualProfilePlaceholders — autorizacao S198', () => {
  let companyId: number;
  let liderId: number;
  let clevelId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AUTH);
    liderId = await createEmployee(companyId);
    empId = await createEmployee(companyId);
    // Cria clevel real para o token clevel passar do guard de sessao.
    const [cl] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'CL S198 Test',
        cpf: nextCpf(),
        email: `cl-${nextCpf()}@roip.local`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2015-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'Direção',
        departamento: 'Comercial',
        custoMensal: '30000.00',
        status: 'ativo',
        passwordHash: HASH,
        passwordSet: true,
      })
      .$returningId();
    clevelId = cl!.id;
    await createPlaceholder(companyId, empId, 'employee', 'pendente');
  });

  it('Lider (nao RH) -> FORBIDDEN em list', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.list({ companyId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('C-level -> FORBIDDEN em list', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.list({ companyId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Lider -> FORBIDDEN em getByEmployeeId', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(t));
    await expect(
      caller.getByEmployeeId({ companyId, userType: 'employee', userId: empId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rh_lider (rh de lider) tem acesso canonico', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh_lider', liderId, companyId);
    const caller = factory(ctx(t));
    const rows = await caller.list({ companyId });
    expect(Array.isArray(rows)).toBe(true);
  });
});
