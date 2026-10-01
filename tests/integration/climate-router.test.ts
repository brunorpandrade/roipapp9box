// ROIP APP 9BOX — teste de integracao do sub-router `climate`
// (reescrito na ME-B2-01b — Q1=D aposenta cache).
//
// Exercita a unica proc canonica pos-Q1=D: `getClimateBlock`.
// Computa sob demanda direto de `plenitudeData` + `instrumentA_
// responses` (motor puro). Zero cache, zero drift.
//
// Cobre:
//   - Contratos publicos exportados (RV-13: mensagens literais,
//     schemas Zod, constantes canonicas, tipos, factory).
//   - Matriz canonica de autorizacao: super_admin, rh, rh_lider,
//     clevel(acessoTotal=true); lider FORBIDDEN; clevel acessoTotal
//     =false FORBIDDEN (Q1=A supera §9.3).
//   - Guard cross-company (§2.4).
//   - Escopo=empresa|departamento|equipe (com liderTipo=employee
//     e liderTipo=clevel).
//   - Cascata silenciosa canonica (§9.6 Q4=A1).
//
// Padrao S009/S076 estendido: uma company local por describe,
// CNPJ unico da faixa 10000000000850..869. L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentA_responses,
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
  createClimateRouter,
  ESCOPO_ROUTER_SCHEMA_CLIMATE,
  GET_CLIMATE_BLOCK_INPUT_SCHEMA,
  type GetClimateBlockResult,
  LIDER_TIPO_SCHEMA_CLIMATE,
  MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED,
  MSG_CLIMATE_LIDER_ID_REQUIRED,
  MSG_CLIMATE_LIDER_TIPO_REQUIRED,
  MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE,
  MSG_LIDER_PURO_SEM_BLOCO_CLIMA,
  MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE,
  MSG_PISO_3_INSUFICIENTE_CLIMATE,
  MSG_TRIMESTRE_INVALIDO_CLIMATE,
  PISO_RESPONDENTES_CLIMATE,
  TRIMESTRE_INPUT_SCHEMA_CLIMATE,
} from '../../src/server/routers/climate';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-b2-01b-climate-router';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_CLIMA_ROUTER = 'hash-fixo-me-b2-01b-climate-router';

const CNPJ_CONTRATOS = '10000000000850';
const CNPJ_AUTORIZACAO = '10000000000851';
const CNPJ_LEITURA_EMPRESA = '10000000000852';
const CNPJ_GUARDS = '10000000000853';
const CNPJ_CASCATA = '10000000000860';
const CNPJ_EQUIPE_EMPLOYEE = '10000000000861';
const CNPJ_EQUIPE_CLEVEL = '10000000000862';
const CNPJ_CLEVEL_GUARD = '10000000000863';
const CNPJ_CROSS = '10000000000864';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await client.db
      .delete(plenitudeData)
      .where(inArray(plenitudeData.companyId, createdCompanyIds));
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = emps.map((e) => e.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
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
      razaoSocial: `MEB201b ROUTER ${cnpj} LTDA`,
      nomeFantasia: `MEB201b ROUTER ${cnpj}`,
      cnpj,
      telefone: '1633330047',
      endereco: `Rua ME-B2-01b, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `pr-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rhr-${cnpj}@example.com`,
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
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 47100000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: { isLider?: boolean } = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `EmpR ${cpf}`,
      cpf,
      email: `emp-r-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: opts.isLider === true ? 'tatico' : 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: opts.isLider ?? false,
      isRH: false,
      passwordHash: HASH_CLIMA_ROUTER,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(
  companyId: number,
  opts: { acessoTotal?: boolean } = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLR ${cpf}`,
      cpf,
      email: `clr-${cpf}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO da companhia',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: opts.acessoTotal ?? true,
      status: 'ativo',
      passwordHash: HASH_CLIMA_ROUTER,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

/**
 * Semeia canonicamente 1 plenitude com scoreA para 1 employee em 1
 * trimestre. `scoreA` canonicamente em 0..100 (§6.4). O motor puro
 * consome direto essa tabela sob demanda.
 */
async function seedPlenitude(
  companyId: number,
  employeeId: number,
  trimestre: string,
  scoreA: number,
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    scoreA: String(scoreA),
    engajamentoA: String(scoreA),
    desenvolvimentoA: String(scoreA),
    pertencimentoA: String(scoreA),
    realizacaoA: String(scoreA),
    scoreC: String(scoreA),
    plenitudeScore: String(scoreA),
    faixaPlenitude: 'alta',
  });
}

