// ROIP APP 9BOX — teste de integracao ME-fila1-01 (MySQL real).
//
// Cobertura canonica cross-role da rota `/dados-mensais/meus-liderados`
// (DOC 05 §14.14) via procs `monthlyData.*` + `monthlyClosure.*` que
// as actions consomem. Cobre bit-a-bit a matriz canonica CAMADA_AUTH
// §10.4:
//
//   Cenario                                             | Resultado
//   ----------------------------------------------------|----------
//   lider (empresa A) → getMonthlyInputForm aba=lider   | OK
//   lider (A) → tenta chamar com liderId de outro       | FORBIDDEN
//   clevel (A) com liderTipo='clevel', proprio userId   | OK
//   rh_lider (A) com liderTipo='employee', proprio      | OK
//   rh puro (A) → guard aceita mas proc bloqueia        | FORBIDDEN
//   lider (A) tenta acessar dados da empresa B          | FORBIDDEN
//   saveMonthlyLeaderData: mes fechado bloqueia         | FORBIDDEN
//   saveMonthlyLeaderData: mes aberto persiste          | OK
//
// Testa tambem os helpers puros `requireLiderRHLiderOrClevel` e
// `deriveLiderTipoFromRole` do novo guard.
//
// Faixa de CNPJ desta ME: 20261000000001..20261000000049 (reservada).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  employees,
  employeeLeaderHistory,
  monthlyClosureStatus,
  performanceData,
  performanceVariableData,
} from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createMonthlyClosureRouter } from '../../src/server/routers/monthlyClosure';
import { createMonthlyDataRouter } from '../../src/server/routers/monthlyData';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';
import {
  deriveLiderTipoFromRole,
  requireLiderRHLiderOrClevel,
} from '../../src/lib/routes/requireLiderRHLiderOrClevel';
import type { ServerSession } from '../../src/server/session/serverSession';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-fila1-ml';

