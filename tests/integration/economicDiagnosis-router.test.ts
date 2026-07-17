// ROIP APP 9BOX — teste de integracao do sub-router `economicDiagnosis`
// (ME-035).
//
// Exercita as 2 procedures publicas canonicas do sub-dominio (DOC 03
// §3.11 + §19.1) contra MySQL real via `createCallerFactory`. Cobre:
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `getCompanyDiagnosis` com registro persistido e ausente; trimestre
//     invalido (formato); cross-company FORBIDDEN.
//   - `getDiagnosisHistory` com limit default (4), customizado, cap (20);
//     ordenacao decrescente por trimestre.
//   - Constantes canonicas exportadas
//     (`DIAGNOSIS_HISTORY_LIMIT_CAP`, `DIAGNOSIS_HISTORY_LIMIT_DEFAULT`,
//     `TRIMESTRE_INPUT_SCHEMA_ECON`).
//
// Padrao S009 estendido a Bloco B3 (uma company local por describe, CNPJ
// unico da faixa 10000000000500..510). L32 cleanup em afterAll
// (`companyEconomicDiagnosis` + `companies`; fixture global superAdmins
// id=1 preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, companyEconomicDiagnosis, employees } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createEconomicDiagnosisRouter,
  DIAGNOSIS_HISTORY_LIMIT_CAP,
  DIAGNOSIS_HISTORY_LIMIT_DEFAULT,
  TRIMESTRE_INPUT_SCHEMA_ECON,
} from '../../src/server/routers/economicDiagnosis';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me035-economicDiagnosis';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me035-econ';

// ============================================================
// Geradores unicos (padrao S009 estendido)
// ============================================================

let cpfCounter = 21000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// ============================================================
// Fixture — company + diagnosticos
// ============================================================

const CNPJ_GUARDS = '10000000000500';
const CNPJ_HISTORY = '10000000000501';
const CNPJ_CROSS_A = '10000000000502';
const CNPJ_CROSS_B = '10000000000503';
const CNPJ_ABSENT = '10000000000504';

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
      razaoSocial: `ME035E Test ${cnpj} LTDA`,
      nomeFantasia: `ME035E Test ${cnpj}`,
      cnpj,
      telefone: '1633330035',
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
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function createCLevel(companyId: number, acessoTotal = true): Promise<number> {
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
  // Fixture global de superAdmins (setup.ts): passwordHash='x',
  // email='fixture-test@roip.local'.
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

// ============================================================
// Fabrica de caller
// ============================================================

function bindRouter() {
  const testRouter = createEconomicDiagnosisRouter();
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

describe('economicDiagnosis — guards de autorizacao', () => {
  let companyId: number;
  let employeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    employeeId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    await createDiagnosis(companyId, '2025-Q1', 'aceitavel');
  });

  it('getCompanyDiagnosis sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getCompanyDiagnosis com lider -> FORBIDDEN (nao esta na lista)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('getCompanyDiagnosis com super_admin -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' });
    expect(result.companyId).toBe(companyId);
    expect(result.trimestre).toBe('2025-Q1');
    expect(result.diagnosis).not.toBeNull();
    expect(result.diagnosis?.statusDiagnostico).toBe('aceitavel');
  });

  it('getCompanyDiagnosis com RH da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosis).not.toBeNull();
  });

  it('getCompanyDiagnosis com C-level da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosis).not.toBeNull();
  });

  it('getCompanyDiagnosis com RH-Lider da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh_lider', employeeId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosis).not.toBeNull();
  });

  it('getDiagnosisHistory sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.getDiagnosisHistory({ companyId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('getDiagnosisHistory com lider -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', employeeId, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getDiagnosisHistory({ companyId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ============================================================
// 2) Cross-company: mesma role, empresa diferente
// ============================================================

describe('economicDiagnosis — cross-company guard §2.4', () => {
  let companyA: number;
  let companyB: number;
  let empB: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_CROSS_A);
    companyB = await createCompany(CNPJ_CROSS_B);
    empB = await createEmployee(companyB);
    await createDiagnosis(companyA, '2025-Q1', 'excelente');
  });

  it('RH de B tentando ler diagnostico de A -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empB, companyB);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyDiagnosis({ companyId: companyA, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('RH de B tentando historico de A -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empB, companyB);
    const caller = factory(ctx(bearer));
    await expect(caller.getDiagnosisHistory({ companyId: companyA })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('super_admin ignora cross-company (atravessa) -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const r = await caller.getCompanyDiagnosis({ companyId: companyA, trimestre: '2025-Q1' });
    expect(r.diagnosis?.statusDiagnostico).toBe('excelente');
  });
});

