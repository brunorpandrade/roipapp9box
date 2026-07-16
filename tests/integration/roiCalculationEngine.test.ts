// ROIP APP 9BOX — teste de integracao `roiCalculationEngine` (ME-033).
//
// Motor canonico do calculo trimestral (DOC 03 §3 + §18.1). Testes contra
// MySQL real com companies fabricadas por CNPJ unico (padrao S009
// consolidado). `now` e injetado como Date literal — motor deterministico.
//
// Cobertura por describe:
//   1) `computeMonthlyIndices` — precondicoes §3.7 (fechamento e diasUteis),
//      calculo do Eixo X mensal, skip por colaborador (sem variavel ativa).
//   2) `triggerQuarterlyCalculation` caso feliz — 2 colaboradores, 3 meses,
//      metaROI, faturamento; verifica performanceQuarterlyData + log +
//      companyEconomicDiagnosis.
//   3) Skips canonicos por trimestre — trimestre_incompleto,
//      dias_uteis_nao_lancado, custo_nao_lancado (bloco financeiro),
//      meta_roi_nao_configurada, faturamento_nao_lancado, sem_demanda.
//   4) `recalculateQuarter` — ajusteRetroativo=true; log ganha 2 linhas
//      (execucao anterior + retroativa).
//   5) Idempotencia — 2x triggerQuarterlyCalculation gera 1 linha em
//      performanceQuarterlyData e 2 linhas em performanceMultiplierLog.
//   6) Familia 6 e capacidade ociosa — capacidadeOciosa NULL para Familia 6,
//      valor calculado para as demais.
//   7) Diagnostico economico — status excelente/muito_bom/aceitavel/critico
//      e sem_referencia (roiSegmento* NULL).
//   8) Tolerancia a falha parcial (S055) — colaborador com dados
//      corrompidos nao aborta batch.
//   9) Contratos de tipo e defaults — DEFAULT_THRESHOLD_* e tipos publicos.

import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  companyMonthlyData,
  employeeGoals,
  employees,
  type JobFamily,
  monthlyClosureStatus,
  performanceData,
  performanceMultiplierLog,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../src/db/schema';
import {
  computeMonthlyIndices,
  DEFAULT_THRESHOLD_DESEMPENHO_BAIXO,
  DEFAULT_THRESHOLD_DESEMPENHO_MEDIO,
  type MonthlyIndicesResult,
  recalculateQuarter,
  type RoiCalculationResult,
  type RoiSkipLog,
  triggerQuarterlyCalculation,
} from '../../src/server/services/roiCalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_MONTHLY = '10000000000356';
const CNPJ_HAPPY = '10000000000357';
const CNPJ_SKIPS = '10000000000358';
const CNPJ_RECALC = '10000000000359';
const CNPJ_IDEMPOTENT = '10000000000360';
const CNPJ_FAMILIA6 = '10000000000361';
const CNPJ_DIAGNOSTIC = '10000000000362';
const CNPJ_PARTIAL_FAILURE = '10000000000363';

const TRIMESTRE = '2025-Q1';
const MES_1 = '2025-01';
const MES_2 = '2025-02';
const MES_3 = '2025-03';
const NOW = new Date('2025-04-11T14:00:00Z');

let client: RoipDbClient;

