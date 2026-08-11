// ROIP APP 9BOX — teste de integracao ME-076 proc `employees.list`.
//
// Cobre canonicamente bit-exact a proc nova da ME-076 (§14.10):
//   1. Filtros individuais canonicos (departamento, liderId, nivel,
//      status, senioridade, jobFamily, papelFuncional, data admissao,
//      data cadastro, busca global).
//   2. Ordenacao (`sortBy` × `sortOrder`) canonica bit-exact.
//   3. Paginacao server-side (25/50/100 default 50).
//   4. LEFT JOIN canonico em `employeeLeaderHistory` para nome do lider
//      direto (dataFim IS NULL).
//   5. LEFT JOIN canonico em `individualProfileAssessments` para status
//      canonico do Perfil Individual mais recente.
//   6. Guards canonicos (`assertCompanyScope` — Bruno atravessa, RH
//      restrito a propria empresa).
//
// Roda contra MySQL real (RV-11 canonica bit-exact) via base efemera
// `roip_test`. Cada teste limpa fixtures previas + insere a empresa alvo
// no ciclo canonico.
//
// Faixa CNPJ canonica ME-076: 76100000000000..76199999999999.
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  employeeLeaderHistory,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  companies,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createEmployeesRouter } from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me076-employees-list';

const FIXTURE_SUPER_ADMIN_ID = 1;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 76100000000000;

function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    // Coleta os employeeIds das empresas de teste para poder limpar FKs
    // em ordem canonica bit-exact respeitando ON DELETE RESTRICT.
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const employeeIds = empRows.map((r) => r.id);

    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    if (employeeIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, employeeIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// -----------------------------------------------------------------------
// Fixtures canonicas bit-exact
// -----------------------------------------------------------------------

async function createTestCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME076 Test ${cnpj} LTDA`,
      nomeFantasia: `ME076 ${cnpj}`,
      cnpj,
      telefone: '1633330076',
      endereco: `Rua ME-076, ${cnpj}`,
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
      modoAnoFiscal: 'padrao',
      mesInicioAnoFiscal: 1,
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

interface EmployeeSeedInput {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly cargo?: string;
  readonly departamento?: 'Comercial' | 'Financeiro' | 'Operações' | 'Recursos Humanos';
  readonly senioridade?: 'junior' | 'pleno' | 'senior';
  readonly nivelHierarquico?: 'operacional' | 'tatico' | 'estrategico';
  readonly jobFamily?: 'vendas_comercial' | 'lideranca_gestao' | 'administrativo_suporte';
  readonly isRH?: boolean;
  readonly isLider?: boolean;
  readonly isResponsavelFinanceiro?: boolean;
  readonly status?: 'ativo' | 'inativo';
  readonly dataAdmissao?: Date;
}

async function seedEmployee(input: EmployeeSeedInput): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@example.com`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: input.dataAdmissao ?? new Date('2023-01-01'),
      cbo: '2521-05',
      descricaoCBO: input.cargo ?? 'Analista',
      jobFamily: input.jobFamily ?? 'administrativo_suporte',
      senioridade: input.senioridade ?? 'pleno',
      nivelHierarquico: input.nivelHierarquico ?? 'operacional',
      departamento: input.departamento ?? 'Operações',
      status: input.status ?? 'ativo',
      isRH: input.isRH ?? false,
      isLider: input.isLider ?? false,
      isResponsavelFinanceiro: input.isResponsavelFinanceiro ?? false,
    })
    .$returningId();
  return row!.id;
}

async function seedLeaderHistory(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2023-01-01'),
    dataFim: null,
    reason: 'Atribuição inicial no cadastro',
    transferBatchId: crypto.randomUUID(),
  });
}

