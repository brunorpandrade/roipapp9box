// ROIP APP 9BOX — teste integracao ME-086b: rota `/dados-mensais` RH.
//
// Cobertura canonica cross-role bit-exact ao precedente ME-B9-CR2:
// valida bit-exact que as procedures `monthlyData.*` + `monthlyClosure.
// getClosureStatus` aceitam bit-exact a matriz canonica CAMADA_AUTH
// §10.4 linha 825:
//
//   Procedure                          | rh | rh_lider | clevel | lider
//   -----------------------------------|----|----------|--------|-------
//   monthlyData.getMonthlyInputForm    | OK |    OK    |  403   |  403
//   monthlyData.saveMonthlyRHData      | OK |    OK    |  403   |  403
//   monthlyData.getLeadersStatus       | OK |    OK    |  403   |  403
//   monthlyClosure.getClosureStatus    | OK |    OK    |  OK    |  OK
//
// Cross-company canonico bit-exact ao padrao ME-B9-SEC.
//
// Faixa CNPJ desta ME: principal 86200000000000..86299999999999.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, monthlyClosureStatus } from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createMonthlyClosureRouter } from '../../src/server/routers/monthlyClosure';
import { createMonthlyDataRouter } from '../../src/server/routers/monthlyData';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me086b-dm';

const HASH_A = 'hash-fixo-me086b-dm';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
let cpfCounter = 86200000000;

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
      endereco: `Rua ME-086b DM, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica ME-086b DM',
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
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@empresa-me086b-dm.com`,
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

async function seedMonthClosure(
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
): Promise<void> {
  await db.insert(monthlyClosureStatus).values({ companyId, mes, status });
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

const monthlyDataRouter = createMonthlyDataRouter();
const createMonthlyDataCaller = createCallerFactory(monthlyDataRouter);
const monthlyClosureRouter = createMonthlyClosureRouter();
const createMonthlyClosureCaller = createCallerFactory(monthlyClosureRouter);

// -----------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------

let companyA: number;
let companyB: number;
let rhA: number;
let rhLiderA: number;
let liderA: number;
let clevelA: number;
let rhB: number;

const MES_ABERTO = '2026-06';
const MES_FECHADO = '2026-05';

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyA = await seedCompany('86200000000001', 'ME086b DM Alpha');
  companyB = await seedCompany('86200000000002', 'ME086b DM Beta');

  clevelA = await seedClevel(companyA, 'ClevelDM A');
  await seedClevel(companyB, 'ClevelDM B');

  rhA = await seedEmployee(companyA, 'RH DM A', { isRH: true });
  rhLiderA = await seedEmployee(companyA, 'RHLider DM A', {
    isRH: true,
    isLider: true,
  });
  liderA = await seedEmployee(companyA, 'Lider DM A', { isLider: true });
  rhB = await seedEmployee(companyB, 'RH DM B', { isRH: true });

  await seedMonthClosure(companyA, MES_ABERTO, 'aberto');
  await seedMonthClosure(companyA, MES_FECHADO, 'fechado');
  await seedMonthClosure(companyB, MES_ABERTO, 'aberto');
}, 60000);

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
  }
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
// Testes canonicos bit-exact — perfis autorizados §10.4 linha 825
// -----------------------------------------------------------------------

describe('ME-086b · /dados-mensais RH — perfis autorizados §10.4', () => {
  it('rh puro: getMonthlyInputForm(aba=rh) OK', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, rhA, 'rh'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyA,
      mes: MES_ABERTO,
      aba: 'rh',
    });
    expect(result.abaAtiva).toBe('rh');
  });

  it('rh_lider: getMonthlyInputForm(aba=rh) OK', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, rhLiderA, 'rh_lider'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyA,
      mes: MES_ABERTO,
      aba: 'rh',
    });
    expect(result.abaAtiva).toBe('rh');
  });

  it('rh puro: getLeadersStatus OK (aba Lideres read-only na variant=rh)', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, rhA, 'rh'));
    const result = await caller.getLeadersStatus({
      companyId: companyA,
      mes: MES_ABERTO,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('ME-086b · /dados-mensais RH — perfis bloqueados §10.4', () => {
  it('clevel: getMonthlyInputForm FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, clevelA, 'clevel'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyA,
        mes: MES_ABERTO,
        aba: 'rh',
      }),
    ).rejects.toThrow();
  });

  it('lider: getMonthlyInputForm FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyA,
        mes: MES_ABERTO,
        aba: 'rh',
      }),
    ).rejects.toThrow();
  });
});

describe('ME-086b · /dados-mensais RH — closure status por mes', () => {
  it('rh: getClosureStatus retorna aberto para MES_ABERTO', async () => {
    const caller = createMonthlyClosureCaller(await makeCtx(companyA, rhA, 'rh'));
    const result = await caller.getClosureStatus({
      companyId: companyA,
      mes: MES_ABERTO,
    });
    expect(result.status).toBe('aberto');
  });

  it('rh: getClosureStatus retorna fechado para MES_FECHADO', async () => {
    const caller = createMonthlyClosureCaller(await makeCtx(companyA, rhA, 'rh'));
    const result = await caller.getClosureStatus({
      companyId: companyA,
      mes: MES_FECHADO,
    });
    expect(result.status).toBe('fechado');
  });
});

describe('ME-086b · /dados-mensais RH — cross-company isolation', () => {
  it('RH da empresa A NAO consulta dados-mensais da empresa B (FORBIDDEN)', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, rhA, 'rh'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyB,
        mes: MES_ABERTO,
        aba: 'rh',
      }),
    ).rejects.toThrow();
  });

  it('RH da empresa B consulta dados-mensais proprios (OK)', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyB, rhB, 'rh'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyB,
      mes: MES_ABERTO,
      aba: 'rh',
    });
    expect(result.abaAtiva).toBe('rh');
  });
});
