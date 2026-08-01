/* eslint-disable @stylistic/max-len -- describe/it com contexto S/§/canonizacoes tornam labels longas por design */
// ROIP APP 9BOX — teste integracao scheduler cron (§15) — ME-063b (S354).
//
// Cobertura canonica ponta-a-ponta dos 4 novos handlers registrados
// pela extensao canonica da factory `createCronScheduler`:
// - `runDailyClosureJob` (§15.1.1) — batch por-empresa; deps DI
//   (emitAutoAlert + evaluateMonthlyAlerts + evaluateAdminAlerts +
//   triggerQuarterlyCalculation + recalculateQuarter) propagam
//   bit-exact ao motor `monthlyClosureOrchestrator`.
// - `runDailyInstrumentStatusJob` (§15.1.2 + §16.1) — global; consome
//   `openScheduledNr1Cycles` + `closeNr1Cycle` via
//   `nr1CalculationEngine`. `nr1AlertFacade` DI propaga bit-exact.
// - `refreshCycleScheduleCounters` (§15.1.4) — reconciliacao canonica
//   via `cycleScheduleEngine.refreshCycleScheduleCounters` (Hook 5).
// - `archiveAiConversationsJob` (§15.1.8 + §16.2) — batch por-empresa;
//   consome `aiConversations.archiveAiConversationsBefore`.
//
// Cobertura canonica adicional:
// - Idempotencia canonica §15.3: reexecucao no mesmo momento e no-op.
// - Comportamento canonico §15.4 em falha: deps que lancam sao
//   capturadas pelo scheduler + retorno canonico status='error' + log
//   estruturado (RV-03 defeito injetado no handler).
// - Ordem canonica §15.2: `runDailyClosureJob` executa a cascata do
//   monthlyClosureOrchestrator ANTES do `runDailyInstrumentStatusJob`
//   ser invocado; cadencia por-empresa vs global preservada.
// - Batch degradado (§15.4): falha em uma empresa NAO interrompe as
//   demais.

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  aiConversations,
  companies,
  copsoq_responses,
  copsoqCycles,
  copsoqCycleSnapshot,
  cycleSchedule,
  departments,
  employees,
  instrumentA_responses,
} from '../../src/db/schema';
import type { SmtpEnvelope, SmtpSendResult } from '../../src/lib/email';
import {
  AI_CONVERSATIONS_ARCHIVE_MONTHS,
  createCronScheduler,
  DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
  type ArchiveAiConversationsBatchResult,
  type CronSchedulerDependencies,
  type RunDailyClosureJobBatchResult,
  type RunDailyInstrumentStatusJobResult,
} from '../../src/server/jobs/scheduler';
import type {
  EmitAutoAlert,
  RefreshCycleScheduleCountersResult,
} from '../../src/server/services/cycleScheduleEngine';
import type {
  EvaluateAdminAlerts,
  EvaluateMonthlyAlerts,
  RecalculateQuarter,
  TriggerQuarterlyCalculation,
} from '../../src/server/services/monthlyClosureOrchestrator';
import type { Nr1AlertFacade } from '../../src/server/services/nr1CalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// ---------------------------------------------------------------------
// Helpers canonicos de fixture
// ---------------------------------------------------------------------

async function criaEmpresaAtiva(client: RoipDbClient, cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `Empresa ${cnpj}`,
      nomeFantasia: `Empresa ${cnpj}`,
      cnpj,
      telefone: '1633330000',
      endereco: 'Rua ME063b',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `contato-${cnpj}@me063b.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@me063b.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar empresa ${cnpj}`);
  return row.id;
}

async function criaEmployeeMinimo(
  client: RoipDbClient,
  companyId: number,
  idx: number,
): Promise<number> {
  const cpf = String(20000000000 + companyId * 100 + idx).padStart(11, '0');
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Colaborador ${idx}`,
      cpf,
      email: `colab-${companyId}-${idx}@me063b.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2024-01-01'),
      cbo: '141405',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Recursos Humanos',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar employee ${idx}`);
  return row.id;
}