// ============================================================
// 3) getCompanyDiagnosis — semantica canonica
// ============================================================

describe('getCompanyDiagnosis — semantica', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_ABSENT);
    await createDiagnosis(companyId, '2025-Q1', 'muito_bom');
  });

  it('trimestre com diagnostico persistido -> diagnosis != null', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q1' });
    expect(result.diagnosis).not.toBeNull();
    expect(result.diagnosis?.trimestre).toBe('2025-Q1');
    expect(result.diagnosis?.statusDiagnostico).toBe('muito_bom');
  });

  it('trimestre sem diagnostico persistido -> diagnosis === null', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getCompanyDiagnosis({ companyId, trimestre: '2024-Q4' });
    expect(result.diagnosis).toBeNull();
    expect(result.companyId).toBe(companyId);
    expect(result.trimestre).toBe('2024-Q4');
  });

  it('trimestre em formato invalido -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    // Formato canonico: `YYYY-Q[1-4]`. `2025-05` nao match.
    await expect(
      caller.getCompanyDiagnosis({ companyId, trimestre: '2025-05' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('trimestre Q5 -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyDiagnosis({ companyId, trimestre: '2025-Q5' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('companyId <= 0 -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getCompanyDiagnosis({ companyId: 0, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 4) getDiagnosisHistory — limits, ordenacao, cap
// ============================================================

describe('getDiagnosisHistory — limits, ordenacao, cap', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HISTORY);
    // Popula 6 trimestres em ordem aleatoria — assercao valida a ordem DESC
    await createDiagnosis(companyId, '2024-Q1', 'critico');
    await createDiagnosis(companyId, '2023-Q4', 'sem_referencia');
    await createDiagnosis(companyId, '2024-Q2', 'aceitavel');
    await createDiagnosis(companyId, '2024-Q3', 'muito_bom');
    await createDiagnosis(companyId, '2024-Q4', 'excelente');
    await createDiagnosis(companyId, '2025-Q1', 'excelente');
  });

  it('sem limit -> default 4 registros, ordem DESC por trimestre', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getDiagnosisHistory({ companyId });
    expect(result.diagnosisHistory).toHaveLength(4);
    expect(result.diagnosisHistory.map((r) => r.trimestre)).toEqual([
      '2025-Q1',
      '2024-Q4',
      '2024-Q3',
      '2024-Q2',
    ]);
  });

  it('limit customizado 2 -> apenas os 2 mais recentes', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getDiagnosisHistory({ companyId, limit: 2 });
    expect(result.diagnosisHistory).toHaveLength(2);
    expect(result.diagnosisHistory.map((r) => r.trimestre)).toEqual(['2025-Q1', '2024-Q4']);
  });

  it('limit alto (6) devolve todos os 6', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getDiagnosisHistory({ companyId, limit: 6 });
    expect(result.diagnosisHistory).toHaveLength(6);
  });

  it('limit acima do cap canonico (21) -> BAD_REQUEST no zod', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getDiagnosisHistory({ companyId, limit: DIAGNOSIS_HISTORY_LIMIT_CAP + 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('limit exatamente no cap canonico -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getDiagnosisHistory({
      companyId,
      limit: DIAGNOSIS_HISTORY_LIMIT_CAP,
    });
    expect(result.diagnosisHistory).toHaveLength(6);
  });

  it('companyId sem historico -> lista vazia', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    // companyId 99999 nao existe — devolve lista vazia (nao NOT_FOUND —
    // esta proc e leitura pura por companyId).
    const result = await caller.getDiagnosisHistory({ companyId: 99999 });
    expect(result.diagnosisHistory).toHaveLength(0);
  });

  it('limit = 0 -> BAD_REQUEST (zod positive)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(caller.getDiagnosisHistory({ companyId, limit: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

// ============================================================
// 5) Contratos publicos (RV-13)
// ============================================================

describe('economicDiagnosis — contratos publicos', () => {
  it('DIAGNOSIS_HISTORY_LIMIT_DEFAULT canonico = 4', () => {
    expect(DIAGNOSIS_HISTORY_LIMIT_DEFAULT).toBe(4);
  });

  it('DIAGNOSIS_HISTORY_LIMIT_CAP canonico = 20', () => {
    expect(DIAGNOSIS_HISTORY_LIMIT_CAP).toBe(20);
  });

  it('TRIMESTRE_INPUT_SCHEMA_ECON aceita 2025-Q1 e rejeita 2025-Q5', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_ECON.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_ECON.safeParse('2025-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_ECON.safeParse('2025-05').success).toBe(false);
  });
});
