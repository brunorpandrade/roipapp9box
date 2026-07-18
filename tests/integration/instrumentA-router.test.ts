// ROIP APP 9BOX — teste de integracao do sub-router `instrumentA` (ME-039).
//
// Exercita a procedure canonica `reopenResponse` (DOC 03 §6.8 sexta
// linha) contra MySQL real via `createCallerFactory`, mais os contratos
// publicos exportados (RV-13: mensagens literais, schemas Zod,
// constantes, tipos, factory). O escopo tRPC desta ME e enxuto — a
// ponta de escrita "normal" do Instrumento A vive no Route Handler
// canonico do portal, coberto pelo teste-irmao
// `tests/integration/portal-save-instrument-a.test.ts`. Aqui cobrimos:
//   - Contratos publicos exportados (mensagens, schemas, constantes,
//     enum de status, factory) — RV-13 exercitado.
//   - Matriz canonica de autorizacao (`reopenResponse` exclusivo
//     super_admin; guard cruzado companyId §2.4).
//   - `reopenResponse` — sucesso canonico (INSERT em
//     `instrumentUnlockLog` com `instrumento='A'`, `expiraEm=now+24h`,
//     `houveAlteracao=false`, `ajusteRetroativo=false`); pre-condicao
//     de resposta previa existente (`MSG_REOPEN_SEM_RESPOSTA`);
//     rejeicao de janela empilhada (`MSG_REOPEN_JA_VIGENTE_A`);
//     companyId cruzado; justificativa 100-500 (§2).
//
// Padrao S009 estendido (S076): uma company local por describe, CNPJ
// unico da faixa 10000000000740..7XX (ME-039 — faixa nova, disjunta
// das ME-038 720..729 e anteriores). L32 cleanup em afterAll (todas
// as tabelas com FK compartilhada + fixture global superAdmins id=1
// preservada). JWT_SECRET fixo no arquivo. Padrao herdado literal do
// `instrumentC-router.test.ts` (ME-038) para consistencia auditavel.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  instrumentA_responses,
  instrumentUnlockLog,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createInstrumentARouter,
  DIMENSAO_SCHEMA_INSTRUMENT_A,
  findVigenteInstrumentUnlockA,
  type InstrumentARouterDeps,
  ITEM_INDEX_SCHEMA_INSTRUMENT_A,
  ITEM_SCHEMA_INSTRUMENT_A,
  itensCobremGridCanonicoA,
  JUSTIFICATIVA_SCHEMA_INSTRUMENT_A,
  MSG_A_JA_ENVIADA,
  MSG_CLEVEL_NAO_RESPONDE_A,
  MSG_COMPANY_MISMATCH_A,
  MSG_EMPLOYEE_INATIVO_A,
  MSG_ITENS_INCOMPLETOS_A,
  MSG_REOPEN_JA_VIGENTE_A,
  MSG_REOPEN_SEM_RESPOSTA,
  MSG_TRIMESTRE_NAO_ABERTO_A,
  NUM_DIMENSOES_A,
  NUM_ITENS_POR_DIMENSAO_A,
  NUM_ITENS_TOTAL_A,
  type ReopenResponseResult,
  STATUS_JANELA_INSTRUMENT_A_VALUES,
  TRIMESTRE_SCHEMA_INSTRUMENT_A,
  UNLOCK_WINDOW_HOURS_A,
  VALOR_MAX_A,
  VALOR_MIN_A,
  VALOR_SCHEMA_INSTRUMENT_A,
} from '../../src/server/routers/instrumentA';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me039-instrumentA';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me039-instrumentA';

