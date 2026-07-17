// ROIP APP 9BOX — teste de integracao do sub-router `monthlyClosure` (ME-037).
//
// Exercita as 4 procedures canonicas do sub-dominio (DOC 03 §3.11 +
// §4.1..§4.5) contra MySQL real via `createCallerFactory`. Cobre:
//   - Contratos publicos exportados (RV-13): mensagens literais,
//     schemas Zod, constantes, tipos, factory.
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `getClosureStatus` — 3 estados (aberto implicito, fechado,
//     desbloqueado), `ultimoDesbloqueio` resumo, `expiraEm` so quando
//     desbloqueado, guard cruzado companyId.
//   - `unlockMonth` — success (transacao atomica: log + status), 409
//     mes ja desbloqueado (msg canonica §4.4 passo 2), 409 mes nao
//     fechado, justificativa 100-500, aba/liderId/liderTipo,
//     `unlockRequestId=NULL` (origem direta), `houveAlteracao=false`,
//     `expiraEm=now+24h`, exclusivo super_admin.
//   - `closeMonthScheduled` — delega ao hook `runDailyClosureJob`
//     injetado (S084/S085); exclusivo super_admin.
//   - `triggerMonthlyProcessing` — delega ao hook `processClosedMonth`
//     injetado (isolamento) E com motor real (integracao ponta-a-ponta
//     sobre mes fechado); exclusivo super_admin.
//
// Padrao S009 estendido (S076): uma company local por describe, CNPJ
// unico da faixa 10000000000710..7XX. L32 cleanup em afterAll (todas as
// tabelas com FK compartilhada + fixture global superAdmins id=1
// preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employees,
  monthlyClosureStatus,
  monthlyUnlockLog,
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
  ABA_UNLOCK_SCHEMA_CLOSURE,
  type ClosureStatusResult,
  createMonthlyClosureRouter,
  JUSTIFICATIVA_SCHEMA_CLOSURE,
  LIDER_TIPO_SCHEMA_CLOSURE,
  MES_INPUT_SCHEMA_CLOSURE,
  type MonthlyClosureRouterDeps,
  MSG_MES_JA_DESBLOQUEADO,
  MSG_MES_NAO_FECHADO,
  STATUS_MES_CLOSURE_VALUES,
  type UnlockMonthResult,
  UNLOCK_WINDOW_HOURS,
} from '../../src/server/routers/monthlyClosure';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me037-monthlyClosure';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me037-closure';

// CNPJs canonicos por describe (S076 — faixa 710..).
const CNPJ_GUARDS = '10000000000710';
const CNPJ_GUARDS_OTHER = '10000000000717';
const CNPJ_GET_STATUS = '10000000000711';
const CNPJ_UNLOCK = '10000000000712';
const CNPJ_UNLOCK_CONFLICT = '10000000000713';
const CNPJ_SCHEDULED = '10000000000714';
const CNPJ_TRIGGER = '10000000000715';
const CNPJ_TRIGGER_REAL = '10000000000716';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
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
    await client.db
      .delete(monthlyUnlockLog)
      .where(inArray(monthlyUnlockLog.companyId, createdCompanyIds));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
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
      razaoSocial: `ME037 Test ${cnpj} LTDA`,
      nomeFantasia: `ME037 Test ${cnpj}`,
      cnpj,
      telefone: '1633330037',
      endereco: `Rua ME-037, ${cnpj}`,
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

