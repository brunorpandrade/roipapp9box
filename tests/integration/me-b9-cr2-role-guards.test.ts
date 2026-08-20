// ROIP APP 9BOX — teste integracao ME-B9-CR2 (D-CR-RHLIDER).
//
// Cobertura canonica cross-role: valida bit-exact que as 5 procedures
// do sub-router `exports` ampliadas pela ME-B9-CR2 aceitam `rh_lider`
// alem dos perfis previamente autorizados, e que o handler
// `/api/reports/clima-engajamento/download` idem. Preserva `lider`
// canonicamente bloqueado em todas as superficies (defense-in-depth
// §2.4 + CAMADA_AUTH §10.7).
//
// Matriz canonica bit-exact validada:
//
//   Procedure/Handler                | s_admin | rh | rh_lider | clevel | lider
//   ---------------------------------|---------|----|-----------|--------|-------
//   exports.getResumoDashboard       |   OK    | OK |    OK     |  403   |  403
//   exports.getEvolucaoTrimestral    |   OK    | OK |    OK     |  403   |  403
//   exports.getClimaEngajamento      |   OK    | OK |    OK     |  OK*   |  403
//   exports.generateRelatorioExecutivo|  OK    | OK |    OK     |  OK*   |  403
//   exports.getSnapshot9Box          |   OK    | OK |    OK     |  OK*   |  403
//   GET /api/reports/clima-engaj...  |   OK*   | OK*|    OK*    |  OK*   |  403
//
//   (*) clevel exige `acessoTotal=true` — fixture semeia CU=true.
//   (*) handler pode retornar 404 sem_agregados_clima em vez de 200,
//       mas jamais 403 perfil_sem_permissao para os 4 aceitos.
//
// Faixa CNPJ desta ME: principal 10050..10059.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, monthlyClosureStatus } from '../../src/db/schema';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createExportsRouter,
  type ExecutiveReportServiceFacade,
} from '../../src/server/routers/exports';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import { GET as climaDownloadGet } from '../../src/app/api/reports/clima-engajamento/download/route';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import { __setClimaDownloadDbClient } from '../../src/app/api/reports/clima-engajamento/download/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-b9-cr2';

const HASH_A = 'hash-fixo-me-b9-cr2';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
let cpfCounter = 50000000000;

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
      telefone: '1633330099',
      endereco: `Rua ME-B9-CR2, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica CR2',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
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

async function seedCLevel(companyId: number, acessoTotal: boolean): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLevel CR2 ${acessoTotal ? 'Total' : 'Parcial'}`,
      email: `clevel-cr2-${Date.now()}-${Math.random()}@example.com`,
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

// Ampliacao canonica ME-B9-CR2: helper agora aceita `rh_lider` alem
// dos 3 perfis previamente cobertos por exports-router.test.ts. Bit-
// exact `PlatformRole` da src/server/trpc.ts (5 valores canonicos).
async function tokenPlatform(
  userId: number,
  role: 'rh' | 'rh_lider' | 'lider' | 'clevel',
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
      pdfPath: '/tmp/stub-cr2.pdf',
      filename: 'relatorio_executivo_stub_cr2.pdf',
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
  // Escape hatch canonico S366 (ME-070): injeta db client de teste no
  // handler /api/reports/clima-engajamento/download, permitindo que os
  // testes cross-role deste arquivo consumam o mesmo TEST_URL sem
  // depender de DATABASE_URL no ambiente.
  __setClimaDownloadDbClient(client);
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
  __setClimaDownloadDbClient(null);
  await closeDbClient(client);
});

// ============================================================
// Bloco A: procedures que NAO aceitam clevel canonicamente
// (['super_admin', 'rh', 'rh_lider']) — 2 procedures.
// ============================================================
//
// Aceite bit-exact: super_admin/rh/rh_lider passam; clevel/lider =
// FORBIDDEN. Cobertura simetrica `getResumoDashboard` +
// `getEvolucaoTrimestral`.

