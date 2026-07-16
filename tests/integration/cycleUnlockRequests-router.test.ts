// ROIP APP 9BOX — teste de integracao do sub-router `cycleUnlockRequests`
// (ME-032).
//
// Exercita as 4 procedures canonicas do dominio "ciclos e desbloqueios"
// (DOC 03 §19.2) contra MySQL real, via `createCallerFactory`. Cobre a
// matriz canonica de autorizacao (perfil x aba x liderId x isRF), a
// transacao atomica de aprovacao (§13.5 — 6 sub-passos com SELECT FOR
// UPDATE), a transacao canonica de recusa (§13.6 — 3 sub-passos), o
// cancelamento com regra S049 (RH + solicitante + Super Admin — divergencia
// DOC 03 §4.3 vs DOC 06 §13.4 resolvida por Bruno em RV-08), o guard de
// hasPending (§13.3, D051/D052/D053) e os 3 gatilhos canonicos de alertas
// (§4.8 — capturados por callback injetado em DI).
//
// Padrao S009 estendido a Bloco B3 (uma company local por describe, CNPJ
// unico da faixa reservada 10000000000350..355). L32 cleanup em afterAll
// (todas as tabelas com FK compartilhada + fixture global superAdmins
// id=1 preservada). JWT_SECRET fixo no arquivo.
//
// Contra o baseline pre-ME-032 (9/9 PASS, 76 files / 827 tests), esta ME
// adiciona 1 test file e ~55 testes.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  employees,
  monthlyClosureStatus,
  monthlyUnlockLog,
  superAdmins,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { appRouter } from '../../src/server/routers';
import {
  createCycleUnlockRequestsRouter,
  MSG_CANCEL_JA_CANCELADA,
  MSG_CANCEL_JA_DECIDIDA,
  MSG_CANCEL_NAO_AUTORIZADO,
  MSG_CREATE_NAO_AUTORIZADO,
  MSG_DECIDE_JA_CANCELADA,
  MSG_DECIDE_JA_DECIDIDA,
  MSG_DECIDE_MES_JA_DESBLOQUEADO,
  MSG_HAS_PENDING_NAO_AUTORIZADO,
  MSG_JUSTIFICATIVA_MAX,
  MSG_JUSTIFICATIVA_MIN,
  MSG_MES_NAO_FECHADO,
  MSG_MOTIVO_RECUSA_MAX,
  MSG_MOTIVO_RECUSA_MIN,
  MSG_MOTIVO_RECUSA_OBRIGATORIO,
  MSG_SOLICITACAO_NAO_ENCONTRADA,
  MSG_SOLICITACAO_PENDENTE_JA_EXISTE,
  type EvaluateAdminUnlockAlerts,
} from '../../src/server/routers/cycleUnlockRequests';
import { createCompany } from '../../src/server/services/companies';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me032-cycleUnlockRequests';

/** Fixture global de superAdmins semeada por globalSetup — nao pode ser deletada (L32). */
const FIXTURE_SUPER_ADMIN_ID = 1;

/** Hash arbitrario fixo — pwv deriva dele. */
const HASH_A = 'hash-fixo-me032-cur';

/**
 * Relogio deterministico canonico para toda esta ME. Todos os handlers
 * usam este `now` — desbloqueado ate `expiraEm = now + 24h`, `createdAt`,
 * `decididoEm` etc. batem exatamente.
 */
const NOW_FIXED = new Date('2026-05-14T12:00:00.000Z');

/** `expiraEm` canonico apos aprovacao (§13.5 — NOW + 24h). */
const EXPIRA_FIXED = new Date('2026-05-15T12:00:00.000Z');

/** Justificativa canonica valida (>= 100 chars). §2.2 exige >= 100 apos trim(). */
const JUSTIFICATIVA_OK =
  'Preciso corrigir o custo mensal do lider que veio errado da folha de pagamento ' +
  'do mes 04-2026 aa bb cc.';

/** Motivo de recusa canonico valido (100 chars). */
const MOTIVO_RECUSA_OK =
  'Nao ha evidencia suficiente para aprovar. A solicitacao carece de ' +
  'comprovacao contabil do erro alegado a.';

/** Comentario opcional de aprovacao canonico. */
const COMENTARIO_APROVACAO_OK = 'Aprovado apos revisao contabil.';

interface CapturedAlert {
  tipo: 'desbloqueio_solicitado' | 'desbloqueio_aprovado' | 'desbloqueio_recusado';
  requestId: number;
}