const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = await createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) {
    return;
  }
  // Cleanup canonico L32: apaga todos os dados criados por este arquivo
  // em ordem reversa de FK. Aplicado no `afterAll` do topo (nao em cada
  // describe) porque describes compartilham client mas cada um cria sua
  // propria company; a limpeza cascateia por companyId. Isso protege
  // testes subsequentes de contaminacao (padrao ja consolidado no repo).
  const { inArray } = await import('drizzle-orm');
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    const perfRows = await client.db
      .select({ id: performanceData.id })
      .from(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    const perfIds = perfRows.map((r) => r.id);

    if (perfIds.length > 0) {
      await client.db
        .delete(performanceVariableData)
        .where(inArray(performanceVariableData.performanceDataId, perfIds));
    }
    if (empIds.length > 0) {
      await client.db
        .delete(performanceMultiplierLog)
        .where(inArray(performanceMultiplierLog.employeeId, empIds));
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
      await client.db.delete(performanceData).where(inArray(performanceData.employeeId, empIds));
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
    }
    await client.db
      .delete(companyEconomicDiagnosis)
      .where(inArray(companyEconomicDiagnosis.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture canonicos (S009 estendido)
// ============================================================

// Gerador de CPF de 11 digitos com contador global. CNPJs de teste ja
// sao unicos por describe; CPFs precisam apenas ser unicos no par
// (companyId, cpf) — este contador garante unicidade global.
let cpfCounter = 10000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

interface FixtureOptions {
  metaROIOperacional?: string | null;
  metaROITatico?: string | null;
  metaROIEstrategico?: string | null;
  roiSegmentoMinimo?: string | null;
  roiSegmentoMaximo?: string | null;
  thresholdBaixo?: number;
  thresholdMedio?: number;
}

async function createCompany(cnpj: string, opts: FixtureOptions = {}): Promise<number> {
  const [inserted] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ROI Test ${cnpj} LTDA`,
      nomeFantasia: `ROI Test ${cnpj}`,
      cnpj,
      telefone: '1633330033',
      endereco: `Rua ROI, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato Principal',
      contatoPrincipalEmail: `principal-${cnpj}@example.com`,
      contatoRHNome: 'Contato RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria em people analytics',
      contextoMercado: 'Mercado brasileiro de PMEs',
      metaROIOperacional: opts.metaROIOperacional === undefined ? '3.00' : opts.metaROIOperacional,
      metaROITatico: opts.metaROITatico === undefined ? '4.00' : opts.metaROITatico,
      metaROIEstrategico: opts.metaROIEstrategico === undefined ? '5.00' : opts.metaROIEstrategico,
      roiSegmentoMinimo: opts.roiSegmentoMinimo === undefined ? '2.00' : opts.roiSegmentoMinimo,
      roiSegmentoMaximo: opts.roiSegmentoMaximo === undefined ? '4.00' : opts.roiSegmentoMaximo,
      thresholdDesempenhoBaixo: opts.thresholdBaixo ?? 60,
      thresholdDesempenhoMedio: opts.thresholdMedio ?? 85,
      mesKickoff: 1,
      status: 'ativa',
    })
    .$returningId();
  if (!inserted) {
    throw new Error('createCompany: insert nao retornou id');
  }
  createdCompanyIds.push(inserted.id);
  return inserted.id;
}

async function createEmployee(
  companyId: number,
  cpf: string,
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico',
  jobFamily: JobFamily,
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Employee ${cpf}`,
      cpf,
      email: `${cpf}@example.com`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '252105',
      descricaoCBO: 'Analista',
      jobFamily,
      senioridade: 'pleno',
      nivelHierarquico,
      departamento: 'Comercial',
      status: 'ativo',
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: insert nao retornou id');
  }
  return row.id;
}

async function createCLevel(companyId: number, cpf: string, custoMensal: string): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLevel ${cpf}`,
      cpf,
      email: `${cpf}@example.com`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Diretor executivo',
      departamento: 'Diretoria',
      custoMensal,
      status: 'ativo',
    })
    .$returningId();
  if (!row) {
    throw new Error('createCLevel: insert nao retornou id');
  }
  return row.id;
}

async function createGoals(
  employeeId: number,
  jobFamily: JobFamily,
  goals: Array<{ variableIndex: number; weight: string; goal: string }>,
): Promise<void> {
  for (const g of goals) {
    await client.db.insert(employeeGoals).values({
      employeeId,
      jobFamily,
      variableIndex: g.variableIndex,
      variableName: `Var${g.variableIndex}`,
      unit: 'un',
      weight: g.weight,
      goal: g.goal,
      updatedBy: 'rh',
    });
  }
}

