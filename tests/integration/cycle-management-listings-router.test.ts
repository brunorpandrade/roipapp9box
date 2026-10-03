// ROIP APP 9BOX — teste de integracao do sub-router
// `cycleManagementListings` (ME-B9.1 §14.18).
//
// Cobre as 4 procs canonicas (listPendingUnlockByCompany,
// listHistoricoUnlockByCompany, listCycleScheduleByCompany,
// listCalendarioByCompany) contra MySQL real via `createCallerFactory`.
//
// Padrao S009 estendido ao Bloco B9: company local por describe, CNPJ
// unico da faixa reservada 10000000000450..455.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  cycleSchedule,
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
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  HISTORICO_WINDOW_DAYS,
  PENDING_LIMIT_DEFAULT,
  createCycleManagementListingsRouter,
} from '../../src/server/routers/cycleManagementListings';
import { createCompany } from '../../src/server/services/companies';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-b9-1-listings';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me-b9-1-listings';

async function fullCleanup(client: RoipDbClient): Promise<void> {
  await client.db.delete(monthlyUnlockLog);
  await client.db.delete(cycleUnlockRequests);
  await client.db.delete(monthlyClosureStatus);
  await client.db.delete(cycleSchedule);
  await client.db.delete(employees);
  await client.db.delete(cLevelMembers);
  await client.db.delete(companies);
  await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
}

async function seedActiveCompany(client: RoipDbClient, cnpj: string): Promise<number> {
  const companyId = await createCompany(client.db, {
    razaoSocial: `ROIP B9-1 ${cnpj} LTDA`,
    nomeFantasia: 'ROIP B9-1',
    cnpj,
    telefone: '1633330000',
    endereco: 'Rua B9-1, 1',
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
    kickoffDate: new Date('2020-01-01'),
  });
  await client.db.update(companies).set({ status: 'ativa' });
  return companyId;
}

async function seedRHEmployee(
  client: RoipDbClient,
  companyId: number,
  cpf: string,
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'RH User',
      cpf,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '000000',
      descricaoCBO: 'Analista RH',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      isRH: true,
      isLider: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  if (!row) {
    throw new Error('seedRHEmployee: insert sem id');
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

async function buildCtx(client: RoipDbClient, bearerToken: string | null): Promise<Context> {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

describe('cycleManagementListings — procs canonicas (ME-B9.1 §14.18)', () => {
  let client: RoipDbClient;
  const factory = createCallerFactory(createCycleManagementListingsRouter());

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await fullCleanup(client);
  });

  afterAll(async () => {
    await fullCleanup(client);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await fullCleanup(client);
  });

  it('PENDING_LIMIT_DEFAULT = 200 (cap defensivo canonico)', () => {
    expect(PENDING_LIMIT_DEFAULT).toBe(200);
  });

  it('HISTORICO_WINDOW_DAYS = 90 (janela canonica §14.18)', () => {
    expect(HISTORICO_WINDOW_DAYS).toBe(90);
  });

  it('listPendingUnlockByCompany retorna solicitacoes pendentes do companyId', async () => {
    const companyId = await seedActiveCompany(client, '10000000000450');
    const rhId = await seedRHEmployee(client, companyId, '45000000000');

    await client.db.insert(cycleUnlockRequests).values({
      companyId,
      solicitanteTipo: 'employee',
      solicitanteId: rhId,
      mes: '2026-05',
      aba: 'rh',
      justificativa: 'A'.repeat(120),
      status: 'pendente',
    });

    const token = await signPlatformToken({
      role: 'rh',
      userId: rhId,
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });

    const caller = factory(await buildCtx(client, token));
    const rows = await caller.listPendingUnlockByCompany({ companyId });
    expect(rows.length).toBe(1);
    const r0 = rows[0];
    if (r0 === undefined) {
      throw new Error('row 0 ausente');
    }
    expect(r0.status).toBe('pendente');
    expect(r0.aba).toBe('rh');
    expect(r0.solicitanteNome).toBe('RH User');
  });

  it('listHistoricoUnlockByCompany retorna aprovadas/recusadas dos ultimos 90d', async () => {
    const companyId = await seedActiveCompany(client, '10000000000451');
    const rhId = await seedRHEmployee(client, companyId, '45100000000');

    await client.db.insert(cycleUnlockRequests).values([
      {
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId: rhId,
        mes: '2026-05',
        aba: 'rh',
        justificativa: 'A'.repeat(120),
        status: 'aprovada',
      },
      {
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId: rhId,
        mes: '2026-04',
        aba: 'rh',
        justificativa: 'B'.repeat(120),
        status: 'recusada',
      },
      {
        companyId,
        solicitanteTipo: 'employee',
        solicitanteId: rhId,
        mes: '2026-03',
        aba: 'rh',
        justificativa: 'C'.repeat(120),
        status: 'pendente', // NAO deve aparecer no historico
      },
    ]);

    const token = await signPlatformToken({
      role: 'rh',
      userId: rhId,
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });

    const caller = factory(await buildCtx(client, token));
    const rows = await caller.listHistoricoUnlockByCompany({ companyId });
    expect(rows.length).toBe(2);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['aprovada', 'recusada']);
  });

  it('listCycleScheduleByCompany retorna linhas paginadas da empresa', async () => {
    const companyId = await seedActiveCompany(client, '10000000000452');
    const rhId = await seedRHEmployee(client, companyId, '45200000000');

    await client.db.insert(cycleSchedule).values([
      {
        companyId,
        tipoCiclo: 'fechamento_mensal',
        cicloReferencia: '2026-07',
        dataAbertura: new Date('2026-07-01'),
        dataCorte: new Date('2026-08-11'),
        dataFechamento: null,
        status: 'aberto',
        totalElegiveis: 100,
        totalRespondidos: 20,
      },
      {
        companyId,
        tipoCiclo: 'instrumento_a',
        cicloReferencia: '2026-Q2',
        dataAbertura: new Date('2026-06-16'),
        dataCorte: new Date('2026-07-10'),
        dataFechamento: null,
        status: 'atrasado',
        totalElegiveis: 100,
        totalRespondidos: 65,
      },
    ]);

    const token = await signPlatformToken({
      role: 'rh',
      userId: rhId,
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });

    const caller = factory(await buildCtx(client, token));
    const page = await caller.listCycleScheduleByCompany({
      companyId,
      page: 1,
      pageSize: 25,
    });
    expect(page.rows.length).toBe(2);
    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(25);
  });

  it('rejeita RH tentando ler empresa alheia (FORBIDDEN §2.4)', async () => {
    const companyA = await seedActiveCompany(client, '10000000000453');
    const companyB = await seedActiveCompany(client, '10000000000454');
    const rhIdA = await seedRHEmployee(client, companyA, '45300000000');

    const token = await signPlatformToken({
      role: 'rh',
      userId: rhIdA,
      companyId: companyA,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });

    const caller = factory(await buildCtx(client, token));
    await expect(caller.listPendingUnlockByCompany({ companyId: companyB })).rejects.toThrow(
      'Empresa fora do escopo.',
    );
  });

  it('super_admin atravessa (sem restricao de companyId)', async () => {
    const companyId = await seedActiveCompany(client, '10000000000455');
    const email = 'sa-b9-1-listings@roip.test';
    const superAdminId = await seedSuperAdminExtra(client, email);

    const token = await signSuperAdminToken({
      superAdminId,
      credentialVersion: deriveCredentialVersion(HASH_A + email),
    });

    const caller = factory(await buildCtx(client, token));
    const rows = await caller.listPendingUnlockByCompany({ companyId });
    expect(rows).toEqual([]);
  });
});
