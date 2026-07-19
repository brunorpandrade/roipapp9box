// ROIP APP 9BOX — teste de integracao do sub-router `iql` (ME-046).
//
// Exercita as tres procedures canonicas do §8.8 e §19.5:
//   - `calculateIQL` (S154) — reprocessamento manual super_admin.
//   - `getIQLData` — leitura por par (avaliado, trimestre) com
//     Bloqueios 1 e 4 §8.6 + piso 3 §8.5 (S158) na camada de
//     leitura.
//   - `getTabelaIQL` — leitura consolidada com visibilidade §8.7
//     (Bruno + RH empresa; C-level acessoTotal cadeia total ou
//     propria; Lider Cenario 2 cadeia propria; Lider Cenario 1
//     FORBIDDEN).
//
// Tambem cobre:
//   - Contratos publicos exportados (RV-13: mensagens literais,
//     schemas Zod, constantes canonicas, tipos, factory, motor).
//   - Motor `iqlCalculationEngine` — formulas canonicas §8.5 (4
//     niveis: scoreDimensaoD_indiv, scoreD_indiv,
//     scoreDimensaoD_consolidado, iql), UPSERT idempotente,
//     snapshot §8.3 (S150) via `employeeLeaderHistory`.
//   - Matriz canonica de autorizacao (roleProcedure gates).
//
// Padrao S009/S076 estendido: uma company local por describe, CNPJ
// unico da faixa 10000000000836..839 (S151 — reservada ME-046 iql).
// L32 cleanup em afterAll (tabelas com FK compartilhada + fixture
// global superAdmins id=1 preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentD_responses,
  iqlData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  AVALIADO_TIPO_SCHEMA_IQL,
  CALCULATE_IQL_INPUT_SCHEMA,
  createIqlRouter,
  filterLideresFromEmployeeIds,
  GET_IQL_DATA_INPUT_SCHEMA,
  GET_TABELA_IQL_INPUT_SCHEMA,
  type GetIQLDataResult,
  type GetTabelaIQLResult,
  isLiderCenario2IQL,
  type IqlRouterDeps,
  MSG_AVALIADO_NAO_ENCONTRADO_IQL,
  MSG_D_DE_CLEVEL_APENAS_BRUNO_B4,
  MSG_DADOS_INSUFICIENTES_PISO_3,
  MSG_EMPRESA_NAO_ENCONTRADA_IQL,
  MSG_LIDER_NAO_VE_PROPRIO_IQL_B1,
  MSG_TABELA_IQL_SEM_ACESSO_COLABORADOR,
  MSG_TABELA_IQL_SEM_CADEIA_CENARIO1,
  MSG_TRIMESTRE_INVALIDO_IQL,
  PISO_RESPONDENTES_IQL,
  resolveClevelAcessoTotal,
  resolveTabelaIQLScopeEmpresa,
  scopedCadeiaLideradosDiretosIQL,
  type TabelaIQLLinha,
  TRIMESTRE_INPUT_SCHEMA_IQL,
} from '../../src/server/routers/iql';
import {
  computeMediaScores,
  computeScoreDIndiv,
  computeScoreDimensaoDIndiv,
  DEFAULT_IQL_ENGINE,
  DIA_ABERTURA_INSTRUMENT_D,
  getInstrumentDDia16,
  type IqlAvaliadoTipo,
  type IqlCalculationResult,
  type IqlEngineFacade,
  NUM_DIMENSOES_D,
  NUM_ITENS_POR_DIMENSAO_D,
  NUM_ITENS_TOTAL_D,
  recalculateForClevel,
  recalculateForLeader,
  VALOR_MAX_D,
  VALOR_MIN_D,
} from '../../src/server/services/iqlCalculationEngine';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me046-iql';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_IQL = 'hash-fixo-me046-iql';

