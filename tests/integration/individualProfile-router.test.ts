// ROIP APP 9BOX — teste de integracao do sub-router
// `individualProfile` (ME-049b; DOC 03 §10.7-§10.13).
//
// Contra MySQL real via `createCallerFactory`. Cobre:
//   - Contratos publicos exportados (RV-13): schemas Zod, enum,
//     mensagens canonicas, facade default, guards e factory.
//   - `getReport`: `null` sem score; DTO com flags de geracao;
//     acionamento do hook DI; textos ja gerados zeram as flags.
//   - `getReport`: S213 — tentativa vigente e a de maior `tentativa`.
//   - `getReport`: guards §2.4, §3.13, S066 e NOT_FOUND.
//   - `getReport`: PC1e (S211) — titular C-level so para Bruno, com a
//     mensagem canonica exata do DOC 02 §11.5.
//   - `releaseRetest`: §10.7 passos 2-4 (nova tentativa, campos de
//     reteste na propria linha por S232, placeholder transicionado).
//   - `releaseRetest`: S234 (pre-condicao), S212 (whitelist de perfis)
//     e S231 (PC1e estendida ao reteste de C-level).
//
// CNPJs faixa 960..969 (S204 mecanica desta ME).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  assertPC1e,
  createIndividualProfileRouter,
  DEFAULT_INDIVIDUAL_PROFILE_REPORT_GENERATION,
  GET_REPORT_INPUT_SCHEMA,
  INDIVIDUAL_PROFILE_USER_TYPES,
  MSG_FORA_DA_CADEIA_DIRETA,
  MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL,
  MSG_RETESTE_PRECONDICAO,
  MSG_RETESTE_SEM_TENTATIVA,
  MSG_TITULAR_INATIVO_RESTRITO,
  MSG_TITULAR_NAO_ENCONTRADO,
  RELEASE_RETEST_INPUT_SCHEMA,
  type IndividualProfileReportGenerationFacade,
  type TriggerReportGenerationArgs,
} from '../../src/server/routers/individualProfile';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049b-individualprofile-router';

const HASH = 'hash-fixo-me049b-individualprofile';
const FIXTURE_SUPER_ADMIN_ID = 1;

/** Relogio fixo canonico da ME (determinismo — S205). */
const NOW = new Date('2026-03-10T12:00:00Z');

const CNPJ_CONTRATOS = '10000000000960';
const CNPJ_REPORT_OK = '10000000000961';
const CNPJ_REPORT_VIGENTE = '10000000000962';
const CNPJ_REPORT_GUARDS = '10000000000963';
const CNPJ_REPORT_PC1E = '10000000000964';
const CNPJ_REPORT_ISOLAM = '10000000000965';
const CNPJ_RETEST_OK = '10000000000966';
const CNPJ_RETEST_PRECOND = '10000000000967';
const CNPJ_RETEST_AUTH = '10000000000968';
const CNPJ_RETEST_PC1E = '10000000000969';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // Ordem canonica de teardown: scores antes de assessments (FK
    // ON DELETE RESTRICT em `assessmentId`); vinculos de lideranca
    // antes de employees (FK RESTRICT em `employeeId`/`liderId`).
    await client.db
      .delete(individualProfileScores)
      .where(inArray(individualProfileScores.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
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
// Fixtures canonicas
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049b IP ${cnpj} LTDA`,
      nomeFantasia: `ME049b IP ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049b IP, ${cnpj}`,
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

let cpfCounter = 49500000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let batchCounter = 0;
function nextTransferBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me049${seq}`;
}

async function createEmployee(
  companyId: number,
  status: 'ativo' | 'inativo' = 'ativo',
  isLider = false,
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049b IP',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: isLider ? 'tatico' : 'operacional',
      departamento: 'Comercial',
      status,
      isLider,
      isRH: false,
      passwordHash: HASH,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createCLevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'CL ME049b IP',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      passwordHash: HASH,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function linkLeader(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2024-01-01'),
    dataFim: null,
    reason: 'Fixture de teste individualProfile-router ME-049b',
    transferBatchId: nextTransferBatchId(),
  });
}

async function createPlaceholder(
  companyId: number,
  userId: number,
  userType: 'employee' | 'clevel' = 'employee',
  status:
    | 'pendente'
    | 'em_andamento'
    | 'respondido'
    | 'inconsistente'
    | 'aguardando_nova_resposta' = 'inconsistente',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType, userId, status })
    .$returningId();
  return row!.id;
}

