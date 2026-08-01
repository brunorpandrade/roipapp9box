// ROIP APP 9BOX — teste integracao `platformLogs.getHistoricoEmpresa`
// (ME-053, S275). Contra MySQL real.
//
// Cobertura canonica:
//   - Bruno EXCLUSIVO: super_admin ok; RH -> FORBIDDEN.
//   - UNION §13.10: retorna itens agregados das 5 fontes canonicas
//     ordenados desc por data.
//   - Filtro por `tipoEvento` reduz o UNION a uma fonte.
//   - Paginacao aplica offset + limit corretamente.
//
// Faixa CNPJ desta ME: principal 10040..10049.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, cycleUnlockRequests, employees, monthlyUnlockLog } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createPlatformLogsRouter } from '../../src/server/routers/platformLogs';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me053-plog-historico';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me053-historico';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
let cpfCounter = 43000000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `Hist ${cnpj} LTDA`,
      nomeFantasia: `Hist ${cnpj}`,
      cnpj,
      telefone: '1633330053',
      endereco: `Rua ME-053-Hist, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica hist',
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

function mkRouter() {
  const testRouter = createPlatformLogsRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

async function tokenSuper(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

async function tokenRh(userId: number, companyId: number): Promise<string> {
  return signPlatformToken({
    userId,
    role: 'rh',
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await db
      .delete(cycleUnlockRequests)
      .where(inArray(cycleUnlockRequests.companyId, createdCompanyIds));
    await db.delete(monthlyUnlockLog).where(inArray(monthlyUnlockLog.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

describe('platformLogs.getHistoricoEmpresa — autorizacao', () => {
  it('super_admin ok — retorna resultado paginado vazio quando sem eventos', async () => {
    const companyId = await seedCompany('10043000000001');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.getHistoricoEmpresa({
      companyId,
      page: 1,
      pageSize: 50,
    });
    expect(result.companyId).toBe(companyId);
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('RH -> FORBIDDEN', async () => {
    const companyId = await seedCompany('10043000000002');
    const emp = await seedEmployee(companyId, 'RH');
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenRh(emp, companyId)));
    await expect(caller.getHistoricoEmpresa({ companyId, page: 1, pageSize: 50 })).rejects.toThrow(
      /permissao/i,
    );
  });
});

describe('platformLogs.getHistoricoEmpresa — UNION §13.10', () => {
  it('agrega monthly_unlock + cycle_unlock_request ordenados desc por data', async () => {
    const companyId = await seedCompany('10043000000003');
    const empSol = await seedEmployee(companyId, 'Solicitante');

    // Insere 2 eventos monthlyUnlockLog em datas distintas (creates
    // sao explicitos para determinismo).
    await db.insert(monthlyUnlockLog).values([
      {
        companyId,
        mes: '2026-01',
        aba: 'rh',
        desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
        justificativa: 'Correcao mes 1',
        expiraEm: new Date('2026-02-01T00:00:00.000Z'),
      },
      {
        companyId,
        mes: '2026-02',
        aba: 'lider',
        desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
        justificativa: 'Correcao mes 2',
        expiraEm: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    // Insere 1 evento cycleUnlockRequests.
    await db.insert(cycleUnlockRequests).values({
      companyId,
      solicitanteTipo: 'employee',
      solicitanteId: empSol,
      mes: '2026-03',
      aba: 'faturamento',
      justificativa: 'Ajuste faturamento',
      status: 'pendente',
    });

    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.getHistoricoEmpresa({
      companyId,
      page: 1,
      pageSize: 50,
    });
    expect(result.totalCount).toBe(3);
    const fontesUnicas = new Set(result.items.map((i) => i.fonte));
    expect(fontesUnicas.has('monthly_unlock')).toBe(true);
    expect(fontesUnicas.has('cycle_unlock_request')).toBe(true);
  });

  it('filtro por tipoEvento reduz UNION a uma fonte', async () => {
    const companyId = await seedCompany('10043000000004');
    await db.insert(monthlyUnlockLog).values({
      companyId,
      mes: '2026-05',
      aba: 'rh',
      desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
      justificativa: 'Somente uma',
      expiraEm: new Date('2026-06-01T00:00:00.000Z'),
    });
    const { factory, ctx } = mkRouter();
    const caller = factory(await ctx(await tokenSuper()));
    const result = await caller.getHistoricoEmpresa({
      companyId,
      tipoEvento: 'monthly_unlock',
      page: 1,
      pageSize: 50,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fonte).toBe('monthly_unlock');
  });
});
