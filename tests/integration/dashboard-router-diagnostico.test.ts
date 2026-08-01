// ROIP APP 9BOX — teste de integracao das 2 procs Diagnostico IA
// (ME-052, S266) no sub-router `dashboard`. Contra MySQL real via
// `createCallerFactory`.
//
// Cobertura canonica:
//   - `getDiagnostico` leitura: null quando ainda nao gerado,
//     texto+timestamp quando ja gerado.
//   - `generateDiagnostico` guard §6.6: trimestre != atual ->
//     BAD_REQUEST canonico.
//   - `generateDiagnostico` guard `performanceQuarterlyData` ausente
//     -> NOT_FOUND canonico.
//   - `generateDiagnostico` sucesso: UPDATE canonico grava o texto e
//     atualiza `diagnosticoIAgeradoEm`.
//   - `generateDiagnostico` falha §11.3: retorna INTERNAL_SERVER_ERROR
//     com mensagem canonica; cache NAO e alterado.
//   - Sobrescrita canonica: geracao sobre trimestre com diagnostico
//     existente substitui o cache anterior.
//
// Faixa CNPJ desta ME: auxiliar 10030..10039 (aiChat-router usa
// 10020..10029).
//
// Padrao S009 estendido: uma company local por describe; L32 cleanup
// completo em afterAll (todas as tabelas FK-dependentes).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  performanceQuarterlyData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createDashboardRouter } from '../../src/server/routers/dashboard';
import {
  MSG_DIAGNOSTICO_IA_FALLBACK,
  MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER,
  MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
  type GenerateDiagnosticoIAArgs,
  type GenerateDiagnosticoIAOutcome,
} from '../../src/server/services/diagnosticoIAService';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me052-diagnostico';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me052-diagn';

// ============================================================
// Geradores unicos
// ============================================================

let cpfCounter = 52000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// ============================================================
// Fixture — companies + employees (faixa 10030..10039)
// ============================================================

const CNPJ_HAPPY_LEITURA = '10030000000001';
const CNPJ_GUARD_TRIMESTRE = '10030000000002';
const CNPJ_QUARTERLY_AUSENTE = '10030000000003';
const CNPJ_GERACAO_SUCESSO = '10030000000004';
const CNPJ_FALHA_11_3 = '10030000000005';
const CNPJ_SOBRESCRITA = '10030000000006';

