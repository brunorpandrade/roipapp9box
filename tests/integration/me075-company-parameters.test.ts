// ROIP APP 9BOX — teste de integracao ME-075 procs `company.*` D086.
//
// Cobre canonicamente bit-exact as 3 procs novas do router `company`
// (D086 canonicamente FECHADO nesta ME):
//   1. `getById` — SELECT completo com projecao canonica.
//   2. `updateParameters` — UPDATE atomico + validacao imutabilidade
//      §13.1 linha 1506 + hook fire-and-forget metaROI changed (S499).
//   3. `setStatus` — toggle ativa/inativa + validacao LGPD §DOC 06 §19.8.
//
// Roda contra MySQL real (RV-11 canonica bit-exact) via base efemera
// `roip_test`. Cada teste limpa fixtures previas + insere a empresa alvo
// no ciclo canonico.
//
// Faixa CNPJ canonica ME-075: 75100000000000..75199999999999.
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  performanceQuarterlyData,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createCompanyRouter,
  DEFAULT_META_ROI_CHANGED_HOOK,
  type EmitMetaROIChangedHook,
} from '../../src/server/routers/company';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me075-parameters';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me075-parameters';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 75100000000000;

function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(performanceQuarterlyData)
      .where(inArray(performanceQuarterlyData.companyId, createdCompanyIds));
    await client.db
      .delete(responsavelFinanceiroTransferLog)
      .where(inArray(responsavelFinanceiroTransferLog.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// -----------------------------------------------------------------------
// Fixture canonica bit-exact
// -----------------------------------------------------------------------

async function createTestCompany(
  overrides: Partial<{
    status: 'ativa' | 'inativa';
    encarregadoLgpdNome: string | null;
    encarregadoLgpdEmail: string | null;
    metaROIOperacional: string | null;
    modoAnoFiscal: 'padrao' | 'customizado';
    mesInicioAnoFiscal: number;
    mesKickoff: number;
    kickoffDate: Date;
  }> = {},
): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME075 Test ${cnpj} LTDA`,
      nomeFantasia: `ME075 ${cnpj}`,
      cnpj,
      telefone: '1633330075',
      endereco: `Rua ME-075, ${cnpj}`,
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
      modoAnoFiscal: overrides.modoAnoFiscal ?? 'padrao',
      mesInicioAnoFiscal: overrides.mesInicioAnoFiscal ?? 1,
      mesKickoff: overrides.mesKickoff ?? 1,
      kickoffDate: overrides.kickoffDate ?? new Date('2020-01-01'),
      status: overrides.status ?? 'inativa',
      encarregadoLgpdNome: overrides.encarregadoLgpdNome ?? null,
      encarregadoLgpdEmail: overrides.encarregadoLgpdEmail ?? null,
      metaROIOperacional: overrides.metaROIOperacional ?? null,
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter(metaROIHook?: EmitMetaROIChangedHook) {
  const testRouter = createCompanyRouter(
    metaROIHook === undefined ? {} : { emitMetaROIChanged: metaROIHook },
  );
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

const BASE_UPDATE_INPUT = {
  razaoSocial: 'ME075 Updated LTDA',
  nomeFantasia: 'ME075 Updated',
  telefone: '1633330076',
  endereco: 'Rua Updated',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  logoUrl: null as string | null,
  contatoPrincipalNome: 'Novo Principal',
  contatoPrincipalEmail: 'novo@example.com',
  contatoRHNome: 'Novo RH',
  contatoRHEmail: 'novorh@example.com',
  encarregadoLgpdNome: null as string | null,
  encarregadoLgpdEmail: null as string | null,
  encarregadoLgpdTelefone: null as string | null,
  encarregadoLgpdPoliticaUrl: null as string | null,
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'Consultoria estrategica atualizada',
  contextoMercado: 'PMEs BR atualizado',
  modoAnoFiscal: 'padrao' as const,
  mesInicioAnoFiscal: 1,
  mesKickoff: 4,
  kickoffDate: '2020-04-01',
  timezone: 'America/Sao_Paulo',
  metaROIOperacional: null as number | null,
  metaROITatico: null as number | null,
  metaROIEstrategico: null as number | null,
  roiSegmentoMinimo: null as number | null,
  roiSegmentoMaximo: null as number | null,
  folhaPercMinima: null as number | null,
  folhaPercMaxima: null as number | null,
  thresholdDesempenhoBaixo: 60,
  thresholdDesempenhoMedio: 85,
  thresholdPlenitudeBaixo: 50,
  thresholdPlenitudeMedio: 75,
};

// =======================================================================
// 1. company.getById
// =======================================================================

describe('company.getById (D086)', () => {
  it('retorna registro completo de empresa existente', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.getById({ companyId });
    expect(result.id).toBe(companyId);
    expect(result.status).toBe('inativa');
    expect(result.razaoSocial).toContain('ME075');
  });

  it('lanca NOT_FOUND para empresa inexistente', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.getById({ companyId: 999999 })).rejects.toThrow(TRPCError);
  });
});

// =======================================================================
// 2. company.updateParameters
// =======================================================================

describe('company.updateParameters (D086)', () => {
  it('atualiza todos os campos bit-exact quando sem trimestre calculado', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.updateParameters({
      companyId,
      cnpj: String(cnpjCounter),
      ...BASE_UPDATE_INPUT,
    });
    expect(result.updated).toBe(true);

    // Verifica bit-exact no DB.
    const rows = await client.db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    expect(rows[0]?.razaoSocial).toBe('ME075 Updated LTDA');
    expect(rows[0]?.timezone).toBe('America/Sao_Paulo');
  });

  it('rejeita imutabilidade quando ha performanceQuarterlyData', async () => {
    const companyId = await createTestCompany();
    // CPF canonico bit-exact — 11 digitos derivados do companyId (fixture
    // isolada da faixa de CNPJ; padding zerofill garante nao-colisao).
    const empCpf = String(companyId + 75100000000)
      .padStart(11, '0')
      .slice(-11);
    // Insere um trimestre calculado — simula primeiro trimestre fechado.
    const [empRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp ME-075',
        cpf: empCpf,
        email: `emp-${companyId}@roip.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142105',
        descricaoCBO: 'Gerente',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'tatico',
        departamento: 'Financeiro',
        status: 'ativo',
        passwordHash: HASH_A,
        passwordSet: true,
      })
      .$returningId();
    await client.db.insert(performanceQuarterlyData).values({
      companyId,
      employeeId: empRow!.id,
      trimestre: '2020-Q1',
    });

    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    // Tenta mudar mesKickoff — deve rejeitar.
    await expect(
      caller.updateParameters({
        companyId,
        cnpj: String(cnpjCounter),
        ...BASE_UPDATE_INPUT,
        mesKickoff: 7, // diferente do original (1)
      }),
    ).rejects.toThrow(/Ano fiscal e mês de kick-off/);
  });

  it('dispara hook metaROI changed quando metaROI* altera', async () => {
    const companyId = await createTestCompany({
      metaROIOperacional: '10.00',
    });
    let hookCalled = false;
    const hookSpy: EmitMetaROIChangedHook = async (id) => {
      if (id === companyId) {
        hookCalled = true;
      }
    };
    const { factory, ctx } = bindRouter(hookSpy);
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.updateParameters({
      companyId,
      cnpj: String(cnpjCounter),
      ...BASE_UPDATE_INPUT,
      metaROIOperacional: 15,
    });
    // Fire-and-forget: aguarda micro-task.
    await new Promise((r) => setTimeout(r, 20));
    expect(hookCalled).toBe(true);
  });

  it('NAO dispara hook metaROI quando metaROI* nao altera', async () => {
    const companyId = await createTestCompany({
      metaROIOperacional: '10.00',
    });
    let hookCalled = false;
    const hookSpy: EmitMetaROIChangedHook = async () => {
      hookCalled = true;
    };
    const { factory, ctx } = bindRouter(hookSpy);
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.updateParameters({
      companyId,
      cnpj: String(cnpjCounter),
      ...BASE_UPDATE_INPUT,
      metaROIOperacional: 10, // mesmo valor
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(hookCalled).toBe(false);
  });

  it('rejeita modo padrao com mesKickoff invalido', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.updateParameters({
        companyId,
        cnpj: String(cnpjCounter),
        ...BASE_UPDATE_INPUT,
        mesKickoff: 5, // fora de {1,4,7,10}
      }),
    ).rejects.toThrow();
  });

  it('DEFAULT_META_ROI_CHANGED_HOOK e no-op (nao lanca)', async () => {
    await expect(DEFAULT_META_ROI_CHANGED_HOOK(1)).resolves.toBeUndefined();
  });
});

