// ROIP APP 9BOX — teste de integracao do sub-router `monthlyData` (ME-036).
//
// Exercita as 5 procedures publicas canonicas do sub-dominio (DOC 03
// §3.11 + §3.12 + §4.1..§4.2 + §4.6) contra MySQL real via
// `createCallerFactory`. Cobre:
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `getMonthlyInputForm` aba='rh' e aba='lider' — estrutura,
//     statusPreenchimento, autorizacao por perfil.
//   - `saveMonthlyRHData` — success, 7 mensagens canonicas literais do
//     §3.12 (S073), transacao atomica S070, mes fechado bloqueia
//     nao-Bruno.
//   - `saveMonthlyLeaderData` — success lider proprio; S080 cadeia
//     direta no mes (inclusive mes passado com lider substituido);
//     Familia 6 forca demanda=5; peso=0 rejeita; nota Familia 6
//     invalida; mes fechado bloqueia; C-level proprio.
//   - `getLeadersStatus` — ordenacao name/departamento/status,
//     asc/desc.
//   - `getPendentLeaders` — hard-fail S077 antes do dia 5; escopo
//     empresa/minha_cadeia; so retorna "Nao preenchido".
//   - Contratos publicos exportados (RV-13):
//     MSG_* literais, schemas Zod, tipos, factory.
//
// Padrao S009 estendido (S076): uma company local por describe, CNPJ
// unico da faixa 10000000000700..7XX. L32 cleanup em afterAll (todas
// as tabelas com FK compartilhada + fixture global superAdmins id=1
// preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  companyMonthlyData,
  employeeLeaderHistory,
  employees,
  monthlyClosureStatus,
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
  ABA_INPUT_SCHEMA_MONTHLY,
  createMonthlyDataRouter,
  ESCOPO_PENDENT_LEADERS_VALUES,
  FAMILIA_6_JOB_FAMILY,
  type LeaderStatusRow,
  LIDER_TIPO_INPUT_SCHEMA_MONTHLY,
  MES_INPUT_SCHEMA_MONTHLY,
  MSG_CUSTO_MAIOR_ZERO,
  MSG_DIAS_UTEIS_RANGE,
  MSG_FALTA_DIAS_UTEIS,
  MSG_FALTAS_MAIOR_DIAS_UTEIS,
  MSG_FAMILIA_6_NOTA_INVALIDA,
  MSG_MES_FECHADO,
  MSG_VARIAVEL_PESO_ZERO,
  type MonthlyInputFormResult,
  type PendentLeaderRow,
  type SaveMonthlyDataResult,
  SORT_BY_LEADERS_STATUS_VALUES,
  SORT_DIR_VALUES,
  STATUS_MES_VALUES,
  STATUS_PREENCHIMENTO_VALUES,
} from '../../src/server/routers/monthlyData';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me036-monthlyData';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me036-monthly';

// ============================================================
// Geradores unicos (padrao S009 estendido — faixa 10000000000700..7XX)
// ============================================================

let cpfCounter = 25000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me036${seq}`;
}

// CNPJs canonicos por describe (S076).
const CNPJ_CONTRATOS = '10000000000700';
const CNPJ_GUARDS = '10000000000701';
const CNPJ_INPUT_RH = '10000000000702';
const CNPJ_INPUT_LIDER = '10000000000703';
const CNPJ_SAVE_RH = '10000000000704';
const CNPJ_SAVE_RH_FECHADO = '10000000000705';
const CNPJ_SAVE_LIDER = '10000000000706';
const CNPJ_SAVE_LIDER_S080 = '10000000000707';
const CNPJ_LEADERS_STATUS = '10000000000708';
const CNPJ_PENDENT_LEADERS = '10000000000709';

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
    await client.db
      .delete(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
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

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME036 Test ${cnpj} LTDA`,
      nomeFantasia: `ME036 Test ${cnpj}`,
      cnpj,
      telefone: '1633330036',
      endereco: `Rua ME-036, ${cnpj}`,
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

interface CreateEmployeeOpts {
  isLider?: boolean;
  status?: 'ativo' | 'inativo';
  jobFamily?:
    | 'vendas_comercial'
    | 'producao_operacoes'
    | 'tecnico_especialista'
    | 'administrativo_suporte'
    | 'atendimento_relacionamento'
    | 'lideranca_gestao';
  name?: string;
  departamento?:
    | 'Comercial'
    | 'Marketing'
    | 'Operações'
    | 'Produção'
    | 'Logística'
    | 'Compras'
    | 'Financeiro'
    | 'Contabilidade'
    | 'Recursos Humanos'
    | 'Tecnologia da Informação'
    | 'Jurídico'
    | 'Qualidade'
    | 'Manutenção'
    | 'Projetos'
    | 'Atendimento ao Cliente'
    | 'Pós-venda'
    | 'Administrativo'
    | 'Diretoria'
    | 'Outros';
  descricaoCBO?: string;
  isRH?: boolean;
}