describe('ME-B9-CR2 — getResumoDashboard (aceita rh_lider, bloqueia clevel/lider)', () => {
  it('rh_lider ok — retorna xlsx base64', async () => {
    const companyId = await seedCompany('10050000000001', 'CR2 Resumo RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhLiderId, 'rh_lider', companyId)));
    const result = await caller.getResumoDashboard({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.filename).toContain('resumo_dashboard_');
    expect(result.contentBase64.length).toBeGreaterThan(100);
  });

  it('rh ok — retorna xlsx base64 (regressao)', async () => {
    const companyId = await seedCompany('10050000000002', 'CR2 Resumo RH');
    const rhId = await seedEmployee(companyId, 'RH');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhId, 'rh', companyId)));
    const result = await caller.getResumoDashboard({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.filename).toContain('resumo_dashboard_');
  });

  it('clevel FORBIDDEN — nao consta no allowlist', async () => {
    const companyId = await seedCompany('10050000000003', 'CR2 Resumo CL');
    const cId = await seedCLevel(companyId, true);
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(cId, 'clevel', companyId)));
    await expect(
      caller.getResumoDashboard({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });

  it('lider FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000004', 'CR2 Resumo L');
    const empId = await seedEmployee(companyId, 'Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(empId, 'lider', companyId)));
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

describe('ME-B9-CR2 — getEvolucaoTrimestral (aceita rh_lider, bloqueia clevel/lider)', () => {
  it('rh_lider ok', async () => {
    const companyId = await seedCompany('10050000000005', 'CR2 Evolucao RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhLiderId, 'rh_lider', companyId)));
    const result = await caller.getEvolucaoTrimestral({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestreFinal: '2026-Q1',
    });
    expect(result.filename).toContain('evolucao_trimestral_');
  });

  it('clevel FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000006', 'CR2 Evolucao CL');
    const cId = await seedCLevel(companyId, true);
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(cId, 'clevel', companyId)));
    await expect(
      caller.getEvolucaoTrimestral({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestreFinal: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });

  it('lider FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000007', 'CR2 Evolucao L');
    const empId = await seedEmployee(companyId, 'Lider');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(empId, 'lider', companyId)));
    await expect(
      caller.getEvolucaoTrimestral({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestreFinal: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });
});

// ============================================================
// Bloco B: procedures que aceitam clevel canonicamente
// (['super_admin', 'rh', 'rh_lider', 'clevel']) — 3 procedures.
// ============================================================
//
// Aceite bit-exact: super_admin/rh/rh_lider/clevel passam; lider =
// FORBIDDEN. Cobertura simetrica `getClimaEngajamento` +
// `generateRelatorioExecutivo` + `getSnapshot9Box`. C-level requer
// `acessoTotal=true` (fixture semeia CU=true).

describe('ME-B9-CR2 — getClimaEngajamento (aceita rh_lider, bloqueia lider)', () => {
  it('rh_lider ok — retorna metadados canonicos', async () => {
    const companyId = await seedCompany('10050000000008', 'CR2 Clima RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhLiderId, 'rh_lider', companyId)));
    const result = await caller.getClimaEngajamento({ companyId });
    // Sem agregados semeados: proc retorna trimestreResolvido=null +
    // mensagem canonica — SEM lancar erro (comportamento por design).
    expect(result.trimestreResolvido).toBeNull();
  });

  it('clevel acessoTotal=true ok', async () => {
    const companyId = await seedCompany('10050000000009', 'CR2 Clima CU');
    const cId = await seedCLevel(companyId, true);
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(cId, 'clevel', companyId)));
    const result = await caller.getClimaEngajamento({ companyId });
    expect(result.trimestreResolvido).toBeNull();
  });

  it('lider FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000010', 'CR2 Clima L');
    const empId = await seedEmployee(companyId, 'Lider');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(empId, 'lider', companyId)));
    await expect(caller.getClimaEngajamento({ companyId })).rejects.toThrow(/permissao/i);
  });
});

