// ROIP APP 9BOX — teste de integracao do sub-router `dashboard` (ME-035).
//
// Exercita as 2 procedures publicas canonicas do sub-dominio (DOC 03
// §3.11 + §19.1) contra MySQL real via `createCallerFactory`. Cobre:
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `getEmployeeDashboard` com Eixo X, Eixo Y (nullable) e 9-Box
//     (nullable) — S065; guard de inativo (§3.13); guard S066 (lider
//     direto via `employeeLeaderHistory`); dashboard proprio do lider
//     permitido; historico com limit default/customizado; cap.
//   - `getCompanyEconomicDashboard` com mascaramento canonico (matriz
//     DOC 02 §3.3): Bruno/RH/RH-Lider/C-level acessoTotal=true -> 5/5;
//     C-level acessoTotal=false -> 3/5 (roiEmpresa e folhaPorcentagem
//     null); lider -> FORBIDDEN.
//   - Contratos publicos exportados
//     (`DASHBOARD_HISTORY_LIMIT_CAP`, `DASHBOARD_HISTORY_LIMIT_DEFAULT`,
//     `TRIMESTRE_INPUT_SCHEMA_DASHBOARD`, tipos
//     `EmployeeDashboardResult` e `CompanyEconomicDashboardResult`).
//
// Padrao S009 estendido a Bloco B3 (uma company local por describe, CNPJ
// unico da faixa 10000000000600..615). L32 cleanup em afterAll (todas
// as tabelas com FK compartilhada + fixture global superAdmins id=1
// preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  employeeLeaderHistory,
  employees,
  nineBoxClassifications,
  performanceQuarterlyData,
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
  type CompanyEconomicDashboardResult,
  createDashboardRouter,
  DASHBOARD_HISTORY_LIMIT_CAP,
  DASHBOARD_HISTORY_LIMIT_DEFAULT,
  type EmployeeDashboardResult,
  TRIMESTRE_INPUT_SCHEMA_DASHBOARD,
} from '../../src/server/routers/dashboard';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me035-dashboard';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me035-dash';

// ============================================================
// Geradores unicos (padrao S009 estendido)
// ============================================================