async function createMonthlyData(
  companyId: number,
  mes: string,
  faturamento: string | null,
  diasUteis: number | null,
): Promise<void> {
  await client.db.insert(companyMonthlyData).values({
    companyId,
    mes,
    faturamentoBruto: faturamento,
    diasUteis,
  });
}

async function createClosure(
  companyId: number,
  mes: string,
  status: 'aberto' | 'fechado' | 'desbloqueado',
): Promise<void> {
  await client.db.insert(monthlyClosureStatus).values({ companyId, mes, status });
}

async function createPerformanceData(
  companyId: number,
  employeeId: number,
  mes: string,
  custoTotalMes: string | null,
  faltas: number,
  variables: Array<{ variableIndex: number; demanda: string | null; executado: string | null }>,
): Promise<number> {
  const [row] = await client.db
    .insert(performanceData)
    .values({
      companyId,
      employeeId,
      mes,
      custoTotalMes,
      faltas,
    })
    .$returningId();
  if (!row) {
    throw new Error('createPerformanceData: insert nao retornou id');
  }
  for (const v of variables) {
    await client.db.insert(performanceVariableData).values({
      performanceDataId: row.id,
      variableIndex: v.variableIndex,
      demanda: v.demanda,
      executado: v.executado,
    });
  }
  return row.id;
}

// ============================================================
// 1) computeMonthlyIndices — hook publico do Passo 4 canonico
// ============================================================