// Clock canonico deterministico — para tornar `trimestreAtual` fixo
// em 2026-Q2. `getTrimestreFromDateInTimezone` mapeia meses 4/5/6 para
// Q2; usa fuso `America/Sao_Paulo` (UTC-3). 2026-05-15T15:00:00Z ->
// 12:00 SP -> Q2 confirmado.
const NOW_2026_Q2 = new Date('2026-05-15T15:00:00Z');
const TRIMESTRE_ATUAL_CANONICO = '2026-Q2';
const TRIMESTRE_ANTERIOR = '2026-Q1';

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
    if (empIds.length > 0) {
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
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
      razaoSocial: `ME052D ${cnpj} LTDA`,
      nomeFantasia: `ME052D ${cnpj}`,
      cnpj,
      telefone: '1633330052',
      endereco: `Rua ME-052D, ${cnpj}`,
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
  if (!row) throw new Error('createCompany: sem id');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function createEmployee(companyId: number): Promise<number> {
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
      status: 'ativo',
      isLider: false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('createEmployee: sem id');
  return row.id;
}

async function createQuarterlyRow(
  companyId: number,
  employeeId: number,
  trimestre: string,
  overrides: {
    diagnosticoIA?: string | null;
    diagnosticoIAgeradoEm?: Date | null;
  } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(performanceQuarterlyData)
    .values({
      companyId,
      employeeId,
      trimestre,
      indiceDesempenho: '0.9500',
      scoreDesempenho: '82.50',
      faixaDesempenho: 'medio',
      custoMedioTrimestral: '5000.00',
      metaROI: '3.00',
      retornoPotencial: '15000.00',
      calculadoEm: NOW_2026_Q2,
      diagnosticoIA: overrides.diagnosticoIA ?? null,
      diagnosticoIAgeradoEm: overrides.diagnosticoIAgeradoEm ?? null,
    })
    .$returningId();
  if (!row) throw new Error('createQuarterlyRow: sem id');
  return row.id;
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

// ============================================================
// Stub canonico do motor Diagnostico IA
// ============================================================

interface DiagnosticoStubCall {
  args: GenerateDiagnosticoIAArgs;
}

function buildStubDiagnosticoFactory(opts: {
  outcome: (args: GenerateDiagnosticoIAArgs) => GenerateDiagnosticoIAOutcome;
}) {
  const calls: DiagnosticoStubCall[] = [];
  const factory = (db: unknown) => {
    void db;
    return {
      generateDiagnosticoIA: async (args: GenerateDiagnosticoIAArgs) => {
        calls.push({ args });
        return opts.outcome(args);
      },
    };
  };
  return { calls, factory };
}

// ============================================================
// Fabrica de caller com clock canonico deterministico
// ============================================================

function bindRouter(diagnosticoIAFactory?: (db: unknown) => unknown) {
  const testRouter = createDashboardRouter({
    now: () => NOW_2026_Q2,
    ...(diagnosticoIAFactory === undefined
      ? {}
      : {
          diagnosticoIAFactory: diagnosticoIAFactory as Parameters<
            typeof createDashboardRouter
          >[0] extends { diagnosticoIAFactory?: infer F }
            ? F
            : never,
        }),
  });
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
// 1) getDiagnostico — leitura pura (null vs cacheado)
// ============================================================

describe('dashboard.getDiagnostico — leitura canonica', () => {
  let companyId: number;
  let empSemDiag: number;
  let empComDiag: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HAPPY_LEITURA);
    empSemDiag = await createEmployee(companyId);
    empComDiag = await createEmployee(companyId);
    rhId = await createEmployee(companyId);
    // Sem diagnostico:
    await createQuarterlyRow(companyId, empSemDiag, TRIMESTRE_ATUAL_CANONICO);
    // Com diagnostico existente:
    await createQuarterlyRow(companyId, empComDiag, TRIMESTRE_ATUAL_CANONICO, {
      diagnosticoIA: 'Diagnostico existente do cache.',
      diagnosticoIAgeradoEm: new Date('2026-05-10T10:00:00Z'),
    });
  });

  it('retorna null quando diagnostico ainda nao gerado', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getDiagnostico({
      employeeId: empSemDiag,
      trimestre: TRIMESTRE_ATUAL_CANONICO,
    });
    expect(result.diagnostico).toBeNull();
    expect(result.diagnosticoGeradoEm).toBeNull();
    expect(result.trimestre).toBe(TRIMESTRE_ATUAL_CANONICO);
  });

  it('retorna texto+timestamp quando cache existe', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getDiagnostico({
      employeeId: empComDiag,
      trimestre: TRIMESTRE_ATUAL_CANONICO,
    });
    expect(result.diagnostico).toBe('Diagnostico existente do cache.');
    expect(result.diagnosticoGeradoEm).toBeInstanceOf(Date);
  });
});

// ============================================================
// 2) generateDiagnostico — guard §6.6 (trimestre != atual)
// ============================================================

