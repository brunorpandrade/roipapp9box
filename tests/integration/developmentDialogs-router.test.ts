// ROIP APP 9BOX — teste de integracao do sub-router `developmentDialogs`
// (ME Etapa 1 — Bloco 2, NOVO). Contra MySQL real via
// `createCallerFactory`.
//
// Cobertura canonica (RV-16 iv — contract-update-surfaces bit-a-bit
// BEFORE/AFTER cobrindo TODOS os campos editaveis do UPDATE):
//   - Happy path lider: list vazio → create → update titulo/corpo/
//     status/pendencia (asserção BEFORE/AFTER bit-a-bit por campo) →
//     archive → list vazio.
//   - Discard: create → discard imediato (dialogo vazio) → ok.
//   - Discard bloqueado: create → update titulo → discard →
//     BAD_REQUEST canonico.
//   - Guards: RH → FORBIDDEN (create/list); C-level total → FORBIDDEN
//     (list); lider nao-direto → FORBIDDEN (list/create); cross-empresa
//     → NOT_FOUND.
//   - Super_admin: happy path completo.
//
// Faixa CNPJ desta ME: 10060..10069.
// Padrao S009 estendido: uma company local por describe; L32 cleanup
// completo em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  developmentDialogs,
  employeeLeaderHistory,
  employees,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createDevelopmentDialogsRouter,
  MSG_DIALOGOS_APENAS_LIDER_DIRETO,
  MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
  MSG_DISCARD_APENAS_ANTES_DO_PRIMEIRO_SALVAMENTO,
} from '../../src/server/routers/developmentDialogs';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-etapa1-bloco2-devdialogs';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-etapa1-bloco2-devdialogs';

let cpfCounter = 60000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-e1b2dd${seq}`;
}

const CNPJ_HAPPY = '10060000000001';
const CNPJ_DISCARD = '10060000000002';
const CNPJ_GUARDS = '10060000000003';
const CNPJ_CROSS_A = '10060000000004';
const CNPJ_CROSS_B = '10060000000005';

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
      .delete(developmentDialogs)
      .where(inArray(developmentDialogs.companyId, createdCompanyIds));
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `E1B2DD ${cnpj} LTDA`,
      nomeFantasia: `E1B2DD ${cnpj}`,
      cnpj,
      telefone: '1633330060',
      endereco: `Rua Etapa1 Bloco2, ${cnpj}`,
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
      kickoffDate: new Date('2020-01-01'),
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
  opts: { status?: 'ativo' | 'inativo'; isLider?: boolean; isRH?: boolean } = {},
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
      isRH: opts.isRH ?? false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function createCLevel(companyId: number, acessoTotal: boolean): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CL ${nextCpf()}`,
      cpf: nextCpf(),
      email: `cl-${companyId}-${nextCpf()}@example.com`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Diretor executivo (fixture)',
      departamento: 'Diretoria',
      custoMensal: '20000.00',
      passwordHash: HASH_A,
      acessoTotal,
      isRH: false,
      isResponsavelFinanceiro: false,
      status: 'ativo',
    })
    .$returningId();
  if (!row) {
    throw new Error('createCLevel: sem id');
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
    reason: 'Fixture Etapa1 Bloco2 devdialogs',
    transferBatchId: nextTransferBatchId(),
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

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createDevelopmentDialogsRouter();
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
// 1) Happy path do lider — CRUD completo com asserção bit-a-bit
// BEFORE/AFTER de TODOS os 4 campos editaveis (RV-16 iv).
// ============================================================

describe('developmentDialogs — happy path do lider direto', () => {
  let companyId: number;
  let liderId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HAPPY);
    liderId = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
  });

  it('lider cria, edita bit-a-bit todos os 4 campos, arquiva', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));

    // list inicial: vazio
    const list0 = await caller.list({ employeeId: liderado });
    expect(list0.dialogs).toHaveLength(0);

    // create com valores padrao canonicos §14.26. Patch v6: criador
    // polimorfico (liderId XOR clevelId) — lider employee grava liderId,
    // clevelId permanece null.
    const createRes = await caller.create({ employeeId: liderado });
    expect(createRes.dialog.companyId).toBe(companyId);
    expect(createRes.dialog.liderId).toBe(liderId);
    expect(createRes.dialog.clevelId).toBeNull();
    expect(createRes.dialog.employeeId).toBe(liderado);
    expect(createRes.dialog.titulo).toBe('');
    expect(createRes.dialog.corpo).toBe('');
    expect(createRes.dialog.status).toBe('verde');
    expect(createRes.dialog.pendencia).toBe(false);
    expect(createRes.dialog.arquivado).toBe(false);
    const dialogId = createRes.dialog.id;

    // BEFORE: snapshot canonico dos 4 campos editaveis
    const before = {
      titulo: createRes.dialog.titulo,
      corpo: createRes.dialog.corpo,
      status: createRes.dialog.status,
      pendencia: createRes.dialog.pendencia,
    };
    expect(before).toStrictEqual({
      titulo: '',
      corpo: '',
      status: 'verde',
      pendencia: false,
    });

    // UPDATE bit-a-bit: os 4 campos editaveis (titulo, corpo, status,
    // pendencia) em uma unica chamada. AFTER canonicamente igual ao
    // patch enviado (RV-16 iv — asserção BEFORE/AFTER sobre TODOS os
    // campos editaveis, nao subset).
    const patch = {
      id: dialogId,
      titulo: 'Alinhamento canonico',
      corpo: 'Texto do dialogo bit-a-bit.',
      status: 'vermelho' as const,
      pendencia: true,
    };
    const updateRes = await caller.update(patch);
    const after = {
      titulo: updateRes.dialog.titulo,
      corpo: updateRes.dialog.corpo,
      status: updateRes.dialog.status,
      pendencia: updateRes.dialog.pendencia,
    };
    expect(after).toStrictEqual({
      titulo: 'Alinhamento canonico',
      corpo: 'Texto do dialogo bit-a-bit.',
      status: 'vermelho',
      pendencia: true,
    });

    // list mostra o dialogo canonicamente atualizado
    const list1 = await caller.list({ employeeId: liderado });
    expect(list1.dialogs).toHaveLength(1);
    expect(list1.dialogs[0]?.id).toBe(dialogId);
    expect(list1.dialogs[0]?.titulo).toBe('Alinhamento canonico');

    // archive esconde da listagem canonica
    const archiveRes = await caller.archive({ id: dialogId });
    expect(archiveRes.affected).toBe(1);

    const list2 = await caller.list({ employeeId: liderado });
    expect(list2.dialogs).toHaveLength(0);
  });

  it('lider descarta dialogo vazio (antes do primeiro salvamento)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));

    const createRes = await caller.create({ employeeId: liderado });
    const discardRes = await caller.discard({ id: createRes.dialog.id });
    expect(discardRes.affected).toBe(1);

    const list1 = await caller.list({ employeeId: liderado });
    expect(list1.dialogs).toHaveLength(0);
  });
});