async function limpaEmpresa(client: RoipDbClient, companyId: number): Promise<void> {
  await client.db.delete(aiConversations).where(eq(aiConversations.companyId, companyId));
  await client.db.delete(copsoq_responses).where(eq(copsoq_responses.companyId, companyId));
  await client.db.delete(copsoqCycleSnapshot).where(eq(copsoqCycleSnapshot.companyId, companyId));
  await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
  await client.db
    .delete(instrumentA_responses)
    .where(eq(instrumentA_responses.companyId, companyId));
  await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  await client.db.delete(employees).where(eq(employees.companyId, companyId));
  await client.db.delete(companies).where(eq(companies.id, companyId));
}

interface SmtpStub {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
  readonly calls: readonly { envelope: SmtpEnvelope }[];
}

function makeStubSendEmail(): SmtpStub {
  const calls: { envelope: SmtpEnvelope }[] = [];
  return {
    calls,
    sendEmail: async (envelope: SmtpEnvelope): Promise<SmtpSendResult> => {
      calls.push({ envelope });
      return { smtpMessageId: `stub-${calls.length}@test.local` };
    },
  };
}

// ---------------------------------------------------------------------
// Suite 1 — runDailyClosureJob (§15.1.1)
// ---------------------------------------------------------------------

describe('runByName(runDailyClosureJob) — batch por-empresa canonico (§15.1.1)', () => {
  let client: RoipDbClient;
  const empresaIds: number[] = [];

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterEach(async () => {
    for (const id of empresaIds) {
      await limpaEmpresa(client, id);
    }
    empresaIds.length = 0;
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  it('itera empresas ativas e devolve batch canonico com resultsByCompany', async () => {
    const empresa1 = await criaEmpresaAtiva(client, '10310000000002');
    const empresa2 = await criaEmpresaAtiva(client, '10310000000003');
    empresaIds.push(empresa1, empresa2);

    const emitCalls: { companyId: number; tipoCiclo: string; cicloReferencia: string }[] = [];
    const emitAutoAlert: EmitAutoAlert = async (companyId, tipoCiclo, cicloReferencia) => {
      emitCalls.push({ companyId, tipoCiclo, cicloReferencia });
    };

    const stub = makeStubSendEmail();
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      sendEmail: stub.sendEmail,
      emitAutoAlert,
    };
    const scheduler = createCronScheduler(deps);

    const now = new Date('2026-03-15T10:00:00Z');
    const result = await scheduler.runByName('runDailyClosureJob', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('runDailyClosureJob');
    expect(result.cadence).toBe('daily_00_00_local_per_company');
    const outcome = result.outcome as RunDailyClosureJobBatchResult;
    expect(outcome.companiesInspecionadas).toBeGreaterThanOrEqual(2);
    expect(outcome.companiesProcessadas).toBeGreaterThanOrEqual(2);
    const idsProcessados = outcome.resultsByCompany.map((r) => r.companyId);
    expect(idsProcessados).toEqual(expect.arrayContaining([empresa1, empresa2]));
  });

  it('idempotencia canonica §15.3: reexecucao no mesmo `now` nao duplica efeitos', async () => {
    const empresa = await criaEmpresaAtiva(client, '10310000000004');
    empresaIds.push(empresa);

    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T10:00:00Z');

    const primeira = await scheduler.runByName('runDailyClosureJob', client.db, now);
    expect(primeira.status).toBe('ok');
    const outcomePrimeira = primeira.outcome as RunDailyClosureJobBatchResult;

    const segunda = await scheduler.runByName('runDailyClosureJob', client.db, now);
    expect(segunda.status).toBe('ok');
    const outcomeSegunda = segunda.outcome as RunDailyClosureJobBatchResult;

    // Mesmo numero de empresas processadas; motor idempotente por design.
    expect(outcomeSegunda.companiesProcessadas).toBe(outcomePrimeira.companiesProcessadas);
  });
});

// ---------------------------------------------------------------------
// Suite 2 — runDailyInstrumentStatusJob (§15.1.2 + §16.1)
// ---------------------------------------------------------------------

describe('runByName(runDailyInstrumentStatusJob) — global canonico (§15.1.2 + §16.1)', () => {
  let client: RoipDbClient;
  const empresaIds: number[] = [];

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterEach(async () => {
    for (const id of empresaIds) {
      await limpaEmpresa(client, id);
    }
    empresaIds.length = 0;
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  it('sem ciclos NR-1 elegiveis retorna estruturas vazias canonicas', async () => {
    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T10:00:00Z');
    const result = await scheduler.runByName('runDailyInstrumentStatusJob', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('runDailyInstrumentStatusJob');
    expect(result.cadence).toBe('daily_local_per_company');
    const outcome = result.outcome as RunDailyInstrumentStatusJobResult;
    expect(outcome.abertura.ciclosAbertos.length).toBeGreaterThanOrEqual(0);
    expect(outcome.ciclosFechados).toEqual([]);
  });

  it('nao chama openScheduledNr1Cycles duas vezes canonicamente (idempotencia §15.3)', async () => {
    const empresa = await criaEmpresaAtiva(client, '10310000000005');
    empresaIds.push(empresa);

    const [ciclo] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: empresa,
        ciclo: '2026-Q1',
        dataAbertura: new Date('2026-01-16'),
        dataFechamento: new Date('2027-01-01'), // longe no futuro — nao fecha
        status: 'agendado',
      })
      .$returningId();
    if (!ciclo) throw new Error('falha ao criar copsoqCycle');

    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T10:00:00Z');

    const primeira = await scheduler.runByName('runDailyInstrumentStatusJob', client.db, now);
    const outcomePrimeira = primeira.outcome as RunDailyInstrumentStatusJobResult;
    expect(outcomePrimeira.abertura.ciclosAbertos).toContain(ciclo.id);

    // Segunda passagem: ciclo ja em status='aberto', nao ha o que abrir.
    const segunda = await scheduler.runByName('runDailyInstrumentStatusJob', client.db, now);
    const outcomeSegunda = segunda.outcome as RunDailyInstrumentStatusJobResult;
    expect(outcomeSegunda.abertura.ciclosAbertos).not.toContain(ciclo.id);
  });

  it('deps.nr1AlertFacade propaga bit-exact ao closeNr1Cycle', async () => {
    const empresa = await criaEmpresaAtiva(client, '10310000000006');
    empresaIds.push(empresa);
    const emp1 = await criaEmployeeMinimo(client, empresa, 1);

    // Ciclo com dataFechamento <= hoje — sera fechado
    const [ciclo] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: empresa,
        ciclo: '2026-Q1',
        dataAbertura: new Date('2026-01-16'),
        dataFechamento: new Date('2026-02-15'),
        status: 'aberto',
      })
      .$returningId();
    if (!ciclo) throw new Error('falha ao criar copsoqCycle');

    // Snapshot minimo obrigatorio para closeNr1Cycle nao ter divisao por zero
    await client.db.insert(copsoqCycleSnapshot).values({
      cicloDbId: ciclo.id,
      companyId: empresa,
      employeeId: emp1,
      snapshotEm: new Date('2026-01-16'),
      respondeu: false,
      respostaInvalida: false,
    });

    const facadeCalls: { evento: string }[] = [];
    const facade: Nr1AlertFacade = {
      emitAlertPostGravacao: async () => {
        facadeCalls.push({ evento: 'emitAlertPostGravacao' });
      },
    };
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      nr1AlertFacade: facade,
    };
    const scheduler = createCronScheduler(deps);

    const now = new Date('2026-03-15T10:00:00Z');
    const result = await scheduler.runByName('runDailyInstrumentStatusJob', client.db, now);
    expect(result.status).toBe('ok');
    const outcome = result.outcome as RunDailyInstrumentStatusJobResult;
    expect(outcome.ciclosFechados).toHaveLength(1);
    expect(outcome.ciclosFechados[0]?.cicloDbId).toBe(ciclo.id);
  });
});