// CNPJs canonicos por describe (S076 — faixa 740.. reservada para ME-039).
const CNPJ_GUARDS = '10000000000740';
const CNPJ_GUARDS_OTHER = '10000000000741';
const CNPJ_REOPEN_OK = '10000000000742';
const CNPJ_REOPEN_SEM = '10000000000743';
const CNPJ_REOPEN_EMPILHA = '10000000000744';
const CNPJ_REOPEN_CROSS = '10000000000745';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // L32 — cleanup em ordem topologica FK (unlock -> responses ->
    // employees -> clevel -> companies) para nao contaminar arquivos
    // seguintes. Cobre tambem tabelas nao criadas por este arquivo mas
    // limpas por defesa.
    await client.db
      .delete(instrumentUnlockLog)
      .where(inArray(instrumentUnlockLog.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
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
      razaoSocial: `ME039 Test ${cnpj} LTDA`,
      nomeFantasia: `ME039 Test ${cnpj}`,
      cnpj,
      telefone: '1633330039',
      endereco: `Rua ME-039, ${cnpj}`,
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

let cpfCounter = 39000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: { isRH?: boolean; isLider?: boolean } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME039',
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
      isRH: opts.isRH ?? false,
      isLider: opts.isLider ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'C-Level ME039',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

/**
 * Insere uma resposta canonica minima (1 item) apenas para satisfazer
 * a pre-condicao "resposta previa existente" do `reopenResponse`. Testes
 * do Route Handler cobrem a insercao completa dos 20 itens.
 */
async function seedRespostaMinima(
  companyId: number,
  employeeId: number,
  trimestre: string,
  respondidoEm = new Date('2024-03-20T12:00:00Z'),
): Promise<void> {
  await client.db.insert(instrumentA_responses).values({
    companyId,
    employeeId,
    trimestre,
    dimensao: 1,
    itemIndex: 1,
    valor: 3,
    respondidoEm,
    createdAt: respondidoEm,
  });
}

/**
 * Insere um `instrumentUnlockLog` vigente do tipo 'A' — usado para
 * testar rejeicao de janela empilhada.
 */
async function seedUnlockAVigente(
  companyId: number,
  employeeId: number,
  trimestre: string,
  now: Date,
  ttlHours: number = UNLOCK_WINDOW_HOURS_A,
): Promise<void> {
  await client.db.insert(instrumentUnlockLog).values({
    companyId,
    employeeId,
    trimestre,
    instrumento: 'A',
    desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
    justificativa: 'j'.repeat(120),
    desbloqueadoEm: now,
    expiraEm: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
    houveAlteracao: false,
    ajusteRetroativo: false,
    createdAt: now,
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

function bindRouter(deps: InstrumentARouterDeps = {}) {
  const testRouter = createInstrumentARouter(deps);
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// `now` fixo canonico (dentro da janela 2024-Q1 aberta desde 16/Mar/2024
// no fuso America/Sao_Paulo). Reopen do A independe do estado da janela
// canonica — pode ser chamado a qualquer momento pos-envio, inclusive
// tardio; o clock injetado apenas fixa `desbloqueadoEm` e `expiraEm`.
const NOW_CANONICO = new Date('2024-04-15T12:00:00Z');

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('instrumentA — contratos publicos exportados', () => {
  it('mensagens literais canonicas batem o texto exato', () => {
    expect(MSG_A_JA_ENVIADA).toBe(
      'Instrumento A já enviado para este trimestre. Solicite desbloqueio a Bruno se necessário.',
    );
    expect(MSG_TRIMESTRE_NAO_ABERTO_A).toBe(
      'Instrumento A ainda não disponível para este trimestre.',
    );
    expect(MSG_ITENS_INCOMPLETOS_A).toBe(
      'O Instrumento A exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.',
    );
    expect(MSG_CLEVEL_NAO_RESPONDE_A).toBe('C-level não responde ao Instrumento A.');
    expect(MSG_COMPANY_MISMATCH_A).toBe('Colaborador não pertence à sua empresa.');
    expect(MSG_EMPLOYEE_INATIVO_A).toBe('Colaborador inativo não responde ao Instrumento A.');
    expect(MSG_REOPEN_SEM_RESPOSTA).toBe(
      'Não há resposta registrada para este colaborador neste trimestre.',
    );
    expect(MSG_REOPEN_JA_VIGENTE_A).toBe(
      'Já existe desbloqueio vigente para este colaborador neste trimestre.',
    );
  });

  it('constantes canonicas do grid batem o §6.2', () => {
    expect(NUM_DIMENSOES_A).toBe(4);
    expect(NUM_ITENS_POR_DIMENSAO_A).toBe(5);
    expect(NUM_ITENS_TOTAL_A).toBe(20);
    expect(VALOR_MIN_A).toBe(0);
    expect(VALOR_MAX_A).toBe(4);
  });

  it('janela canonica de desbloqueio e 24 horas', () => {
    expect(UNLOCK_WINDOW_HOURS_A).toBe(24);
  });

  it('enum de status da janela bate o canonico §6.1 + §6.7 (A NAO fecha)', () => {
    // Diferente do C, o A tem apenas 3 estados (nao ha `fechada`).
    expect([...STATUS_JANELA_INSTRUMENT_A_VALUES]).toEqual([
      'nao_aberta',
      'aberta',
      'desbloqueada',
    ]);
  });

  it('schema de trimestre aceita YYYY-QN e rejeita malformados', () => {
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('2024-Q1').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('2024-Q4').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('2024-Q5').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('2024-Q0').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('24-Q1').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse('2024-01').success).toBe(false);
  });

  it('schema de dimensao aceita 1..4 e rejeita fora', () => {
    expect(DIMENSAO_SCHEMA_INSTRUMENT_A.safeParse(1).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_A.safeParse(4).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_A.safeParse(0).success).toBe(false);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_A.safeParse(5).success).toBe(false);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_A.safeParse(1.5).success).toBe(false);
  });

  it('schema de itemIndex aceita 1..5 e rejeita fora', () => {
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_A.safeParse(1).success).toBe(true);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_A.safeParse(5).success).toBe(true);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_A.safeParse(0).success).toBe(false);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_A.safeParse(6).success).toBe(false);
  });

  it('schema de valor aceita 0..4 e rejeita fora', () => {
    expect(VALOR_SCHEMA_INSTRUMENT_A.safeParse(0).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_A.safeParse(4).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_A.safeParse(-1).success).toBe(false);
    expect(VALOR_SCHEMA_INSTRUMENT_A.safeParse(5).success).toBe(false);
  });

  it('schema de item compoe as 3 chaves canonicas', () => {
    expect(
      ITEM_SCHEMA_INSTRUMENT_A.safeParse({ dimensao: 1, itemIndex: 1, valor: 3 }).success,
    ).toBe(true);
    expect(
      ITEM_SCHEMA_INSTRUMENT_A.safeParse({ dimensao: 1, itemIndex: 1, valor: 9 }).success,
    ).toBe(false);
  });

  it('schema de justificativa impoe o padrao 100-500 (§2)', () => {
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_A.safeParse('x'.repeat(99)).success).toBe(false);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_A.safeParse('x'.repeat(100)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_A.safeParse('x'.repeat(500)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_A.safeParse('x'.repeat(501)).success).toBe(false);
  });

  it('itensCobremGridCanonicoA verifica cobertura completa 4x5', () => {
    const gridOk: { dimensao: number; itemIndex: number }[] = [];
    for (let d = 1; d <= 4; d++) {
      for (let i = 1; i <= 5; i++) {
        gridOk.push({ dimensao: d, itemIndex: i });
      }
    }
    expect(itensCobremGridCanonicoA(gridOk)).toBe(true);
    expect(itensCobremGridCanonicoA(gridOk.slice(0, 19))).toBe(false); // lacuna
    const gridDup = [...gridOk.slice(0, 19), { dimensao: 1, itemIndex: 1 }];
    expect(itensCobremGridCanonicoA(gridDup)).toBe(false); // duplicata
    expect(itensCobremGridCanonicoA([])).toBe(false);
  });
});