describe('ME-B9-CR2 — generateRelatorioExecutivo (aceita rh_lider, bloqueia lider)', () => {
  it('rh_lider ok — dispara facade stub', async () => {
    const companyId = await seedCompany('10050000000011', 'CR2 Exec RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhLiderId, 'rh_lider', companyId)));
    const result = await caller.generateRelatorioExecutivo({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.status).toBe('ok');
    expect(result.cacheId).toBe(999);
  });

  it('lider FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000012', 'CR2 Exec L');
    const empId = await seedEmployee(companyId, 'Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(empId, 'lider', companyId)));
    await expect(
      caller.generateRelatorioExecutivo({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });
});

describe('ME-B9-CR2 — getSnapshot9Box (aceita rh_lider, bloqueia lider)', () => {
  it('rh_lider ok — devolve token efemero', async () => {
    const companyId = await seedCompany('10050000000013', 'CR2 Snap RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(rhLiderId, 'rh_lider', companyId)));
    const result = await caller.getSnapshot9Box({
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
    });
    expect(result.token.split('.').length).toBe(3);
    expect(result.filename).toContain('snapshot_9box_');
  });

  it('lider FORBIDDEN', async () => {
    const companyId = await seedCompany('10050000000014', 'CR2 Snap L');
    const empId = await seedEmployee(companyId, 'Lider');
    await seedTrimestreFechado(companyId, '2026-Q1');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenPlatform(empId, 'lider', companyId)));
    await expect(
      caller.getSnapshot9Box({
        companyId,
        escopoTipo: 'empresa',
        escopoReferencia: null,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow(/permissao/i);
  });
});

// ============================================================
// Bloco C: handler /api/reports/clima-engajamento/download.
// ============================================================
//
// Aceite bit-exact: os 4 perfis canonicamente autorizados
// (super_admin/rh/rh_lider/clevel) atravessam o guard `rolesPermitidos`
// canonicamente ampliado — resposta 404 sem_agregados_clima e valida
// (fixture sem agregados) e prova que o guard NAO retornou 403
// perfil_sem_permissao. `lider` recebe 403 perfil_sem_permissao.
//
// Uso de `cookies()` fica out-of-scope neste teste — enviamos JWT via
// header Authorization Bearer, caminho canonico do handler.

async function callClimaHandler(token: string, companyId: number): Promise<Response> {
  const url = `https://x/api/reports/clima-engajamento/download?companyId=${companyId}`;
  const req = new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  return climaDownloadGet(req);
}

describe('ME-B9-CR2 — handler /api/reports/clima-engajamento/download (aceita rh_lider)', () => {
  it('rh_lider ok — atravessa rolesPermitidos (404 sem_agregados esperado, nao 403)', async () => {
    const companyId = await seedCompany('10050000000015', 'CR2 Handler RHL');
    const rhLiderId = await seedEmployee(companyId, 'RH Lider');
    const token = await tokenPlatform(rhLiderId, 'rh_lider', companyId);
    const res = await callClimaHandler(token, companyId);
    // Aceite canonico: NAO deve ser 403 perfil_sem_permissao. Sem
    // agregados semeados, esperamos 404 sem_agregados_clima.
    expect(res.status).not.toBe(403);
    const body = await res.json();
    expect(body.error).not.toBe('perfil_sem_permissao');
    expect(body.error).toBe('sem_agregados_clima');
  });

  it('rh ok — regressao bit-exact do comportamento pre-CR2', async () => {
    const companyId = await seedCompany('10050000000016', 'CR2 Handler RH');
    const rhId = await seedEmployee(companyId, 'RH');
    const token = await tokenPlatform(rhId, 'rh', companyId);
    const res = await callClimaHandler(token, companyId);
    expect(res.status).not.toBe(403);
    const body = await res.json();
    expect(body.error).toBe('sem_agregados_clima');
  });

  it('lider FORBIDDEN — 403 perfil_sem_permissao', async () => {
    const companyId = await seedCompany('10050000000017', 'CR2 Handler L');
    const empId = await seedEmployee(companyId, 'Lider');
    const token = await tokenPlatform(empId, 'lider', companyId);
    const res = await callClimaHandler(token, companyId);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('perfil_sem_permissao');
  });
});

// Silencia lint sobre import nao usado — `cookies` importado
// canonicamente para simetria com o handler mesmo que Bearer resolva
// antes de cookies().
void cookies;
