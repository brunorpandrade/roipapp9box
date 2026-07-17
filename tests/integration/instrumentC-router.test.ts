// ROIP APP 9BOX — teste de integracao do sub-router `instrumentC` (ME-038).
//
// Exercita as 3 procedures canonicas do escopo S089 (DOC 03 §6.3, §6.7,
// §6.8) contra MySQL real via `createCallerFactory`. Cobre:
//   - Contratos publicos exportados (RV-13): mensagens literais,
//     schemas Zod, constantes, tipos, factory.
//   - Matriz canonica de autorizacao (roleProcedure + guard cruzado
//     companyId no handler §2.4).
//   - `saveInstrumentCAssessment` — insert atomico dos 20 itens (§6.3),
//     XOR liderId/clevelId, cobertura do grid canonico 4x5, valor 0-4,
//     validacao de vinculo direto (RH/super_admin pulam; lider/clevel
//     em nome proprio contra `employeeLeaderHistory` ativa), janela do
//     trimestre (nao_aberta/aberta/fechada — timezone da empresa),
//     semantica S090 (segundo submit sem desbloqueio -> 409; com
//     desbloqueio vigente -> OVERWRITE), companyId cruzado.
//   - `getAssessment` — leitura ordenada, `statusJanela` nos 4 estados
//     canonicos, resumo do desbloqueio vigente, avaliador (liderId XOR
//     clevelId) da primeira linha.
//   - `reopenAssessment` — exclusivo super_admin (S086 estendido a C),
//     pre-condicao de avaliacao previa, rejeita janela empilhada,
//     justificativa 100-500, insere linha canonica com
//     `instrumento='C'` e `expiraEm=now+24h`.
//
// Padrao S009 estendido (S076): uma company local por describe, CNPJ
// unico da faixa 10000000000720..7XX (ME-038). L32 cleanup em afterAll
// (todas as tabelas com FK compartilhada + fixture global superAdmins
// id=1 preservada). JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentC_assessments,
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
  createInstrumentCRouter,
  DIMENSAO_SCHEMA_INSTRUMENT_C,
  type GetAssessmentResult,
  type InstrumentCRouterDeps,
  ITEM_INDEX_SCHEMA_INSTRUMENT_C,
  ITEM_SCHEMA_INSTRUMENT_C,
  JUSTIFICATIVA_SCHEMA_INSTRUMENT_C,
  MSG_AVALIADOR_XOR,
  MSG_COMPANY_MISMATCH_EMP,
  MSG_ITENS_INCOMPLETOS,
  MSG_LIDER_NAO_DIRETO,
  MSG_REOPEN_JA_VIGENTE,
  MSG_REOPEN_SEM_AVALIACAO,
  MSG_TRIMESTRE_FECHADO,
  MSG_TRIMESTRE_NAO_ABERTO,
  NUM_DIMENSOES,
  NUM_ITENS_POR_DIMENSAO,
  NUM_ITENS_TOTAL,
  type ReopenAssessmentResult,
  type SaveInstrumentCAssessmentResult,
  STATUS_JANELA_INSTRUMENT_C_VALUES,
  TRIMESTRE_SCHEMA_INSTRUMENT_C,
  UNLOCK_WINDOW_HOURS,
  VALOR_MAX,
  VALOR_MIN,
  VALOR_SCHEMA_INSTRUMENT_C,
} from '../../src/server/routers/instrumentC';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me038-instrumentC';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me038-instrumentC';