// ============================================================
// 1) Autorizacao
// ============================================================

describe('instrumentA — autorizacao canonica', () => {
  let companyId: number;
  let empRH: number;
  let empColab: number;
  let empLider: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    // Segunda company reservada (nao referenciada aqui, mas cria a
    // faixa de CNPJ pertencente ao describe para nao colidir com o
    // caso `guard cruzado companyId` mais abaixo).
    await createCompany(CNPJ_GUARDS_OTHER);
    empRH = await createEmployee(companyId, { isRH: true });
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    clevelId = await createClevel(companyId);
  });

  it('reopenResponse: sem token -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const caller = factory(ctx(null));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reopenResponse: RH (nao super_admin) -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reopenResponse: rh_lider -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenPlatform('rh_lider', empRH, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reopenResponse: lider -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reopenResponse: clevel -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    // C-level real (passa autenticacao, e rejeitado pelo roleProcedure).
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reopenResponse: schema de justificativa < 100 -> BAD_REQUEST (Zod)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'x'.repeat(50),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('reopenResponse: schema de trimestre malformado -> BAD_REQUEST (Zod)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-01',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 2) reopenResponse — sucesso canonico
// ============================================================

describe('instrumentA — reopenResponse (sucesso canonico)', () => {
  let companyId: number;
  let empColab: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REOPEN_OK);
    empColab = await createEmployee(companyId);
  });

  it('cria linha canonica em unlockLog: instrumento=A, expiraEm=now+24h', async () => {
    const trimestre = '2024-Q1';
    await seedRespostaMinima(companyId, empColab, trimestre);

    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    const res: ReopenResponseResult = await caller.reopenResponse({
      companyId,
      employeeId: empColab,
      trimestre,
      justificativa: 'Correção canônica solicitada por Bruno após auditoria interna. '.repeat(2),
    });

    expect(res.unlockLogId).toBeGreaterThan(0);
    expect(res.expiraEm.getTime()).toBe(
      NOW_CANONICO.getTime() + UNLOCK_WINDOW_HOURS_A * 60 * 60 * 1000,
    );

    // Verifica linha persistida canonica.
    const [row] = await client.db
      .select()
      .from(instrumentUnlockLog)
      .where(eq(instrumentUnlockLog.id, res.unlockLogId));
    expect(row).toBeDefined();
    expect(row!.instrumento).toBe('A');
    expect(row!.companyId).toBe(companyId);
    expect(row!.employeeId).toBe(empColab);
    expect(row!.trimestre).toBe(trimestre);
    expect(row!.desbloqueadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(row!.houveAlteracao).toBe(false);
    expect(row!.ajusteRetroativo).toBe(false);
    // desbloqueadoEm nao e null (foi setado pelo insert)
    expect(row!.desbloqueadoEm).not.toBeNull();
    // Justificativa dentro de 100-500
    expect(row!.justificativa.length).toBeGreaterThanOrEqual(100);
    expect(row!.justificativa.length).toBeLessThanOrEqual(500);
  });

  it('findVigenteInstrumentUnlockA retorna a linha apos reopen bem-sucedido', async () => {
    // Reutiliza o linha criada acima — busca vigencia.
    const found = await findVigenteInstrumentUnlockA(
      client.db,
      empColab,
      '2024-Q1',
      NOW_CANONICO, // now identico -> expiraEm > now por 24h
    );
    expect(found).toBeDefined();
    expect(found!.instrumento).toBe('A');
    expect(found!.employeeId).toBe(empColab);
  });

  it('findVigenteInstrumentUnlockA retorna undefined apos janela expirar', async () => {
    // 25h apos NOW_CANONICO -> expiraEm ja passou
    const nowFuturo = new Date(NOW_CANONICO.getTime() + 25 * 60 * 60 * 1000);
    const found = await findVigenteInstrumentUnlockA(client.db, empColab, '2024-Q1', nowFuturo);
    expect(found).toBeUndefined();
  });
});

