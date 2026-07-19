// ROIP APP 9BOX — teste de integracao do sub-router `turnover` (ME-045).
//
// Exercita as 2 procs canonicas do §12.8:
//   - `turnover.getByCompany` — matriz administrativa canonica (S147:
//     super_admin + rh + rh_lider + clevel). Abertura por nivel
//     hierarquico canonico §12.3 e por motivo §12.4.
//   - `turnover.getByDepartamento` — mesma matriz. SEM abertura por
//     nivel hierarquico §12.3.
//
// Cobre:
//   - Contratos exportados (RV-13): mensagens literais, schemas Zod,
//     tipos, factory, motor.
//   - Motor deterministico: formula canonica §12.1; headcount S141
//     (dataAdmissao <= D E status='ativo' OU termination > D);
//     divisao por zero → 0; C-levels EXCLUIDOS integralmente §12.2;
//     estrategico inclui-se normalmente.
//   - Abertura canonica §12.3: 3 linhas por nivel na visao empresa;
//     ausente na visao departamento.
//   - Snapshots preservados §12.6: departamento e nivel usados vem
//     do `employeeTerminationEvents` (snapshotSet no INSERT), NAO da
//     linha atual do `employees` (que pode ter mudado apos a saida).
//   - Guards: NOT_FOUND na empresa; FORBIDDEN cross-company para
//     nao-Bruno.
//
// Faixa CNPJ canonica 825..829 (S143 — sub-faixa turnover-router).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeTerminationEvents,
  employees,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  GET_BY_COMPANY_INPUT_SCHEMA,
  GET_BY_DEPARTAMENTO_INPUT_SCHEMA,
  MSG_COMPANY_MISMATCH_TURN,
  MSG_COMPANY_NAO_ENCONTRADA_TURN,
  assertCompanyScopeTurn,
  createTurnoverRouter,
} from '../../src/server/routers/turnover';
import {
  TURNOVER_ENGINE_SENTINELS,
  TURNOVER_PRECISION_DECIMALS,
  computeTurnoverBoundaries,
  computeTurnoverByCompany,
  computeTurnoverByDepartamento,
  computeTurnoverRate,
  type TurnoverBoundaries,
  type TurnoverByNivelLine,
  type TurnoverSummary,
} from '../../src/server/services/turnoverEngine';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me045-turnover';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me045-turnover';

let cpfCounter = 45500000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Sub-faixa turnover-router (S143).
const CNPJ_CONTRATOS = '10000000000825';
const CNPJ_EMPRESA_COMPLETO = '10000000000826';
const CNPJ_EMPRESA_DEPARTAMENTO = '10000000000827';
const CNPJ_SNAPSHOTS = '10000000000828';
const CNPJ_GUARDS = '10000000000829';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Fixtures
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME045TURN ${cnpj} LTDA`,
      nomeFantasia: `ME045TURN ${cnpj}`,
      cnpj,
      telefone: '1633330045',
      endereco: `Rua ME-045 turnover, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-turn-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-turn-${cnpj}@example.com`,
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

interface CreateEmpOpts {
  status?: 'ativo' | 'inativo';
  isLider?: boolean;
  isRH?: boolean;
  departamento?: 'Financeiro' | 'Operações' | 'Recursos Humanos' | 'Comercial';
  nivelHierarquico?: 'operacional' | 'tatico' | 'estrategico';
  name?: string;
  dataAdmissao?: Date;
}

async function createFixtureEmp(companyId: number, opts: CreateEmpOpts = {}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Emp Turn',
      cpf: nextCpf(),
      email: `emp-turn-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: opts.dataAdmissao ?? new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: opts.nivelHierarquico ?? 'tatico',
      departamento: opts.departamento ?? 'Financeiro',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface CreateCLevelOpts {
  status?: 'ativo' | 'inativo';
  name?: string;
}

