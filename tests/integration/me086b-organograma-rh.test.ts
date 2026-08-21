// ROIP APP 9BOX — teste integracao ME-086b: rota `/organograma` RH.
//
// Cobertura canonica cross-role bit-exact ao precedente ME-B9-CR2:
// valida bit-exact que a procedure `orgTree.getFullTree` aceita a
// matriz canonica CAMADA_AUTH §10.4 linha 824 (super_admin implicito
// via helper puro; rh + rh_lider + clevel + lider = OK). PC1b canonico
// avaliado separado via helper puro `shouldApplyPC1b`.
//
// Cross-company canonico bit-exact ao padrao ME-B9-SEC: RH da
// empresa A canonicamente NAO pode consultar organograma da empresa
// B (rejeicao via `assertCompanyScopeOrgTree`).
//
// Faixa CNPJ desta ME: principal 86100000000000..86199999999999.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createOrgTreeRouter, shouldApplyPC1b } from '../../src/server/routers/orgTree';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me086b-org';

const HASH_A = 'hash-fixo-me086b-org';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
let cpfCounter = 86100000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nomeFantasia} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330099',
      endereco: `Rua ME-086b, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica ME-086b',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedClevel(companyId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@empresa-me086b.com`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed cLevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  opts: {
    readonly isRH?: boolean;
    readonly isLider?: boolean;
  } = {},
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'tecnico_especialista',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: opts.isRH === true,
      isLider: opts.isLider === true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function makeCtx(companyId: number, userId: number, role: string): Promise<Context> {
  const bearerToken = await signPlatformToken({
    userId,
    role: role as 'rh' | 'rh_lider' | 'clevel' | 'lider',
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
  return createContextInner({
    db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

const orgTreeRouter = createOrgTreeRouter();
const createOrgTreeCaller = createCallerFactory(orgTreeRouter);

// -----------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------

let companyA: number;
let companyB: number;
let clevelA: number;
let rhA: number;
let rhLiderA: number;
let liderA: number;
let rhB: number;

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyA = await seedCompany('86100000000001', 'ME086b Alpha');
  companyB = await seedCompany('86100000000002', 'ME086b Beta');

  clevelA = await seedClevel(companyA, 'ClevelA Um');
  await seedClevel(companyB, 'ClevelB Um');

  rhA = await seedEmployee(companyA, 'RH Alpha', { isRH: true });
  rhLiderA = await seedEmployee(companyA, 'RHLider Alpha', {
    isRH: true,
    isLider: true,
  });
  liderA = await seedEmployee(companyA, 'Lider Alpha', { isLider: true });
  rhB = await seedEmployee(companyB, 'RH Beta', { isRH: true });
}, 60000);

afterAll(async () => {
  if (createdEmployeeIds.length > 0) {
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  if (createdCompanyIds.length > 0) {
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
}, 60000);

// -----------------------------------------------------------------------
// Testes canonicos bit-exact
// -----------------------------------------------------------------------

describe('ME-086b · /organograma RH — matriz de perfis §10.4', () => {
  it('super_admin: shouldApplyPC1b=false (helper puro)', () => {
    const result = shouldApplyPC1b({
      role: 'super_admin',
      superAdminId: 1,
    });
    expect(result).toBe(false);
  });

  it('rh puro: getFullTree OK + applyPC1b=true', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyA, rhA, 'rh'));
    const result = await caller.getFullTree({ companyId: companyA });
    expect(result.applyPC1b).toBe(true);
    expect(result.root).not.toBeNull();
    expect(shouldApplyPC1b({ role: 'rh', userId: rhA, companyId: companyA })).toBe(true);
  });

  it('rh_lider: getFullTree OK + applyPC1b=true', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyA, rhLiderA, 'rh_lider'));
    const result = await caller.getFullTree({ companyId: companyA });
    expect(result.applyPC1b).toBe(true);
    expect(shouldApplyPC1b({ role: 'rh_lider', userId: rhLiderA, companyId: companyA })).toBe(true);
  });

  it('clevel: getFullTree OK + applyPC1b=false', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyA, clevelA, 'clevel'));
    const result = await caller.getFullTree({ companyId: companyA });
    expect(result.applyPC1b).toBe(false);
    expect(shouldApplyPC1b({ role: 'clevel', userId: clevelA, companyId: companyA })).toBe(false);
  });

  it('lider: getFullTree OK + applyPC1b=false', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyA, liderA, 'lider'));
    const result = await caller.getFullTree({ companyId: companyA });
    expect(result.applyPC1b).toBe(false);
    expect(shouldApplyPC1b({ role: 'lider', userId: liderA, companyId: companyA })).toBe(false);
  });

  it('sem token: getFullTree UNAUTHORIZED (guard defensivo)', async () => {
    const ctx = createContextInner({
      db,
      rateLimiter: createRateLimiter(),
      bearerToken: null,
    });
    const caller = createOrgTreeCaller(ctx);
    await expect(caller.getFullTree({ companyId: companyA })).rejects.toThrow();
  });
});

describe('ME-086b · /organograma RH — cross-company isolation', () => {
  it('RH da empresa A NAO consulta organograma da empresa B (FORBIDDEN)', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyA, rhA, 'rh'));
    await expect(caller.getFullTree({ companyId: companyB })).rejects.toThrow();
  });

  it('RH da empresa B consulta organograma proprio (OK)', async () => {
    const caller = createOrgTreeCaller(await makeCtx(companyB, rhB, 'rh'));
    const result = await caller.getFullTree({ companyId: companyB });
    expect(result.applyPC1b).toBe(true);
    expect(result.root).not.toBeNull();
  });
});
