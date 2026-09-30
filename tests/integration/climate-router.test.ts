// ROIP APP 9BOX — teste de integracao do sub-router `climate`
// (ME-047 + ME-B2-01a.2).
//
// Exercita as duas procedures canonicas do §9.11 e §19.6 do DOC 03:
//   - `getClimateBlock` — leitura por (companyId, escopo,
//     escopoReferencia?, liderId?, liderTipo?, trimestre?). Aplica
//     piso 3 §9.6 (S158, S177) na camada de leitura. Escopo 'equipe'
//     DESBLOQUEADO (ME-B2-01a.2 canoniza Q4=A1; S174 aposentada) com
//     polimorfia liderId + liderTipo XOR-no-caller. Cascata
//     silenciosa canonica: equipe -> departamento -> empresa quando
//     `countCobertura < 3`.
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
//   - Guard C-level acessoTotal (Q1=A canoniza — supera §9.3):
//     C-level `acessoTotal=false` recebe FORBIDDEN literal.
//   - Escopo 'equipe' com liderTipo='employee' e liderTipo='clevel'.
//   - Cascata silenciosa canonica em 3 niveis (Q4=A1).
//   - Motor Clima real chamado via DI default.
//
// Padrao S009/S076 estendido (S178/S178b): uma company local por
// describe, CNPJ unico da faixa 10000000000850..859 (S178c — faixa
// estendida da ME-B2-01a.2). L32 cleanup em afterAll. JWT_SECRET fixo.

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
  LIDER_TIPO_SCHEMA_CLIMATE,
  MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED,
  MSG_CLIMATE_LIDER_ID_REQUIRED,
  MSG_CLIMATE_LIDER_TIPO_REQUIRED,
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

// CNPJs canonicos por describe (S178c — faixa 850..870 estendida da
// ME-B2-01a.2; 855..870 usados dentro de describes com mais de uma
// company e novos describes de cascata canonica).
const CNPJ_CONTRATOS = '10000000000850';
const CNPJ_AUTORIZACAO = '10000000000851';
const CNPJ_LEITURA = '10000000000852';
const CNPJ_GUARDS = '10000000000853';
const CNPJ_RECALC = '10000000000854';
const CNPJ_CASCATA = '10000000000860';
const CNPJ_EQUIPE_EMPLOYEE = '10000000000861';
const CNPJ_EQUIPE_CLEVEL = '10000000000862';
const CNPJ_CLEVEL_GUARD = '10000000000863';

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

