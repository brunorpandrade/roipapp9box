// ROIP APP 9BOX — teste de integracao do sub-router `climate` (ME-047).
//
// Exercita as duas procedures canonicas do §9.11 e §19.6 do DOC 03:
//   - `getClimateBlock` — leitura por (companyId, escopo,
//     escopoReferencia?, trimestre?). Aplica piso 3 §9.6 (S158, S177)
//     na camada de leitura. Escopo 'equipe' bloqueado (S174).
//   - `recalculateAggregates` (S175) — reprocessamento manual
//     super_admin. Chamado via DI Facade.
//
// Tambem cobre:
//   - Contratos publicos exportados (RV-13: mensagens literais,
//     schemas Zod, constantes canonicas, tipos, factory).
//   - Matriz canonica de autorizacao (roleProcedure gates):
//     `getClimateBlock` -> super_admin, rh, rh_lider, clevel;
//     `recalculateAggregates` -> super_admin exclusivo (S175);
//     lider puro FORBIDDEN em ambas (§9.9 literal).
//   - Guard cross-company (§2.4).
//   - Zod bloqueia escopo 'equipe' no input (S174).
//   - Motor Clima real chamado via DI default.
//
// Padrao S009/S076 estendido (S178/S178b): uma company local por
// describe, CNPJ unico da faixa 10000000000850..854 (S178b — faixa
// estendida da ME-047). L32 cleanup em afterAll. JWT_SECRET fixo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  climateEngagementData,
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
  type ClimateCalculationResult,
  type ClimateEngineFacade,
  DEFAULT_CLIMATE_ENGINE,
} from '../../src/server/services/climateCalculationEngine';
import {
  createClimateRouter,
  ESCOPO_ROUTER_SCHEMA_CLIMATE,
  GET_CLIMATE_BLOCK_INPUT_SCHEMA,
  type GetClimateBlockResult,
  MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE,
  MSG_ESCOPO_EQUIPE_INDISPONIVEL,
  MSG_LIDER_PURO_SEM_BLOCO_CLIMA,
  MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE,
  MSG_PISO_3_INSUFICIENTE_CLIMATE,
  MSG_TRIMESTRE_INVALIDO_CLIMATE,
  PISO_RESPONDENTES_CLIMATE,
  RECALCULATE_CLIMATE_INPUT_SCHEMA,
  type RecalculateClimateResult,
  TRIMESTRE_INPUT_SCHEMA_CLIMATE,
} from '../../src/server/routers/climate';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me047-climate-router';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_CLIMA_ROUTER = 'hash-fixo-me047-climate-router';

// CNPJs canonicos por describe (S178b — faixa 850..857 estendida da
// ME-047 para o router test; 855..857 usados dentro de describes com
// mais de uma company).
const CNPJ_CONTRATOS = '10000000000850';
const CNPJ_AUTORIZACAO = '10000000000851';
const CNPJ_LEITURA = '10000000000852';
const CNPJ_GUARDS = '10000000000853';
const CNPJ_RECALC = '10000000000854';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  // Nao mexemos no super admin fixture (id=1) — o setup.ts semeia
  // passwordHash='x', email='fixture-test@roip.local'. `tokenSuperAdmin`
  // deriva credentialVersion desse par sem alterar o BD (padrao
  // canonico de todos os *-router.test.ts).
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(climateEngagementData)
      .where(inArray(climateEngagementData.companyId, createdCompanyIds));
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
      razaoSocial: `ME047 ROUTER ${cnpj} LTDA`,
      nomeFantasia: `ME047 ROUTER ${cnpj}`,
      cnpj,
      telefone: '1633330047',
      endereco: `Rua ME-047 R, ${cnpj}`,
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