async function createAssessment(
  companyId: number,
  userId: number,
  userType: 'employee' | 'clevel' = 'employee',
  tentativa = 1,
  status: 'em_andamento' | 'enviado' | 'inconsistente' = 'enviado',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType,
      userId,
      tentativa,
      status,
      blocoAtual: 10,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas: { ITEM_001: 4 },
      confiabilidadeNivel: status === 'inconsistente' ? 'baixa' : 'alta',
      ia_att: '0.00',
      ia_soc: '0.00',
      ia_acq: '0.00',
      ia_cons: '0.00',
      ia_ext: '0.00',
      enviadoEm: NOW,
      calculadoEm: NOW,
    })
    .$returningId();
  return row!.id;
}

async function createScore(
  companyId: number,
  userId: number,
  assessmentId: number,
  tentativa: number,
  textos: { resumoJson?: unknown; expandidoJson?: unknown } = {},
  userType: 'employee' | 'clevel' = 'employee',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileScores)
    .values({
      companyId,
      userType,
      userId,
      assessmentId,
      tentativa,
      post_assert: '70.00',
      perfilComportamental: 'Executor',
      vetorDominante: 'mot_maestria',
      vetorSustentacao: 'mot_proposito',
      vetorNegligenciado: 'mot_seguranca',
      top3Assinatura: ['ass_sabed', 'ass_coragem', 'ass_justica'],
      flags: { FLAG_ADAPT_POST: false },
      resumoJson: textos.resumoJson ?? null,
      expandidoJson: textos.expandidoJson ?? null,
      exibirConfirmacaoAte: NOW,
    })
    .$returningId();
  return row!.id;
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
    credentialVersion: deriveCredentialVersion(HASH),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

/** Spy do hook DI de geracao (S210) — registra as chamadas recebidas. */
function spyGeneration(): {
  facade: IndividualProfileReportGenerationFacade;
  calls: TriggerReportGenerationArgs[];
} {
  const calls: TriggerReportGenerationArgs[] = [];
  const facade: IndividualProfileReportGenerationFacade = {
    triggerReportGeneration: (args) => {
      calls.push(args);
      return Promise.resolve();
    },
  };
  return { facade, calls };
}

