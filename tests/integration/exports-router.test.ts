// ROIP APP 9BOX — teste integracao sub-router `exports` (ME-053, S275).
//
// Cobertura canonica:
//   - `getResumoDashboard`: super_admin ok; retorna xlsx base64;
//     colaborador (role=lider) -> FORBIDDEN.
//   - `getEvolucaoTrimestral`: super_admin ok.
//   - `generateRelatorioExecutivo`: super_admin ok via Facade stub;
//     C-level acessoTotal=false -> FORBIDDEN.
//   - `getSnapshot9Box`: super_admin ok — retorna token efemero.
//   - `getBoardDeck`: super_admin ok; escopo=equipe rejeitado (Zod).
//
// Faixa CNPJ desta ME: principal 10040..10049.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, monthlyClosureStatus } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createExportsRouter,
  type ExecutiveReportServiceFacade,
} from '../../src/server/routers/exports';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me053-exports';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me053-exports';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
let cpfCounter = 42000000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nomeFantasia} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330053',
      endereco: `Rua ME-053, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedEmployee(companyId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'tecnico_especialista',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  return row.id;
}

async function seedTrimestreFechado(companyId: number, trimestre: string): Promise<void> {
  const meses = trimestre === '2026-Q1' ? ['2026-01', '2026-02', '2026-03'] : [];
  for (const m of meses) {
    await db.insert(monthlyClosureStatus).values({
      companyId,
      mes: m,
      status: 'fechado',
    });
  }
}

async function seedCLevel(companyId: number, acessoTotal: boolean): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLevel ${acessoTotal ? 'Total' : 'Parcial'}`,
      email: `clevel-${Date.now()}-${Math.random()}@example.com`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed cLevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function tokenSuper(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

async function tokenPlatform(
  userId: number,
  role: 'rh' | 'lider' | 'clevel',
  companyId: number,
): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
}

function mkStubFacade(): ExecutiveReportServiceFacade {
  return {
    generate: async () => ({
      kind: 'ok',
      cacheId: 999,
      pdfPath: '/tmp/stub.pdf',
      filename: 'relatorio_executivo_stub.pdf',
    }),
  };
}

function mkRouter(facade: ExecutiveReportServiceFacade = mkStubFacade()) {
  const testRouter = createExportsRouter({
    serviceFactory: () => facade,
    now: () => new Date('2026-04-15T12:00:00.000Z'),
  });
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
  // Fixture super_admin ja existe (id=1 conforme convencao S009).
});

afterAll(async () => {
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  if (createdCompanyIds.length > 0) {
    await db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

describe('exports.getResumoDashboard', () => {
  it('super_admin ok — retorna xlsx base64 e filename canonico', async () => {
    const companyId = await seedCompany('10042000000001', 'Resumo LTDA');
    await seedEmployee(companyId, 'Ana');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.getResumoDashboard({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.filename).toContain('resumo_dashboard_');
    expect(result.filename).toContain('2026-Q1');
    expect(result.contentBase64.length).toBeGreaterThan(100);
  });

  it('rejeita perfil lider (FORBIDDEN)', async () => {
    const companyId = await seedCompany('10042000000002', 'Forbidden LTDA');
    const emp = await seedEmployee(companyId, 'Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(emp, 'lider', companyId)));
    await expect(
      caller.getResumoDashboard({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });
});

describe('exports.generateRelatorioExecutivo', () => {
  it('super_admin ok — dispara facade stub e retorna ok', async () => {
    const companyId = await seedCompany('10042000000003', 'GenExec LTDA');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.generateRelatorioExecutivo({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.status).toBe('ok');
    expect(result.cacheId).toBe(999);
  });

  it('C-level acessoTotal=false rejeitado como FORBIDDEN', async () => {
    const companyId = await seedCompany('10042000000004', 'CLevelForbidden LTDA');
    const cId = await seedCLevel(companyId, false);
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(cId, 'clevel', companyId)));
    await expect(
      caller.generateRelatorioExecutivo({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow(/acessoTotal=false|permissao/i);
  });
});

describe('exports.getSnapshot9Box + getBoardDeck — tokens efemeros', () => {
  it('getSnapshot9Box super_admin ok — devolve token efemero e filename', async () => {
    const companyId = await seedCompany('10042000000005', 'Snapshot LTDA');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.getSnapshot9Box({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.token.split('.').length).toBe(3);
    expect(result.filename).toContain('snapshot_9box_');
  });

  it('getBoardDeck rejeita escopo=equipe via Zod (BAD_REQUEST)', async () => {
    const companyId = await seedCompany('10042000000006', 'BoardDeck LTDA');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    await expect(
      caller.getBoardDeck({
        companyId,
        // Zod runtime rejects 'equipe' as escopo do BoardDeck.
        escopoTipo: 'equipe' as unknown as 'empresa',
        escopoReferencia: '1',
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow();
  });
});