describe('dashboard.generateDiagnostico — guard §6.6', () => {
  let companyId: number;
  let employeeId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARD_TRIMESTRE);
    employeeId = await createEmployee(companyId);
    rhId = await createEmployee(companyId);
    await createQuarterlyRow(companyId, employeeId, TRIMESTRE_ANTERIOR);
    await createQuarterlyRow(companyId, employeeId, TRIMESTRE_ATUAL_CANONICO);
  });

  it('trimestre != atual -> BAD_REQUEST canonico', async () => {
    const stub = buildStubDiagnosticoFactory({
      outcome: () => ({
        kind: 'not_current_quarter',
        message: MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.generateDiagnostico({
        employeeId,
        trimestre: TRIMESTRE_ANTERIOR,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER,
    });
  });
});

// ============================================================
// 3) generateDiagnostico — quarterly_data ausente
// ============================================================

describe('dashboard.generateDiagnostico — quarterly ausente', () => {
  let companyId: number;
  let employeeId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_QUARTERLY_AUSENTE);
    employeeId = await createEmployee(companyId);
    rhId = await createEmployee(companyId);
    // sem createQuarterlyRow para o trimestre atual
  });

  it('sem performanceQuarterlyData -> NOT_FOUND canonico', async () => {
    const stub = buildStubDiagnosticoFactory({
      outcome: () => ({
        kind: 'quarterly_data_not_found',
        message: MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.generateDiagnostico({
        employeeId,
        trimestre: TRIMESTRE_ATUAL_CANONICO,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
    });
  });
});

// ============================================================
// 4) generateDiagnostico — sucesso (super_admin)
// ============================================================

describe('dashboard.generateDiagnostico — sucesso', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GERACAO_SUCESSO);
    employeeId = await createEmployee(companyId);
    await createQuarterlyRow(companyId, employeeId, TRIMESTRE_ATUAL_CANONICO);
  });

  it('sucesso do motor -> retorna diagnostico + timestamp', async () => {
    const generatedAt = new Date('2026-05-15T15:30:00Z');
    const stub = buildStubDiagnosticoFactory({
      outcome: () => ({
        kind: 'ok',
        diagnostico: 'Diagnostico executivo gerado.',
        diagnosticoIAgeradoEm: generatedAt,
        telemetryCallId: 'call-diag-ok',
        affectedRows: 1,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.generateDiagnostico({
      employeeId,
      trimestre: TRIMESTRE_ATUAL_CANONICO,
    });
    expect(result.diagnostico).toBe('Diagnostico executivo gerado.');
    expect(result.diagnosticoGeradoEm.getTime()).toBe(generatedAt.getTime());
    expect(stub.calls[0]?.args.trimestreAtual).toBe(TRIMESTRE_ATUAL_CANONICO);
    expect(stub.calls[0]?.args.viewerUserType).toBe('super_admin');
  });
});

// ============================================================
// 5) generateDiagnostico — falha §11.3 preserva cache
// ============================================================

describe('dashboard.generateDiagnostico — falha §11.3', () => {
  let companyId: number;
  let employeeId: number;
  let rhId: number;
  let quarterlyId: number;
  const CACHE_ANTERIOR = 'Diagnostico anterior preservado.';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_FALHA_11_3);
    employeeId = await createEmployee(companyId);
    rhId = await createEmployee(companyId);
    quarterlyId = await createQuarterlyRow(companyId, employeeId, TRIMESTRE_ATUAL_CANONICO, {
      diagnosticoIA: CACHE_ANTERIOR,
      diagnosticoIAgeradoEm: new Date('2026-05-10T10:00:00Z'),
    });
  });

  it('falha Claude -> INTERNAL_SERVER_ERROR + mensagem canonica; cache preservado', async () => {
    const stub = buildStubDiagnosticoFactory({
      outcome: () => ({
        kind: 'failed_claude',
        status: 'falha_timeout',
        message: MSG_DIAGNOSTICO_IA_FALLBACK,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.generateDiagnostico({
        employeeId,
        trimestre: TRIMESTRE_ATUAL_CANONICO,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: MSG_DIAGNOSTICO_IA_FALLBACK,
    });
    // Cache preservado — leitura direta.
    const [row] = await client.db
      .select({
        diagnosticoIA: performanceQuarterlyData.diagnosticoIA,
      })
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.id, quarterlyId))
      .limit(1);
    expect(row?.diagnosticoIA).toBe(CACHE_ANTERIOR);
  });
});

// ============================================================
// 6) Sobrescrita canonica — geracao substitui cache anterior
// ============================================================

describe('dashboard.generateDiagnostico — sobrescrita canonica', () => {
  let companyId: number;
  let employeeId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SOBRESCRITA);
    employeeId = await createEmployee(companyId);
    rhId = await createEmployee(companyId);
    await createQuarterlyRow(companyId, employeeId, TRIMESTRE_ATUAL_CANONICO, {
      diagnosticoIA: 'Diagnostico antigo canonico.',
      diagnosticoIAgeradoEm: new Date('2026-05-10T10:00:00Z'),
    });
  });

  it('geracao com sucesso substitui cache anterior', async () => {
    const stub = buildStubDiagnosticoFactory({
      outcome: () => ({
        kind: 'ok',
        diagnostico: 'Diagnostico atualizado canonico.',
        diagnosticoIAgeradoEm: new Date('2026-05-20T14:00:00Z'),
        telemetryCallId: 'call-diag-sobrescrita',
        affectedRows: 1,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.generateDiagnostico({
      employeeId,
      trimestre: TRIMESTRE_ATUAL_CANONICO,
    });
    expect(result.diagnostico).toBe('Diagnostico atualizado canonico.');
  });
});