// ============================================================
// 2) Discard bloqueado apos primeiro salvamento (§14.26)
// ============================================================

describe('developmentDialogs — discard exige dialogo vazio', () => {
  let companyId: number;
  let liderId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DISCARD);
    liderId = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
  });

  it('discard sobre dialogo com titulo preenchido → BAD_REQUEST canonico', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));

    const createRes = await caller.create({ employeeId: liderado });
    await caller.update({ id: createRes.dialog.id, titulo: 'algo preenchido' });

    await expect(caller.discard({ id: createRes.dialog.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_DISCARD_APENAS_ANTES_DO_PRIMEIRO_SALVAMENTO,
    });
  });
});

// ============================================================
// 3) Guards canonicos §14.25.4
// ============================================================

describe('developmentDialogs — guards canonicos §14.25.4', () => {
  let companyId: number;
  let liderId: number;
  let liderAlt: number;
  let liderado: number;
  let liderRH: number;
  let clevelTotalId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    liderId = await createEmployee(companyId, { isLider: true });
    liderAlt = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    liderRH = await createEmployee(companyId, { isRH: true });
    clevelTotalId = await createCLevel(companyId, true);
    await linkLeader(liderado, liderId);
  });

  it('RH → FORBIDDEN em list (role gate canonico)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', liderRH, companyId);
    const caller = factory(ctx(token));

    // RH nao esta em roleProcedure(['super_admin', 'clevel', 'lider'])
    // do list — role gate canonico do tRPC rejeita ANTES do guard
    // interno com mensagem canonica generica "Perfil sem permissao
    // para a rota". Semantica de defesa em profundidade: role e
    // primeira barreira; MSG_DIALOGOS_APENAS_LIDER_DIRETO so aparece
    // para roles que passam pelo role gate (ex.: lider nao-direto).
    await expect(caller.list({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('C-level total (acessoTotal=true) sem vinculo direto → FORBIDDEN em list', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('clevel', clevelTotalId, companyId);
    const caller = factory(ctx(token));

    // Patch v6: clevel entra no role gate, mas assertPodeLerOrThrow
    // bloqueia C-level total (acessoTotal=true) sem vinculo direto ao
    // alvo. C-level lider direto e coberto por teste dedicado no
    // describe "C-level lider direto (patch v6)" abaixo.
    await expect(caller.list({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('C-level total sem vinculo direto → FORBIDDEN em create (patch v6)', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('clevel', clevelTotalId, companyId);
    const caller = factory(ctx(token));

    // Patch v6: clevel entra no role gate de create, mas
    // assertPodeEscreverOrThrow via resolveCriadorOrNull retorna null
    // (C-level total sem vinculo direto ao alvo). MSG canonico
    // MSG_DIALOGOS_APENAS_LIDER_DIRETO.
    await expect(caller.create({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
  });

  it('lider nao-direto → FORBIDDEN em list e create', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderAlt, companyId);
    const caller = factory(ctx(token));

    await expect(caller.list({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
    await expect(caller.create({ employeeId: liderado })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
  });
});

// ============================================================
// 4) Cross-empresa canonico
// ============================================================

describe('developmentDialogs — cross-empresa', () => {
  let companyA: number;
  let companyB: number;
  let liderA: number;
  let liderado: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_CROSS_A);
    companyB = await createCompany(CNPJ_CROSS_B);
    liderA = await createEmployee(companyA, { isLider: true });
    liderado = await createEmployee(companyB);
  });

  it('lider da empresa A tentando liderado da empresa B → NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', liderA, companyA);
    const caller = factory(ctx(token));

    await expect(caller.list({ employeeId: liderado })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
    await expect(caller.create({ employeeId: liderado })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
  });
});

// ============================================================
// 5) Super_admin (Bruno) — happy path atravessa qualquer par
// ============================================================

describe('developmentDialogs — super_admin (Bruno)', () => {
  let companyId: number;
  let liderId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany('10060000000006');
    liderId = await createEmployee(companyId, { isLider: true });
    liderado = await createEmployee(companyId);
    await linkLeader(liderado, liderId);
  });

  it('super_admin cria, lista e arquiva sem restricao', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    const createRes = await caller.create({ employeeId: liderado });
    expect(createRes.dialog.liderId).toBe(liderId);
    expect(createRes.dialog.clevelId).toBeNull();

    const list1 = await caller.list({ employeeId: liderado });
    expect(list1.dialogs).toHaveLength(1);

    const archiveRes = await caller.archive({ id: createRes.dialog.id });
    expect(archiveRes.affected).toBe(1);
  });
});

// ============================================================
// 6) Patch v6 — C-level lider direto (§10.1 reescrito)
// ============================================================

describe('developmentDialogs — C-level lider direto (patch v6)', () => {
  let companyId: number;
  let clevelDiretoId: number;
  let liderado: number;

  beforeAll(async () => {
    companyId = await createCompany('10060000000007');
    clevelDiretoId = await createCLevel(companyId, false);
    liderado = await createEmployee(companyId);
    // Vinculo canonico §4.6 v6: employeeLeaderHistory.clevelId
    // preenchido, liderId nulo.
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado,
      liderId: null,
      clevelId: clevelDiretoId,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Fixture patch v6 C-level lider direto',
      transferBatchId: nextTransferBatchId(),
    });
  });

  it('C-level lider direto cria dialogo com clevelId preenchido, liderId null', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('clevel', clevelDiretoId, companyId);
    const caller = factory(ctx(token));

    const list0 = await caller.list({ employeeId: liderado });
    expect(list0.dialogs).toHaveLength(0);

    const createRes = await caller.create({ employeeId: liderado });
    // Patch v6: criador polimorfico — C-level grava clevelId,
    // liderId permanece null (invariante XOR §10.1 v6).
    expect(createRes.dialog.clevelId).toBe(clevelDiretoId);
    expect(createRes.dialog.liderId).toBeNull();
    expect(createRes.dialog.employeeId).toBe(liderado);
    expect(createRes.dialog.status).toBe('verde');
    expect(createRes.dialog.pendencia).toBe(false);

    const dialogId = createRes.dialog.id;

    // UPDATE canonico bit-a-bit
    const updateRes = await caller.update({
      id: dialogId,
      titulo: 'Alinhamento C-level',
      corpo: 'Texto pelo lider direto C-level.',
      status: 'vermelho',
      pendencia: true,
    });
    expect(updateRes.dialog.titulo).toBe('Alinhamento C-level');
    expect(updateRes.dialog.corpo).toBe('Texto pelo lider direto C-level.');
    expect(updateRes.dialog.status).toBe('vermelho');
    expect(updateRes.dialog.pendencia).toBe(true);
    expect(updateRes.dialog.clevelId).toBe(clevelDiretoId);
    expect(updateRes.dialog.liderId).toBeNull();

    // list canonicamente inclui o novo dialogo
    const list1 = await caller.list({ employeeId: liderado });
    expect(list1.dialogs).toHaveLength(1);
    expect(list1.dialogs[0]?.clevelId).toBe(clevelDiretoId);

    // archive canonico
    const archiveRes = await caller.archive({ id: dialogId });
    expect(archiveRes.affected).toBe(1);

    const list2 = await caller.list({ employeeId: liderado });
    expect(list2.dialogs).toHaveLength(0);
  });
});
