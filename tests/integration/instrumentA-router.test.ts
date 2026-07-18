// ROIP APP 9BOX — teste de integracao do sub-router `instrumentA` (ME-039,
// editado em ME-042).
//
// Exercita as procedures canonicas `reopenResponse` (DOC 03 §6.8 sexta
// linha — ME-039) e `getInstrumentAStatus` (DOC 03 §6.8 segunda linha
// + §19.4 quinta linha — ME-042) contra MySQL real via
// `createCallerFactory`, mais os contratos publicos exportados
// (RV-13: mensagens literais, schemas Zod, constantes, tipos, factory).
// A ponta de escrita "normal" do Instrumento A vive no Route Handler
// canonico do portal, coberto pelo teste-irmao
// `tests/integration/portal-save-instrument-a.test.ts`. Aqui cobrimos:
//   - Contratos publicos exportados (mensagens, schemas, constantes,
//     enum de status, factory) — RV-13 exercitado.
//   - Matriz canonica de autorizacao (`reopenResponse` exclusivo
//     super_admin; `getInstrumentAStatus` — Bruno/RH empresa; Lider/
//     C-level cadeia direta; guard cruzado companyId §2.4).
//   - `reopenResponse` — sucesso canonico (INSERT em
//     `instrumentUnlockLog` com `instrumento='A'`, `expiraEm=now+24h`,
//     `houveAlteracao=false`, `ajusteRetroativo=false`); pre-condicao
//     de resposta previa existente (`MSG_REOPEN_SEM_RESPOSTA`);
//     rejeicao de janela empilhada (`MSG_REOPEN_JA_VIGENTE_A`);
//     companyId cruzado; justificativa 100-500 (§2).
//   - `getInstrumentAStatus` (ME-042) — total/respondidos/pendentes
//     canonicos; C-levels excluidos por construcao (§6.2); inativos
//     excluidos (§7.6 replicado); status 'pendente' vs 'atrasado'
//     conforme corte canonico dataCorte (§6.3 dia 10 do mes
//     subsequente); escopo por perfil (S066); helper canonico
//     `classifyStatusPendenciaA` (RV-13).
//
// Padrao S009 estendido (S076): uma company local por describe, CNPJ
// unico da faixa 10000000000740..7XX (ME-039 — faixa nova, disjunta
// das ME-038 720..729 e anteriores). ME-042 adiciona a faixa 750..759
// (cnpj distintos do plenitude/nineBox — 790..799). L32 cleanup em
// afterAll (todas as tabelas com FK compartilhada + fixture global
// superAdmins id=1 preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
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
  classifyStatusPendenciaA,
  createInstrumentARouter,
  DIMENSAO_SCHEMA_INSTRUMENT_A,
  findVigenteInstrumentUnlockA,
  type GetInstrumentAStatusResult,
  type InstrumentARouterDeps,
  ITEM_INDEX_SCHEMA_INSTRUMENT_A,
  ITEM_SCHEMA_INSTRUMENT_A,
  itensCobremGridCanonicoA,
  JUSTIFICATIVA_SCHEMA_INSTRUMENT_A,
  MSG_A_JA_ENVIADA,
  MSG_CLEVEL_NAO_RESPONDE_A,
  MSG_COMPANY_MISMATCH_A,
  MSG_EMPLOYEE_INATIVO_A,
  MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A,
  MSG_ITENS_INCOMPLETOS_A,
  MSG_REOPEN_JA_VIGENTE_A,
  MSG_REOPEN_SEM_RESPOSTA,
  MSG_TRIMESTRE_INVALIDO_STATUS_A,
  MSG_TRIMESTRE_NAO_ABERTO_A,
  NUM_DIMENSOES_A,
  NUM_ITENS_POR_DIMENSAO_A,
  NUM_ITENS_TOTAL_A,
  type ReopenResponseResult,
  scopedEmployeeIdsByLeaderA,
  STATUS_JANELA_INSTRUMENT_A_VALUES,
  STATUS_PENDENCIA_INSTRUMENT_A_VALUES,
  TRIMESTRE_INPUT_SCHEMA_STATUS_A,
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

