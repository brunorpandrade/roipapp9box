// ROIP APP 9BOX — teste de integracao do sub-router `revenue` (ME-044).
//
// Exercita as 3 procs canonicas do §5.10 / §5.12:
//   - `revenue.saveFaturamento`     — UPSERT; RF-check; guard mes fechado.
//   - `revenue.getFaturamento`      — leitura pura por par (companyId, mes).
//   - `revenue.getCardResumoPendente` — janela de 12 meses (§5.12).
//
// Faixa CNPJ 813..816 (S130 pattern).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employees,
  monthlyClosureStatus,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  DEFAULT_REVENUE_ROUTER_DEPS,
  GET_CARD_RESUMO_PENDENTE_INPUT_SCHEMA,
  GET_FATURAMENTO_INPUT_SCHEMA,
  MSG_COMPANY_MISMATCH_REV,
  MSG_COMPANY_NAO_ENCONTRADA_REV,
  MSG_FATURAMENTO_INVALIDO,
  MSG_MES_FECHADO_REV,
  MSG_MES_FORMATO_INVALIDO,
  MSG_SAVE_FATURAMENTO_NAO_RF,
  RESUMO_PENDENTE_JANELA_MESES,
  SAVE_FATURAMENTO_INPUT_SCHEMA,
  createRevenueRouter,
  enumerateJanelaMeses,
  normalizeFaturamentoBruto,
  type GetCardResumoPendenteResult,
  type GetFaturamentoResult,
  type SaveFaturamentoResult,
} from '../../src/server/routers/revenue';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me044-revenue';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me044-revenue';

let cpfCounter = 44200000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Faixa CNPJ 813..816 (sub-faixa revenue-router).
const CNPJ_SAVE_SUCCESS = '10000000000813';
const CNPJ_GUARDS_RF = '10000000000814';
const CNPJ_MES_FECHADO = '10000000000815';
const CNPJ_RESUMO_PENDENTE = '10000000000816';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
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
      razaoSocial: `ME044RV Test ${cnpj} LTDA`,
      nomeFantasia: `ME044RV ${cnpj}`,
      cnpj,
      telefone: '1633330045',
      endereco: `Rua ME-044 RV, ${cnpj}`,
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

interface EmpOpts {
  isResponsavelFinanceiro?: boolean;
  status?: 'ativo' | 'inativo';
  isRH?: boolean;
}