// CNPJs canonicos por describe (S076 — faixa 720.. reservada para ME-038).
const CNPJ_GUARDS = '10000000000720';
const CNPJ_GUARDS_OTHER = '10000000000721';
const CNPJ_SAVE_INSERT = '10000000000722';
const CNPJ_SAVE_XOR = '10000000000723';
const CNPJ_SAVE_GRID = '10000000000724';
const CNPJ_SAVE_JANELA = '10000000000725';
const CNPJ_SAVE_VINCULO = '10000000000726';
const CNPJ_SAVE_OVERWRITE = '10000000000727';
const CNPJ_GET = '10000000000728';
const CNPJ_REOPEN = '10000000000729';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(instrumentUnlockLog)
      .where(inArray(instrumentUnlockLog.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentC_assessments)
      .where(inArray(instrumentC_assessments.companyId, createdCompanyIds));
    await client.db
      .delete(employeeLeaderHistory)
      .where(
        inArray(
          employeeLeaderHistory.employeeId,
          client.db
            .select({ id: employees.id })
            .from(employees)
            .where(inArray(employees.companyId, createdCompanyIds)),
        ),
      );
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
      razaoSocial: `ME038 Test ${cnpj} LTDA`,
      nomeFantasia: `ME038 Test ${cnpj}`,
      cnpj,
      telefone: '1633330038',
      endereco: `Rua ME-038, ${cnpj}`,
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

let cpfCounter = 38000000000;
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
      name: 'Colab ME038',
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

async function createClevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'C-Level ME038',
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

async function bindVinculoLider(
  employeeId: number,
  liderId: number,
  dataInicio = new Date('2024-01-01'),
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio,
    dataFim: null,
    reason: 'Vinculo canonico ME-038',
    transferBatchId: `me038-${employeeId}-${liderId}`.padEnd(36, '0').slice(0, 36),
  });
}

async function bindVinculoClevel(
  employeeId: number,
  clevelId: number,
  dataInicio = new Date('2024-01-01'),
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: null,
    clevelId,
    dataInicio,
    dataFim: null,
    reason: 'Vinculo canonico ME-038 (C-level)',
    transferBatchId: `me038c-${employeeId}-${clevelId}`.padEnd(36, '0').slice(0, 36),
  });
}

/** Grid canonico completo: 4 dimensoes x 5 itens x valor default 3. */
function gridCanonico(
  valorDefault: number = 3,
): { dimensao: number; itemIndex: number; valor: number }[] {
  const respostas: { dimensao: number; itemIndex: number; valor: number }[] = [];
  for (let d = 1; d <= NUM_DIMENSOES; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO; i++) {
      respostas.push({ dimensao: d, itemIndex: i, valor: valorDefault });
    }
  }
  return respostas;
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