// CNPJs canonicos por describe (S076 — faixa 740.. reservada para ME-039;
// faixa 750.. reservada para ME-042 status/pendencies do A).
const CNPJ_GUARDS = '10000000000740';
const CNPJ_GUARDS_OTHER = '10000000000741';
const CNPJ_REOPEN_OK = '10000000000742';
const CNPJ_REOPEN_SEM = '10000000000743';
const CNPJ_REOPEN_EMPILHA = '10000000000744';
const CNPJ_REOPEN_CROSS = '10000000000745';
const CNPJ_STATUS_EMPRESA = '10000000000750';
const CNPJ_STATUS_LIDER = '10000000000751';
const CNPJ_STATUS_CLEVEL = '10000000000752';
const CNPJ_STATUS_CROSS = '10000000000754';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // L32 — cleanup em ordem topologica FK (unlock -> responses ->
    // employeeLeaderHistory -> employees -> clevel -> companies) para
    // nao contaminar arquivos seguintes. Cobre tambem tabelas nao
    // criadas por este arquivo mas limpas por defesa.
    await client.db
      .delete(instrumentUnlockLog)
      .where(inArray(instrumentUnlockLog.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
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
  opts: {
    isRH?: boolean;
    isLider?: boolean;
    status?: 'ativo' | 'inativo';
    departamento?: 'Comercial' | 'Financeiro' | 'Diretoria';
    descricaoCBO?: string;
  } = {},
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
      descricaoCBO: opts.descricaoCBO ?? 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
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

// Contador para transferBatchId — sufixo unico de 36 chars por
// fixture (a coluna canonica exige char(36); o formato nao precisa
// ser valido conforme RFC — o schema so exige largura fixa).
let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me042A${seq}`.substring(0, 36).padEnd(36, '0');
}

/**
 * §6.8 segunda linha (ME-042) — vincula um liderado a um lider
 * (opcao A) ou a um C-level (opcao B). Exatamente um dos dois deve
 * ser passado. Cria uma linha `employeeLeaderHistory` com
 * `dataFim: null` (vinculo ativo — S066).
 */
async function linkLeaderA(
  employeeId: number,
  opts: { liderId?: number; clevelId?: number },
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: opts.liderId ?? null,
    clevelId: opts.clevelId ?? null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture ME-042 status/pendencies A',
    transferBatchId: nextTransferBatchId(),
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

// ============================================================
// ME-042 — getInstrumentAStatus (§6.8 segunda linha + §19.4 5a linha)
// ============================================================

describe('instrumentA — getInstrumentAStatus contratos e constantes', () => {
  it('STATUS_PENDENCIA_INSTRUMENT_A_VALUES = ["pendente","atrasado"]', () => {
    expect(STATUS_PENDENCIA_INSTRUMENT_A_VALUES).toEqual(['pendente', 'atrasado']);
  });

  it('TRIMESTRE_INPUT_SCHEMA_STATUS_A aceita `YYYY-QN`', () => {
    expect(TRIMESTRE_INPUT_SCHEMA_STATUS_A.safeParse('2025-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_STATUS_A.safeParse('2025-Q4').success).toBe(true);
  });

  it('TRIMESTRE_INPUT_SCHEMA_STATUS_A rejeita formato invalido', () => {
    const parsed = TRIMESTRE_INPUT_SCHEMA_STATUS_A.safeParse('20-Q1');
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.message).toBe(MSG_TRIMESTRE_INVALIDO_STATUS_A);
    }
  });

  it('classifyStatusPendenciaA — atrasado quando now > dataCorte', () => {
    // §6.3: dataCorte 2024-Q1 = 10/Abril 23:59:59 no fuso (default
    // America/Sao_Paulo). Um `now` em 20/Abril esta apos o corte.
    const now = new Date('2024-04-20T12:00:00Z');
    const status = classifyStatusPendenciaA('2024-Q1', 'America/Sao_Paulo', now);
    expect(status).toBe('atrasado');
  });

  it('classifyStatusPendenciaA — pendente quando now <= dataCorte', () => {
    // §6.1: janela aberta a partir de 16/Marco. Um `now` em 25/Marco
    // esta antes do corte de 10/Abril.
    const now = new Date('2024-03-25T12:00:00Z');
    const status = classifyStatusPendenciaA('2024-Q1', 'America/Sao_Paulo', now);
    expect(status).toBe('pendente');
  });

  it('classifyStatusPendenciaA — trimestre invalido cai em `pendente` (conservador)', () => {
    const now = new Date('2024-04-20T12:00:00Z');
    const status = classifyStatusPendenciaA('LIXO', 'America/Sao_Paulo', now);
    expect(status).toBe('pendente');
  });

  it('MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A e literal canonico', () => {
    expect(MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A).toBe('Empresa não encontrada.');
  });
});

describe('instrumentA — getInstrumentAStatus (escopo empresa)', () => {
  const NOW_ANTES_CORTE = new Date('2025-04-05T12:00:00Z');
  const NOW_DEPOIS_CORTE = new Date('2025-04-20T12:00:00Z');

  let companyId: number;
  let empRH: number;
  let empA: number;
  let empB: number;
  let empC: number;
  let empInativo: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS_EMPRESA);
    empRH = await createEmployee(companyId, { isRH: true });
    empA = await createEmployee(companyId, { departamento: 'Comercial' });
    empB = await createEmployee(companyId, { departamento: 'Financeiro' });
    empC = await createEmployee(companyId, { departamento: 'Comercial' });
    empInativo = await createEmployee(companyId, { status: 'inativo' });
    // empA respondeu (1 linha basta para "pelo menos uma resposta").
    await seedRespostaMinima(companyId, empA, '2025-Q1');
  });

  it('sem sessao -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const caller = factory(ctx(null));
    await expect(
      caller.getInstrumentAStatus({ companyId, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('Bruno consulta -> total = 5 ativos (4 + RH), respondidos = 1, pendentes = 4', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result: GetInstrumentAStatusResult = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.companyId).toBe(companyId);
    expect(result.trimestre).toBe('2025-Q1');
    // Inativo excluido: total = 4 (empRH + empA + empB + empC).
    expect(result.total).toBe(4);
    expect(result.respondidos).toBe(1);
    expect(result.pendentes).toHaveLength(3);
    // empA respondeu — nao esta na lista.
    const pendenteIds = result.pendentes.map((p) => p.employeeId);
    expect(pendenteIds).not.toContain(empA);
    expect(pendenteIds).not.toContain(empInativo);
    expect(pendenteIds).toContain(empB);
    expect(pendenteIds).toContain(empC);
    expect(pendenteIds).toContain(empRH);
    // Status canonico antes do corte -> pendente.
    for (const p of result.pendentes) {
      expect(p.status).toBe('pendente');
    }
  });

  it('depois do corte -> status = atrasado (S121)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DEPOIS_CORTE });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    for (const p of result.pendentes) {
      expect(p.status).toBe('atrasado');
    }
  });

  it('RH da mesma empresa -> mesmo resultado', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.total).toBe(4);
    expect(result.respondidos).toBe(1);
  });

  it('pendentes carregam nome, departamento, cargo canonicos', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    const pendB = result.pendentes.find((p) => p.employeeId === empB);
    expect(pendB).toBeDefined();
    expect(pendB!.departamento).toBe('Financeiro');
    expect(pendB!.cargo).toBe('Analista');
  });
});

describe('instrumentA — getInstrumentAStatus (escopo cadeia — lider)', () => {
  const NOW_ANTES_CORTE = new Date('2025-04-05T12:00:00Z');

  let companyId: number;
  let liderId: number;
  let outroLiderId: number;
  let liderado1: number;
  let liderado2: number;
  let alheio: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS_LIDER);
    liderId = await createEmployee(companyId, { isLider: true });
    outroLiderId = await createEmployee(companyId, { isLider: true });
    liderado1 = await createEmployee(companyId);
    liderado2 = await createEmployee(companyId);
    alheio = await createEmployee(companyId);
    await linkLeaderA(liderado1, { liderId });
    await linkLeaderA(liderado2, { liderId });
    await linkLeaderA(alheio, { liderId: outroLiderId });
    await seedRespostaMinima(companyId, liderado1, '2025-Q1');
  });

  it('Lider so ve liderados diretos (2), com 1 respondido', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('lider', liderId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.total).toBe(2);
    expect(result.respondidos).toBe(1);
    expect(result.pendentes).toHaveLength(1);
    expect(result.pendentes[0]!.employeeId).toBe(liderado2);
    expect(result.pendentes[0]!.status).toBe('pendente');
  });

  it('Outro lider so ve o proprio liderado (alheio) -> total = 1', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('lider', outroLiderId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.total).toBe(1);
    expect(result.pendentes[0]!.employeeId).toBe(alheio);
  });

  it('Lider sem liderados -> total = 0, pendentes = []', async () => {
    const semLideradosCompany = await createCompany('10000000000755');
    const liderSemLiderados = await createEmployee(semLideradosCompany, {
      isLider: true,
    });
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('lider', liderSemLiderados, semLideradosCompany);
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId: semLideradosCompany,
      trimestre: '2025-Q1',
    });
    expect(result.total).toBe(0);
    expect(result.pendentes).toHaveLength(0);
  });
});

describe('instrumentA — getInstrumentAStatus (escopo cadeia — clevel)', () => {
  const NOW_ANTES_CORTE = new Date('2025-04-05T12:00:00Z');

  let companyId: number;
  let clevelId: number;
  let liderado1: number;
  let liderado2: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS_CLEVEL);
    clevelId = await createClevel(companyId);
    liderado1 = await createEmployee(companyId);
    liderado2 = await createEmployee(companyId);
    await linkLeaderA(liderado1, { clevelId });
    await linkLeaderA(liderado2, { clevelId });
    await seedRespostaMinima(companyId, liderado2, '2025-Q1');
  });

  it('C-level so ve liderados diretos (2), com 1 respondido', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.getInstrumentAStatus({
      companyId,
      trimestre: '2025-Q1',
    });
    expect(result.total).toBe(2);
    expect(result.respondidos).toBe(1);
    expect(result.pendentes[0]!.employeeId).toBe(liderado1);
  });
});

describe('instrumentA — getInstrumentAStatus (cross-company e schema)', () => {
  const NOW_ANTES_CORTE = new Date('2025-04-05T12:00:00Z');

  let companyA: number;
  let companyB: number;
  let empRhA: number;

  beforeAll(async () => {
    companyA = await createCompany('10000000000756');
    companyB = await createCompany('10000000000757');
    empRhA = await createEmployee(companyA, { isRH: true });
  });

  it('RH de companyA passando companyB -> FORBIDDEN (§2.4)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenPlatform('rh', empRhA, companyA);
    const caller = factory(ctx(token));
    await expect(
      caller.getInstrumentAStatus({ companyId: companyB, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin com companyId inexistente -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.getInstrumentAStatus({ companyId: 999999999, trimestre: '2025-Q1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A });
  });

  it('trimestre invalido -> BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_CORTE });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.getInstrumentAStatus({ companyId: companyA, trimestre: '2025Q1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('instrumentA — scopedEmployeeIdsByLeaderA helper', () => {
  let companyId: number;
  let liderId: number;
  let clevelId: number;
  let liderado1: number;
  let liderado2: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS_CROSS);
    liderId = await createEmployee(companyId, { isLider: true });
    clevelId = await createClevel(companyId);
    liderado1 = await createEmployee(companyId);
    liderado2 = await createEmployee(companyId);
    await linkLeaderA(liderado1, { liderId });
    await linkLeaderA(liderado2, { clevelId });
  });

  it('liderId apenas -> retorna liderados diretos', async () => {
    const ids = await scopedEmployeeIdsByLeaderA(client.db, companyId, liderId, null);
    expect(ids).toContain(liderado1);
    expect(ids).not.toContain(liderado2);
  });

  it('clevelId apenas -> retorna liderados diretos', async () => {
    const ids = await scopedEmployeeIdsByLeaderA(client.db, companyId, null, clevelId);
    expect(ids).toContain(liderado2);
    expect(ids).not.toContain(liderado1);
  });

  it('ambos null -> array vazio (defesa)', async () => {
    const ids = await scopedEmployeeIdsByLeaderA(client.db, companyId, null, null);
    expect(ids).toEqual([]);
  });
});