async function createClevel(companyId: number): Promise<number> {
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
      acessoTotal: true,
      status: 'ativo',
      passwordHash: HASH_CLIMA_ROUTER,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function insertClimateRow(
  companyId: number,
  opts: {
    escopo: 'empresa' | 'departamento' | 'equipe';
    departamento: string | null;
    liderId: number | null;
    trimestre: string;
    countCobertura: number;
    countTotal: number;
    notaClima: number | null;
    adesao: number | null;
    notaEngajamento?: number | null;
  },
): Promise<void> {
  const notaEngajamento =
    opts.notaEngajamento === undefined
      ? opts.notaClima === null
        ? null
        : String(opts.notaClima)
      : opts.notaEngajamento === null
        ? null
        : String(opts.notaEngajamento);
  await client.db.insert(climateEngagementData).values({
    companyId,
    escopo: opts.escopo,
    departamento: opts.departamento,
    liderId: opts.liderId,
    trimestre: opts.trimestre,
    notaClima: opts.notaClima === null ? null : String(opts.notaClima),
    adesao: opts.adesao === null ? null : String(opts.adesao),
    countCobertura: opts.countCobertura,
    countTotal: opts.countTotal,
    notaEngajamento,
  });
}

async function tokenFor(role: PlatformRole, userId: number, companyId: number): Promise<string> {
  const credVersion = deriveCredentialVersion(HASH_CLIMA_ROUTER);
  return await signPlatformToken({ role, userId, companyId, credentialVersion: credVersion });
}

async function tokenSuperAdmin(): Promise<string> {
  // Fixture global de superAdmins (setup.ts): passwordHash='x',
  // email='fixture-test@roip.local'.
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

function callerFor(
  bearerToken: string | null,
  deps: Parameters<typeof createClimateRouter>[0] = {},
) {
  const factory = createCallerFactory(createClimateRouter(deps));
  return factory(contextFor(bearerToken));
}

// ============================================================
// Contratos publicos exportados
// ============================================================

describe('climate-router — contratos publicos (RV-13)', () => {
  it('exporta mensagens canonicas literais §9', () => {
    expect(MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE).toBe('Empresa fora do escopo do titular.');
    expect(MSG_TRIMESTRE_INVALIDO_CLIMATE).toBe(
      'Trimestre canônico deve seguir o formato YYYY-QN (N = 1..4).',
    );
    expect(MSG_ESCOPO_EQUIPE_INDISPONIVEL).toBe(
      'Escopo equipe indisponível nesta superfície pública.',
    );
    expect(MSG_LIDER_PURO_SEM_BLOCO_CLIMA).toBe('Bloco Clima indisponível para líderes puros.');
    expect(MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE).toBe(
      'Nenhum trimestre disponível para o escopo consultado.',
    );
    expect(MSG_PISO_3_INSUFICIENTE_CLIMATE).toBe(
      'Dados insuficientes: menos de 3 respondentes válidos.',
    );
  });

  it('exporta piso canonico PISO_RESPONDENTES_CLIMATE === 3 (§9.6)', () => {
    expect(PISO_RESPONDENTES_CLIMATE).toBe(3);
  });

  it('TRIMESTRE_INPUT_SCHEMA_CLIMATE valida formato YYYY-QN (N=1..4)', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('abc').success).toBe(false);
  });

  it('ESCOPO_ROUTER_SCHEMA_CLIMATE aceita apenas empresa|departamento (S174)', () => {
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('empresa').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('departamento').success).toBe(true);
    // S174: escopo 'equipe' bloqueado — Chat IA le direto do schema
    // (DOC 04 §5.5 F3B).
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('equipe').success).toBe(false);
  });

  it('GET_CLIMATE_BLOCK_INPUT_SCHEMA rejeita escopo equipe (S174)', () => {
    const invalido = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'equipe',
    });
    expect(invalido.success).toBe(false);
    const valido = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'empresa',
    });
    expect(valido.success).toBe(true);
  });

  it('RECALCULATE_CLIMATE_INPUT_SCHEMA exige trimestre canonico', () => {
    const ok = RECALCULATE_CLIMATE_INPUT_SCHEMA.safeParse({
      companyId: 1,
      trimestre: '2020-Q2',
    });
    expect(ok.success).toBe(true);
    const nok = RECALCULATE_CLIMATE_INPUT_SCHEMA.safeParse({
      companyId: 1,
      trimestre: '2020',
    });
    expect(nok.success).toBe(false);
  });

  it('marker: CNPJ_CONTRATOS reservado a ME-047 (S178)', () => {
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
  let clevel: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AUTORIZACAO);
    empRH = await createEmployee(companyId);
    empRhLider = await createEmployee(companyId, { isLider: true });
    empLider = await createEmployee(companyId, { isLider: true });
    clevel = await createClevel(companyId);
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre,
      countCobertura: 5,
      countTotal: 8,
      notaClima: 8.5,
      adesao: 62.5,
    });
  });

  it('super_admin acessa getClimateBlock', async () => {
    const token = await tokenSuperAdmin();
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
    expect(result.notaClima).toBe(8.5);
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

  it('clevel acessa getClimateBlock (excecao §9.3)', async () => {
    const token = await tokenFor('clevel', clevel, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
  });

  it('lider puro recebe FORBIDDEN em getClimateBlock (§9.9)', async () => {
    const token = await tokenFor('lider', empLider, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre }),
    ).rejects.toThrow();
  });

  it('super_admin acessa recalculateAggregates (S175)', async () => {
    const token = await tokenSuperAdmin();
    let chamadas = 0;
    const spy: ClimateEngineFacade = {
      recalculateAggregates: async (_db, cId, tri, agora): Promise<ClimateCalculationResult> => {
        chamadas += 1;
        return { companyId: cId, trimestre: tri, escopos: [], calculadoEm: agora };
      },
    };
    const caller = callerFor(token, { climateEngine: spy });
    const result: RecalculateClimateResult = await caller.recalculateAggregates({
      companyId,
      trimestre,
    });
    expect(chamadas).toBe(1);
    expect(result.trimestre).toBe(trimestre);
  });

  it('rh_lider recebe FORBIDDEN em recalculateAggregates (S175 — Bruno exclusivo)', async () => {
    const token = await tokenFor('rh_lider', empRhLider, companyId);
    const caller = callerFor(token);
    await expect(caller.recalculateAggregates({ companyId, trimestre })).rejects.toThrow();
  });

  it('clevel recebe FORBIDDEN em recalculateAggregates (S175)', async () => {
    const token = await tokenFor('clevel', clevel, companyId);
    const caller = callerFor(token);
    await expect(caller.recalculateAggregates({ companyId, trimestre })).rejects.toThrow();
  });
});