function bindRouter(deps: InstrumentCRouterDeps = {}) {
  const testRouter = createInstrumentCRouter(deps);
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// Timezone default do fixture (America/Sao_Paulo). `now` fixo dentro da
// janela canonica de 2024-Q1 (que abre 16/Mar/2024 e fecha 10/Abr/2024
// 23:59:59 SP -> 03:00:00 UTC de 11/Abr/2024).
const NOW_ABERTO_Q1_2024 = new Date('2024-03-20T12:00:00Z');
const NOW_FECHADO_Q1_2024 = new Date('2024-04-15T12:00:00Z');
const NOW_ANTES_ABERTURA_Q1_2024 = new Date('2024-03-15T12:00:00Z');

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('instrumentC — contratos publicos exportados', () => {
  it('mensagens literais canonicas batem o texto exato', () => {
    expect(MSG_TRIMESTRE_FECHADO).toBe(
      'Instrumento C fechado para este trimestre. Solicite desbloqueio a Bruno se necessário.',
    );
    expect(MSG_TRIMESTRE_NAO_ABERTO).toBe(
      'Instrumento C ainda não disponível para este trimestre.',
    );
    expect(MSG_ITENS_INCOMPLETOS).toBe(
      'O Instrumento C exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.',
    );
    expect(MSG_AVALIADOR_XOR).toBe(
      'Informe apenas um avaliador: liderId (líder colaborador) ou clevelId (líder C-level).',
    );
    expect(MSG_LIDER_NAO_DIRETO).toBe(
      'Somente o líder direto atual pode avaliar este colaborador.',
    );
    expect(MSG_COMPANY_MISMATCH_EMP).toBe('Colaborador não pertence à sua empresa.');
    expect(MSG_REOPEN_SEM_AVALIACAO).toBe(
      'Não há avaliação registrada para este colaborador neste trimestre.',
    );
    expect(MSG_REOPEN_JA_VIGENTE).toBe(
      'Já existe desbloqueio vigente para este colaborador neste trimestre.',
    );
  });

  it('constantes canonicas do grid batem o §6.3', () => {
    expect(NUM_DIMENSOES).toBe(4);
    expect(NUM_ITENS_POR_DIMENSAO).toBe(5);
    expect(NUM_ITENS_TOTAL).toBe(20);
    expect(VALOR_MIN).toBe(0);
    expect(VALOR_MAX).toBe(4);
  });

  it('janela canonica de desbloqueio e 24 horas', () => {
    expect(UNLOCK_WINDOW_HOURS).toBe(24);
  });

  it('enum de status da janela bate o canonico §6.1 + §6.7', () => {
    expect([...STATUS_JANELA_INSTRUMENT_C_VALUES]).toEqual([
      'nao_aberta',
      'aberta',
      'fechada',
      'desbloqueada',
    ]);
  });

  it('schema de trimestre aceita YYYY-QN e rejeita malformados', () => {
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('2024-Q1').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('2024-Q4').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('2024-Q5').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('2024-Q0').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('24-Q1').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_C.safeParse('2024-01').success).toBe(false);
  });

  it('schema de dimensao aceita 1..4 e rejeita fora', () => {
    expect(DIMENSAO_SCHEMA_INSTRUMENT_C.safeParse(1).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_C.safeParse(4).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_C.safeParse(0).success).toBe(false);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_C.safeParse(5).success).toBe(false);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_C.safeParse(1.5).success).toBe(false);
  });

  it('schema de itemIndex aceita 1..5 e rejeita fora', () => {
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_C.safeParse(1).success).toBe(true);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_C.safeParse(5).success).toBe(true);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_C.safeParse(0).success).toBe(false);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_C.safeParse(6).success).toBe(false);
  });

  it('schema de valor aceita 0..4 e rejeita fora', () => {
    expect(VALOR_SCHEMA_INSTRUMENT_C.safeParse(0).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_C.safeParse(4).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_C.safeParse(-1).success).toBe(false);
    expect(VALOR_SCHEMA_INSTRUMENT_C.safeParse(5).success).toBe(false);
  });

  it('schema de item compoe as 3 chaves canonicas', () => {
    expect(
      ITEM_SCHEMA_INSTRUMENT_C.safeParse({ dimensao: 1, itemIndex: 1, valor: 3 }).success,
    ).toBe(true);
    expect(
      ITEM_SCHEMA_INSTRUMENT_C.safeParse({ dimensao: 1, itemIndex: 1, valor: 9 }).success,
    ).toBe(false);
  });

  it('schema de justificativa impoe o padrao 100-500 (§2)', () => {
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_C.safeParse('x'.repeat(99)).success).toBe(false);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_C.safeParse('x'.repeat(100)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_C.safeParse('x'.repeat(500)).success).toBe(true);
    expect(JUSTIFICATIVA_SCHEMA_INSTRUMENT_C.safeParse('x'.repeat(501)).success).toBe(false);
  });
});

// ============================================================
// 1) Autorizacao
// ============================================================