describe('computeMonthlyIndices (§3.4 Passos 1-4)', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_MONTHLY);
    employeeId = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(employeeId, 'vendas_comercial', [
      { variableIndex: 1, weight: '50.00', goal: '100.00' },
      { variableIndex: 2, weight: '50.00', goal: '100.00' },
    ]);
    await createClosure(companyId, MES_1, 'fechado');
    await createMonthlyData(companyId, MES_1, '80000.00', 22);
    await createPerformanceData(companyId, employeeId, MES_1, '5000.00', 2, [
      { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      { variableIndex: 2, demanda: '100.00', executado: '50.00' },
    ]);
  });

  it('caso canonico: mes fechado + diasUteis + dados -> updated', async () => {
    const result: MonthlyIndicesResult = await computeMonthlyIndices(
      client.db,
      companyId,
      MES_1,
      NOW,
    );
    expect(result.employeesUpdated).toContain(employeeId);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    const [row] = await client.db
      .select()
      .from(performanceData)
      .where(and(eq(performanceData.employeeId, employeeId), eq(performanceData.mes, MES_1)));
    expect(row).toBeDefined();
    expect(row!.assiduidade).not.toBeNull();
    expect(row!.indiceDesempenho).not.toBeNull();
    // assiduidade = ((22-2)/22)*100 ~ 90.91
    expect(Number(row!.assiduidade)).toBeCloseTo(90.91, 1);
    // indice = 0.5*1.0 + 0.5*0.5 = 0.75
    expect(Number(row!.indiceDesempenho)).toBeCloseTo(0.75, 4);
  });

  it('mes NAO fechado -> skip trimestre_incompleto (mes-level)', async () => {
    const otherCid = await createCompany('10000000000370');
    await createClosure(otherCid, MES_1, 'aberto');
    const result = await computeMonthlyIndices(client.db, otherCid, MES_1, NOW);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.motivo).toBe('trimestre_incompleto');
    expect(result.skipped[0]!.employeeId).toBeNull();
    expect(result.employeesUpdated).toHaveLength(0);
  });

  it('diasUteis NULL -> skip dias_uteis_nao_lancado (mes-level)', async () => {
    const otherCid = await createCompany('10000000000371');
    await createClosure(otherCid, MES_1, 'fechado');
    await createMonthlyData(otherCid, MES_1, '80000.00', null);
    const result = await computeMonthlyIndices(client.db, otherCid, MES_1, NOW);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.motivo).toBe('dias_uteis_nao_lancado');
    expect(result.employeesUpdated).toHaveLength(0);
  });

  it('colaborador sem performanceData -> skip custo_nao_lancado', async () => {
    const otherCid = await createCompany('10000000000372');
    const empId = await createEmployee(otherCid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(empId, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    await createClosure(otherCid, MES_1, 'fechado');
    await createMonthlyData(otherCid, MES_1, '80000.00', 22);
    // sem performanceData
    const result = await computeMonthlyIndices(client.db, otherCid, MES_1, NOW);
    const skip = result.skipped.find((s) => s.employeeId === empId);
    expect(skip).toBeDefined();
    expect(skip!.motivo).toBe('custo_nao_lancado');
  });

  it('colaborador sem variavel ativa -> skip sem_demanda, indice NULL', async () => {
    const otherCid = await createCompany('10000000000373');
    const empId = await createEmployee(otherCid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(empId, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    await createClosure(otherCid, MES_1, 'fechado');
    await createMonthlyData(otherCid, MES_1, '80000.00', 22);
    await createPerformanceData(otherCid, empId, MES_1, '5000.00', 0, [
      { variableIndex: 1, demanda: null, executado: null }, // demanda ausente
    ]);
    const result = await computeMonthlyIndices(client.db, otherCid, MES_1, NOW);
    const skip = result.skipped.find((s) => s.employeeId === empId);
    expect(skip).toBeDefined();
    expect(skip!.motivo).toBe('sem_demanda');
    const [row] = await client.db
      .select()
      .from(performanceData)
      .where(and(eq(performanceData.employeeId, empId), eq(performanceData.mes, MES_1)));
    expect(row!.indiceDesempenho).toBeNull();
    // assiduidade e gravada (100% pois faltas=0)
    expect(Number(row!.assiduidade)).toBe(100);
  });
});

// ============================================================
// 2) triggerQuarterlyCalculation — caso feliz completo
// ============================================================

describe('triggerQuarterlyCalculation caso feliz completo', () => {
  let companyId: number;
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_HAPPY);
    empA = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    empB = await createEmployee(companyId, nextCpf(), 'tatico', 'lideranca_gestao');

    await createGoals(empA, 'vendas_comercial', [
      { variableIndex: 1, weight: '50.00', goal: '100.00' },
      { variableIndex: 2, weight: '50.00', goal: '100.00' },
    ]);
    await createGoals(empB, 'lideranca_gestao', [
      { variableIndex: 1, weight: '100.00', goal: '5.00' },
    ]);
    await createCLevel(companyId, nextCpf(), '15000.00');

    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(companyId, mes, 'fechado');
      await createMonthlyData(companyId, mes, '80000.00', 22);
      await createPerformanceData(companyId, empA, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
        { variableIndex: 2, demanda: '100.00', executado: '100.00' },
      ]);
      await createPerformanceData(companyId, empB, mes, '10000.00', 0, [
        { variableIndex: 1, demanda: '5.00', executado: '5.00' },
      ]);
    }
  });

  it('trigger canonico persiste os 2 colaboradores + diagnostico da empresa', async () => {
    const result = await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);
    expect(result.employeesCalculated).toEqual(expect.arrayContaining([empA, empB]));
    expect(result.economicDiagnosisPersisted).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ajusteRetroativo).toBe(false);

    const quarterlyRows = await client.db
      .select()
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.companyId, companyId));
    expect(quarterlyRows).toHaveLength(2);
    const rowA = quarterlyRows.find((r) => r.employeeId === empA);
    const rowB = quarterlyRows.find((r) => r.employeeId === empB);
    // empA: indice = 1.0, score = 100.0, faixa = alto (100>85)
    expect(Number(rowA!.indiceDesempenho)).toBeCloseTo(1.0, 4);
    expect(Number(rowA!.scoreDesempenho)).toBeCloseTo(100.0, 2);
    expect(rowA!.faixaDesempenho).toBe('alto');
    // empA nivel operacional -> metaROI 3.00; custoMedio 5000 -> retornoPotencial 15000
    expect(Number(rowA!.metaROI)).toBeCloseTo(3.0, 2);
    expect(Number(rowA!.custoMedioTrimestral)).toBeCloseTo(5000, 2);
    expect(Number(rowA!.retornoPotencial)).toBeCloseTo(15000, 2);
    // empB familia 6 -> capacidadeOciosa NULL
    expect(rowB!.capacidadeOciosa).toBeNull();

    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, companyId));
    // folhaTotalMedia = 5000 + 10000 + 15000 = 30000
    expect(Number(econ!.folhaTotalMedia)).toBeCloseTo(30000, 2);
    // faturamentoMedio = 80000
    expect(Number(econ!.faturamentoMedioTrimestral)).toBeCloseTo(80000, 2);
    // roiEmpresa = 80000/30000 ~ 2.6667
    expect(Number(econ!.roiEmpresa)).toBeCloseTo(2.6667, 3);
    // roiSegmentoMin=2, max=4, muitoBom=3, empresa=2.67 -> aceitavel
    expect(econ!.statusDiagnostico).toBe('aceitavel');

    const logRows = await client.db
      .select()
      .from(performanceMultiplierLog)
      .where(eq(performanceMultiplierLog.trimestre, TRIMESTRE))
      .orderBy(asc(performanceMultiplierLog.id));
    // 2 colaboradores calculados -> 2 linhas de log
    const logsForEmpA = logRows.filter((r) => r.employeeId === empA);
    const logsForEmpB = logRows.filter((r) => r.employeeId === empB);
    expect(logsForEmpA).toHaveLength(1);
    expect(logsForEmpB).toHaveLength(1);
    expect(logsForEmpA[0]!.ajusteRetroativo).toBe(false);
    expect(Number(logsForEmpA[0]!.metaROIUsada)).toBeCloseTo(3.0, 2);
    expect(Number(logsForEmpB[0]!.metaROIUsada)).toBeCloseTo(4.0, 2);
  });
});