async function createFixtureEmp(companyId: number, opts: EmpOpts = {}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colaborador ME044 RV',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente administrativo',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Financeiro',
      status: opts.status ?? 'ativo',
      isRH: opts.isRH ?? false,
      isLider: false,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createFixtureCLevel(companyId: number, isRF: boolean): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'CFO ME044 RV',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'CFO',
      descricaoCargo: 'CFO',
      departamento: 'Financeiro',
      custoMensal: '25000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: isRF,
      status: 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function setMesFechado(companyId: number, mes: string): Promise<void> {
  await client.db.insert(monthlyClosureStatus).values({
    companyId,
    mes,
    status: 'fechado',
    dataFechamento: new Date(),
  });
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

function bindRouter(nowFn?: () => Date) {
  const testRouter = createRevenueRouter(nowFn === undefined ? {} : { now: nowFn });
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

describe('revenue — contratos publicos exportados', () => {
  it('mensagens canonicas literais batem o texto exato', () => {
    expect(MSG_COMPANY_MISMATCH_REV).toBe('Empresa nao pertence ao seu escopo.');
    expect(MSG_COMPANY_NAO_ENCONTRADA_REV).toBe('Empresa nao encontrada.');
    expect(MSG_MES_FECHADO_REV).toBe(
      'Mes fechado. Solicite desbloqueio antes de gravar faturamento.',
    );
    expect(MSG_SAVE_FATURAMENTO_NAO_RF).toBe(
      'Apenas o Responsavel financeiro pode gravar o faturamento mensal.',
    );
    expect(MSG_FATURAMENTO_INVALIDO).toBe(
      'Faturamento invalido; informe um valor numerico maior que zero.',
    );
    expect(MSG_MES_FORMATO_INVALIDO).toBe('Mes deve estar no formato YYYY-MM.');
  });

  it('constantes canonicas de janela batem o schema', () => {
    expect(RESUMO_PENDENTE_JANELA_MESES).toBe(12);
    expect(typeof DEFAULT_REVENUE_ROUTER_DEPS.now).toBe('function');
  });

  it('SAVE_FATURAMENTO_INPUT_SCHEMA valida mes YYYY-MM', () => {
    expect(
      SAVE_FATURAMENTO_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2026-07',
        faturamentoBruto: 100.5,
      }).success,
    ).toBe(true);
    expect(
      SAVE_FATURAMENTO_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2026-7',
        faturamentoBruto: 100.5,
      }).success,
    ).toBe(false);
    expect(
      SAVE_FATURAMENTO_INPUT_SCHEMA.safeParse({
        companyId: 1,
        mes: '2026-07',
        faturamentoBruto: '150000.75',
      }).success,
    ).toBe(true);
  });

  it('GET_FATURAMENTO e GET_CARD_RESUMO_PENDENTE input schemas aceitam formato canonico', () => {
    expect(GET_FATURAMENTO_INPUT_SCHEMA.safeParse({ companyId: 1, mes: '2026-07' }).success).toBe(
      true,
    );
    expect(GET_CARD_RESUMO_PENDENTE_INPUT_SCHEMA.safeParse({ companyId: 1 }).success).toBe(true);
  });

  it('normalizeFaturamentoBruto normaliza para decimal(15,2) e rejeita <= 0', () => {
    expect(normalizeFaturamentoBruto(150000)).toBe('150000.00');
    expect(normalizeFaturamentoBruto('150000.5')).toBe('150000.50');
    expect(normalizeFaturamentoBruto(1234.567)).toBe('1234.57');
    expect(() => normalizeFaturamentoBruto(0)).toThrow(TRPCError);
    expect(() => normalizeFaturamentoBruto(-1)).toThrow(TRPCError);
  });

  it('enumerateJanelaMeses gera N meses cronologicamente crescentes', () => {
    const now = new Date(Date.UTC(2026, 6, 15));
    const meses = enumerateJanelaMeses(now, 3);
    expect(meses).toEqual(['2026-05', '2026-06', '2026-07']);
    const meses12 = enumerateJanelaMeses(now, 12);
    expect(meses12[0]).toBe('2025-08');
    expect(meses12[11]).toBe('2026-07');
  });
});

// ============================================================
// 1) saveFaturamento — sucesso (Bruno, RF employee, RF cLevel)
// ============================================================

describe('revenue.saveFaturamento — sucesso', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_SUCCESS);
  });

  it('Bruno cria linha nova; created=true, valor normalizado decimal(15,2)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-07',
      faturamentoBruto: 150000.5,
    })) as SaveFaturamentoResult;
    expect(res.created).toBe(true);
    expect(res.faturamentoBruto).toBe('150000.50');

    const [row] = await client.db
      .select()
      .from(companyMonthlyData)
      .where(
        and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, '2026-07')),
      );
    expect(row!.faturamentoBruto).toBe('150000.50');
  });

  it('Bruno atualiza linha existente via UPSERT; created=false', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-07',
      faturamentoBruto: '200000.00',
    })) as SaveFaturamentoResult;
    expect(res.created).toBe(false);
    expect(res.faturamentoBruto).toBe('200000.00');
  });

  it('empresa inexistente = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.saveFaturamento({
        companyId: 999_999_777,
        mes: '2026-07',
        faturamentoBruto: 100,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_COMPANY_NAO_ENCONTRADA_REV,
    });
  });

  it('faturamento invalido (<=0) = BAD_REQUEST literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.saveFaturamento({
        companyId,
        mes: '2026-07',
        faturamentoBruto: 0,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_FATURAMENTO_INVALIDO });
  });
});

// ============================================================
// 2) saveFaturamento — guards RF (nao-Bruno) e cross-company
// ============================================================

describe('revenue.saveFaturamento — guards RF', () => {
  let companyId: number;
  let rfEmp: number;
  let semRfEmp: number;
  let rfCl: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS_RF);
    rfEmp = await createFixtureEmp(companyId, { isRH: true, isResponsavelFinanceiro: true });
    semRfEmp = await createFixtureEmp(companyId, { isRH: true });
    rfCl = await createFixtureCLevel(companyId, true);
  });

  it('RF employee grava com sucesso', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rfEmp, companyId);
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-06',
      faturamentoBruto: 90000,
    })) as SaveFaturamentoResult;
    expect(res.faturamentoBruto).toBe('90000.00');
  });

  it('RF cLevel grava com sucesso (enum canonico role=clevel)', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('clevel', rfCl, companyId);
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-05',
      faturamentoBruto: 85000,
    })) as SaveFaturamentoResult;
    expect(res.faturamentoBruto).toBe('85000.00');
  });

  it('non-RF employee = FORBIDDEN literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', semRfEmp, companyId);
    const caller = factory(ctx(t));
    await expect(
      caller.saveFaturamento({
        companyId,
        mes: '2026-04',
        faturamentoBruto: 70000,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_SAVE_FATURAMENTO_NAO_RF,
    });
  });
});