async function tokenFor(role: PlatformRole, userId: number, companyId: number): Promise<string> {
  const credVersion = deriveCredentialVersion(HASH_CLIMA_ROUTER);
  return await signPlatformToken({ role, userId, companyId, credentialVersion: credVersion });
}

async function tokenSuperAdmin(): Promise<string> {
  const credVersion = deriveCredentialVersion('x' + 'fixture-test@roip.local');
  return await signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: credVersion,
  });
}

function contextFor(bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: '127.0.0.1',
  });
}

function callerFor(bearerToken: string | null) {
  const factory = createCallerFactory(createClimateRouter());
  return factory(contextFor(bearerToken));
}

// ============================================================
// Contratos publicos exportados
// ============================================================

describe('climate-router — contratos publicos (RV-13)', () => {
  it('exporta mensagens canonicas literais §9 + ME-B2-01b', () => {
    expect(MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE).toBe('Empresa fora do escopo do titular.');
    expect(MSG_TRIMESTRE_INVALIDO_CLIMATE).toBe(
      'Trimestre canônico deve seguir o formato YYYY-QN (N = 1..4).',
    );
    expect(MSG_LIDER_PURO_SEM_BLOCO_CLIMA).toBe('Bloco Clima indisponível para líderes puros.');
    expect(MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE).toBe(
      'Nenhum trimestre disponível para o escopo consultado.',
    );
    expect(MSG_PISO_3_INSUFICIENTE_CLIMATE).toBe(
      'Dados insuficientes: menos de 3 respondentes válidos.',
    );
    expect(MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED).toBe(
      'C-level com acessoTotal=false não tem visibilidade sobre o Bloco Clima.',
    );
    expect(MSG_CLIMATE_LIDER_TIPO_REQUIRED).toBe(
      'Escopo equipe requer liderTipo (employee ou clevel).',
    );
    expect(MSG_CLIMATE_LIDER_ID_REQUIRED).toBe('Escopo equipe requer liderId numérico positivo.');
  });

  it('exporta piso canonico PISO_RESPONDENTES_CLIMATE === 3 (§9.6)', () => {
    expect(PISO_RESPONDENTES_CLIMATE).toBe(3);
  });

  it('TRIMESTRE_INPUT_SCHEMA_CLIMATE valida formato YYYY-QN', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('abc').success).toBe(false);
  });

  it('ESCOPO_ROUTER_SCHEMA_CLIMATE aceita empresa|departamento|equipe', () => {
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('empresa').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('departamento').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('equipe').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('foo').success).toBe(false);
  });

  it('LIDER_TIPO_SCHEMA_CLIMATE aceita employee|clevel', () => {
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('employee').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('clevel').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('outro').success).toBe(false);
  });

  it('GET_CLIMATE_BLOCK_INPUT_SCHEMA aceita todos os escopos canonicos', () => {
    const empresa = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'empresa',
    });
    expect(empresa.success).toBe(true);
    const equipe = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'equipe',
      liderId: 42,
      liderTipo: 'employee',
    });
    expect(equipe.success).toBe(true);
    const invalido = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'invalid-escopo',
    });
    expect(invalido.success).toBe(false);
  });

  it('marker: CNPJ_CONTRATOS reservado a ME-B2-01b', () => {
    expect(CNPJ_CONTRATOS).toBe('10000000000850');
  });
});

// ============================================================
// Autorizacao por perfil (§9.9 + roleProcedure)
// ============================================================