/**
 * Factory de callback capturador — retorna um array reset-avel e o callback
 * a injetar. Chama-se `bindCapturingRouter()` no beforeEach para novos
 * caller/captor por-teste.
 */
function makeCapturingAlerts(): {
  captured: CapturedAlert[];
  callback: EvaluateAdminUnlockAlerts;
} {
  const captured: CapturedAlert[] = [];
  const callback: EvaluateAdminUnlockAlerts = async (tipo, requestId) => {
    captured.push({ tipo, requestId });
  };
  return { captured, callback };
}

/**
 * Bind um router de teste com callback capturador + `now` fixo. Retorna o
 * caller factory pronto e o array `captured`. Cada teste chama isso para
 * ter uma instancia limpa.
 */
function bindCapturingRouter(client: RoipDbClient) {
  const alerts = makeCapturingAlerts();
  const testRouter = createCycleUnlockRequestsRouter({
    evaluateAdminAlerts: alerts.callback,
    now: () => NOW_FIXED,
  });
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx, captured: alerts.captured };
}

/** Helper: sleep curto para permitir microtasks do fire-and-forget capturarem. */
async function drainMicrotasks(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ============================================================
// Cleanup canonico (L32) — ordem respeitando FKs
// ============================================================

async function fullCleanup(client: RoipDbClient): Promise<void> {
  await client.db.delete(monthlyUnlockLog);
  await client.db.delete(cycleUnlockRequests);
  await client.db.delete(monthlyClosureStatus);
  await client.db.delete(employees);
  await client.db.delete(cLevelMembers);
  await client.db.delete(companies);
  await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
}

// ============================================================
// Seed helpers
// ============================================================

async function seedActiveCompany(client: RoipDbClient, cnpj: string): Promise<number> {
  const companyId = await createCompany(client.db, {
    razaoSocial: `ROIP CUR ${cnpj} LTDA`,
    nomeFantasia: 'ROIP CUR',
    cnpj,
    telefone: '1633330000',
    endereco: 'Rua CUR, 1',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Principal',
    contatoPrincipalEmail: `principal@${cnpj}.test`,
    contatoRHNome: 'RH',
    contatoRHEmail: `rh@${cnpj}.test`,
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Atividade',
    contextoMercado: 'Mercado',
    mesKickoff: 1,
  });
  await client.db.update(companies).set({ status: 'ativa' });
  return companyId;
}

async function seedEmployee(
  client: RoipDbClient,
  companyId: number,
  overrides: { cpf: string; isRH?: boolean; isLider?: boolean; passwordHash?: string | null },
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Titular Employee',
      cpf: overrides.cpf,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '000000',
      descricaoCBO: 'Cargo',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      isRH: overrides.isRH ?? false,
      isLider: overrides.isLider ?? false,
      passwordHash: overrides.passwordHash ?? HASH_A,
      passwordSet: true,
    })
    .$returningId();
  if (!row) {
    throw new Error('seedEmployee: insert sem id');
  }
  return row.id;
}

async function seedCLevel(
  client: RoipDbClient,
  companyId: number,
  cpf: string,
  passwordHash: string = HASH_A,
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'Titular Clevel',
      cpf,
      email: `clevel-${cpf}@roip.test`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '10000.00',
      passwordHash,
      passwordSet: true,
    })
    .$returningId();
  if (!row) {
    throw new Error('seedCLevel: insert sem id');
  }
  return row.id;
}

async function seedSuperAdminExtra(
  client: RoipDbClient,
  email: string,
  passwordHash: string = HASH_A,
): Promise<number> {
  const [row] = await client.db
    .insert(superAdmins)
    .values({ name: 'Titular Super Admin', email, passwordHash })
    .$returningId();
  if (!row) {
    throw new Error('seedSuperAdminExtra: insert sem id');
  }
  return row.id;
}

/**
 * Semeia `monthlyClosureStatus` para (companyId, mes) com o status desejado.
 * `beforeEach` limpa a tabela; este helper reinsere a linha canonica.
 */
async function seedClosureStatus(
  client: RoipDbClient,
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
): Promise<void> {
  await client.db.insert(monthlyClosureStatus).values({
    companyId,
    mes,
    status,
    dataFechamento: status === 'fechado' ? new Date('2026-05-11T00:00:00.000Z') : null,
  });
}

// ============================================================
// Tokens de sessao — helpers por role
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

async function tokenSuperAdmin(superAdminId: number, email: string): Promise<string> {
  return signSuperAdminToken({
    superAdminId,
    credentialVersion: deriveCredentialVersion(HASH_A + email),
  });
}

// ============================================================
// Constantes de mes canonico
// ============================================================