// ============================================================
// 3) Skips canonicos por trimestre
// ============================================================

describe('triggerQuarterlyCalculation skips canonicos', () => {
  let base = 0;

  beforeAll(async () => {
    base = Date.now();
  });

  async function makeSkipCompany(suffix: string): Promise<number> {
    return await createCompany(`${CNPJ_SKIPS.slice(0, 12)}${suffix}`);
  }

  it('trimestre_incompleto: 1 mes NAO fechado', async () => {
    const cid = await makeSkipCompany('40');
    await createClosure(cid, MES_1, 'fechado');
    await createClosure(cid, MES_2, 'aberto'); // um aberto
    await createClosure(cid, MES_3, 'fechado');
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    expect(result.employeesCalculated).toHaveLength(0);
    expect(result.economicDiagnosisPersisted).toBe(false);
    const s = result.skipped.find((r) => r.motivo === 'trimestre_incompleto');
    expect(s).toBeDefined();
    expect(s!.employeeId).toBeNull();
    expect(base).toBeGreaterThan(0);
  });

  it('dias_uteis_nao_lancado: 1 mes sem diasUteis', async () => {
    const cid = await makeSkipCompany('41');
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, '80000.00', mes === MES_2 ? null : 22);
    }
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const s = result.skipped.find((r) => r.motivo === 'dias_uteis_nao_lancado');
    expect(s).toBeDefined();
    // sem colaboradores ativos, nao ha o que calcular alem do skip
    expect(result.employeesCalculated).toHaveLength(0);
  });

  it('custo_nao_lancado em 1 mes: Eixo X OK, financeiro skip', async () => {
    const cid = await makeSkipCompany('42');
    const emp = await createEmployee(cid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(emp, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, '80000.00', 22);
      await createPerformanceData(cid, emp, mes, mes === MES_2 ? null : '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    // Eixo X calcula
    expect(result.employeesCalculated).toContain(emp);
    // skip financeiro registrado
    const s = result.skipped.find((r) => r.employeeId === emp && r.motivo === 'custo_nao_lancado');
    expect(s).toBeDefined();
    // financeiro NULL na quarterly
    const [row] = await client.db
      .select()
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.employeeId, emp));
    expect(row!.custoMedioTrimestral).toBeNull();
    expect(row!.retornoPotencial).toBeNull();
  });

  it('meta_roi_nao_configurada: nivel operacional sem metaROI', async () => {
    const cid = await createCompany('10000000000380', { metaROIOperacional: null });
    const emp = await createEmployee(cid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(emp, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, '80000.00', 22);
      await createPerformanceData(cid, emp, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    // Eixo X calcula, mas financeiro do individuo skipa
    expect(result.employeesCalculated).toContain(emp);
    const s = result.skipped.find(
      (r) => r.employeeId === emp && r.motivo === 'meta_roi_nao_configurada',
    );
    expect(s).toBeDefined();
    // metaROI NULL na linha quarterly do colaborador
    const [row] = await client.db
      .select()
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.employeeId, emp));
    expect(row!.metaROI).toBeNull();
    // log grava metaROIUsada=0 (sentinela canonica)
    const [log] = await client.db
      .select()
      .from(performanceMultiplierLog)
      .where(eq(performanceMultiplierLog.employeeId, emp));
    expect(Number(log!.metaROIUsada)).toBe(0);
  });

  it('faturamento_nao_lancado em 1 mes: Eixo X calcula, diagnostico skip', async () => {
    const cid = await makeSkipCompany('44');
    const emp = await createEmployee(cid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(emp, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, mes === MES_2 ? null : '80000.00', 22);
      await createPerformanceData(cid, emp, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    expect(result.employeesCalculated).toContain(emp);
    expect(result.economicDiagnosisPersisted).toBe(false);
    const s = result.skipped.find((r) => r.motivo === 'faturamento_nao_lancado');
    expect(s).toBeDefined();
  });

  it('sem_demanda: colaborador com demanda NULL nos 3 meses', async () => {
    const cid = await makeSkipCompany('45');
    const emp = await createEmployee(cid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(emp, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, '80000.00', 22);
      await createPerformanceData(cid, emp, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: null, executado: null },
      ]);
    }
    const result = await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    // colaborador NAO calculado (Eixo X sem indice)
    expect(result.employeesCalculated).not.toContain(emp);
    const s = result.skipped.find((r) => r.employeeId === emp && r.motivo === 'sem_demanda');
    expect(s).toBeDefined();
  });
});

