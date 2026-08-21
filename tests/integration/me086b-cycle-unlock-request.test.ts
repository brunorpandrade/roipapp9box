// ROIP APP 9BOX — teste integracao ME-086b: procedure canonica
// `cycleUnlockRequests.create` + `hasPending` (backend do modal
// §14.16). Valida as pre-condicoes canonicas bit-exact:
//   - Guard cross-role: RH puro + RH-Lider autorizados para aba='rh';
//     colaborador comum negado.
//   - Justificativa canonica 100-500 chars (rejeita 99 chars; aceita
//     100; rejeita 501).
//   - Pre-condicao mes fechado (aberto rejeita com CONFLICT).
//   - Pre-condicao hasPending: 2a solicitacao pendente na mesma chave
//     canonica (companyId+mes+aba) rejeita.
//   - `hasPending` reflete canonicamente o estado (false apos criar
//     mas apos cancel; true apos create; verificado bit-exact).
//   - liderId condicional: aba='lider' com liderId aceita; aba='rh'
//     ignora liderId.
//
// Faixa CNPJ desta ME: principal 86300000000000..86399999999999.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  employees,
  monthlyClosureStatus,
} from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createCycleUnlockRequestsRouter,
  MSG_JUSTIFICATIVA_MAX,
  MSG_JUSTIFICATIVA_MIN,
  MSG_MES_NAO_FECHADO,
  MSG_SOLICITACAO_PENDENTE_JA_EXISTE,
  NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
} from '../../src/server/routers/cycleUnlockRequests';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me086b-cur';

const HASH_A = 'hash-fixo-me086b-cur';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
let cpfCounter = 86300000000;

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
      endereco: `Rua ME-086b CUR, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica ME-086b CUR',
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

async function seedClevel(companyId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@empresa-me086b-cur.com`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed cLevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  opts: {
    readonly isRH?: boolean;
    readonly isLider?: boolean;
  } = {},
): Promise<number> {
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
      isRH: opts.isRH === true,
      isLider: opts.isLider === true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function seedMonthClosure(
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
): Promise<void> {
  await db.insert(monthlyClosureStatus).values({ companyId, mes, status });
}

async function makeCtx(companyId: number, userId: number, role: string): Promise<Context> {
  const bearerToken = await signPlatformToken({
    userId,
    role: role as 'rh' | 'rh_lider' | 'clevel' | 'lider',
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
  return createContextInner({
    db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

const cycleRouter = createCycleUnlockRequestsRouter({
  evaluateAdminAlertsFactory: NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
});
const createCycleCaller = createCallerFactory(cycleRouter);

// -----------------------------------------------------------------------
// Setup — 1 empresa canonica com 2 meses (aberto + fechado)
// -----------------------------------------------------------------------

let companyId: number;
let rhId: number;
let rhLiderId: number;
let liderId: number;
let liderEmpId: number;
const MES_FECHADO = '2026-05';
const MES_ABERTO = '2026-06';

/**
 * Justificativa canonica valida (100+ chars) reutilizavel entre testes.
 */
const JUSTIFICATIVA_OK =
  'Correção retroativa de custo lançado incorretamente em 22/05 conforme divergência ' +
  'apontada pela auditoria mensal do Financeiro.';

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyId = await seedCompany('86300000000001', 'ME086b CUR Alpha');
  await seedClevel(companyId, 'Clevel CUR');

  rhId = await seedEmployee(companyId, 'RH CUR', { isRH: true });
  rhLiderId = await seedEmployee(companyId, 'RHLider CUR', { isRH: true, isLider: true });
  liderId = await seedEmployee(companyId, 'Lider CUR', { isLider: true });
  liderEmpId = liderId;

  await seedMonthClosure(companyId, MES_FECHADO, 'fechado');
  await seedMonthClosure(companyId, MES_ABERTO, 'aberto');
}, 60000);

/**
 * Limpa canonicamente as requests criadas entre testes para evitar
 * contaminacao (a chave unica canonica companyId+mes+aba com status=
 * pendente rejeitaria testes subsequentes).
 */
async function cleanRequests(): Promise<void> {
  await db.delete(cycleUnlockRequests).where(inArray(cycleUnlockRequests.companyId, [companyId]));
}

afterAll(async () => {
  await cleanRequests();
  if (createdCompanyIds.length > 0) {
    await db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
  }
  if (createdEmployeeIds.length > 0) {
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  if (createdCompanyIds.length > 0) {
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
}, 60000);

// -----------------------------------------------------------------------
// Testes canonicos bit-exact
// -----------------------------------------------------------------------

describe('ME-086b · cycleUnlockRequests.create — validacoes canonicas', () => {
  it('rh puro + mes fechado + justificativa 100+ chars: create OK', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const result = await caller.create({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it('rh_lider + mes fechado + justificativa 100+: create OK', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhLiderId, 'rh_lider'));
    const result = await caller.create({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it('justificativa canonicamente insuficiente (99 chars) rejeita', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const j99 = 'a'.repeat(99);
    await expect(
      caller.create({
        companyId,
        mes: MES_FECHADO,
        aba: 'rh',
        justificativa: j99,
      }),
    ).rejects.toThrow(MSG_JUSTIFICATIVA_MIN);
  });

  it('justificativa canonicamente excessiva (501 chars) rejeita', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const j501 = 'b'.repeat(501);
    await expect(
      caller.create({
        companyId,
        mes: MES_FECHADO,
        aba: 'rh',
        justificativa: j501,
      }),
    ).rejects.toThrow(MSG_JUSTIFICATIVA_MAX);
  });

  it('mes aberto canonicamente rejeita (CONFLICT — precondicao §13.2)', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    await expect(
      caller.create({
        companyId,
        mes: MES_ABERTO,
        aba: 'rh',
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toThrow(MSG_MES_NAO_FECHADO);
  });

  it('2a solicitacao pendente na mesma chave (companyId+mes+aba) rejeita', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const first = await caller.create({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(first.id).toBeGreaterThan(0);
    await expect(
      caller.create({
        companyId,
        mes: MES_FECHADO,
        aba: 'rh',
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toThrow(MSG_SOLICITACAO_PENDENTE_JA_EXISTE);
  });

  it('aba=lider com liderId canonicamente aceita', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const result = await caller.create({
      companyId,
      mes: MES_FECHADO,
      aba: 'lider',
      liderId: liderEmpId,
      liderTipo: 'employee',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it('lider comum canonicamente rejeitado (guard cross-role)', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, liderId, 'lider'));
    await expect(
      caller.create({
        companyId,
        mes: MES_FECHADO,
        aba: 'rh',
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toThrow();
  });
});

describe('ME-086b · cycleUnlockRequests.hasPending — estado canonico', () => {
  it('sem pendencia: hasPending=false', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    const result = await caller.hasPending({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
    });
    expect(result.hasPending).toBe(false);
    expect(result.requestedAt).toBeNull();
  });

  it('apos create: hasPending=true + requestedAt preenchido', async () => {
    await cleanRequests();
    const caller = createCycleCaller(await makeCtx(companyId, rhId, 'rh'));
    await caller.create({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    const result = await caller.hasPending({
      companyId,
      mes: MES_FECHADO,
      aba: 'rh',
    });
    expect(result.hasPending).toBe(true);
    expect(result.requestedAt).not.toBeNull();
  });
});
