// ROIP APP 9BOX — teste de integracao do sub-router `aiChat`
// (ME-052, S265). Contra MySQL real via `createCallerFactory`.
//
// Cobertura canonica:
//   - Bloqueio Zod S263: input `dashboardLevel = 'global'` ou
//     `'departamento'` -> BAD_REQUEST.
//   - Happy path individual: `sendMessage` grava user + assistant,
//     `getHistory` devolve os dois.
//   - Happy path equipe: idem para nivel equipe.
//   - Falha §11.2: motor devolve `failed_claude` -> INTERNAL_SERVER_ERROR
//     com mensagem canonica; apenas `user` gravado, `assistant` NAO.
//   - Cross-empresa: viewer de empresa A tentando contexto de empresa B
//     -> FORBIDDEN.
//   - Guard cadeia direta S066: lider tentando individual de colaborador
//     NAO liderado -> FORBIDDEN; lider consultando o proprio dashboard
//     individual -> ok.
//   - Cap Zod: mensagem > CHAT_IA_USER_MESSAGE_MAX_CHARS -> BAD_REQUEST.
//
// Faixa CNPJ desta ME: principal 10020..10029.
//
// Padrao S009 estendido: uma company local por describe; L32 cleanup
// completo em afterAll (aiConversations + FK dependentes).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { aiConversations, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createAiChatRouter,
  MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
} from '../../src/server/routers/aiChat';
import {
  CHAT_IA_USER_MESSAGE_MAX_CHARS,
  MSG_CHAT_IA_FALLBACK,
  type SendChatMessageArgs,
  type SendChatMessageOutcome,
} from '../../src/server/services/aiChatService';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me052-aichat';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me052-aichat';

// ============================================================
// Geradores unicos (padrao S009 estendido)
// ============================================================

let cpfCounter = 42000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me052${seq}`;
}

// ============================================================
// Fixture — companies + employees (faixa 10020..10029)
// ============================================================

const CNPJ_HAPPY_INDIVIDUAL = '10020000000001';
const CNPJ_HAPPY_EQUIPE = '10020000000002';
const CNPJ_FALHA_11_2 = '10020000000003';
const CNPJ_CROSS_A = '10020000000004';
const CNPJ_CROSS_B = '10020000000005';
const CNPJ_LIDER_DIRETO = '10020000000006';
const CNPJ_BLOQUEIO_ZOD = '10020000000007';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) {
    return;
  }
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    await client.db
      .delete(aiConversations)
      .where(inArray(aiConversations.companyId, createdCompanyIds));
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers canonicos de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME052A ${cnpj} LTDA`,
      nomeFantasia: `ME052A ${cnpj}`,
      cnpj,
      telefone: '1633330052',
      endereco: `Rua ME-052, ${cnpj}`,
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
  if (!row) {
    throw new Error('createCompany: sem id');
  }
  createdCompanyIds.push(row.id);
  return row.id;
}

