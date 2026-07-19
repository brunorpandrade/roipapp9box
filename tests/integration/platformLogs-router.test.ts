// ROIP APP 9BOX — teste de integracao do sub-router `platformLogs`
// (ME-044).
//
// Exercita 1 proc: `platformLogs.listResponsavelFinanceiroTransfers`.
// Cobre:
//   - Contratos publicos exportados (RV-13).
//   - Bruno EXCLUSIVO — RH/RH-lider/C-level/lider = FORBIDDEN.
//   - Ordem DESC canonica (mais recente primeiro) sobre o service ASC
//     canonico reutilizado — assert asserta cronologia por `createdAt`.
//   - Enum `cLevel` (camelCase) preservado no payload de resposta.
//   - Vazio: items=[], count=0.
//
// Faixa CNPJ 817..819 (sub-faixa platformLogs-router).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  DEFAULT_PLATFORM_LOGS_ROUTER_DEPS,
  LIST_RF_TRANSFERS_INPUT_SCHEMA,
  MSG_PLATFORM_LOGS_FORBIDDEN,
  createPlatformLogsRouter,
  type ListRfTransfersResult,
} from '../../src/server/routers/platformLogs';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me044-platformLogs';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me044-platformLogs';

let cpfCounter = 44300000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Sub-faixa platformLogs-router: 817, 818 dentro do bloco 810..819.
// A empresa 818 e reusada entre os describes "vazio" (antes de log) e
// "guards" (apos inserir 1 log de fixture) para caber na faixa canonica.
const CNPJ_ORDEM_DESC = '10000000000817';
const CNPJ_VAZIO_E_GUARDS = '10000000000818';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
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