function bindRouter(deps: Parameters<typeof createIndividualProfileRouter>[0] = {}) {
  const testRouter = createIndividualProfileRouter({ now: () => NOW, ...deps });
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

describe('individualProfile — contratos publicos exportados', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CONTRATOS);
  });

  it('INDIVIDUAL_PROFILE_USER_TYPES e o enum canonico §2.3', () => {
    expect(INDIVIDUAL_PROFILE_USER_TYPES).toEqual(['employee', 'clevel']);
  });

  it('GET_REPORT_INPUT_SCHEMA exige companyId + userType + userId', () => {
    expect(
      GET_REPORT_INPUT_SCHEMA.safeParse({ companyId: 1, userType: 'employee', userId: 2 }).success,
    ).toBe(true);
    expect(
      GET_REPORT_INPUT_SCHEMA.safeParse({ companyId: 1, userType: 'clevel', userId: 2 }).success,
    ).toBe(true);
    expect(
      GET_REPORT_INPUT_SCHEMA.safeParse({ companyId: 1, userType: 'lider', userId: 2 }).success,
    ).toBe(false);
    expect(GET_REPORT_INPUT_SCHEMA.safeParse({ companyId: 1, userType: 'employee' }).success).toBe(
      false,
    );
    expect(
      GET_REPORT_INPUT_SCHEMA.safeParse({ companyId: 0, userType: 'employee', userId: 2 }).success,
    ).toBe(false);
  });

  it('RELEASE_RETEST_INPUT_SCHEMA tem o mesmo contrato canonico', () => {
    expect(
      RELEASE_RETEST_INPUT_SCHEMA.safeParse({ companyId: 3, userType: 'employee', userId: 9 })
        .success,
    ).toBe(true);
    expect(RELEASE_RETEST_INPUT_SCHEMA.safeParse({ companyId: 3, userId: 9 }).success).toBe(false);
  });

  it('MSG_PC1E reproduz literalmente o DOC 02 §11.5', () => {
    expect(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL).toBe(
      'Você não tem permissão para acessar o Perfil Individual deste colaborador. ' +
        'Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, ' +
        'contate o Super Admin.',
    );
  });

  it('mensagens canonicas restantes sao constantes nao vazias (S206)', () => {
    for (const msg of [
      MSG_TITULAR_INATIVO_RESTRITO,
      MSG_FORA_DA_CADEIA_DIRETA,
      MSG_TITULAR_NAO_ENCONTRADO,
      MSG_RETESTE_PRECONDICAO,
      MSG_RETESTE_SEM_TENTATIVA,
    ]) {
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('assertPC1e: passa para employee; passa para clevel so com super_admin', () => {
    const rh = { role: 'rh' as const, userId: 5, companyId: 7 };
    const bruno = { role: 'super_admin' as const, superAdminId: 1 };
    expect(() => assertPC1e(rh, 'employee')).not.toThrow();
    expect(() => assertPC1e(bruno, 'clevel')).not.toThrow();
    expect(() => assertPC1e(rh, 'clevel')).toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });

  it('DEFAULT_INDIVIDUAL_PROFILE_REPORT_GENERATION e no-op resolvido (S210)', async () => {
    const result = await DEFAULT_INDIVIDUAL_PROFILE_REPORT_GENERATION.triggerReportGeneration({
      scoreId: 1,
      companyId: 1,
      userType: 'employee',
      userId: 1,
      tentativa: 1,
      gerarResumo: true,
      gerarExpandido: true,
    });
    expect(result).toBeUndefined();
  });

  it('factory retorna objeto de router com defaults', () => {
    expect(typeof createIndividualProfileRouter()).toBe('object');
  });
});

// ============================================================
// 1) getReport — caminho canonico
// ============================================================

describe('individualProfile.getReport — caminho canonico', () => {
  let companyId: number;
  let rhId: number;
  let empSemScore: number;
  let empComScore: number;
  let empComTextos: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REPORT_OK);
    rhId = await createEmployee(companyId);
    empSemScore = await createEmployee(companyId);
    empComScore = await createEmployee(companyId);
    empComTextos = await createEmployee(companyId);

    const a1 = await createAssessment(companyId, empComScore, 'employee', 1);
    await createScore(companyId, empComScore, a1, 1);

    const a2 = await createAssessment(companyId, empComTextos, 'employee', 1);
    await createScore(companyId, empComTextos, a2, 1, {
      resumoJson: { texto: 'resumo gerado' },
      expandidoJson: { texto: 'expandido gerado' },
    });
  });

  it('retorna null quando o titular nao tem score (S233)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empSemScore });
    expect(out).toBeNull();
  });

  it('retorna DTO com flags de geracao quando os textos sao NULL', async () => {
    const spy = spyGeneration();
    const { factory, ctx } = bindRouter({ reportGeneration: spy.facade });
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empComScore });
    expect(out).not.toBeNull();
    expect(out!.gerandoResumo).toBe(true);
    expect(out!.gerandoExpandido).toBe(true);
    expect(out!.score.resumoJson).toBeNull();
    expect(out!.score.perfilComportamental).toBe('Executor');
    expect(out!.assessment.tentativa).toBe(1);
    expect(out!.assessment.status).toBe('enviado');
    expect(out!.assessment.confiabilidadeNivel).toBe('alta');
  });

  it('aciona o hook DI de geracao com o payload canonico (S210)', async () => {
    const spy = spyGeneration();
    const { factory, ctx } = bindRouter({ reportGeneration: spy.facade });
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    await caller.getReport({ companyId, userType: 'employee', userId: empComScore });
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0]!.companyId).toBe(companyId);
    expect(spy.calls[0]!.userId).toBe(empComScore);
    expect(spy.calls[0]!.userType).toBe('employee');
    expect(spy.calls[0]!.tentativa).toBe(1);
    expect(spy.calls[0]!.gerarResumo).toBe(true);
    expect(spy.calls[0]!.gerarExpandido).toBe(true);
  });

  it('textos ja gerados zeram as flags e NAO acionam o hook', async () => {
    const spy = spyGeneration();
    const { factory, ctx } = bindRouter({ reportGeneration: spy.facade });
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empComTextos });
    expect(out!.gerandoResumo).toBe(false);
    expect(out!.gerandoExpandido).toBe(false);
    expect(out!.score.resumoJson).toEqual({ texto: 'resumo gerado' });
    expect(out!.score.expandidoJson).toEqual({ texto: 'expandido gerado' });
    expect(spy.calls.length).toBe(0);
  });

  it('DTO nao expoe respostas brutas do instrumento (§10.8)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empComScore });
    expect(Object.keys(out!.assessment)).toEqual([
      'id',
      'tentativa',
      'status',
      'confiabilidadeNivel',
      'enviadoEm',
      'calculadoEm',
    ]);
  });

  it('super_admin (Bruno) atravessa o escopo de empresa', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empComScore });
    expect(out!.score.companyId).toBe(companyId);
  });
});