async function createEmployee(companyId: number, opts: CreateEmployeeOpts = {}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Colab ME036',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: opts.descricaoCBO ?? 'Analista',
      jobFamily: opts.jobFamily ?? 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createCLevel(
  companyId: number,
  opts: { acessoTotal?: boolean; name?: string; cargo?: string } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'C-Level ME036',
      cpf: nextCpf(),
      email: `clevel-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: opts.cargo ?? 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '20000.00',
      acessoTotal: opts.acessoTotal ?? true,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function linkLeader(
  employeeId: number,
  liderId: number | null,
  clevelId: number | null,
  dataInicio: Date,
  dataFim: Date | null = null,
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId,
    dataInicio,
    dataFim,
    reason: 'Fixture ME036',
    transferBatchId: nextTransferBatchId(),
  });
}

async function seedJobFamilyVariables(
  companyId: number,
  jobFamily:
    | 'vendas_comercial'
    | 'producao_operacoes'
    | 'tecnico_especialista'
    | 'administrativo_suporte'
    | 'atendimento_relacionamento'
    | 'lideranca_gestao',
  weights: string[],
): Promise<void> {
  for (let i = 0; i < weights.length; i += 1) {
    await client.db.insert(companyJobFamilies).values({
      companyId,
      jobFamily,
      variableIndex: i,
      variableName: `Var ${i}`,
      unit: 'unid',
      weight: weights[i]!,
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
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
  const testRouter = createMonthlyDataRouter();
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
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('monthlyData — contratos publicos exportados', () => {
  it('mensagens literais canonicas do §3.12 batem o texto exato', () => {
    expect(MSG_DIAS_UTEIS_RANGE).toBe('Os dias úteis devem estar entre 1 e 31.');
    expect(MSG_CUSTO_MAIOR_ZERO).toBe('O custo mensal deve ser maior que zero.');
    expect(MSG_FALTAS_MAIOR_DIAS_UTEIS).toBe(
      'O número de faltas não pode ser maior que os dias úteis do mês.',
    );
    expect(MSG_FAMILIA_6_NOTA_INVALIDA).toBe('A nota deve ser um número inteiro de 1 a 5.');
    expect(MSG_VARIAVEL_PESO_ZERO).toBe('Esta variável tem peso zero e não recebe lançamento.');
    expect(MSG_FALTA_DIAS_UTEIS).toBe(
      'Preencha os dias úteis do mês antes de lançar os dados dos colaboradores.',
    );
    expect(MSG_MES_FECHADO).toBe('Este mês está fechado. Solicite a Bruno o desbloqueio.');
  });

  it('schemas Zod aceitam formatos canonicos e rejeitam malformados', () => {
    expect(MES_INPUT_SCHEMA_MONTHLY.safeParse('2024-01').success).toBe(true);
    expect(MES_INPUT_SCHEMA_MONTHLY.safeParse('2024-12').success).toBe(true);
    expect(MES_INPUT_SCHEMA_MONTHLY.safeParse('2024-13').success).toBe(false);
    expect(MES_INPUT_SCHEMA_MONTHLY.safeParse('24-01').success).toBe(false);
    expect(MES_INPUT_SCHEMA_MONTHLY.safeParse('2024/01').success).toBe(false);

    expect(ABA_INPUT_SCHEMA_MONTHLY.safeParse('rh').success).toBe(true);
    expect(ABA_INPUT_SCHEMA_MONTHLY.safeParse('lider').success).toBe(true);
    expect(ABA_INPUT_SCHEMA_MONTHLY.safeParse('outra').success).toBe(false);

    expect(LIDER_TIPO_INPUT_SCHEMA_MONTHLY.safeParse('employee').success).toBe(true);
    expect(LIDER_TIPO_INPUT_SCHEMA_MONTHLY.safeParse('clevel').success).toBe(true);
    expect(LIDER_TIPO_INPUT_SCHEMA_MONTHLY.safeParse('lider').success).toBe(false);
  });

  it('enums e constantes publicas expostas', () => {
    expect(STATUS_MES_VALUES).toEqual(['aberto', 'fechado', 'desbloqueado']);
    expect(STATUS_PREENCHIMENTO_VALUES).toEqual(['Não preenchido', 'Parcial', 'Preenchido']);
    expect(ESCOPO_PENDENT_LEADERS_VALUES).toEqual(['empresa', 'minha_cadeia']);
    expect(SORT_BY_LEADERS_STATUS_VALUES).toEqual(['name', 'departamento', 'statusPreenchimento']);
    expect(SORT_DIR_VALUES).toEqual(['asc', 'desc']);
    expect(FAMILIA_6_JOB_FAMILY).toBe('lideranca_gestao');
  });

  it('createMonthlyDataRouter e uma factory sem argumentos', async () => {
    const r = createMonthlyDataRouter();
    expect(typeof r).toBe('object');
    // Company auxiliar para saber que o caller vive.
    const companyId = await createCompany(CNPJ_CONTRATOS);
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-01',
      aba: 'rh',
    });
    expect(result.abaAtiva).toBe('rh');
  });
});

// ============================================================
// 1) Guards de autorizacao (§2.4 + roleProcedure)
// ============================================================

describe('monthlyData — guards de autorizacao', () => {
  let companyIdA: number;
  let companyIdB: number;
  let empRHA: number;
  let empLiderA: number;
  let liderado: number;

  beforeAll(async () => {
    companyIdA = await createCompany(CNPJ_GUARDS);
    companyIdB = await createCompany('10000000000711');
    empRHA = await createEmployee(companyIdA, { name: 'RH A', isRH: true });
    empLiderA = await createEmployee(companyIdA, { name: 'Lider A', isLider: true });
    liderado = await createEmployee(companyIdA, { name: 'Liderado A' });
    await linkLeader(liderado, empLiderA, null, new Date('2024-01-01'));
    // Fixture minima de familias para nao quebrar getInputForm.
    await seedJobFamilyVariables(companyIdA, 'vendas_comercial', ['0.25', '0.25', '0.25', '0.25']);
  });

  it('getMonthlyInputForm sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getMonthlyInputForm({ companyId: companyIdA, mes: '2024-01', aba: 'rh' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('saveMonthlyRHData sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.saveMonthlyRHData({ companyId: companyIdA, mes: '2024-01', diasUteis: 20 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('saveMonthlyLeaderData sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId: companyIdA,
        mes: '2024-01',
        liderId: empLiderA,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: liderado,
            variaveis: [{ variableIndex: 0, demanda: '10', executado: '5' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getLeadersStatus sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getLeadersStatus({ companyId: companyIdA, mes: '2024-01' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getPendentLeaders sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getPendentLeaders({ companyId: companyIdA, mes: '2024-01', escopo: 'empresa' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('cross-company RH de A tentando ler B -> FORBIDDEN (§2.4)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRHA, companyIdA);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getMonthlyInputForm({ companyId: companyIdB, mes: '2024-01', aba: 'rh' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin atravessa qualquer companyId', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.getMonthlyInputForm({
      companyId: companyIdB,
      mes: '2024-01',
      aba: 'rh',
    });
    expect(result.abaAtiva).toBe('rh');
  });

  it('lider tentando aba="rh" -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLiderA, companyIdA);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getMonthlyInputForm({ companyId: companyIdA, mes: '2024-01', aba: 'rh' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lider tentando aba="lider" com liderId de outro -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLiderA, companyIdA);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyIdA,
        mes: '2024-01',
        aba: 'lider',
        liderId: 999999,
        liderTipo: 'employee',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('clevel tentando aba="lider" com liderTipo="employee" -> FORBIDDEN', async () => {
    const clevelId = await createCLevel(companyIdA, { acessoTotal: true });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyIdA);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getMonthlyInputForm({
        companyId: companyIdA,
        mes: '2024-01',
        aba: 'lider',
        liderId: clevelId,
        liderTipo: 'employee',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 2) getMonthlyInputForm — aba='rh' (§3.11)
// ============================================================

describe('monthlyData.getMonthlyInputForm — aba="rh"', () => {
  let companyId: number;
  let empRH: number;
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INPUT_RH);
    empRH = await createEmployee(companyId, { name: 'RH', isRH: true });
    empA = await createEmployee(companyId, { name: 'Aline', departamento: 'Comercial' });
    empB = await createEmployee(companyId, { name: 'Bruno', departamento: 'Operações' });
    // Empresa NAO tem diasUteis nem dados de colaborador ainda -> 'Não preenchido'.
  });

  it('RH da empresa: retorna estrutura canonica com status "Não preenchido"', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    expect(result.abaAtiva).toBe('rh');
    expect(result.companyId).toBe(companyId);
    expect(result.mes).toBe('2024-06');
    expect(result.status).toBe('aberto');
    expect(result.diasUteis).toBeNull();
    expect(result.colaboradores.length).toBe(3);
    expect(result.statusPreenchimento).toBe('Não preenchido');
  });

  it('colaboradores ordenados por name ascending', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    const names = result.colaboradores.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('colaboradores inativos NAO aparecem', async () => {
    const empInativo = await createEmployee(companyId, {
      name: 'Zulmira',
      status: 'inativo',
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    expect(result.colaboradores.find((c) => c.employeeId === empInativo)).toBeUndefined();
  });

  it('apos gravar so diasUteis -> statusPreenchimento="Parcial"', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await caller.saveMonthlyRHData({ companyId, mes: '2024-07', diasUteis: 22 });
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-07',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    expect(result.diasUteis).toBe(22);
    expect(result.statusPreenchimento).toBe('Parcial');
  });

  it('apos gravar diasUteis e TODOS os colaboradores -> "Preenchido"', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    // Todos os employees ativos vao entrar; obter lista.
    const preload = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-08',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    const colaboradoresPayload = preload.colaboradores.map((c) => ({
      employeeId: c.employeeId,
      custoTotalMes: '5000.00',
      faltas: 0,
    }));
    await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-08',
      diasUteis: 22,
      colaboradores: colaboradoresPayload,
    });
    const after = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-08',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    expect(after.statusPreenchimento).toBe('Preenchido');
    for (const c of after.colaboradores) {
      expect(c.custoTotalMes).not.toBeNull();
      expect(c.faltas).not.toBeNull();
    }
    void empA;
    void empB;
  });
});

// ============================================================
// 3) getMonthlyInputForm — aba='lider' (§3.11 + S080)
// ============================================================

describe('monthlyData.getMonthlyInputForm — aba="lider"', () => {
  let companyId: number;
  let empLider: number;
  let empLid1: number;
  let empLid2: number;
  let empLid6: number; // familia 6

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INPUT_LIDER);
    empLider = await createEmployee(companyId, { name: 'Lider Y', isLider: true });
    empLid1 = await createEmployee(companyId, {
      name: 'Lid Um',
      jobFamily: 'vendas_comercial',
    });
    empLid2 = await createEmployee(companyId, {
      name: 'Lid Dois',
      jobFamily: 'vendas_comercial',
    });
    empLid6 = await createEmployee(companyId, {
      name: 'Lid Seis',
      jobFamily: 'lideranca_gestao',
    });
    await linkLeader(empLid1, empLider, null, new Date('2024-01-01'));
    await linkLeader(empLid2, empLider, null, new Date('2024-01-01'));
    await linkLeader(empLid6, empLider, null, new Date('2024-01-01'));
    await seedJobFamilyVariables(companyId, 'vendas_comercial', ['0.25', '0.25', '0.25', '0.25']);
    await seedJobFamilyVariables(companyId, 'lideranca_gestao', ['0.30', '0.20', '0.30', '0.20']);
  });

  it('lider proprio: retorna 3 liderados com variaveis por familia', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'lider',
      liderId: empLider,
      liderTipo: 'employee',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'lider' }>;
    expect(result.abaAtiva).toBe('lider');
    expect(result.liderId).toBe(empLider);
    expect(result.liderTipo).toBe('employee');
    expect(result.liderados.length).toBe(3);
    expect(result.statusPreenchimento).toBe('Não preenchido');
    const lid6 = result.liderados.find((l) => l.employeeId === empLid6)!;
    expect(lid6.familia6).toBe(true);
    expect(lid6.variaveis.length).toBe(4);
  });

  it('RH atravessa aba="lider" com qualquer liderId', async () => {
    const rh = await createEmployee(companyId, { name: 'RH Y', isRH: true });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', rh, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'lider',
      liderId: empLider,
      liderTipo: 'employee',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'lider' }>;
    expect(result.liderados.length).toBe(3);
  });

  it('aba="lider" sem liderId -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    await expect(
      caller.getMonthlyInputForm({ companyId, mes: '2024-06', aba: 'lider' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('liderado sem vinculo no mes NAO aparece (S080)', async () => {
    // Cria liderado com dataFim < mes de consulta
    const empExLid = await createEmployee(companyId, { name: 'Ex Lid' });
    await linkLeader(empExLid, empLider, null, new Date('2023-01-01'), new Date('2023-06-30'));
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'lider',
      liderId: empLider,
      liderTipo: 'employee',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'lider' }>;
    expect(result.liderados.find((l) => l.employeeId === empExLid)).toBeUndefined();
  });

  it('C-level proprio com liderTipo="clevel" retorna seus liderados', async () => {
    const clevelId = await createCLevel(companyId, {
      acessoTotal: true,
      name: 'C-Y',
      cargo: 'CFO',
    });
    const empCLid = await createEmployee(companyId, { name: 'Emp C' });
    await linkLeader(empCLid, null, clevelId, new Date('2024-01-01'));
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'lider',
      liderId: clevelId,
      liderTipo: 'clevel',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'lider' }>;
    expect(result.liderTipo).toBe('clevel');
    expect(result.liderados.find((l) => l.employeeId === empCLid)).toBeDefined();
  });
});

// ============================================================
// 4) saveMonthlyRHData (§3.11 + §3.12 + S073 mensagens literais)
// ============================================================

describe('monthlyData.saveMonthlyRHData — success e validacoes canonicas', () => {
  let companyId: number;
  let empRH: number;
  let empA: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_RH);
    empRH = await createEmployee(companyId, { name: 'RH SR', isRH: true });
    empA = await createEmployee(companyId, { name: 'Alfa' });
  });

  it('success: grava diasUteis e colaboradores', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result: SaveMonthlyDataResult = await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-06',
      diasUteis: 22,
      colaboradores: [{ employeeId: empA, custoTotalMes: '5000.00', faltas: 2 }],
    });
    expect(result.ok).toBe(true);
    expect(result.colaboradoresGravados).toBe(1);
  });

  it('idempotencia: segundo save no mesmo mes atualiza (UPSERT)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-06',
      colaboradores: [{ employeeId: empA, custoTotalMes: '6000.00', faltas: 1 }],
    });
    // Verificar via getMonthlyInputForm
    const result = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'rh',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'rh' }>;
    const a = result.colaboradores.find((c) => c.employeeId === empA)!;
    expect(a.custoTotalMes).toBe('6000.00');
    expect(a.faltas).toBe(1);
  });

  it('MSG_DIAS_UTEIS_RANGE: diasUteis=0 rejeita literal', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({ companyId, mes: '2024-06', diasUteis: 0 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_DIAS_UTEIS_RANGE });
  });

  it('MSG_DIAS_UTEIS_RANGE: diasUteis=32 rejeita literal', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({ companyId, mes: '2024-06', diasUteis: 32 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_DIAS_UTEIS_RANGE });
  });

  it('MSG_CUSTO_MAIOR_ZERO: custoTotalMes=0 rejeita literal', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({
        companyId,
        mes: '2024-06',
        colaboradores: [{ employeeId: empA, custoTotalMes: '0', faltas: 0 }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_CUSTO_MAIOR_ZERO });
  });

  it('MSG_FALTAS_MAIOR_DIAS_UTEIS: faltas > diasUteis rejeita literal', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({
        companyId,
        mes: '2024-06',
        diasUteis: 20,
        colaboradores: [{ employeeId: empA, custoTotalMes: '5000.00', faltas: 25 }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_FALTAS_MAIOR_DIAS_UTEIS,
    });
  });

  it('MSG_FALTA_DIAS_UTEIS: colaboradores sem diasUteis (novo mes) rejeita literal', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({
        companyId,
        mes: '2024-09',
        colaboradores: [{ employeeId: empA, custoTotalMes: '5000.00', faltas: 0 }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_FALTA_DIAS_UTEIS });
  });

  it('input vazio (sem diasUteis e sem colaboradores) -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.saveMonthlyRHData({ companyId, mes: '2024-06' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('lider tentando saveMonthlyRHData -> FORBIDDEN (nao esta em roleProcedure)', async () => {
    const empLid = await createEmployee(companyId, { name: 'L Bad', isLider: true });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLid, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({ companyId, mes: '2024-06', diasUteis: 22 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cross-scope: employeeId de outra empresa -> FORBIDDEN', async () => {
    const otherCompany = await createCompany('10000000000714');
    const otherEmp = await createEmployee(otherCompany, { name: 'Outro' });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({
        companyId,
        mes: '2024-06',
        diasUteis: 22,
        colaboradores: [{ employeeId: otherEmp, custoTotalMes: '5000.00', faltas: 0 }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 5) saveMonthlyRHData — mes fechado (S073 MSG_MES_FECHADO)
// ============================================================

describe('monthlyData.saveMonthlyRHData — mes fechado', () => {
  let companyId: number;
  let empRH: number;
  let empA: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_RH_FECHADO);
    empRH = await createEmployee(companyId, { name: 'RH F', isRH: true });
    empA = await createEmployee(companyId, { name: 'A F' });
    // Marca mes como fechado.
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: '2024-05',
      status: 'fechado',
      dataFechamento: new Date('2024-06-11T00:00:00Z'),
    });
  });

  it('RH em mes fechado: FORBIDDEN literal MSG_MES_FECHADO', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyRHData({ companyId, mes: '2024-05', diasUteis: 22 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_MES_FECHADO });
  });

  it('Super Admin em mes fechado: atravessa e grava', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenSuperAdmin();
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-05',
      diasUteis: 22,
      colaboradores: [{ employeeId: empA, custoTotalMes: '5000.00', faltas: 0 }],
    });
    expect(result.ok).toBe(true);
  });

  it('RH em mes "desbloqueado" atravessa (edita)', async () => {
    // Cria mes desbloqueado.
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: '2024-04',
      status: 'desbloqueado',
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-04',
      diasUteis: 20,
    });
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// 6) saveMonthlyLeaderData (§3.11 + §3.12 + S080 + Familia 6)
// ============================================================

describe('monthlyData.saveMonthlyLeaderData — success e validacoes', () => {
  let companyId: number;
  let empLider: number;
  let empLid1: number;
  let empLid6: number; // familia 6

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_LIDER);
    empLider = await createEmployee(companyId, { name: 'Lid X', isLider: true });
    empLid1 = await createEmployee(companyId, {
      name: 'Lid Um',
      jobFamily: 'vendas_comercial',
    });
    empLid6 = await createEmployee(companyId, {
      name: 'Lid Seis',
      jobFamily: 'lideranca_gestao',
    });
    await linkLeader(empLid1, empLider, null, new Date('2024-01-01'));
    await linkLeader(empLid6, empLider, null, new Date('2024-01-01'));
    // Uma variavel com peso 0 para exercitar rejeicao.
    await seedJobFamilyVariables(companyId, 'vendas_comercial', ['0.50', '0.30', '0.20', '0.00']);
    await seedJobFamilyVariables(companyId, 'lideranca_gestao', ['0.30', '0.25', '0.25', '0.20']);
  });

  it('success: lider grava 1 liderado com 3 variaveis', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-06',
      liderId: empLider,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: empLid1,
          variaveis: [
            { variableIndex: 0, demanda: '100', executado: '80' },
            { variableIndex: 1, demanda: '50', executado: '45' },
            { variableIndex: 2, demanda: '30', executado: '30' },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.variaveisGravadas).toBe(3);
  });

  it('MSG_VARIAVEL_PESO_ZERO: tentativa em variableIndex 3 (peso=0) rejeita', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-06',
        liderId: empLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empLid1,
            variaveis: [{ variableIndex: 3, demanda: '10', executado: '5' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_VARIAVEL_PESO_ZERO });
  });

  it('MSG_FAMILIA_6_NOTA_INVALIDA: executado=6 na familia 6 rejeita', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-06',
        liderId: empLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empLid6,
            variaveis: [{ variableIndex: 0, demanda: '5', executado: '6' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_FAMILIA_6_NOTA_INVALIDA });
  });

  it('MSG_FAMILIA_6_NOTA_INVALIDA: executado=0 na familia 6 rejeita', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-06',
        liderId: empLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empLid6,
            variaveis: [{ variableIndex: 0, demanda: '5', executado: '0' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_FAMILIA_6_NOTA_INVALIDA });
  });

  it('Familia 6 forca demanda=5 no backend (ignora valor enviado)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await caller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-06',
      liderId: empLider,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: empLid6,
          variaveis: [{ variableIndex: 0, demanda: '999', executado: '4' }],
        },
      ],
    });
    // Verifica via getMonthlyInputForm
    const form = (await caller.getMonthlyInputForm({
      companyId,
      mes: '2024-06',
      aba: 'lider',
      liderId: empLider,
      liderTipo: 'employee',
    })) as Extract<MonthlyInputFormResult, { abaAtiva: 'lider' }>;
    const lid6Row = form.liderados.find((l) => l.employeeId === empLid6)!;
    const var0 = lid6Row.variaveis.find((v) => v.variableIndex === 0)!;
    expect(var0.demanda).toBe('5.00');
    expect(var0.executado).toBe('4.00');
  });

  it('lider tentando gravar dados de liderId diferente -> FORBIDDEN', async () => {
    const outroLider = await createEmployee(companyId, { name: 'Outro L', isLider: true });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-06',
        liderId: outroLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empLid1,
            variaveis: [{ variableIndex: 0, demanda: '100', executado: '80' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('liderado sem vinculo direto com o lider no mes -> FORBIDDEN', async () => {
    const empNotLed = await createEmployee(companyId, { name: 'Sem Vinc' });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-06',
        liderId: empLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empNotLed,
            variaveis: [{ variableIndex: 0, demanda: '100', executado: '80' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('RH pode salvar para qualquer lider da empresa', async () => {
    const rh = await createEmployee(companyId, { name: 'RH X', isRH: true });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', rh, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-07',
      liderId: empLider,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: empLid1,
          variaveis: [{ variableIndex: 0, demanda: '100', executado: '90' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('C-level proprio grava com liderTipo="clevel"', async () => {
    const clevelId = await createCLevel(companyId, {
      acessoTotal: true,
      name: 'C SR',
      cargo: 'COO',
    });
    const empCLid = await createEmployee(companyId, {
      name: 'Emp C SR',
      jobFamily: 'vendas_comercial',
    });
    await linkLeader(empCLid, null, clevelId, new Date('2024-01-01'));
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-06',
      liderId: clevelId,
      liderTipo: 'clevel',
      liderados: [
        {
          employeeId: empCLid,
          variaveis: [{ variableIndex: 0, demanda: '100', executado: '80' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('mes fechado bloqueia lider (FORBIDDEN literal)', async () => {
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: '2024-03',
      status: 'fechado',
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-03',
        liderId: empLider,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: empLid1,
            variaveis: [{ variableIndex: 0, demanda: '10', executado: '5' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_MES_FECHADO });
  });
});

// ============================================================
// 7) saveMonthlyLeaderData — S080 vinculo-no-mes (mes passado)
// ============================================================

describe('monthlyData.saveMonthlyLeaderData — S080 vinculo em mes passado', () => {
  let companyId: number;
  let liderOriginal: number;
  let liderNovo: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_LIDER_S080);
    liderOriginal = await createEmployee(companyId, {
      name: 'Lider Ori',
      isLider: true,
    });
    liderNovo = await createEmployee(companyId, { name: 'Lider Novo', isLider: true });
    liderado = await createEmployee(companyId, { name: 'Liderado' });
    // Original: 2024-01 a 2024-05.
    await linkLeader(liderado, liderOriginal, null, new Date('2024-01-01'), new Date('2024-05-31'));
    // Novo: a partir de 2024-06.
    await linkLeader(liderado, liderNovo, null, new Date('2024-06-01'));
    await seedJobFamilyVariables(companyId, 'vendas_comercial', ['0.25', '0.25', '0.25', '0.25']);
  });

  it('lider ORIGINAL pode gravar mes 2024-03 (dentro do vinculo antigo)', async () => {
    // Cria mes desbloqueado (senao 'aberto' funcionaria tambem, mas mes
    // passado tipicamente foi fechado — usamos 'desbloqueado' para
    // exercitar cenario canonico).
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: '2024-03',
      status: 'desbloqueado',
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderOriginal, companyId);
    const caller = factory(ctx(bearer));
    const result = await caller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-03',
      liderId: liderOriginal,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: liderado,
          variaveis: [{ variableIndex: 0, demanda: '50', executado: '40' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('lider NOVO tentando gravar mes 2024-03 -> FORBIDDEN (nao era lider no mes)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderNovo, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-03',
        liderId: liderNovo,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: liderado,
            variaveis: [{ variableIndex: 0, demanda: '50', executado: '40' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lider ORIGINAL tentando gravar mes 2024-08 -> FORBIDDEN (nao e mais lider)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderOriginal, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.saveMonthlyLeaderData({
        companyId,
        mes: '2024-08',
        liderId: liderOriginal,
        liderTipo: 'employee',
        liderados: [
          {
            employeeId: liderado,
            variaveis: [{ variableIndex: 0, demanda: '50', executado: '40' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 8) getLeadersStatus (§3.11 — RH/Bruno)
// ============================================================

describe('monthlyData.getLeadersStatus', () => {
  let companyId: number;
  let empRH: number;
  let lider1: number;
  let lider2: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LEADERS_STATUS);
    empRH = await createEmployee(companyId, { name: 'RH LS', isRH: true });
    lider1 = await createEmployee(companyId, {
      name: 'Alfa L',
      isLider: true,
      departamento: 'Comercial',
    });
    lider2 = await createEmployee(companyId, {
      name: 'Zeta L',
      isLider: true,
      departamento: 'Operações',
    });
    const lid1 = await createEmployee(companyId, { name: 'Sub A' });
    const lid2 = await createEmployee(companyId, { name: 'Sub Z' });
    await linkLeader(lid1, lider1, null, new Date('2024-01-01'));
    await linkLeader(lid2, lider2, null, new Date('2024-01-01'));
    await seedJobFamilyVariables(companyId, 'vendas_comercial', ['0.25', '0.25', '0.25', '0.25']);
  });

  it('lista lideres com >=1 liderado no mes; RH da empresa', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
    });
    const ids = rows.map((r) => r.liderId);
    expect(ids).toContain(lider1);
    expect(ids).toContain(lider2);
    for (const r of rows) {
      expect(r.qtdLiderados).toBeGreaterThan(0);
    }
  });

  it('ordena por name asc por default', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
    });
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('sortDir="desc" inverte', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
      sortBy: 'name',
      sortDir: 'desc',
    });
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  it('sortBy="departamento" ordena por departamento', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
      sortBy: 'departamento',
    });
    const deps = rows.map((r) => r.departamento);
    expect(deps).toEqual([...deps].sort((a, b) => a.localeCompare(b)));
  });

  it('lider tentando getLeadersStatus -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', lider1, companyId);
    const caller = factory(ctx(bearer));
    await expect(caller.getLeadersStatus({ companyId, mes: '2024-06' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lider SEM liderados no mes NAO aparece', async () => {
    // Cria lider sem liderados.
    await createEmployee(companyId, {
      name: 'Solitario',
      isLider: true,
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
    });
    const solitarioName = rows.find((r) => r.name === 'Solitario');
    expect(solitarioName).toBeUndefined();
  });

  it('C-level com liderados aparece com liderTipo="clevel"', async () => {
    const clevelId = await createCLevel(companyId, {
      acessoTotal: true,
      name: 'C LS',
      cargo: 'CTO',
    });
    const empSub = await createEmployee(companyId, { name: 'Sub C' });
    await linkLeader(empSub, null, clevelId, new Date('2024-01-01'));
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: LeaderStatusRow[] = await caller.getLeadersStatus({
      companyId,
      mes: '2024-06',
    });
    const c = rows.find((r) => r.liderId === clevelId);
    expect(c).toBeDefined();
    expect(c!.liderTipo).toBe('clevel');
  });
});

// ============================================================
// 9) getPendentLeaders (§3.11 + §4.6 + S077 + S081)
// ============================================================

describe('monthlyData.getPendentLeaders', () => {
  let companyId: number;
  let empRH: number;
  let liderSuper: number; // lider-do-lider
  let liderMeio: number;
  let empSub: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_PENDENT_LEADERS);
    empRH = await createEmployee(companyId, { name: 'RH P', isRH: true });
    liderSuper = await createEmployee(companyId, {
      name: 'Super',
      isLider: true,
      departamento: 'Diretoria',
    });
    liderMeio = await createEmployee(companyId, {
      name: 'Meio',
      isLider: true,
      departamento: 'Comercial',
    });
    empSub = await createEmployee(companyId, { name: 'Sub P' });
    // liderMeio e liderado por liderSuper.
    await linkLeader(liderMeio, liderSuper, null, new Date('2024-01-01'));
    // empSub e liderado por liderMeio.
    await linkLeader(empSub, liderMeio, null, new Date('2024-01-01'));
    await seedJobFamilyVariables(companyId, 'vendas_comercial', ['0.25', '0.25', '0.25', '0.25']);
  });

  it('S077: mes futuro (antes do dia 5 do mes subsequente) -> PRECONDITION_FAILED', async () => {
    // Um mes 30 anos no futuro nunca vai ter passado o dia 5 do mes seguinte.
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPendentLeaders({ companyId, mes: '2999-01', escopo: 'empresa' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('mes passado, escopo="empresa": RH ve lideres pendentes', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: PendentLeaderRow[] = await caller.getPendentLeaders({
      companyId,
      mes: '2024-06',
      escopo: 'empresa',
    });
    // liderMeio tem liderado sem dados -> deve aparecer
    const meio = rows.find((r) => r.liderId === liderMeio);
    expect(meio).toBeDefined();
    expect(meio!.liderDoLiderId).toBe(liderSuper);
  });

  it('escopo="empresa" por lider comum -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderMeio, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPendentLeaders({ companyId, mes: '2024-06', escopo: 'empresa' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('escopo="minha_cadeia": liderSuper ve apenas liderMeio (cadeia direta)', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderSuper, companyId);
    const caller = factory(ctx(bearer));
    const rows: PendentLeaderRow[] = await caller.getPendentLeaders({
      companyId,
      mes: '2024-06',
      escopo: 'minha_cadeia',
      liderId: liderSuper,
      liderTipo: 'employee',
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.liderId).toBe(liderMeio);
  });

  it('escopo="minha_cadeia" sem liderId -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', liderSuper, companyId);
    const caller = factory(ctx(bearer));
    await expect(
      caller.getPendentLeaders({
        companyId,
        mes: '2024-06',
        escopo: 'minha_cadeia',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('lider apos preencher NAO aparece mais em pendentes', async () => {
    // Preenche todas as variaveis para empSub via liderMeio.
    const { factory, ctx } = bindRouter();
    const liderToken = await tokenPlatform('lider', liderMeio, companyId);
    const liderCaller = factory(ctx(liderToken));
    await liderCaller.saveMonthlyLeaderData({
      companyId,
      mes: '2024-06',
      liderId: liderMeio,
      liderTipo: 'employee',
      liderados: [
        {
          employeeId: empSub,
          variaveis: [
            { variableIndex: 0, demanda: '10', executado: '10' },
            { variableIndex: 1, demanda: '10', executado: '10' },
            { variableIndex: 2, demanda: '10', executado: '10' },
            { variableIndex: 3, demanda: '10', executado: '10' },
          ],
        },
      ],
    });
    const bearer = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(bearer));
    const rows: PendentLeaderRow[] = await caller.getPendentLeaders({
      companyId,
      mes: '2024-06',
      escopo: 'empresa',
    });
    expect(rows.find((r) => r.liderId === liderMeio)).toBeUndefined();
  });

  it('escopo="minha_cadeia" liderando ninguem: retorna lista vazia', async () => {
    const empSoloLider = await createEmployee(companyId, {
      name: 'Solo L',
      isLider: true,
    });
    const { factory, ctx } = bindRouter();
    const bearer = await tokenPlatform('lider', empSoloLider, companyId);
    const caller = factory(ctx(bearer));
    const rows: PendentLeaderRow[] = await caller.getPendentLeaders({
      companyId,
      mes: '2024-06',
      escopo: 'minha_cadeia',
      liderId: empSoloLider,
      liderTipo: 'employee',
    });
    expect(rows).toEqual([]);
  });
});