describe('instrumentC — autorizacao canonica', () => {
  let companyId: number;
  let otherCompanyId: number;
  let empRH: number;
  let empRHOther: number;
  let empRHLider: number;
  let empColab: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    otherCompanyId = await createCompany(CNPJ_GUARDS_OTHER);
    empRH = await createEmployee(companyId, { isRH: true });
    empRHLider = await createEmployee(companyId, { isRH: true, isLider: true });
    empRHOther = await createEmployee(otherCompanyId, { isRH: true });
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await bindVinculoLider(empColab, empLider);
  });

  it('saveInstrumentCAssessment: sem token -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(null));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('saveInstrumentCAssessment: RH de outra empresa -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('rh', empRHOther, otherCompanyId);
    const caller = factory(ctx(token));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('getAssessment: sem token -> UNAUTHORIZED', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(null));
    await expect(
      caller.getAssessment({ companyId, employeeId: empColab, trimestre: '2024-Q1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getAssessment: RH da propria empresa atravessa', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empColab,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('aberta');
    expect(res.respostas).toEqual([]);
  });

  it('getAssessment: rh_lider da propria empresa atravessa', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('rh_lider', empRHLider, companyId);
    const caller = factory(ctx(token));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empColab,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('aberta');
  });

  it('reopenAssessment: RH (nao super_admin) -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_FECHADO_Q1_2024 });
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reopenAssessment: lider -> FORBIDDEN (exclusivo Bruno)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_FECHADO_Q1_2024 });
    const token = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(120),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 2) saveInstrumentCAssessment — insert canonico
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (insert)', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;
  let empRH: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_INSERT);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    empRH = await createEmployee(companyId, { isRH: true });
    await bindVinculoLider(empColab, empLider);
  });

  it('lider proprio insere 20 itens em transacao atomica', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('lider', empLider, companyId);
    const caller = factory(ctx(token));
    const res: SaveInstrumentCAssessmentResult = await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empColab,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.itensGravados).toBe(NUM_ITENS_TOTAL);
    expect(res.operacao).toBe('insert');
    expect(res.respondidoEm.getTime()).toBe(NOW_ABERTO_Q1_2024.getTime());

    const linhas = await client.db
      .select()
      .from(instrumentC_assessments)
      .where(
        and(
          eq(instrumentC_assessments.employeeId, empColab),
          eq(instrumentC_assessments.trimestre, '2024-Q1'),
        ),
      );
    expect(linhas.length).toBe(NUM_ITENS_TOTAL);
    // Todas as linhas apontam para o mesmo avaliador (liderId).
    for (const l of linhas) {
      expect(l.liderId).toBe(empLider);
      expect(l.clevelId).toBeNull();
      expect(l.companyId).toBe(companyId);
      expect(l.valor).toBe(3);
    }
  });

  it('RH insere para colaborador com liderId de referencia (RH pula vinculo)', async () => {
    const outroColab = await createEmployee(companyId);
    const outroLider = await createEmployee(companyId, { isLider: true });
    // Sem bindVinculoLider — RH pula validacao de vinculo (§6.3).
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('rh', empRH, companyId);
    const caller = factory(ctx(token));
    const res = await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: outroColab,
      liderId: outroLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(2),
    });
    expect(res.operacao).toBe('insert');
    expect(res.itensGravados).toBe(NUM_ITENS_TOTAL);
  });

  it('super_admin insere para qualquer empresa (atravessa guard §2.4)', async () => {
    const outroColab = await createEmployee(companyId);
    const outroLider = await createEmployee(companyId, { isLider: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: outroColab,
      liderId: outroLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(4),
    });
    expect(res.operacao).toBe('insert');
  });

  it('clevel proprio insere com clevelId apontando para si', async () => {
    const outroColab = await createEmployee(companyId);
    const cl = await createClevel(companyId);
    await bindVinculoClevel(outroColab, cl);
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenPlatform('clevel', cl, companyId);
    const caller = factory(ctx(token));
    const res = await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: outroColab,
      clevelId: cl,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.operacao).toBe('insert');
    const linhas = await client.db
      .select()
      .from(instrumentC_assessments)
      .where(
        and(
          eq(instrumentC_assessments.employeeId, outroColab),
          eq(instrumentC_assessments.trimestre, '2024-Q1'),
        ),
      );
    expect(linhas[0]!.clevelId).toBe(cl);
    expect(linhas[0]!.liderId).toBeNull();
  });

  it('colaborador de outra empresa -> FORBIDDEN', async () => {
    const outraCompanyId = await createCompany('10000000000730');
    const empOutra = await createEmployee(outraCompanyId);
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empOutra,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
  });
});