async function createFixtureCLevel(
  companyId: number,
  opts: CreateCLevelOpts = {},
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'CFO Turn',
      cpf: nextCpf(),
      email: `cl-turn-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'CFO',
      descricaoCargo: 'CFO',
      departamento: 'Financeiro',
      custoMensal: '25000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      status: opts.status ?? 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface CreateTerminationOpts {
  motivo: 'voluntario' | 'involuntario';
  dataInativacao: Date;
  nivelSnapshot?: 'operacional' | 'tatico' | 'estrategico';
  departamentoSnapshot?: string;
}

async function insertTermination(
  employeeId: number,
  companyId: number,
  opts: CreateTerminationOpts,
): Promise<number> {
  const [row] = await client.db
    .insert(employeeTerminationEvents)
    .values({
      employeeId,
      companyId,
      dataInativacao: opts.dataInativacao,
      motivo: opts.motivo,
      nivelHierarquicoSnapshot: opts.nivelSnapshot ?? 'tatico',
      departamentoSnapshot: opts.departamentoSnapshot ?? 'Financeiro',
      actorTipo: 'superAdmin',
      actorId: FIXTURE_SUPER_ADMIN_ID,
    })
    .$returningId();
  return row!.id;
}

// ============================================================
// Tokens
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

function bindRouter() {
  const testRouter = createTurnoverRouter();
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
// 0) Contratos exportados (RV-13)
// ============================================================

describe('turnover — contratos publicos exportados', () => {
  it('mensagens literais canonicas', () => {
    expect(MSG_COMPANY_MISMATCH_TURN).toBe('Empresa nao pertence ao seu escopo.');
    expect(MSG_COMPANY_NAO_ENCONTRADA_TURN).toBe('Empresa nao encontrada.');
  });

  it('schemas Zod aceitam formato canonico', () => {
    expect(
      GET_BY_COMPANY_INPUT_SCHEMA.safeParse({ companyId: 1, trimestre: '2025-Q3' }).success,
    ).toBe(true);
    expect(
      GET_BY_COMPANY_INPUT_SCHEMA.safeParse({ companyId: 1, trimestre: '2025-Q5' }).success,
    ).toBe(false);
    expect(
      GET_BY_DEPARTAMENTO_INPUT_SCHEMA.safeParse({
        companyId: 1,
        departamento: 'Financeiro',
        trimestre: '2025-Q3',
      }).success,
    ).toBe(true);
    expect(
      GET_BY_DEPARTAMENTO_INPUT_SCHEMA.safeParse({
        companyId: 1,
        departamento: 'DepartamentoInexistente',
        trimestre: '2025-Q3',
      }).success,
    ).toBe(false);
  });

  it('constantes exportadas do motor', () => {
    expect(TURNOVER_PRECISION_DECIMALS).toBe(2);
    expect(TURNOVER_ENGINE_SENTINELS.nivelHierarquicoValues).toEqual([
      'operacional',
      'tatico',
      'estrategico',
    ]);
    expect(TURNOVER_ENGINE_SENTINELS.motivoValues).toEqual(['voluntario', 'involuntario']);
    expect(TURNOVER_ENGINE_SENTINELS.departamentoValues.length).toBe(19);
  });

  it('assertCompanyScopeTurn: super_admin atravessa', () => {
    expect(() => {
      assertCompanyScopeTurn({ role: 'super_admin', superAdminId: 1 }, 42);
    }).not.toThrow();
  });

  it('assertCompanyScopeTurn: role de empresa distinta lanca FORBIDDEN literal', () => {
    expect(() => {
      assertCompanyScopeTurn({ role: 'rh', userId: 1, companyId: 42 }, 43);
    }).toThrowError(new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_TURN }));
  });

  it('computeTurnoverBoundaries: fronteiras Q3-2025 canonicas', () => {
    const b: TurnoverBoundaries = computeTurnoverBoundaries('2025-Q3');
    expect(b.trimestre).toBe('2025-Q3');
    expect(b.trimestreInicio.toISOString()).toBe('2025-07-01T00:00:00.000Z');
    expect(b.trimestreFim.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    expect(b.anualizadoInicio.toISOString()).toBe('2024-10-01T00:00:00.000Z');
    expect(b.anualizadoFim.toISOString()).toBe('2025-10-01T00:00:00.000Z');
  });

  it('tipos publicos TurnoverSummary + TurnoverByNivelLine sao exportados (RV-13)', () => {
    const sum: TurnoverSummary = {
      taxaTrimestral: 5,
      taxaAnualizada: 10,
      totalSaidasTrimestre: 1,
      totalHeadcountInicioTrimestre: 20,
      totalSaidasAnualizado: 4,
      totalHeadcountInicioAnualizado: 40,
      aberturaPorMotivo: { voluntario: 1, involuntario: 0 },
    };
    const line: TurnoverByNivelLine = {
      nivel: 'tatico',
      taxaTrimestral: 5,
      saidasTrimestre: 1,
      headcountInicioTrimestre: 20,
      voluntario: 1,
      involuntario: 0,
    };
    expect(sum.aberturaPorMotivo.voluntario).toBe(1);
    expect(line.nivel).toBe('tatico');
  });

  it('computeTurnoverRate: precisao canonica 2 casas + divisao por zero = 0', () => {
    expect(computeTurnoverRate(3, 42)).toBeCloseTo(7.14, 2);
    expect(computeTurnoverRate(0, 0)).toBe(0);
    expect(computeTurnoverRate(5, 0)).toBe(0);
    expect(computeTurnoverRate(100, 100)).toBe(100);
  });

  it('contrato CNPJ_CONTRATOS (faixa 825..829 reservada — S143)', async () => {
    const c = await createCompany(CNPJ_CONTRATOS);
    expect(c).toBeGreaterThan(0);
  });

  it('RV-13: motor + procs sao chamadas', () => {
    expect(typeof computeTurnoverByCompany).toBe('function');
    expect(typeof computeTurnoverByDepartamento).toBe('function');
    expect(typeof createTurnoverRouter).toBe('function');
  });
});

// ============================================================
// 1) getByCompany — cenario com terminations + headcount misto
// ============================================================

describe('turnover.getByCompany — cenario canonico completo', () => {
  it('calcula taxa trimestral e anualizada; abre por nivel e motivo; exclui C-levels', async () => {
    const c = await createCompany(CNPJ_EMPRESA_COMPLETO);

    // Colaboradores comuns admitidos antes de 2024-04-01 (compõem headcount para 2024-Q3).
    const eAtivo1 = await createFixtureEmp(c, {
      nivelHierarquico: 'operacional',
      dataAdmissao: new Date('2020-01-15'),
    });
    const eAtivo2 = await createFixtureEmp(c, {
      nivelHierarquico: 'tatico',
      dataAdmissao: new Date('2021-06-10'),
    });
    const eAtivo3 = await createFixtureEmp(c, {
      nivelHierarquico: 'estrategico',
      dataAdmissao: new Date('2019-03-01'),
    });
    // Terminated no meio do trimestre 2024-Q3 (jul/ago/set).
    const eSaida1 = await createFixtureEmp(c, {
      nivelHierarquico: 'operacional',
      dataAdmissao: new Date('2022-01-10'),
      status: 'inativo',
    });
    const eSaida2 = await createFixtureEmp(c, {
      nivelHierarquico: 'estrategico',
      dataAdmissao: new Date('2020-05-01'),
      status: 'inativo',
    });
    // C-level ativo — deve ser EXCLUIDO (§12.2).
    await createFixtureCLevel(c);

    // Duas terminations no Q3-2024.
    await insertTermination(eSaida1, c, {
      motivo: 'voluntario',
      dataInativacao: new Date('2024-08-15T10:00:00.000Z'),
      nivelSnapshot: 'operacional',
    });
    await insertTermination(eSaida2, c, {
      motivo: 'involuntario',
      dataInativacao: new Date('2024-09-20T14:00:00.000Z'),
      nivelSnapshot: 'estrategico',
    });

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));

    const res = await caller.getByCompany({ companyId: c, trimestre: '2024-Q3' });
    expect(res.companyId).toBe(c);
    expect(res.trimestre).toBe('2024-Q3');
    expect(res.totalSaidasTrimestre).toBe(2);
    expect(res.aberturaPorMotivo).toEqual({ voluntario: 1, involuntario: 1 });
    // Headcount = 5 (3 ativos hoje + 2 inativos hoje com termination > 2024-07-01).
    expect(res.totalHeadcountInicioTrimestre).toBe(5);
    expect(res.taxaTrimestral).toBe(computeTurnoverRate(2, 5));

    // Abertura por nivel: 3 linhas (operacional, tatico, estrategico).
    expect(res.aberturaPorNivel).toHaveLength(3);
    const porNivel = new Map(res.aberturaPorNivel.map((l) => [l.nivel, l]));
    expect(porNivel.get('operacional')?.saidasTrimestre).toBe(1);
    expect(porNivel.get('operacional')?.voluntario).toBe(1);
    expect(porNivel.get('estrategico')?.saidasTrimestre).toBe(1);
    expect(porNivel.get('estrategico')?.involuntario).toBe(1);
    expect(porNivel.get('tatico')?.saidasTrimestre).toBe(0);

    // Silencia unused var — eAtivo1..3 usados na fixture.
    expect([eAtivo1, eAtivo2, eAtivo3].every((n) => n > 0)).toBe(true);
  });
});

// ============================================================
// 2) getByDepartamento — sem abertura por nivel (§12.3)
// ============================================================

describe('turnover.getByDepartamento — cenario canonico com filtro', () => {
  it('filtra por departamentoSnapshot; abertura por motivo; sem aberturaPorNivel', async () => {
    const c = await createCompany(CNPJ_EMPRESA_DEPARTAMENTO);

    await createFixtureEmp(c, { departamento: 'Financeiro', dataAdmissao: new Date('2020-01-01') });
    await createFixtureEmp(c, { departamento: 'Financeiro', dataAdmissao: new Date('2020-01-01') });
    await createFixtureEmp(c, { departamento: 'Comercial', dataAdmissao: new Date('2020-01-01') });

    const eSaidaFin = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      dataAdmissao: new Date('2021-05-01'),
      status: 'inativo',
    });
    const eSaidaCom = await createFixtureEmp(c, {
      departamento: 'Comercial',
      dataAdmissao: new Date('2021-05-01'),
      status: 'inativo',
    });
    await insertTermination(eSaidaFin, c, {
      motivo: 'voluntario',
      dataInativacao: new Date('2024-08-10T10:00:00.000Z'),
      departamentoSnapshot: 'Financeiro',
    });
    await insertTermination(eSaidaCom, c, {
      motivo: 'involuntario',
      dataInativacao: new Date('2024-08-10T10:00:00.000Z'),
      departamentoSnapshot: 'Comercial',
    });

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));

    const res = await caller.getByDepartamento({
      companyId: c,
      departamento: 'Financeiro',
      trimestre: '2024-Q3',
    });
    expect(res.departamento).toBe('Financeiro');
    expect(res.totalSaidasTrimestre).toBe(1);
    expect(res.aberturaPorMotivo).toEqual({ voluntario: 1, involuntario: 0 });
    // Headcount Financeiro = 3 (2 ativos + 1 inativo com termination > 2024-07-01).
    expect(res.totalHeadcountInicioTrimestre).toBe(3);
    // Nao ha `aberturaPorNivel` no tipo retornado (§12.3).
    expect((res as unknown as { aberturaPorNivel?: unknown }).aberturaPorNivel).toBeUndefined();
  });
});

// ============================================================
// 3) Snapshots preservados §12.6
// ============================================================

describe('turnover — snapshots §12.6 preservados apos mudanca cadastral', () => {
  it('usa departamentoSnapshot do termination, NAO departamento atual', async () => {
    const c = await createCompany(CNPJ_SNAPSHOTS);
    const eSaida = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      nivelHierarquico: 'tatico',
      dataAdmissao: new Date('2020-01-01'),
      status: 'inativo',
    });
    // Snapshot "Recursos Humanos" — simula que estava em RH no momento da saida
    // mesmo que a linha atual em `employees` diga "Financeiro".
    await insertTermination(eSaida, c, {
      motivo: 'voluntario',
      dataInativacao: new Date('2024-08-01T10:00:00.000Z'),
      departamentoSnapshot: 'Recursos Humanos',
      nivelSnapshot: 'operacional',
    });

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));

    const resFin = await caller.getByDepartamento({
      companyId: c,
      departamento: 'Financeiro',
      trimestre: '2024-Q3',
    });
    expect(resFin.totalSaidasTrimestre).toBe(0);

    const resRH = await caller.getByDepartamento({
      companyId: c,
      departamento: 'Recursos Humanos',
      trimestre: '2024-Q3',
    });
    expect(resRH.totalSaidasTrimestre).toBe(1);
    expect(resRH.aberturaPorMotivo).toEqual({ voluntario: 1, involuntario: 0 });
  });
});

// ============================================================
// 4) Guards NOT_FOUND + FORBIDDEN
// ============================================================

describe('turnover — guards cross-company e NOT_FOUND', () => {
  it('NOT_FOUND canonico quando empresa nao existe', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.getByCompany({ companyId: 999999, trimestre: '2024-Q3' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_COMPANY_NAO_ENCONTRADA_TURN,
    });
  });

  it('FORBIDDEN canonico para RH em empresa diferente', async () => {
    const cAlvo = await createCompany(CNPJ_GUARDS);
    // Cria empresa "outra" via CNPJ diferente (nao entra na sub-faixa mas ainda dentro do cleanup).
    const cOutra = await createCompany('10000000000824');
    const rhOutra = await createFixtureEmp(cOutra, { isRH: true });

    const { factory, ctx } = bindRouter();
    const tRH = await tokenPlatform('rh', rhOutra, cOutra);
    const caller = factory(ctx(tRH));
    await expect(
      caller.getByCompany({ companyId: cAlvo, trimestre: '2024-Q3' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_COMPANY_MISMATCH_TURN,
    });
  });
});