let cpfCounter = 37000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: { isLider?: boolean; isRH?: boolean } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME037',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function seedClosureStatus(
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
  dataFechamento: Date | null = null,
): Promise<void> {
  await client.db.insert(monthlyClosureStatus).values({
    companyId,
    mes,
    status,
    dataFechamento,
  });
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

function bindRouter(deps: MonthlyClosureRouterDeps = {}) {
  const testRouter = createMonthlyClosureRouter(deps);
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

describe('monthlyClosure — contratos publicos exportados', () => {
  it('mensagens literais canonicas batem o texto exato', () => {
    const esperadoJaDesbloqueado =
      'Este mês já está desbloqueado. Aguarde o fim da janela atual ' +
      'antes de aprovar nova solicitação.';
    expect(MSG_MES_JA_DESBLOQUEADO).toBe(esperadoJaDesbloqueado);
    expect(MSG_MES_NAO_FECHADO).toBe(
      'Apenas um mês fechado pode ser desbloqueado. Este mês não está fechado.',
    );
  });

  it('janela canonica de desbloqueio e 24 horas', () => {
    expect(UNLOCK_WINDOW_HOURS).toBe(24);
  });

  it('enum de status do mes bate o canonico §4.1', () => {
    expect([...STATUS_MES_CLOSURE_VALUES]).toEqual(['aberto', 'fechado', 'desbloqueado']);
  });

  it('schema de mes aceita YYYY-MM canonico e rejeita malformados', () => {
    expect(MES_INPUT_SCHEMA_CLOSURE.safeParse('2024-01').success).toBe(true);
    expect(MES_INPUT_SCHEMA_CLOSURE.safeParse('2024-12').success).toBe(true);
    expect(MES_INPUT_SCHEMA_CLOSURE.safeParse('2024-13').success).toBe(false);
    expect(MES_INPUT_SCHEMA_CLOSURE.safeParse('2024-00').success).toBe(false);
    expect(MES_INPUT_SCHEMA_CLOSURE.safeParse('24-01').success).toBe(false);
  });

  it('schema de aba bate as 3 abas canonicas', () => {
    expect(ABA_UNLOCK_SCHEMA_CLOSURE.safeParse('rh').success).toBe(true);
    expect(ABA_UNLOCK_SCHEMA_CLOSURE.safeParse('lider').success).toBe(true);
    expect(ABA_UNLOCK_SCHEMA_CLOSURE.safeParse('faturamento').success).toBe(true);
    expect(ABA_UNLOCK_SCHEMA_CLOSURE.safeParse('outra').success).toBe(false);
  });

  it('schema de liderTipo bate os 2 tipos canonicos', () => {
    expect(LIDER_TIPO_SCHEMA_CLOSURE.safeParse('employee').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLOSURE.safeParse('clevel').success).toBe(true);
    expect(LIDER_TIPO_SCHEMA_CLOSURE.safeParse('outro').success).toBe(false);
  });

  it('schema de justificativa impoe o padrao 100-500 (§2)', () => {
    expect(JUSTIFICATIVA_SCHEMA_CLOSURE.safeParse('x'.repeat(99)).success).toBe(false);
    expect(JUSTIFICATIVA_SCHEMA_CLOSURE.safeParse('x'.repeat(100)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_CLOSURE.safeParse('x'.repeat(500)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_CLOSURE.safeParse('x'.repeat(501)).success).toBe(false);
  });
});

// ============================================================
// 1) Autorizacao
// ============================================================

describe('monthlyClosure — autorizacao canonica', () => {
  let companyId: number;
  let otherCompanyId: number;
  let empRH: number;
  let empRHOther: number;
  let empRHLider: number;
  const MES = '2024-03';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    otherCompanyId = await createCompany(CNPJ_GUARDS_OTHER);
    await seedClosureStatus(companyId, MES, 'fechado', new Date('2024-04-11T00:00:00Z'));
    empRH = await createEmployee(companyId, { isRH: true });
    empRHLider = await createEmployee(companyId, { isRH: true, isLider: true });
    empRHOther = await createEmployee(otherCompanyId, { isRH: true });
  });

  it('getClosureStatus: sem token -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.getClosureStatus({ companyId, mes: MES })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('getClosureStatus: RH de outra empresa -> FORBIDDEN (guard cruzado §2.4)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', empRHOther, otherCompanyId);
    const caller = factory(ctx(token));
    await expect(caller.getClosureStatus({ companyId, mes: MES })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('getClosureStatus: RH da propria empresa atravessa', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    const res = await caller.getClosureStatus({ companyId, mes: MES });
    expect(res.status).toBe('fechado');
  });

  it('unlockMonth: RH (nao super_admin) -> FORBIDDEN (exclusivo Bruno S086)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.unlockMonth({
        companyId,
        mes: MES,
        aba: 'rh',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('closeMonthScheduled: rh (nao super_admin) -> FORBIDDEN (interna S085)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    await expect(caller.closeMonthScheduled({ companyId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('triggerMonthlyProcessing: rh_lider -> FORBIDDEN (interna, so super_admin S085)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh_lider', empRHLider, companyId);
    const caller = factory(ctx(token));
    await expect(caller.triggerMonthlyProcessing({ companyId, mes: MES })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ============================================================
// 2) getClosureStatus
// ============================================================

describe('monthlyClosure — getClosureStatus', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GET_STATUS);
  });

  it('mes sem linha -> status aberto implicito, campos nulos', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res: ClosureStatusResult = await caller.getClosureStatus({
      companyId,
      mes: '2024-01',
    });
    expect(res.status).toBe('aberto');
    expect(res.dataFechamento).toBeNull();
    expect(res.expiraEm).toBeNull();
    expect(res.ultimoDesbloqueio).toBeNull();
  });

  it('mes fechado -> status fechado, dataFechamento presente, sem expiraEm', async () => {
    const fechamento = new Date('2024-03-11T00:00:00Z');
    await seedClosureStatus(companyId, '2024-02', 'fechado', fechamento);
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getClosureStatus({ companyId, mes: '2024-02' });
    expect(res.status).toBe('fechado');
    expect(res.dataFechamento).not.toBeNull();
    expect(res.expiraEm).toBeNull();
    expect(res.ultimoDesbloqueio).toBeNull();
  });

  it('mes desbloqueado -> expiraEm presente e ultimoDesbloqueio resumido', async () => {
    const mes = '2024-05';
    await seedClosureStatus(companyId, mes, 'desbloqueado');
    const now = new Date('2024-06-15T10:00:00Z');
    const expira = new Date(now.getTime() + UNLOCK_WINDOW_HOURS * 60 * 60 * 1000);
    await client.db.insert(monthlyUnlockLog).values({
      companyId,
      mes,
      aba: 'lider',
      liderId: 4242,
      liderTipo: 'employee',
      desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
      justificativa: 'j'.repeat(130),
      desbloqueadoEm: now,
      expiraEm: expira,
      houveAlteracao: false,
      unlockRequestId: null,
    });
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getClosureStatus({ companyId, mes });
    expect(res.status).toBe('desbloqueado');
    expect(res.expiraEm).not.toBeNull();
    expect(res.ultimoDesbloqueio).not.toBeNull();
    expect(res.ultimoDesbloqueio!.aba).toBe('lider');
    expect(res.ultimoDesbloqueio!.liderId).toBe(4242);
    expect(res.ultimoDesbloqueio!.desbloqueadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(res.ultimoDesbloqueio!.houveAlteracao).toBe(false);
  });
});

// ============================================================
// 3) unlockMonth — sucesso e transacao atomica
// ============================================================

describe('monthlyClosure — unlockMonth (sucesso)', () => {
  let companyId: number;
  const MES = '2024-07';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UNLOCK);
    await seedClosureStatus(companyId, MES, 'fechado', new Date('2024-08-11T00:00:00Z'));
  });

  it('desbloqueia mes fechado: status vira desbloqueado + log criado', async () => {
    const now = new Date('2024-08-20T09:00:00Z');
    const { factory, ctx } = bindRouter({ now: () => now });
    const caller = factory(ctx(await tokenSuperAdmin()));

    const res: UnlockMonthResult = await caller.unlockMonth({
      companyId,
      mes: MES,
      aba: 'rh',
      justificativa:
        'Correção substantiva de custo lançado a maior no fechamento — ' +
        'auditoria interna solicitou ajuste imediato do mês encerrado.',
    });

    expect(res.status).toBe('desbloqueado');
    expect(res.unlockLogId).toBeGreaterThan(0);

    // expiraEm = now + 24h.
    const esperado = new Date(now.getTime() + UNLOCK_WINDOW_HOURS * 60 * 60 * 1000);
    expect(res.expiraEm.getTime()).toBe(esperado.getTime());

    // Status efetivamente transicionado.
    const [statusRow] = await client.db
      .select()
      .from(monthlyClosureStatus)
      .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, MES)))
      .limit(1);
    expect(statusRow!.status).toBe('desbloqueado');

    // Log com origem direta: unlockRequestId NULL, houveAlteracao false.
    const [logRow] = await client.db
      .select()
      .from(monthlyUnlockLog)
      .where(eq(monthlyUnlockLog.id, res.unlockLogId))
      .limit(1);
    expect(logRow!.unlockRequestId).toBeNull();
    expect(logRow!.houveAlteracao).toBe(false);
    expect(logRow!.aba).toBe('rh');
    expect(logRow!.desbloqueadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
  });

  it('desbloqueio aba lider carrega liderId e liderTipo', async () => {
    const mes = '2024-09';
    await seedClosureStatus(companyId, mes, 'fechado', new Date('2024-10-11T00:00:00Z'));
    const { factory, ctx } = bindRouter({ now: () => new Date('2024-10-15T08:00:00Z') });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.unlockMonth({
      companyId,
      mes,
      aba: 'lider',
      liderId: 7,
      liderTipo: 'clevel',
      justificativa:
        'Líder informou lançamento equivocado de demanda em variável de ' +
        'liderado direto; reabrindo para correção pontual da equipe.',
    });
    const [logRow] = await client.db
      .select()
      .from(monthlyUnlockLog)
      .where(eq(monthlyUnlockLog.id, res.unlockLogId))
      .limit(1);
    expect(logRow!.liderId).toBe(7);
    expect(logRow!.liderTipo).toBe('clevel');
  });

  it('justificativa com 99 caracteres -> BAD_REQUEST (padrao 100-500)', async () => {
    const mes = '2024-11';
    await seedClosureStatus(companyId, mes, 'fechado', new Date('2024-12-11T00:00:00Z'));
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.unlockMonth({ companyId, mes, aba: 'rh', justificativa: 'x'.repeat(99) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 4) unlockMonth — conflitos de estado
// ============================================================

describe('monthlyClosure — unlockMonth (conflitos)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UNLOCK_CONFLICT);
  });

  it('mes aberto (sem linha) -> CONFLICT com msg canonica nao-fechado', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.unlockMonth({
        companyId,
        mes: '2024-01',
        aba: 'rh',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
  });

  it('mes aberto explicito -> CONFLICT nao-fechado', async () => {
    const mes = '2024-02';
    await seedClosureStatus(companyId, mes, 'aberto');
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.unlockMonth({ companyId, mes, aba: 'rh', justificativa: 'j'.repeat(120) }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
  });

  it('mes ja desbloqueado -> CONFLICT com msg canonica §4.4 passo 2', async () => {
    const mes = '2024-03';
    await seedClosureStatus(companyId, mes, 'fechado', new Date('2024-04-11T00:00:00Z'));
    const { factory, ctx } = bindRouter({ now: () => new Date('2024-04-20T09:00:00Z') });
    const caller = factory(ctx(await tokenSuperAdmin()));
    // Primeiro desbloqueio OK.
    await caller.unlockMonth({ companyId, mes, aba: 'rh', justificativa: 'j'.repeat(120) });
    // Segundo desbloqueio (ja desbloqueado) -> 409 canonico.
    await expect(
      caller.unlockMonth({ companyId, mes, aba: 'rh', justificativa: 'j'.repeat(120) }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_JA_DESBLOQUEADO });
  });
});

// ============================================================
// 5) closeMonthScheduled — delegacao ao motor (S084/S085)
// ============================================================

describe('monthlyClosure — closeMonthScheduled', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SCHEDULED);
  });

  it('delega ao hook runDailyClosureJob com (db, companyId, now)', async () => {
    const calls: Array<{ companyId: number; now: Date }> = [];
    const fakeResult = {
      refreshedCycleScheduleRows: 3,
      paraAtrasado: 0,
      paraFechadoInCycleSchedule: 1,
      janelasExpiradas: 0,
      mesesFechadosDia11: ['2024-05'],
    };
    const now = new Date('2024-06-11T00:00:00Z');
    const { factory, ctx } = bindRouter({
      now: () => now,
      runDailyClosureJob: async (_db, cid, n) => {
        calls.push({ companyId: cid, now: n });
        return fakeResult;
      },
    });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.closeMonthScheduled({ companyId });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.companyId).toBe(companyId);
    expect(calls[0]!.now.getTime()).toBe(now.getTime());
    expect(res.mesesFechadosDia11).toEqual(['2024-05']);
    expect(res.refreshedCycleScheduleRows).toBe(3);
  });
});

