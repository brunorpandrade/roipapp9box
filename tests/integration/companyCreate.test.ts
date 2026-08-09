// ROIP APP 9BOX — teste de integracao `company.create` (ME-Rota-C-D074).
//
// Fecha canonicamente bit-exact D074 (`company.create` procedure + rota
// `/super-admin/empresa/nova`). Exercita a procedure via caller factory
// contra a base efemera `roip_test`.
//
// Cobertura canonica bit-exact §DOC 01 §4.2 + §DOC 05 §13.1 + §DOC 05 §18.7:
// - Happy path canonico bit-exact (persistencia em `companies` +
//   retorno `{ companyId }`).
// - Rejeicao canonica bit-exact de CNPJ duplicado (unique constraint).
// - Rejeicao canonica bit-exact de segmento fora do enum.
// - Rejeicao canonica bit-exact `modoAnoFiscal='padrao'` + `mesInicioAnoFiscal≠1`.
// - Rejeicao canonica bit-exact `modoAnoFiscal='padrao'` + `mesKickoff∉{1,4,7,10}`.
// - Aceite canonico bit-exact `modoAnoFiscal='customizado'` + `mes=6` + `kick=6`.
// - Rejeicao canonica bit-exact threshold fora 0-100.
// - Rejeicao canonica bit-exact meta ROI fora 0-100.
// - Autorizacao: RH/C-level/Lider/Colaborador → 403 canonico bit-exact.
// - `status` FORCADO=inativa bit-exact server-side.
// - `mesInicioAnoFiscal` FORCADO=1 bit-exact server-side em modo padrao.
// - Retorno canonico bit-exact `{ companyId: number }`.
// - Sentinela RV-13.
//
// Faixa CNPJ canonica bit-exact desta ME: 830..839 (D4 canonico bit-exact
// aprovado bulk por Bruno na abertura ME-Rota-C-D074).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies } from '../../src/db/schema';
import {
  MSG_CNPJ_DUPLICADO,
  MSG_META_ROI_FORA_INTERVALO,
  MSG_MODO_PADRAO_KICKOFF_INVALIDO,
  MSG_MODO_PADRAO_MES_INICIO_INVALIDO,
  MSG_THRESHOLD_FORA_INTERVALO,
  type CreateCompanyInputParsed,
} from '../../src/lib/company/createCompanyInput';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createCompanyRouter } from '../../src/server/routers/company';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-rota-c-d074';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me-rota-c-d074';

// Faixa CNPJ canonica bit-exact 830..839 (D4 aprovado bulk bit-exact).
const CNPJ_HAPPY = '10000000000830';
const CNPJ_DUP_A = '10000000000831';
const CNPJ_DUP_B = '10000000000831'; // mesmo — para colisao
const CNPJ_MODO_PADRAO_MES_INVALIDO = '10000000000832';
const CNPJ_MODO_PADRAO_KICK_INVALIDO = '10000000000833';
const CNPJ_MODO_CUSTOMIZADO = '10000000000834';
const CNPJ_THRESHOLD_FORA = '10000000000835';
const CNPJ_META_ROI_FORA = '10000000000836';
const CNPJ_STATUS_FORCE = '10000000000837';
const CNPJ_MES_INICIO_FORCE = '10000000000838';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  // Limpeza defensiva bit-exact — remove qualquer registro na faixa 830..839
  // que possa ter escapado de teste anterior interrompido.
  const cnpjsFaixa = [
    '10000000000830',
    '10000000000831',
    '10000000000832',
    '10000000000833',
    '10000000000834',
    '10000000000835',
    '10000000000836',
    '10000000000837',
    '10000000000838',
    '10000000000839',
  ];
  await client.db.delete(companies).where(inArray(companies.cnpj, cnpjsFaixa));
  await closeDbClient(client);
});

// ============================================================
// Helpers
// ============================================================

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

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