// ============================================================
// 4) recalculateQuarter — ajusteRetroativo=true
// ============================================================

describe('recalculateQuarter (§3.9)', () => {
  let companyId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RECALC);
    empId = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(empId, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(companyId, mes, 'fechado');
      await createMonthlyData(companyId, mes, '80000.00', 22);
      await createPerformanceData(companyId, empId, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
  });

  it('trigger + recalculate gera 2 linhas de log (false + true)', async () => {
    await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);
    const result = await recalculateQuarter(client.db, companyId, TRIMESTRE, NOW);
    expect(result.ajusteRetroativo).toBe(true);
    expect(result.employeesCalculated).toContain(empId);

    const logs = await client.db
      .select()
      .from(performanceMultiplierLog)
      .where(eq(performanceMultiplierLog.employeeId, empId))
      .orderBy(asc(performanceMultiplierLog.id));
    expect(logs).toHaveLength(2);
    expect(logs[0]!.ajusteRetroativo).toBe(false);
    expect(logs[1]!.ajusteRetroativo).toBe(true);
  });
});

// ============================================================
// 5) Idempotencia (§18.2)
// ============================================================

describe('triggerQuarterlyCalculation idempotencia (§18.2)', () => {
  let companyId: number;
  let empId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_IDEMPOTENT);
    empId = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(empId, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(companyId, mes, 'fechado');
      await createMonthlyData(companyId, mes, '80000.00', 22);
      await createPerformanceData(companyId, empId, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
  });

  it('2x trigger: 1 linha em quarterlyData (upsert), 2 linhas em log (append)', async () => {
    await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);
    await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);

    const quarterly = await client.db
      .select()
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.employeeId, empId));
    expect(quarterly).toHaveLength(1);

    const logs = await client.db
      .select()
      .from(performanceMultiplierLog)
      .where(eq(performanceMultiplierLog.employeeId, empId));
    expect(logs).toHaveLength(2);
  });
});

