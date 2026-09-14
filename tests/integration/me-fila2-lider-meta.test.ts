// ROIP APP 9BOX — teste de integracao ME-fila2-seed do campo `meta`
// canonicamente expondo `employeeGoals.goal` na resposta de
// `monthlyData.getMonthlyInputForm(aba='lider')` (S259 consumida).
//
// Cobertura canonica:
// - Row canonica de `MonthlyInputFormLeaderVariable` inclui `meta`.
// - `meta` populado com `goal` canonico do `employeeGoals` quando
//   configurado por `(employeeId, variableIndex)`.
// - `meta=null` quando nao ha entrada em `employeeGoals`.
//
// Padrao S009 estendido: 1 company local, CNPJ 10000000000760. Cleanup
// L32 em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  companyMonthlyData,
  employeeGoals,
  employeeLeaderHistory,
  employees,
  monthlyClosureStatus,
  performanceData,
  performanceVariableData,
} from '../../src/db/schema';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createMonthlyDataRouter,
  type MonthlyInputFormResult,
} from '../../src/server/routers/monthlyData';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-fila2-lider-meta';

const HASH_A = 'hash-fixo-me-fila2-lider-meta';
const CNPJ = '10000000000760';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

let cpfSeq = 26000000000;
function nextCpf(): string {
  cpfSeq += 1;
  return String(cpfSeq);
}

let batchSeq = 0;
function nextBatchId(): string {
  batchSeq += 1;
  return `00000000-0000-0000-0000-mefila2${String(batchSeq).padStart(5, '0')}`;
}

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
    }
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
    await client.db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `MEFila2 Meta ${CNPJ}`,
      nomeFantasia: `MEFila2 Meta`,
      cnpj: CNPJ,
      telefone: '1633330260',
      endereco: `Rua Meta, ${CNPJ}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${CNPJ}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${CNPJ}@example.com`,
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
      kickoffDate: new Date('2025-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createEmployee(
  companyId: number,
  name: string,
  jobFamily: 'vendas_comercial' | 'producao_operacoes',
  isLider: boolean,
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@meta.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2025-01-01'),
      cbo: '999999',
      descricaoCBO: 'Cargo teste',
      jobFamily,
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function seedVariables(companyId: number): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await client.db.insert(companyJobFamilies).values({
      companyId,
      jobFamily: 'producao_operacoes',
      variableIndex: i,
      variableName: `Var ${i}`,
      unit: 'unid',
      weight: '25.00',
      updatedBy: 1,
    });
  }
}

async function setGoal(employeeId: number, variableIndex: number, goal: string): Promise<void> {
  await client.db.insert(employeeGoals).values({
    employeeId,
    jobFamily: 'producao_operacoes',
    variableIndex,
    variableName: `Var ${variableIndex}`,
    unit: 'unid',
    weight: '25.00',
    goal,
    updatedBy: 'rh',
  });
}

async function link(employeeId: number, liderId: number, dataInicio: Date): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio,
    dataFim: null,
    reason: 'Fixture ME-fila2-meta',
    transferBatchId: nextBatchId(),
  });
}

function bindRouter() {
  const testRouter = createMonthlyDataRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

describe('ME-fila2-seed — getMonthlyInputForm(lider) expoe meta (S259)', () => {
  let companyId: number;
  let liderId: number;
  let liderado1: number;
  let liderado2: number;

  beforeAll(async () => {
    companyId = await createCompany();
    await seedVariables(companyId);
    liderId = await createEmployee(companyId, 'Lider Meta Test', 'producao_operacoes', true);
    liderado1 = await createEmployee(companyId, 'Liderado Alpha', 'producao_operacoes', false);
    liderado2 = await createEmployee(companyId, 'Liderado Bravo', 'producao_operacoes', false);
    await link(liderado1, liderId, new Date('2025-06-01'));
    await link(liderado2, liderId, new Date('2025-06-01'));
    // Metas canonicas: liderado1 tem todas as 4 metas; liderado2 tem 2 metas.
    await setGoal(liderado1, 0, '100.00');
    await setGoal(liderado1, 1, '200.00');
    await setGoal(liderado1, 2, '300.00');
    await setGoal(liderado1, 3, '400.00');
    await setGoal(liderado2, 0, '150.00');
    await setGoal(liderado2, 1, '250.00');
    // liderado2 variableIndex 2 e 3 sem meta configurada.
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2026-09',
      diasUteis: 21,
    });
  });

  it('retorna meta canonica para liderado com todas as 4 metas configuradas', async () => {
    const token = await signPlatformToken({
      userId: liderId,
      role: 'lider',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(token));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2026-09',
      aba: 'lider',
      liderId,
      liderTipo: 'employee',
    })) as MonthlyInputFormResult;

    if (result.abaAtiva !== 'lider') {
      throw new Error('Aba retornada nao eh lider — fixture invalida.');
    }
    const rowAlpha = result.liderados.find((l) => l.employeeId === liderado1);
    expect(rowAlpha).toBeDefined();
    expect(rowAlpha!.variaveis.length).toBe(4);
    const metasAlpha = rowAlpha!.variaveis.map((v) => v.meta).sort();
    expect(metasAlpha).toEqual(['100.00', '200.00', '300.00', '400.00']);
  });

  it('retorna meta=null para variaveis sem meta configurada', async () => {
    const token = await signPlatformToken({
      userId: liderId,
      role: 'lider',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(token));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2026-09',
      aba: 'lider',
      liderId,
      liderTipo: 'employee',
    })) as MonthlyInputFormResult;

    if (result.abaAtiva !== 'lider') {
      throw new Error('Aba retornada nao eh lider — fixture invalida.');
    }
    const rowBravo = result.liderados.find((l) => l.employeeId === liderado2);
    expect(rowBravo).toBeDefined();
    const v0 = rowBravo!.variaveis.find((v) => v.variableIndex === 0);
    const v2 = rowBravo!.variaveis.find((v) => v.variableIndex === 2);
    expect(v0?.meta).toBe('150.00');
    expect(v2?.meta).toBeNull();
  });
});