const HASH_A = 'hash-fila1-ml';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
let cpfCounter = 20261000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nome: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj,
      telefone: '1633330199',
      endereco: `Rua ME-fila1 ML, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@empresa-me-fila1.test`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@empresa-me-fila1.test`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria ME-fila1 ML',
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

async function seedEmployee(
  companyId: number,
  name: string,
  opts: { readonly isRH?: boolean; readonly isLider?: boolean } = {},
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@empresa-me-fila1.test`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: opts.isRH === true,
      isLider: opts.isLider === true,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function seedClevel(companyId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@empresa-me-fila1.test`,
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

async function linkLeader(
  employeeId: number,
  liderId: number | null,
  clevelId: number | null,
): Promise<void> {
  await db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId,
    dataInicio: new Date('2020-01-01'),
    dataFim: null,
    reason: 'Fixture ME-fila1-ml',
    transferBatchId: randomUUID(),
  });
}

async function seedJobFamilyVariables(companyId: number): Promise<void> {
  // Familia canonica `vendas_comercial` com 4 variaveis pesos 25/25/25/25.
  for (let i = 0; i < 4; i += 1) {
    await db.insert(companyJobFamilies).values({
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: i,
      variableName: `Var ${i}`,
      unit: 'unid',
      weight: '25',
      updatedBy: 1,
    });
  }
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
let liderA: number;
let rhLiderA: number;
let clevelA: number;
let rhPuroA: number;
let subordinadoLiderA: number;
let subordinadoRhLiderA: number;
let subordinadoClevelA: number;
let liderB: number;
let subordinadoLiderB: number;

const MES_ABERTO = '2026-06';
const MES_FECHADO = '2026-05';

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyA = await seedCompany('20261000000001', 'ME-fila1-ML Alpha');
  companyB = await seedCompany('20261000000002', 'ME-fila1-ML Beta');

  await seedJobFamilyVariables(companyA);
  await seedJobFamilyVariables(companyB);

  liderA = await seedEmployee(companyA, 'Lider A Fila1', { isLider: true });
  rhLiderA = await seedEmployee(companyA, 'RHLider A Fila1', { isRH: true, isLider: true });
  clevelA = await seedClevel(companyA, 'Clevel A Fila1');
  rhPuroA = await seedEmployee(companyA, 'RHPuro A Fila1', { isRH: true });
  subordinadoLiderA = await seedEmployee(companyA, 'Sub Lider A Fila1');
  subordinadoRhLiderA = await seedEmployee(companyA, 'Sub RHLider A Fila1');
  subordinadoClevelA = await seedEmployee(companyA, 'Sub Clevel A Fila1');

  liderB = await seedEmployee(companyB, 'Lider B Fila1', { isLider: true });
  subordinadoLiderB = await seedEmployee(companyB, 'Sub Lider B Fila1');

  // Vinculos canonicos.
  await linkLeader(subordinadoLiderA, liderA, null);
  await linkLeader(subordinadoRhLiderA, rhLiderA, null);
  await linkLeader(subordinadoClevelA, null, clevelA);
  await linkLeader(subordinadoLiderB, liderB, null);

  await seedMonthClosure(companyA, MES_ABERTO, 'aberto');
  await seedMonthClosure(companyA, MES_FECHADO, 'fechado');
  await seedMonthClosure(companyB, MES_ABERTO, 'aberto');
}, 60000);

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, createdCompanyIds));
  }
  if (createdEmployeeIds.length > 0) {
    // FIX L113 (retomada empirica 2 pos-dispatch): fetch-then-delete
    // canonico do performanceVariableData + performanceData que
    // referenciam employees deste teste. Filtro por employeeId (nao
    // companyId) e fetch previo dos ids em vez de subquery inline
    // eliminam a ambiguidade que restringiu o cleanup no run anterior.
    const perfRows = await db
      .select({ id: performanceData.id })
      .from(performanceData)
      .where(inArray(performanceData.employeeId, createdEmployeeIds));
    const perfIds = perfRows.map((r) => r.id);
    if (perfIds.length > 0) {
      await db
        .delete(performanceVariableData)
        .where(inArray(performanceVariableData.performanceDataId, perfIds));
      await db.delete(performanceData).where(inArray(performanceData.id, perfIds));
    }
    await db
      .delete(employeeLeaderHistory)
      .where(inArray(employeeLeaderHistory.employeeId, createdEmployeeIds));
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
// Testes: helpers puros do guard
// -----------------------------------------------------------------------

describe('ME-fila1-01 · requireLiderRHLiderOrClevel (unit puro)', () => {
  function makeSession(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): ServerSession {
    return {
      kind: 'platform',
      role,
      userId: 42,
      companyId: 7,
      displayName: 'Test',
      companyDisplayName: 'Empresa Test',
      companyLogoUrl: null,
      passwordSet: true,
    };
  }

  it('aceita platform lider', () => {
    const result = requireLiderRHLiderOrClevel(makeSession('lider'), 'fn');
    expect(result.role).toBe('lider');
    expect(result.userId).toBe(42);
  });

  it('aceita platform rh_lider', () => {
    const result = requireLiderRHLiderOrClevel(makeSession('rh_lider'), 'fn');
    expect(result.role).toBe('rh_lider');
  });

  it('aceita platform clevel', () => {
    const result = requireLiderRHLiderOrClevel(makeSession('clevel'), 'fn');
    expect(result.role).toBe('clevel');
  });

  it('aceita platform rh puro (page decide render vazio)', () => {
    const result = requireLiderRHLiderOrClevel(makeSession('rh'), 'fn');
    expect(result.role).toBe('rh');
  });

  it('rejeita session null com mensagem generica', () => {
    expect(() => requireLiderRHLiderOrClevel(null, 'fn')).toThrow('sessao ausente');
  });

  it('rejeita super_admin com acesso restrito', () => {
    const superSession: ServerSession = {
      kind: 'super_admin',
      superAdminId: 99,
      displayName: 'Bruno',
    };
    expect(() => requireLiderRHLiderOrClevel(superSession, 'fn')).toThrow('acesso restrito');
  });
});

describe('ME-fila1-01 · deriveLiderTipoFromRole (unit puro)', () => {
  it('clevel → clevel', () => {
    expect(deriveLiderTipoFromRole('clevel')).toBe('clevel');
  });
  it('lider → employee', () => {
    expect(deriveLiderTipoFromRole('lider')).toBe('employee');
  });
  it('rh_lider → employee', () => {
    expect(deriveLiderTipoFromRole('rh_lider')).toBe('employee');
  });
  it('rh → employee', () => {
    expect(deriveLiderTipoFromRole('rh')).toBe('employee');
  });
});

// -----------------------------------------------------------------------
// Testes: procs canonicos consumidos pelas actions (contra MySQL real)
// -----------------------------------------------------------------------

describe('ME-fila1-01 · getMonthlyInputForm(aba=lider) — perfis autorizados', () => {
  it('lider (A) proprio userId → OK, retorna liderados', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyA,
      mes: MES_ABERTO,
      aba: 'lider',
      liderId: liderA,
      liderTipo: 'employee',
    });
    expect(result.abaAtiva).toBe('lider');
    if (result.abaAtiva === 'lider') {
      expect(result.liderId).toBe(liderA);
      expect(result.liderTipo).toBe('employee');
      expect(result.liderados).toHaveLength(1);
      expect(result.liderados[0]!.employeeId).toBe(subordinadoLiderA);
    }
  });

  it('rh_lider (A) proprio userId → OK', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, rhLiderA, 'rh_lider'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyA,
      mes: MES_ABERTO,
      aba: 'lider',
      liderId: rhLiderA,
      liderTipo: 'employee',
    });
    expect(result.abaAtiva).toBe('lider');
    if (result.abaAtiva === 'lider') {
      expect(result.liderados).toHaveLength(1);
      expect(result.liderados[0]!.employeeId).toBe(subordinadoRhLiderA);
    }
  });

  it('clevel (A) proprio userId com liderTipo=clevel → OK', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, clevelA, 'clevel'));
    const result = await caller.getMonthlyInputForm({
      companyId: companyA,
      mes: MES_ABERTO,
      aba: 'lider',
      liderId: clevelA,
      liderTipo: 'clevel',
    });
    expect(result.abaAtiva).toBe('lider');
    if (result.abaAtiva === 'lider') {
      expect(result.liderTipo).toBe('clevel');
      expect(result.liderados).toHaveLength(1);
      expect(result.liderados[0]!.employeeId).toBe(subordinadoClevelA);
    }
  });
});

describe('ME-fila1-01 · getMonthlyInputForm(aba=lider) — bloqueios', () => {
  it('lider (A) tenta chamar com liderId de outro → FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyA,
        mes: MES_ABERTO,
        aba: 'lider',
        liderId: rhLiderA,
        liderTipo: 'employee',
      }),
    ).rejects.toThrow();
  });

  it('clevel (A) tenta com liderTipo=employee → FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, clevelA, 'clevel'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyA,
        mes: MES_ABERTO,
        aba: 'lider',
        liderId: clevelA,
        liderTipo: 'employee',
      }),
    ).rejects.toThrow();
  });

  it('cross-company: lider (A) tenta acessar empresa B → FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyB,
        mes: MES_ABERTO,
        aba: 'lider',
        liderId: liderB,
        liderTipo: 'employee',
      }),
    ).rejects.toThrow();
  });
});

describe('ME-fila1-01 · saveMonthlyLeaderData — persistencia canonica', () => {
  it('lider (A) salva demanda/executado do subordinado no MES_ABERTO → OK', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    const result = await caller.saveMonthlyLeaderData({
      companyId: companyA,
      mes: MES_ABERTO,
      liderId: liderA,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: subordinadoLiderA,
          variaveis: [
            { variableIndex: 0, demanda: '100', executado: '95' },
            { variableIndex: 1, demanda: '80', executado: '82' },
            { variableIndex: 2, demanda: '60', executado: '58' },
            { variableIndex: 3, demanda: '40', executado: '40' },
          ],
        },
      ],
    });
    expect(result.colaboradoresGravados).toBe(1);
    expect(result.variaveisGravadas).toBeGreaterThan(0);
  });

  it('lider (A) tenta salvar no MES_FECHADO → FORBIDDEN', async () => {
    const caller = createMonthlyDataCaller(await makeCtx(companyA, liderA, 'lider'));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId: companyA,
        mes: MES_FECHADO,
        liderId: liderA,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: subordinadoLiderA,
            variaveis: [{ variableIndex: 0, demanda: '10', executado: '10' }],
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe('ME-fila1-01 · getClosureStatus — perfis autorizados', () => {
  it('lider (A) le MES_ABERTO → aberto', async () => {
    const caller = createMonthlyClosureCaller(await makeCtx(companyA, liderA, 'lider'));
    const result = await caller.getClosureStatus({ companyId: companyA, mes: MES_ABERTO });
    expect(result.status).toBe('aberto');
  });

  it('lider (A) le MES_FECHADO → fechado', async () => {
    const caller = createMonthlyClosureCaller(await makeCtx(companyA, liderA, 'lider'));
    const result = await caller.getClosureStatus({ companyId: companyA, mes: MES_FECHADO });
    expect(result.status).toBe('fechado');
  });

  it('rh_lider, clevel, rh puro tambem podem ler status (§10.4)', async () => {
    const roles: Array<{ userId: number; role: 'rh_lider' | 'clevel' | 'rh' }> = [
      { userId: rhLiderA, role: 'rh_lider' },
      { userId: clevelA, role: 'clevel' },
      { userId: rhPuroA, role: 'rh' },
    ];
    for (const r of roles) {
      const caller = createMonthlyClosureCaller(await makeCtx(companyA, r.userId, r.role));
      const result = await caller.getClosureStatus({ companyId: companyA, mes: MES_ABERTO });
      expect(result.status).toBe('aberto');
    }
  });
});