// ============================================================
// 3) reopenResponse — pre-condicao: sem resposta previa
// ============================================================

describe('instrumentA — reopenResponse (sem resposta previa)', () => {
  let companyId: number;
  let empColab: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REOPEN_SEM);
    empColab = await createEmployee(companyId);
  });

  it('sem resposta previa -> CONFLICT MSG_REOPEN_SEM_RESPOSTA', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_REOPEN_SEM_RESPOSTA });
  });

  it('resposta em OUTRO trimestre nao satisfaz a pre-condicao', async () => {
    await seedRespostaMinima(companyId, empColab, '2024-Q2');

    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1', // outro trimestre — sem resposta previa
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_REOPEN_SEM_RESPOSTA });
  });
});

// ============================================================
// 4) reopenResponse — rejeicao de janela empilhada
// ============================================================

describe('instrumentA — reopenResponse (janela empilhada)', () => {
  let companyId: number;
  let empColab: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REOPEN_EMPILHA);
    empColab = await createEmployee(companyId);
  });

  it('janela vigente ja existente -> CONFLICT MSG_REOPEN_JA_VIGENTE_A', async () => {
    const trimestre = '2024-Q1';
    await seedRespostaMinima(companyId, empColab, trimestre);
    await seedUnlockAVigente(companyId, empColab, trimestre, NOW_CANONICO);

    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    await expect(
      caller.reopenResponse({
        companyId,
        employeeId: empColab,
        trimestre,
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_REOPEN_JA_VIGENTE_A });
  });

  it('apos janela expirar, novo reopen e permitido (nao empilha, mas re-abre)', async () => {
    const trimestre = '2024-Q2';
    // Semeia resposta previa nesse trimestre
    await seedRespostaMinima(companyId, empColab, trimestre);
    // Semeia unlock ja vencido (expiraEm no passado)
    const nowPassado = new Date(NOW_CANONICO.getTime() - 48 * 60 * 60 * 1000);
    await seedUnlockAVigente(companyId, empColab, trimestre, nowPassado, 1);

    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    const res = await caller.reopenResponse({
      companyId,
      employeeId: empColab,
      trimestre,
      justificativa: 'j'.repeat(120),
    });
    expect(res.unlockLogId).toBeGreaterThan(0);

    // Verifica que ha 2 linhas: a vencida + a nova; a vigente e a nova.
    const rows = await client.db
      .select()
      .from(instrumentUnlockLog)
      .where(
        and(
          eq(instrumentUnlockLog.employeeId, empColab),
          eq(instrumentUnlockLog.trimestre, trimestre),
          eq(instrumentUnlockLog.instrumento, 'A'),
        ),
      );
    expect(rows.length).toBe(2);
  });
});

// ============================================================
// 5) reopenResponse — companyId cruzado (§2.4)
// ============================================================

describe('instrumentA — reopenResponse (guard cruzado companyId)', () => {
  let companyIdA: number;
  let companyIdB: number;
  let empColabA: number;

  beforeAll(async () => {
    companyIdA = await createCompany(CNPJ_REOPEN_CROSS);
    companyIdB = await createCompany('10000000000746');
    empColabA = await createEmployee(companyIdA);
    await seedRespostaMinima(companyIdA, empColabA, '2024-Q1');
  });

  it('super_admin com companyId errado -> FORBIDDEN MSG_COMPANY_MISMATCH_A', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    await expect(
      caller.reopenResponse({
        companyId: companyIdB, // colaborador NAO pertence a esta empresa
        employeeId: empColabA,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_A });
  });

  it('employeeId inexistente -> FORBIDDEN MSG_COMPANY_MISMATCH_A', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_CANONICO });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));

    await expect(
      caller.reopenResponse({
        companyId: companyIdA,
        employeeId: 999999999,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_A });
  });
});