async function insertClimateRow(
  companyId: number,
  opts: {
    escopo: 'empresa' | 'departamento' | 'equipe';
    departamento: string | null;
    liderId: number | null;
    clevelId?: number | null;
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
    clevelId: opts.clevelId ?? null,
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
  it('exporta mensagens canonicas literais §9 + ME-B2-01a.2', () => {
    expect(MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE).toBe('Empresa fora do escopo do titular.');
    expect(MSG_TRIMESTRE_INVALIDO_CLIMATE).toBe(
      'Trimestre canônico deve seguir o formato YYYY-QN (N = 1..4).',
    );
    // ME-B2-01a.2 — S174 aposentada; mensagem canonizada como
    // orientacao de validacao fina (liderId + liderTipo XOR-no-caller).
    expect(MSG_ESCOPO_EQUIPE_INDISPONIVEL).toBe(
      'Escopo equipe requer liderId + liderTipo (padrão XOR-no-caller).',
    );
    expect(MSG_LIDER_PURO_SEM_BLOCO_CLIMA).toBe('Bloco Clima indisponível para líderes puros.');
    expect(MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE).toBe(
      'Nenhum trimestre disponível para o escopo consultado.',
    );
    expect(MSG_PISO_3_INSUFICIENTE_CLIMATE).toBe(
      'Dados insuficientes: menos de 3 respondentes válidos.',
    );
    // ME-B2-01a.2 — novas mensagens canonicas.
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

  it('TRIMESTRE_INPUT_SCHEMA_CLIMATE valida formato YYYY-QN (N=1..4)', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q4').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('2020-Q5').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_CLIMATE.safeParse('abc').success).toBe(false);
  });

  it('ESCOPO_ROUTER_SCHEMA_CLIMATE aceita empresa|departamento|equipe (ME-B2-01a.2)', () => {
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('empresa').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('departamento').success).toBe(true);
    // ME-B2-01a.2 — S174 aposentada; escopo 'equipe' aceito no Zod;
    // validacao fina (liderId + liderTipo) fica no handler.
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('equipe').success).toBe(true);
    expect(ESCOPO_ROUTER_SCHEMA_CLIMATE.safeParse('foo').success).toBe(false);
  });

  it('LIDER_TIPO_SCHEMA_CLIMATE aceita employee|clevel (ME-B2-01a.2)', () => {
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('employee').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('clevel').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLIMATE.safeParse('outro').success).toBe(false);
  });

  it('GET_CLIMATE_BLOCK_INPUT_SCHEMA aceita escopo equipe (ME-B2-01a.2)', () => {
    // ME-B2-01a.2 — Zod aceita escopo=equipe; validacao fina no handler.
    const equipe = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'equipe',
      liderId: 42,
      liderTipo: 'employee',
    });
    expect(equipe.success).toBe(true);
    const empresa = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'empresa',
    });
    expect(empresa.success).toBe(true);
    // Escopo invalido continua rejeitado.
    const invalido = GET_CLIMATE_BLOCK_INPUT_SCHEMA.safeParse({
      companyId: 1,
      escopo: 'invalid-escopo',
    });
    expect(invalido.success).toBe(false);
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

  it('clevel acessoTotal=true acessa getClimateBlock (ME-B2-01a.2 Q1=A)', async () => {
    // createClevel default cria com acessoTotal=true; Q1=A canoniza
    // que apenas C-level com acessoTotal=true ve o Bloco Clima.
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

  it('departamento com countCobertura<3 cascateia para empresa (ME-B2-01a.2 Q4=A1)', async () => {
    // ME-B2-01a.2 canoniza cascata silenciosa: departamento abaixo
    // do piso NAO retorna scores mascarados — sobe para empresa,
    // que tem countCobertura=7 (acima do piso). O escopo requisitado
    // permanece 'departamento' no payload; escopoEfetivo canoniza
    // o nivel onde a linha foi obtida.
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'departamento',
      escopoReferencia: 'Financeiro',
      trimestre: '2020-Q4',
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('departamento');
    expect(result.escopoReferencia).toBe('Financeiro');
    expect(result.escopoEfetivo.escopo).toBe('empresa');
    expect(result.escopoEfetivo.escopoReferencia).toBeNull();
    expect(result.notaAgregacao).toBe('agregado_empresa');
    // Retorna scores canonicos da empresa (7 respondentes >= piso).
    expect(result.notaClima).toBe(8.5);
    expect(result.notaEngajamento).toBe(8.6);
    expect(result.countCobertura).toBe(7);
    expect(result.countTotal).toBe(9);
  });

  it('escopo departamento sem historico cascateia para empresa (ME-B2-01a.2 Q4=A1)', async () => {
    // ME-B2-01a.2 canoniza: departamento sem linha canonica cascateia
    // para empresa (mesmo tratamento de departamento abaixo do piso).
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'departamento',
      escopoReferencia: 'Recursos Humanos',
      trimestre: '2020-Q4',
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('departamento');
    expect(result.escopoReferencia).toBe('Recursos Humanos');
    expect(result.escopoEfetivo.escopo).toBe('empresa');
    expect(result.notaAgregacao).toBe('agregado_empresa');
    expect(result.notaClima).toBe(8.5);
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

  it('escopo equipe sem liderId retorna BAD_REQUEST (ME-B2-01a.2)', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'equipe', liderTipo: 'employee' }),
    ).rejects.toThrow(MSG_CLIMATE_LIDER_ID_REQUIRED);
  });

  it('escopo equipe sem liderTipo retorna BAD_REQUEST (ME-B2-01a.2)', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'equipe', liderId: 42 }),
    ).rejects.toThrow(MSG_CLIMATE_LIDER_TIPO_REQUIRED);
  });
});

// ============================================================
// ME-B2-01a.2 — guard canonico C-level acessoTotal (Q1=A)
// ============================================================