// ============================================================
// 3) saveInstrumentCAssessment — XOR liderId/clevelId
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (XOR avaliador)', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;
  let cl: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_XOR);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    cl = await createClevel(companyId);
    await bindVinculoLider(empColab, empLider);
  });

  it('nem liderId nem clevelId -> Zod rejeita com MSG_AVALIADOR_XOR', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('ambos liderId e clevelId -> Zod rejeita com MSG_AVALIADOR_XOR', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        clevelId: cl,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 4) saveInstrumentCAssessment — grid canonico 4x5
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (grid canonico)', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_GRID);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await bindVinculoLider(empColab, empLider);
  });

  it('menos de 20 itens -> BAD_REQUEST com MSG_ITENS_INCOMPLETOS', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    const respostasCurtas = gridCanonico().slice(0, 19);
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: respostasCurtas,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_ITENS_INCOMPLETOS });
  });

  it('mais de 20 itens (duplicata) -> BAD_REQUEST com MSG_ITENS_INCOMPLETOS', async () => {
    const respostas = gridCanonico();
    respostas.push({ dimensao: 1, itemIndex: 1, valor: 2 });
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_ITENS_INCOMPLETOS });
  });

  it('20 itens com lacuna e duplicata -> BAD_REQUEST com MSG_ITENS_INCOMPLETOS', async () => {
    const respostas = gridCanonico();
    // Substitui (4,5) por duplicata de (1,1).
    respostas[19] = { dimensao: 1, itemIndex: 1, valor: 3 };
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_ITENS_INCOMPLETOS });
  });

  it('valor 5 (fora 0-4) -> Zod rejeita', async () => {
    const respostas = gridCanonico();
    respostas[0] = { dimensao: 1, itemIndex: 1, valor: 5 };
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('valor negativo -> Zod rejeita', async () => {
    const respostas = gridCanonico();
    respostas[0] = { dimensao: 1, itemIndex: 1, valor: -1 };
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ============================================================
// 5) saveInstrumentCAssessment — janela do trimestre (§6.1)
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (janela)', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_JANELA);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await bindVinculoLider(empColab, empLider);
  });

  it('antes do dia 16 do ultimo mes -> CONFLICT MSG_TRIMESTRE_NAO_ABERTO', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_ABERTURA_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_TRIMESTRE_NAO_ABERTO });
  });

  it('apos corte sem envio previo e sem desbloqueio -> MSG_TRIMESTRE_FECHADO', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_FECHADO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_TRIMESTRE_FECHADO });
  });
});

// ============================================================
// 6) saveInstrumentCAssessment — vinculo direto (§6.3)
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (vinculo direto)', () => {
  let companyId: number;
  let empColab: number;
  let liderCorreto: number;
  let liderErrado: number;
  let cl: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_VINCULO);
    empColab = await createEmployee(companyId);
    liderCorreto = await createEmployee(companyId, { isLider: true });
    liderErrado = await createEmployee(companyId, { isLider: true });
    cl = await createClevel(companyId);
    await bindVinculoLider(empColab, liderCorreto);
  });

  it('lider funcional com liderId de outro lider -> FORBIDDEN MSG_LIDER_NAO_DIRETO', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', liderErrado, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: liderErrado,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
  });

  it('lider funcional submetendo com liderId de OUTRO (nao ele mesmo) -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', liderErrado, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: liderCorreto,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
  });

  it('lider funcional submetendo via clevelId -> FORBIDDEN', async () => {
    const outroColab = await createEmployee(companyId);
    await bindVinculoClevel(outroColab, cl);
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', liderCorreto, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: outroColab,
        clevelId: cl,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
  });

  it('clevel funcional submetendo via liderId -> FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('clevel', cl, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: liderCorreto,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
  });

  it('liderId de outra empresa -> BAD_REQUEST MSG_LIDER_NAO_DIRETO', async () => {
    const outraCompanyId = await createCompany('10000000000731');
    const liderOutra = await createEmployee(outraCompanyId, { isLider: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: liderOutra,
        trimestre: '2024-Q1',
        respostas: gridCanonico(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_LIDER_NAO_DIRETO });
  });
});

// ============================================================
// 7) saveInstrumentCAssessment — semantica S090 (segundo submit)
// ============================================================

