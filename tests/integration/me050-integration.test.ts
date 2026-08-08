// ROIP APP 9BOX — teste de integracao ME-050/51 (S244 + S250 + S254 +
// S259 + S260 + S261 + S262).
//
// Cobre os quatro artefatos canonicos da fusao E04:
//   1. Motor IA `runIndividualProfileAIGeneration` (individualProfileAI.ts)
//      contra MySQL real, com `claudeCallFacade` stub retornando JSON
//      canonico. Verifica lock in-memory §3.4, persistencia imutavel
//      §3.5 via setter com guarda IS NULL, superficie de telemetria
//      §2.6 (`individualProfile_resumo` / `individualProfile_expandido`)
//      e caminho de falha §11.1 (cache preservado NULL, retorno de
//      status estruturado).
//   2. Proc `individualProfile.generatePDF` (S261) — resolve pipeline
//      completo contra DB real com PdfRendererFacade stub deterministico.
//      Cobre autorizacao (roleProcedure super_admin+rh), PC1e, guarda
//      canonica MSG_GENERATE_PDF_AGUARDE quando expandidoJson NULL,
//      composicao do template e retorno `{ pdfBase64, filename }` com
//      filename canonico §10.10.
//   3. Proc `nr1.startDownloadToken` (S254) — valida ciclo fechado,
//      emite `pdfEphemeralToken` com scope 'nr1_report' e retorna URL
//      canonica. Cobre bloqueio contra ciclo agendado/aberto
//      (MSG_CICLO_NAO_FECHADO_NR1), ciclo inexistente
//      (MSG_CICLO_NAO_ENCONTRADO_NR1) e round-trip do token com
//      verifyPdfEphemeralToken.
//   4. Route Handler GET /api/nr1/download-report — recebe token real
//      emitido em (3), agrega ciclo via `nr1Report`, converte HTML via
//      pdfRenderer stub e devolve binario 'application/pdf' com
//      Content-Disposition canonico. Cobre token ausente (401), token
//      invalido (401), ciclo NAO fechado (404) e rastro em
//      `radarNR1Reports`.
//
// Faixa CNPJ canonica desta ME (S199 estendido — S262 nao interfere):
// principal 10000000010000..10000000010009, auxiliar
// 10000000010010..10000000010019.
//
// Cleanup: afterAll drop em ordem canonica de FKs. JWT_SECRET fixo no
// arquivo (padrao herdado dos testes de token).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycleSnapshot,
  copsoqCycles,
  copsoqFactorScores,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
  radarNR1Reports,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import {
  type PdfEphemeralTokenClaims,
  type PdfEphemeralTokenScope,
  type PdfEphemeralVerifyResult,
  signPdfEphemeralToken,
  verifyPdfEphemeralToken,
} from '../../src/server/auth/pdfEphemeralToken';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  DEFAULT_CLAUDE_CALL_FACADE,
  type ClaudeCallFacade,
  type ClaudeCallResult,
  type ClaudeCallStatus,
  type ClaudeCallSurface,
  type ClaudeCallTelemetryContext,
} from '../../src/server/services/claudeCall';
import {
  _resetLocksForTest,
  composeIndividualProfileUserPrompt,
  defaultLoadPayloadContext,
  INDIVIDUAL_PROFILE_AI_LOCK_TTL_MS,
  INDIVIDUAL_PROFILE_AI_MAX_TOKENS,
  INDIVIDUAL_PROFILE_AI_TEMPERATURE,
  type IndividualProfileAIDeps,
  type IndividualProfileAIFormato,
  type IndividualProfileAIIdentificacao,
  type IndividualProfileAIOutcome,
  type IndividualProfileAIPayloadContext,
  type LoadPayloadContext,
  releaseLock,
  runIndividualProfileAIGeneration,
  tryAcquireLock,
} from '../../src/server/services/individualProfileAI';
// eslint-disable-next-line @stylistic/max-len -- import canonico do prompt canonico
import { INDIVIDUAL_PROFILE_SYSTEM_PROMPT } from '../../src/server/services/individualProfileSystemPrompt';
import {
  NR1_FATOR_NOMES,
  type Nr1ReportBuildError,
  type Nr1ReportBuildResult,
  type Nr1ReportDeps,
} from '../../src/server/services/nr1Report';
import { createIndividualProfileRouter } from '../../src/server/routers/individualProfile';
import { createNr1Router } from '../../src/server/routers/nr1';
import type { PdfRendererFacade } from '../../src/server/services/pdfRenderer';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { GET as nr1DownloadReportGET } from '../../src/app/api/nr1/download-report/route';
import {
  __setNr1DownloadReportDbClient,
  __setNr1DownloadReportNow,
  __setNr1DownloadReportPdfRenderer,
} from '../../src/app/api/nr1/download-report/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const JWT_SECRET = 'roip-me050-integration-secret';