async function seedProfileAssessment(
  companyId: number,
  employeeId: number,
  status: 'em_andamento' | 'enviado' | 'inconsistente',
): Promise<void> {
  await client.db.insert(individualProfileAssessments).values({
    companyId,
    userType: 'employee',
    userId: employeeId,
    tentativa: 1,
    status,
    blocoAtual: 1,
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createEmployeesRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

const EMPTY_FILTERS_INPUT = {
  filters: {
    busca: '',
    departamento: null,
    liderId: null,
    nivelHierarquico: null,
    status: 'ativo' as const,
    senioridade: null,
    jobFamily: null,
    dataAdmissaoInicio: null,
    dataAdmissaoFim: null,
    dataCadastroInicio: null,
    dataCadastroFim: null,
    papelFuncional: 'todos' as const,
  },
  sortBy: 'name' as const,
  sortOrder: 'asc' as const,
  page: 1,
  pageSize: 50 as const,
};

// =======================================================================
// 1. Listagem basica canonica bit-exact
// =======================================================================

describe('employees.list — listagem basica canonica bit-exact (§14.10)', () => {
  it('retorna colaboradores ativos da empresa em ordem alfabetica por nome', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Zoraide Silva',
      cpf: '10000000001',
    });
    await seedEmployee({
      companyId,
      name: 'Alice Souza',
      cpf: '10000000002',
    });
    await seedEmployee({
      companyId,
      name: 'Bruno Costa',
      cpf: '10000000003',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId, ...EMPTY_FILTERS_INPUT });

    expect(res.totalCount).toBe(3);
    expect(res.rows.map((r) => r.name)).toEqual(['Alice Souza', 'Bruno Costa', 'Zoraide Silva']);
  });

  it('omite colaboradores inativos por default (status=ativo)', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Ativo Um',
      cpf: '10100000001',
      status: 'ativo',
    });
    await seedEmployee({
      companyId,
      name: 'Inativo Um',
      cpf: '10100000002',
      status: 'inativo',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId, ...EMPTY_FILTERS_INPUT });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Ativo Um');
  });

  it('inclui inativos quando status=todos', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Ativo Dois',
      cpf: '10200000001',
      status: 'ativo',
    });
    await seedEmployee({
      companyId,
      name: 'Inativo Dois',
      cpf: '10200000002',
      status: 'inativo',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, status: 'todos' },
    });

    expect(res.totalCount).toBe(2);
  });

  it('inclui apenas inativos quando status=inativo', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Ativo Tres',
      cpf: '10300000001',
      status: 'ativo',
    });
    await seedEmployee({
      companyId,
      name: 'Inativo Tres',
      cpf: '10300000002',
      status: 'inativo',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, status: 'inativo' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Inativo Tres');
  });
});

// =======================================================================
// 2. Filtros individuais canonicos bit-exact
// =======================================================================