// ============================================================
// 6) Capacidade ociosa e Familia 6
// ============================================================

describe('capacidadeOciosa e Familia 6', () => {
  let companyId: number;
  let empFam1: number;
  let empFam6: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_FAMILIA6);
    empFam1 = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    empFam6 = await createEmployee(companyId, nextCpf(), 'tatico', 'lideranca_gestao');
    await createGoals(empFam1, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    await createGoals(empFam6, 'lideranca_gestao', [
      { variableIndex: 1, weight: '100.00', goal: '5.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(companyId, mes, 'fechado');
      await createMonthlyData(companyId, mes, '80000.00', 22);
      // fam1: no ultimo mes, demanda=50 (ociosidade=50%)
      const demandaFam1 = mes === MES_3 ? '50.00' : '100.00';
      await createPerformanceData(companyId, empFam1, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: demandaFam1, executado: demandaFam1 },
      ]);
      await createPerformanceData(companyId, empFam6, mes, '10000.00', 0, [
        { variableIndex: 1, demanda: '5.00', executado: '5.00' },
      ]);
    }
  });

  it('Familia 6 capacidadeOciosa NULL; outras usam demanda do ultimo mes (S056)', async () => {
    await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);

    const rowFam1 = (
      await client.db
        .select()
        .from(performanceQuarterlyData)
        .where(eq(performanceQuarterlyData.employeeId, empFam1))
    )[0];
    const rowFam6 = (
      await client.db
        .select()
        .from(performanceQuarterlyData)
        .where(eq(performanceQuarterlyData.employeeId, empFam6))
    )[0];

    // Fam6: capacidadeOciosa NULL
    expect(rowFam6!.capacidadeOciosa).toBeNull();
    // Fam1: ultimo mes demanda=50, goal=100 -> ociosa=50% -> gravado como 50.00
    expect(Number(rowFam1!.capacidadeOciosa)).toBeCloseTo(50.0, 2);
  });
});

// ============================================================
// 7) Diagnostico economico — status canonicos
// ============================================================