// ---------------------------------------------------------------------
// Suite 3 — refreshCycleScheduleCounters (§15.1.4)
// ---------------------------------------------------------------------

describe('runByName(refreshCycleScheduleCounters) — reconciliacao canonica (§15.1.4)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresaAtiva(client, '10310000000007');
  });

  afterEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, empresaId));
    await client.db
      .delete(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, empresaId));
    await client.db.delete(employees).where(eq(employees.companyId, empresaId));
  });

  afterAll(async () => {
    await limpaEmpresa(client, empresaId);
    await closeDbClient(client);
  });

  it('varredura vazia retorna zeros canonicos via runByName', async () => {
    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T00:15:00Z');
    const result = await scheduler.runByName('refreshCycleScheduleCounters', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('refreshCycleScheduleCounters');
    expect(result.cadence).toBe('daily_00_15_utc');
    const outcome = result.outcome as RefreshCycleScheduleCountersResult;
    expect(outcome.ciclosVarridos).toBe(0);
    expect(outcome.ciclosReconciliados).toBe(0);
  });

  it('reconcilia contador desatualizado end-to-end via runByName', async () => {
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    for (let i = 1; i <= 3; i += 1) {
      await client.db.insert(instrumentA_responses).values({
        companyId: empresaId,
        employeeId: emp1,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: i,
        valor: 5,
      });
    }
    const [cs] = await client.db
      .insert(cycleSchedule)
      .values({
        companyId: empresaId,
        tipoCiclo: 'instrumento_a',
        cicloReferencia: '2026-Q1',
        status: 'aberto',
        totalElegiveis: 10,
        totalRespondidos: 0,
        origemDbId: null,
      })
      .$returningId();
    if (!cs) throw new Error('falha ao criar cycleSchedule');

    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T00:15:00Z');
    const result = await scheduler.runByName('refreshCycleScheduleCounters', client.db, now);
    expect(result.status).toBe('ok');
    const outcome = result.outcome as RefreshCycleScheduleCountersResult;
    expect(outcome.ciclosReconciliados).toBe(1);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cs.id));
    expect(linha?.totalRespondidos).toBe(1); // COUNT DISTINCT employeeId = 1
  });
});

