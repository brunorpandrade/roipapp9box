// ROIP APP 9BOX — teste de integracao do sub-router `nineBox`
// (ME-042).
//
// Exercita as 2 procs publicas canonicas do sub-dominio Eixo Y/9-Box
// — leitura (DOC 03 §7.9 + §19.4 decima e decima-primeira linhas)
// contra MySQL real via `createCallerFactory`. Cobre:
//   - `getNineBoxSnapshot` discriminated union por `mode`:
//     * modo individual: retorna linha `nineBoxClassifications` ou
//       `null`; guards §2.4, §3.13 e S066 (cadeia direta de lider);
//     * modo empresa: INNER JOIN com employees ativos apenas (§7.6);
//       S122 restrito a Bruno + RH (Lider e C-level FORBIDDEN).
//   - `getNineBoxTrajectory`: ordem decrescente por trimestre; N
//     default 4, cap 20; escopo por perfil replicando modo individual
//     do snapshot; §3.13 aplicavel.
//   - Contratos publicos exportados
//     (`NINE_BOX_TRAJECTORY_LIMIT_DEFAULT`,
//     `NINE_BOX_TRAJECTORY_LIMIT_CAP`,
//     `TRIMESTRE_INPUT_SCHEMA_NINE_BOX`,
//     `SNAPSHOT_INPUT_SCHEMA_NINE_BOX`, tipos publicos).
//
// Padrao S009 estendido (S076/S109/S123) — faixa CNPJ da ME-042
// (790..799 compartilhada com plenitude, mas com CNPJs distintos
// dentro da faixa 796..798 para independencia de fixtures entre
// arquivos de teste). L32 cleanup em afterAll. JWT_SECRET fixo no
// arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  nineBoxClassifications,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createNineBoxRouter,
  NINE_BOX_TRAJECTORY_LIMIT_CAP,
  NINE_BOX_TRAJECTORY_LIMIT_DEFAULT,
  SNAPSHOT_INPUT_SCHEMA_NINE_BOX,
  TRIMESTRE_INPUT_SCHEMA_NINE_BOX,
  type NineBoxSnapshotCompany,
  type NineBoxSnapshotEmployee,
  type NineBoxTrajectoryResult,
} from '../../src/server/routers/nineBox';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me042-ninebox';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me042-9box';

// ============================================================
// Geradores unicos (padrao S009 estendido — S123 faixa 790..799)
// ============================================================

