// ROIP APP 9BOX — teste de integracao `monthlyClosureOrchestrator` (ME-031).
//
// Motor canonico do fechamento mensal e desbloqueio (DOC 03 §18 + §4 +
// DOC 06 §13.7 + §15.1). Testes contra MySQL real com companies
// fabricadas por CNPJ unico (padrao S009 consolidado no Bloco B1).
// `now` e injetado como Date literal — o motor e deterministico por
// design (S044).
//
// Cobertura por describe:
//   1) `expireUnlockWindow` — transicao atomica desbloqueado → fechado;
//      deteccao S047 de `houveAlteracao`; NOOP quando status != desbloqueado.
//   2) `recalculateAfterUnlock` + `triggerRetroactiveRecalculation` —
//      delegacao para DI `recalculateQuarter`; derivacao trimestre <- mes.
//   3) `checkAndTriggerQuarterlyCalculation` — dispara so quando
//      terceiro mes + trimestre completo.
//   4) `processClosedMonth` — cascata: alertas + updateCycleSchedule +
//      processadoEm + trimestre.
//   5) `runDailyClosureJob` — orquestracao completa por empresa (fuso
//      local, dia 11, expiracao de janelas).
//   6) Contratos de tipo e no-op defaults — RV-13/L29.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  companyMonthlyData,
  cycleSchedule,
  monthlyClosureStatus,
  monthlyUnlockLog,
  performanceData,
  performanceVariableData,
  superAdmins,
} from '../../src/db/schema';
import { insertMonthlyClosureStatus } from '../../src/server/services/monthlyClosureStatus';
import { insertMonthlyUnlockLog } from '../../src/server/services/monthlyUnlockLog';
import type { EmitAutoAlert } from '../../src/server/services/cycleScheduleEngine';
import {
  checkAndTriggerQuarterlyCalculation,
  type CheckAndTriggerQuarterlyCalculationResult,
  type EvaluateAdminAlerts,
  type EvaluateMonthlyAlerts,
  expireUnlockWindow,
  type ExpireUnlockWindowResult,
  NOOP_EVALUATE_ADMIN_ALERTS,
  NOOP_EVALUATE_MONTHLY_ALERTS,
  NOOP_RECALCULATE_QUARTER,
  NOOP_TRIGGER_QUARTERLY_CALCULATION,
  type OrchestratorDependencies,
  processClosedMonth,
  type ProcessClosedMonthResult,
  recalculateAfterUnlock,
  type RecalculateQuarter,
  runDailyClosureJob,
  type RunDailyClosureJobResult,
  triggerRetroactiveRecalculation,
  type TriggerQuarterlyCalculation,
} from '../../src/server/services/monthlyClosureOrchestrator';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_EXPIRE = '10000000000340';
const CNPJ_RECALC = '10000000000341';
const CNPJ_QUARTERLY = '10000000000342';
const CNPJ_PROCESS = '10000000000343';
const CNPJ_DAILY_SP = '10000000000344';
const CNPJ_DAILY_UTC = '10000000000345';

type CompanyFixture = typeof companies.$inferInsert;

function fixture(cnpj: string, tag: string, timezone?: string): CompanyFixture {
  return {
    razaoSocial: `Empresa Orchestrator ${tag} LTDA`,
    nomeFantasia: `Empresa Orchestrator ${tag}`,
    cnpj,
    telefone: '1633330031',
    endereco: `Rua Orchestrator, ${tag}`,
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Contato Principal',
    contatoPrincipalEmail: `principal.${tag}@orchestrator.local`,
    contatoRHNome: 'Contato RH',
    contatoRHEmail: `rh.${tag}@orchestrator.local`,
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Descricao',
    contextoMercado: 'Contexto',
    mesKickoff: 1,
    ...(timezone !== undefined ? { timezone } : {}),
  };
}