// ============================================================
// 2) getReport — S213 tentativa vigente
// ============================================================

describe('individualProfile.getReport — S213 tentativa vigente', () => {
  let companyId: number;
  let rhId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REPORT_VIGENTE);
    rhId = await createEmployee(companyId);
    empId = await createEmployee(companyId);
    const a1 = await createAssessment(companyId, empId, 'employee', 1);
    await createScore(companyId, empId, a1, 1, { resumoJson: { texto: 'tentativa 1' } });
    const a2 = await createAssessment(companyId, empId, 'employee', 2);
    await createScore(companyId, empId, a2, 2, { resumoJson: { texto: 'tentativa 2' } });
  });

  it('retorna a tentativa de maior numero, nunca a anterior', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: empId });
    expect(out!.score.tentativa).toBe(2);
    expect(out!.assessment.tentativa).toBe(2);
    expect(out!.score.resumoJson).toEqual({ texto: 'tentativa 2' });
  });

  it('a tentativa anterior permanece no banco por auditoria (§10.7)', async () => {
    const rows = await client.db
      .select()
      .from(individualProfileScores)
      .where(
        and(
          eq(individualProfileScores.companyId, companyId),
          eq(individualProfileScores.userId, empId),
        ),
      );
    expect(rows.length).toBe(2);
  });
});

// ============================================================
// 3) getReport — guards §2.4, §3.13, S066
// ============================================================

describe('individualProfile.getReport — guards canonicos', () => {
  let companyId: number;
  let outraCompanyId: number;
  let rhId: number;
  let liderId: number;
  let liderado: number;
  let naoLiderado: number;
  let inativo: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REPORT_GUARDS);
    outraCompanyId = await createCompany(CNPJ_REPORT_ISOLAM);
    rhId = await createEmployee(companyId);
    liderId = await createEmployee(companyId, 'ativo', true);
    liderado = await createEmployee(companyId);
    naoLiderado = await createEmployee(companyId);
    inativo = await createEmployee(companyId, 'inativo');
    await linkLeader(liderado, liderId);

    for (const emp of [liderado, naoLiderado, inativo]) {
      const a = await createAssessment(companyId, emp, 'employee', 1);
      await createScore(companyId, emp, a, 1);
    }
  });

  it('§2.4 — RH de outra empresa recebe FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, outraCompanyId)));
    await expect(
      caller.getReport({ companyId, userType: 'employee', userId: liderado }),
    ).rejects.toThrow();
  });

  it('titular de outra empresa recebe NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(
      caller.getReport({ companyId: outraCompanyId, userType: 'employee', userId: liderado }),
    ).rejects.toThrow(MSG_TITULAR_NAO_ENCONTRADO);
  });

  it('S066 — lider le o liderado direto', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('lider', liderId, companyId)));
    const out = await caller.getReport({ companyId, userType: 'employee', userId: liderado });
    expect(out!.score.userId).toBe(liderado);
  });

  it('S066 — lider NAO le colaborador fora da cadeia direta', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('lider', liderId, companyId)));
    await expect(
      caller.getReport({ companyId, userType: 'employee', userId: naoLiderado }),
    ).rejects.toThrow(MSG_FORA_DA_CADEIA_DIRETA);
  });

  it('§3.13 — inativo e restrito a Bruno e RH', async () => {
    const { factory, ctx } = bindRouter();
    const rhCaller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const outRh = await rhCaller.getReport({ companyId, userType: 'employee', userId: inativo });
    expect(outRh!.score.userId).toBe(inativo);

    const liderCaller = factory(ctx(await tokenPlatform('lider', liderId, companyId)));
    await expect(
      liderCaller.getReport({ companyId, userType: 'employee', userId: inativo }),
    ).rejects.toThrow(MSG_TITULAR_INATIVO_RESTRITO);
  });

  it('sessao ausente recebe UNAUTHORIZED (§8.3)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(
      caller.getReport({ companyId, userType: 'employee', userId: liderado }),
    ).rejects.toThrow();
  });
});