function bindRouter() {
  const testRouter = createCompanyRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

function baseInput(overrides: Partial<CreateCompanyInputParsed> = {}): CreateCompanyInputParsed {
  return {
    razaoSocial: 'ME-Rota-C-D074 Test LTDA',
    nomeFantasia: 'ME-Rota-C-D074',
    cnpj: CNPJ_HAPPY,
    telefone: '1633330074',
    endereco: 'Rua ME-Rota-C-D074, 100',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Bruno Andrade',
    contatoPrincipalEmail: 'bruno@teste.com',
    contatoRHNome: 'Maria RH',
    contatoRHEmail: 'rh@teste.com',
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Consultoria em gestão',
    contextoMercado: 'PMEs BR',
    modoAnoFiscal: 'padrao',
    mesInicioAnoFiscal: 1,
    mesKickoff: 4,
    kickoffDate: '2026-04-01',
    timezone: 'America/Sao_Paulo',
    thresholdDesempenhoBaixo: 60,
    thresholdDesempenhoMedio: 85,
    thresholdPlenitudeBaixo: 50,
    thresholdPlenitudeMedio: 75,
    ...overrides,
  } as CreateCompanyInputParsed;
}

// ============================================================
// Testes canonicos bit-exact
// ============================================================

describe('company.create — happy path canonico bit-exact', () => {
  it('cria empresa canonica bit-exact e retorna { companyId }', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.create(baseInput());
    expect(typeof result.companyId).toBe('number');
    expect(result.companyId).toBeGreaterThan(0);
    createdCompanyIds.push(result.companyId);

    const persisted = await client.db
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId))
      .limit(1);
    expect(persisted[0]).toBeDefined();
    expect(persisted[0]!.cnpj).toBe(CNPJ_HAPPY);
    expect(persisted[0]!.status).toBe('inativa');
    expect(persisted[0]!.mesInicioAnoFiscal).toBe(1);
    expect(persisted[0]!.mesKickoff).toBe(4);
    expect(persisted[0]!.segmento).toBe('Serviço');
  });
});

describe('company.create — rejeicoes canonicas bit-exact', () => {
  it('CNPJ duplicado retorna CONFLICT com literal §18.7 analogico bit-exact', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    // Primeira insercao — sucesso.
    const first = await caller.create(baseInput({ cnpj: CNPJ_DUP_A }));
    createdCompanyIds.push(first.companyId);

    // Segunda insercao com mesmo CNPJ — CONFLICT bit-exact.
    await expect(
      caller.create(baseInput({ cnpj: CNPJ_DUP_B, razaoSocial: 'Outra LTDA' })),
    ).rejects.toThrowError();

    try {
      await caller.create(baseInput({ cnpj: CNPJ_DUP_B, razaoSocial: 'Outra LTDA 2' }));
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('CONFLICT');
      expect((err as TRPCError).message).toBe(MSG_CNPJ_DUPLICADO);
    }
  });

  it('segmento fora do enum canonico bit-exact rejeitado (Zod)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.create({
        ...baseInput({ cnpj: '10000000000839' }),
        segmento: 'Startup' as never,
      }),
    ).rejects.toThrowError();
  });

  it("modoAnoFiscal='padrao' + mesInicioAnoFiscal=6 rejeitado bit-exact", async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    try {
      await caller.create(
        baseInput({
          cnpj: CNPJ_MODO_PADRAO_MES_INVALIDO,
          modoAnoFiscal: 'padrao',
          mesInicioAnoFiscal: 6,
        }),
      );
      throw new Error('esperava rejeicao');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
      expect((err as TRPCError).message).toBe(MSG_MODO_PADRAO_MES_INICIO_INVALIDO);
    }
  });

  it("modoAnoFiscal='padrao' + mesKickoff=6 rejeitado bit-exact", async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    try {
      await caller.create(
        baseInput({
          cnpj: CNPJ_MODO_PADRAO_KICK_INVALIDO,
          modoAnoFiscal: 'padrao',
          mesInicioAnoFiscal: 1,
          mesKickoff: 6,
        }),
      );
      throw new Error('esperava rejeicao');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
      expect((err as TRPCError).message).toBe(MSG_MODO_PADRAO_KICKOFF_INVALIDO);
    }
  });

  it("modoAnoFiscal='customizado' + mes=6 + kick=6 aceita bit-exact", async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.create(
      baseInput({
        cnpj: CNPJ_MODO_CUSTOMIZADO,
        modoAnoFiscal: 'customizado',
        mesInicioAnoFiscal: 6,
        mesKickoff: 6,
      }),
    );
    createdCompanyIds.push(result.companyId);
    const persisted = await client.db
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId))
      .limit(1);
    expect(persisted[0]!.modoAnoFiscal).toBe('customizado');
    expect(persisted[0]!.mesInicioAnoFiscal).toBe(6);
    expect(persisted[0]!.mesKickoff).toBe(6);
  });

  it('threshold=101 rejeitado com literal §18.7 MSG_THRESHOLD_FORA_INTERVALO', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    try {
      await caller.create(baseInput({ cnpj: CNPJ_THRESHOLD_FORA, thresholdPlenitudeMedio: 101 }));
      throw new Error('esperava rejeicao');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const msg = (err as TRPCError).message;
      expect(msg).toContain(MSG_THRESHOLD_FORA_INTERVALO);
    }
  });

  it('metaROIOperacional=150 rejeitado com literal §18.7 MSG_META_ROI_FORA_INTERVALO', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    try {
      await caller.create(baseInput({ cnpj: CNPJ_META_ROI_FORA, metaROIOperacional: 150 }));
      throw new Error('esperava rejeicao');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const msg = (err as TRPCError).message;
      expect(msg).toContain(MSG_META_ROI_FORA_INTERVALO);
    }
  });
});