// ============================================================
// getClimateBlock — leitura canonica
// ============================================================

describe('climate-router — getClimateBlock leitura canonica', () => {
  let companyId: number;
  let empRH: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LEITURA);
    empRH = await createEmployee(companyId);
    // Historico canonico: 3 trimestres empresa + 2 departamentos no Q4.
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre: '2020-Q1',
      countCobertura: 5,
      countTotal: 8,
      notaClima: 7.0,
      adesao: 62.5,
    });
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre: '2020-Q3',
      countCobertura: 6,
      countTotal: 8,
      notaClima: 8.0,
      adesao: 75,
    });
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre: '2020-Q4',
      countCobertura: 7,
      countTotal: 9,
      notaClima: 8.5,
      adesao: 77.78,
      notaEngajamento: 8.6,
    });
    await insertClimateRow(companyId, {
      escopo: 'departamento',
      departamento: 'Comercial',
      liderId: null,
      trimestre: '2020-Q4',
      countCobertura: 3,
      countTotal: 4,
      notaClima: 8.9,
      adesao: 75,
    });
    // Piso 3: cobertura=2 -> mascara scores na leitura.
    await insertClimateRow(companyId, {
      escopo: 'departamento',
      departamento: 'Financeiro',
      liderId: null,
      trimestre: '2020-Q4',
      countCobertura: 2,
      countTotal: 4,
      notaClima: 5.0,
      adesao: 50,
    });
  });

  it('trimestre explicito retorna linha correta', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result: GetClimateBlockResult = await caller.getClimateBlock({
      companyId,
      escopo: 'empresa',
      trimestre: '2020-Q3',
    });
    expect(result.presente).toBe(true);
    expect(result.trimestre).toBe('2020-Q3');
    expect(result.notaClima).toBe(8);
  });

  it('trimestre implicito resolve MAX(trimestre) canonico', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa' });
    expect(result.presente).toBe(true);
    expect(result.trimestre).toBe('2020-Q4');
    expect(result.notaClima).toBe(8.5);
    expect(result.notaEngajamento).toBe(8.6);
  });

  it('trimestre implicito sem historico retorna presente=false', async () => {
    const companyIdNovo = await createCompany('10000000000855');
    const empNovo = await createEmployee(companyIdNovo);
    const token = await tokenFor('rh', empNovo, companyIdNovo);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId: companyIdNovo,
      escopo: 'empresa',
    });
    expect(result.presente).toBe(false);
    expect(result.dadosInsuficientes).toBe(true);
    expect(result.notaClima).toBeNull();
  });

  it('escopo departamento retorna linha correspondente', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'departamento',
      escopoReferencia: 'Comercial',
      trimestre: '2020-Q4',
    });
    expect(result.presente).toBe(true);
    expect(result.escopoReferencia).toBe('Comercial');
    expect(result.notaClima).toBe(8.9);
  });

  it('piso 3 aplicado na leitura: countCobertura<3 mascara scores (S158/S177)', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'departamento',
      escopoReferencia: 'Financeiro',
      trimestre: '2020-Q4',
    });
    expect(result.presente).toBe(true);
    expect(result.dadosInsuficientes).toBe(true);
    expect(result.notaClima).toBeNull();
    expect(result.notaEngajamento).toBeNull();
    // Adesao permanece visivel (metrica de participacao, independe de piso).
    expect(result.adesao).toBe(50);
    expect(result.countCobertura).toBe(2);
    expect(result.countTotal).toBe(4);
  });

  it('escopo departamento sem historico retorna presente=false', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'departamento',
      escopoReferencia: 'Recursos Humanos',
      trimestre: '2020-Q4',
    });
    expect(result.presente).toBe(false);
    expect(result.notaClima).toBeNull();
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

  it('cross-company (nao-super_admin) -> FORBIDDEN', async () => {
    const outraCompanyId = await createCompany('10000000000856');
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId: outraCompanyId, escopo: 'empresa' }),
    ).rejects.toThrow();
  });

  it('super_admin atravessa cross-company (§2.4)', async () => {
    const outraCompanyId = await createCompany('10000000000857');
    await insertClimateRow(outraCompanyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre: '2021-Q1',
      countCobertura: 5,
      countTotal: 5,
      notaClima: 9.0,
      adesao: 100,
    });
    const token = await tokenSuperAdmin();
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId: outraCompanyId,
      escopo: 'empresa',
      trimestre: '2021-Q1',
    });
    expect(result.presente).toBe(true);
    expect(result.notaClima).toBe(9.0);
  });

  it('Zod rejeita escopo equipe no input (S174)', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.getClimateBlock({ companyId, escopo: 'equipe' as any }),
    ).rejects.toThrow();
  });
});