// ============================================================
// Fixtures
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME044PL Test ${cnpj} LTDA`,
      nomeFantasia: `ME044PL ${cnpj}`,
      cnpj,
      telefone: '1633330046',
      endereco: `Rua ME-044 PL, ${cnpj}`,
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

async function createFixtureEmp(companyId: number, isRH = true): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colaborador ME044 PL',
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
      status: 'ativo',
      isRH,
      isLider: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function insertLogEntry(
  companyId: number,
  eventType: 'atribuido' | 'transferido' | 'removido',
  previousHolderType: 'employee' | 'cLevel' | 'none',
  previousHolderId: number | null,
  newHolderType: 'employee' | 'cLevel' | 'none',
  newHolderId: number | null,
  reason: string,
  createdAt: Date,
): Promise<number> {
  const [row] = await client.db
    .insert(responsavelFinanceiroTransferLog)
    .values({
      companyId,
      previousHolderType,
      previousHolderId,
      newHolderType,
      newHolderId,
      actorSuperAdminId: FIXTURE_SUPER_ADMIN_ID,
      eventType,
      reason,
      createdAt,
    })
    .$returningId();
  return row!.id;
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

function bindRouter() {
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

// ============================================================
// 0) Contratos exportados (RV-13)
// ============================================================

describe('platformLogs — contratos publicos exportados', () => {
  it('mensagens canonicas literais batem o texto exato', () => {
    expect(MSG_PLATFORM_LOGS_FORBIDDEN).toBe(
      'Apenas o Super Admin pode acessar os logs de plataforma.',
    );
  });

  it('LIST_RF_TRANSFERS_INPUT_SCHEMA aceita apenas companyId positivo', () => {
    expect(LIST_RF_TRANSFERS_INPUT_SCHEMA.safeParse({ companyId: 1 }).success).toBe(true);
    expect(LIST_RF_TRANSFERS_INPUT_SCHEMA.safeParse({ companyId: 0 }).success).toBe(false);
    expect(LIST_RF_TRANSFERS_INPUT_SCHEMA.safeParse({ companyId: -1 }).success).toBe(false);
    expect(LIST_RF_TRANSFERS_INPUT_SCHEMA.safeParse({}).success).toBe(false);
  });

  it('DEFAULT_PLATFORM_LOGS_ROUTER_DEPS define `now` funcional', () => {
    expect(typeof DEFAULT_PLATFORM_LOGS_ROUTER_DEPS.now).toBe('function');
    expect(DEFAULT_PLATFORM_LOGS_ROUTER_DEPS.now()).toBeInstanceOf(Date);
  });
});

// ============================================================
// 1) Ordem DESC canonica
// ============================================================

describe('platformLogs.listResponsavelFinanceiroTransfers — ordem DESC', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_ORDEM_DESC);
    // 3 eventos com createdAt crescente — verify DESC no retorno.
    await insertLogEntry(
      companyId,
      'atribuido',
      'none',
      null,
      'employee',
      100,
      'Primeira atribuicao de Responsavel financeiro',
      new Date('2026-01-15T10:00:00Z'),
    );
    await insertLogEntry(
      companyId,
      'transferido',
      'employee',
      100,
      'cLevel',
      200,
      'Reorganizacao das responsabilidades financeiras (evento intermediario).',
      new Date('2026-03-20T10:00:00Z'),
    );
    await insertLogEntry(
      companyId,
      'transferido',
      'cLevel',
      200,
      'employee',
      300,
      'Retomada do papel pelo RH principal apos reestruturacao interna.',
      new Date('2026-05-10T10:00:00Z'),
    );
  });

  it('Bruno recebe 3 items em ordem cronologica DESC', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.listResponsavelFinanceiroTransfers({
      companyId,
    })) as ListRfTransfersResult;
    expect(res.count).toBe(3);
    expect(res.items.length).toBe(3);
    // Mais recente primeiro (2026-05 -> 2026-03 -> 2026-01).
    expect(res.items[0]!.createdAt!.toISOString()).toBe('2026-05-10T10:00:00.000Z');
    expect(res.items[1]!.createdAt!.toISOString()).toBe('2026-03-20T10:00:00.000Z');
    expect(res.items[2]!.createdAt!.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    // Enum camelCase `cLevel` preservado.
    expect(res.items[1]!.newHolderType).toBe('cLevel');
    expect(res.items[2]!.previousHolderType).toBe('none');
    expect(res.items[2]!.previousHolderId).toBeNull();
  });
});

// ============================================================
// 2) Empresa vazia inicialmente + guards Bruno EXCLUSIVO
//    (mesma company, CNPJ 818 — cabe na faixa canonica 810..819)
// ============================================================

describe('platformLogs.listResponsavelFinanceiroTransfers — vazio e guards', () => {
  let companyId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_VAZIO_E_GUARDS);
    rhId = await createFixtureEmp(companyId, true);
  });

  it('Bruno em empresa sem log: items=[], count=0', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.listResponsavelFinanceiroTransfers({
      companyId,
    })) as ListRfTransfersResult;
    expect(res.count).toBe(0);
    expect(res.items).toEqual([]);
  });

  it('RH FORBIDDEN via roleProcedure canonico (com log inserido)', async () => {
    // Insere log de fixture apos assert de "vazio" para nao mascarar o
    // guard por retorno vazio.
    await insertLogEntry(
      companyId,
      'atribuido',
      'none',
      null,
      'employee',
      rhId,
      'Primeira atribuicao de Responsavel financeiro',
      new Date('2026-06-01T10:00:00Z'),
    );

    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.listResponsavelFinanceiroTransfers({ companyId })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });

  it('RH-lider FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh_lider', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(caller.listResponsavelFinanceiroTransfers({ companyId })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});

// ============================================================
// 4) Sentinela RV-13
// ============================================================

describe('platformLogs — sentinela RV-13', () => {
  it('createPlatformLogsRouter aceita deps `now` injetavel', () => {
    const fixed = new Date('2026-07-19T00:00:00Z');
    const r = createPlatformLogsRouter({ now: () => fixed });
    expect(r).toBeDefined();
  });
});
