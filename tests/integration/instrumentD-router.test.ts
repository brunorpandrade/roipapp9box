// ROIP APP 9BOX — teste de integracao do sub-router `instrumentD`
// (ME-046, §8.8 segunda linha + §19.5 segunda linha).
//
// Exercita a procedure canonica `getInstrumentDStatus`, mais os
// contratos publicos exportados (RV-13: mensagens literais, schemas
// Zod, constantes canonicas, tipos, factory, helpers).
//
// SEM `reopenResponse`: §8.1 canoniza que o D nao fecha; nao ha
// janela a reabrir. A ponta de escrita "normal" do Instrumento D
// vive no Route Handler canonico do portal, coberto pelo
// teste-irmao `tests/integration/portal-save-instrument-d.test.ts`.
//
// Aqui cobrimos:
//   - Contratos publicos exportados (mensagens, schemas Zod S156
//     Q1|Q3, constantes, enum de status, factory, helpers).
//   - Matriz canonica de autorizacao (`getInstrumentDStatus` —
//     Bruno/RH empresa; Lider/C-level cadeia direta; guard cruzado
//     companyId §2.4).
//   - Total/respondidos/pendentes canonicos.
//   - Snapshot §8.3 (S150) — respondentes elegiveis = quem tinha
//     vinculo direto ativo no dia 16.
//   - Colaboradores admitidos apos dia 16 nao entram.
//   - Inativos excluidos (§8.4 replicado).
//   - Status 'pendente' vs 'atrasado' conforme corte canonico dia
//     11 do mes subsequente (§8.1).
//   - Escopo por perfil (S066 estendido ao D).
//   - Helper canonico `classifyStatusPendenciaD`.
//
// Padrao S009/S076 estendido: uma company local por describe, CNPJ
// unico da faixa 10000000000833..835 (S151 — reservada ME-046
// instrumentD-router). L32 cleanup em afterAll (tabelas com FK
// compartilhada + fixture global superAdmins id=1 preservada).
// JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentD_responses,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  classifyStatusPendenciaD,
  createInstrumentDRouter,
  DIA_ABERTURA_INSTRUMENT_D,
  DIMENSAO_SCHEMA_INSTRUMENT_D,
  type GetInstrumentDStatusResult,
  type InstrumentDRouterDeps,
  ITEM_INDEX_SCHEMA_INSTRUMENT_D,
  ITEM_SCHEMA_INSTRUMENT_D,
  itensCobremGridCanonicoD,
  listElegiveisSnapshotDia16D,
  MSG_CLEVEL_NAO_RESPONDE_D_B3,
  MSG_COMPANY_MISMATCH_D,
  MSG_EMPLOYEE_INATIVO_D,
  MSG_EMPRESA_NAO_ENCONTRADA_STATUS_D,
  MSG_ITENS_INCOMPLETOS_D,
  MSG_JA_RESPONDIDO_D,
  MSG_SEM_VINCULO_SNAPSHOT_D,
  MSG_TRIMESTRE_INVALIDO_D,
  MSG_TRIMESTRE_INVALIDO_STATUS_D,
  NUM_DIMENSOES_D,
  NUM_ITENS_POR_DIMENSAO_D,
  NUM_ITENS_TOTAL_D,
  resolveDia16InstrumentD,
  STATUS_PENDENCIA_INSTRUMENT_D_VALUES,
  TRIMESTRE_INPUT_SCHEMA_STATUS_D,
  TRIMESTRE_SCHEMA_INSTRUMENT_D,
  VALOR_MAX_D,
  VALOR_MIN_D,
  VALOR_SCHEMA_INSTRUMENT_D,
} from '../../src/server/routers/instrumentD';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me046-instrumentD';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_D = 'hash-fixo-me046-instrumentD';