// ============================================================
// 4) getReport — PC1e (S211)
// ============================================================

describe('individualProfile.getReport — PC1e §10.11/§15.5', () => {
  let companyId: number;
  let rhId: number;
  let liderId: number;
  let clevelId: number;
  let outroClevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REPORT_PC1E);
    rhId = await createEmployee(companyId);
    liderId = await createEmployee(companyId, 'ativo', true);
    clevelId = await createCLevel(companyId);
    outroClevelId = await createCLevel(companyId);
    const a = await createAssessment(companyId, clevelId, 'clevel', 1);
    await createScore(companyId, clevelId, a, 1, {}, 'clevel');
  });

  it('Bruno le o Perfil Individual de C-level', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const out = await caller.getReport({ companyId, userType: 'clevel', userId: clevelId });
    expect(out!.score.userType).toBe('clevel');
    expect(out!.score.userId).toBe(clevelId);
  });

  it('RH recebe FORBIDDEN com a mensagem canonica do DOC 02 §11.5', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    await expect(
      caller.getReport({ companyId, userType: 'clevel', userId: clevelId }),
    ).rejects.toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });

  it('RH-Lider tambem recebe FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh_lider', rhId, companyId)));
    await expect(
      caller.getReport({ companyId, userType: 'clevel', userId: clevelId }),
    ).rejects.toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });

  it('outro C-level recebe FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('clevel', outroClevelId, companyId)));
    await expect(
      caller.getReport({ companyId, userType: 'clevel', userId: clevelId }),
    ).rejects.toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });

  it('lider recebe FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('lider', liderId, companyId)));
    await expect(
      caller.getReport({ companyId, userType: 'clevel', userId: clevelId }),
    ).rejects.toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });
});

// ============================================================
// 5) releaseRetest — caminho canonico §10.7
// ============================================================

describe('individualProfile.releaseRetest — §10.7 passos 2-4', () => {
  let companyId: number;
  let rhId: number;
  let empRh: number;
  let empBruno: number;
  let placeholderRh: number;
  let placeholderBruno: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETEST_OK);
    rhId = await createEmployee(companyId);
    empRh = await createEmployee(companyId);
    empBruno = await createEmployee(companyId);
    placeholderRh = await createPlaceholder(companyId, empRh, 'employee', 'inconsistente');
    placeholderBruno = await createPlaceholder(companyId, empBruno, 'employee', 'inconsistente');
    await createAssessment(companyId, empRh, 'employee', 1, 'inconsistente');
    await createAssessment(companyId, empBruno, 'employee', 1, 'inconsistente');
  });

  it('RH libera reteste: nova tentativa incrementada e placeholder transicionado', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const out = await caller.releaseRetest({ companyId, userType: 'employee', userId: empRh });

    expect(out.tentativa).toBe(2);
    expect(out.placeholderId).toBe(placeholderRh);
    expect(out.placeholderStatus).toBe('aguardando_nova_resposta');
    expect(out.retesteLiberadoTipo).toBe('rh');
    expect(out.retesteLiberadoPor).toBe(rhId);
    expect(out.retesteLiberadoEm).toEqual(NOW);

    // §10.7 passo 2 — nova linha canonica.
    const [nova] = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, out.assessmentId));
    expect(nova!.tentativa).toBe(2);
    expect(nova!.status).toBe('em_andamento');
    expect(nova!.blocoAtual).toBe(1);
    expect(nova!.blocosCompletos).toEqual([]);
    expect(nova!.respostas).toBeNull();
    // §10.7 passo 3 — reteste gravado na PROPRIA linha nova (S232).
    expect(nova!.retesteLiberadoPor).toBe(rhId);
    expect(nova!.retesteLiberadoTipo).toBe('rh');
    expect(nova!.retesteLiberadoEm).not.toBeNull();

    // §10.7 passo 4 — placeholder transicionado.
    const [ph] = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(eq(individualProfilePlaceholders.id, placeholderRh));
    expect(ph!.status).toBe('aguardando_nova_resposta');
  });

  it('Bruno libera reteste com retesteLiberadoTipo super_admin', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const out = await caller.releaseRetest({ companyId, userType: 'employee', userId: empBruno });
    expect(out.retesteLiberadoTipo).toBe('super_admin');
    expect(out.retesteLiberadoPor).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(out.placeholderId).toBe(placeholderBruno);

    const [nova] = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, out.assessmentId));
    expect(nova!.retesteLiberadoTipo).toBe('super_admin');
  });

  it('tentativa anterior permanece intacta apos a liberacao (§10.7)', async () => {
    const rows = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(
        and(
          eq(individualProfileAssessments.companyId, companyId),
          eq(individualProfileAssessments.userId, empRh),
          eq(individualProfileAssessments.tentativa, 1),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('inconsistente');
    expect(rows[0]!.retesteLiberadoPor).toBeNull();
  });
});