describe('climate-router — C-level acessoTotal guard (ME-B2-01a.2)', () => {
  let companyId: number;
  let clevelAcessoTotal: number;
  let clevelSemAcesso: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CLEVEL_GUARD);
    clevelAcessoTotal = await createClevel(companyId, { acessoTotal: true });
    clevelSemAcesso = await createClevel(companyId, { acessoTotal: false });
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre,
      countCobertura: 6,
      countTotal: 8,
      notaClima: 8.2,
      adesao: 75,
    });
  });

  it('C-level acessoTotal=true acessa (Q1=A canonica)', async () => {
    const token = await tokenFor('clevel', clevelAcessoTotal, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre });
    expect(result.presente).toBe(true);
    expect(result.notaClima).toBe(8.2);
  });

  it('C-level acessoTotal=false recebe FORBIDDEN literal (supera §9.3)', async () => {
    const token = await tokenFor('clevel', clevelSemAcesso, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({ companyId, escopo: 'empresa', trimestre }),
    ).rejects.toThrow(MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED);
  });

  it('C-level acessoTotal=false recebe FORBIDDEN independente do escopo', async () => {
    const token = await tokenFor('clevel', clevelSemAcesso, companyId);
    const caller = callerFor(token);
    await expect(
      caller.getClimateBlock({
        companyId,
        escopo: 'departamento',
        escopoReferencia: 'Comercial',
        trimestre,
      }),
    ).rejects.toThrow(MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED);
  });
});

// ============================================================
// ME-B2-01a.2 — escopo=equipe canonico polimorfico
// ============================================================

describe('climate-router — escopo=equipe liderTipo=employee (ME-B2-01a.2)', () => {
  let companyId: number;
  let empRH: number;
  let lider: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_EQUIPE_EMPLOYEE);
    empRH = await createEmployee(companyId);
    lider = await createEmployee(companyId, { isLider: true });
    // Linha canonica equipe com liderId=employee no grid S176 estendido.
    await insertClimateRow(companyId, {
      escopo: 'equipe',
      departamento: null,
      liderId: lider,
      trimestre,
      countCobertura: 4,
      countTotal: 5,
      notaClima: 7.5,
      adesao: 80,
    });
  });

  it('retorna linha canonica equipe para liderTipo=employee', async () => {
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
    expect(result.escopo).toBe('equipe');
    expect(result.liderId).toBe(lider);
    expect(result.liderTipo).toBe('employee');
    expect(result.notaClima).toBe(7.5);
    expect(result.dadosDisponiveis).toBe(true);
    // Escopo efetivo == escopo requisitado (nenhuma cascata).
    expect(result.escopoEfetivo.escopo).toBe('equipe');
    expect(result.escopoEfetivo.liderId).toBe(lider);
    expect(result.escopoEfetivo.liderTipo).toBe('employee');
    expect(result.notaAgregacao).toBeNull();
  });
});

describe('climate-router — escopo=equipe liderTipo=clevel (ME-B2-01a.2)', () => {
  let companyId: number;
  let empRH: number;
  let clevel: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_EQUIPE_CLEVEL);
    empRH = await createEmployee(companyId);
    clevel = await createClevel(companyId, { acessoTotal: true });
    // Linha canonica equipe polimorfica clevelId (ME-B2-01a.1.1).
    await insertClimateRow(companyId, {
      escopo: 'equipe',
      departamento: null,
      liderId: null,
      clevelId: clevel,
      trimestre,
      countCobertura: 5,
      countTotal: 6,
      notaClima: 8.4,
      adesao: 83.33,
    });
  });

  it('retorna linha canonica equipe polimorfica para liderTipo=clevel', async () => {
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
    expect(result.escopo).toBe('equipe');
    expect(result.liderId).toBe(clevel);
    expect(result.liderTipo).toBe('clevel');
    expect(result.notaClima).toBe(8.4);
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopoEfetivo.escopo).toBe('equipe');
    expect(result.escopoEfetivo.liderId).toBe(clevel);
    expect(result.escopoEfetivo.liderTipo).toBe('clevel');
    expect(result.notaAgregacao).toBeNull();
  });
});

// ============================================================
// ME-B2-01a.2 — cascata silenciosa canonica (Q4=A1)
// ============================================================

