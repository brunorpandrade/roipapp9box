// ROIP APP 9BOX — teste de integracao do sub-router `quarterlyCalculation`
// (ME-034).
//
// Exercita as 3 procedures publicas canonicas do sub-dominio (DOC 03
// §3.11 + §19.1) contra MySQL real via `createCallerFactory`. Cobre:
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `triggerRetroactiveRecalculation` com filtro de nivel e sem filtro
//     (S062); consolidacao `perTrimestre` (S063); tolerancia a falha
//     parcial via DI mockada.
//   - `getQuarterlyResults` com limit default (4) e customizado; cross-
//     company FORBIDDEN; employeeId inexistente NOT_FOUND.
//   - `getCompanyQuarterlyStatus` com meses fechados/abertos; contagem
//     de calculados; presenca/ausencia de diagnostico; trimestre invalido.
//   - Ligacao ponta-a-ponta com motor REAL do ME-033 (2-3 testes
//     canonicos).
//   - Contratos de tipo publicos (`TriggerRetroactiveResult`,
//     `CompanyQuarterlyStatus`, `RoiEngineFacade`, `DEFAULT_ROI_ENGINE`).
//
// Padrao S009 estendido a Bloco B3 (uma company local por describe, CNPJ
// unico da faixa 10000000000400..410). L32 cleanup em afterAll (todas as
// tabelas com FK compartilhada + fixture global superAdmins id=1
// preservada). JWT_SECRET fixo no arquivo. Padrao S049/S060 estendido
// para DI do motor.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  companyMonthlyData,
  employeeGoals,
  employees,
  type JobFamily,
  monthlyClosureStatus,
  performanceData,
  performanceMultiplierLog,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { appRouter } from '../../src/server/routers';
import {
  type CompanyQuarterlyStatus,
  createQuarterlyCalculationRouter,
  DEFAULT_ROI_ENGINE,
  NIVEL_HIERARQUICO_VALUES,
  type RoiEngineFacade,
  TRIMESTRE_INPUT_SCHEMA,
  type TriggerRetroactiveResult,
} from '../../src/server/routers/quarterlyCalculation';
import type { RoiCalculationResult } from '../../src/server/services/roiCalculationEngine';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me034-quarterlyCalculation';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me034-cur';

// ============================================================
// Geradores unicos (padrao S009 estendido)
// ============================================================

let cpfCounter = 20000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// ============================================================
// Fixture — company + employees + trimestre completo
// ============================================================

const CNPJ_GUARDS = '10000000000400';
const CNPJ_RETROACTIVE_MOCK = '10000000000401';
const CNPJ_RETROACTIVE_REAL = '10000000000402';
const CNPJ_RESULTS = '10000000000403';
const CNPJ_STATUS = '10000000000404';
const CNPJ_CROSS_A = '10000000000405';
const CNPJ_CROSS_B = '10000000000406';
const CNPJ_TIPOS = '10000000000407';

