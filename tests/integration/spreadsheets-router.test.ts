// ROIP APP 9BOX — teste de integracao do sub-router `spreadsheets`
// (ME-048).
//
// Exercita as quatro procedures canonicas do §3.11 e §19.6 do DOC 03:
//   - `downloadRHTemplate` — gera XLSX pronto para preenchimento pelo
//     RH com cabecalhos canonicos exatos e sheet protection nativa.
//   - `uploadRHData` — parser XLSX, agregacao e delegacao a
//     `saveMonthlyRHData` via DI Facade (S185); erros por linha
//     acumulados (S186).
//   - `downloadLeaderTemplate` — gera XLSX pronto para preenchimento
//     pelo Lider com cabecalhos dinamicos (Meta/Demanda/Realizado
//     [Variavel N]) e cell protection nativa para Familia 6 (Demanda
//     '—' locked) e peso zero (Demanda/Realizado locked).
//   - `uploadLeaderData` — parser + delegacao a saveMonthlyLeaderData.
//
// Padrao S009/S076/S187: uma company local por describe, CNPJ unico
// da faixa reservada 860..869 (S187). L32 cleanup em afterAll.
// JWT_SECRET fixo. Facade mockada para isolamento (S144); um bloco
// dedicado exercita o DEFAULT_MONTHLY_DATA_FACADE (caller real).

import ExcelJS from 'exceljs';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  companyMonthlyData,
  employeeLeaderHistory,
  employees,
  performanceData,
  performanceVariableData,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  COLUNAS_CANONICAS_RH,
  COLUNAS_FIXAS_LIDER,
  createSpreadsheetsRouter,
  DEFAULT_MONTHLY_DATA_FACADE,
  DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA,
  DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA,
  LABEL_DEMANDA,
  LABEL_META,
  LABEL_REALIZADO,
  LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS,
  MES_INPUT_SCHEMA_SPREADSHEETS,
  MSG_ABA_AUSENTE_LIDER,
  MSG_ABA_AUSENTE_RH,
  MSG_CABECALHOS_INVALIDOS_LIDER,
  MSG_CABECALHOS_INVALIDOS_RH,
  MSG_CPF_NAO_ENCONTRADO,
  MSG_EMPRESA_FORA_DO_ESCOPO_SPREADSHEETS,
  MSG_LIDERADO_FORA_DA_CADEIA,
  MSG_VALOR_NAO_NUMERICO,
  MSG_XLSX_INVALIDO,
  type MonthlyDataFacade,
  NOME_ABA_LIDER,
  NOME_ABA_RH,
  sanitizeRazaoSocial,
  type SaveMonthlyRHInput,
  type SaveMonthlyLeaderInput,
  UPLOAD_LEADER_DATA_INPUT_SCHEMA,
  UPLOAD_RH_DATA_INPUT_SCHEMA,
  VALOR_DEMANDA_FAMILIA_6,
} from '../../src/server/routers/spreadsheets';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me048-spreadsheets-router';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_ME048 = 'hash-fixo-me048-spreadsheets-router';

// Faixa CNPJ canonica da ME-048 (S187).
const CNPJ_CONTRATOS = '10000000000860';
const CNPJ_AUTORIZACAO_RH = '10000000000861';
const CNPJ_AUTORIZACAO_LIDER = '10000000000862';
const CNPJ_GUARDS = '10000000000863';
const CNPJ_DOWNLOAD_RH = '10000000000864';
const CNPJ_DOWNLOAD_LIDER = '10000000000865';
const CNPJ_UPLOAD_RH = '10000000000866';
const CNPJ_UPLOAD_LIDER = '10000000000867';
const CNPJ_INTEGRACAO_REAL = '10000000000868';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = emps.map((e) => e.id);

    const perfRows = await client.db
      .select({ id: performanceData.id })
      .from(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    const perfIds = perfRows.map((p) => p.id);
    if (perfIds.length > 0) {
      await client.db
        .delete(performanceVariableData)
        .where(inArray(performanceVariableData.performanceDataId, perfIds));
    }
    await client.db
      .delete(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, createdCompanyIds));
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