// ============================================================
// recalculateAggregates — DI + hook motor
// ============================================================

describe('climate-router — recalculateAggregates DI (S168/S175)', () => {
  it('super_admin dispara motor via DI Facade (spy)', async () => {
    const companyId = await createCompany(CNPJ_RECALC);
    const argsCapturados: {
      companyId: number;
      trimestre: string;
      agora: Date;
    }[] = [];
    const spy: ClimateEngineFacade = {
      recalculateAggregates: async (_db, cId, tri, agora): Promise<ClimateCalculationResult> => {
        argsCapturados.push({ companyId: cId, trimestre: tri, agora });
        return { companyId: cId, trimestre: tri, escopos: [], calculadoEm: agora };
      },
    };
    const fixedNow = new Date('2020-12-01T12:00:00Z');
    const token = await tokenSuperAdmin();
    const caller = callerFor(token, { climateEngine: spy, now: () => fixedNow });
    const result = await caller.recalculateAggregates({
      companyId,
      trimestre: '2020-Q4',
    });
    expect(argsCapturados.length).toBe(1);
    expect(argsCapturados[0]?.companyId).toBe(companyId);
    expect(argsCapturados[0]?.trimestre).toBe('2020-Q4');
    expect(argsCapturados[0]?.agora).toEqual(fixedNow);
    expect(result.trimestre).toBe('2020-Q4');
    // Garante integridade da DI (default nao usado neste caller).
    expect(DEFAULT_CLIMATE_ENGINE.recalculateAggregates).not.toBe(spy.recalculateAggregates);
  });

  it('trimestre invalido bloqueado pelo Zod', async () => {
    const token = await tokenSuperAdmin();
    const caller = callerFor(token);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.recalculateAggregates({ companyId: 1, trimestre: 'abc' as any }),
    ).rejects.toThrow();
  });
});