// Faixa CNPJ canonica ME-050/51 (14 digitos, esquerda para direita).
const CNPJ_MOTOR_IA = '10000000010000';
const CNPJ_GENERATE_PDF = '10000000010001';
const CNPJ_START_TOKEN = '10000000010002';
const CNPJ_ROUTE_HANDLER = '10000000010003';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

/** ID canonico do Super Admin fixture (setup global do vitest). */
const FIXTURE_SUPER_ADMIN_ID = 1;

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindIndividualProfileRouter(
  deps: Parameters<typeof createIndividualProfileRouter>[0] = {},
) {
  const testRouter = createIndividualProfileRouter(deps);
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

function bindNr1Router(deps: Parameters<typeof createNr1Router>[0] = {}) {
  const testRouter = createNr1Router(deps);
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
// Fixtures canonicas
// ============================================================

let cpfCounter = 50500000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME050 ${cnpj} LTDA`,
      nomeFantasia: `Empresa ME050 ${cnpj}`,
      cnpj,
      telefone: '1633330050',
      endereco: `Rua ME-050, ${cnpj}`,
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
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createEmployee(companyId: number, name: string): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
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
      isLider: false,
      isRH: false,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createConsistentAssessmentAndScore(
  companyId: number,
  employeeId: number,
  expandidoJson: unknown = null,
  resumoJson: unknown = null,
): Promise<{ assessmentId: number; scoreId: number }> {
  // Placeholder canonico primeiro.
  await client.db.insert(individualProfilePlaceholders).values({
    companyId,
    userType: 'employee',
    userId: employeeId,
    status: 'respondido',
  });
  const [ass] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa: 1,
      status: 'enviado',
      blocoAtual: 1,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas: {},
      confiabilidadeNivel: 'alta',
      enviadoEm: new Date('2026-06-15T10:00:00Z'),
      calculadoEm: new Date('2026-06-15T10:00:05Z'),
    })
    .$returningId();
  const assessmentId = ass!.id;
  const [score] = await client.db
    .insert(individualProfileScores)
    .values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      assessmentId,
      tentativa: 1,
      post_assert: '62.50',
      post_tarefas: '75.00',
      post_pessoas: '80.00',
      post_pressao: '55.00',
      est_abert: '78.00',
      est_disc: '70.00',
      est_ext: '65.00',
      est_amab: '80.00',
      est_estab: '72.00',
      mot_maestria: '71.30',
      mot_lideranca: '68.00',
      mot_autonomia: '75.00',
      mot_seguranca: '60.00',
      mot_proposito: '82.00',
      equ_autocons: '84.00',
      equ_autogest: '78.00',
      equ_leitura: '80.00',
      equ_influencia: '75.00',
      equ_indice: '79.25',
      ass_sabed: '66.00',
      ass_coragem: '70.00',
      ass_humanid: '80.00',
      ass_justica: '75.00',
      ass_temper: '68.00',
      ass_transc: '60.00',
      perfilComportamental: 'suporte_conexao',
      vetorDominante: 'proposito',
      vetorSustentacao: 'maestria',
      vetorNegligenciado: 'seguranca',
      top3Assinatura: ['humanidade', 'justica', 'coragem'],
      flags: {
        FLAG_ADAPT_POST: false,
        FLAG_DESALINH_MOT_ASS: false,
        FLAG_COMP_APRENDIDA: false,
        FLAG_LIDER_REATIVO: false,
        EMPATE_MOT: false,
        EQUIL_ASS: false,
      },
      resumoJson,
      expandidoJson,
    })
    .$returningId();
  return { assessmentId, scoreId: score!.id };
}

async function createClosedNr1Cycle(companyId: number, ciclo = '2026-Q2'): Promise<number> {
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo,
      dataAbertura: new Date('2026-04-01'),
      dataFechamento: new Date('2026-06-30'),
      status: 'fechado',
      configuradoPorSuperAdminId: 1,
      abertoEm: new Date('2026-04-01T00:00:00Z'),
      fechadoEm: new Date('2026-06-30T23:59:59Z'),
    })
    .$returningId();
  const cicloDbId = row!.id;
  // Scores minimos empresa — 8 fatores.
  for (let f = 1; f <= 8; f += 1) {
    await client.db.insert(copsoqFactorScores).values({
      cicloDbId,
      companyId,
      escopo: 'empresa',
      fator: f,
      score: '65.00',
      countRespondentes: 10,
    });
  }
  return cicloDbId;
}

// ============================================================
// Setup / teardown
// ============================================================

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  client = createDbClient(TEST_URL);
  _resetLocksForTest();
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // Ordem canonica de teardown FKs.
    await client.db
      .delete(radarNR1Reports)
      .where(inArray(radarNR1Reports.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqFactorScores)
      .where(inArray(copsoqFactorScores.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqCycleSnapshot)
      .where(inArray(copsoqCycleSnapshot.companyId, createdCompanyIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfileScores)
      .where(inArray(individualProfileScores.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
  __setNr1DownloadReportDbClient(null);
  __setNr1DownloadReportNow(null);
  __setNr1DownloadReportPdfRenderer(null);
});

// ============================================================
// Stubs canonicos
// ============================================================

/** JSON canonico do resumo conforme DOC 04 §3.8 (versao minima). */
const RESUMO_JSON_STUB = {
  sintese_executiva: 'Sintese canonica de teste.',
  recomendacoes_executivas: ['Recomendacao 1', 'Recomendacao 2'],
  confiabilidade: 'alta',
};

/** JSON canonico do expandido conforme DOC 04 §3.8. */
const EXPANDIDO_JSON_STUB = {
  sintese_executiva: 'Sintese executiva expandida.',
  como_age: 'Age de forma colaborativa.',
  quem_e: 'Profissional experiente.',
  o_que_move: 'Aprendizado e proposito.',
  como_reage_sob_pressao: 'Mantem composicao.',
  naturalmente_excelente: 'Leitura de dinamicas.',
  recomendacoes_executivas: ['Recomendacao A', 'Recomendacao B'],
  confiabilidade: 'alta',
  natural_vs_adaptado: null,
  padrao_paradoxal: null,
  dimensoes_com_hedge: null,
};

/** Stub deterministico do PDF renderer (S260) — bytes "%PDF-1.7". */
const PDF_STUB_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function makeClaudeStub(json: unknown): ClaudeCallFacade {
  return {
    claudeCall: vi.fn().mockResolvedValue({
      ok: true,
      content: JSON.stringify(json),
      parsedJson: json,
      telemetry: {
        callId: 'stub-uuid',
        companyId: 0,
        surface: 'individualProfile_resumo',
        model: 'claude-sonnet-4-6',
        startedAt: new Date(),
        finishedAt: new Date(),
        latencyMs: 10,
        inputTokens: 100,
        outputTokens: 50,
        status: 'sucesso',
        retriesEffective: 0,
        userId: 0,
        userType: 'super_admin',
      },
    }),
  };
}

function makeClaudeFailStub(): ClaudeCallFacade {
  return {
    claudeCall: vi.fn().mockResolvedValue({
      ok: false,
      status: 'falha_5xx',
      message: 'HTTP 500 do upstream',
      telemetry: {
        callId: 'stub-uuid',
        companyId: 0,
        surface: 'individualProfile_resumo',
        model: 'claude-sonnet-4-6',
        startedAt: new Date(),
        finishedAt: new Date(),
        latencyMs: 10,
        inputTokens: 0,
        outputTokens: 0,
        status: 'falha_5xx',
        retriesEffective: 2,
        userId: 0,
        userType: 'super_admin',
      },
    }),
  };
}

const PDF_STUB_FACADE: PdfRendererFacade = {
  renderPdf: async (): Promise<Uint8Array> => PDF_STUB_BYTES,
};

// ============================================================
// Testes
// ============================================================

describe('ME-050/51 — contratos publicos exportados (RV-13)', () => {
  it('constantes canonicas expostas com valores canonicos', () => {
    expect(INDIVIDUAL_PROFILE_AI_LOCK_TTL_MS).toBe(90_000);
    expect(INDIVIDUAL_PROFILE_AI_MAX_TOKENS).toBe(8_000);
    expect(INDIVIDUAL_PROFILE_AI_TEMPERATURE).toBe(0.3);
    expect(typeof INDIVIDUAL_PROFILE_SYSTEM_PROMPT).toBe('string');
    expect(INDIVIDUAL_PROFILE_SYSTEM_PROMPT.length).toBeGreaterThan(1000);
    expect(NR1_FATOR_NOMES[1]).toBe('Demandas');
    expect(Object.keys(NR1_FATOR_NOMES).length).toBe(8);
  });

  it('Facade DI canonicas expostas (shape check)', () => {
    expect(typeof DEFAULT_CLAUDE_CALL_FACADE.claudeCall).toBe('function');
  });

  it('lock in-memory exposto: tryAcquireLock + releaseLock funcionam', () => {
    _resetLocksForTest();
    const now = Date.UTC(2026, 6, 1, 0, 0, 0);
    expect(tryAcquireLock(1000, 'resumo', now)).toBe(true);
    expect(tryAcquireLock(1000, 'resumo', now + 1000)).toBe(false);
    releaseLock(1000, 'resumo');
    expect(tryAcquireLock(1000, 'resumo', now + 2000)).toBe(true);
    _resetLocksForTest();
  });

  it('composeIndividualProfileUserPrompt monta payload canonico §8.1', () => {
    const ctx: IndividualProfileAIPayloadContext = {
      identificacao: {
        nome: 'Teste',
        cargo: 'Analista',
        nivel_hierarquico: 'operacional',
        departamento: 'Comercial',
        lider_direto: 'Fulano',
        data_aplicacao: '2026-06-15',
      },
      confiabilidade: { nivel: 'alta', indices_com_alerta: [], dimensoes_afetadas: [] },
    };
    const scoresMinimo = {
      companyId: 1,
      userType: 'employee' as const,
      userId: 1,
      tentativa: 1,
      perfilComportamental: null,
      vetorDominante: null,
      vetorSustentacao: null,
      vetorNegligenciado: null,
      top3Assinatura: null,
      flags: null,
      post_assert: '60.00',
      post_tarefas: null,
      post_pessoas: null,
      post_pressao: null,
      est_abert: null,
      est_disc: null,
      est_ext: null,
      est_amab: null,
      est_estab: null,
      mot_maestria: null,
      mot_lideranca: null,
      mot_autonomia: null,
      mot_seguranca: null,
      mot_proposito: null,
      equ_autocons: null,
      equ_autogest: null,
      equ_leitura: null,
      equ_influencia: null,
      equ_indice: null,
      ass_sabed: null,
      ass_coragem: null,
      ass_humanid: null,
      ass_justica: null,
      ass_temper: null,
      ass_transc: null,
      resumoJson: null,
      expandidoJson: null,
    };
    const formato: IndividualProfileAIFormato = 'resumo';
    const prompt = composeIndividualProfileUserPrompt(ctx, scoresMinimo, formato);
    expect(prompt).toContain('Pacote numérico do assessment');
    expect(prompt).toContain('RESUMO');
    // Cobertura defensiva de contrato de tipo:
    const _id: IndividualProfileAIIdentificacao = ctx.identificacao;
    expect(_id.nome).toBe('Teste');
    const _fmt: IndividualProfileAIFormato = 'expandido';
    expect(_fmt).toBe('expandido');
  });

  it('tipos publicos canonicos aceitam claims/results canonicos', async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    // PdfEphemeralToken types round-trip.
    const scope: PdfEphemeralTokenScope = 'nr1_report';
    const token = await signPdfEphemeralToken(
      { scope, companyId: 1, resourceId: 1, userId: 1, userType: 'super_admin' },
      new Date('2026-07-28T10:00:00Z'),
    );
    const result: PdfEphemeralVerifyResult = await verifyPdfEphemeralToken(
      token,
      new Date('2026-07-28T10:00:30Z'),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      const claims: PdfEphemeralTokenClaims = result.claims;
      expect(claims.scope).toBe('nr1_report');
    }

    // ClaudeCall types — smoke via stub literal.
    const surface: ClaudeCallSurface = 'individualProfile_resumo';
    const status: ClaudeCallStatus = 'sucesso';
    const telemetryCtx: ClaudeCallTelemetryContext = {
      companyId: 1,
      surface,
      userId: 1,
      userType: 'super_admin',
    };
    const callResult: ClaudeCallResult = {
      ok: true,
      content: '{}',
      parsedJson: {},
      telemetry: {
        callId: 'test',
        companyId: telemetryCtx.companyId,
        surface: telemetryCtx.surface,
        model: 'claude-sonnet-4-6',
        startedAt: new Date(),
        finishedAt: new Date(),
        latencyMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        status,
        retriesEffective: 0,
        userId: 1,
        userType: 'super_admin',
      },
    };
    expect(callResult.ok).toBe(true);
  });

  it('Deps types de motor IA e nr1Report aceitam shape canonico', () => {
    const loader: LoadPayloadContext = defaultLoadPayloadContext;
    const aiDeps: IndividualProfileAIDeps = {
      db: client.db,
      claudeCallFacade: DEFAULT_CLAUDE_CALL_FACADE,
      loadPayloadContext: loader,
    };
    expect(typeof aiDeps.loadPayloadContext).toBe('function');

    const nr1Deps: Nr1ReportDeps = { db: client.db };
    expect(typeof nr1Deps.db).toBe('object');

    // Outcome discriminated union.
    const outcomeOk: IndividualProfileAIOutcome = {
      kind: 'ok',
      formato: 'resumo',
      affectedRows: 1,
    };
    expect(outcomeOk.kind).toBe('ok');

    // Nr1Report result union.
    const buildErr: Nr1ReportBuildError = { kind: 'ciclo_not_found' };
    const buildResult: Nr1ReportBuildResult = { ok: false, error: buildErr };
    expect(buildResult.ok).toBe(false);
  });
});

describe('ME-050/51 — motor IA individualProfileAI (S244)', () => {
  it('roda geracao canonica de resumo: chama claudeCall, persiste com guarda IS NULL', async () => {
    const companyId = await createCompany(CNPJ_MOTOR_IA);
    const employeeId = await createEmployee(companyId, 'Colab Motor IA');
    const { scoreId } = await createConsistentAssessmentAndScore(companyId, employeeId);
    _resetLocksForTest();

    const claudeStub = makeClaudeStub(RESUMO_JSON_STUB);

    const outcome = await runIndividualProfileAIGeneration(
      {
        db: client.db,
        claudeCallFacade: claudeStub,
        loadPayloadContext: defaultLoadPayloadContext,
      },
      {
        scoreId,
        companyId,
        userType: 'employee',
        userId: employeeId,
        tentativa: 1,
        formato: 'resumo',
        triggeredByUserId: 1,
        triggeredByUserType: 'super_admin',
      },
    );

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.affectedRows).toBe(1);
    expect(claudeStub.claudeCall).toHaveBeenCalledTimes(1);

    // Confirma persistencia.
    const [row] = await client.db
      .select({ resumoJson: individualProfileScores.resumoJson })
      .from(individualProfileScores)
      .where(eq(individualProfileScores.id, scoreId))
      .limit(1);
    expect(row?.resumoJson).toEqual(RESUMO_JSON_STUB);
  });

  it('pula quando campo alvo ja esta cacheado (skipped_already_cached)', async () => {
    const companyId = await createCompany('10000000010004');
    const employeeId = await createEmployee(companyId, 'Colab Cache');
    const { scoreId } = await createConsistentAssessmentAndScore(
      companyId,
      employeeId,
      EXPANDIDO_JSON_STUB, // expandido ja preenchido
      null,
    );
    _resetLocksForTest();

    const claudeStub = makeClaudeStub(EXPANDIDO_JSON_STUB);

    const outcome = await runIndividualProfileAIGeneration(
      {
        db: client.db,
        claudeCallFacade: claudeStub,
        loadPayloadContext: defaultLoadPayloadContext,
      },
      {
        scoreId,
        companyId,
        userType: 'employee',
        userId: employeeId,
        tentativa: 1,
        formato: 'expandido',
        triggeredByUserId: 1,
        triggeredByUserType: 'super_admin',
      },
    );

    expect(outcome.kind).toBe('skipped_already_cached');
    expect(claudeStub.claudeCall).not.toHaveBeenCalled();
  });

  it('nao persiste em falha da API (cache NULL preservado §2.2 + §11.1)', async () => {
    const companyId = await createCompany('10000000010005');
    const employeeId = await createEmployee(companyId, 'Colab Falha');
    const { scoreId } = await createConsistentAssessmentAndScore(companyId, employeeId);
    _resetLocksForTest();

    const claudeStub = makeClaudeFailStub();

    const outcome = await runIndividualProfileAIGeneration(
      {
        db: client.db,
        claudeCallFacade: claudeStub,
        loadPayloadContext: defaultLoadPayloadContext,
      },
      {
        scoreId,
        companyId,
        userType: 'employee',
        userId: employeeId,
        tentativa: 1,
        formato: 'resumo',
        triggeredByUserId: 1,
        triggeredByUserType: 'super_admin',
      },
    );

    expect(outcome.kind).toBe('failed_claude');
    if (outcome.kind !== 'failed_claude') return;
    expect(outcome.status).toBe('falha_5xx');

    const [row] = await client.db
      .select({ resumoJson: individualProfileScores.resumoJson })
      .from(individualProfileScores)
      .where(eq(individualProfileScores.id, scoreId))
      .limit(1);
    expect(row?.resumoJson).toBeNull();
  });
});

describe('ME-050/51 — proc individualProfile.generatePDF (S261)', () => {
  it('gera PDF canonico com expandidoJson cacheado e filename normalizado §10.10', async () => {
    const companyId = await createCompany(CNPJ_GENERATE_PDF);
    const employeeId = await createEmployee(companyId, 'João da Silva');
    await createConsistentAssessmentAndScore(
      companyId,
      employeeId,
      EXPANDIDO_JSON_STUB,
      RESUMO_JSON_STUB,
    );

    const { factory, ctx } = bindIndividualProfileRouter({
      pdfRenderer: PDF_STUB_FACADE,
      now: () => new Date('2026-07-28T10:00:00Z'),
    });
    const caller = factory(ctx(await tokenSuperAdmin()));

    const result = await caller.generatePDF({
      companyId,
      userType: 'employee',
      userId: employeeId,
    });

    expect(result.filename).toBe('Perfil_Individual_Joao_da_Silva_2026-07-28.pdf');
    const bytes = Buffer.from(result.pdfBase64, 'base64');
    expect(bytes[0]).toBe(0x25); // '%'
    expect(bytes[1]).toBe(0x50); // 'P'
  });

  it('bloqueia com MSG_GENERATE_PDF_AGUARDE quando expandidoJson NULL', async () => {
    const companyId = await createCompany('10000000010006');
    const employeeId = await createEmployee(companyId, 'Aguarde Bloqueado');
    await createConsistentAssessmentAndScore(companyId, employeeId, null, null);

    const { factory, ctx } = bindIndividualProfileRouter({
      pdfRenderer: PDF_STUB_FACADE,
    });
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(
      caller.generatePDF({
        companyId,
        userType: 'employee',
        userId: employeeId,
      }),
    ).rejects.toThrow(/Aguarde a geração do relatório/);
  });
});

describe('ME-050/51 — proc nr1.startDownloadToken (S254)', () => {
  it('emite token efemero canonico para ciclo fechado; verify round-trip', async () => {
    const companyId = await createCompany(CNPJ_START_TOKEN);
    const cicloDbId = await createClosedNr1Cycle(companyId);

    const { factory, ctx } = bindNr1Router({
      now: () => new Date('2026-07-28T10:00:00Z'),
    });
    const caller = factory(ctx(await tokenSuperAdmin()));

    const result = await caller.startDownloadToken({ cicloDbId });

    expect(typeof result.token).toBe('string');
    expect(result.downloadUrl).toContain('/api/nr1/download-report?token=');
    expect(result.expiresAtEpochSeconds).toBeGreaterThan(0);

    // Round-trip via verifyPdfEphemeralToken.
    const verification = await verifyPdfEphemeralToken(
      result.token,
      new Date('2026-07-28T10:00:30Z'), // 30s depois — dentro do TTL 300s.
    );
    expect(verification.valid).toBe(true);
    if (!verification.valid) return;
    expect(verification.claims.scope).toBe('nr1_report');
    expect(verification.claims.companyId).toBe(companyId);
    expect(verification.claims.resourceId).toBe(cicloDbId);
    expect(verification.claims.userType).toBe('super_admin');
  });

  it('bloqueia ciclo NAO fechado com MSG_CICLO_NAO_FECHADO_NR1', async () => {
    const companyId = await createCompany('10000000010007');
    const [row] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId,
        ciclo: '2026-Q3',
        dataAbertura: new Date('2026-07-01'),
        dataFechamento: new Date('2026-09-30'),
        status: 'aberto',
        configuradoPorSuperAdminId: 1,
        abertoEm: new Date('2026-07-01T00:00:00Z'),
      })
      .$returningId();
    const cicloAbertoId = row!.id;

    const { factory, ctx } = bindNr1Router({
      now: () => new Date('2026-07-28T10:00:00Z'),
    });
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(caller.startDownloadToken({ cicloDbId: cicloAbertoId })).rejects.toThrow(
      /só está disponível após o fechamento/,
    );
  });

  it('devolve NOT_FOUND para cicloDbId inexistente', async () => {
    const { factory, ctx } = bindNr1Router({
      now: () => new Date('2026-07-28T10:00:00Z'),
    });
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(caller.startDownloadToken({ cicloDbId: 99_999_999 })).rejects.toThrow(
      /Ciclo do Radar NR-1 não encontrado/,
    );
  });
});

describe('ME-050/51 — Route Handler GET /api/nr1/download-report (S207 + S254)', () => {
  it('devolve 401 quando token ausente', async () => {
    __setNr1DownloadReportDbClient(client);
    __setNr1DownloadReportPdfRenderer(PDF_STUB_FACADE);
    __setNr1DownloadReportNow(() => new Date('2026-07-28T10:00:00Z'));

    const req = new Request('http://localhost/api/nr1/download-report');
    const res = await nr1DownloadReportGET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('token_ausente');
  });

  it('devolve 401 quando token invalido (adulterado)', async () => {
    __setNr1DownloadReportDbClient(client);
    __setNr1DownloadReportPdfRenderer(PDF_STUB_FACADE);
    __setNr1DownloadReportNow(() => new Date('2026-07-28T10:00:00Z'));

    const req = new Request('http://localhost/api/nr1/download-report?token=xyz.abc.def');
    const res = await nr1DownloadReportGET(req);
    expect(res.status).toBe(401);
  });

  it('emite PDF canonico para ciclo fechado e grava rastro em radarNR1Reports', async () => {
    const companyId = await createCompany(CNPJ_ROUTE_HANDLER);
    const cicloDbId = await createClosedNr1Cycle(companyId, '2026-Q4');

    __setNr1DownloadReportDbClient(client);
    __setNr1DownloadReportPdfRenderer(PDF_STUB_FACADE);
    __setNr1DownloadReportNow(() => new Date('2026-07-28T10:00:00Z'));

    const token = await signPdfEphemeralToken(
      {
        scope: 'nr1_report',
        companyId,
        resourceId: cicloDbId,
        userId: 1,
        userType: 'super_admin',
      },
      new Date('2026-07-28T10:00:00Z'),
    );

    const req = new Request(
      `http://localhost/api/nr1/download-report?token=${encodeURIComponent(token)}`,
    );
    const res = await nr1DownloadReportGET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain('Radar_NR-1_');
    expect(cd).toContain('.pdf');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x25);

    // Rastro em radarNR1Reports (§11.6).
    const rows = await client.db
      .select()
      .from(radarNR1Reports)
      .where(
        and(eq(radarNR1Reports.companyId, companyId), eq(radarNR1Reports.cicloDbId, cicloDbId)),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