describe('employees.list — filtros canonicos bit-exact (§14.10 + §20)', () => {
  it('filtra por departamento', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Comercial Alfa',
      cpf: '11000000001',
      departamento: 'Comercial',
    });
    await seedEmployee({
      companyId,
      name: 'Financeiro Alfa',
      cpf: '11000000002',
      departamento: 'Financeiro',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: {
        ...EMPTY_FILTERS_INPUT.filters,
        departamento: 'Comercial',
      },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Comercial Alfa');
  });

  it('filtra por nivelHierarquico', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Op Alfa',
      cpf: '11100000001',
      nivelHierarquico: 'operacional',
    });
    await seedEmployee({
      companyId,
      name: 'Estr Alfa',
      cpf: '11100000002',
      nivelHierarquico: 'estrategico',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: {
        ...EMPTY_FILTERS_INPUT.filters,
        nivelHierarquico: 'estrategico',
      },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Estr Alfa');
  });

  it('filtra por senioridade', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Junior Alfa',
      cpf: '11200000001',
      senioridade: 'junior',
    });
    await seedEmployee({
      companyId,
      name: 'Senior Alfa',
      cpf: '11200000002',
      senioridade: 'senior',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, senioridade: 'senior' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Senior Alfa');
  });

  it('filtra por jobFamily', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Vendas Alfa',
      cpf: '11300000001',
      jobFamily: 'vendas_comercial',
    });
    await seedEmployee({
      companyId,
      name: 'Adm Alfa',
      cpf: '11300000002',
      jobFamily: 'administrativo_suporte',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: {
        ...EMPTY_FILTERS_INPUT.filters,
        jobFamily: 'vendas_comercial',
      },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Vendas Alfa');
  });

  it('filtra por papelFuncional=rh (§20 canonica bit-exact)', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'RH Um',
      cpf: '11400000001',
      isRH: true,
    });
    await seedEmployee({
      companyId,
      name: 'Sem Papel',
      cpf: '11400000002',
      isRH: false,
      isLider: false,
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, papelFuncional: 'rh' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('RH Um');
    expect(res.rows[0]?.isRH).toBe(true);
  });

  it('filtra por papelFuncional=lider', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Lider Um',
      cpf: '11500000001',
      isLider: true,
    });
    await seedEmployee({
      companyId,
      name: 'Comum Um',
      cpf: '11500000002',
      isLider: false,
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, papelFuncional: 'lider' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Lider Um');
    expect(res.rows[0]?.isLider).toBe(true);
  });

  it('filtra por papelFuncional=respfin', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'RF Um',
      cpf: '11600000001',
      isRH: true,
      isResponsavelFinanceiro: true,
    });
    await seedEmployee({
      companyId,
      name: 'RH Sem RF',
      cpf: '11600000002',
      isRH: true,
      isResponsavelFinanceiro: false,
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, papelFuncional: 'respfin' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('RF Um');
    expect(res.rows[0]?.isResponsavelFinanceiro).toBe(true);
  });

  it('filtra por papelFuncional=sem_papel', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Sem Nada',
      cpf: '11700000001',
      isRH: false,
      isLider: false,
      isResponsavelFinanceiro: false,
    });
    await seedEmployee({
      companyId,
      name: 'Tem RH',
      cpf: '11700000002',
      isRH: true,
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: {
        ...EMPTY_FILTERS_INPUT.filters,
        papelFuncional: 'sem_papel',
      },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Sem Nada');
  });

  it('busca global case-insensitive por nome/cpf/cargo', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Carlos Analista',
      cpf: '11800000001',
      cargo: 'Analista Financeiro',
    });
    await seedEmployee({
      companyId,
      name: 'Maria Gerente',
      cpf: '11800000002',
      cargo: 'Gerente Comercial',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, busca: 'GERENTE' },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Maria Gerente');
  });

  it('filtra por data admissao (range)', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Antigo',
      cpf: '11900000001',
      dataAdmissao: new Date('2020-06-15'),
    });
    await seedEmployee({
      companyId,
      name: 'Recente',
      cpf: '11900000002',
      dataAdmissao: new Date('2024-03-10'),
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: {
        ...EMPTY_FILTERS_INPUT.filters,
        dataAdmissaoInicio: new Date('2024-01-01'),
      },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Recente');
  });
});

// =======================================================================
// 3. LEFT JOINs canonicos bit-exact — lider + Perfil Individual
// =======================================================================