// CNPJs canonicos por describe (S151 — faixa 836..839 reservada
// para ME-046 iql). O 830..832 (portal-save-d) e o 833..835
// (instrumentD-router) vivem em arquivos-irmaos.
const CNPJ_CONTRATOS = '10000000000836';
const CNPJ_CALCULATE = '10000000000837';
const CNPJ_GET_DATA = '10000000000838';
const CNPJ_TABELA = '10000000000839';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // L32 cleanup em ordem topologica FK.
    await client.db.delete(iqlData).where(inArray(iqlData.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentD_responses)
      .where(inArray(instrumentD_responses.companyId, createdCompanyIds));
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
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
      razaoSocial: `ME046 IQL ${cnpj} LTDA`,
      nomeFantasia: `ME046 IQL ${cnpj}`,
      cnpj,
      telefone: '1633330046',
      endereco: `Rua ME-046, ${cnpj}`,
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
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 46000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: {
    isRH?: boolean;
    isLider?: boolean;
    status?: 'ativo' | 'inativo';
    departamento?: 'Comercial' | 'Financeiro' | 'Diretoria';
    descricaoCBO?: string;
    name?: string;
  } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Colab ME046 IQL',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: opts.descricaoCBO ?? 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
      isRH: opts.isRH ?? false,
      isLider: opts.isLider ?? false,
      passwordHash: HASH_IQL,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(
  companyId: number,
  opts: { acessoTotal?: boolean; name?: string } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'C-Level ME046 IQL',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      acessoTotal: opts.acessoTotal ?? true,
      passwordHash: HASH_IQL,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me046I${seq}`.substring(0, 36).padEnd(36, '0');
}

async function linkLeader(
  employeeId: number,
  opts: { liderId?: number; clevelId?: number; dataInicio?: Date; dataFim?: Date | null },
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: opts.liderId ?? null,
    clevelId: opts.clevelId ?? null,
    dataInicio: opts.dataInicio ?? new Date('2023-01-01'),
    dataFim: opts.dataFim ?? null,
    reason: 'Fixture ME-046 IQL',
    transferBatchId: nextBatchId(),
  });
}

/**
 * Grava um grid canonico completo (20 itens) de resposta do D para
 * um respondente sobre um avaliado. Facilita o seed de cenarios de
 * calculo. `valor` uniforme (padrao 3) — testes de formula alteram.
 */
async function seedRespostaD(
  companyId: number,
  respondenteId: number,
  avaliado: { liderId?: number; clevelId?: number },
  trimestre: string,
  valor: number = 3,
  respondidoEm: Date = new Date('2024-04-01T10:00:00Z'),
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_D; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_D; i++) {
      await client.db.insert(instrumentD_responses).values({
        companyId,
        respondenteId,
        liderId: avaliado.liderId ?? null,
        clevelId: avaliado.clevelId ?? null,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor,
        respondidoEm,
        createdAt: respondidoEm,
      });
    }
  }
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
    credentialVersion: deriveCredentialVersion(HASH_IQL),
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

function bindRouter(deps: IqlRouterDeps = {}) {
  const testRouter = createIqlRouter(deps);
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// `now` canonico dentro da janela do ciclo 2024-Q1 (semestral).
const NOW_Q1_2024 = new Date('2024-04-15T12:00:00Z');

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('iql — contratos publicos exportados', () => {
  it('mensagens literais canonicas §8.6/§8.7', () => {
    expect(MSG_LIDER_NAO_VE_PROPRIO_IQL_B1).toBe(
      'Bloqueio absoluto §8.6: líder não visualiza o próprio IQL.',
    );
    expect(MSG_D_DE_CLEVEL_APENAS_BRUNO_B4).toBe(
      'Bloqueio absoluto §8.6: dados de C-level acessíveis apenas ao Super Admin.',
    );
    expect(MSG_TABELA_IQL_SEM_CADEIA_CENARIO1).toBe(
      'Tabela IQL indisponível: liderança sem cadeia descendente.',
    );
    expect(MSG_TABELA_IQL_SEM_ACESSO_COLABORADOR).toBe('Tabela IQL indisponível para este perfil.');
    expect(MSG_DADOS_INSUFICIENTES_PISO_3).toBe(
      'Dados insuficientes: menos de 3 respondentes válidos.',
    );
    expect(MSG_EMPRESA_NAO_ENCONTRADA_IQL).toBe('Empresa não encontrada.');
    expect(MSG_TRIMESTRE_INVALIDO_IQL).toBe(
      'Trimestre canônico deve seguir o formato YYYY-Q1 ou YYYY-Q3.',
    );
    expect(MSG_AVALIADO_NAO_ENCONTRADO_IQL).toBe('Avaliado não encontrado no escopo da empresa.');
  });

  it('piso 3 canonico bate §8.5', () => {
    expect(PISO_RESPONDENTES_IQL).toBe(3);
  });

  it('constantes canonicas do grid D batem §8.2', () => {
    expect(NUM_DIMENSOES_D).toBe(4);
    expect(NUM_ITENS_POR_DIMENSAO_D).toBe(5);
    expect(NUM_ITENS_TOTAL_D).toBe(20);
    expect(VALOR_MIN_D).toBe(0);
    expect(VALOR_MAX_D).toBe(4);
    expect(DIA_ABERTURA_INSTRUMENT_D).toBe(16);
  });

  it('schemas Zod aceitam Q1 e Q3, rejeitam Q2 e Q4', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-Q3').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-Q2').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-Q4').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-Q0').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_IQL.safeParse('2024-QA').success).toBe(false);
  });

  it('AVALIADO_TIPO_SCHEMA_IQL aceita apenas employee e clevel', () => {
    expect(AVALIADO_TIPO_SCHEMA_IQL.safeParse('employee').success).toBe(true);
    expect(AVALIADO_TIPO_SCHEMA_IQL.safeParse('clevel').success).toBe(true);
    expect(AVALIADO_TIPO_SCHEMA_IQL.safeParse('super_admin').success).toBe(false);
    expect(AVALIADO_TIPO_SCHEMA_IQL.safeParse('rh').success).toBe(false);
  });

  it('schemas de proc validam payload completo', () => {
    const okInput = {
      companyId: 1,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: 42,
    };
    expect(CALCULATE_IQL_INPUT_SCHEMA.safeParse(okInput).success).toBe(true);
    expect(GET_IQL_DATA_INPUT_SCHEMA.safeParse(okInput).success).toBe(true);
    expect(
      GET_TABELA_IQL_INPUT_SCHEMA.safeParse({ companyId: 1, trimestre: '2024-Q1' }).success,
    ).toBe(true);
    // companyId negativo => falha em todos.
    expect(CALCULATE_IQL_INPUT_SCHEMA.safeParse({ ...okInput, companyId: -1 }).success).toBe(false);
  });

  it('DEFAULT_IQL_ENGINE expoe as duas funcoes canonicas', () => {
    expect(typeof DEFAULT_IQL_ENGINE.recalculateForLeader).toBe('function');
    expect(typeof DEFAULT_IQL_ENGINE.recalculateForClevel).toBe('function');
    expect(DEFAULT_IQL_ENGINE.recalculateForLeader).toBe(recalculateForLeader);
    expect(DEFAULT_IQL_ENGINE.recalculateForClevel).toBe(recalculateForClevel);
  });

  it('IqlAvaliadoTipo abrange employee e clevel (padrao A canonico §2.3)', () => {
    const emp: IqlAvaliadoTipo = 'employee';
    const cl: IqlAvaliadoTipo = 'clevel';
    expect(emp).toBe('employee');
    expect(cl).toBe('clevel');
  });

  it('formulas canonicas puras §8.5 batem os niveis 1, 2, 3/4', () => {
    // Nivel 1: scoreDimensaoD_indiv = (soma5 / 20) * 100
    expect(computeScoreDimensaoDIndiv(20)).toBe(100);
    expect(computeScoreDimensaoDIndiv(10)).toBe(50);
    expect(computeScoreDimensaoDIndiv(0)).toBe(0);
    // Nivel 2: scoreD_indiv = (soma20 / 80) * 100
    expect(computeScoreDIndiv(80)).toBe(100);
    expect(computeScoreDIndiv(60)).toBe(75);
    expect(computeScoreDIndiv(40)).toBe(50);
    // Nivel 3/4: media de scores
    expect(computeMediaScores([100, 50, 75])).toBe(75);
    expect(computeMediaScores([50])).toBe(50);
    expect(computeMediaScores([])).toBeNull();
  });

  it('getInstrumentDDia16 resolve corretamente Q1 e Q3', () => {
    // Q1 -> ultimo mes = 3 (marco); Q3 -> ultimo mes = 9 (setembro).
    const d1 = getInstrumentDDia16('2024-Q1', 'America/Sao_Paulo');
    const d3 = getInstrumentDDia16('2024-Q3', 'America/Sao_Paulo');
    expect(d1).not.toBeNull();
    expect(d3).not.toBeNull();
    // 2024-03-16 00:00 -03:00 == 2024-03-16 03:00 UTC.
    expect(d1!.toISOString()).toBe('2024-03-16T03:00:00.000Z');
    expect(d3!.toISOString()).toBe('2024-09-16T03:00:00.000Z');
    expect(getInstrumentDDia16('nao-e-trimestre', 'America/Sao_Paulo')).toBeNull();
  });
});

// ============================================================
// 1) Motor canonico — recalculateForLeader e recalculateForClevel
// ============================================================

describe('iqlCalculationEngine — motor puro §8.5', () => {
  let companyId: number;
  let liderId: number;
  let clevelId: number;
  let resp1: number;
  let resp2: number;
  let resp3: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CONTRATOS);
    liderId = await createEmployee(companyId, { isLider: true, name: 'Lider Motor' });
    clevelId = await createClevel(companyId, { name: 'CLevel Motor' });
    resp1 = await createEmployee(companyId, { name: 'Resp 1' });
    resp2 = await createEmployee(companyId, { name: 'Resp 2' });
    resp3 = await createEmployee(companyId, { name: 'Resp 3' });
    // Vincula os 3 respondentes ao lider (snapshot dia 16 = 2024-03-16).
    await linkLeader(resp1, { liderId, dataInicio: new Date('2023-01-01') });
    await linkLeader(resp2, { liderId, dataInicio: new Date('2023-06-01') });
    await linkLeader(resp3, { liderId, dataInicio: new Date('2024-01-15') });
  });

  it('sem respostas: motor grava linha com scores e iql nulos', async () => {
    const result = await recalculateForLeader(
      client.db,
      companyId,
      liderId,
      '2024-Q1',
      NOW_Q1_2024,
    );
    expect(result.scoreDirecionamentoClareza).toBeNull();
    expect(result.scoreDesenvolvimentoApoio).toBeNull();
    expect(result.scoreRelacionamentoConfianca).toBeNull();
    expect(result.scoreGestaoResultados).toBeNull();
    expect(result.iql).toBeNull();
    expect(result.countRespondentes).toBe(0);
    expect(result.countRespondentesElegiveis).toBe(3);
    // Linha em iqlData existe (UPSERT canonico).
    const [row] = await client.db
      .select()
      .from(iqlData)
      .where(eq(iqlData.liderId, liderId))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row?.countRespondentes).toBe(0);
    expect(row?.countRespondentesElegiveis).toBe(3);
  });

  it('com 1 respondente valor uniforme 4: scores = 100, iql = 100, count = 1', async () => {
    await seedRespostaD(companyId, resp1, { liderId }, '2024-Q1', 4);
    const result = await recalculateForLeader(
      client.db,
      companyId,
      liderId,
      '2024-Q1',
      NOW_Q1_2024,
    );
    // Valor 4 nos 20 itens -> soma5 = 20 (todos os itens da dimensao)
    // -> scoreDimensaoD_indiv = 100 -> media dos scores por dimensao =
    // 100.
    expect(result.scoreDirecionamentoClareza).toBe(100);
    expect(result.scoreDesenvolvimentoApoio).toBe(100);
    expect(result.scoreRelacionamentoConfianca).toBe(100);
    expect(result.scoreGestaoResultados).toBe(100);
    // scoreD_indiv = (80/80)*100 = 100; media = 100.
    expect(result.iql).toBe(100);
    expect(result.countRespondentes).toBe(1);
    expect(result.countRespondentesElegiveis).toBe(3);
  });

  it('com 3 respondentes valores 4/2/0: iql = media (100+50+0)/3 = 50', async () => {
    // Zerar respostas anteriores para partir de estado limpo.
    await client.db
      .delete(instrumentD_responses)
      .where(eq(instrumentD_responses.companyId, companyId));
    await seedRespostaD(companyId, resp1, { liderId }, '2024-Q1', 4);
    await seedRespostaD(companyId, resp2, { liderId }, '2024-Q1', 2);
    await seedRespostaD(companyId, resp3, { liderId }, '2024-Q1', 0);
    const result = await recalculateForLeader(
      client.db,
      companyId,
      liderId,
      '2024-Q1',
      NOW_Q1_2024,
    );
    // scoreD_indiv por respondente: 100, 50, 0 -> media 50.
    expect(result.iql).toBe(50);
    // Cada dimensao: mesma coisa (uniforme por respondente).
    expect(result.scoreDirecionamentoClareza).toBe(50);
    expect(result.scoreDesenvolvimentoApoio).toBe(50);
    expect(result.scoreRelacionamentoConfianca).toBe(50);
    expect(result.scoreGestaoResultados).toBe(50);
    expect(result.countRespondentes).toBe(3);
  });

  it('reexecucao idempotente: UPSERT sobrescreve, nao duplica', async () => {
    // Executa duas vezes com os mesmos dados.
    const now1 = new Date('2024-04-15T12:00:00Z');
    const now2 = new Date('2024-04-15T13:00:00Z');
    await recalculateForLeader(client.db, companyId, liderId, '2024-Q1', now1);
    await recalculateForLeader(client.db, companyId, liderId, '2024-Q1', now2);
    // UNIQUE canonica garante uma unica linha por par.
    const rows = await client.db.select().from(iqlData).where(eq(iqlData.liderId, liderId));
    expect(rows.length).toBe(1);
    // calculadoEm reflete a ultima execucao.
    expect(rows[0]!.calculadoEm?.toISOString()).toBe(now2.toISOString());
  });

  it('C-level: motor recalcula usando clevelId, UPSERT por uq_iqlData_clevel', async () => {
    await client.db
      .delete(instrumentD_responses)
      .where(eq(instrumentD_responses.companyId, companyId));
    // Vincula os 3 respondentes ao clevel tambem (snapshot dia 16).
    // Precisa fechar o vinculo anterior antes de abrir novo — mas
    // como o motor conta os vinculos ativos, adicionamos vinculos ao
    // clevel deixando os do lider (linhas historicas separadas).
    // Precedente do employeeLeaderHistory permite multiplos vinculos
    // por employee (embora em producao normalmente exclusivo).
    await linkLeader(resp1, { clevelId, dataInicio: new Date('2023-01-01') });
    await seedRespostaD(companyId, resp1, { clevelId }, '2024-Q1', 4);
    const result = await recalculateForClevel(
      client.db,
      companyId,
      clevelId,
      '2024-Q1',
      NOW_Q1_2024,
    );
    expect(result.iql).toBe(100);
    expect(result.countRespondentes).toBe(1);
    // Linha em iqlData por clevelId.
    const rows = await client.db.select().from(iqlData).where(eq(iqlData.clevelId, clevelId));
    expect(rows.length).toBe(1);
  });
});

// ============================================================
// 2) calculateIQL — reprocessamento manual (S154)
// ============================================================

describe('iql.calculateIQL — Bruno exclusivo', () => {
  let companyId: number;
  let liderId: number;
  let responderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CALCULATE);
    liderId = await createEmployee(companyId, { isLider: true, name: 'Lider Calc' });
    responderId = await createEmployee(companyId, { name: 'Resp Calc' });
    await linkLeader(responderId, { liderId, dataInicio: new Date('2023-01-01') });
    await seedRespostaD(companyId, responderId, { liderId }, '2024-Q1', 3);
  });

  it('super_admin executa com sucesso e obtem resultado canonico', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = (await caller.calculateIQL({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderId,
    })) as IqlCalculationResult;
    expect(res.avaliadoTipo).toBe('employee');
    expect(res.avaliadoId).toBe(liderId);
    // valor 3 uniforme -> scoreDimensao = 75 -> iql = 75.
    expect(res.iql).toBe(75);
    expect(res.countRespondentes).toBe(1);
  });

  it('rh recebe FORBIDDEN (S154 — Bruno exclusivo)', async () => {
    const rhId = await createEmployee(companyId, { isRH: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.calculateIQL({
        companyId,
        trimestre: '2024-Q1',
        avaliadoTipo: 'employee',
        avaliadoId: liderId,
      }),
    ).rejects.toThrow();
  });

  it('NOT_FOUND com avaliado inexistente', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.calculateIQL({
        companyId,
        trimestre: '2024-Q1',
        avaliadoTipo: 'employee',
        avaliadoId: 99999999,
      }),
    ).rejects.toThrow(MSG_AVALIADO_NAO_ENCONTRADO_IQL);
  });

  it('DI: iqlEngine mock e chamado', async () => {
    let called = 0;
    const spy: IqlEngineFacade = {
      recalculateForLeader: async (
        _db,
        _company,
        _lider,
        _trim,
        _n,
      ): Promise<IqlCalculationResult> => {
        called += 1;
        return {
          companyId: _company,
          avaliadoTipo: 'employee',
          avaliadoId: _lider,
          trimestre: _trim,
          scoreDirecionamentoClareza: 42,
          scoreDesenvolvimentoApoio: 42,
          scoreRelacionamentoConfianca: 42,
          scoreGestaoResultados: 42,
          iql: 42,
          countRespondentes: 1,
          countRespondentesElegiveis: 1,
          calculadoEm: _n,
        };
      },
      recalculateForClevel: async () => {
        throw new Error('nao deveria ser chamado');
      },
    };
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024, iqlEngine: spy });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = await caller.calculateIQL({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderId,
    });
    expect(called).toBe(1);
    expect(res.iql).toBe(42);
  });
});

// ============================================================
// 3) getIQLData — Bloqueios §8.6 + piso 3 §8.5 (S158)
// ============================================================

describe('iql.getIQLData — Bloqueios §8.6 + piso 3 §8.5', () => {
  let companyId: number;
  let outroCompanyId: number;
  let liderComPiso: number;
  let liderSemPiso: number;
  let clevelId: number;
  let bruno: string;
  let responderIds: number[];

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GET_DATA);
    outroCompanyId = await createCompany('10000000000846');
    liderComPiso = await createEmployee(companyId, { isLider: true, name: 'Lider Piso' });
    liderSemPiso = await createEmployee(companyId, { isLider: true, name: 'Lider Sem Piso' });
    clevelId = await createClevel(companyId, { name: 'CLevel B4' });
    responderIds = [];
    for (let i = 0; i < 3; i++) {
      const r = await createEmployee(companyId, { name: `Resp Data ${i}` });
      responderIds.push(r);
      await linkLeader(r, { liderId: liderComPiso, dataInicio: new Date('2023-01-01') });
    }
    // Um respondente para liderSemPiso (< 3 -> piso3).
    const r0 = await createEmployee(companyId, { name: 'Resp Sem Piso' });
    await linkLeader(r0, { liderId: liderSemPiso, dataInicio: new Date('2023-01-01') });
    // Gera respostas para atingir piso (3 respondentes uniforme 4).
    for (const rid of responderIds) {
      await seedRespostaD(companyId, rid, { liderId: liderComPiso }, '2024-Q1', 4);
    }
    // 1 respondente para liderSemPiso -> abaixo do piso.
    await seedRespostaD(companyId, r0, { liderId: liderSemPiso }, '2024-Q1', 4);
    // Executa motor pelos dois lideres.
    await recalculateForLeader(client.db, companyId, liderComPiso, '2024-Q1', NOW_Q1_2024);
    await recalculateForLeader(client.db, companyId, liderSemPiso, '2024-Q1', NOW_Q1_2024);
    bruno = await tokenSuperAdmin();
  });

  it('Bruno le IQL de lider acima do piso (3+ respondentes)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getIQLData({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderComPiso,
    })) as GetIQLDataResult;
    expect(res.presente).toBe(true);
    expect(res.dadosBloqueados).toBeNull();
    expect(res.iql).toBe(100);
    expect(res.countRespondentes).toBe(3);
  });

  it('piso 3 (S158): lider com <3 respondentes retorna dadosBloqueados=piso3', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getIQLData({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderSemPiso,
    })) as GetIQLDataResult;
    expect(res.presente).toBe(true);
    expect(res.dadosBloqueados).toBe('piso3');
    expect(res.iql).toBeNull();
    expect(res.scoreDirecionamentoClareza).toBeNull();
    expect(res.countRespondentes).toBe(1);
  });

  it('B1: proprio lider tentando ver o proprio IQL recebe dadosBloqueados=B1', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('lider', liderComPiso, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getIQLData({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderComPiso,
    })) as GetIQLDataResult;
    expect(res.dadosBloqueados).toBe('B1');
    expect(res.iql).toBeNull();
    expect(res.scoreDirecionamentoClareza).toBeNull();
    expect(res.countRespondentes).toBe(3);
  });

  it('B4: clevel avaliado + role != super_admin -> FORBIDDEN', async () => {
    const rhId = await createEmployee(companyId, { isRH: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.getIQLData({
        companyId,
        trimestre: '2024-Q1',
        avaliadoTipo: 'clevel',
        avaliadoId: clevelId,
      }),
    ).rejects.toThrow(MSG_D_DE_CLEVEL_APENAS_BRUNO_B4);
  });

  it('B4: super_admin le clevel normalmente', async () => {
    // Seeda uma resposta para clevel para dar linha em iqlData.
    const r = await createEmployee(companyId, { name: 'Resp CLevel' });
    await linkLeader(r, { clevelId, dataInicio: new Date('2023-01-01') });
    await seedRespostaD(companyId, r, { clevelId }, '2024-Q1', 4);
    await recalculateForClevel(client.db, companyId, clevelId, '2024-Q1', NOW_Q1_2024);
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getIQLData({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'clevel',
      avaliadoId: clevelId,
    })) as GetIQLDataResult;
    expect(res.avaliadoTipo).toBe('clevel');
    expect(res.presente).toBe(true);
  });

  it('sem linha em iqlData: retorna presente=false com contadores zerados', async () => {
    const liderNaoRespondido = await createEmployee(companyId, {
      isLider: true,
      name: 'Lider Sem Resp',
    });
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getIQLData({
      companyId,
      trimestre: '2024-Q1',
      avaliadoTipo: 'employee',
      avaliadoId: liderNaoRespondido,
    })) as GetIQLDataResult;
    expect(res.presente).toBe(false);
    expect(res.countRespondentes).toBe(0);
    expect(res.iql).toBeNull();
  });

  it('avaliado nao encontrado -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    await expect(
      caller.getIQLData({
        companyId,
        trimestre: '2024-Q1',
        avaliadoTipo: 'employee',
        avaliadoId: 99999999,
      }),
    ).rejects.toThrow(MSG_AVALIADO_NAO_ENCONTRADO_IQL);
  });

  it('guard cruzado companyId (§2.4) para nao-super_admin', async () => {
    const rhOutro = await createEmployee(outroCompanyId, { isRH: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('rh', rhOutro, outroCompanyId);
    const caller = factory(ctx(token));
    await expect(
      caller.getIQLData({
        companyId,
        trimestre: '2024-Q1',
        avaliadoTipo: 'employee',
        avaliadoId: liderComPiso,
      }),
    ).rejects.toThrow('Empresa fora do escopo do titular.');
  });
});

// ============================================================
// 4) getTabelaIQL — visibilidade §8.7 (perfis)
// ============================================================

describe('iql.getTabelaIQL — visibilidade §8.7', () => {
  let companyId: number;
  let bruno: string;
  // Cenario canonico: 1 C-level + 2 lideres + 1 lider subordinado ao
  // lider1 (para caracterizar Cenario 2) + colaboradores como
  // respondentes.
  let clevelTotal: number;
  let clevelParcial: number;
  let lider1: number; // Cenario 2 (tem sub-lider)
  let lider2: number; // Cenario 1 (sem sub-lider)
  let subLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TABELA);
    clevelTotal = await createClevel(companyId, { acessoTotal: true, name: 'CL Total' });
    clevelParcial = await createClevel(companyId, { acessoTotal: false, name: 'CL Parcial' });
    lider1 = await createEmployee(companyId, { isLider: true, name: 'Lider 1' });
    lider2 = await createEmployee(companyId, { isLider: true, name: 'Lider 2' });
    subLider = await createEmployee(companyId, { isLider: true, name: 'Sub Lider' });
    // sub_lider vinculado ao lider1 (Cenario 2).
    await linkLeader(subLider, { liderId: lider1, dataInicio: new Date('2023-01-01') });
    // Um colaborador vinculado ao lider2 (nao-lider — Cenario 1).
    const colab2 = await createEmployee(companyId, { name: 'Colab do L2' });
    await linkLeader(colab2, { liderId: lider2, dataInicio: new Date('2023-01-01') });
    // sub_lider tambem vinculado ao clevelParcial (cadeia propria).
    await linkLeader(subLider, {
      clevelId: clevelParcial,
      dataInicio: new Date('2023-01-01'),
    });
    // Seed respostas para lider1, lider2, sub_lider — todos com 3
    // respondentes distintos para atingir o piso.
    for (const lid of [lider1, lider2, subLider]) {
      for (let i = 0; i < 3; i++) {
        const r = await createEmployee(companyId, { name: `R L${lid}-${i}` });
        await linkLeader(r, { liderId: lid, dataInicio: new Date('2023-01-01') });
        await seedRespostaD(companyId, r, { liderId: lid }, '2024-Q1', 3);
      }
      await recalculateForLeader(client.db, companyId, lid, '2024-Q1', NOW_Q1_2024);
    }
    // Seed resposta para clevelTotal.
    for (let i = 0; i < 3; i++) {
      const r = await createEmployee(companyId, { name: `R CT-${i}` });
      await linkLeader(r, { clevelId: clevelTotal, dataInicio: new Date('2023-01-01') });
      await seedRespostaD(companyId, r, { clevelId: clevelTotal }, '2024-Q1', 3);
    }
    await recalculateForClevel(client.db, companyId, clevelTotal, '2024-Q1', NOW_Q1_2024);
    bruno = await tokenSuperAdmin();
  });

  it('Bruno le todos os avaliados (lideres + C-levels)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    // 3 lideres (lider1, lider2, subLider) + 2 C-levels (clevelTotal
    // e clevelParcial) = 5. Alguns C-levels podem estar sem linha em
    // iqlData (count=0), mas ainda aparecem no escopo empresa por
    // convencao — a leitura pega countRespondentes=0 -> dadosBloqueados=piso3.
    const employeeLinhas = res.linhas.filter((l) => l.avaliadoTipo === 'employee');
    const clevelLinhas = res.linhas.filter((l) => l.avaliadoTipo === 'clevel');
    expect(employeeLinhas.length).toBe(3);
    expect(clevelLinhas.length).toBe(2);
  });

  it('RH ve apenas lideres (Bloqueio 4 omite C-levels)', async () => {
    const rhId = await createEmployee(companyId, { isRH: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    const clevelLinhas = res.linhas.filter((l) => l.avaliadoTipo === 'clevel');
    expect(clevelLinhas.length).toBe(0);
    // Todos os 3 lideres aparecem (RH nao esta na lista como lider —
    // portanto Bloqueio 1 nao remove nada).
    expect(res.linhas.filter((l) => l.avaliadoTipo === 'employee').length).toBe(3);
  });

  it('C-level acessoTotal=true: ve todos os lideres da empresa (sem C-levels)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('clevel', clevelTotal, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    const clevelLinhas = res.linhas.filter((l) => l.avaliadoTipo === 'clevel');
    expect(clevelLinhas.length).toBe(0);
    expect(res.linhas.filter((l) => l.avaliadoTipo === 'employee').length).toBe(3);
  });

  it('C-level acessoTotal=false: ve apenas cadeia descendente propria (subLider)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('clevel', clevelParcial, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    // Apenas subLider (que e o unico lider na cadeia direta do
    // clevelParcial).
    expect(res.linhas.length).toBe(1);
    expect(res.linhas[0]!.avaliadoTipo).toBe('employee');
    expect(res.linhas[0]!.avaliadoId).toBe(subLider);
  });

  it('Lider Cenario 2 (lider1 tem sub-lider): ve cadeia propria (subLider)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('lider', lider1, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    // Bloqueio 1 remove a propria linha; sub_lider e o unico lider
    // na cadeia descendente.
    expect(res.linhas.length).toBe(1);
    expect(res.linhas[0]!.avaliadoId).toBe(subLider);
    // lider1 nao aparece (Bloqueio 1).
    expect(res.linhas.find((l) => l.avaliadoId === lider1)).toBeUndefined();
  });

  it('Lider Cenario 1 (lider2 sem sub-lideres): FORBIDDEN canonico', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const token = await tokenPlatform('lider', lider2, companyId);
    const caller = factory(ctx(token));
    await expect(caller.getTabelaIQL({ companyId, trimestre: '2024-Q1' })).rejects.toThrow(
      MSG_TABELA_IQL_SEM_CADEIA_CENARIO1,
    );
  });

  it('ordenacao canonica ASC por nome', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    for (let i = 0; i < res.linhas.length - 1; i++) {
      const cmp = res.linhas[i]!.nome.localeCompare(res.linhas[i + 1]!.nome, 'pt-BR');
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('piso 3: linha aparece com iql=null e dadosBloqueados=piso3', async () => {
    // Cria lider extra sem respondentes suficientes.
    const liderExtra = await createEmployee(companyId, {
      isLider: true,
      name: 'Zzzz Extra Lider',
    });
    const r = await createEmployee(companyId, { name: 'Solo Resp' });
    await linkLeader(r, { liderId: liderExtra, dataInicio: new Date('2023-01-01') });
    await seedRespostaD(companyId, r, { liderId: liderExtra }, '2024-Q1', 4);
    await recalculateForLeader(client.db, companyId, liderExtra, '2024-Q1', NOW_Q1_2024);
    const { factory, ctx } = bindRouter({ now: () => NOW_Q1_2024 });
    const caller = factory(ctx(bruno));
    const res = (await caller.getTabelaIQL({
      companyId,
      trimestre: '2024-Q1',
    })) as GetTabelaIQLResult;
    const linhaExtra = res.linhas.find((l) => l.avaliadoId === liderExtra);
    expect(linhaExtra).toBeTruthy();
    expect(linhaExtra!.dadosBloqueados).toBe('piso3');
    expect(linhaExtra!.iql).toBeNull();
    expect(linhaExtra!.countRespondentes).toBe(1);
  });
});

// ============================================================
// 5) Helpers canonicos exportados (RV-13)
// ============================================================

describe('iql — helpers canonicos exportados (RV-13)', () => {
  it('resolveClevelAcessoTotal retorna acessoTotal do C-level ou null', async () => {
    const companyId = await createCompany('10000000000847');
    const clTotal = await createClevel(companyId, { acessoTotal: true });
    const clParcial = await createClevel(companyId, { acessoTotal: false });
    expect(await resolveClevelAcessoTotal(client.db, companyId, clTotal)).toBe(true);
    expect(await resolveClevelAcessoTotal(client.db, companyId, clParcial)).toBe(false);
    expect(await resolveClevelAcessoTotal(client.db, companyId, 99999999)).toBeNull();
  });

  it('scopedCadeiaLideradosDiretosIQL retorna liderados diretos ativos', async () => {
    const companyId = await createCompany('10000000000848');
    const lider = await createEmployee(companyId, { isLider: true });
    const liderado1 = await createEmployee(companyId);
    const liderado2 = await createEmployee(companyId);
    await linkLeader(liderado1, { liderId: lider, dataInicio: new Date('2023-01-01') });
    await linkLeader(liderado2, { liderId: lider, dataInicio: new Date('2023-01-01') });
    const ids = await scopedCadeiaLideradosDiretosIQL(client.db, companyId, lider, null);
    expect(new Set(ids)).toEqual(new Set([liderado1, liderado2]));
  });

  it('isLiderCenario2IQL retorna true quando ha sub-lider na cadeia', async () => {
    const companyId = await createCompany('10000000000849');
    const lider = await createEmployee(companyId, { isLider: true });
    const subLider = await createEmployee(companyId, { isLider: true });
    const naoLider = await createEmployee(companyId, { isLider: false });
    await linkLeader(subLider, { liderId: lider, dataInicio: new Date('2023-01-01') });
    await linkLeader(naoLider, { liderId: lider, dataInicio: new Date('2023-01-01') });
    expect(await isLiderCenario2IQL(client.db, companyId, lider)).toBe(true);
    // Cria outro lider sem sub-lider.
    const liderSemSub = await createEmployee(companyId, { isLider: true });
    const soColab = await createEmployee(companyId, { isLider: false });
    await linkLeader(soColab, { liderId: liderSemSub, dataInicio: new Date('2023-01-01') });
    expect(await isLiderCenario2IQL(client.db, companyId, liderSemSub)).toBe(false);
  });

  it('resolveTabelaIQLScopeEmpresa e filterLideresFromEmployeeIds trabalham juntos', async () => {
    const companyId = await createCompany('10000000000850');
    const l1 = await createEmployee(companyId, { isLider: true });
    const l2 = await createEmployee(companyId, { isLider: true });
    const cl = await createClevel(companyId);
    const scope = await resolveTabelaIQLScopeEmpresa(client.db, companyId);
    expect(new Set(scope.liderIds)).toEqual(new Set([l1, l2]));
    expect(scope.clevelIds).toContain(cl);
    // filter: dados de 3 employees, so 2 sao lideres.
    const naoLider = await createEmployee(companyId, { isLider: false });
    const filtered = await filterLideresFromEmployeeIds(client.db, companyId, [l1, l2, naoLider]);
    expect(new Set(filtered)).toEqual(new Set([l1, l2]));
    // Suprime warning de linter: tipos publicos usados.
    const _linha: TabelaIQLLinha = {
      avaliadoTipo: 'employee',
      avaliadoId: l1,
      nome: 'x',
      departamento: 'y',
      cargo: 'z',
      iql: null,
      countRespondentes: 0,
      dadosBloqueados: null,
    };
    expect(_linha.avaliadoId).toBe(l1);
  });
});