const NOW = new Date('2025-04-11T14:00:00Z');

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) {
    return;
  }
  // L32 cleanup canonico — mesmo padrao consolidado em ME-033.
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
    if (empIds.length > 0) {
      await client.db
        .delete(performanceMultiplierLog)
        .where(inArray(performanceMultiplierLog.employeeId, empIds));
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
      await client.db.delete(performanceData).where(inArray(performanceData.employeeId, empIds));
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
    }
    await client.db
      .delete(companyEconomicDiagnosis)
      .where(inArray(companyEconomicDiagnosis.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
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

interface CompanyOpts {
  metaROIOperacional?: string | null;
  metaROITatico?: string | null;
  metaROIEstrategico?: string | null;
  roiSegmentoMinimo?: string | null;
  roiSegmentoMaximo?: string | null;
}

async function createCompany(cnpj: string, opts: CompanyOpts = {}): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME034 Test ${cnpj} LTDA`,
      nomeFantasia: `ME034 Test ${cnpj}`,
      cnpj,
      telefone: '1633330034',
      endereco: `Rua ME-034, ${cnpj}`,
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
      metaROIOperacional: opts.metaROIOperacional === undefined ? '3.00' : opts.metaROIOperacional,
      metaROITatico: opts.metaROITatico === undefined ? '4.00' : opts.metaROITatico,
      metaROIEstrategico: opts.metaROIEstrategico === undefined ? '5.00' : opts.metaROIEstrategico,
      roiSegmentoMinimo: opts.roiSegmentoMinimo === undefined ? '2.00' : opts.roiSegmentoMinimo,
      roiSegmentoMaximo: opts.roiSegmentoMaximo === undefined ? '4.00' : opts.roiSegmentoMaximo,
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
  nivel: 'operacional' | 'tatico' | 'estrategico',
  jobFamily: JobFamily = 'vendas_comercial',
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
      jobFamily,
      senioridade: 'pleno',
      nivelHierarquico: nivel,
      departamento: 'Comercial',
      status: 'ativo',
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
      status: 'ativo',
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createCLevel: sem id');
  }
  return row.id;
}

async function createTrimestreLine(
  companyId: number,
  employeeId: number,
  trimestre: string,
  faixa: 'baixo' | 'medio' | 'alto' = 'alto',
): Promise<number> {
  const [row] = await client.db
    .insert(performanceQuarterlyData)
    .values({
      companyId,
      employeeId,
      trimestre,
      indiceDesempenho: '1.0000',
      scoreDesempenho: '100.00',
      faixaDesempenho: faixa,
      capacidadeOciosa: null,
      custoMedioTrimestral: '5000.00',
      metaROI: '3.00',
      retornoPotencial: '15000.00',
      participacao: null,
      retornoEstimado: null,
      roiEstimado: null,
      percMetaAtingida: null,
      calculadoEm: NOW,
    })
    .$returningId();
  if (!row) {
    throw new Error('createTrimestreLine: sem id');
  }
  return row.id;
}

async function createDiagnosis(
  companyId: number,
  trimestre: string,
  status: 'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia',
): Promise<void> {
  await client.db.insert(companyEconomicDiagnosis).values({
    companyId,
    trimestre,
    faturamentoMedioTrimestral: '80000.00',
    folhaTotalMedia: '30000.00',
    faturamentoPotencial: '17500.00',
    roiEmpresa: '2.6667',
    folhaPorcentagem: '37.50',
    roiSegmentoMinimo: '2.00',
    roiSegmentoMaximo: '4.00',
    roiMuitoBom: '3.00',
    faturamentoIdeal: '90000.00',
    statusDiagnostico: status,
    calculadoEm: NOW,
  });
}

async function createClosure(
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
): Promise<void> {
  await client.db.insert(monthlyClosureStatus).values({ companyId, mes, status });
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
  // Fixture global de superAdmins (setup.ts): passwordHash='x', email='fixture-test@roip.local'.
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

// ============================================================
// Fabrica de caller + DI mockada do motor
// ============================================================

interface CapturedRecalc {
  companyId: number;
  trimestre: string;
  now: Date;
}

function makeMockEngine(overrides?: { employeesCalculated?: number[]; errors?: number }): {
  engine: RoiEngineFacade;
  captured: CapturedRecalc[];
} {
  const captured: CapturedRecalc[] = [];
  const engine: RoiEngineFacade = {
    recalculateQuarter: async (_db, companyId, trimestre, now): Promise<RoiCalculationResult> => {
      captured.push({ companyId, trimestre, now });
      return {
        companyId,
        trimestre,
        ajusteRetroativo: true,
        employeesCalculated: overrides?.employeesCalculated ?? [1, 2],
        skipped: [],
        errors:
          overrides?.errors && overrides.errors > 0
            ? Array.from({ length: overrides.errors }, (_, i) => ({
                employeeId: i + 100,
                error: `erro simulado ${i}`,
              }))
            : [],
        economicDiagnosisPersisted: true,
      };
    },
  };
  return { engine, captured };
}

function bindMockedRouter() {
  const mock = makeMockEngine();
  const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx, captured: mock.captured };
}

function bindRealRouter() {
  // Sem `roiEngine` passado -> DEFAULT_ROI_ENGINE (motor real ME-033).
  const testRouter = createQuarterlyCalculationRouter();
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
// 1) Guards de autorizacao (roleProcedure + cross-company)
// ============================================================

describe('quarterlyCalculation — guards de autorizacao', () => {
  let companyId: number;
  let employeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    employeeId = await createEmployee(companyId, 'operacional');
    clevelId = await createCLevel(companyId);
    await createTrimestreLine(companyId, employeeId, '2025-Q1');
  });

  it('triggerRetroactiveRecalculation sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindMockedRouter();
    const caller = factory(ctx(null));
    await expect(caller.triggerRetroactiveRecalculation({ companyId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('triggerRetroactiveRecalculation com RH -> FORBIDDEN (nao esta em super_admin)', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.triggerRetroactiveRecalculation({ companyId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('triggerRetroactiveRecalculation com super_admin -> OK', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.triggerRetroactiveRecalculation({ companyId });
    expect(result.companyId).toBe(companyId);
    expect(result.trimestresProcessados).toContain('2025-Q1');
  });

  it('getQuarterlyResults com lider -> FORBIDDEN (S061: sem lider nesta ME)', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('lider', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getQuarterlyResults({ employeeId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('getQuarterlyResults com RH da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getQuarterlyResults({ employeeId });
    expect(result.employeeId).toBe(employeeId);
    expect(result.quarterlyResults.length).toBeGreaterThan(0);
  });

  it('getCompanyQuarterlyStatus sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindMockedRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getCompanyQuarterlyStatus({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getCompanyQuarterlyStatus com clevel da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyQuarterlyStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.companyId).toBe(companyId);
    expect(result.trimestre).toBe('2025-Q1');
  });
});

// ============================================================
// 2) triggerRetroactiveRecalculation - com DI mockada
// ============================================================

describe('triggerRetroactiveRecalculation — DI mockada', () => {
  let companyId: number;
  let empOp: number;
  let empTa: number;
  let empEs: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETROACTIVE_MOCK);
    empOp = await createEmployee(companyId, 'operacional');
    empTa = await createEmployee(companyId, 'tatico');
    empEs = await createEmployee(companyId, 'estrategico');
    await createTrimestreLine(companyId, empOp, '2024-Q3');
    await createTrimestreLine(companyId, empOp, '2024-Q4');
    await createTrimestreLine(companyId, empTa, '2024-Q4');
    await createTrimestreLine(companyId, empTa, '2025-Q1');
    await createTrimestreLine(companyId, empEs, '2025-Q1');
  });

  it('sem filtro de nivel: recalcula todos os trimestres unicos da empresa (3)', async () => {
    const mock = makeMockEngine();
    const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
    const factory = createCallerFactory(testRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    const result = await caller.triggerRetroactiveRecalculation({ companyId });
    expect(result.nivelHierarquico).toBeNull();
    // 3 trimestres distintos entre os 5 registros
    expect(result.trimestresProcessados.sort()).toEqual(['2024-Q3', '2024-Q4', '2025-Q1']);
    expect(mock.captured).toHaveLength(3);
    // Mock retorna 2 employeesCalculated e 0 errors por trimestre
    expect(result.employeesCalculatedTotal).toBe(6);
    expect(result.errorsTotal).toBe(0);
    expect(result.perTrimestre).toHaveLength(3);
  });

  it('com nivel operacional: apenas trimestres do nivel operacional (2)', async () => {
    const mock = makeMockEngine();
    const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
    const factory = createCallerFactory(testRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    const result = await caller.triggerRetroactiveRecalculation({
      companyId,
      nivelHierarquico: 'operacional',
    });
    expect(result.nivelHierarquico).toBe('operacional');
    expect(result.trimestresProcessados.sort()).toEqual(['2024-Q3', '2024-Q4']);
    expect(mock.captured).toHaveLength(2);
  });

  it('com nivel estrategico: apenas 1 trimestre', async () => {
    const mock = makeMockEngine();
    const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
    const factory = createCallerFactory(testRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    const result = await caller.triggerRetroactiveRecalculation({
      companyId,
      nivelHierarquico: 'estrategico',
    });
    expect(result.trimestresProcessados).toEqual(['2025-Q1']);
    expect(mock.captured).toHaveLength(1);
    expect(mock.captured[0]!.trimestre).toBe('2025-Q1');
  });

  it('tolerancia a falha parcial (S055): motor retorna errors, router agrega', async () => {
    const mock = makeMockEngine({ employeesCalculated: [1], errors: 2 });
    const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
    const factory = createCallerFactory(testRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    const result = await caller.triggerRetroactiveRecalculation({
      companyId,
      nivelHierarquico: 'operacional',
    });
    // 2 trimestres com 1 employee + 2 errors cada
    expect(result.employeesCalculatedTotal).toBe(2);
    expect(result.errorsTotal).toBe(4);
    for (const entry of result.perTrimestre) {
      expect(entry.employeesCalculated).toBe(1);
      expect(entry.errors).toBe(2);
    }
  });

  it('empresa inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.triggerRetroactiveRecalculation({ companyId: 999999999 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('empresa sem trimestres calculados -> lista vazia, zero erros', async () => {
    const emptyCid = await createCompany('10000000000420');
    const mock = makeMockEngine();
    const testRouter = createQuarterlyCalculationRouter({ roiEngine: mock.engine });
    const factory = createCallerFactory(testRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    const result = await caller.triggerRetroactiveRecalculation({ companyId: emptyCid });
    expect(result.trimestresProcessados).toEqual([]);
    expect(result.employeesCalculatedTotal).toBe(0);
    expect(result.errorsTotal).toBe(0);
    expect(mock.captured).toHaveLength(0);
  });
});

// ============================================================
// 3) triggerRetroactiveRecalculation - motor REAL (ME-033)
// ============================================================

describe('triggerRetroactiveRecalculation — motor real ME-033 (ligacao ponta-a-ponta)', () => {
  let companyId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETROACTIVE_REAL);
    empId = await createEmployee(companyId, 'operacional');
    // Fixture minimo: 3 meses fechados + performance data para o motor
    // real ter dados suficientes para calcular.
    await client.db.insert(employeeGoals).values({
      employeeId: empId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Var1',
      unit: 'un',
      weight: '100.00',
      goal: '100.00',
      updatedBy: 'rh',
    });
    for (const mes of ['2025-01', '2025-02', '2025-03']) {
      await createClosure(companyId, mes, 'fechado');
      await client.db.insert(companyMonthlyData).values({
        companyId,
        mes,
        faturamentoBruto: '80000.00',
        diasUteis: 22,
      });
      const [perf] = await client.db
        .insert(performanceData)
        .values({
          companyId,
          employeeId: empId,
          mes,
          custoTotalMes: '5000.00',
          faltas: 0,
        })
        .$returningId();
      await client.db.insert(performanceVariableData).values({
        performanceDataId: perf!.id,
        variableIndex: 1,
        demanda: '100.00',
        executado: '100.00',
      });
    }
    // Pre-existente: 1 trimestre calculado no passado.
    await createTrimestreLine(companyId, empId, '2025-Q1');
  });

  it('motor real ligado via DEFAULT_ROI_ENGINE: recalcula 1 trimestre e persiste', async () => {
    const { factory, ctx } = bindRealRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.triggerRetroactiveRecalculation({ companyId });
    expect(result.trimestresProcessados).toEqual(['2025-Q1']);
    expect(result.employeesCalculatedTotal).toBeGreaterThan(0);
    // Motor real grava linha em performanceMultiplierLog com ajusteRetroativo=true
    const logs = await client.db
      .select()
      .from(performanceMultiplierLog)
      .where(inArray(performanceMultiplierLog.employeeId, [empId]));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const ultimo = logs[logs.length - 1];
    expect(ultimo!.ajusteRetroativo).toBe(true);
  });
});

// ============================================================
// 4) getQuarterlyResults
// ============================================================

describe('getQuarterlyResults', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RESULTS);
    employeeId = await createEmployee(companyId, 'operacional');
    // 6 trimestres para exercitar limit
    for (const t of ['2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4']) {
      await createTrimestreLine(companyId, employeeId, t);
    }
  });

  it('limit default (4): retorna as 4 mais recentes ordenadas desc', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getQuarterlyResults({ employeeId });
    expect(result.quarterlyResults).toHaveLength(4);
    const trimestres = result.quarterlyResults.map((r) => r.trimestre);
    expect(trimestres).toEqual(['2024-Q4', '2024-Q3', '2024-Q2', '2024-Q1']);
  });

  it('limit customizado (2): retorna as 2 mais recentes', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getQuarterlyResults({ employeeId, limit: 2 });
    expect(result.quarterlyResults).toHaveLength(2);
    expect(result.quarterlyResults.map((r) => r.trimestre)).toEqual(['2024-Q4', '2024-Q3']);
  });

  it('limit = 20 (max): sem excecao; retorna todos os 6', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getQuarterlyResults({ employeeId, limit: 20 });
    expect(result.quarterlyResults).toHaveLength(6);
  });

  it('employee inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(caller.getQuarterlyResults({ employeeId: 999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('super_admin acessa employee de qualquer empresa', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getQuarterlyResults({ employeeId });
    expect(result.employeeId).toBe(employeeId);
  });

  it('limit invalido (0) -> BAD_REQUEST via zod', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getQuarterlyResults({ employeeId, limit: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('limit acima do max (21) -> BAD_REQUEST via zod', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getQuarterlyResults({ employeeId, limit: 21 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

// ============================================================
// 5) getCompanyQuarterlyStatus
// ============================================================

describe('getCompanyQuarterlyStatus', () => {
  let companyId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS);
    empId = await createEmployee(companyId, 'operacional');
    await createClosure(companyId, '2025-01', 'fechado');
    await createClosure(companyId, '2025-02', 'fechado');
    await createClosure(companyId, '2025-03', 'aberto'); // 1 aberto
    await createTrimestreLine(companyId, empId, '2025-Q1');
    // Sem diagnostico persistido ainda
  });

  it('trimestre com 2 meses fechados e 1 aberto', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', empId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyQuarterlyStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.mesesFechados.sort()).toEqual(['2025-01', '2025-02']);
    expect(result.mesesAbertos).toEqual(['2025-03']);
    expect(result.employeesCalculated).toBe(1);
    expect(result.diagnosisPersisted).toBe(false);
    expect(result.statusDiagnostico).toBeNull();
  });

  it('trimestre com diagnostico persistido: statusDiagnostico populado', async () => {
    await createDiagnosis(companyId, '2025-Q1', 'aceitavel');
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', empId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyQuarterlyStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.diagnosisPersisted).toBe(true);
    expect(result.statusDiagnostico).toBe('aceitavel');
  });

  it('trimestre sem meses ainda registrados: 3 abertos, 0 fechados', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', empId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyQuarterlyStatus({
      companyId,
      trimestre: '2024-Q4',
    });
    expect(result.mesesFechados).toEqual([]);
    expect(result.mesesAbertos.sort()).toEqual(['2024-10', '2024-11', '2024-12']);
    expect(result.employeesCalculated).toBe(0);
    expect(result.diagnosisPersisted).toBe(false);
  });

  it('trimestre invalido (regex) -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyQuarterlyStatus({ companyId, trimestre: '2025-Q9' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.getCompanyQuarterlyStatus({ companyId, trimestre: 'invalido' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 6) Cross-company FORBIDDEN
// ============================================================

describe('quarterlyCalculation — isolamento cross-company (§2.4)', () => {
  let companyA: number;
  let companyB: number;
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_CROSS_A);
    companyB = await createCompany(CNPJ_CROSS_B);
    empA = await createEmployee(companyA, 'operacional');
    empB = await createEmployee(companyB, 'operacional');
    await createTrimestreLine(companyA, empA, '2025-Q1');
    await createTrimestreLine(companyB, empB, '2025-Q1');
  });

  it('getQuarterlyResults: RH de A NAO ve employee de B (FORBIDDEN)', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', empA, companyA);
    const caller = factory(ctx(bearer));
    await expect(caller.getQuarterlyResults({ employeeId: empB })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('getCompanyQuarterlyStatus: RH de A NAO ve empresa B (FORBIDDEN)', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenPlatform('rh', empA, companyA);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyQuarterlyStatus({ companyId: companyB, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin atravessa: acessa employee de qualquer empresa', async () => {
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const resA = await caller.getQuarterlyResults({ employeeId: empA });
    const resB = await caller.getQuarterlyResults({ employeeId: empB });
    expect(resA.employeeId).toBe(empA);
    expect(resB.employeeId).toBe(empB);
  });
});

// ============================================================
// 7) Acoplamento com appRouter (registro canonico do sub-router)
// ============================================================

describe('appRouter acopla quarterlyCalculation', () => {
  it('appRouter expoe quarterlyCalculation.* como sub-router', async () => {
    // Assert de tipo: se o namespace nao existisse no appRouter, o
    // typecheck do arquivo falharia. Aqui verificamos que o caller do
    // appRouter aceita as procs sob o namespace canonico.
    const factory = createCallerFactory(appRouter);
    const bearer = await tokenSuperAdmin();
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: bearer,
      }),
    );
    // Cria fixture minima para a chamada nao dar NOT_FOUND por empresa.
    const cid = await createCompany('10000000000430');
    const result = await caller.quarterlyCalculation.triggerRetroactiveRecalculation({
      companyId: cid,
    });
    expect(result.companyId).toBe(cid);
    expect(result.trimestresProcessados).toEqual([]);
  });
});

// ============================================================
// 8) Contratos de tipo e defaults canonicos
// ============================================================

describe('contratos de tipo e defaults canonicos', () => {
  it('NIVEL_HIERARQUICO_VALUES tem 3 literais canonicos', () => {
    expect(NIVEL_HIERARQUICO_VALUES).toEqual(['operacional', 'tatico', 'estrategico']);
  });

  it('TRIMESTRE_INPUT_SCHEMA aceita YYYY-Q1..Q4 e rejeita outros', () => {
    expect(TRIMESTRE_INPUT_SCHEMA.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA.safeParse('2025-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA.safeParse('2025-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA.safeParse('25-Q1').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA.safeParse('2025-01').success).toBe(false);
  });

  it('DEFAULT_ROI_ENGINE tem assinatura RoiEngineFacade correta', () => {
    expect(typeof DEFAULT_ROI_ENGINE.recalculateQuarter).toBe('function');
    // Contrato de tipo (compile-time): se DEFAULT_ROI_ENGINE nao fosse
    // RoiEngineFacade, o typecheck do arquivo falharia.
    const casted: RoiEngineFacade = DEFAULT_ROI_ENGINE;
    expect(casted.recalculateQuarter).toBe(DEFAULT_ROI_ENGINE.recalculateQuarter);
  });

  it('tipos publicos TriggerRetroactiveResult e CompanyQuarterlyStatus sao usaveis', async () => {
    const cid = await createCompany(CNPJ_TIPOS);
    const empId = await createEmployee(cid, 'operacional');
    await createTrimestreLine(cid, empId, '2025-Q1');
    const { factory, ctx } = bindMockedRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const trig: TriggerRetroactiveResult = await caller.triggerRetroactiveRecalculation({
      companyId: cid,
    });
    const stat: CompanyQuarterlyStatus = await caller.getCompanyQuarterlyStatus({
      companyId: cid,
      trimestre: '2025-Q1',
    });
    expect(trig.companyId).toBe(cid);
    expect(stat.companyId).toBe(cid);
  });
});