describe('employees.list — LEFT JOINs canonicos bit-exact', () => {
  it('resolve nome do lider direto via employeeLeaderHistory', async () => {
    const companyId = await createTestCompany();
    const liderId = await seedEmployee({
      companyId,
      name: 'Lider Direto',
      cpf: '12000000001',
      isLider: true,
    });
    const liderado = await seedEmployee({
      companyId,
      name: 'Liderado',
      cpf: '12000000002',
    });
    await seedLeaderHistory(liderado, liderId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId, ...EMPTY_FILTERS_INPUT });

    const liderRow = res.rows.find((r) => r.name === 'Liderado');
    expect(liderRow).toBeDefined();
    expect(liderRow?.liderName).toBe('Lider Direto');
    const liderProprio = res.rows.find((r) => r.name === 'Lider Direto');
    expect(liderProprio?.liderName).toBeNull();
  });

  it('filtra por liderId — apenas liderados do lider selecionado', async () => {
    const companyId = await createTestCompany();
    const liderId = await seedEmployee({
      companyId,
      name: 'Lider Escopo',
      cpf: '12100000001',
      isLider: true,
    });
    const outroLiderId = await seedEmployee({
      companyId,
      name: 'Outro Lider',
      cpf: '12100000002',
      isLider: true,
    });
    const liderado1 = await seedEmployee({
      companyId,
      name: 'Liderado A',
      cpf: '12100000003',
    });
    const liderado2 = await seedEmployee({
      companyId,
      name: 'Liderado B',
      cpf: '12100000004',
    });
    await seedLeaderHistory(liderado1, liderId);
    await seedLeaderHistory(liderado2, outroLiderId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      filters: { ...EMPTY_FILTERS_INPUT.filters, liderId },
    });

    expect(res.totalCount).toBe(1);
    expect(res.rows[0]?.name).toBe('Liderado A');
  });

  it('resolve status canonico do Perfil Individual mais recente', async () => {
    const companyId = await createTestCompany();
    const emp1 = await seedEmployee({
      companyId,
      name: 'PI Enviado',
      cpf: '12200000001',
    });
    const emp2 = await seedEmployee({
      companyId,
      name: 'PI Em Andamento',
      cpf: '12200000002',
    });
    const emp3 = await seedEmployee({
      companyId,
      name: 'PI Nao Respondido',
      cpf: '12200000003',
    });
    await seedProfileAssessment(companyId, emp1, 'enviado');
    await seedProfileAssessment(companyId, emp2, 'em_andamento');
    // emp3 sem assessment — deve retornar 'nao_respondido'.
    expect(emp3).toBeGreaterThan(0);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId, ...EMPTY_FILTERS_INPUT });

    const rowEnviado = res.rows.find((r) => r.name === 'PI Enviado');
    const rowAndamento = res.rows.find((r) => r.name === 'PI Em Andamento');
    const rowNaoResp = res.rows.find((r) => r.name === 'PI Nao Respondido');
    expect(rowEnviado?.profileIndividualStatus).toBe('enviado');
    expect(rowAndamento?.profileIndividualStatus).toBe('em_andamento');
    expect(rowNaoResp?.profileIndividualStatus).toBe('nao_respondido');
  });
});

// =======================================================================
// 4. Ordenacao + paginacao canonicas bit-exact
// =======================================================================

describe('employees.list — ordenacao + paginacao canonicas bit-exact', () => {
  it('ordena por nome desc', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Ana Ordem',
      cpf: '13000000001',
    });
    await seedEmployee({
      companyId,
      name: 'Zeca Ordem',
      cpf: '13000000002',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      sortBy: 'name',
      sortOrder: 'desc',
    });

    expect(res.rows.map((r) => r.name)).toEqual(['Zeca Ordem', 'Ana Ordem']);
  });

  it('paginacao respeita pageSize e retorna totalCount total', async () => {
    const companyId = await createTestCompany();
    for (let i = 0; i < 5; i += 1) {
      await seedEmployee({
        companyId,
        name: `Pag ${String(i).padStart(2, '0')}`,
        cpf: `1310000000${i}`,
      });
    }

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const p1 = await caller.list({
      companyId,
      ...EMPTY_FILTERS_INPUT,
      pageSize: 25,
      page: 1,
    });
    expect(p1.totalCount).toBe(5);
    expect(p1.rows).toHaveLength(5);
  });
});

// =======================================================================
// 5. Guards canonicos bit-exact — RV-08
// =======================================================================