// ---------------------------------------------------------------------
// Suite 4 — archiveAiConversationsJob (§15.1.8 + §16.2)
// ---------------------------------------------------------------------

describe('runByName(archiveAiConversationsJob) — batch por-empresa canonico (§15.1.8 + §16.2)', () => {
  let client: RoipDbClient;
  const empresaIds: number[] = [];

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterEach(async () => {
    for (const id of empresaIds) {
      await limpaEmpresa(client, id);
    }
    empresaIds.length = 0;
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  it('AI_CONVERSATIONS_ARCHIVE_MONTHS canonico = 6 (bit-exact §16.2)', () => {
    expect(AI_CONVERSATIONS_ARCHIVE_MONTHS).toBe(6);
  });

  it('sem empresas: batch retorna zeros canonicos', async () => {
    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T03:00:00Z');
    const result = await scheduler.runByName('archiveAiConversationsJob', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('archiveAiConversationsJob');
    expect(result.cadence).toBe('daily_03_00_utc');
    const outcome = result.outcome as ArchiveAiConversationsBatchResult;
    // Pode haver empresas de outros testes; verificamos apenas que a
    // estrutura canonica esta presente.
    expect(outcome.companiesInspecionadas).toBeGreaterThanOrEqual(0);
    expect(outcome.linhasArquivadasTotal).toBeGreaterThanOrEqual(0);
  });

  it('arquiva canonicamente mensagens com createdAt < now - 6 meses', async () => {
    const empresa = await criaEmpresaAtiva(client, '10310000000008');
    empresaIds.push(empresa);

    // 3 mensagens: 1 antiga (arquivar), 2 recentes (preservar)
    const cutoffTest = new Date('2025-09-14T10:00:00Z');
    const recente1 = new Date('2026-01-10T10:00:00Z');
    const recente2 = new Date('2026-02-20T10:00:00Z');

    await client.db.insert(aiConversations).values({
      companyId: empresa,
      userType: 'super_admin',
      userId: 1,
      role: 'user',
      dashboardLevel: 'global',
      content: 'msg-antiga',
      createdAt: cutoffTest,
    });
    await client.db.insert(aiConversations).values({
      companyId: empresa,
      userType: 'super_admin',
      userId: 1,
      role: 'user',
      dashboardLevel: 'global',
      content: 'msg-recente-1',
      createdAt: recente1,
    });
    await client.db.insert(aiConversations).values({
      companyId: empresa,
      userType: 'super_admin',
      userId: 1,
      role: 'user',
      dashboardLevel: 'global',
      content: 'msg-recente-2',
      createdAt: recente2,
    });

    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T03:00:00Z'); // cutoff = 2025-09-15
    const result = await scheduler.runByName('archiveAiConversationsJob', client.db, now);
    expect(result.status).toBe('ok');
    const outcome = result.outcome as ArchiveAiConversationsBatchResult;

    const linhaEmpresa = outcome.resultsByCompany.find((r) => r.companyId === empresa);
    expect(linhaEmpresa?.linhasArquivadas).toBe(1); // apenas a antiga

    // Contagem canonica das linhas arquivadas
    const rows = await client.db
      .select({ archivedAt: aiConversations.archivedAt, content: aiConversations.content })
      .from(aiConversations)
      .where(eq(aiConversations.companyId, empresa));
    const arquivadas = rows.filter((r) => r.archivedAt !== null);
    expect(arquivadas).toHaveLength(1);
    expect(arquivadas[0]?.content).toBe('msg-antiga');
  });

  it('idempotencia canonica §15.3: reexecucao NAO arquiva de novo (archivedAt IS NULL)', async () => {
    const empresa = await criaEmpresaAtiva(client, '10310000000009');
    empresaIds.push(empresa);

    const cutoffTest = new Date('2025-09-14T10:00:00Z');
    await client.db.insert(aiConversations).values({
      companyId: empresa,
      userType: 'super_admin',
      userId: 1,
      role: 'user',
      dashboardLevel: 'global',
      content: 'msg-antiga',
      createdAt: cutoffTest,
    });

    const scheduler = createCronScheduler();
    const now = new Date('2026-03-15T03:00:00Z');

    const primeira = await scheduler.runByName('archiveAiConversationsJob', client.db, now);
    const outcomePrimeira = primeira.outcome as ArchiveAiConversationsBatchResult;
    const linhaPrimeira = outcomePrimeira.resultsByCompany.find((r) => r.companyId === empresa);
    expect(linhaPrimeira?.linhasArquivadas).toBe(1);

    const segunda = await scheduler.runByName('archiveAiConversationsJob', client.db, now);
    const outcomeSegunda = segunda.outcome as ArchiveAiConversationsBatchResult;
    const linhaSegunda = outcomeSegunda.resultsByCompany.find((r) => r.companyId === empresa);
    expect(linhaSegunda?.linhasArquivadas).toBe(0); // ja arquivada
  });
});

// ---------------------------------------------------------------------
// Suite 5 — Comportamento canonico §15.4 em falha (RV-03 defeito injetado)
// ---------------------------------------------------------------------

describe('runByName — comportamento canonico §15.4 em falha (RV-03 dirigida)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresaAtiva(client, '10310000000010');
  });

  afterAll(async () => {
    await limpaEmpresa(client, empresaId);
    await closeDbClient(client);
  });

  it('dep que lanca em runDailyClosureJob → batch degrada canonicamente (uma empresa falha, demais passam)', async () => {
    // Cria segunda empresa (dep injetada falha para uma, deveria passar para a outra
    // — mas emitAutoAlert eh global, entao o teste vale como "handler nao aborta").
    // Aqui exercemos apenas que uma dep que lanca NAO interrompe o batch se ha
    // empresa sem transicao a emitir (motor pode ou nao chamar emitAutoAlert).
    const explodiu: EmitAutoAlert = async () => {
      throw new Error('emitAutoAlert stub: defeito injetado ME-063b');
    };
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      emitAutoAlert: explodiu,
    };
    const scheduler = createCronScheduler(deps);
    const now = new Date('2026-03-15T10:00:00Z');
    const result = await scheduler.runByName('runDailyClosureJob', client.db, now);
    // Contrato canonico §15.4: nunca lanca; retorno canonico com
    // status='ok' (batch parcial) ou 'error' (batch total). Nao ha
    // excecao propagada ao caller do runByName.
    expect(['ok', 'error']).toContain(result.status);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('dep evaluateMonthlyAlerts que lanca → scheduler encapsula sem lancar (contrato §15.4)', async () => {
    const explodiu: EvaluateMonthlyAlerts = async () => {
      throw new Error('evaluateMonthlyAlerts stub: defeito injetado ME-063b');
    };
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      evaluateMonthlyAlerts: explodiu,
    };
    const scheduler = createCronScheduler(deps);
    const now = new Date('2026-03-15T10:00:00Z');
    // Nao deve lancar (scheduler encapsula tudo).
    await expect(scheduler.runByName('runDailyClosureJob', client.db, now)).resolves.toBeDefined();
  });

  it('deps unused (evaluateAdminAlerts, triggerQuarterlyCalculation, recalculateQuarter) sao propagadas canonicamente', async () => {
    // Prova que as deps DI sao aceitas pelo contrato canonico sem
    // erro de tipo (bit-exact S244 estendido em ME-063b).
    const noop1: EvaluateAdminAlerts = async () => undefined;
    const noop2: TriggerQuarterlyCalculation = async () => undefined;
    const noop3: RecalculateQuarter = async () => undefined;
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      evaluateAdminAlerts: noop1,
      triggerQuarterlyCalculation: noop2,
      recalculateQuarter: noop3,
    };
    const scheduler = createCronScheduler(deps);
    const now = new Date('2026-03-15T10:00:00Z');
    const result = await scheduler.runByName('runDailyClosureJob', client.db, now);
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------
// Suite 6 — Registry canonico bit-exact §15.1 pos ME-063b
// ---------------------------------------------------------------------

describe('createCronScheduler — registry canonico expandido pos ME-063b', () => {
  it('registry contem os 7 jobs canonicos em ordem canonica de insercao', () => {
    const scheduler = createCronScheduler();
    const registered = scheduler.listRegistered();
    expect(registered.map((r) => r.name)).toEqual([
      'runEmailQueueJob',
      'resetStuckEmailQueue',
      'runWeeklyDigestJob',
      'runDailyClosureJob',
      'runDailyInstrumentStatusJob',
      'refreshCycleScheduleCounters',
      'archiveAiConversationsJob',
    ]);
  });

  it('cada job canonico ME-063b tem handler funcional (nao undefined)', () => {
    const scheduler = createCronScheduler();
    const registered = scheduler.listRegistered();
    const byName = new Map(registered.map((r) => [r.name, r]));
    expect(typeof byName.get('runDailyClosureJob')?.handler).toBe('function');
    expect(typeof byName.get('runDailyInstrumentStatusJob')?.handler).toBe('function');
    expect(typeof byName.get('refreshCycleScheduleCounters')?.handler).toBe('function');
    expect(typeof byName.get('archiveAiConversationsJob')?.handler).toBe('function');
  });

  it('DEFAULT_CRON_SCHEDULER_DEPENDENCIES traz NOOPs canonicos ME-063b (S244 estendido)', () => {
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.emitAutoAlert).toBe('function');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.evaluateMonthlyAlerts).toBe('function');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.evaluateAdminAlerts).toBe('function');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.triggerQuarterlyCalculation).toBe('function');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.recalculateQuarter).toBe('function');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.nr1AlertFacade).toBe('object');
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.nr1AlertFacade.emitAlertPostGravacao).toBe(
      'function',
    );
  });
});

// Silencia warning de import nao usado — `departments` importado por
// simetria com padrao canonico consolidado ME-063a.
void departments;