// ============================================================
// 6) triggerMonthlyProcessing — delegacao isolada + motor real
// ============================================================

describe('monthlyClosure — triggerMonthlyProcessing (isolado)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TRIGGER);
  });

  it('delega ao hook processClosedMonth com (db, companyId, mes, now)', async () => {
    const calls: Array<{ companyId: number; mes: string; now: Date }> = [];
    const now = new Date('2024-04-11T00:00:00Z');
    const { factory, ctx } = bindRouter({
      now: () => now,
      processClosedMonth: async (_db, cid, mes, n) => {
        calls.push({ companyId: cid, mes, now: n });
        return { processadoEmMarcado: true, trimestreDisparado: '2024-Q1' };
      },
    });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.triggerMonthlyProcessing({ companyId, mes: '2024-03' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.companyId).toBe(companyId);
    expect(calls[0]!.mes).toBe('2024-03');
    expect(calls[0]!.now.getTime()).toBe(now.getTime());
    expect(res.processadoEmMarcado).toBe(true);
    expect(res.trimestreDisparado).toBe('2024-Q1');
  });
});

describe('monthlyClosure — triggerMonthlyProcessing (motor real)', () => {
  let companyId: number;
  const MES = '2024-08';

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TRIGGER_REAL);
    // Mes isolado (nao-terceiro de trimestre): motor marca processadoEm
    // e NAO dispara trimestre. Precondicao minima: linha de status.
    await seedClosureStatus(companyId, MES, 'fechado', new Date('2024-09-11T00:00:00Z'));
  });

  it('motor real marca processadoEm e nao dispara trimestre em mes nao-terceiro', async () => {
    const now = new Date('2024-09-11T00:05:00Z');
    // Sem deps: usa o motor canonico ME-031 por default (S084).
    const { factory, ctx } = bindRouter({ now: () => now });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.triggerMonthlyProcessing({ companyId, mes: MES });

    expect(res.processadoEmMarcado).toBe(true);
    expect(res.trimestreDisparado).toBeNull();

    // Auditoria: processadoEm gravado no status.
    const [statusRow] = await client.db
      .select()
      .from(monthlyClosureStatus)
      .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, MES)))
      .limit(1);
    expect(statusRow!.processadoEm).not.toBeNull();
  });
});