// CNPJs canonicos (S151 — faixa 833..835 reservada para ME-046
// router instrumentD). O 833 fica reservado como sentinel (o
// describe de contratos exportados nao cria company; o afterAll
// preserva a faixa via inArray sobre createdCompanyIds efetivos).
const CNPJ_STATUS = '10000000000834';
const CNPJ_STATUS_CROSS = '10000000000835';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(instrumentD_responses)
      .where(inArray(instrumentD_responses.companyId, createdCompanyIds));
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
      razaoSocial: `ME046 D-Router ${cnpj} LTDA`,
      nomeFantasia: `ME046 D-Router ${cnpj}`,
      cnpj,
      telefone: '1633330046',
      endereco: `Rua ME-046, ${cnpj}`,
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

let cpfCounter = 46100000000;
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
    name?: string;
  } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Colab ME046 D',
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
      passwordHash: HASH_D,
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
      name: 'C-Level ME046 D',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      passwordHash: HASH_D,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me046D${seq}`.substring(0, 36).padEnd(36, '0');
}

async function linkLeader(
  employeeId: number,
  opts: { liderId?: number; clevelId?: number; dataInicio?: Date; dataFim?: Date | null },
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: opts.liderId ?? null,
    clevelId: opts.clevelId ?? null,
    dataInicio: opts.dataInicio ?? new Date('2023-01-01'),
    dataFim: opts.dataFim ?? null,
    reason: 'Fixture ME-046 instrumentD-router',
    transferBatchId: nextBatchId(),
  });
}

async function seedRespostaMinimaD(
  companyId: number,
  respondenteId: number,
  liderId: number,
  trimestre: string,
): Promise<void> {
  // Grava 1 item (para marcar respondente como "ja respondido" na
  // semantica canonica do getStatus — "pelo menos uma resposta
  // registrada").
  await client.db.insert(instrumentD_responses).values({
    companyId,
    respondenteId,
    liderId,
    clevelId: null,
    trimestre,
    dimensao: 1,
    itemIndex: 1,
    valor: 3,
    respondidoEm: new Date('2024-03-20T12:00:00Z'),
    createdAt: new Date('2024-03-20T12:00:00Z'),
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
    credentialVersion: deriveCredentialVersion(HASH_D),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter(deps: InstrumentDRouterDeps = {}) {
  const testRouter = createInstrumentDRouter(deps);
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// Dentro da janela Q1/2024 (aberta em 2024-03-16).
const NOW_DENTRO_Q1_2024 = new Date('2024-03-20T12:00:00Z');
// Apos o corte canonico dia 10/abril -> 'atrasado' pos dia 11.
const NOW_ATRASADO_Q1_2024 = new Date('2024-04-15T12:00:00Z');

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('instrumentD — contratos publicos exportados', () => {
  it('mensagens literais canonicas §8.6/§8.3/§8.4/§8.1', () => {
    expect(MSG_CLEVEL_NAO_RESPONDE_D_B3).toBe('C-level não responde ao Instrumento D.');
    expect(MSG_SEM_VINCULO_SNAPSHOT_D).toBe(
      'Sem vínculo hierárquico ativo no dia 16 do trimestre.',
    );
    expect(MSG_JA_RESPONDIDO_D).toBe(
      'Instrumento D já respondido neste trimestre para este líder.',
    );
    expect(MSG_ITENS_INCOMPLETOS_D).toBe(
      'O Instrumento D exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.',
    );
    expect(MSG_COMPANY_MISMATCH_D).toBe('Colaborador não pertence à sua empresa.');
    expect(MSG_EMPLOYEE_INATIVO_D).toBe('Colaborador inativo não responde ao Instrumento D.');
    expect(MSG_TRIMESTRE_INVALIDO_D).toBe(
      'Trimestre canônico do Instrumento D deve seguir o formato YYYY-Q1 ou YYYY-Q3.',
    );
    expect(MSG_EMPRESA_NAO_ENCONTRADA_STATUS_D).toBe('Empresa não encontrada.');
    expect(MSG_TRIMESTRE_INVALIDO_STATUS_D).toBe(
      'Trimestre do Instrumento D deve seguir o formato YYYY-Q1 ou YYYY-Q3.',
    );
  });

  it('constantes canonicas do grid batem §8.2', () => {
    expect(NUM_DIMENSOES_D).toBe(4);
    expect(NUM_ITENS_POR_DIMENSAO_D).toBe(5);
    expect(NUM_ITENS_TOTAL_D).toBe(20);
    expect(VALOR_MIN_D).toBe(0);
    expect(VALOR_MAX_D).toBe(4);
    expect(DIA_ABERTURA_INSTRUMENT_D).toBe(16);
  });

  it('schema Zod SEMESTRAL (S156) aceita Q1 e Q3, rejeita Q2 e Q4', () => {
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_D.safeParse('2024-Q1').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_D.safeParse('2024-Q3').success).toBe(true);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_D.safeParse('2024-Q2').success).toBe(false);
    expect(TRIMESTRE_SCHEMA_INSTRUMENT_D.safeParse('2024-Q4').success).toBe(false);
    expect(TRIMESTRE_INPUT_SCHEMA_STATUS_D.safeParse('2024-Q1').success).toBe(true);
    expect(TRIMESTRE_INPUT_SCHEMA_STATUS_D.safeParse('2024-Q2').success).toBe(false);
  });

  it('DIMENSAO, ITEM_INDEX e VALOR schemas respeitam ranges', () => {
    expect(DIMENSAO_SCHEMA_INSTRUMENT_D.safeParse(1).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_D.safeParse(4).success).toBe(true);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_D.safeParse(5).success).toBe(false);
    expect(DIMENSAO_SCHEMA_INSTRUMENT_D.safeParse(0).success).toBe(false);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_D.safeParse(5).success).toBe(true);
    expect(ITEM_INDEX_SCHEMA_INSTRUMENT_D.safeParse(6).success).toBe(false);
    expect(VALOR_SCHEMA_INSTRUMENT_D.safeParse(0).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_D.safeParse(4).success).toBe(true);
    expect(VALOR_SCHEMA_INSTRUMENT_D.safeParse(5).success).toBe(false);
    expect(VALOR_SCHEMA_INSTRUMENT_D.safeParse(-1).success).toBe(false);
    // ITEM_SCHEMA (composto) valida os 3 juntos.
    expect(
      ITEM_SCHEMA_INSTRUMENT_D.safeParse({ dimensao: 1, itemIndex: 1, valor: 0 }).success,
    ).toBe(true);
    expect(
      ITEM_SCHEMA_INSTRUMENT_D.safeParse({ dimensao: 1, itemIndex: 1, valor: 5 }).success,
    ).toBe(false);
  });

  it('enum de status batem §8.1 (pendente/atrasado)', () => {
    expect([...STATUS_PENDENCIA_INSTRUMENT_D_VALUES]).toEqual(['pendente', 'atrasado']);
  });

  it('itensCobremGridCanonicoD detecta grid completo, incompleto e duplicado', () => {
    const gridCompleto: { dimensao: number; itemIndex: number }[] = [];
    for (let d = 1; d <= 4; d++) {
      for (let i = 1; i <= 5; i++) {
        gridCompleto.push({ dimensao: d, itemIndex: i });
      }
    }
    expect(itensCobremGridCanonicoD(gridCompleto)).toBe(true);
    // 19 itens
    expect(itensCobremGridCanonicoD(gridCompleto.slice(0, 19))).toBe(false);
    // 21 itens (duplicado)
    const comDuplicado = [...gridCompleto, { dimensao: 1, itemIndex: 1 }];
    expect(itensCobremGridCanonicoD(comDuplicado)).toBe(false);
    // lacuna: substitui (1,1) por (1,1) duplicado
    const comLacuna = [...gridCompleto.slice(1), { dimensao: 1, itemIndex: 2 }];
    expect(itensCobremGridCanonicoD(comLacuna)).toBe(false);
  });

  it('resolveDia16InstrumentD retorna null para trimestre invalido', () => {
    expect(resolveDia16InstrumentD('invalido', 'America/Sao_Paulo')).toBeNull();
    const d1 = resolveDia16InstrumentD('2024-Q1', 'America/Sao_Paulo');
    expect(d1?.toISOString()).toBe('2024-03-16T03:00:00.000Z');
    const d3 = resolveDia16InstrumentD('2024-Q3', 'America/Sao_Paulo');
    expect(d3?.toISOString()).toBe('2024-09-16T03:00:00.000Z');
  });

  it('classifyStatusPendenciaD retorna atrasado quando now > corte', () => {
    // Corte canonico Q1: 10/abril 23:59:59 -03:00 == 11/abril 02:59:59 UTC.
    // 15/abril 12:00 UTC > corte -> 'atrasado'.
    expect(classifyStatusPendenciaD('2024-Q1', 'America/Sao_Paulo', NOW_ATRASADO_Q1_2024)).toBe(
      'atrasado',
    );
    expect(classifyStatusPendenciaD('2024-Q1', 'America/Sao_Paulo', NOW_DENTRO_Q1_2024)).toBe(
      'pendente',
    );
    // Trimestre invalido -> pendente (fallback conservador).
    expect(classifyStatusPendenciaD('invalido', 'America/Sao_Paulo', NOW_ATRASADO_Q1_2024)).toBe(
      'pendente',
    );
  });
});

// ============================================================
// 1) getInstrumentDStatus — happy path + snapshot §8.3
// ============================================================

describe('instrumentD.getInstrumentDStatus — snapshot §8.3', () => {
  let companyId: number;
  let outroCompanyId: number;
  let lider: number;
  let clevel: number;
  let respAntes: number; // Elegivel (vinculo antes do dia 16)
  let respDia16: number; // Elegivel (vinculo exatamente no dia 16)
  let respDepois: number; // NAO elegivel (vinculo apos dia 16)
  let respInativo: number; // Elegivel mas status=inativo (excluido)
  let respDuplo: number; // Elegivel via clevel

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_STATUS);
    outroCompanyId = await createCompany(CNPJ_STATUS_CROSS);
    lider = await createEmployee(companyId, { isLider: true, name: 'Lider Status' });
    clevel = await createClevel(companyId);
    respAntes = await createEmployee(companyId, { name: 'Resp Antes' });
    respDia16 = await createEmployee(companyId, { name: 'Resp Dia 16' });
    respDepois = await createEmployee(companyId, { name: 'Resp Depois' });
    respInativo = await createEmployee(companyId, { name: 'Resp Inativo', status: 'inativo' });
    respDuplo = await createEmployee(companyId, { name: 'Resp Duplo CLevel' });

    // dataInicio canonica: date column (dia; 16 do mes 3 e o snapshot).
    await linkLeader(respAntes, { liderId: lider, dataInicio: new Date('2023-01-01') });
    await linkLeader(respDia16, { liderId: lider, dataInicio: new Date('2024-03-16') });
    await linkLeader(respDepois, { liderId: lider, dataInicio: new Date('2024-03-20') });
    await linkLeader(respInativo, { liderId: lider, dataInicio: new Date('2023-01-01') });
    await linkLeader(respDuplo, { clevelId: clevel, dataInicio: new Date('2023-01-01') });
  });

  it('Bruno ve total e pendentes — respDepois EXCLUIDO por snapshot §8.3', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = (await caller.getInstrumentDStatus({
      companyId,
      trimestre: '2024-Q1',
    })) as GetInstrumentDStatusResult;
    // Elegiveis por snapshot §8.3: respAntes + respDia16 + respDuplo
    // (respInativo excluido por status, respDepois excluido por
    // dataInicio > dia16).
    expect(res.total).toBe(3);
    expect(res.respondidos).toBe(0);
    expect(res.pendentes.length).toBe(3);
    const nomes = res.pendentes.map((p) => p.nome).sort();
    expect(nomes).toEqual(['Resp Antes', 'Resp Dia 16', 'Resp Duplo CLevel']);
    // Todos com status 'pendente' (dentro do trimestre).
    for (const p of res.pendentes) {
      expect(p.status).toBe('pendente');
    }
  });

  it('apos gravar resposta minima do respAntes, respondidos aumenta', async () => {
    await seedRespostaMinimaD(companyId, respAntes, lider, '2024-Q1');
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = (await caller.getInstrumentDStatus({
      companyId,
      trimestre: '2024-Q1',
    })) as GetInstrumentDStatusResult;
    expect(res.total).toBe(3);
    expect(res.respondidos).toBe(1);
    expect(res.pendentes.length).toBe(2);
  });

  it('status "atrasado" quando now apos corte canonico dia 11/mes seguinte', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_ATRASADO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const res = (await caller.getInstrumentDStatus({
      companyId,
      trimestre: '2024-Q1',
    })) as GetInstrumentDStatusResult;
    for (const p of res.pendentes) {
      expect(p.status).toBe('atrasado');
    }
  });

  it('Lider ve apenas cadeia descendente (S066): 2 elegiveis (respAntes + respDia16)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenPlatform('lider', lider, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getInstrumentDStatus({
      companyId,
      trimestre: '2024-Q1',
    })) as GetInstrumentDStatusResult;
    // Do escopo do lider: apenas respAntes e respDia16 (respDuplo
    // esta vinculado ao clevel, respInativo excluido por status,
    // respDepois excluido por snapshot).
    expect(res.total).toBe(2);
    const ids = res.pendentes.map((p) => p.employeeId).sort();
    // respAntes ja respondeu no teste anterior; unico pendente e
    // respDia16.
    expect(ids).toEqual([respDia16]);
  });

  it('C-level ve apenas cadeia descendente propria (respDuplo)', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenPlatform('clevel', clevel, companyId);
    const caller = factory(ctx(token));
    const res = (await caller.getInstrumentDStatus({
      companyId,
      trimestre: '2024-Q1',
    })) as GetInstrumentDStatusResult;
    expect(res.total).toBe(1);
    expect(res.pendentes[0]?.employeeId).toBe(respDuplo);
  });

  it('guard cruzado companyId (§2.4) para nao-super_admin -> FORBIDDEN', async () => {
    const rhOutro = await createEmployee(outroCompanyId, { isRH: true });
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenPlatform('rh', rhOutro, outroCompanyId);
    const caller = factory(ctx(token));
    await expect(caller.getInstrumentDStatus({ companyId, trimestre: '2024-Q1' })).rejects.toThrow(
      'Empresa fora do escopo do titular.',
    );
  });

  it('empresa nao encontrada -> NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.getInstrumentDStatus({ companyId: 99999999, trimestre: '2024-Q1' }),
    ).rejects.toThrow(MSG_EMPRESA_NAO_ENCONTRADA_STATUS_D);
  });

  it('trimestre invalido rejeitado pelo Zod', async () => {
    const { factory, ctx } = bindRouter({ now: () => NOW_DENTRO_Q1_2024 });
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    // Q2 e Q4 sao rejeitados por S156.
    await expect(
      caller.getInstrumentDStatus({ companyId, trimestre: '2024-Q2' }),
    ).rejects.toThrow();
    await expect(
      caller.getInstrumentDStatus({ companyId, trimestre: 'invalido' }),
    ).rejects.toThrow();
  });

  it('helper canonico listElegiveisSnapshotDia16D retorna os 3 elegiveis', async () => {
    const dia16 = resolveDia16InstrumentD('2024-Q1', 'America/Sao_Paulo');
    expect(dia16).not.toBeNull();
    const rows = await listElegiveisSnapshotDia16D(client.db, companyId, dia16!);
    const nomes = rows.map((r) => r.name).sort();
    // Snapshot §8.3 usa companyId + status='ativo' cross com dia16.
    // respInativo excluido; respDepois excluido; respAntes+respDia16+
    // respDuplo entrando.
    expect(nomes).toEqual(['Resp Antes', 'Resp Dia 16', 'Resp Duplo CLevel']);
  });
});