// ============================================================
// 3) saveFaturamento — pre-condicao mes fechado
// ============================================================

describe('revenue.saveFaturamento — pre-condicao mes fechado', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_MES_FECHADO);
  });

  it('mes fechado = CONFLICT literal', async () => {
    await setMesFechado(companyId, '2026-06');
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.saveFaturamento({
        companyId,
        mes: '2026-06',
        faturamentoBruto: 100000,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_FECHADO_REV });
  });

  it('mes aberto (linha ausente) permite grava', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-08',
      faturamentoBruto: 120000,
    })) as SaveFaturamentoResult;
    expect(res.created).toBe(true);
  });

  it('mes desbloqueado permite grava', async () => {
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: '2026-09',
      status: 'desbloqueado',
    });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.saveFaturamento({
      companyId,
      mes: '2026-09',
      faturamentoBruto: 130000,
    })) as SaveFaturamentoResult;
    expect(res.created).toBe(true);
  });

  it('getFaturamento retorna dado gravado e linhaExiste=false quando ausente', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res1 = (await caller.getFaturamento({
      companyId,
      mes: '2026-08',
    })) as GetFaturamentoResult;
    expect(res1.linhaExiste).toBe(true);
    expect(res1.faturamentoBruto).toBe('120000.00');
    const res2 = (await caller.getFaturamento({
      companyId,
      mes: '2020-01',
    })) as GetFaturamentoResult;
    expect(res2.linhaExiste).toBe(false);
    expect(res2.faturamentoBruto).toBeNull();
  });
});

// ============================================================
// 4) getCardResumoPendente — §5.12
// ============================================================

describe('revenue.getCardResumoPendente — §5.12', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RESUMO_PENDENTE);
  });

  it('empresa sem lancamentos: janela de 12 meses toda pendente (now determinstico)', async () => {
    const nowFixed = () => new Date(Date.UTC(2026, 6, 15));
    const { factory, ctx } = bindRouter(nowFixed);
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.getCardResumoPendente({
      companyId,
    })) as GetCardResumoPendenteResult;
    expect(res.count).toBe(12);
    expect(res.mesesPendentes[0]).toBe('2025-08');
    expect(res.mesesPendentes[11]).toBe('2026-07');
  });

  it('empresa com 3 meses gravados: 9 pendentes (janela ainda com 12)', async () => {
    // Insere 3 meses ANTES da janela (nao interfere)
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2025-01',
      faturamentoBruto: '10000.00',
    });
    // Insere 3 meses DENTRO da janela
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2025-08',
      faturamentoBruto: '20000.00',
    });
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2025-09',
      faturamentoBruto: '30000.00',
    });
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2026-07',
      faturamentoBruto: '40000.00',
    });

    const nowFixed = () => new Date(Date.UTC(2026, 6, 15));
    const { factory, ctx } = bindRouter(nowFixed);
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.getCardResumoPendente({
      companyId,
    })) as GetCardResumoPendenteResult;
    expect(res.count).toBe(9);
    expect(res.mesesPendentes).not.toContain('2025-08');
    expect(res.mesesPendentes).not.toContain('2025-09');
    expect(res.mesesPendentes).not.toContain('2026-07');
    expect(res.mesesPendentes).toContain('2026-06');
  });

  it('nao-Bruno sem RF = FORBIDDEN literal em getCardResumoPendente', async () => {
    const semRf = await createFixtureEmp(companyId, { isRH: true });
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', semRf, companyId);
    const caller = factory(ctx(t));
    await expect(caller.getCardResumoPendente({ companyId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_SAVE_FATURAMENTO_NAO_RF,
    });
  });
});

// ============================================================
// 5) Sentinela RV-13
// ============================================================

describe('revenue — sentinela RV-13', () => {
  it('createRevenueRouter aceita deps `now` injetavel', () => {
    const fixed = new Date('2026-07-19T00:00:00Z');
    const r = createRevenueRouter({ now: () => fixed });
    expect(r).toBeDefined();
  });
});