const MES_ALVO = '2026-04';
const MES_OUTRO = '2026-03';

// ============================================================
// describe: create — DOC 03 §4.3 + DOC 06 §13.2
// ============================================================

describe('cycleUnlockRequests.create — DOC 03 §4.3 + DOC 06 §13.2', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
    companyId = await seedActiveCompany(client, '10000000000350');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
  });

  it('RH puro cria com sucesso (aba=rh) e dispara alerta desbloqueio_solicitado', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000010001', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx, captured } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    await drainMicrotasks();

    expect(result.id).toBeGreaterThan(0);
    expect(result.createdAt).toEqual(NOW_FIXED);

    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.aba).toBe('rh');
    expect(row.status).toBe('pendente');
    expect(row.solicitanteTipo).toBe('employee');
    expect(row.solicitanteId).toBe(rhId);
    expect(row.justificativa).toBe(JUSTIFICATIVA_OK);
    expect(row.liderId).toBeNull();

    expect(captured).toEqual([{ tipo: 'desbloqueio_solicitado', requestId: result.id }]);
  });

  it('RH-Lider cria com sucesso (aba=rh)', async () => {
    const rhLiderId = await seedEmployee(client, companyId, {
      cpf: '30000010002',
      isRH: true,
      isLider: true,
    });
    const token = await tokenPlatform('rh_lider', rhLiderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it('Super Admin cria em qualquer empresa (aba=rh)', async () => {
    const superAdminId = await seedSuperAdminExtra(client, 'sa-create@roip.test');
    const token = await tokenSuperAdmin(superAdminId, 'sa-create@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.solicitanteId).toBe(0);
    expect(rows[0]!.solicitanteTipo).toBe('employee');
  });

  it('RH de OUTRA empresa recebe FORBIDDEN (aba=rh)', async () => {
    const outraId = await seedActiveCompany(client, '20000000000350');
    const rhIdOutra = await seedEmployee(client, outraId, { cpf: '30000010003', isRH: true });
    const token = await tokenPlatform('rh', rhIdOutra, outraId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
  });

  it('C-level tentando criar aba=rh recebe FORBIDDEN', async () => {
    const clevelId = await seedCLevel(client, companyId, '30000010004');
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
  });

  it('Lider cria aba=lider com liderId=userId (canonico §4.3)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000010005', isLider: true });
    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'lider',
      liderId,
      liderTipo: 'employee',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.liderId).toBe(liderId);
    expect(rows[0]!.liderTipo).toBe('employee');
  });

  it('C-level cria aba=lider com liderId=userId e liderTipo=clevel', async () => {
    const clevelId = await seedCLevel(client, companyId, '30000010006');
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'lider',
      liderId: clevelId,
      liderTipo: 'clevel',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.liderTipo).toBe('clevel');
    expect(rows[0]!.solicitanteTipo).toBe('clevel');
  });

  it('RH cria aba=lider em nome do lider (canonico §4.3)', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000010007', isRH: true });
    const liderId = await seedEmployee(client, companyId, { cpf: '30000010008', isLider: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'lider',
      liderId,
      liderTipo: 'employee',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.solicitanteId).toBe(rhId);
    expect(rows[0]!.liderId).toBe(liderId);
  });

  it('Lider tentando criar aba=lider com liderId alheio → FORBIDDEN', async () => {
    const lider1 = await seedEmployee(client, companyId, { cpf: '30000010009', isLider: true });
    const lider2 = await seedEmployee(client, companyId, { cpf: '30000010010', isLider: true });
    const token = await tokenPlatform('lider', lider1, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({
        companyId,
        mes: MES_ALVO,
        aba: 'lider',
        liderId: lider2,
        liderTipo: 'employee',
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Lider tentando criar aba=lider com liderTipo=clevel (mismatch) → FORBIDDEN', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000010011', isLider: true });
    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({
        companyId,
        mes: MES_ALVO,
        aba: 'lider',
        liderId,
        liderTipo: 'clevel',
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Faturamento: qualquer perfil admin da mesma empresa cria (D058 provisório)', async () => {
    const employeeId = await seedEmployee(client, companyId, { cpf: '30000010012' });
    const token = await tokenPlatform('lider', employeeId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'faturamento',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it('Mes com status=aberto → 409 MSG_MES_NAO_FECHADO', async () => {
    // Recria closure como aberto.
    await client.db.delete(monthlyClosureStatus);
    await seedClosureStatus(client, companyId, MES_ALVO, 'aberto');

    const rhId = await seedEmployee(client, companyId, { cpf: '30000010013', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
  });

  it('Mes com status=desbloqueado → 409 MSG_MES_NAO_FECHADO', async () => {
    await client.db.delete(monthlyClosureStatus);
    await seedClosureStatus(client, companyId, MES_ALVO, 'desbloqueado');

    const rhId = await seedEmployee(client, companyId, { cpf: '30000010014', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
  });

  it('Solicitacao ja pendente para mesma chave → 409 (PENDENTE_JA_EXISTE)', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000010015', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_SOLICITACAO_PENDENTE_JA_EXISTE,
    });
  });

  it('Justificativa < 100 chars → BAD_REQUEST MSG_JUSTIFICATIVA_MIN', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000010016', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: 'curta' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_JUSTIFICATIVA_MIN });
  });

  it('Justificativa > 500 chars → BAD_REQUEST MSG_JUSTIFICATIVA_MAX', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000010017', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const gigante = 'x'.repeat(501);
    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: gigante }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_JUSTIFICATIVA_MAX });
  });

  it('Sem sessao → UNAUTHORIZED (protectedProcedure)', async () => {
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(null));

    await expect(
      caller.create({ companyId, mes: MES_ALVO, aba: 'rh', justificativa: JUSTIFICATIVA_OK }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ============================================================
// describe: cancel — DOC 03 §4.3 + DOC 06 §13.4 (S049)
// ============================================================

describe('cycleUnlockRequests.cancel — S049 (RH + solicitante + Super Admin)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
    companyId = await seedActiveCompany(client, '10000000000351');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
  });

  async function seedPendingRequestBy(
    solicitanteTipo: 'employee' | 'clevel',
    solicitanteId: number,
  ): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo,
        solicitanteId,
        mes: MES_ALVO,
        aba: 'rh',
        justificativa: JUSTIFICATIVA_OK,
        status: 'pendente',
      })
      .$returningId();
    return row!.id;
  }

  it('Solicitante cancela a propria solicitacao (silencioso, sem alerta)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020001', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx, captured } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.cancel({ id: reqId });
    await drainMicrotasks();

    expect(result).toEqual({ ok: true, id: reqId });
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.status).toBe('cancelada');
    expect(captured).toEqual([]);
  });

  it('C-level solicitante cancela via solicitanteTipo=clevel', async () => {
    const clevelId = await seedCLevel(client, companyId, '30000020002');
    const reqId = await seedPendingRequestBy('clevel', clevelId);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).resolves.toEqual({ ok: true, id: reqId });
  });

  it('RH da mesma empresa cancela solicitacao de terceiro (S049)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020003', isLider: true });
    const rhId = await seedEmployee(client, companyId, { cpf: '30000020004', isRH: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.cancel({ id: reqId });
    expect(result.ok).toBe(true);
  });

  it('RH-Lider da mesma empresa cancela solicitacao de terceiro (S049)', async () => {
    const clevelId = await seedCLevel(client, companyId, '30000020005');
    const rhLiderId = await seedEmployee(client, companyId, {
      cpf: '30000020006',
      isRH: true,
      isLider: true,
    });
    const reqId = await seedPendingRequestBy('clevel', clevelId);
    const token = await tokenPlatform('rh_lider', rhLiderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).resolves.toEqual({ ok: true, id: reqId });
  });

  it('Super Admin cancela solicitacao de qualquer empresa (S049)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020007', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    const superAdminId = await seedSuperAdminExtra(client, 'sa-cancel@roip.test');
    const token = await tokenSuperAdmin(superAdminId, 'sa-cancel@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).resolves.toEqual({ ok: true, id: reqId });
  });

  it('RH de OUTRA empresa recebe FORBIDDEN (S049 restrita a mesma empresa)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020008', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    const outraId = await seedActiveCompany(client, '20000000000351');
    const rhOutraId = await seedEmployee(client, outraId, { cpf: '30000020009', isRH: true });
    const token = await tokenPlatform('rh', rhOutraId, outraId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_CANCEL_NAO_AUTORIZADO,
    });
  });

  it('Terceiro (lider nao-solicitante) recebe FORBIDDEN', async () => {
    const lider1 = await seedEmployee(client, companyId, { cpf: '30000020010', isLider: true });
    const lider2 = await seedEmployee(client, companyId, { cpf: '30000020011', isLider: true });
    const reqId = await seedPendingRequestBy('employee', lider1);
    const token = await tokenPlatform('lider', lider2, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_CANCEL_NAO_AUTORIZADO,
    });
  });

  it('Solicitacao inexistente → 404 MSG_SOLICITACAO_NAO_ENCONTRADA', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000020012', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_SOLICITACAO_NAO_ENCONTRADA,
    });
  });

  it('Solicitacao ja aprovada → 409 MSG_CANCEL_JA_DECIDIDA', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020013', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'aprovada' })
      .where(ne(cycleUnlockRequests.id, 0));

    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_CANCEL_JA_DECIDIDA,
    });
  });

  it('Solicitacao ja recusada → 409 MSG_CANCEL_JA_DECIDIDA', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020014', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'recusada' })
      .where(ne(cycleUnlockRequests.id, 0));

    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_CANCEL_JA_DECIDIDA,
    });
  });

  it('Solicitacao ja cancelada → 409 MSG_CANCEL_JA_CANCELADA', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000020015', isLider: true });
    const reqId = await seedPendingRequestBy('employee', liderId);
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'cancelada' })
      .where(ne(cycleUnlockRequests.id, 0));

    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.cancel({ id: reqId })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_CANCEL_JA_CANCELADA,
    });
  });
});