describe('instrumentC — saveInstrumentCAssessment (S090: segundo submit)', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SAVE_OVERWRITE);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await bindVinculoLider(empColab, empLider);
    // Primeiro envio dentro da janela normal.
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empColab,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(2),
    });
  });

  it('segundo submit na janela normal SEM desbloqueio -> MSG_TRIMESTRE_FECHADO', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await expect(
      caller.saveInstrumentCAssessment({
        companyId,
        employeeId: empColab,
        liderId: empLider,
        trimestre: '2024-Q1',
        respostas: gridCanonico(4),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_TRIMESTRE_FECHADO });
  });

  it('segundo submit COM desbloqueio vigente -> OVERWRITE valores', async () => {
    // Bruno abre janela de desbloqueio.
    const nowT = new Date('2024-04-20T10:00:00Z');
    const { factory: reopenFactory, ctx: reopenCtx } = bindRouter({ now: () => nowT });
    const reopenCaller = reopenFactory(reopenCtx(await tokenSuperAdmin()));
    const reopenRes = await reopenCaller.reopenAssessment({
      companyId,
      employeeId: empColab,
      trimestre: '2024-Q1',
      justificativa: 'j'.repeat(120),
    });
    expect(reopenRes.expiraEm.getTime()).toBe(
      nowT.getTime() + UNLOCK_WINDOW_HOURS * 60 * 60 * 1000,
    );

    // Segundo submit agora deve gravar por cima.
    const { factory, ctx } = bindRouter({ now: () => nowT });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    const res = await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empColab,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(4),
    });
    expect(res.operacao).toBe('overwrite');
    expect(res.itensGravados).toBe(NUM_ITENS_TOTAL);
    const linhas = await client.db
      .select()
      .from(instrumentC_assessments)
      .where(
        and(
          eq(instrumentC_assessments.employeeId, empColab),
          eq(instrumentC_assessments.trimestre, '2024-Q1'),
        ),
      );
    // Ainda 20 linhas (nao duplicou).
    expect(linhas.length).toBe(NUM_ITENS_TOTAL);
    // Todos os valores agora sao 4.
    for (const l of linhas) {
      expect(l.valor).toBe(4);
    }
  });
});

// ============================================================
// 8) getAssessment
// ============================================================

describe('instrumentC — getAssessment', () => {
  let companyId: number;
  let empColab: number;
  let empLider: number;
  let empSemAvaliacao: number;
  let empDesbloqueado: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GET);
    empColab = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    empSemAvaliacao = await createEmployee(companyId);
    empDesbloqueado = await createEmployee(companyId);
    await bindVinculoLider(empColab, empLider);
    await bindVinculoLider(empSemAvaliacao, empLider);
    await bindVinculoLider(empDesbloqueado, empLider);
    // empColab tem avaliacao enviada.
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empColab,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    // empDesbloqueado tem avaliacao + desbloqueio vigente.
    await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empDesbloqueado,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(1),
    });
    const { factory: rFactory, ctx: rCtx } = bindRouter({
      now: () => new Date('2024-04-20T10:00:00Z'),
    });
    const rCaller = rFactory(rCtx(await tokenSuperAdmin()));
    await rCaller.reopenAssessment({
      companyId,
      employeeId: empDesbloqueado,
      trimestre: '2024-Q1',
      justificativa: 'j'.repeat(150),
    });
  });

  it('statusJanela = nao_aberta antes do dia 16 do ultimo mes', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ANTES_ABERTURA_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res: GetAssessmentResult = await caller.getAssessment({
      companyId,
      employeeId: empSemAvaliacao,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('nao_aberta');
    expect(res.respostas).toEqual([]);
    expect(res.avaliadorLiderId).toBeNull();
    expect(res.avaliadorClevelId).toBeNull();
    expect(res.desbloqueioVigente).toBeNull();
  });

  it('statusJanela = aberta dentro da janela normal, sem avaliacao', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empSemAvaliacao,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('aberta');
    expect(res.respostas).toEqual([]);
  });

  it('statusJanela = aberta com respostas ordenadas por (dimensao, itemIndex)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empColab,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('aberta');
    expect(res.respostas.length).toBe(NUM_ITENS_TOTAL);
    // Ordenacao canonica.
    for (let i = 0; i < NUM_ITENS_TOTAL - 1; i++) {
      const atual = res.respostas[i]!;
      const prox = res.respostas[i + 1]!;
      const chaveAtual = atual.dimensao * 10 + atual.itemIndex;
      const chaveProx = prox.dimensao * 10 + prox.itemIndex;
      expect(chaveAtual).toBeLessThan(chaveProx);
    }
    expect(res.avaliadorLiderId).toBe(empLider);
    expect(res.avaliadorClevelId).toBeNull();
    expect(res.respondidoEm).not.toBeNull();
  });

  it('statusJanela = fechada apos corte sem desbloqueio', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_FECHADO_Q1_2024 });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empColab,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('fechada');
    expect(res.desbloqueioVigente).toBeNull();
  });

  it('statusJanela = desbloqueada apos corte com desbloqueio vigente', async () => {
    // Janela ainda vigente (24h a partir de 2024-04-20).
    const { factory, ctx } = bindRouter({ now: () => new Date('2024-04-20T15:00:00Z') });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empDesbloqueado,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('desbloqueada');
    expect(res.desbloqueioVigente).not.toBeNull();
    expect(res.desbloqueioVigente!.desbloqueadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(res.desbloqueioVigente!.expiraEm.getTime()).toBeGreaterThan(
      new Date('2024-04-20T15:00:00Z').getTime(),
    );
  });

  it('desbloqueio expirado -> statusJanela = fechada (apos janela de 24h)', async () => {
    const { factory, ctx } = bindRouter({
      now: () => new Date('2024-04-22T10:00:00Z'), // > 24h apos reopen
    });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getAssessment({
      companyId,
      employeeId: empDesbloqueado,
      trimestre: '2024-Q1',
    });
    expect(res.statusJanela).toBe('fechada');
    expect(res.desbloqueioVigente).toBeNull();
  });
});