async function insertBrunoSuperAdmin(client: RoipDbClient, tag: string): Promise<number> {
  const [row] = await client.db
    .insert(superAdmins)
    .values({
      name: 'Bruno Andrade',
      email: `bruno.${tag}@orchestrator.local`,
      passwordHash: '$2b$12$mockhashvalidoparaesquematestesomente',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar super admin ${tag}`);
  return row.id;
}

// ============================================================
// Describe 1 — expireUnlockWindow (DOC 06 §13.7)
// ============================================================

describe('service monthlyClosureOrchestrator — expireUnlockWindow (ME-031)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let superAdminId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_EXPIRE, 'Expire'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Expire');
    companyId = row.id;
    superAdminId = await insertBrunoSuperAdmin(client, 'expire');
  });

  afterAll(async () => {
    await client.db.delete(performanceVariableData).where(
      eq(
        performanceVariableData.performanceDataId,
        // subquery com performanceData sera limpo depois; delete direto por FK cascade abaixo
        performanceVariableData.performanceDataId,
      ),
    );
    await client.db.delete(performanceData).where(eq(performanceData.companyId, companyId));
    await client.db.delete(companyMonthlyData).where(eq(companyMonthlyData.companyId, companyId));
    await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, companyId));
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, superAdminId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceData).where(eq(performanceData.companyId, companyId));
    await client.db.delete(companyMonthlyData).where(eq(companyMonthlyData.companyId, companyId));
    await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, companyId));
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
  });

  it('NOOP quando status corrente eh aberto (motivo=nao_desbloqueado)', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'aberto',
    });
    const now = new Date('2026-02-15T12:00:00Z');
    const result: ExpireUnlockWindowResult = await expireUnlockWindow(
      client.db,
      companyId,
      '2026-01',
      now,
    );
    expect(result).toStrictEqual({
      expirada: false,
      houveAlteracao: false,
      recalculoDisparado: false,
      motivo: 'nao_desbloqueado',
    });
    const [after] = await client.db
      .select({ status: monthlyClosureStatus.status })
      .from(monthlyClosureStatus)
      .where(
        and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, '2026-01')),
      );
    expect(after?.status).toBe('aberto');
  });

  it('NOOP quando status corrente eh fechado (motivo=nao_desbloqueado)', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });
    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now);
    expect(result.expirada).toBe(false);
    expect(result.motivo).toBe('nao_desbloqueado');
  });

  it('NOOP quando linha nao existe em monthlyClosureStatus', async () => {
    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now);
    expect(result).toStrictEqual({
      expirada: false,
      houveAlteracao: false,
      recalculoDisparado: false,
      motivo: 'nao_desbloqueado',
    });
  });

  it('expira janela sem alteracao (houveAlteracao=false)', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'desbloqueado',
    });
    const desbloqueadoEm = new Date('2026-02-14T00:00:00Z');
    await insertMonthlyUnlockLog(client.db, {
      companyId,
      mes: '2026-01',
      aba: 'rh',
      desbloqueadoPor: superAdminId,
      justificativa:
        'A'.repeat(120) + ' — justificativa canonica de 120+ chars para satisfazer 100-500.',
      desbloqueadoEm,
      expiraEm: new Date('2026-02-15T00:00:00Z'),
      houveAlteracao: false,
    });

    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const recalcCaptor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };

    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now, {
      recalculateQuarter: recalcCaptor,
    });
    expect(result.expirada).toBe(true);
    expect(result.houveAlteracao).toBe(false);
    expect(result.recalculoDisparado).toBe(false);
    expect(result.motivo).toBe('ok');
    expect(capturados).toHaveLength(0);

    const [after] = await client.db
      .select({
        status: monthlyClosureStatus.status,
        dataFechamento: monthlyClosureStatus.dataFechamento,
      })
      .from(monthlyClosureStatus)
      .where(
        and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, '2026-01')),
      );
    expect(after?.status).toBe('fechado');
    expect(after?.dataFechamento).not.toBeNull();

    const [logAfter] = await client.db
      .select({ houveAlteracao: monthlyUnlockLog.houveAlteracao })
      .from(monthlyUnlockLog)
      .where(and(eq(monthlyUnlockLog.companyId, companyId), eq(monthlyUnlockLog.mes, '2026-01')));
    expect(logAfter?.houveAlteracao).toBe(false);
  });

  it('detecta houveAlteracao=true via companyMonthlyData.updatedAt', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'desbloqueado',
    });
    const desbloqueadoEm = new Date('2026-02-14T00:00:00Z');
    await insertMonthlyUnlockLog(client.db, {
      companyId,
      mes: '2026-01',
      aba: 'faturamento',
      desbloqueadoPor: superAdminId,
      justificativa: 'B'.repeat(120) + ' — justificativa canonica satisfazendo 100-500 chars.',
      desbloqueadoEm,
      expiraEm: new Date('2026-02-15T00:00:00Z'),
      houveAlteracao: false,
    });

    // Insere/atualiza companyMonthlyData com updatedAt >= desbloqueadoEm
    // (o proprio INSERT default gera updatedAt=NOW; como estamos ~agora,
    // e maior que desbloqueadoEm de fevereiro).
    await client.db.insert(companyMonthlyData).values({
      companyId,
      mes: '2026-01',
      faturamentoBruto: '1500000.00',
      diasUteis: 22,
    });

    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const recalcCaptor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };

    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now, {
      recalculateQuarter: recalcCaptor,
    });
    expect(result.expirada).toBe(true);
    expect(result.houveAlteracao).toBe(true);
    expect(result.recalculoDisparado).toBe(true);
    expect(result.motivo).toBe('ok');
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2026-Q1' }]);
  });

  it('detecta houveAlteracao=true via performanceData.updatedAt', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'desbloqueado',
    });
    // Inserimos employee minimo para ancorar a FK canonica de
    // performanceData.employeeId (restrict). Campos obrigatorios
    // conforme schema DOC 01: name, cpf, dataNascimento, dataAdmissao,
    // cbo, descricaoCBO, jobFamily, senioridade, nivelHierarquico,
    // departamento.
    const { employees } = await import('../../src/db/schema');
    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp Expire',
        cpf: '10000000034',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2026-01-01'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!emp) throw new Error('falha employee');

    const desbloqueadoEm = new Date('2026-02-14T00:00:00Z');
    await insertMonthlyUnlockLog(client.db, {
      companyId,
      mes: '2026-01',
      aba: 'rh',
      desbloqueadoPor: superAdminId,
      justificativa: 'C'.repeat(150) + ' — justificativa canonica.',
      desbloqueadoEm,
      expiraEm: new Date('2026-02-15T00:00:00Z'),
      houveAlteracao: false,
    });

    await client.db.insert(performanceData).values({
      companyId,
      employeeId: emp.id,
      mes: '2026-01',
      custoTotalMes: '5000.00',
      diasUteis: 22,
      faltas: 0,
    });

    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now);
    expect(result.houveAlteracao).toBe(true);

    // cleanup
    await client.db.delete(performanceData).where(eq(performanceData.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, emp.id));
  });

  it('sem monthlyUnlockLog: transiciona e retorna motivo=sem_unlock_log', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'desbloqueado',
    });
    const now = new Date('2026-02-15T12:00:00Z');
    const result = await expireUnlockWindow(client.db, companyId, '2026-01', now);
    expect(result.expirada).toBe(true);
    expect(result.motivo).toBe('sem_unlock_log');
    const [after] = await client.db
      .select({ status: monthlyClosureStatus.status })
      .from(monthlyClosureStatus)
      .where(
        and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, '2026-01')),
      );
    expect(after?.status).toBe('fechado');
  });
});

// ============================================================
// Describe 2 — recalculateAfterUnlock + triggerRetroactiveRecalculation
// ============================================================

describe('service monthlyClosureOrchestrator — recalculate hooks (ME-031)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_RECALC, 'Recalc'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Recalc');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  it('recalculateAfterUnlock deriva trimestre canonico Q1 para mes 2026-02', async () => {
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const disparado = await recalculateAfterUnlock(client.db, companyId, '2026-02', {
      recalculateQuarter: captor,
    });
    expect(disparado).toBe(true);
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2026-Q1' }]);
  });

  it('recalculateAfterUnlock deriva Q4 para mes 2026-11', async () => {
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    await recalculateAfterUnlock(client.db, companyId, '2026-11', {
      recalculateQuarter: captor,
    });
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2026-Q4' }]);
  });

  it('recalculateAfterUnlock com mes invalido retorna false e nao dispara', async () => {
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const disparado = await recalculateAfterUnlock(client.db, companyId, 'lixo', {
      recalculateQuarter: captor,
    });
    expect(disparado).toBe(false);
    expect(capturados).toHaveLength(0);
  });

  it('recalculateAfterUnlock com default no-op nao lanca', async () => {
    const disparado = await recalculateAfterUnlock(client.db, companyId, '2026-05');
    expect(disparado).toBe(true);
  });

  it('triggerRetroactiveRecalculation delega ao recalculateQuarter literal', async () => {
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: RecalculateQuarter = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    await triggerRetroactiveRecalculation(client.db, companyId, '2025-Q4', {
      recalculateQuarter: captor,
    });
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2025-Q4' }]);
  });

  it('triggerRetroactiveRecalculation com default no-op nao lanca', async () => {
    await expect(
      triggerRetroactiveRecalculation(client.db, companyId, '2026-Q2'),
    ).resolves.toBeUndefined();
  });
});

// ============================================================
// Describe 3 — checkAndTriggerQuarterlyCalculation
// ============================================================

describe('service monthlyClosureOrchestrator — checkAndTriggerQuarterly (ME-031)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_QUARTERLY, 'Quarterly'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Quarterly');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
  });

  it('nao dispara quando mes nao eh terceiro (motivo=nao_e_terceiro_mes)', async () => {
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const result: CheckAndTriggerQuarterlyCalculationResult =
      await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-02', {
        triggerQuarterlyCalculation: captor,
      });
    expect(result).toStrictEqual({
      triggered: false,
      trimestre: '2026-Q1',
      motivo: 'nao_e_terceiro_mes',
    });
    expect(capturados).toHaveLength(0);
  });

  it('nao dispara quando terceiro mes mas trimestre incompleto', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-03',
      status: 'fechado',
    });
    // Faltam 2026-01 e 2026-02
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-03', {
      triggerQuarterlyCalculation: captor,
    });
    expect(result.triggered).toBe(false);
    expect(result.motivo).toBe('trimestre_incompleto');
    expect(capturados).toHaveLength(0);
  });

  it('nao dispara quando 3 meses existem mas um esta desbloqueado', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-02',
      status: 'desbloqueado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-03',
      status: 'fechado',
    });
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-03', {
      triggerQuarterlyCalculation: captor,
    });
    expect(result.triggered).toBe(false);
    expect(result.motivo).toBe('trimestre_incompleto');
    expect(capturados).toHaveLength(0);
  });

  it('dispara quando terceiro mes e trimestre completo (Q1)', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-02',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-03',
      status: 'fechado',
    });
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-03', {
      triggerQuarterlyCalculation: captor,
    });
    expect(result).toStrictEqual({
      triggered: true,
      trimestre: '2026-Q1',
      motivo: 'ok',
    });
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2026-Q1' }]);
  });

  it('dispara para Q4 (dezembro fecha)', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-10',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-11',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-12',
      status: 'fechado',
    });
    const capturados: Array<{ companyId: number; trimestre: string }> = [];
    const captor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      capturados.push({ companyId, trimestre });
    };
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-12', {
      triggerQuarterlyCalculation: captor,
    });
    expect(result.triggered).toBe(true);
    expect(result.trimestre).toBe('2026-Q4');
    expect(capturados).toStrictEqual([{ companyId, trimestre: '2026-Q4' }]);
  });

  it('mes invalido retorna motivo=mes_invalido', async () => {
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, 'lixo');
    expect(result).toStrictEqual({
      triggered: false,
      trimestre: null,
      motivo: 'mes_invalido',
    });
  });

  it('default no-op nao lanca com trimestre completo', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-04',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-05',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-06',
      status: 'fechado',
    });
    const result = await checkAndTriggerQuarterlyCalculation(client.db, companyId, '2026-06');
    expect(result.triggered).toBe(true);
    expect(result.trimestre).toBe('2026-Q2');
  });
});

// ============================================================
// Describe 4 — processClosedMonth (DOC 03 §4 + §18.1)
// ============================================================

describe('service monthlyClosureOrchestrator — processClosedMonth (ME-031)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_PROCESS, 'Process'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Process');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
  });

  it('cascata: chama evaluateMonthlyAlerts, cria cycleSchedule, marca processadoEm', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });

    const alertasCapturados: Array<{ companyId: number; mes: string }> = [];
    const alertCaptor: EvaluateMonthlyAlerts = async (companyId, mes) => {
      alertasCapturados.push({ companyId, mes });
    };
    const emitCapturados: Array<{ tipo: string; ref: string }> = [];
    const emitCaptor: EmitAutoAlert = async (tipo, ref) => {
      emitCapturados.push({ tipo, ref });
    };

    const now = new Date('2026-02-11T00:00:00Z');
    const result: ProcessClosedMonthResult = await processClosedMonth(
      client.db,
      companyId,
      '2026-01',
      now,
      {
        evaluateMonthlyAlerts: alertCaptor,
        emitAutoAlert: emitCaptor,
      },
    );

    expect(alertasCapturados).toStrictEqual([{ companyId, mes: '2026-01' }]);
    expect(emitCapturados).toStrictEqual([{ tipo: 'fechamento_mensal', ref: '2026-01' }]);
    expect(result.processadoEmMarcado).toBe(true);
    expect(result.trimestreDisparado).toBeNull();

    const [csRow] = await client.db
      .select({ status: cycleSchedule.status })
      .from(cycleSchedule)
      .where(
        and(
          eq(cycleSchedule.companyId, companyId),
          eq(cycleSchedule.tipoCiclo, 'fechamento_mensal'),
          eq(cycleSchedule.cicloReferencia, '2026-01'),
        ),
      );
    expect(csRow?.status).toBe('fechado');

    const [mcs] = await client.db
      .select({ processadoEm: monthlyClosureStatus.processadoEm })
      .from(monthlyClosureStatus)
      .where(
        and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, '2026-01')),
      );
    expect(mcs?.processadoEm).not.toBeNull();
  });

  it('encadeia calculo trimestral quando terceiro mes com trimestre completo', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-02',
      status: 'fechado',
    });
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-03',
      status: 'fechado',
    });

    const trimestralCapturados: Array<{ companyId: number; trimestre: string }> = [];
    const trimestralCaptor: TriggerQuarterlyCalculation = async (companyId, trimestre) => {
      trimestralCapturados.push({ companyId, trimestre });
    };

    const now = new Date('2026-04-11T00:00:00Z');
    const result = await processClosedMonth(client.db, companyId, '2026-03', now, {
      triggerQuarterlyCalculation: trimestralCaptor,
    });
    expect(result.trimestreDisparado).toBe('2026-Q1');
    expect(trimestralCapturados).toStrictEqual([{ companyId, trimestre: '2026-Q1' }]);
  });

  it('re-execucao no mesmo mes: updateCycleSchedule nao re-emite alerta', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });

    const emitCapturados: Array<{ tipo: string; ref: string }> = [];
    const emitCaptor: EmitAutoAlert = async (tipo, ref) => {
      emitCapturados.push({ tipo, ref });
    };

    const now = new Date('2026-02-11T00:00:00Z');
    await processClosedMonth(client.db, companyId, '2026-01', now, {
      emitAutoAlert: emitCaptor,
    });
    await processClosedMonth(client.db, companyId, '2026-01', now, {
      emitAutoAlert: emitCaptor,
    });
    // Primeira execucao: cycleSchedule entra como fechado + emitAutoAlert.
    // Segunda: cycleSchedule ja esta fechado, updateCycleSchedule nao
    // reemite (`transitionedToFechado=false`).
    expect(emitCapturados).toHaveLength(1);
  });

  it('processClosedMonth com defaults completos nao lanca', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId,
      mes: '2026-01',
      status: 'fechado',
    });
    const now = new Date('2026-02-11T00:00:00Z');
    const result = await processClosedMonth(client.db, companyId, '2026-01', now);
    expect(result.processadoEmMarcado).toBe(true);
  });

  it('sem linha em monthlyClosureStatus: processadoEmMarcado=false, cascata parcial', async () => {
    const emitCapturados: Array<{ tipo: string; ref: string }> = [];
    const emitCaptor: EmitAutoAlert = async (tipo, ref) => {
      emitCapturados.push({ tipo, ref });
    };
    const now = new Date('2026-02-11T00:00:00Z');
    const result = await processClosedMonth(client.db, companyId, '2026-01', now, {
      emitAutoAlert: emitCaptor,
    });
    // cycleSchedule ainda eh atualizado (INSERT novo com status=fechado)
    // porque updateCycleSchedule nao depende de monthlyClosureStatus.
    expect(result.processadoEmMarcado).toBe(false);
    expect(emitCapturados).toStrictEqual([{ tipo: 'fechamento_mensal', ref: '2026-01' }]);
  });
});

// ============================================================
// Describe 5 — runDailyClosureJob (DOC 06 §15.1 + DOC 03 §4.2)
// ============================================================

describe('service monthlyClosureOrchestrator — runDailyClosureJob (ME-031)', () => {
  let client: RoipDbClient;
  let companyIdSP: number;
  let companyIdUTC: number;
  let superAdminId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [rowSP] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_DAILY_SP, 'DailySP'))
      .$returningId();
    if (!rowSP) throw new Error('beforeAll: falha ao criar company DailySP');
    companyIdSP = rowSP.id;

    const [rowUTC] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_DAILY_UTC, 'DailyUTC', 'UTC'))
      .$returningId();
    if (!rowUTC) throw new Error('beforeAll: falha ao criar company DailyUTC');
    companyIdUTC = rowUTC.id;

    superAdminId = await insertBrunoSuperAdmin(client, 'daily');
  });

  afterAll(async () => {
    for (const cid of [companyIdSP, companyIdUTC]) {
      await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, cid));
      await client.db.delete(monthlyClosureStatus).where(eq(monthlyClosureStatus.companyId, cid));
      await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, cid));
      await client.db.delete(companies).where(eq(companies.id, cid));
    }
    await client.db.delete(superAdmins).where(eq(superAdmins.id, superAdminId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    for (const cid of [companyIdSP, companyIdUTC]) {
      await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, cid));
      await client.db.delete(monthlyClosureStatus).where(eq(monthlyClosureStatus.companyId, cid));
      await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, cid));
    }
  });

  it('dia normal (nao dia 11): refresha cycleSchedule sem fechar nada', async () => {
    const now = new Date('2026-02-15T15:00:00Z');
    const result: RunDailyClosureJobResult = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(result.mesesFechadosDia11).toStrictEqual([]);
    expect(result.janelasExpiradas).toBe(0);
    expect(result.refreshedCycleScheduleRows).toBeGreaterThan(0);
  });

  it('dia 11 no fuso local: fecha mes anterior e encadeia cycleSchedule', async () => {
    // 11 Fev 2026 12:00 UTC → dia 11 tambem em -03:00 (09:00 local SP)
    const now = new Date('2026-02-11T12:00:00Z');
    const emitCapturados: Array<{ tipo: string; ref: string }> = [];
    const emitCaptor: EmitAutoAlert = async (tipo, ref) => {
      emitCapturados.push({ tipo, ref });
    };

    const result = await runDailyClosureJob(client.db, companyIdSP, now, {
      emitAutoAlert: emitCaptor,
    });

    expect(result.mesesFechadosDia11).toStrictEqual(['2026-01']);

    const [mcs] = await client.db
      .select({ status: monthlyClosureStatus.status })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, companyIdSP),
          eq(monthlyClosureStatus.mes, '2026-01'),
        ),
      );
    expect(mcs?.status).toBe('fechado');

    const [csRow] = await client.db
      .select({ status: cycleSchedule.status })
      .from(cycleSchedule)
      .where(
        and(
          eq(cycleSchedule.companyId, companyIdSP),
          eq(cycleSchedule.tipoCiclo, 'fechamento_mensal'),
          eq(cycleSchedule.cicloReferencia, '2026-01'),
        ),
      );
    expect(csRow?.status).toBe('fechado');

    // Alerta canonico ciclo_mensal_fechado emitido para o mes anterior
    const mensalEmit = emitCapturados.find((e) => e.ref === '2026-01');
    expect(mensalEmit).toBeDefined();
  });

  it('dia 11 idempotente: segunda execucao no mesmo dia nao re-fecha', async () => {
    const now = new Date('2026-02-11T12:00:00Z');
    const r1 = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(r1.mesesFechadosDia11).toStrictEqual(['2026-01']);
    const r2 = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(r2.mesesFechadosDia11).toStrictEqual([]);
  });

  it('expira janela vencida durante a passagem diaria', async () => {
    await insertMonthlyClosureStatus(client.db, {
      companyId: companyIdSP,
      mes: '2025-12',
      status: 'desbloqueado',
    });
    await insertMonthlyUnlockLog(client.db, {
      companyId: companyIdSP,
      mes: '2025-12',
      aba: 'rh',
      desbloqueadoPor: superAdminId,
      justificativa: 'D'.repeat(120) + ' — janela para expirar durante o job.',
      desbloqueadoEm: new Date('2026-01-31T22:00:00Z'),
      expiraEm: new Date('2026-02-01T22:00:00Z'),
      houveAlteracao: false,
    });

    const now = new Date('2026-02-15T12:00:00Z');
    const result = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(result.janelasExpiradas).toBe(1);

    const [after] = await client.db
      .select({ status: monthlyClosureStatus.status })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, companyIdSP),
          eq(monthlyClosureStatus.mes, '2025-12'),
        ),
      );
    expect(after?.status).toBe('fechado');
  });

  it('empresa em fuso UTC: dia 11 UTC eh dia 11 local', async () => {
    const now = new Date('2026-02-11T15:00:00Z');
    const result = await runDailyClosureJob(client.db, companyIdUTC, now);
    expect(result.mesesFechadosDia11).toStrictEqual(['2026-01']);
  });

  it('fuso -03: dia 12 UTC 02:00 eh dia 11 America/Sao_Paulo local', async () => {
    // 12 Feb 2026 02:00 UTC → 11 Feb 2026 23:00 -03:00 (dia 11 local)
    const now = new Date('2026-02-12T02:00:00Z');
    const result = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(result.mesesFechadosDia11).toStrictEqual(['2026-01']);
  });

  it('mesma data com dois fusos: UTC fecha, SP fecha, mas UTC nao fecha SP', async () => {
    // 12 Feb 2026 15:00 UTC — SP eh dia 12 local (-03) → NAO fecha
    const now = new Date('2026-02-12T15:00:00Z');
    const rSP = await runDailyClosureJob(client.db, companyIdSP, now);
    expect(rSP.mesesFechadosDia11).toStrictEqual([]);
  });

  it('empresa inexistente: lanca no refreshCycleSchedule', async () => {
    const now = new Date('2026-02-15T12:00:00Z');
    await expect(runDailyClosureJob(client.db, 999999, now)).rejects.toThrow(
      /company 999999 nao existe/,
    );
  });
});

// ============================================================
// Describe 6 — contratos de tipo e no-op defaults
// ============================================================

describe('service monthlyClosureOrchestrator — contratos e no-ops (ME-031)', () => {
  it('NOOP_EVALUATE_MONTHLY_ALERTS satisfaz o tipo e resolve sem lancar', async () => {
    const fn: EvaluateMonthlyAlerts = NOOP_EVALUATE_MONTHLY_ALERTS;
    await expect(fn(1, '2026-01')).resolves.toBeUndefined();
  });

  it('NOOP_EVALUATE_ADMIN_ALERTS satisfaz o tipo e resolve sem lancar', async () => {
    const fn: EvaluateAdminAlerts = NOOP_EVALUATE_ADMIN_ALERTS;
    await expect(
      fn('fechamento_bloqueado_sem_resp_financeiro', 1, '2026-01'),
    ).resolves.toBeUndefined();
  });

  it('NOOP_TRIGGER_QUARTERLY_CALCULATION satisfaz o tipo e resolve sem lancar', async () => {
    const fn: TriggerQuarterlyCalculation = NOOP_TRIGGER_QUARTERLY_CALCULATION;
    await expect(fn(1, '2026-Q1')).resolves.toBeUndefined();
  });

  it('NOOP_RECALCULATE_QUARTER satisfaz o tipo e resolve sem lancar', async () => {
    const fn: RecalculateQuarter = NOOP_RECALCULATE_QUARTER;
    await expect(fn(1, '2026-Q1')).resolves.toBeUndefined();
  });

  it('OrchestratorDependencies aceita apenas campos parciais (todos opcionais)', () => {
    const vazio: OrchestratorDependencies = {};
    const parcial: OrchestratorDependencies = {
      recalculateQuarter: NOOP_RECALCULATE_QUARTER,
    };
    const completo: OrchestratorDependencies = {
      emitAutoAlert: async () => undefined,
      evaluateMonthlyAlerts: NOOP_EVALUATE_MONTHLY_ALERTS,
      evaluateAdminAlerts: NOOP_EVALUATE_ADMIN_ALERTS,
      triggerQuarterlyCalculation: NOOP_TRIGGER_QUARTERLY_CALCULATION,
      recalculateQuarter: NOOP_RECALCULATE_QUARTER,
    };
    expect(vazio).toStrictEqual({});
    expect(parcial.recalculateQuarter).toBe(NOOP_RECALCULATE_QUARTER);
    expect(Object.keys(completo)).toHaveLength(5);
  });
});