describe('climate-router — cascata silenciosa (ME-B2-01a.2 Q4=A1)', () => {
  let companyId: number;
  let empRH: number;
  let liderComPiso: number;
  let liderSemPiso: number;
  const trimestre = '2020-Q4';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CASCATA);
    empRH = await createEmployee(companyId);
    liderComPiso = await createEmployee(companyId, { isLider: true });
    liderSemPiso = await createEmployee(companyId, { isLider: true });
    // Grid canonico S176 estendido: empresa + departamento acima do
    // piso; equipe abaixo do piso (para acionar cascata).
    await insertClimateRow(companyId, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre,
      countCobertura: 8,
      countTotal: 10,
      notaClima: 7.0,
      adesao: 80,
    });
    await insertClimateRow(companyId, {
      escopo: 'departamento',
      departamento: 'Comercial',
      liderId: null,
      trimestre,
      countCobertura: 5,
      countTotal: 6,
      notaClima: 8.0,
      adesao: 83.33,
    });
    // Equipe com piso ok (nao aciona cascata).
    await insertClimateRow(companyId, {
      escopo: 'equipe',
      departamento: null,
      liderId: liderComPiso,
      trimestre,
      countCobertura: 4,
      countTotal: 5,
      notaClima: 9.1,
      adesao: 80,
    });
    // Equipe abaixo do piso (aciona cascata para departamento).
    await insertClimateRow(companyId, {
      escopo: 'equipe',
      departamento: null,
      liderId: liderSemPiso,
      trimestre,
      countCobertura: 2,
      countTotal: 3,
      notaClima: 6.0,
      adesao: 66.67,
    });
  });

  it('equipe com piso ok retorna sem cascata (dadosDisponiveis=true)', async () => {
    const token = await tokenFor('rh', empRH, companyId);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId,
      escopo: 'equipe',
      liderId: liderComPiso,
      liderTipo: 'employee',
      trimestre,
    });
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopoEfetivo.escopo).toBe('equipe');
    expect(result.notaClima).toBe(9.1);
    expect(result.notaAgregacao).toBeNull();
  });

  it('equipe sem piso cascateia p/ depto (notaAgregacao=agregado_departamento)', async () => {
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
    // Cascata canonica: escopo requisitado permanece 'equipe' no
    // input; escopoEfetivo canoniza o nivel onde a linha foi obtida.
    expect(result.escopo).toBe('equipe');
    expect(result.liderId).toBe(liderSemPiso);
    expect(result.escopoEfetivo.escopo).toBe('departamento');
    expect(result.escopoEfetivo.escopoReferencia).toBe('Comercial');
    expect(result.notaClima).toBe(8.0);
    expect(result.notaAgregacao).toBe('agregado_departamento');
  });

  it('departamento sem piso cascateia para empresa (notaAgregacao=agregado_empresa)', async () => {
    // Cria empresa nova com departamento abaixo do piso + empresa acima.
    const companyIdCascataDept = await createCompany('10000000000864');
    const empRHNovo = await createEmployee(companyIdCascataDept);
    await insertClimateRow(companyIdCascataDept, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre,
      countCobertura: 6,
      countTotal: 8,
      notaClima: 7.7,
      adesao: 75,
    });
    await insertClimateRow(companyIdCascataDept, {
      escopo: 'departamento',
      departamento: 'Comercial',
      liderId: null,
      trimestre,
      countCobertura: 2,
      countTotal: 3,
      notaClima: 5.0,
      adesao: 66.67,
    });
    const token = await tokenFor('rh', empRHNovo, companyIdCascataDept);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId: companyIdCascataDept,
      escopo: 'departamento',
      escopoReferencia: 'Comercial',
      trimestre,
    });
    expect(result.dadosDisponiveis).toBe(true);
    expect(result.escopo).toBe('departamento');
    expect(result.escopoReferencia).toBe('Comercial');
    expect(result.escopoEfetivo.escopo).toBe('empresa');
    expect(result.escopoEfetivo.escopoReferencia).toBeNull();
    expect(result.notaClima).toBe(7.7);
    expect(result.notaAgregacao).toBe('agregado_empresa');
  });

  it('empresa sem piso mantem dadosDisponiveis=false (nem empresa atende)', async () => {
    const companyIdSemPiso = await createCompany('10000000000865');
    const empRHSemPiso = await createEmployee(companyIdSemPiso);
    await insertClimateRow(companyIdSemPiso, {
      escopo: 'empresa',
      departamento: null,
      liderId: null,
      trimestre,
      countCobertura: 2,
      countTotal: 3,
      notaClima: 6.0,
      adesao: 66.67,
    });
    const token = await tokenFor('rh', empRHSemPiso, companyIdSemPiso);
    const caller = callerFor(token);
    const result = await caller.getClimateBlock({
      companyId: companyIdSemPiso,
      escopo: 'empresa',
      trimestre,
    });
    expect(result.presente).toBe(true);
    expect(result.dadosDisponiveis).toBe(false);
    expect(result.dadosInsuficientes).toBe(true);
    expect(result.notaClima).toBeNull();
    expect(result.adesao).toBe(66.67);
    expect(result.countCobertura).toBe(2);
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