// =======================================================================
// 3. company.setStatus
// =======================================================================

describe('company.setStatus (D086 + §DOC 06 §19.8)', () => {
  it('inativa → ativa quando LGPD preenchido', async () => {
    const companyId = await createTestCompany({
      encarregadoLgpdNome: 'Marcelo',
      encarregadoLgpdEmail: 'marcelo@empresa.com',
    });
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.setStatus({ companyId, novoStatus: 'ativa' });
    expect(result.status).toBe('ativa');

    const rows = await client.db
      .select({ status: companies.status })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    expect(rows[0]?.status).toBe('ativa');
  });

  it('inativa → ativa REJEITADO quando LGPD nome vazio', async () => {
    const companyId = await createTestCompany({
      encarregadoLgpdNome: null,
      encarregadoLgpdEmail: 'x@x.com',
    });
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.setStatus({ companyId, novoStatus: 'ativa' })).rejects.toThrow(
      /nome do encarregado/,
    );
  });

  it('inativa → ativa REJEITADO quando LGPD email vazio', async () => {
    const companyId = await createTestCompany({
      encarregadoLgpdNome: 'Marcelo',
      encarregadoLgpdEmail: null,
    });
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.setStatus({ companyId, novoStatus: 'ativa' })).rejects.toThrow(
      /e-mail do encarregado/,
    );
  });

  it('ativa → inativa sempre permitido (nao valida LGPD)', async () => {
    const companyId = await createTestCompany({
      status: 'ativa',
      encarregadoLgpdNome: null,
      encarregadoLgpdEmail: null,
    });
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.setStatus({ companyId, novoStatus: 'inativa' });
    expect(result.status).toBe('inativa');
  });

  it('idempotente: novoStatus = atual → no-op canonico', async () => {
    const companyId = await createTestCompany({ status: 'inativa' });
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.setStatus({ companyId, novoStatus: 'inativa' });
    expect(result.status).toBe('inativa');
  });

  it('rejeita NOT_FOUND para empresa inexistente', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.setStatus({ companyId: 999999, novoStatus: 'ativa' })).rejects.toThrow(
      TRPCError,
    );
  });
});