describe('climate-router — autorizacao por perfil (§9.9)', () => {
  let companyId: number;
  let empRH: number;
  let empRhLider: number;
  let empLider: number;
  let clevelAT: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AUTORIZACAO);
    empRH = await createEmployee(companyId);
    empRhLider = await createEmployee(companyId, { isLider: true });
    empLider = await createEmployee(companyId, { isLider: true });
    clevelAT = await createClevel(companyId, { acessoTotal: true });
    // 3 employees no trimestre com scoreA canonico — atende ao piso.
    for (let i = 0; i < 3; i++) {
      const e = await createEmployee(companyId);
      await seedPlenitude(companyId, e, trimestre, 80 + i * 5);
    }
  });

  it('super_admin acessa getClimateBlock', async () => {
    const token = await tokenSuperAdmin();
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
  });

  it('rh acessa getClimateBlock', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
  });

  it('rh_lider acessa getClimateBlock', async () => {
    const token = await tokenFor('rh_lider', empRhLider, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
  });

  it('clevel acessoTotal=true acessa (Q1=A)', async () => {
    const token = await tokenFor('clevel', clevelAT, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
  });

  it('lider puro recebe FORBIDDEN (§9.9)', async () => {
    const token = await tokenFor('lider', empLider, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre }),
    ).rejects.toThrow();
  });
});

// ============================================================
// C-level acessoTotal guard (Q1=A)
// ============================================================

describe('climate-router — C-level acessoTotal guard (Q1=A)', () => {
  let companyId: number;
  let clevelAT: number;
  let clevelSemAT: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CLEVEL_GUARD);
    clevelAT = await createClevel(companyId, { acessoTotal: true });
    clevelSemAT = await createClevel(companyId, { acessoTotal: false });
    for (let i = 0; i < 3; i++) {
      const e = await createEmployee(companyId);
      await seedPlenitude(companyId, e, trimestre, 82 + i);
    }
  });

  it('C-level acessoTotal=true acessa', async () => {
    const token = await tokenFor('clevel', clevelAT, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
  });

  it('C-level acessoTotal=false recebe FORBIDDEN literal', async () => {
    const token = await tokenFor('clevel', clevelSemAT, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre }),
    ).rejects.toThrow(MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED);
  });
});

// ============================================================
// Leitura canonica sob demanda (motor puro)
// ============================================================

describe('climate-router — leitura canonica sob demanda', () => {
  let companyId: number;
  let empRH: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LEITURA_EMPRESA);
    empRH = await createEmployee(companyId);
    // 5 employees com scoreA canonico 80/100 -> notaClima esperada 8.
    for (let i = 0; i < 5; i++) {
      const e = await createEmployee(companyId);
      await seedPlenitude(companyId, e, trimestre, 80);
    }
  });

  it('escala canonica 0-10 (§9.4): notaClima = scoreA/10', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result: GetClimateBlockResult = await caller.getClimateBlock({
      companyId,
      escopo: 'empresa',
      trimestre,
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
    // scoreA=80 -> notaClima=8 (bit-a-bit).
    expect(result.notaClima).toBe(8);
    expect(result.countCobertura).toBe(5);
  });

  it('trimestre implicito resolve trimestre mais recente com scoreA', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa' });
    expect(result.presente).toBe(true);
    expect(result.trimestre).toBe(trimestre);
  });

  it('company sem historico retorna presente=false', async () => {
    const companyIdNovo = await createCompany('10000000000855');
    const empNovo = await createEmployee(companyIdNovo);
    const token = await tokenFor('rh', empNovo, companyIdNovo);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId: companyIdNovo,
      escopo: 'empresa',
    });
    expect(result.presente).toBe(false);
    expect(result.notaClima).toBeNull();
  });
});

// ============================================================
// Escopo equipe polimorfico (liderTipo=employee)
// ============================================================

describe('climate-router — escopo=equipe liderTipo=employee', () => {
  let companyId: number;
  let empRH: number;
  let lider: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_EQUIPE_EMPLOYEE);
    empRH = await createEmployee(companyId);
    lider = await createEmployee(companyId, { isLider: true });
    // 3 liderados diretos com scoreA canonico -> atende ao piso.
    const dataInicio = new Date('2019-01-01');
    for (let i = 0; i < 3; i++) {
      const e = await createEmployee(companyId);
      await client.db.insert(employeeLeaderHistory).values({
        employeeId: e,
        liderId: lider,
        clevelId: null,
        dataInicio,
        dataFim: null,
        reason: 'fixture',
        transferBatchId: '00000000-0000-0000-0000-000000000000',
      });
      await seedPlenitude(companyId, e, trimestre, 90);
    }
  });

  it('retorna payload canonico para liderTipo=employee', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'equipe',
      liderId: lider,
      liderTipo: 'employee',
      trimestre,
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('equipe');
    expect(result.liderTipo).toBe('employee');
    expect(result.escopoEfetivo.escopo).toBe('equipe');
    expect(result.notaAgregacao).toBeNull();
    expect(result.notaClima).toBe(9);
    expect(result.countCobertura).toBe(3);
  });
});