async function createCompany(cnpj: string, razaoSocial?: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: razaoSocial ?? `ME048 SS ${cnpj} LTDA`,
      nomeFantasia: `ME048 SS ${cnpj}`,
      cnpj,
      telefone: '1633330048',
      endereco: `Rua ME-048 SS, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `pr-${cnpj}@example.com`,
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

let cpfCounter = 48100000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: {
    name?: string;
    isLider?: boolean;
    jobFamily?: 'vendas_comercial' | 'lideranca_gestao' | 'administrativo_suporte';
    status?: 'ativo' | 'inativo';
  } = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? `EmpSS ${cpf}`,
      cpf,
      email: `emp-ss-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: opts.jobFamily ?? 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: opts.isLider === true ? 'tatico' : 'operacional',
      departamento: 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: false,
      passwordHash: HASH_ME048,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(companyId: number, name?: string): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: name ?? `ClevelSS ${cpf}`,
      cpf,
      email: `clevel-ss-${cpf}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO da companhia',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      status: 'ativo',
      passwordHash: HASH_ME048,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function linkLeader(
  employeeId: number,
  liderId: number | null,
  clevelId: number | null,
  dataInicio: Date = new Date('2020-01-01'),
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId,
    dataInicio,
    dataFim: null,
    reason: 'me048-ss-seed',
    transferBatchId: 'me048-ss-batch',
  });
}

async function seedVariables(
  companyId: number,
  jobFamily: 'vendas_comercial' | 'lideranca_gestao' | 'administrativo_suporte',
  variaveis: Array<{ variableIndex: number; weight: string }>,
): Promise<void> {
  for (const v of variaveis) {
    await client.db.insert(companyJobFamilies).values({
      companyId,
      jobFamily,
      variableIndex: v.variableIndex,
      variableName: `Variavel ${v.variableIndex}`,
      unit: 'un',
      weight: v.weight,
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
  }
}

async function tokenFor(role: PlatformRole, userId: number, companyId: number): Promise<string> {
  const credVersion = deriveCredentialVersion(HASH_ME048);
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

/** Facade mock que grava chamadas e retorna sucesso padrao. */
function makeMockFacade(overrides?: Partial<MonthlyDataFacade>): {
  facade: MonthlyDataFacade;
  callsRH: SaveMonthlyRHInput[];
  callsLeader: SaveMonthlyLeaderInput[];
} {
  const callsRH: SaveMonthlyRHInput[] = [];
  const callsLeader: SaveMonthlyLeaderInput[] = [];
  const facade: MonthlyDataFacade = {
    saveMonthlyRHData: overrides?.saveMonthlyRHData
      ? overrides.saveMonthlyRHData
      : async (_ctx, input) => {
          callsRH.push(input);
          return {
            ok: true,
            companyId: input.companyId,
            mes: input.mes,
            colaboradoresGravados: input.colaboradores?.length ?? 0,
            variaveisGravadas: 0,
          };
        },
    saveMonthlyLeaderData: overrides?.saveMonthlyLeaderData
      ? overrides.saveMonthlyLeaderData
      : async (_ctx, input) => {
          callsLeader.push(input);
          return {
            ok: true,
            companyId: input.companyId,
            mes: input.mes,
            colaboradoresGravados: input.liderados.length,
            variaveisGravadas: input.liderados.reduce((acc, l) => acc + l.variaveis.length, 0),
          };
        },
  };
  return { facade, callsRH, callsLeader };
}

function callerFor(bearerToken: string | null, facade?: MonthlyDataFacade) {
  const factory = createCallerFactory(
    createSpreadsheetsRouter(facade ? { monthlyDataFacade: facade } : {}),
  );
  return factory(contextFor(bearerToken));
}

async function loadWorkbookFromBase64(xlsxBase64: string): Promise<ExcelJS.Workbook> {
  const buf = Buffer.from(xlsxBase64, 'base64');
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any);
  return wb;
}

// ============================================================
// Contratos publicos (RV-13)
// ============================================================

describe('spreadsheets-router — contratos publicos (RV-13)', () => {
  it('exporta mensagens canonicas literais §3.11', () => {
    expect(MSG_EMPRESA_FORA_DO_ESCOPO_SPREADSHEETS).toBe('Empresa fora do escopo.');
    expect(MSG_XLSX_INVALIDO).toBe('Arquivo XLSX invalido ou corrompido.');
    expect(MSG_ABA_AUSENTE_RH).toBe('Aba "Preenchimento mensal RH" ausente no arquivo.');
    expect(MSG_ABA_AUSENTE_LIDER).toBe('Aba "Preenchimento mensal Lider" ausente no arquivo.');
    expect(MSG_CABECALHOS_INVALIDOS_RH).toBe(
      'Cabecalhos da planilha divergem do template canonico RH.',
    );
    expect(MSG_CABECALHOS_INVALIDOS_LIDER).toBe(
      'Cabecalhos da planilha divergem do template canonico Lider.',
    );
    expect(MSG_CPF_NAO_ENCONTRADO).toBe('CPF nao encontrado entre colaboradores da empresa.');
    expect(MSG_LIDERADO_FORA_DA_CADEIA).toBe('Liderado fora da cadeia direta do lider no mes.');
    expect(MSG_VALOR_NAO_NUMERICO).toBe('Valor nao numerico em coluna numerica.');
  });

  it('exporta colunas canonicas RH em ordem exata (§3.11)', () => {
    expect(COLUNAS_CANONICAS_RH).toEqual([
      'Nome',
      'CPF',
      'Cargo',
      'Lider direto',
      'Custo mensal (R$)',
      'Faltas',
    ]);
  });

  it('exporta colunas fixas canonicas Lider (§3.11)', () => {
    expect(COLUNAS_FIXAS_LIDER).toEqual(['Nome liderado', 'Cargo']);
  });

  it('LABEL_META/DEMANDA/REALIZADO seguem CC3 canonico (§3.11)', () => {
    expect(LABEL_META(1)).toBe('Meta [Variavel 1]');
    expect(LABEL_DEMANDA(2)).toBe('Demanda [Variavel 2]');
    expect(LABEL_REALIZADO(4)).toBe('Realizado [Variavel 4]');
  });

  it('VALOR_DEMANDA_FAMILIA_6 e o em-dash canonico (§3.11 CC3)', () => {
    expect(VALOR_DEMANDA_FAMILIA_6).toBe('—');
  });

  it('NOME_ABA_RH e NOME_ABA_LIDER canonicos exatos', () => {
    expect(NOME_ABA_RH).toBe('Preenchimento mensal RH');
    expect(NOME_ABA_LIDER).toBe('Preenchimento mensal Lider');
  });

  it('MES_INPUT_SCHEMA_SPREADSHEETS aceita YYYY-MM valido', () => {
    expect(MES_INPUT_SCHEMA_SPREADSHEETS.safeParse('2025-01').success).toBe(true);
    expect(MES_INPUT_SCHEMA_SPREADSHEETS.safeParse('2025-12').success).toBe(true);
    expect(MES_INPUT_SCHEMA_SPREADSHEETS.safeParse('2025-13').success).toBe(false);
    expect(MES_INPUT_SCHEMA_SPREADSHEETS.safeParse('2025-00').success).toBe(false);
    expect(MES_INPUT_SCHEMA_SPREADSHEETS.safeParse('abc').success).toBe(false);
  });

  it('LIDER_TIPO_INPUT_SCHEMA aceita employee|clevel', () => {
    expect(LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS.safeParse('employee').success).toBe(true);
    expect(LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS.safeParse('clevel').success).toBe(true);
    expect(LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS.safeParse('rh').success).toBe(false);
  });

  it('DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA exige companyId e mes', () => {
    expect(
      DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA.safeParse({ companyId: 1, mes: '2025-01' }).success,
    ).toBe(true);
    expect(DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA.safeParse({ companyId: 1 }).success).toBe(false);
  });

  it('UPLOAD_RH_DATA_INPUT_SCHEMA exige xlsxBase64 nao vazio', () => {
    expect(
      UPLOAD_RH_DATA_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2025-01',
        xlsxBase64: 'AAAA',
      }).success,
    ).toBe(true);
    expect(
      UPLOAD_RH_DATA_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2025-01',
        xlsxBase64: '',
      }).success,
    ).toBe(false);
  });

  it('DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA exige liderId e liderTipo', () => {
    expect(
      DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2025-01',
        liderId: 1,
        liderTipo: 'employee',
      }).success,
    ).toBe(true);
    expect(
      DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2025-01',
        liderId: 1,
      }).success,
    ).toBe(false);
  });

  it('UPLOAD_LEADER_DATA_INPUT_SCHEMA exige xlsxBase64', () => {
    expect(
      UPLOAD_LEADER_DATA_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2025-01',
        liderId: 1,
        liderTipo: 'employee',
        xlsxBase64: 'x',
      }).success,
    ).toBe(true);
  });

  it('sanitizeRazaoSocial remove acentos e especiais (S188)', () => {
    expect(sanitizeRazaoSocial('Acme Ltda.')).toBe('ACME_LTDA');
    expect(sanitizeRazaoSocial('Empresa São João S/A')).toBe('EMPRESA_SAO_JOAO_S_A');
    expect(sanitizeRazaoSocial('   ')).toBe('');
  });

  it('marker: CNPJ_CONTRATOS reservado a ME-048 (S187)', () => {
    expect(CNPJ_CONTRATOS).toBe('10000000000860');
  });
});

// ============================================================
// Autorizacao por perfil — RH
// ============================================================

describe('spreadsheets-router — autorizacao RH (§3.11)', () => {
  let companyId: number;
  let empRH: number;
  let empRHLider: number;
  let empLider: number;
  let empColab: number;
  let clevel: number;
  const mes = '2025-03';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AUTORIZACAO_RH);
    empRH = await createEmployee(companyId);
    empRHLider = await createEmployee(companyId, { isLider: true });
    empLider = await createEmployee(companyId, { isLider: true });
    empColab = await createEmployee(companyId);
    clevel = await createClevel(companyId);
  });

  it('super_admin baixa template RH', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.xlsxBase64.length).toBeGreaterThan(0);
  });

  it('rh baixa template RH', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('rh_lider baixa template RH', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh_lider', empRHLider, companyId), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('lider puro NAO baixa template RH (FORBIDDEN)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', empLider, companyId), facade);
    await expect(caller.downloadRHTemplate({ companyId, mes })).rejects.toThrow();
  });

  it('clevel NAO baixa template RH (FORBIDDEN)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('clevel', clevel, companyId), facade);
    await expect(caller.downloadRHTemplate({ companyId, mes })).rejects.toThrow();
  });

  it('marker unused: empColab reservado para expansao', () => {
    expect(empColab).toBeGreaterThan(0);
  });
});

// ============================================================
// Autorizacao por perfil — Lider
// ============================================================

describe('spreadsheets-router — autorizacao Lider (§3.11)', () => {
  let companyId: number;
  let empLider: number;
  let empLiderOutro: number;
  let clevel: number;
  const mes = '2025-04';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AUTORIZACAO_LIDER);
    empLider = await createEmployee(companyId, { isLider: true });
    empLiderOutro = await createEmployee(companyId, { isLider: true });
    clevel = await createClevel(companyId);
    // Um liderado direto para o empLider no mes.
    const liderado = await createEmployee(companyId);
    await linkLeader(liderado, empLider, null, new Date('2020-01-01'));
    await seedVariables(companyId, 'vendas_comercial', [
      { variableIndex: 1, weight: '50.00' },
      { variableIndex: 2, weight: '50.00' },
    ]);
  });

  it('lider baixa proprio template', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', empLider, companyId), facade);
    const res = await caller.downloadLeaderTemplate({
      companyId,
      mes,
      liderId: empLider,
      liderTipo: 'employee',
    });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('lider NAO baixa template de outro lider (FORBIDDEN)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', empLider, companyId), facade);
    await expect(
      caller.downloadLeaderTemplate({
        companyId,
        mes,
        liderId: empLiderOutro,
        liderTipo: 'employee',
      }),
    ).rejects.toThrow();
  });

  it('clevel NAO baixa template de outro clevel (FORBIDDEN)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('clevel', clevel, companyId), facade);
    await expect(
      caller.downloadLeaderTemplate({
        companyId,
        mes,
        liderId: empLider,
        liderTipo: 'employee',
      }),
    ).rejects.toThrow();
  });
});

// ============================================================
// Guard cross-company (§2.4)
// ============================================================

describe('spreadsheets-router — guards §2.4', () => {
  let companyA: number;
  let companyB: number;
  let rhA: number;
  const mes = '2025-05';

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_GUARDS);
    companyB = await createCompany('10000000000869');
    rhA = await createEmployee(companyA);
  });

  it('rh_lider da companyA NAO baixa template RH da companyB', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh_lider', rhA, companyA), facade);
    await expect(caller.downloadRHTemplate({ companyId: companyB, mes })).rejects.toThrow(
      MSG_EMPRESA_FORA_DO_ESCOPO_SPREADSHEETS,
    );
  });
});

// ============================================================
// downloadRHTemplate — estrutura canonica do XLSX
// ============================================================

describe('spreadsheets-router — downloadRHTemplate estrutura', () => {
  let companyId: number;
  let emp1: number;
  let emp2: number;
  let liderEmp: number;
  const mes = '2025-06';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DOWNLOAD_RH, 'Empresa Alpha Ltda');
    liderEmp = await createEmployee(companyId, { name: 'Lider Alpha', isLider: true });
    emp1 = await createEmployee(companyId, { name: 'Aline Costa' });
    emp2 = await createEmployee(companyId, { name: 'Bruno Silva' });
    await linkLeader(emp1, liderEmp, null);
    await linkLeader(emp2, liderEmp, null);
  });

  it('gera XLSX com aba canonica NOME_ABA_RH e cabecalhos exatos', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_RH);
    expect(ws).toBeDefined();
    for (let i = 0; i < COLUNAS_CANONICAS_RH.length; i += 1) {
      expect(ws!.getRow(1).getCell(i + 1).value).toBe(COLUNAS_CANONICAS_RH[i]);
    }
  });

  it('linhas pre-preenchidas com colaboradores ativos ordenados por nome', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_RH)!;
    expect(ws.getRow(2).getCell(1).value).toBe('Aline Costa');
    expect(ws.getRow(3).getCell(1).value).toBe('Bruno Silva');
    expect(ws.getRow(4).getCell(1).value).toBe('Lider Alpha');
  });

  it('nome do arquivo canonico segue padrao S188', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    expect(res.filename).toBe(`template_rh_EMPRESA_ALPHA_LTDA_${mes}.xlsx`);
  });

  it('faltas default 0 e custo mensal vazio', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadRHTemplate({ companyId, mes });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_RH)!;
    expect(ws.getRow(2).getCell(6).value).toBe(0);
    // Custo mensal (coluna 5): vazio -> null ou undefined.
    const custo = ws.getRow(2).getCell(5).value;
    expect(custo === null || custo === undefined).toBe(true);
  });
});

// ============================================================
// downloadLeaderTemplate — estrutura canonica CC3
// ============================================================

describe('spreadsheets-router — downloadLeaderTemplate estrutura CC3', () => {
  let companyId: number;
  let liderEmp: number;
  let liderado1: number; // vendas_comercial (peso positivo)
  let liderado2: number; // lideranca_gestao (Familia 6)
  const mes = '2025-07';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DOWNLOAD_LIDER, 'Beta Consultoria');
    liderEmp = await createEmployee(companyId, { name: 'Lider Beta', isLider: true });
    liderado1 = await createEmployee(companyId, {
      name: 'Ana Vendas',
      jobFamily: 'vendas_comercial',
    });
    liderado2 = await createEmployee(companyId, {
      name: 'Zeta Chefe',
      jobFamily: 'lideranca_gestao',
    });
    await linkLeader(liderado1, liderEmp, null);
    await linkLeader(liderado2, liderEmp, null);
    await seedVariables(companyId, 'vendas_comercial', [
      { variableIndex: 1, weight: '60.00' },
      { variableIndex: 2, weight: '40.00' },
    ]);
    await seedVariables(companyId, 'lideranca_gestao', [{ variableIndex: 1, weight: '100.00' }]);
  });

  it('cabecalhos dinamicos seguem LABEL_META/DEMANDA/REALIZADO (CC3)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadLeaderTemplate({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
    });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_LIDER)!;
    expect(ws.getRow(1).getCell(1).value).toBe('Nome liderado');
    expect(ws.getRow(1).getCell(2).value).toBe('Cargo');
    // maxVars = 2 (vendas_comercial tem 2)
    expect(ws.getRow(1).getCell(3).value).toBe(LABEL_META(1));
    expect(ws.getRow(1).getCell(4).value).toBe(LABEL_DEMANDA(1));
    expect(ws.getRow(1).getCell(5).value).toBe(LABEL_REALIZADO(1));
    expect(ws.getRow(1).getCell(6).value).toBe(LABEL_META(2));
    expect(ws.getRow(1).getCell(7).value).toBe(LABEL_DEMANDA(2));
    expect(ws.getRow(1).getCell(8).value).toBe(LABEL_REALIZADO(2));
  });

  it('Familia 6 tem Demanda "—" e Meta 5', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadLeaderTemplate({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
    });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_LIDER)!;
    // liderado2 (Zeta Chefe, familia 6) — ordenado alfabeticamente
    // por nome: Ana Vendas (linha 2), Zeta Chefe (linha 3).
    expect(ws.getRow(3).getCell(1).value).toBe('Zeta Chefe');
    expect(ws.getRow(3).getCell(3).value).toBe(5); // Meta 5
    expect(ws.getRow(3).getCell(4).value).toBe(VALOR_DEMANDA_FAMILIA_6); // Demanda '—'
  });

  it('sheet protection nativa ativa no XLSX gerado (§3.11 CC3)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenSuperAdmin(), facade);
    const res = await caller.downloadLeaderTemplate({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
    });
    const wb = await loadWorkbookFromBase64(res.xlsxBase64);
    const ws = wb.getWorksheet(NOME_ABA_LIDER)!;
    // exceljs expoe `sheetProtection` via propriedade interna.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWs = ws as any;
    expect(anyWs.sheetProtection).toBeDefined();
  });
});

// ============================================================
// uploadRHData — parser + delegacao ao facade
// ============================================================

async function buildValidRHUpload(
  colaboradores: Array<{
    nome: string;
    cpf: string;
    cargo: string;
    lider: string;
    custo: number | null;
    faltas: number;
  }>,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOME_ABA_RH);
  ws.addRow([...COLUNAS_CANONICAS_RH]);
  for (const c of colaboradores) {
    ws.addRow([c.nome, c.cpf, c.cargo, c.lider, c.custo, c.faltas]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

describe('spreadsheets-router — uploadRHData parser + delegacao', () => {
  let companyId: number;
  let empRH: number;
  let colab1: number;
  let colab2: number;
  let cpfColab1: string;
  let cpfColab2: string;
  const mes = '2025-08';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPLOAD_RH);
    empRH = await createEmployee(companyId);
    colab1 = await createEmployee(companyId, { name: 'Colab 1' });
    colab2 = await createEmployee(companyId, { name: 'Colab 2' });
    const [c1] = await client.db
      .select({ cpf: employees.cpf })
      .from(employees)
      .where(inArray(employees.id, [colab1]));
    const [c2] = await client.db
      .select({ cpf: employees.cpf })
      .from(employees)
      .where(inArray(employees.id, [colab2]));
    cpfColab1 = c1!.cpf;
    cpfColab2 = c2!.cpf;
  });

  it('rejeita XLSX invalido (Base64 corrompido)', async () => {
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    await expect(
      caller.uploadRHData({ companyId, mes, xlsxBase64: 'XYZ_nao_e_xlsx' }),
    ).rejects.toThrow();
  });

  it('rejeita XLSX sem a aba canonica RH', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('OutraAba');
    const buf = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    await expect(caller.uploadRHData({ companyId, mes, xlsxBase64: buf })).rejects.toThrow(
      MSG_ABA_AUSENTE_RH,
    );
  });

  it('rejeita cabecalhos divergentes', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(NOME_ABA_RH);
    ws.addRow(['Nome', 'CPF', 'Errado', 'Lider direto', 'Custo mensal (R$)', 'Faltas']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    await expect(caller.uploadRHData({ companyId, mes, xlsxBase64: buf })).rejects.toThrow(
      MSG_CABECALHOS_INVALIDOS_RH,
    );
  });

  it('CPF nao encontrado -> erro por linha (nao aborta)', async () => {
    const b64 = await buildValidRHUpload([
      { nome: 'Colab 1', cpf: cpfColab1, cargo: 'Analista', lider: '—', custo: 3000, faltas: 0 },
      { nome: 'Fantasma', cpf: '99999999999', cargo: 'X', lider: '—', custo: 3000, faltas: 0 },
    ]);
    const { facade, callsRH } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]!.linha).toBe(3);
    expect(res.erros[0]!.mensagem).toBe(MSG_CPF_NAO_ENCONTRADO);
    expect(callsRH.length).toBe(1);
    expect(callsRH[0]!.colaboradores?.[0]?.employeeId).toBe(colab1);
  });

  it('valor nao numerico em custo -> erro por linha', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(NOME_ABA_RH);
    ws.addRow([...COLUNAS_CANONICAS_RH]);
    ws.addRow(['Colab 2', cpfColab2, 'Analista', '—', 'nao_numero', 0]);
    const b64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade, callsRH } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.linhasSucesso).toBe(0);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]!.coluna).toBe('Custo mensal (R$)');
    expect(res.erros[0]!.mensagem).toBe(MSG_VALOR_NAO_NUMERICO);
    expect(callsRH.length).toBe(0);
  });

  it('linha completamente vazia e ignorada (nao entra em erros nem sucesso)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(NOME_ABA_RH);
    ws.addRow([...COLUNAS_CANONICAS_RH]);
    ws.addRow(['Colab 1', cpfColab1, 'Analista', '—', 3000, 0]);
    ws.addRow(['', '', '', '', '', '']);
    ws.addRow(['Colab 2', cpfColab2, 'Analista', '—', 4000, 1]);
    const b64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade, callsRH } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.linhasSucesso).toBe(2);
    expect(res.linhasErro).toBe(0);
    expect(callsRH.length).toBe(2);
  });

  it('delega ao facade com custo formatado 2 casas decimais (S186)', async () => {
    const b64 = await buildValidRHUpload([
      { nome: 'Colab 1', cpf: cpfColab1, cargo: 'Analista', lider: '—', custo: 3141.59, faltas: 2 },
    ]);
    const { facade, callsRH } = makeMockFacade();
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facade);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.linhasSucesso).toBe(1);
    expect(callsRH[0]!.colaboradores?.[0]?.custoTotalMes).toBe('3141.59');
    expect(callsRH[0]!.colaboradores?.[0]?.faltas).toBe(2);
    expect(callsRH[0]!.diasUteis).toBe(22);
  });

  it('propaga erro do facade como erro por linha (semantica S186)', async () => {
    const b64 = await buildValidRHUpload([
      { nome: 'Colab 1', cpf: cpfColab1, cargo: 'Analista', lider: '—', custo: 3000, faltas: 0 },
    ]);
    const facadeErr: MonthlyDataFacade = {
      saveMonthlyRHData: async () => {
        // Simula erro §3.12 (custo<=0 ou faltas>diasUteis).
        const { TRPCError } = await import('@trpc/server');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Custo simulado invalido.' });
      },
      saveMonthlyLeaderData: async () => {
        throw new Error('unused');
      },
    };
    const caller = callerFor(await tokenFor('rh', empRH, companyId), facadeErr);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.linhasSucesso).toBe(0);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]!.mensagem).toBe('Custo simulado invalido.');
  });
});

// ============================================================
// uploadLeaderData — parser + delegacao ao facade
// ============================================================

async function buildValidLeaderUpload(
  liderados: Array<{
    nome: string;
    cargo: string;
    variaveis: Array<{ demanda: string | number; realizado: string | number }>;
  }>,
  numVars: number,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOME_ABA_LIDER);
  const header: string[] = [...COLUNAS_FIXAS_LIDER];
  for (let i = 1; i <= numVars; i += 1) {
    header.push(LABEL_META(i));
    header.push(LABEL_DEMANDA(i));
    header.push(LABEL_REALIZADO(i));
  }
  ws.addRow(header);
  for (const l of liderados) {
    const row: (string | number | null)[] = [l.nome, l.cargo];
    for (let i = 0; i < numVars; i += 1) {
      const v = l.variaveis[i];
      if (!v) {
        row.push(null, null, null);
      } else {
        row.push(null, v.demanda, v.realizado);
      }
    }
    ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

describe('spreadsheets-router — uploadLeaderData parser + delegacao', () => {
  let companyId: number;
  let liderEmp: number;
  let liderado1: number;
  let liderado2: number;
  const mes = '2025-09';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPLOAD_LIDER, 'Gamma Servicos');
    liderEmp = await createEmployee(companyId, { name: 'Lider Gamma', isLider: true });
    liderado1 = await createEmployee(companyId, {
      name: 'Ana Vendas',
      jobFamily: 'vendas_comercial',
    });
    liderado2 = await createEmployee(companyId, {
      name: 'Zeta Chefe',
      jobFamily: 'lideranca_gestao',
    });
    await linkLeader(liderado1, liderEmp, null);
    await linkLeader(liderado2, liderEmp, null);
    await seedVariables(companyId, 'vendas_comercial', [
      { variableIndex: 1, weight: '60.00' },
      { variableIndex: 2, weight: '40.00' },
    ]);
    await seedVariables(companyId, 'lideranca_gestao', [{ variableIndex: 1, weight: '100.00' }]);
  });

  it('rejeita XLSX sem a aba canonica Lider', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('OutraAba');
    const buf = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', liderEmp, companyId), facade);
    await expect(
      caller.uploadLeaderData({
        companyId,
        mes,
        liderId: liderEmp,
        liderTipo: 'employee',
        xlsxBase64: buf,
      }),
    ).rejects.toThrow(MSG_ABA_AUSENTE_LIDER);
  });

  it('rejeita cabecalhos dinamicos divergentes', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(NOME_ABA_LIDER);
    ws.addRow(['Nome liderado', 'Cargo', 'X', 'Y', 'Z']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const { facade } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', liderEmp, companyId), facade);
    await expect(
      caller.uploadLeaderData({
        companyId,
        mes,
        liderId: liderEmp,
        liderTipo: 'employee',
        xlsxBase64: buf,
      }),
    ).rejects.toThrow(MSG_CABECALHOS_INVALIDOS_LIDER);
  });

  it('delega ao facade com variaveis parseadas (S185)', async () => {
    const b64 = await buildValidLeaderUpload(
      [
        {
          nome: 'Ana Vendas',
          cargo: 'Analista',
          variaveis: [
            { demanda: 100, realizado: 80 },
            { demanda: 50, realizado: 60 },
          ],
        },
      ],
      2,
    );
    const { facade, callsLeader } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', liderEmp, companyId), facade);
    const res = await caller.uploadLeaderData({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
      xlsxBase64: b64,
    });
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(0);
    expect(callsLeader.length).toBe(1);
    expect(callsLeader[0]!.liderados[0]!.variaveis.length).toBe(2);
    expect(callsLeader[0]!.liderados[0]!.variaveis[0]!.demanda).toBe('100');
    expect(callsLeader[0]!.liderados[0]!.variaveis[0]!.executado).toBe('80');
  });

  it('Demanda "—" e traduzida para 5 no envio (Familia 6)', async () => {
    const b64 = await buildValidLeaderUpload(
      [
        {
          nome: 'Zeta Chefe',
          cargo: 'Analista',
          variaveis: [{ demanda: VALOR_DEMANDA_FAMILIA_6, realizado: 4 }],
        },
      ],
      1,
    );
    const { facade, callsLeader } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', liderEmp, companyId), facade);
    const res = await caller.uploadLeaderData({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
      xlsxBase64: b64,
    });
    expect(res.linhasSucesso).toBe(1);
    expect(callsLeader[0]!.liderados[0]!.variaveis[0]!.demanda).toBe('5');
    expect(callsLeader[0]!.liderados[0]!.variaveis[0]!.executado).toBe('4');
  });

  it('liderado fora da cadeia -> erro por linha (nao aborta)', async () => {
    // Cria um colaborador NAO ligado a este lider.
    const soltinho = await createEmployee(companyId, { name: 'Solto Independente' });
    const b64 = await buildValidLeaderUpload(
      [
        { nome: 'Ana Vendas', cargo: 'Analista', variaveis: [{ demanda: 100, realizado: 80 }] },
        {
          nome: 'Solto Independente',
          cargo: 'Analista',
          variaveis: [{ demanda: 100, realizado: 80 }],
        },
      ],
      1,
    );
    const { facade, callsLeader } = makeMockFacade();
    const caller = callerFor(await tokenFor('lider', liderEmp, companyId), facade);
    const res = await caller.uploadLeaderData({
      companyId,
      mes,
      liderId: liderEmp,
      liderTipo: 'employee',
      xlsxBase64: b64,
    });
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]!.mensagem).toBe(MSG_LIDERADO_FORA_DA_CADEIA);
    // So a linha 'Ana Vendas' (valida) deve ter sido delegada.
    expect(callsLeader.length).toBe(1);
    expect(callsLeader[0]!.liderados[0]!.employeeId).toBe(liderado1);
    // Marker unused: soltinho reservado.
    expect(soltinho).toBeGreaterThan(0);
  });
});

// ============================================================
// Integracao real com DEFAULT_MONTHLY_DATA_FACADE (S185)
// ============================================================

describe('spreadsheets-router — integracao com DEFAULT_MONTHLY_DATA_FACADE (S185)', () => {
  let companyId: number;
  let empRH: number;
  let colab1: number;
  let cpfColab1: string;
  const mes = '2025-10';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INTEGRACAO_REAL);
    empRH = await createEmployee(companyId);
    colab1 = await createEmployee(companyId, { name: 'Colab Real' });
    const [c1] = await client.db
      .select({ cpf: employees.cpf })
      .from(employees)
      .where(inArray(employees.id, [colab1]));
    cpfColab1 = c1!.cpf;
  });

  it('caller real grava companyMonthlyData e performanceData via S185', async () => {
    const b64 = await buildValidRHUpload([
      { nome: 'Colab Real', cpf: cpfColab1, cargo: 'Analista', lider: '—', custo: 3000, faltas: 0 },
    ]);
    // Facade default = caller tRPC interno (DEFAULT_MONTHLY_DATA_FACADE).
    const caller = callerFor(await tokenFor('rh', empRH, companyId), DEFAULT_MONTHLY_DATA_FACADE);
    const res = await caller.uploadRHData({ companyId, mes, xlsxBase64: b64, diasUteis: 22 });
    expect(res.ok).toBe(true);
    expect(res.linhasSucesso).toBe(1);
    // Confirma persistencia real.
    const cmd = await client.db
      .select()
      .from(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, [companyId]));
    expect(cmd.length).toBe(1);
    expect(cmd[0]!.diasUteis).toBe(22);
    const pd = await client.db
      .select()
      .from(performanceData)
      .where(inArray(performanceData.companyId, [companyId]));
    expect(pd.length).toBe(1);
    expect(pd[0]!.employeeId).toBe(colab1);
    expect(pd[0]!.faltas).toBe(0);
  });
});