let cpfCounter = 43000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-9box${seq.padStart(8, '0')}`.substring(0, 36);
}

// ============================================================
// Fixture — companies + employees + nineBoxClassifications
// ============================================================

const CNPJ_GUARDS_IND = '10000000000798';
const CNPJ_COMPANY_MODE = '10000000000799';
const CNPJ_LIDER_9B = '10000000000710';
const CNPJ_TRAJ = '10000000000711';
const CNPJ_INATIVO_9B = '10000000000712';

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
    }
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
      razaoSocial: `ME042N Test ${cnpj} LTDA`,
      nomeFantasia: `ME042N Test ${cnpj}`,
      cnpj,
      telefone: '1633330043',
      endereco: `Rua ME-042, ${cnpj}`,
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
  opts: {
    status?: 'ativo' | 'inativo';
    departamento?: 'Comercial' | 'Financeiro' | 'Diretoria';
    descricaoCBO?: string;
  } = {},
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
      descricaoCBO: opts.descricaoCBO ?? 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: false,
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
      acessoTotal: true,
      status: 'ativo',
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createCLevel: sem id');
  }
  return row.id;
}

async function createNineBoxLine(
  companyId: number,
  employeeId: number,
  trimestre: string,
  quadrante:
    | 'ALTO IMPACTO'
    | 'DESEMPENHO REPRESADO'
    | 'POTENCIAL SUBUTILIZADO'
    | 'ALTA ENTREGA'
    | 'EQUILÍBRIO FRÁGIL'
    | 'DESEMPENHO CRÍTICO'
    | 'RISCO DE ESGOTAMENTO'
    | 'DESGASTE OCULTO'
    | 'RISCO CRÍTICO' = 'ALTO IMPACTO',
  direcaoMovimento:
    'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez' | null = 'primeira_vez',
  quadranteAnterior: string | null = null,
  posicaoX: 'baixo' | 'medio' | 'alto' = 'alto',
  posicaoY: 'baixa' | 'media' | 'alta' = 'alta',
): Promise<void> {
  await client.db.insert(nineBoxClassifications).values({
    companyId,
    employeeId,
    trimestre,
    scoreDesempenho: '90.00',
    plenitudeScore: '80.00',
    posicaoX,
    posicaoY,
    quadrante,
    quadranteAnterior,
    direcaoMovimento,
    calculadoEm: new Date('2025-04-11T14:00:00Z'),
  });
}

async function linkLeader(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture de teste nineBox-router ME-042',
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
  const testRouter = createNineBoxRouter();
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
// 1) getNineBoxSnapshot — modo individual
// ============================================================

describe('nineBox — getNineBoxSnapshot modo individual', () => {
  let companyId: number;
  let otherCompanyId: number;
  let empComClassif: number;
  let empSemClassif: number;
  let clevelId: number;
  let otherRhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS_IND);
    otherCompanyId = await createCompany('10000000000713');
    empComClassif = await createEmployee(companyId);
    empSemClassif = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    otherRhId = await createEmployee(otherCompanyId);
    await createNineBoxLine(companyId, empComClassif, '2025-Q1', 'ALTO IMPACTO');
  });

  it('sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getNineBoxSnapshot({
        mode: 'employee',
        companyId,
        employeeId: empComClassif,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('super_admin -> OK com classification presente', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: empComClassif,
      trimestre: '2025-Q1',
    });
    expect(result.mode).toBe('employee');
    const emp = result as NineBoxSnapshotEmployee;
    expect(emp.classification).not.toBeNull();
    expect(emp.classification!.quadrante).toBe('ALTO IMPACTO');
    expect(emp.classification!.posicaoX).toBe('alto');
    expect(emp.classification!.posicaoY).toBe('alta');
  });

  it('RH da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empComClassif, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: empComClassif,
      trimestre: '2025-Q1',
    });
    expect(result.mode).toBe('employee');
  });

  it('C-level da mesma empresa -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: empComClassif,
      trimestre: '2025-Q1',
    });
    expect(result.mode).toBe('employee');
  });

  it('sem classification no trimestre -> classification: null', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: empSemClassif,
      trimestre: '2025-Q1',
    });
    const emp = result as NineBoxSnapshotEmployee;
    expect(emp.classification).toBeNull();
  });

  it('colaborador inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({
        mode: 'employee',
        companyId,
        employeeId: 999999999,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('super_admin passando companyId errado -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({
        mode: 'employee',
        companyId: otherCompanyId,
        employeeId: empComClassif,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('RH de outra empresa -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', otherRhId, otherCompanyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({
        mode: 'employee',
        companyId,
        employeeId: empComClassif,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 2) getNineBoxSnapshot — modo empresa (S122 + §7.6)
// ============================================================

describe('nineBox — getNineBoxSnapshot modo empresa (S122 + §7.6)', () => {
  let companyId: number;
  let empAtivo1: number;
  let empAtivo2: number;
  let empInativo: number;
  let empSemClassif: number;
  let liderId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_COMPANY_MODE);
    empAtivo1 = await createEmployee(companyId, { departamento: 'Comercial' });
    empAtivo2 = await createEmployee(companyId, { departamento: 'Financeiro' });
    empInativo = await createEmployee(companyId, { status: 'inativo' });
    empSemClassif = await createEmployee(companyId);
    liderId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    await createNineBoxLine(companyId, empAtivo1, '2025-Q1', 'ALTO IMPACTO');
    await createNineBoxLine(companyId, empAtivo2, '2025-Q1', 'EQUILÍBRIO FRÁGIL');
    // Inativo COM classificacao — §7.6 canonico: nao aparece.
    await createNineBoxLine(companyId, empInativo, '2025-Q1', 'RISCO CRÍTICO');
    // Empregado sem classificacao — nao aparece.
    // (empSemClassif nao tem linha em nineBoxClassifications)
  });

  it('Bruno -> OK, itens = 2 (apenas ativos com classificacao)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'company',
      companyId,
      trimestre: '2025-Q1',
    });
    const empresa = result as NineBoxSnapshotCompany;
    expect(empresa.mode).toBe('company');
    expect(empresa.items).toHaveLength(2);
    const ids = empresa.items.map((item) => item.employeeId);
    expect(ids).toContain(empAtivo1);
    expect(ids).toContain(empAtivo2);
    expect(ids).not.toContain(empInativo);
    expect(ids).not.toContain(empSemClassif);
  });

  it('itens carregam nome, departamento e cargo canonicos', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'company',
      companyId,
      trimestre: '2025-Q1',
    });
    const empresa = result as NineBoxSnapshotCompany;
    const emp1 = empresa.items.find((item) => item.employeeId === empAtivo1);
    expect(emp1).toBeDefined();
    expect(emp1!.departamento).toBe('Comercial');
    expect(emp1!.cargo).toBe('Analista');
    expect(emp1!.classification.quadrante).toBe('ALTO IMPACTO');
  });

  it('RH -> OK (S122 permite)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'company',
      companyId,
      trimestre: '2025-Q1',
    });
    const empresa = result as NineBoxSnapshotCompany;
    expect(empresa.items).toHaveLength(2);
  });

  it('RH-Lider -> OK (S122 permite)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh_lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'company',
      companyId,
      trimestre: '2025-Q1',
    });
    const empresa = result as NineBoxSnapshotCompany;
    expect(empresa.items).toHaveLength(2);
  });

  it('Lider -> FORBIDDEN (S122)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({ mode: 'company', companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('C-level -> FORBIDDEN (S122)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({ mode: 'company', companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('trimestre sem classificacoes -> items vazio', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'company',
      companyId,
      trimestre: '2025-Q4',
    });
    const empresa = result as NineBoxSnapshotCompany;
    expect(empresa.items).toHaveLength(0);
  });
});

// ============================================================
// 3) getNineBoxSnapshot — S066 cadeia direta de lider
// ============================================================

describe('nineBox — S066 cadeia direta de lider (modo individual)', () => {
  let companyId: number;
  let liderId: number;
  let outroLiderId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIDER_9B);
    liderId = await createEmployee(companyId);
    outroLiderId = await createEmployee(companyId);
    liderado = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
    await createNineBoxLine(companyId, liderado, '2025-Q1', 'DESEMPENHO REPRESADO');
    await createNineBoxLine(companyId, liderId, '2025-Q1', 'ALTO IMPACTO');
  });

  it('lider vendo proprio -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: liderId,
      trimestre: '2025-Q1',
    });
    const emp = result as NineBoxSnapshotEmployee;
    expect(emp.classification!.quadrante).toBe('ALTO IMPACTO');
  });

  it('lider com liderado direto -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxSnapshot({
      mode: 'employee',
      companyId,
      employeeId: liderado,
      trimestre: '2025-Q1',
    });
    const emp = result as NineBoxSnapshotEmployee;
    expect(emp.classification!.quadrante).toBe('DESEMPENHO REPRESADO');
  });

  it('lider fora da cadeia direta -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', outroLiderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxSnapshot({
        mode: 'employee',
        companyId,
        employeeId: liderado,
        trimestre: '2025-Q1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 4) getNineBoxTrajectory — default 4, cap 20, DESC
// ============================================================

describe('nineBox — getNineBoxTrajectory (S120)', () => {
  let companyId: number;
  let empId: number;
  let outroEmpId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TRAJ);
    empId = await createEmployee(companyId);
    outroEmpId = await createEmployee(companyId);
    // 6 trimestres consecutivos para o empId, 1 para o outro.
    await createNineBoxLine(companyId, empId, '2023-Q4', 'RISCO CRÍTICO', 'primeira_vez', null);
    await createNineBoxLine(
      companyId,
      empId,
      '2024-Q1',
      'EQUILÍBRIO FRÁGIL',
      'subiu',
      'RISCO CRÍTICO',
    );
    await createNineBoxLine(
      companyId,
      empId,
      '2024-Q2',
      'ALTA ENTREGA',
      'subiu',
      'EQUILÍBRIO FRÁGIL',
    );
    await createNineBoxLine(companyId, empId, '2024-Q3', 'ALTA ENTREGA', 'estavel', 'ALTA ENTREGA');
    await createNineBoxLine(companyId, empId, '2024-Q4', 'ALTO IMPACTO', 'lateral', 'ALTA ENTREGA');
    await createNineBoxLine(companyId, empId, '2025-Q1', 'ALTO IMPACTO', 'estavel', 'ALTO IMPACTO');
    await createNineBoxLine(companyId, outroEmpId, '2025-Q1', 'ALTO IMPACTO');
  });

  it('default -> 4 itens em ordem decrescente', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result: NineBoxTrajectoryResult = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: empId,
    });
    expect(result.employeeId).toBe(empId);
    expect(result.items).toHaveLength(NINE_BOX_TRAJECTORY_LIMIT_DEFAULT);
    expect(result.items[0]!.trimestre).toBe('2025-Q1');
    expect(result.items[1]!.trimestre).toBe('2024-Q4');
    expect(result.items[2]!.trimestre).toBe('2024-Q3');
    expect(result.items[3]!.trimestre).toBe('2024-Q2');
  });

  it('limit customizado 6 -> 6 itens (todos)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: empId,
      limit: 6,
    });
    expect(result.items).toHaveLength(6);
    expect(result.items[0]!.trimestre).toBe('2025-Q1');
    expect(result.items[5]!.trimestre).toBe('2023-Q4');
  });

  it('itens carregam quadrante, direcao e quadranteAnterior canonicos', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: empId,
      limit: 6,
    });
    const q2024Q1 = result.items.find((item) => item.trimestre === '2024-Q1');
    expect(q2024Q1).toBeDefined();
    expect(q2024Q1!.quadrante).toBe('EQUILÍBRIO FRÁGIL');
    expect(q2024Q1!.direcaoMovimento).toBe('subiu');
    expect(q2024Q1!.quadranteAnterior).toBe('RISCO CRÍTICO');
  });

  it('colaborador sem classificacoes -> items vazio', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const outro = await createEmployee(companyId);
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: outro,
    });
    expect(result.items).toHaveLength(0);
  });

  it('limit acima do cap -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxTrajectory({
        companyId,
        employeeId: empId,
        limit: NINE_BOX_TRAJECTORY_LIMIT_CAP + 1,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('limit = cap -> aceito', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: empId,
      limit: NINE_BOX_TRAJECTORY_LIMIT_CAP,
    });
    // 6 linhas seed, cap 20 -> retorna 6
    expect(result.items.length).toBeLessThanOrEqual(NINE_BOX_TRAJECTORY_LIMIT_CAP);
    expect(result.items.length).toBe(6);
  });
});

// ============================================================
// 5) getNineBoxTrajectory — §3.13 inativo + S066
// ============================================================

describe('nineBox — trajectory guards §3.13 e S066', () => {
  let companyId: number;
  let adminId: number;
  let liderId: number;
  let clevelId: number;
  let inativoId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INATIVO_9B);
    adminId = await createEmployee(companyId);
    liderId = await createEmployee(companyId);
    clevelId = await createCLevel(companyId);
    inativoId = await createEmployee(companyId, { status: 'inativo' });
    await linkLeader(inativoId, liderId);
    await createNineBoxLine(companyId, inativoId, '2025-Q1', 'ALTO IMPACTO');
  });

  it('Bruno consulta trajetoria de inativo -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: inativoId,
    });
    expect(result.items).toHaveLength(1);
  });

  it('RH consulta trajetoria de inativo -> OK', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', adminId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.getNineBoxTrajectory({
      companyId,
      employeeId: inativoId,
    });
    expect(result.items).toHaveLength(1);
  });

  it('Lider consulta trajetoria de inativo -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxTrajectory({ companyId, employeeId: inativoId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('C-level consulta trajetoria de inativo -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getNineBoxTrajectory({ companyId, employeeId: inativoId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 6) Contratos exportados — schemas Zod e constantes
// ============================================================

describe('nineBox — contratos exportados', () => {
  it('NINE_BOX_TRAJECTORY_LIMIT_DEFAULT = 4 (S120 = S068)', () => {
    expect(NINE_BOX_TRAJECTORY_LIMIT_DEFAULT).toBe(4);
  });

  it('NINE_BOX_TRAJECTORY_LIMIT_CAP = 20 (S120 = S068)', () => {
    expect(NINE_BOX_TRAJECTORY_LIMIT_CAP).toBe(20);
  });

  it('TRIMESTRE_INPUT_SCHEMA_NINE_BOX bate `YYYY-QN`', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_NINE_BOX.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_NINE_BOX.safeParse('2025-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_NINE_BOX.safeParse('2025-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_NINE_BOX.safeParse('bad').success).toBe(false);
  });

  it('SNAPSHOT_INPUT_SCHEMA_NINE_BOX aceita mode=employee com employeeId', () => {
    const parsed = SNAPSHOT_INPUT_SCHEMA_NINE_BOX.safeParse({
      mode: 'employee',
      companyId: 1,
      employeeId: 2,
      trimestre: '2025-Q1',
    });
    expect(parsed.success).toBe(true);
  });

  it('SNAPSHOT_INPUT_SCHEMA_NINE_BOX aceita mode=company sem employeeId', () => {
    const parsed = SNAPSHOT_INPUT_SCHEMA_NINE_BOX.safeParse({
      mode: 'company',
      companyId: 1,
      trimestre: '2025-Q1',
    });
    expect(parsed.success).toBe(true);
  });

  it('SNAPSHOT_INPUT_SCHEMA_NINE_BOX rejeita mode invalido', () => {
    const parsed = SNAPSHOT_INPUT_SCHEMA_NINE_BOX.safeParse({
      mode: 'departamento',
      companyId: 1,
      trimestre: '2025-Q1',
    });
    expect(parsed.success).toBe(false);
  });

  it('SNAPSHOT_INPUT_SCHEMA_NINE_BOX rejeita mode=employee sem employeeId', () => {
    const parsed = SNAPSHOT_INPUT_SCHEMA_NINE_BOX.safeParse({
      mode: 'employee',
      companyId: 1,
      trimestre: '2025-Q1',
    });
    expect(parsed.success).toBe(false);
  });
});