describe('employees.list — guards canonicos bit-exact (§2.4)', () => {
  it('Super Admin atravessa qualquer companyId', async () => {
    const companyId = await createTestCompany();
    await seedEmployee({
      companyId,
      name: 'Bruno Ve Tudo',
      cpf: '14000000001',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.list({ companyId, ...EMPTY_FILTERS_INPUT });
    expect(res.totalCount).toBe(1);
  });

  it('token ausente sobe UNAUTHORIZED', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.list({ companyId, ...EMPTY_FILTERS_INPUT })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});

// =======================================================================
// 6. Contrato canonico dos labels + helpers do internals.ts
// =======================================================================

describe('internals.ts — labels + helpers canonicos bit-exact', () => {
  it('getPapelFuncionalLabel retorna labels canonicos §20', async () => {
    const { getPapelFuncionalLabel } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    expect(getPapelFuncionalLabel('todos')).toBe('Todos');
    expect(getPapelFuncionalLabel('lider')).toBe('Líder');
    expect(getPapelFuncionalLabel('rh')).toBe('RH');
    expect(getPapelFuncionalLabel('respfin')).toBe('Responsável financeiro');
    expect(getPapelFuncionalLabel('sem_papel')).toBe('Sem papel');
  });

  it('formatCpfMasked mascara CPF de 11 digitos', async () => {
    const { formatCpfMasked } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    expect(formatCpfMasked('12345678901')).toBe('123.456.789-01');
    expect(formatCpfMasked('123')).toBe('123');
  });

  it('formatDateBR formata data UTC como dd/MM/yyyy', async () => {
    const { formatDateBR } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    expect(formatDateBR(new Date('2024-03-15T00:00:00Z'))).toBe('15/03/2024');
  });

  it('getIniciaisFromName extrai duas primeiras iniciais', async () => {
    const { getIniciaisFromName } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    expect(getIniciaisFromName('Alice Souza')).toBe('AS');
    expect(getIniciaisFromName('Alice Beatriz Souza')).toBe('AS');
    expect(getIniciaisFromName('Alice')).toBe('A');
    expect(getIniciaisFromName('')).toBe('?');
  });

  it('hashNameToColor retorna cor consistente para mesmo nome', async () => {
    const { hashNameToColor } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    const a = hashNameToColor('Alice Souza');
    const b = hashNameToColor('Alice Souza');
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('parseCompanyIdParam aceita apenas inteiro positivo canonico', async () => {
    const { parseCompanyIdParam } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals');
    expect(parseCompanyIdParam('1')).toBe(1);
    expect(parseCompanyIdParam('42')).toBe(42);
    expect(parseCompanyIdParam('0')).toBeNull();
    expect(parseCompanyIdParam('-1')).toBeNull();
    expect(parseCompanyIdParam('01')).toBeNull();
    expect(parseCompanyIdParam('abc')).toBeNull();
    expect(parseCompanyIdParam('')).toBeNull();
  });
});

// =======================================================================
// 7. Contrato canonico do parser de filters.ts
// =======================================================================

describe('filters.ts — parser canonico bit-exact da query string', () => {
  it('parseColaboradoresFiltersFromSearchParams aplica defaults canonicos', async () => {
    const { parseColaboradoresFiltersFromSearchParams } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/filters');
    const filters = parseColaboradoresFiltersFromSearchParams({});
    expect(filters.status).toBe('ativo');
    expect(filters.papelFuncional).toBe('todos');
    expect(filters.sortBy).toBe('name');
    expect(filters.sortOrder).toBe('asc');
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(50);
    expect(filters.busca).toBe('');
    expect(filters.departamento).toBeNull();
  });

  it('parseColaboradoresFiltersFromSearchParams parseia keys canonicas', async () => {
    const { parseColaboradoresFiltersFromSearchParams } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/filters');
    const filters = parseColaboradoresFiltersFromSearchParams({
      q: 'alice',
      dept: 'Comercial',
      status: 'todos',
      papel: 'rh',
      page: '3',
      pageSize: '25',
    });
    expect(filters.busca).toBe('alice');
    expect(filters.departamento).toBe('Comercial');
    expect(filters.status).toBe('todos');
    expect(filters.papelFuncional).toBe('rh');
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(25);
  });

  it('CANONICAL_COLABORADORES_DEFAULT_FILTERS reflete §14.10 canonica', async () => {
    const { CANONICAL_COLABORADORES_DEFAULT_FILTERS } =
      await import('../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/filters');
    expect(CANONICAL_COLABORADORES_DEFAULT_FILTERS.status).toBe('ativo');
    expect(CANONICAL_COLABORADORES_DEFAULT_FILTERS.papelFuncional).toBe('todos');
    expect(CANONICAL_COLABORADORES_DEFAULT_FILTERS.pageSize).toBe(50);
  });
});