// ============================================================
// Escopo equipe polimorfico (liderTipo=clevel)
// ============================================================

describe('climate-router — escopo=equipe liderTipo=clevel', () => {
  let companyId: number;
  let empRH: number;
  let clevel: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_EQUIPE_CLEVEL);
    empRH = await createEmployee(companyId);
    clevel = await createClevel(companyId, { acessoTotal: true });
    const dataInicio = new Date('2019-01-01');
    for (let i = 0; i < 3; i++) {
      const e = await createEmployee(companyId);
      await client.db.insert(employeeLeaderHistory).values({
        employeeId: e,
        liderId: null,
        clevelId: clevel,
        dataInicio,
        dataFim: null,
        reason: 'fixture',
        transferBatchId: '00000000-0000-0000-0000-000000000000',
      });
      await seedPlenitude(companyId, e, trimestre, 70);
    }
  });

  it('retorna payload canonico polimorfico para liderTipo=clevel', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'equipe',
      liderId: clevel,
      liderTipo: 'clevel',
      trimestre,
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('equipe');
    expect(result.liderTipo).toBe('clevel');
    expect(result.escopoEfetivo.escopo).toBe('equipe');
    expect(result.notaClima).toBe(7);
  });
});

// ============================================================
// Cascata silenciosa canonica (Q4=A1)
// ============================================================

describe('climate-router — cascata silenciosa (Q4=A1)', () => {
  let companyId: number;
  let empRH: number;
  let liderSemPiso: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CASCATA);
    empRH = await createEmployee(companyId);
    liderSemPiso = await createEmployee(companyId, { isLider: true });
    // Lider com 1 unico subordinado direto (< piso 3).
    const subordinadoUnico = await createEmployee(companyId);
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: subordinadoUnico,
      liderId: liderSemPiso,
      clevelId: null,
      dataInicio: new Date('2019-01-01'),
      dataFim: null,
      reason: 'fixture',
      transferBatchId: '00000000-0000-0000-0000-000000000000',
    });
    await seedPlenitude(companyId, subordinadoUnico, trimestre, 60);
    // Departamento (Comercial) canonico com 4 outros employees ativos
    // com scoreA (5 total no depto, atende ao piso).
    for (let i = 0; i < 4; i++) {
      const e = await createEmployee(companyId);
      await seedPlenitude(companyId, e, trimestre, 70);
    }
  });

  it('equipe sem piso cascateia para departamento', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'equipe',
      liderId: liderSemPiso,
      liderTipo: 'employee',
      trimestre,
    });
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('equipe');
    expect(result.escopoEfetivo.escopo).toBe('departamento');
    expect(result.escopoEfetivo.escopoReferencia).toBe('Comercial');
    expect(result.notaAgregacao).toBe('agregado_departamento');
  });
});

// ============================================================
// Guards canonicos
// ============================================================

describe('climate-router — guards canonicos', () => {
  let companyId: number;
  let empRH: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    empRH = await createEmployee(companyId);
  });

  it('escopo departamento sem escopoReferencia -> BAD_REQUEST', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(caller.getClimateBlock({ companyId, escopo: 'departamento' })).rejects.toThrow();
  });

  it('escopo equipe sem liderId -> BAD_REQUEST', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'equipe', liderTipo: 'employee' }),
    ).rejects.toThrow(MSG_CLIMATE_LIDER_ID_REQUIRED);
  });

  it('escopo equipe sem liderTipo -> BAD_REQUEST', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'equipe', liderId: 42 }),
    ).rejects.toThrow(MSG_CLIMATE_LIDER_TIPO_REQUIRED);
  });

  it('cross-company (nao-super_admin) -> FORBIDDEN', async () => {
    const outraCompanyId = await createCompany(CNPJ_CROSS);
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId: outraCompanyId, escopo: 'empresa' }),
    ).rejects.toThrow();
  });
});