// ============================================================
// 6) releaseRetest — pre-condicoes (S234)
// ============================================================

describe('individualProfile.releaseRetest — pre-condicoes canonicas', () => {
  let companyId: number;
  let rhId: number;
  let empRespondido: number;
  let empSemPlaceholder: number;
  let empSemTentativa: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETEST_PRECOND);
    rhId = await createEmployee(companyId);
    empRespondido = await createEmployee(companyId);
    empSemPlaceholder = await createEmployee(companyId);
    empSemTentativa = await createEmployee(companyId);
    await createPlaceholder(companyId, empRespondido, 'employee', 'respondido');
    await createPlaceholder(companyId, empSemTentativa, 'employee', 'inconsistente');
  });

  it('placeholder fora de `inconsistente` recebe BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empRespondido }),
    ).rejects.toThrow(MSG_RETESTE_PRECONDICAO);
  });

  it('titular sem placeholder recebe BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empSemPlaceholder }),
    ).rejects.toThrow(MSG_RETESTE_PRECONDICAO);
  });

  it('placeholder inconsistente sem tentativa registrada recebe BAD_REQUEST', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empSemTentativa }),
    ).rejects.toThrow(MSG_RETESTE_SEM_TENTATIVA);
  });
});

// ============================================================
// 7) releaseRetest — autorizacao S212 e PC1e S231
// ============================================================

describe('individualProfile.releaseRetest — autorizacao S212/S231', () => {
  let companyId: number;
  let pc1eCompanyId: number;
  let rhId: number;
  let liderId: number;
  let clevelId: number;
  let empId: number;
  let clevelAlvo: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETEST_AUTH);
    pc1eCompanyId = await createCompany(CNPJ_RETEST_PC1E);
    rhId = await createEmployee(companyId);
    liderId = await createEmployee(companyId, 'ativo', true);
    clevelId = await createCLevel(companyId);
    empId = await createEmployee(companyId);
    await createPlaceholder(companyId, empId, 'employee', 'inconsistente');
    await createAssessment(companyId, empId, 'employee', 1, 'inconsistente');

    clevelAlvo = await createCLevel(pc1eCompanyId);
    await createPlaceholder(pc1eCompanyId, clevelAlvo, 'clevel', 'inconsistente');
    await createAssessment(pc1eCompanyId, clevelAlvo, 'clevel', 1, 'inconsistente');
  });

  it('S212 — lider recebe FORBIDDEN (fora da whitelist)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('lider', liderId, companyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empId }),
    ).rejects.toThrow();
  });

  it('S212 — C-level recebe FORBIDDEN (fora da whitelist)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('clevel', clevelId, companyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empId }),
    ).rejects.toThrow();
  });

  it('§2.4 — RH de outra empresa recebe FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, pc1eCompanyId)));
    await expect(
      caller.releaseRetest({ companyId, userType: 'employee', userId: empId }),
    ).rejects.toThrow();
  });

  it('S231 — RH NAO libera reteste de C-level (PC1e estendida §15.5)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, pc1eCompanyId)));
    await expect(
      caller.releaseRetest({
        companyId: pc1eCompanyId,
        userType: 'clevel',
        userId: clevelAlvo,
      }),
    ).rejects.toThrow(MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL);
  });

  it('S231 — Bruno libera reteste de C-level', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const out = await caller.releaseRetest({
      companyId: pc1eCompanyId,
      userType: 'clevel',
      userId: clevelAlvo,
    });
    expect(out.tentativa).toBe(2);
    expect(out.retesteLiberadoTipo).toBe('super_admin');
    expect(out.placeholderStatus).toBe('aguardando_nova_resposta');
  });
});