describe('companyEconomicDiagnosis status canonicos (§3.6)', () => {
  async function makeDiagCompany(
    suffix: string,
    faturamento: string,
    roiSegmentoMinimo: string | null,
    roiSegmentoMaximo: string | null,
  ): Promise<{ cid: number; empId: number }> {
    const cid = await createCompany(`${CNPJ_DIAGNOSTIC.slice(0, 12)}${suffix}`, {
      roiSegmentoMinimo,
      roiSegmentoMaximo,
    });
    const emp = await createEmployee(cid, nextCpf(), 'operacional', 'vendas_comercial');
    await createGoals(emp, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(cid, mes, 'fechado');
      await createMonthlyData(cid, mes, faturamento, 22);
      await createPerformanceData(cid, emp, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
    }
    return { cid, empId: emp };
  }

  it('roiEmpresa >= roiSegmentoMaximo -> excelente', async () => {
    // fat=25000, folha=5000 -> roi=5.0; segmento 2..4 -> excelente
    const { cid } = await makeDiagCompany('50', '25000.00', '2.00', '4.00');
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('excelente');
  });

  it('roi entre muitoBom (3.0) e max (4.0) -> muito_bom', async () => {
    // fat=17500, folha=5000 -> roi=3.5; muitoBom=3.0, max=4.0 -> muito_bom
    const { cid } = await makeDiagCompany('51', '17500.00', '2.00', '4.00');
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('muito_bom');
  });

  it('roi entre min (2.0) e muitoBom (3.0) -> aceitavel', async () => {
    // fat=12500, folha=5000 -> roi=2.5; min=2, muitoBom=3 -> aceitavel
    const { cid } = await makeDiagCompany('52', '12500.00', '2.00', '4.00');
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('aceitavel');
  });

  it('roi < min (2.0) -> critico', async () => {
    // fat=5000, folha=5000 -> roi=1.0; min=2 -> critico
    const { cid } = await makeDiagCompany('53', '5000.00', '2.00', '4.00');
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('critico');
  });

  it('roiSegmentoMinimo NULL -> sem_referencia', async () => {
    const { cid } = await makeDiagCompany('54', '15000.00', null, '4.00');
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('sem_referencia');
    expect(econ!.roiMuitoBom).toBeNull();
    expect(econ!.faturamentoIdeal).toBeNull();
  });

  it('roiSegmentoMaximo NULL -> sem_referencia', async () => {
    const { cid } = await makeDiagCompany('55', '15000.00', '2.00', null);
    await triggerQuarterlyCalculation(client.db, cid, TRIMESTRE, NOW);
    const [econ] = await client.db
      .select()
      .from(companyEconomicDiagnosis)
      .where(eq(companyEconomicDiagnosis.companyId, cid));
    expect(econ!.statusDiagnostico).toBe('sem_referencia');
  });
});

// ============================================================
// 8) Tolerancia a falha parcial (S055)
// ============================================================

describe('tolerancia a falha parcial (S055)', () => {
  let companyId: number;
  let empOk: number;
  let empSemGoals: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_PARTIAL_FAILURE);
    empOk = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    empSemGoals = await createEmployee(companyId, nextCpf(), 'operacional', 'vendas_comercial');
    // empOk tem goals, empSemGoals nao — sem goal e sem demanda -> sem_demanda skip
    await createGoals(empOk, 'vendas_comercial', [
      { variableIndex: 1, weight: '100.00', goal: '100.00' },
    ]);
    for (const mes of [MES_1, MES_2, MES_3]) {
      await createClosure(companyId, mes, 'fechado');
      await createMonthlyData(companyId, mes, '80000.00', 22);
      await createPerformanceData(companyId, empOk, mes, '5000.00', 0, [
        { variableIndex: 1, demanda: '100.00', executado: '100.00' },
      ]);
      await createPerformanceData(companyId, empSemGoals, mes, '5000.00', 0, []);
    }
  });

  it('colaborador problematico entra em skipped; ok continua', async () => {
    const result = await triggerQuarterlyCalculation(client.db, companyId, TRIMESTRE, NOW);
    expect(result.employeesCalculated).toContain(empOk);
    expect(result.employeesCalculated).not.toContain(empSemGoals);
    const s = result.skipped.find(
      (r) => r.employeeId === empSemGoals && r.motivo === 'sem_demanda',
    );
    expect(s).toBeDefined();
  });
});

// ============================================================
// 9) Contratos de tipo e defaults canonicos
// ============================================================

describe('contratos de tipo e defaults canonicos', () => {
  it('DEFAULT_THRESHOLD_DESEMPENHO_BAIXO=60 e MEDIO=85 (schema)', () => {
    expect(DEFAULT_THRESHOLD_DESEMPENHO_BAIXO).toBe(60);
    expect(DEFAULT_THRESHOLD_DESEMPENHO_MEDIO).toBe(85);
  });

  it('RoiSkipLog e RoiCalculationResult sao tipos usaveis', () => {
    const skip: RoiSkipLog = {
      employeeId: null,
      mes: null,
      trimestre: '2025-Q1',
      motivo: 'trimestre_incompleto',
      detail: 'teste',
    };
    const result: RoiCalculationResult = {
      companyId: 1,
      trimestre: '2025-Q1',
      ajusteRetroativo: false,
      employeesCalculated: [],
      skipped: [skip],
      errors: [],
      economicDiagnosisPersisted: false,
    };
    expect(result.skipped).toHaveLength(1);
  });

  it('MonthlyIndicesResult e tipo usavel', () => {
    const monthly: MonthlyIndicesResult = {
      companyId: 1,
      mes: '2025-01',
      employeesUpdated: [],
      skipped: [],
      errors: [],
    };
    expect(monthly.mes).toBe('2025-01');
  });
});
