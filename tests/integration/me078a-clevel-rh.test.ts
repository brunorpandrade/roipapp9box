// ROIP APP 9BOX — teste de integração ME-078a procs `cLevelMembers.list` +
// `cLevelMembers.getById` + `cLevelMembers.countActive` + `employees.listRH`.
//
// Cobre canonicamente bit-exact as 4 procs novas da ME-078a:
//   1. `cLevelMembers.list` — listagem para Aba 1 do `/clevel-rh`.
//   2. `cLevelMembers.getById` — pre-populacao form edicao.
//   3. `cLevelMembers.countActive` — deteccao banner Contexto A.
//   4. `employees.listRH` — listagem para Aba 2 do `/clevel-rh`.
//   5. Guards canonicos (`assertCompanyScopeCl` — Bruno atravessa).
//   6. Helpers puros (`listCLevelsForCompany`, `findCLevelById`,
//      `countActiveCLevelsForCompany`, `listRHForCompany`).
//   7. Ordenacao canonica pt-BR ativos/inativos.
//   8. NOT_FOUND canonico para cLevelId inexistente.
//
// Faixa CNPJ canonica ME-078a: 78100000000000..78199999999999.
// L32 cleanup em afterAll. CC070 — APENAS `tokenSuperAdmin()`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  MSG_CLEVEL_NAO_ENCONTRADO,
  MSG_COMPANY_MISMATCH_CL,
  assertCompanyScopeCl,
  countActiveCLevelsForCompany,
  createCLevelMembersRouter,
  findCLevelById,
  listCLevelsForCompany,
} from '../../src/server/routers/cLevelMembers';
import { createEmployeesRouter, listRHForCompany } from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me078a-clevel-rh';

const FIXTURE_SUPER_ADMIN_ID = 1;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 78100000000000;

function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

async function createTestCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME078a Test ${cnpj} LTDA`,
      nomeFantasia: `ME078a ${cnpj}`,
      cnpj,
      telefone: '1633330078',
      endereco: `Rua ME-078a, ${cnpj}`,
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
      modoAnoFiscal: 'padrao',
      mesInicioAnoFiscal: 1,
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function seedCLevel(input: {
  companyId: number;
  name: string;
  cpf: string;
  cargo?: string;
  status?: 'ativo' | 'inativo';
  isRF?: boolean;
}): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@clevel.example.com`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: input.cargo ?? 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '50000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: input.isRF ?? false,
      status: input.status ?? 'ativo',
    })
    .$returningId();
  return row!.id;
}