let cpfCounter = 22000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// UUID minimo determinístico para `transferBatchId` (36 chars — o formato
// canonico e char(36)). Nao precisa ser válido conforme RFC — o schema so
// exige largura fixa.
let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me035${seq}`;
}

// ============================================================
// Fixture — companies + employees + trimestres + plenitude + 9box
// ============================================================

const CNPJ_GUARDS = '10000000000600';
const CNPJ_INATIVO = '10000000000601';
const CNPJ_LIDER = '10000000000602';
const CNPJ_MASK_ACESSO_TOTAL = '10000000000603';
const CNPJ_MASK_SEM_DIAG = '10000000000605';
const CNPJ_CROSS_A = '10000000000606';
const CNPJ_CROSS_B = '10000000000607';
const CNPJ_HISTORY = '10000000000608';
const CNPJ_NULL_YZ = '10000000000609';

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
      await client.db
        .delete(nineBoxClassifications)
        .where(inArray(nineBoxClassifications.employeeId, empIds));
      await client.db.delete(plenitudeData).where(inArray(plenitudeData.employeeId, empIds));
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
    }
    await client.db
      .delete(companyEconomicDiagnosis)
      .where(inArray(companyEconomicDiagnosis.companyId, createdCompanyIds));
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
      razaoSocial: `ME035D Test ${cnpj} LTDA`,
      nomeFantasia: `ME035D Test ${cnpj}`,
      cnpj,
      telefone: '1633330036',
      endereco: `Rua ME-035, ${cnpj}`,
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
  opts: { status?: 'ativo' | 'inativo'; isLider?: boolean } = {},
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
      isLider: opts.isLider ?? false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function createCLevel(companyId: number, acessoTotal: boolean): Promise<number> {
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
      acessoTotal,
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
  scoreDesempenho = '82.50',
  faixa: 'baixo' | 'medio' | 'alto' = 'medio',
): Promise<void> {
  await client.db.insert(performanceQuarterlyData).values({
    companyId,
    employeeId,
    trimestre,
    indiceDesempenho: '0.9800',
    scoreDesempenho,
    faixaDesempenho: faixa,
    capacidadeOciosa: null,
    custoMedioTrimestral: '5000.00',
    metaROI: '3.00',
    retornoPotencial: '15000.00',
    calculadoEm: NOW,
  });
}

async function createPlenitude(
  companyId: number,
  employeeId: number,
  trimestre: string,
  plenitudeScore = '72.50',
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    scoreA: '70.00',
    scoreC: '74.00',
    plenitudeScore,
    faixaPlenitude: 'media',
    divergencia: '4.00',
    alertaDivergencia: false,
    engajamentoA: '80.00',
    engajamentoC: '75.00',
    desenvolvimentoA: '65.00',
    desenvolvimentoC: '70.00',
    pertencimentoA: '70.00',
    pertencimentoC: '72.00',
    realizacaoA: '65.00',
    realizacaoC: '79.00',
    calculadoEm: NOW,
  });
}

async function createNineBox(
  companyId: number,
  employeeId: number,
  trimestre: string,
  quadrante: 'EQUILÍBRIO FRÁGIL' | 'ALTO IMPACTO' = 'EQUILÍBRIO FRÁGIL',
): Promise<void> {
  await client.db.insert(nineBoxClassifications).values({
    companyId,
    employeeId,
    trimestre,
    scoreDesempenho: '82.50',
    plenitudeScore: '72.50',
    posicaoX: 'medio',
    posicaoY: 'media',
    quadrante,
    quadranteAnterior: null,
    direcaoMovimento: 'primeira_vez',
    calculadoEm: NOW,
  });
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

async function linkLeader(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture de teste dashboard-router ME-035',
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
  const testRouter = createDashboardRouter();
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

describe('dashboard — guards de autorizacao', () => {
  let companyId: number;
  let employeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    employeeId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId, true);
    await createTrimestreLine(companyId, employeeId, '2025-Q1');
    await createDiagnosis(companyId, '2025-Q1', 'aceitavel');
  });

  it('getEmployeeDashboard sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.getEmployeeDashboard({ employeeId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('getEmployeeDashboard com RH da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId });
    expect(result.employee.id).toBe(employeeId);
    expect(result.employee.companyId).toBe(companyId);
    expect(result.latestQuarterly).not.toBeNull();
  });

  it('getEmployeeDashboard com super_admin -> OK (atravessa companyId)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId });
    expect(result.employee.id).toBe(employeeId);
  });

  it('getEmployeeDashboard com clevel da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId });
    expect(result.employee.id).toBe(employeeId);
  });

  it('getEmployeeDashboard employeeId inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: 99999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('getCompanyEconomicDashboard sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ============================================================
// 2) Cross-company: mesma role, empresa diferente
// ============================================================

describe('dashboard — cross-company guard §2.4', () => {
  let companyA: number;
  let companyB: number;
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_CROSS_A);
    companyB = await createCompany(CNPJ_CROSS_B);
    empA = await createEmployee(companyA);
    empB = await createEmployee(companyB);
    await createTrimestreLine(companyA, empA, '2025-Q1');
    await createTrimestreLine(companyB, empB, '2025-Q1');
    await createDiagnosis(companyA, '2025-Q1', 'excelente');
  });

  it('RH de B tentando ler dashboard de emp de A -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empB, companyB);
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: empA })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('RH de B tentando dashboard economico de A -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empB, companyB);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyEconomicDashboard({ companyId: companyA, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin ignora cross-company (atravessa) -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const r = await caller.getEmployeeDashboard({ employeeId: empA });
    expect(r.employee.id).toBe(empA);
  });
});

// ============================================================
// 3) Guard §3.13 — colaborador inativo (Bruno e RH atravessam)
// ============================================================

describe('dashboard — guard inativo §3.13', () => {
  let companyId: number;
  let empInativo: number;
  let empAtivo: number;
  let clevelId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INATIVO);
    empInativo = await createEmployee(companyId, { status: 'inativo' });
    empAtivo = await createEmployee(companyId);
    liderId = await createEmployee(companyId, { isLider: true });
    clevelId = await createCLevel(companyId, true);
    await createTrimestreLine(companyId, empInativo, '2025-Q1');
  });

  it('inativo com super_admin -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empInativo });
    expect(result.employee.status).toBe('inativo');
  });

  it('inativo com RH -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empAtivo, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empInativo });
    expect(result.employee.status).toBe('inativo');
  });

  it('inativo com RH-Lider -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh_lider', empAtivo, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empInativo });
    expect(result.employee.status).toBe('inativo');
  });

  it('inativo com clevel -> FORBIDDEN §3.13', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: empInativo })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('inativo com lider da propria cadeia -> FORBIDDEN §3.13', async () => {
    // Mesmo com vinculo direto, inativo bloqueia lider por §3.13.
    await linkLeader(empInativo, liderId);
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: empInativo })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ============================================================
// 4) Guard S066 — lider so ve cadeia direta
// ============================================================

describe('dashboard — guard S066 lider cadeia direta', () => {
  let companyId: number;
  let liderA: number;
  let liderB: number;
  let liderado: number;
  let semLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIDER);
    liderA = await createEmployee(companyId, { isLider: true });
    liderB = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    semLider = await createEmployee(companyId);
    await linkLeader(liderado, liderA);
    await createTrimestreLine(companyId, liderado, '2025-Q1');
    await createTrimestreLine(companyId, semLider, '2025-Q1');
    await createTrimestreLine(companyId, liderA, '2025-Q1');
  });

  it('liderA ve o proprio liderado direto -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderA, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: liderado });
    expect(result.employee.id).toBe(liderado);
  });

  it('liderB tenta ver liderado do A -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderB, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('liderA tenta ver colaborador sem lider registrado -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderA, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getEmployeeDashboard({ employeeId: semLider })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('liderA ve o proprio dashboard (auto) -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderA, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: liderA });
    expect(result.employee.id).toBe(liderA);
  });
});

// ============================================================
// 5) S065 — Eixo Y (plenitude) e 9-Box nullable
// ============================================================

describe('dashboard — S065 Eixo Y e 9-Box nullable', () => {
  let companyId: number;
  let empSemY: number;
  let empComY: number;
  let empComY9: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_NULL_YZ);
    empSemY = await createEmployee(companyId);
    empComY = await createEmployee(companyId);
    empComY9 = await createEmployee(companyId);
    // empSemY: apenas Eixo X.
    await createTrimestreLine(companyId, empSemY, '2025-Q1', '77.00', 'medio');
    // empComY: Eixo X + plenitude, mas SEM 9-Box (§7.1 — motivo em log).
    await createTrimestreLine(companyId, empComY, '2025-Q1', '77.00', 'medio');
    await createPlenitude(companyId, empComY, '2025-Q1', '72.50');
    // empComY9: os 3 blocos completos.
    await createTrimestreLine(companyId, empComY9, '2025-Q1', '82.50', 'medio');
    await createPlenitude(companyId, empComY9, '2025-Q1', '72.50');
    await createNineBox(companyId, empComY9, '2025-Q1', 'EQUILÍBRIO FRÁGIL');
  });

  it('sem Eixo Y e sem 9-Box: latestPlenitude e latestNineBox NULL', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empSemY });
    expect(result.latestQuarterly).not.toBeNull();
    expect(result.latestPlenitude).toBeNull();
    expect(result.latestNineBox).toBeNull();
  });

  it('com Eixo Y e sem 9-Box: latestPlenitude != NULL, latestNineBox NULL', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empComY });
    expect(result.latestQuarterly).not.toBeNull();
    expect(result.latestPlenitude).not.toBeNull();
    expect(result.latestPlenitude?.plenitudeScore).toBe('72.50');
    expect(result.latestNineBox).toBeNull();
  });

  it('com Eixo Y e 9-Box completos: os 3 nao NULL', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId: empComY9 });
    expect(result.latestQuarterly).not.toBeNull();
    expect(result.latestPlenitude).not.toBeNull();
    expect(result.latestNineBox).not.toBeNull();
    expect(result.latestNineBox?.quadrante).toBe('EQUILÍBRIO FRÁGIL');
    expect(result.latestNineBox?.direcaoMovimento).toBe('primeira_vez');
  });
});

// ============================================================
// 6) getEmployeeDashboard — history limit
// ============================================================

describe('dashboard — history limit', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HISTORY);
    employeeId = await createEmployee(companyId);
    // 6 trimestres em ordem aleatoria
    await createTrimestreLine(companyId, employeeId, '2024-Q1');
    await createTrimestreLine(companyId, employeeId, '2023-Q4');
    await createTrimestreLine(companyId, employeeId, '2024-Q2');
    await createTrimestreLine(companyId, employeeId, '2024-Q3');
    await createTrimestreLine(companyId, employeeId, '2024-Q4');
    await createTrimestreLine(companyId, employeeId, '2025-Q1');
  });

  it('default historyLimit -> 4 linhas em ordem DESC', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId });
    expect(result.history).toHaveLength(4);
    expect(result.history.map((r) => r.trimestre)).toEqual([
      '2025-Q1',
      '2024-Q4',
      '2024-Q3',
      '2024-Q2',
    ]);
    // latestQuarterly === history[0]
    expect(result.latestQuarterly?.trimestre).toBe('2025-Q1');
  });

  it('historyLimit customizado 2', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({ employeeId, historyLimit: 2 });
    expect(result.history).toHaveLength(2);
    expect(result.history[0]?.trimestre).toBe('2025-Q1');
    expect(result.history[1]?.trimestre).toBe('2024-Q4');
  });

  it('historyLimit acima do cap -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getEmployeeDashboard({ employeeId, historyLimit: DASHBOARD_HISTORY_LIMIT_CAP + 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('historyLimit exatamente no cap -> OK (6 <= 20)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getEmployeeDashboard({
      employeeId,
      historyLimit: DASHBOARD_HISTORY_LIMIT_CAP,
    });
    expect(result.history).toHaveLength(6);
  });
});

// ============================================================
// 7) getCompanyEconomicDashboard — mascaramento S067 (matriz §3.3)
// ============================================================

describe('getCompanyEconomicDashboard — S067 mascaramento matriz §3.3', () => {
  let companyId: number;
  let clevelTotal: number;
  let clevelLimitado: number;
  let empRH: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_MASK_ACESSO_TOTAL);
    clevelTotal = await createCLevel(companyId, true);
    clevelLimitado = await createCLevel(companyId, false);
    empRH = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await createDiagnosis(companyId, '2025-Q1', 'muito_bom');
  });

  it('Bruno -> 5/5 cards, masked ambos false', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosisPersisted).toBe(true);
    expect(result.faturamentoMedioMensal).toBe('80000.00');
    expect(result.folhaTotalMedia).toBe('30000.00');
    expect(result.roiEmpresa).toBe('2.6667');
    expect(result.statusDiagnostico).toBe('muito_bom');
    expect(result.folhaPorcentagem).toBe('37.50');
    expect(result.masked.roiEmpresa).toBe(false);
    expect(result.masked.folhaPorcentagem).toBe(false);
  });

  it('RH -> 5/5 cards, masked ambos false', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.roiEmpresa).toBe('2.6667');
    expect(result.folhaPorcentagem).toBe('37.50');
    expect(result.masked.roiEmpresa).toBe(false);
    expect(result.masked.folhaPorcentagem).toBe(false);
  });

  it('RH-Lider -> 5/5 cards, masked ambos false', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh_lider', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.roiEmpresa).toBe('2.6667');
    expect(result.masked.roiEmpresa).toBe(false);
  });

  it('C-level acessoTotal=true -> 5/5 cards, masked ambos false', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelTotal, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.roiEmpresa).toBe('2.6667');
    expect(result.folhaPorcentagem).toBe('37.50');
    expect(result.masked.roiEmpresa).toBe(false);
    expect(result.masked.folhaPorcentagem).toBe(false);
  });

  it('C-level acessoTotal=false -> 3/5 cards, roiEmpresa e folhaPorcentagem NULL', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelLimitado, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    // Cards visiveis:
    expect(result.faturamentoMedioMensal).toBe('80000.00');
    expect(result.folhaTotalMedia).toBe('30000.00');
    expect(result.statusDiagnostico).toBe('muito_bom');
    // Cards mascarados (canonico DOC 02 §3.3):
    expect(result.roiEmpresa).toBeNull();
    expect(result.folhaPorcentagem).toBeNull();
    expect(result.masked.roiEmpresa).toBe(true);
    expect(result.masked.folhaPorcentagem).toBe(true);
  });

  it('lider -> FORBIDDEN (nenhum dos 5 cards)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 8) getCompanyEconomicDashboard — diagnostico ausente
// ============================================================

describe('getCompanyEconomicDashboard — diagnostico ausente', () => {
  let companyId: number;
  let clevelLimitado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_MASK_SEM_DIAG);
    clevelLimitado = await createCLevel(companyId, false);
    // Sem inserir diagnostico para 2025-Q1.
  });

  it('super_admin sem diagnostico persistido -> todos os 5 cards NULL, mask false', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosisPersisted).toBe(false);
    expect(result.faturamentoMedioMensal).toBeNull();
    expect(result.folhaTotalMedia).toBeNull();
    expect(result.roiEmpresa).toBeNull();
    expect(result.statusDiagnostico).toBeNull();
    expect(result.folhaPorcentagem).toBeNull();
    expect(result.masked.roiEmpresa).toBe(false);
    expect(result.masked.folhaPorcentagem).toBe(false);
  });

  it('C-level acessoTotal=false sem diagnostico -> todos NULL, mask=true nos 2', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelLimitado, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosisPersisted).toBe(false);
    expect(result.roiEmpresa).toBeNull();
    expect(result.folhaPorcentagem).toBeNull();
    // Mask reflete a intencao canonica (S067), independente do diagnostico ter sido persistido.
    expect(result.masked.roiEmpresa).toBe(true);
    expect(result.masked.folhaPorcentagem).toBe(true);
  });

  it('trimestre invalido -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyEconomicDashboard({ companyId, trimestre: '2025-05' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 9) Contratos publicos (RV-13)
// ============================================================

describe('dashboard — contratos publicos', () => {
  it('DASHBOARD_HISTORY_LIMIT_DEFAULT canonico = 4', () => {
    expect(DASHBOARD_HISTORY_LIMIT_DEFAULT).toBe(4);
  });

  it('DASHBOARD_HISTORY_LIMIT_CAP canonico = 20', () => {
    expect(DASHBOARD_HISTORY_LIMIT_CAP).toBe(20);
  });

  it('TRIMESTRE_INPUT_SCHEMA_DASHBOARD aceita 2025-Q1 e rejeita 2025-Q5', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_DASHBOARD.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_DASHBOARD.safeParse('2025-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_DASHBOARD.safeParse('2025-05').success).toBe(false);
  });

  it('EmployeeDashboardResult e CompanyEconomicDashboardResult sao tipos publicos', () => {
    // Uso de tipo para satisfazer RV-13 do import de tipo — o teste
    // compila somente se o tipo estiver exportado com o shape esperado.
    const shape: EmployeeDashboardResult = {
      employee: {
        id: 1,
        companyId: 1,
        name: 'x',
        departamento: 'Comercial',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        status: 'ativo',
        isLider: false,
      },
      latestQuarterly: null,
      history: [],
      latestPlenitude: null,
      latestNineBox: null,
    };
    const mask: CompanyEconomicDashboardResult = {
      companyId: 1,
      trimestre: '2025-Q1',
      diagnosisPersisted: false,
      faturamentoMedioMensal: null,
      folhaTotalMedia: null,
      roiEmpresa: null,
      statusDiagnostico: null,
      folhaPorcentagem: null,
      masked: { roiEmpresa: false, folhaPorcentagem: false },
    };
    expect(shape.employee.id).toBe(1);
    expect(mask.companyId).toBe(1);
  });
});