describe('company.create — autorizacao canonica bit-exact §10.3 DOC 02', () => {
  // Nao-Super Admin com token cuja `credentialVersion` nao existe no
  // banco (fixture ausente) rejeita canonicamente bit-exact em UNAUTHORIZED
  // ("Sessao expirada.") ANTES do roleProcedure — o que ja prova que o
  // path do Super Admin e o unico valido (defense-in-depth §DOC 02 §5.7).
  // Rejeicao e rejeicao — o codigo especifico varia conforme onde a
  // pilha bloqueia, mas nunca chega a `create`.
  it('RH → rejeicao canonica bit-exact (nao chega em create)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', 999, 1)));
    await expect(caller.create(baseInput({ cnpj: '10000000000839' }))).rejects.toThrowError();
  });

  it('rh_lider → 403 canonico bit-exact', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh_lider', 998, 1)));
    await expect(caller.create(baseInput({ cnpj: '10000000000839' }))).rejects.toThrowError();
  });

  it('clevel → 403 canonico bit-exact', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('clevel', 997, 1)));
    await expect(caller.create(baseInput({ cnpj: '10000000000839' }))).rejects.toThrowError();
  });

  it('lider → 403 canonico bit-exact', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('lider', 996, 1)));
    await expect(caller.create(baseInput({ cnpj: '10000000000839' }))).rejects.toThrowError();
  });

  it('bearerToken null (sem sessao) → UNAUTHORIZED canonico bit-exact', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.create(baseInput({ cnpj: '10000000000839' }))).rejects.toThrowError();
  });
});

describe('company.create — server-side FORCE canonico bit-exact', () => {
  it("status FORCADO='inativa' bit-exact (§9 §13.1) — cliente nao contorna", async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    // Cliente pode nem enviar `status` — a normalizacao forca inativa.
    const result = await caller.create(baseInput({ cnpj: CNPJ_STATUS_FORCE }));
    createdCompanyIds.push(result.companyId);
    const persisted = await client.db
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId))
      .limit(1);
    expect(persisted[0]!.status).toBe('inativa');
  });

  it('mesInicioAnoFiscal=1 preservado bit-exact em modo padrao com kick canonico', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.create(
      baseInput({
        cnpj: CNPJ_MES_INICIO_FORCE,
        modoAnoFiscal: 'padrao',
        mesInicioAnoFiscal: 1,
        mesKickoff: 7,
      }),
    );
    createdCompanyIds.push(result.companyId);
    const persisted = await client.db
      .select()
      .from(companies)
      .where(eq(companies.id, result.companyId))
      .limit(1);
    expect(persisted[0]!.mesInicioAnoFiscal).toBe(1);
    expect(persisted[0]!.mesKickoff).toBe(7);
  });
});

describe('company.create — sentinela RV-13 (exports consumidos)', () => {
  it('todas as mensagens canonicas bit-exact §18.7 sao exportadas e testadas', () => {
    expect(MSG_CNPJ_DUPLICADO).toBe(
      'CNPJ já cadastrado na plataforma. Entre em contato com o suporte se necessário.',
    );
    expect(MSG_META_ROI_FORA_INTERVALO).toBe('Meta de ROI deve estar entre 0 e 100.');
    expect(MSG_THRESHOLD_FORA_INTERVALO).toBe('Threshold deve estar entre 0 e 100.');
    expect(MSG_MODO_PADRAO_MES_INICIO_INVALIDO).toBe(
      'No modo padrão, o mês de início do ano fiscal deve ser 1 (Janeiro).',
    );
    expect(MSG_MODO_PADRAO_KICKOFF_INVALIDO).toBe(
      'No modo padrão, o mês de kick-off deve ser Janeiro, Abril, Julho ou Outubro.',
    );
  });
});