// ============================================================
// 9) reopenAssessment
// ============================================================

describe('instrumentC — reopenAssessment', () => {
  let companyId: number;
  let empComAvaliacao: number;
  let empSemAvaliacao: number;
  let empLider: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REOPEN);
    empComAvaliacao = await createEmployee(companyId);
    empSemAvaliacao = await createEmployee(companyId);
    empLider = await createEmployee(companyId, { isLider: true });
    await bindVinculoLider(empComAvaliacao, empLider);
    // Envia avaliacao para empComAvaliacao.
    const { factory, ctx } = bindRouter({ now: () => NOW_ABERTO_Q1_2024 });
    const caller = factory(ctx(await tokenPlatform('lider', empLider, companyId)));
    await caller.saveInstrumentCAssessment({
      companyId,
      employeeId: empComAvaliacao,
      liderId: empLider,
      trimestre: '2024-Q1',
      respostas: gridCanonico(),
    });
  });

  it('sucesso: cria linha instrumentUnlockLog instrumento=C expiraEm=+24h', async () => {
    const nowT = new Date('2024-05-01T10:00:00Z');
    const { factory, ctx } = bindRouter({ now: () => nowT });
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res: ReopenAssessmentResult = await caller.reopenAssessment({
      companyId,
      employeeId: empComAvaliacao,
      trimestre: '2024-Q1',
      justificativa: 'j'.repeat(150),
    });
    expect(res.unlockLogId).toBeGreaterThan(0);
    expect(res.expiraEm.getTime()).toBe(nowT.getTime() + UNLOCK_WINDOW_HOURS * 60 * 60 * 1000);
    const [linha] = await client.db
      .select()
      .from(instrumentUnlockLog)
      .where(eq(instrumentUnlockLog.id, res.unlockLogId))
      .limit(1);
    expect(linha!.instrumento).toBe('C');
    expect(linha!.houveAlteracao).toBe(false);
    expect(linha!.desbloqueadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
  });

  it('sem avaliacao previa -> CONFLICT MSG_REOPEN_SEM_AVALIACAO', async () => {
    const nowT = new Date('2024-05-01T11:00:00Z');
    const { factory, ctx } = bindRouter({ now: () => nowT });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empSemAvaliacao,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(150),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_REOPEN_SEM_AVALIACAO });
  });

  it('janela ja vigente -> CONFLICT MSG_REOPEN_JA_VIGENTE', async () => {
    // Ja aberta acima ao empComAvaliacao com now = 2024-05-01T10:00Z.
    // Nova chamada dentro da janela dispara conflito.
    const nowT = new Date('2024-05-01T15:00:00Z');
    const { factory, ctx } = bindRouter({ now: () => nowT });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empComAvaliacao,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(150),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_REOPEN_JA_VIGENTE });
  });

  it('colaborador de outra empresa -> FORBIDDEN', async () => {
    const outraCompanyId = await createCompany('10000000000732');
    const empOutra = await createEmployee(outraCompanyId);
    const { factory, ctx } = bindRouter({ now: () => new Date('2024-05-02T10:00:00Z') });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empOutra,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(150),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
  });

  it('justificativa curta demais (99) -> Zod rejeita', async () => {
    const { factory, ctx } = bindRouter({ now: () => new Date('2024-05-03T10:00:00Z') });
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.reopenAssessment({
        companyId,
        employeeId: empComAvaliacao,
        trimestre: '2024-Q1',
        justificativa: 'j'.repeat(99),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