async function seedRHEmployee(input: {
  companyId: number;
  name: string;
  cpf: string;
  isLider?: boolean;
  status?: 'ativo' | 'inativo';
  isRF?: boolean;
}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@rh.example.com`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2023-01-01'),
      cbo: '2521-05',
      descricaoCBO: 'Analista de RH',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Recursos Humanos',
      status: input.status ?? 'ativo',
      isRH: true,
      isLider: input.isLider ?? false,
      isResponsavelFinanceiro: input.isRF ?? false,
    })
    .$returningId();
  return row!.id;
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindCLevelRouter() {
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

function bindEmployeesRouter() {
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

// =======================================================================
// 1. cLevelMembers.list — Aba 1 /clevel-rh
// =======================================================================

describe('cLevelMembers.list — Aba 1 canonico (§5.4)', () => {
  it('retorna lista vazia para empresa sem C-levels', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    const res = await caller.list({ companyId });

    expect(res.rows).toHaveLength(0);
    expect(res.totalActive).toBe(0);
    expect(res.totalInactive).toBe(0);
  });

  it('retorna ativos primeiro, inativos depois, alfa pt-BR', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({ companyId, name: 'Zélia Torres', cpf: '40000000001' });
    await seedCLevel({ companyId, name: 'Ântonio Vieira', cpf: '40000000002', status: 'inativo' });
    await seedCLevel({ companyId, name: 'Marina Souza', cpf: '40000000003' });

    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId });

    expect(res.rows).toHaveLength(3);
    expect(res.totalActive).toBe(2);
    expect(res.totalInactive).toBe(1);
    expect(res.rows[0]!.name).toBe('Marina Souza');
    expect(res.rows[1]!.name).toBe('Zélia Torres');
    expect(res.rows[2]!.name).toBe('Ântonio Vieira');
    expect(res.rows[2]!.status).toBe('inativo');
  });

  it('retorna colunas canonicas bit-exact', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({
      companyId,
      name: 'Roberto Santos',
      cpf: '40100000001',
      cargo: 'CFO',
      isRF: true,
    });

    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId });

    const row = res.rows[0]!;
    expect(row.name).toBe('Roberto Santos');
    expect(row.cargo).toBe('CFO');
    expect(row.departamento).toBe('Diretoria');
    expect(row.acessoTotal).toBe(true);
    expect(row.isResponsavelFinanceiro).toBe(true);
    expect(row.status).toBe('ativo');
    expect(row.photoUrl).toBeNull();
    expect(typeof row.id).toBe('number');
  });
});

// =======================================================================
// 2. cLevelMembers.getById — pre-populacao form edicao
// =======================================================================

describe('cLevelMembers.getById — pre-populacao form (§13.3)', () => {
  it('retorna C-level completo pelo id', async () => {
    const companyId = await createTestCompany();
    const clId = await seedCLevel({ companyId, name: 'Ana CEO', cpf: '41000000001' });

    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getById({ cLevelId: clId });

    expect(res.id).toBe(clId);
    expect(res.companyId).toBe(companyId);
    expect(res.name).toBe('Ana CEO');
    expect(res.cpf).toBe('41000000001');
    expect(res.cargo).toBe('CEO');
    expect(res.departamento).toBe('Diretoria');
    expect(res.acessoTotal).toBe(true);
    expect(res.isResponsavelFinanceiro).toBe(false);
    expect(res.status).toBe('ativo');
  });

  it('lanca NOT_FOUND para id inexistente', async () => {
    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(caller.getById({ cLevelId: 999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_CLEVEL_NAO_ENCONTRADO,
    });
  });
});

// =======================================================================
// 3. cLevelMembers.countActive — banner Contexto A
// =======================================================================

describe('cLevelMembers.countActive — banner Contexto A (§13.2 + §13.3)', () => {
  it('retorna 0 para empresa sem C-levels', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.countActive({ companyId });
    expect(res.count).toBe(0);
  });

  it('conta apenas ativos', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({ companyId, name: 'Ativo 1', cpf: '42000000001' });
    await seedCLevel({ companyId, name: 'Inativo 1', cpf: '42000000002', status: 'inativo' });
    await seedCLevel({ companyId, name: 'Ativo 2', cpf: '42000000003' });

    const { factory, ctx } = bindCLevelRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.countActive({ companyId });
    expect(res.count).toBe(2);
  });
});

// =======================================================================
// 4. employees.listRH — Aba 2 /clevel-rh
// =======================================================================

describe('employees.listRH — Aba 2 canonico (§5.4)', () => {
  it('retorna lista vazia quando nenhum colaborador isRH', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindEmployeesRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.listRH({ companyId });
    expect(res.rows).toHaveLength(0);
    expect(res.totalActive).toBe(0);
  });

  it('retorna apenas colaboradores isRH=true, ativos primeiro', async () => {
    const companyId = await createTestCompany();
    await seedRHEmployee({ companyId, name: 'Zuleica RH', cpf: '43000000001' });
    await seedRHEmployee({ companyId, name: 'Amanda RH', cpf: '43000000002', status: 'inativo' });
    await seedRHEmployee({ companyId, name: 'Beatriz RH', cpf: '43000000003', isLider: true });

    const { factory, ctx } = bindEmployeesRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.listRH({ companyId });

    expect(res.rows).toHaveLength(3);
    expect(res.totalActive).toBe(2);
    expect(res.totalInactive).toBe(1);
    expect(res.rows[0]!.name).toBe('Beatriz RH');
    expect(res.rows[0]!.isLider).toBe(true);
    expect(res.rows[1]!.name).toBe('Zuleica RH');
    expect(res.rows[2]!.name).toBe('Amanda RH');
    expect(res.rows[2]!.status).toBe('inativo');
  });
});

// =======================================================================
// 5. Guards canonicos
// =======================================================================

describe('guards canonicos (§2.4 + §10.3)', () => {
  it('super_admin atravessa qualquer companyId via assertCompanyScopeCl', () => {
    expect(() => assertCompanyScopeCl({ role: 'super_admin', superAdminId: 1 }, 999)).not.toThrow();
  });

  it('role diferente com companyId divergente lanca FORBIDDEN', () => {
    expect(() => assertCompanyScopeCl({ role: 'rh', userId: 1, companyId: 1 }, 999)).toThrow(
      TRPCError,
    );
    try {
      assertCompanyScopeCl({ role: 'rh', userId: 1, companyId: 1 }, 999);
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
      expect((e as TRPCError).message).toBe(MSG_COMPANY_MISMATCH_CL);
    }
  });
});

// =======================================================================
// 6. Helpers puros — consumo direto (RV-13)
// =======================================================================

describe('helpers puros — consumo direto (RV-13)', () => {
  it('listCLevelsForCompany retorna lista vazia para empresa inexistente', async () => {
    const res = await listCLevelsForCompany(client.db, 999999);
    expect(res.rows).toHaveLength(0);
    expect(res.totalActive).toBe(0);
  });

  it('findCLevelById retorna null para id inexistente', async () => {
    const res = await findCLevelById(client.db, 999999);
    expect(res).toBeNull();
  });

  it('countActiveCLevelsForCompany retorna 0 para empresa vazia', async () => {
    const companyId = await createTestCompany();
    const res = await countActiveCLevelsForCompany(client.db, companyId);
    expect(res).toBe(0);
  });

  it('listRHForCompany retorna lista vazia para empresa sem RH', async () => {
    const companyId = await createTestCompany();
    const res = await listRHForCompany(client.db, companyId);
    expect(res.rows).toHaveLength(0);
  });
});