// ============================================================
// describe: hasPending — DOC 03 §4.3 fim + DOC 06 §13.3
// ============================================================

describe('cycleUnlockRequests.hasPending — §13.3 D051/D052/D053', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
    companyId = await seedActiveCompany(client, '10000000000352');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
  });

  async function seedPending(
    aba: 'rh' | 'lider' | 'faturamento',
    liderId: number | null,
    solicitanteId: number = 42,
  ): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId,
        mes: MES_ALVO,
        aba,
        liderId,
        justificativa: JUSTIFICATIVA_OK,
        status: 'pendente',
      })
      .$returningId();
    return row!.id;
  }

  it('hasPending=false quando nao ha nenhuma solicitacao', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000030001', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' });
    expect(result).toEqual({ hasPending: false, requestedAt: null, requestedBy: null });
  });

  it('hasPending=true com requestedAt/requestedBy corretos', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000030002', isRH: true });
    const reqId = await seedPending('rh', null, rhId);
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' });
    expect(result.hasPending).toBe(true);
    expect(result.requestedBy).toBe(rhId);
    expect(result.requestedAt).toBeInstanceOf(Date);
    expect(reqId).toBeGreaterThan(0);
  });

  it('RH da mesma empresa consulta qualquer aba (rh)', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000030003', isRH: true });
    await seedPending('rh', null);
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' });
    expect(result.hasPending).toBe(true);
  });

  it('RH consulta aba=faturamento (mesma empresa)', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000030004', isRH: true });
    await seedPending('faturamento', null);
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'faturamento' });
    expect(result.hasPending).toBe(true);
  });

  it('Lider consulta proprio liderId (aba=lider)', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000030005', isLider: true });
    await seedPending('lider', liderId);
    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({
      companyId,
      mes: MES_ALVO,
      aba: 'lider',
      liderId,
    });
    expect(result.hasPending).toBe(true);
  });

  it('Lider tentando liderId alheio → FORBIDDEN', async () => {
    const lider1 = await seedEmployee(client, companyId, { cpf: '30000030006', isLider: true });
    const lider2 = await seedEmployee(client, companyId, { cpf: '30000030007', isLider: true });
    const token = await tokenPlatform('lider', lider1, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.hasPending({ companyId, mes: MES_ALVO, aba: 'lider', liderId: lider2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_HAS_PENDING_NAO_AUTORIZADO });
  });

  it('Lider tentando aba=rh → FORBIDDEN', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000030008', isLider: true });
    const token = await tokenPlatform('lider', liderId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('C-level consulta proprio liderId (aba=lider)', async () => {
    const clevelId = await seedCLevel(client, companyId, '30000030009');
    await seedPending('lider', clevelId);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({
      companyId,
      mes: MES_ALVO,
      aba: 'lider',
      liderId: clevelId,
    });
    expect(result.hasPending).toBe(true);
  });

  it('Super Admin consulta qualquer empresa/aba', async () => {
    await seedPending('rh', null);
    const superAdminId = await seedSuperAdminExtra(client, 'sa-has@roip.test');
    const token = await tokenSuperAdmin(superAdminId, 'sa-has@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' });
    expect(result.hasPending).toBe(true);
  });

  it('RH de OUTRA empresa → FORBIDDEN', async () => {
    const outraId = await seedActiveCompany(client, '20000000000352');
    const rhOutra = await seedEmployee(client, outraId, { cpf: '30000030010', isRH: true });
    const token = await tokenPlatform('rh', rhOutra, outraId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('Filtra por status=pendente — aprovada nao aparece', async () => {
    const rhId = await seedEmployee(client, companyId, { cpf: '30000030011', isRH: true });
    const reqId = await seedPending('rh', null);
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'aprovada' })
      .where(ne(cycleUnlockRequests.id, 0));

    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.hasPending({ companyId, mes: MES_ALVO, aba: 'rh' });
    expect(result.hasPending).toBe(false);
    expect(reqId).toBeGreaterThan(0);
  });
});

// ============================================================
// describe: decide APROVADA — DOC 03 §4.4 + DOC 06 §13.5
// ============================================================

describe('cycleUnlockRequests.decide APROVADA — §13.5 transacao atomica 6 passos', () => {
  let client: RoipDbClient;
  let companyId: number;
  let superAdminId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
    companyId = await seedActiveCompany(client, '10000000000353');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
    superAdminId = await seedSuperAdminExtra(client, 'sa-approve@roip.test');
  });

  async function seedPendingRequest(liderId: number | null = null): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId: 42,
        mes: MES_ALVO,
        aba: liderId === null ? 'rh' : 'lider',
        liderId,
        liderTipo: liderId === null ? null : 'employee',
        justificativa: JUSTIFICATIVA_OK,
        status: 'pendente',
      })
      .$returningId();
    return row!.id;
  }

  it('aprovacao completa: 6 sub-passos executados atomicamente', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx, captured } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.decide({ id: reqId, decisao: 'aprovada' });
    await drainMicrotasks();

    // Contrato canonico do retorno.
    expect(result.id).toBe(reqId);
    expect(result.status).toBe('aprovada');
    expect(result.desbloqueadoAte).toEqual(EXPIRA_FIXED);

    // Sub-passo 3: cycleUnlockRequests atualizado.
    const reqRows = await client.db.select().from(cycleUnlockRequests);
    expect(reqRows).toHaveLength(1);
    expect(reqRows[0]!.status).toBe('aprovada');
    expect(reqRows[0]!.decididoPor).toBe(superAdminId);
    expect(reqRows[0]!.decididoEm).toEqual(NOW_FIXED);
    expect(reqRows[0]!.comentarioAprovacao).toBeNull();

    // Sub-passo 4: linha em monthlyUnlockLog.
    const logRows = await client.db.select().from(monthlyUnlockLog);
    expect(logRows).toHaveLength(1);
    const log = logRows[0]!;
    expect(log.companyId).toBe(companyId);
    expect(log.mes).toBe(MES_ALVO);
    expect(log.aba).toBe('rh');
    expect(log.liderId).toBeNull();
    expect(log.desbloqueadoPor).toBe(superAdminId);
    expect(log.justificativa).toBe(JUSTIFICATIVA_OK); // copia literal (§13.5).
    expect(log.desbloqueadoEm).toEqual(NOW_FIXED);
    expect(log.expiraEm).toEqual(EXPIRA_FIXED);
    expect(log.unlockRequestId).toBe(reqId);
    expect(log.houveAlteracao).toBe(false); // default canonico.

    // Sub-passo 5: monthlyClosureStatus vira 'desbloqueado'.
    const closureRows = await client.db.select().from(monthlyClosureStatus);
    expect(closureRows[0]!.status).toBe('desbloqueado');
    expect(closureRows[0]!.dataFechamento).toBeNull();

    // Gatilho canonico pos-COMMIT.
    expect(captured).toEqual([{ tipo: 'desbloqueio_aprovado', requestId: reqId }]);
  });

  it('aprovacao com comentarioAprovacao persiste literalmente', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await caller.decide({
      id: reqId,
      decisao: 'aprovada',
      comentarioAprovacao: COMENTARIO_APROVACAO_OK,
    });

    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.comentarioAprovacao).toBe(COMENTARIO_APROVACAO_OK);
  });

  it('aprovacao aba=lider preserva liderId/liderTipo em monthlyUnlockLog', async () => {
    const liderId = await seedEmployee(client, companyId, { cpf: '30000040001', isLider: true });
    const reqId = await seedPendingRequest(liderId);
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await caller.decide({ id: reqId, decisao: 'aprovada' });
    const logRows = await client.db.select().from(monthlyUnlockLog);
    expect(logRows[0]!.aba).toBe('lider');
    expect(logRows[0]!.liderId).toBe(liderId);
    expect(logRows[0]!.liderTipo).toBe('employee');
  });

  it('solicitacao inexistente → 404 MSG_SOLICITACAO_NAO_ENCONTRADA', async () => {
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: 999_999, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_SOLICITACAO_NAO_ENCONTRADA,
    });
  });

  it('solicitacao ja aprovada → 409 MSG_DECIDE_JA_DECIDIDA', async () => {
    const reqId = await seedPendingRequest();
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'aprovada' })
      .where(ne(cycleUnlockRequests.id, 0));
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DECIDE_JA_DECIDIDA,
    });
  });

  it('solicitacao ja recusada → 409 MSG_DECIDE_JA_DECIDIDA', async () => {
    const reqId = await seedPendingRequest();
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'recusada' })
      .where(ne(cycleUnlockRequests.id, 0));
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DECIDE_JA_DECIDIDA,
    });
  });

  it('solicitacao cancelada → 409 MSG_DECIDE_JA_CANCELADA', async () => {
    const reqId = await seedPendingRequest();
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'cancelada' })
      .where(ne(cycleUnlockRequests.id, 0));
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DECIDE_JA_CANCELADA,
    });
  });

  it('mes em status=desbloqueado → 409 MES_JA_DESBLOQUEADO (rollback)', async () => {
    const reqId = await seedPendingRequest();
    // Concorrente ja alterou o closure para desbloqueado.
    await client.db.delete(monthlyClosureStatus);
    await seedClosureStatus(client, companyId, MES_ALVO, 'desbloqueado');
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx, captured } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_DECIDE_MES_JA_DESBLOQUEADO,
    });

    // Rollback: nenhuma linha em log, request ainda pendente, closure ainda desbloqueado.
    const reqRows = await client.db.select().from(cycleUnlockRequests);
    expect(reqRows[0]!.status).toBe('pendente');
    const logRows = await client.db.select().from(monthlyUnlockLog);
    expect(logRows).toHaveLength(0);
    // Sem alerta pos-COMMIT (a transacao falhou).
    expect(captured).toEqual([]);
  });

  it('tolerancia §13.6: motivoRecusa com decisao=aprovada e ignorado', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-approve@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    // Nao deve lancar — motivoRecusa e ignorado silenciosamente.
    const result = await caller.decide({
      id: reqId,
      decisao: 'aprovada',
      motivoRecusa: 'texto qualquer que nao vai ser gravado',
    });
    expect(result.status).toBe('aprovada');
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.motivoRecusa).toBeNull();
  });

  it('roleProcedure: RH tenta decide → FORBIDDEN', async () => {
    const reqId = await seedPendingRequest();
    const rhId = await seedEmployee(client, companyId, { cpf: '30000040002', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'aprovada' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ============================================================
// describe: decide RECUSADA — DOC 03 §4.4 + DOC 06 §13.6
// ============================================================

describe('cycleUnlockRequests.decide RECUSADA — §13.6 transacao 3 passos', () => {
  let client: RoipDbClient;
  let companyId: number;
  let superAdminId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
    companyId = await seedActiveCompany(client, '10000000000354');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
    superAdminId = await seedSuperAdminExtra(client, 'sa-reject@roip.test');
  });

  async function seedPendingRequest(): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId: 42,
        mes: MES_ALVO,
        aba: 'rh',
        justificativa: JUSTIFICATIVA_OK,
        status: 'pendente',
      })
      .$returningId();
    return row!.id;
  }

  it('recusa completa: 3 sub-passos + gatilho canonico', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx, captured } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    const result = await caller.decide({
      id: reqId,
      decisao: 'recusada',
      motivoRecusa: MOTIVO_RECUSA_OK,
    });
    await drainMicrotasks();

    expect(result).toEqual({ id: reqId, status: 'recusada', desbloqueadoAte: null });

    const reqRows = await client.db.select().from(cycleUnlockRequests);
    expect(reqRows[0]!.status).toBe('recusada');
    expect(reqRows[0]!.decididoPor).toBe(superAdminId);
    expect(reqRows[0]!.decididoEm).toEqual(NOW_FIXED);
    expect(reqRows[0]!.motivoRecusa).toBe(MOTIVO_RECUSA_OK);

    // Sub-passo canonico: SEM insert em monthlyUnlockLog.
    const logRows = await client.db.select().from(monthlyUnlockLog);
    expect(logRows).toHaveLength(0);

    // Sub-passo canonico: SEM update em monthlyClosureStatus.
    const closureRows = await client.db.select().from(monthlyClosureStatus);
    expect(closureRows[0]!.status).toBe('fechado');

    expect(captured).toEqual([{ tipo: 'desbloqueio_recusado', requestId: reqId }]);
  });

  it('motivoRecusa ausente → BAD_REQUEST MSG_MOTIVO_RECUSA_OBRIGATORIO', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(caller.decide({ id: reqId, decisao: 'recusada' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_MOTIVO_RECUSA_OBRIGATORIO,
    });
  });

  it('motivoRecusa vazio → BAD_REQUEST MSG_MOTIVO_RECUSA_OBRIGATORIO', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: '   ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_MOTIVO_RECUSA_OBRIGATORIO });
  });

  it('motivoRecusa < 100 chars → BAD_REQUEST MSG_MOTIVO_RECUSA_MIN', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: 'curto demais' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_MOTIVO_RECUSA_MIN });
  });

  it('motivoRecusa > 500 chars → BAD_REQUEST MSG_MOTIVO_RECUSA_MAX', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: 'x'.repeat(501) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_MOTIVO_RECUSA_MAX });
  });

  it('tolerancia §13.6: comentarioAprovacao com decisao=recusada e ignorado', async () => {
    const reqId = await seedPendingRequest();
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    // Nao deve lancar — comentarioAprovacao e ignorado silenciosamente.
    const result = await caller.decide({
      id: reqId,
      decisao: 'recusada',
      motivoRecusa: MOTIVO_RECUSA_OK,
      comentarioAprovacao: 'texto qualquer que nao vai ser gravado',
    });
    expect(result.status).toBe('recusada');
    const rows = await client.db.select().from(cycleUnlockRequests);
    expect(rows[0]!.comentarioAprovacao).toBeNull();
  });

  it('recusa idempotente contra ja-recusada → 409 MSG_DECIDE_JA_DECIDIDA', async () => {
    const reqId = await seedPendingRequest();
    await client.db
      .update(cycleUnlockRequests)
      .set({ status: 'recusada' })
      .where(ne(cycleUnlockRequests.id, 0));
    const token = await tokenSuperAdmin(superAdminId, 'sa-reject@roip.test');
    const { factory, ctx } = bindCapturingRouter(client);
    const caller = factory(ctx(token));

    await expect(
      caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: MOTIVO_RECUSA_OK }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_DECIDE_JA_DECIDIDA });
  });

  it(
    'roleProcedure: sem sessao → UNAUTHORIZED (precedencia canonica §8.3/§8.4:' +
      ' sessao antes de perfil)',
    async () => {
      const reqId = await seedPendingRequest();
      const { factory, ctx } = bindCapturingRouter(client);
      const caller = factory(ctx(null));

      await expect(
        caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: MOTIVO_RECUSA_OK }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    },
  );

  it(
    'roleProcedure: C-level tenta decide → FORBIDDEN (perfil errado — §8.3 nunca' +
      ' sessao expirada)',
    async () => {
      const reqId = await seedPendingRequest();
      const clevelId = await seedCLevel(client, companyId, '30000050001');
      const token = await tokenPlatform('clevel', clevelId, companyId);
      const { factory, ctx } = bindCapturingRouter(client);
      const caller = factory(ctx(token));

      await expect(
        caller.decide({ id: reqId, decisao: 'recusada', motivoRecusa: MOTIVO_RECUSA_OK }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
});

// ============================================================
// describe: acoplamento com appRouter (RV-13)
// ============================================================

describe('cycleUnlockRequests acoplado ao appRouter (RV-13)', () => {
  let client: RoipDbClient;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
  });

  it('appRouter.cycleUnlockRequests.hasPending responde (default NOOP)', async () => {
    const companyId = await seedActiveCompany(client, '10000000000355');
    await seedClosureStatus(client, companyId, MES_ALVO, 'fechado');
    const rhId = await seedEmployee(client, companyId, { cpf: '30000060001', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);

    const factory = createCallerFactory(appRouter);
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );

    const result = await caller.cycleUnlockRequests.hasPending({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
    });
    expect(result).toEqual({ hasPending: false, requestedAt: null, requestedBy: null });
  });

  it('appRouter.cycleUnlockRequests.create funciona ponta-a-ponta pelo appRouter', async () => {
    const companyId = await seedActiveCompany(client, '10000000000355');
    await seedClosureStatus(client, companyId, MES_OUTRO, 'fechado');
    const rhId = await seedEmployee(client, companyId, { cpf: '30000060002', isRH: true });
    const token = await tokenPlatform('rh', rhId, companyId);

    const factory = createCallerFactory(appRouter);
    const caller = factory(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );

    const result = await caller.cycleUnlockRequests.create({
      companyId,
      mes: MES_OUTRO,
      aba: 'rh',
      justificativa: JUSTIFICATIVA_OK,
    });
    expect(result.id).toBeGreaterThan(0);
  });
});