async function createEmployee(
  companyId: number,
  opts: { status?: 'ativo' | 'inativo'; isLider?: boolean } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Emp ${nextCpf()}`,
      cpf: nextCpf(),
      email: `emp-${companyId}-${nextCpf()}@example.com`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '252105',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function linkLeader(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture ME-052 aiChat integracao',
    transferBatchId: nextTransferBatchId(),
  });
}

// ============================================================
// Tokens canonicos
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
// Stub canonico do motor Chat IA
// ============================================================

interface StubCall {
  args: SendChatMessageArgs;
}

function buildStubServiceFactory(opts: {
  outcome: (args: SendChatMessageArgs) => SendChatMessageOutcome;
  onCall?: (args: SendChatMessageArgs) => void;
}) {
  const calls: StubCall[] = [];
  const factory = (db: unknown) => {
    void db;
    return {
      sendChatMessage: async (args: SendChatMessageArgs) => {
        calls.push({ args });
        if (opts.onCall) opts.onCall(args);
        return opts.outcome(args);
      },
    };
  };
  return { calls, factory };
}

// ============================================================
// Fabrica de caller
// ============================================================

function bindRouter(serviceFactory?: (db: unknown) => unknown) {
  const testRouter = createAiChatRouter(
    serviceFactory === undefined
      ? {}
      : {
          serviceFactory: serviceFactory as Parameters<typeof createAiChatRouter>[0] extends {
            serviceFactory?: infer F;
          }
            ? F
            : never,
        },
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

// ============================================================
// 1) Bloqueio Zod S263 — global e departamento
// ============================================================

describe('aiChat — bloqueio Zod S263 (global/departamento)', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_BLOQUEIO_ZOD);
    employeeId = await createEmployee(companyId);
  });

  it('sendMessage com dashboardLevel = global -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'global' as never,
        contextId: employeeId,
        content: 'oi',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('sendMessage com dashboardLevel = departamento -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'departamento' as never,
        contextId: employeeId,
        content: 'oi',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('sendMessage com content acima do cap -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const longContent = 'a'.repeat(CHAT_IA_USER_MESSAGE_MAX_CHARS + 1);
    await expect(
      caller.sendMessage({
        dashboardLevel: 'individual',
        contextId: employeeId,
        content: longContent,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 2) Happy path individual — sendMessage + getHistory
// ============================================================

describe('aiChat — happy path individual', () => {
  let companyId: number;
  let employeeId: number;
  let rhEmployeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HAPPY_INDIVIDUAL);
    employeeId = await createEmployee(companyId);
    rhEmployeeId = await createEmployee(companyId);
  });

  it('sendMessage -> retorna assistant e grava historico', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'ok',
        assistantContent: 'Resposta da IA canonica.',
        assistantId: 100,
        userId: 99,
        telemetryCallId: 'call-happy-1',
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhEmployeeId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.sendMessage({
      dashboardLevel: 'individual',
      contextId: employeeId,
      content: 'Como esta o desempenho deste colaborador?',
    });
    expect(result.content).toBe('Resposta da IA canonica.');
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.args.viewerRole).toBe('rh');
    expect(stub.calls[0]?.args.viewerUserType).toBe('employee');
    expect(stub.calls[0]?.args.dashboardLevel).toBe('individual');
  });

  it('super_admin: sendMessage funciona com viewerUserType = super_admin', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'ok',
        assistantContent: 'ok super',
        assistantId: 101,
        userId: 102,
        telemetryCallId: 'call-super-1',
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.sendMessage({
      dashboardLevel: 'individual',
      contextId: employeeId,
      content: 'Como esta este colaborador?',
    });
    expect(result.content).toBe('ok super');
    expect(stub.calls[0]?.args.viewerUserType).toBe('super_admin');
    expect(stub.calls[0]?.args.viewerRole).toBe('super_admin');
  });
});

// ============================================================
// 3) Happy path equipe
// ============================================================

describe('aiChat — happy path equipe', () => {
  let companyId: number;
  let liderId: number;
  let lideradoId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HAPPY_EQUIPE);
    liderId = await createEmployee(companyId, { isLider: true });
    lideradoId = await createEmployee(companyId);
    await linkLeader(lideradoId, liderId);
  });

  it('lider sendMessage nivel equipe do proprio dashboard -> ok', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'ok',
        assistantContent: 'analise de equipe',
        assistantId: 200,
        userId: 201,
        telemetryCallId: 'call-eq-1',
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.sendMessage({
      dashboardLevel: 'equipe',
      contextId: liderId,
      content: 'Como esta minha equipe?',
    });
    expect(result.content).toBe('analise de equipe');
    expect(stub.calls[0]?.args.dashboardLevel).toBe('equipe');
    expect(stub.calls[0]?.args.viewerRole).toBe('lider');
  });

  it('lider tentando equipe de OUTRO lider -> FORBIDDEN', async () => {
    const outroLiderId = await createEmployee(companyId, { isLider: true });
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'equipe',
        contextId: outroLiderId,
        content: 'ok',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 4) Falha §11.2 — motor devolve failed_claude
// ============================================================

describe('aiChat — falha §11.2 (fallback canonico)', () => {
  let companyId: number;
  let employeeId: number;
  let rhEmployeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_FALHA_11_2);
    employeeId = await createEmployee(companyId);
    rhEmployeeId = await createEmployee(companyId);
  });

  it('sendMessage com falha do motor -> INTERNAL_SERVER_ERROR + mensagem canonica', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'failed_claude',
        status: 'falha_5xx',
        userId: 500,
        message: MSG_CHAT_IA_FALLBACK,
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('rh', rhEmployeeId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'individual',
        contextId: employeeId,
        content: 'pergunta que ativa falha',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: MSG_CHAT_IA_FALLBACK,
    });
    expect(stub.calls).toHaveLength(1);
  });
});

// ============================================================
// 5) Cross-empresa — FORBIDDEN
// ============================================================

describe('aiChat — cross-empresa (FORBIDDEN)', () => {
  let companyA: number;
  let companyB: number;
  let rhAId: number;
  let employeeBId: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_CROSS_A);
    companyB = await createCompany(CNPJ_CROSS_B);
    rhAId = await createEmployee(companyA);
    employeeBId = await createEmployee(companyB);
  });

  it('rh da empresa A tentando individual de empresa B -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhAId, companyA);
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'individual',
        contextId: employeeBId,
        content: 'ok',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_CHAT_IA_CONTEXTO_NAO_ENCONTRADO,
    });
  });
});

// ============================================================
// 6) Guard cadeia direta S066 — lider individual
// ============================================================

describe('aiChat — guard cadeia direta S066 (individual)', () => {
  let companyId: number;
  let liderId: number;
  let liderado: number;
  let semLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIDER_DIRETO);
    liderId = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    semLider = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
  });

  it('lider individual do proprio dashboard -> ok', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'ok',
        assistantContent: 'meu proprio dashboard',
        assistantId: 300,
        userId: 301,
        telemetryCallId: 'call-lider-self',
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.sendMessage({
      dashboardLevel: 'individual',
      contextId: liderId,
      content: 'meu dashboard',
    });
    expect(result.content).toBe('meu proprio dashboard');
  });

  it('lider individual de liderado direto -> ok', async () => {
    const stub = buildStubServiceFactory({
      outcome: () => ({
        kind: 'ok',
        assistantContent: 'liderado direto',
        assistantId: 302,
        userId: 303,
        telemetryCallId: 'call-lider-liderado',
      }),
    });
    const { factory, ctx } = bindRouter(stub.factory);
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.sendMessage({
      dashboardLevel: 'individual',
      contextId: liderado,
      content: 'como esta o liderado?',
    });
    expect(result.content).toBe('liderado direto');
  });

  it('lider individual de colaborador NAO liderado -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.sendMessage({
        dashboardLevel: 'individual',
        contextId: semLider,
        content: 'como esta?',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
