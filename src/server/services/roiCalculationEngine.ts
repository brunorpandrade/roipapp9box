// ROIP APP 9BOX — motor canonico `roiCalculationEngine` (ME-033).
//
// Consolida os hooks canonicos do DOC 03 §3 + §18.1: Eixo X, bloco
// financeiro trimestral e diagnostico economico. Motor puro no sentido
// canonico (§18.2): zero resolver tRPC, chamado pelo
// `monthlyClosureOrchestrator` via DI (`TriggerQuarterlyCalculation` /
// `RecalculateQuarter` — S046 preservada) e por jobs cron a virem.
//
// Convencoes canonicas desta ME:
//   - `now` sempre parametro explicito. Determinismo total (S044/L38).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })` — padrao ja consolidado
//     em `cycleScheduleEngine`.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/roiCalculationEngine.test.ts`.
//   - Formulas canonicas do §3.4/§3.5/§3.6 delegadas para
//     `src/lib/roiFormulas.ts` (puros, testados por
//     `tests/unit/roiFormulas.test.ts`).
//   - Idempotencia canonica (§18.2): reexecucao para o mesmo trimestre
//     sobrescreve `performanceQuarterlyData` e `companyEconomicDiagnosis`
//     via UPSERT. `performanceMultiplierLog` e sempre append-only —
//     cada execucao gera nova linha (§3.8 canonico).
//   - Tolerancia a falha parcial (§18.2): cada colaborador em try/catch
//     independente. Erro isolado nao aborta o batch (S055 aprovada). O
//     bloco financeiro da empresa e uma unidade separada.
//   - Log de motivos ignorados (§3.7): NAO persistido nesta ME. Motor
//     devolve `RoiSkipLog[]` tipado como parte de `RoiCalculationResult`
//     (S054 aprovada; D006 aberta para ME futura de schema estendido).
//
// Decisoes de autor RV-08 desta ME (indice §7):
//   - S052 — nome canonico `roiCalculationEngine.ts` (DOC 03 §18.1).
//   - S053 — motor unico cobre §3 integral (Eixo X + financeiro +
//     diagnostico); nao edita hash do orchestrator (L54 preservada).
//   - S054 — log §3.7 devolvido tipado, sem persistir.
//   - S055 — tolerancia a falha parcial: try/catch por colaborador,
//     transacao curta por colaborador (write em performanceQuarterlyData
//     + performanceMultiplierLog dentro da mesma transacao).
//   - S056 — `computeCapacidadeOciosa` usa a `demanda` do ULTIMO mes do
//     trimestre (representa capacidade atual). Anotado para conferencia
//     na ME de dashboard individual (Bloco B5).
//   - S058 — leitura literal do §3.7: `diasUteis` NULL bloqueia o motor
//     no mes inteiro. Consequencia canonica: se 1+ mes do trimestre tem
//     `diasUteis=NULL`, o colaborador entra em `dias_uteis_nao_lancado`.

import { and, asc, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  companyMonthlyData,
  employeeGoals,
  employees,
  monthlyClosureStatus,
  performanceData,
  performanceMultiplierLog,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../db/schema';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';
import {
  computeAssiduidade,
  computeCapacidadeOciosa,
  computeFaixaDesempenho,
  computeFaturamentoIdeal,
  computeFolhaPorcentagem,
  computeFolhaTotalMedia,
  computeIndiceDesempenhoMes,
  computeIndiceDesempenhoTrimestral,
  computeMediaTrimestral,
  computeParticipacao,
  computePercMetaAtingida,
  computeRetornoEstimado,
  computeRetornoPotencial,
  computeRoiEmpresa,
  computeRoiEstimado,
  computeRoiMuitoBom,
  computeScoreDesempenho,
  computeStatusDiagnostico,
  FAMILIA_6_JOB_FAMILY,
  type FaixaDesempenho,
  type RoiSkipMotivo,
  type StatusDiagnostico,
  type VariableMonth,
} from '../../lib/roiFormulas';

// ============================================================
// Constantes canonicas (defaults do schema)
// ============================================================

/**
 * Thresholds default canonicos das colunas
 * `companies.thresholdDesempenhoBaixo`/`thresholdDesempenhoMedio` (DOC 01).
 * Usados quando a empresa nao personalizou. Rec-usar aqui evita drift entre
 * schema e motor.
 */
export const DEFAULT_THRESHOLD_DESEMPENHO_BAIXO = 60;
export const DEFAULT_THRESHOLD_DESEMPENHO_MEDIO = 85;

// ============================================================
// Tipos publicos
// ============================================================

/**
 * Log estruturado de skip (§3.7). Devolvido tipado como parte do resultado
 * do motor (S054) — nao persistido nesta ME. Cada linha identifica:
 *   - `employeeId`: `null` quando o skip e da empresa (bloco financeiro
 *     nao calculado), numero quando o skip e de um colaborador especifico.
 *   - `mes`: `null` quando o skip nao esta amarrado a um mes especifico
 *     (ex.: `trimestre_incompleto`, `sem_responsavel_financeiro`), string
 *     `YYYY-MM` quando esta.
 *   - `trimestre`: sempre preenchido (`YYYY-QN`).
 *   - `motivo`: literal fechado do enum `RoiSkipMotivo`.
 *   - `detail`: descricao humana curta (nunca contem dados sensiveis).
 */
export interface RoiSkipLog {
  employeeId: number | null;
  mes: string | null;
  trimestre: string;
  motivo: RoiSkipMotivo;
  detail: string;
}

/**
 * Resultado canonico de `computeMonthlyIndices`.
 */
export interface MonthlyIndicesResult {
  companyId: number;
  mes: string;
  /** Ids de colaboradores cujo `performanceData` foi atualizado. */
  employeesUpdated: number[];
  skipped: RoiSkipLog[];
  errors: Array<{ employeeId: number | null; error: string }>;
}

/**
 * Resultado canonico dos hooks trimestrais (`triggerQuarterlyCalculation`
 * e `recalculateQuarter`).
 */
export interface RoiCalculationResult {
  companyId: number;
  trimestre: string;
  ajusteRetroativo: boolean;
  /** Ids de colaboradores cujo trimestre foi gravado. */
  employeesCalculated: number[];
  skipped: RoiSkipLog[];
  errors: Array<{ employeeId: number | null; error: string }>;
  /** `true` quando `companyEconomicDiagnosis` foi gravado (§3.6). */
  economicDiagnosisPersisted: boolean;
}

// ============================================================
// Helpers privados de contexto e conversao
// ============================================================

/**
 * Snapshot canonico dos parametros da empresa vigentes no momento do
 * calculo (§3.8 "snapshot canonico"). Carregado uma unica vez por
 * chamada trimestral e passado adiante como referencia imutavel.
 */
interface CompanyContext {
  companyId: number;
  metaROIOperacional: number | null;
  metaROITatico: number | null;
  metaROIEstrategico: number | null;
  roiSegmentoMinimo: number | null;
  roiSegmentoMaximo: number | null;
  thresholdDesempenhoBaixo: number;
  thresholdDesempenhoMedio: number;
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadCompanyContext(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyContext | null> {
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    companyId: row.id,
    metaROIOperacional: toNumberOrNull(row.metaROIOperacional),
    metaROITatico: toNumberOrNull(row.metaROITatico),
    metaROIEstrategico: toNumberOrNull(row.metaROIEstrategico),
    roiSegmentoMinimo: toNumberOrNull(row.roiSegmentoMinimo),
    roiSegmentoMaximo: toNumberOrNull(row.roiSegmentoMaximo),
    thresholdDesempenhoBaixo: row.thresholdDesempenhoBaixo ?? DEFAULT_THRESHOLD_DESEMPENHO_BAIXO,
    thresholdDesempenhoMedio: row.thresholdDesempenhoMedio ?? DEFAULT_THRESHOLD_DESEMPENHO_MEDIO,
  };
}

function resolveMetaROI(
  ctx: CompanyContext,
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico',
): number | null {
  if (nivelHierarquico === 'operacional') {
    return ctx.metaROIOperacional;
  }
  if (nivelHierarquico === 'tatico') {
    return ctx.metaROITatico;
  }
  return ctx.metaROIEstrategico;
}

// ============================================================
// Hook 1 — computeMonthlyIndices (§3.4 Passos 1-4)
// ============================================================

/**
 * Calcula e persiste os indicadores mensais canonicos para TODOS os
 * colaboradores ativos da empresa naquele mes (§3.4 Passos 1-4 +
 * assiduidade). Persiste:
 *   - `performanceData.assiduidade`
 *   - `performanceData.indiceDesempenho`
 *   - `performanceData.calculadoEm`
 *   - `performanceVariableData.desempenho` (uma linha por variavel do
 *     colaborador com `weight > 0` e `demanda > 0`; variaveis com
 *     `weight = 0` ou `demanda = 0` recebem `desempenho = NULL`).
 *
 * Precondicoes canonicas (§3.7):
 *   - `monthlyClosureStatus.status = 'fechado'` para (companyId, mes).
 *     Se nao, retorna com `skipped=[trimestre_incompleto]` no nivel do
 *     mes (nenhum colaborador processado).
 *   - `companyMonthlyData.diasUteis` preenchido. Se NULL, retorna com
 *     `skipped=[dias_uteis_nao_lancado]` (nenhum colaborador processado).
 *
 * Idempotente: reexecucao para o mesmo mes atualiza os valores in-place
 * (UPDATE, nao INSERT — `performanceData` ja existe porque o RH lancou).
 */
export async function computeMonthlyIndices(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  now: Date,
): Promise<MonthlyIndicesResult> {
  const result: MonthlyIndicesResult = {
    companyId,
    mes,
    employeesUpdated: [],
    skipped: [],
    errors: [],
  };

  // A funcao aceita ser chamada com trimestre no logging de skip; usamos
  // uma string vazia quando nao ha trimestre associado — as chamadas do
  // hook trimestral passarao o trimestre real via `computeMonthlyIndices`.
  // Como o motor mensal e independente, uso o proprio mes como fallback.
  const trimestreForLog = mes;

  const closureRows = await db
    .select({ status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)))
    .limit(1);
  const closureStatus = closureRows[0]?.status;
  if (closureStatus !== 'fechado') {
    result.skipped.push({
      employeeId: null,
      mes,
      trimestre: trimestreForLog,
      motivo: 'trimestre_incompleto',
      detail: `mes ${mes} nao esta fechado (status=${closureStatus ?? 'inexistente'})`,
    });
    return result;
  }

  const monthlyRows = await db
    .select({ diasUteis: companyMonthlyData.diasUteis })
    .from(companyMonthlyData)
    .where(and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, mes)))
    .limit(1);
  const diasUteis = monthlyRows[0]?.diasUteis;
  if (diasUteis === undefined || diasUteis === null || diasUteis <= 0) {
    result.skipped.push({
      employeeId: null,
      mes,
      trimestre: trimestreForLog,
      motivo: 'dias_uteis_nao_lancado',
      detail: `companyMonthlyData.diasUteis ausente ou invalido para ${mes}`,
    });
    return result;
  }

  const activeEmployees = await db
    .select({
      id: employees.id,
      jobFamily: employees.jobFamily,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .orderBy(asc(employees.id));

  for (const emp of activeEmployees) {
    try {
      const outcome = await processEmployeeMonthly(
        db,
        companyId,
        emp.id,
        emp.jobFamily,
        mes,
        diasUteis,
        now,
        trimestreForLog,
      );
      result.skipped.push(...outcome.skipped);
      if (outcome.updated) {
        result.employeesUpdated.push(emp.id);
      }
    } catch (err) {
      result.errors.push({
        employeeId: emp.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function processEmployeeMonthly(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  jobFamily: string,
  mes: string,
  diasUteis: number,
  now: Date,
  trimestre: string,
): Promise<{ updated: boolean; skipped: RoiSkipLog[] }> {
  const skipped: RoiSkipLog[] = [];

  const perfRows = await db
    .select()
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        eq(performanceData.employeeId, employeeId),
        eq(performanceData.mes, mes),
      ),
    )
    .limit(1);
  const perf = perfRows[0];
  if (!perf) {
    skipped.push({
      employeeId,
      mes,
      trimestre,
      motivo: 'custo_nao_lancado',
      detail: `performanceData inexistente para (employeeId=${employeeId}, mes=${mes})`,
    });
    return { updated: false, skipped };
  }

  const goalsRows = await db
    .select({
      variableIndex: employeeGoals.variableIndex,
      weight: employeeGoals.weight,
      goal: employeeGoals.goal,
      jobFamily: employeeGoals.jobFamily,
    })
    .from(employeeGoals)
    .where(eq(employeeGoals.employeeId, employeeId))
    .orderBy(asc(employeeGoals.variableIndex));

  const varRows = await db
    .select()
    .from(performanceVariableData)
    .where(eq(performanceVariableData.performanceDataId, perf.id))
    .orderBy(asc(performanceVariableData.variableIndex));

  const varsByIndex = new Map<number, (typeof varRows)[number]>();
  for (const v of varRows) {
    varsByIndex.set(v.variableIndex, v);
  }

  const variablesInput: VariableMonth[] = [];
  for (const g of goalsRows) {
    const weight = Number(g.weight);
    const varRow = varsByIndex.get(g.variableIndex);
    variablesInput.push({
      weight,
      demanda: varRow ? toNumberOrNull(varRow.demanda) : null,
      executado: varRow ? toNumberOrNull(varRow.executado) : null,
    });
  }

  const assiduidade = computeAssiduidade(diasUteis, perf.faltas ?? 0);
  const indiceMes = computeIndiceDesempenhoMes(variablesInput);

  if (indiceMes === null) {
    skipped.push({
      employeeId,
      mes,
      trimestre,
      motivo: 'sem_demanda',
      detail: `colaborador ${employeeId} sem variavel ativa em ${mes}`,
    });
    // ainda assim gravamos assiduidade + calculadoEm, deixando
    // indiceDesempenho NULL.
  }

  await db
    .update(performanceData)
    .set({
      assiduidade: assiduidade === null ? null : String(assiduidade),
      indiceDesempenho: indiceMes === null ? null : String(indiceMes),
      diasUteis,
      calculadoEm: now,
    })
    .where(eq(performanceData.id, perf.id));

  for (const g of goalsRows) {
    const weight = Number(g.weight);
    const varRow = varsByIndex.get(g.variableIndex);
    if (!varRow) {
      continue;
    }
    const demanda = toNumberOrNull(varRow.demanda);
    const executado = toNumberOrNull(varRow.executado);
    let desempenho: number | null = null;
    if (weight > 0 && demanda !== null && demanda > 0 && executado !== null) {
      const razao = executado / demanda;
      desempenho = Math.min(razao, 1.5);
    }
    await db
      .update(performanceVariableData)
      .set({
        desempenho: desempenho === null ? null : String(desempenho),
        peso: String(weight),
      })
      .where(eq(performanceVariableData.id, varRow.id));
  }

  return { updated: true, skipped };
}

// ============================================================
// Hook 2 — triggerQuarterlyCalculation (§3 integral, ajuste=false)
// ============================================================

/**
 * Hook publico canonico chamado pelo orchestrator via DI
 * `TriggerQuarterlyCalculation`. Executa a cadeia canonica completa do
 * §3 para o trimestre indicado: garante indices mensais dos 3 meses,
 * calcula trimestre por colaborador ativo, calcula bloco financeiro da
 * empresa (§3.5), calcula diagnostico economico (§3.6). Persiste
 * `performanceQuarterlyData` (upsert), `companyEconomicDiagnosis`
 * (upsert) e `performanceMultiplierLog` (append).
 *
 * Assinatura alinhada com o tipo canonico `TriggerQuarterlyCalculation`
 * do orchestrator (ME-031) para permitir DI direta (S046). O `now` fica
 * como parametro para determinismo em teste.
 */
export async function triggerQuarterlyCalculation(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  now: Date,
): Promise<RoiCalculationResult> {
  return await runQuarterlyCalculation(db, companyId, trimestre, now, false);
}

// ============================================================
// Hook 3 — recalculateQuarter (§3 integral, ajuste=true)
// ============================================================

/**
 * Hook publico canonico chamado pelo orchestrator via DI
 * `RecalculateQuarter`. Mesmo caminho do
 * `triggerQuarterlyCalculation`, mas grava
 * `performanceMultiplierLog.ajusteRetroativo = true` (§3.9 / §3.10). Nao
 * ha diferenca no que se calcula — a semantica canonica esta na marca
 * de auditoria do log.
 */
export async function recalculateQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  now: Date,
): Promise<RoiCalculationResult> {
  return await runQuarterlyCalculation(db, companyId, trimestre, now, true);
}

// ============================================================
// Implementacao interna canonica do calculo trimestral
// ============================================================

interface EmployeeQuarterlySnapshot {
  employeeId: number;
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico';
  jobFamily: string;
  isFamilia6: boolean;
  metaROI: number | null;
  indiceTri: number | null;
  scoreDesempenho: number | null;
  faixaDesempenho: FaixaDesempenho | null;
  capacidadeOciosa: number | null;
  custoMedioTrimestral: number | null;
  retornoPotencial: number | null;
  // preenchidos na segunda passada (bloco financeiro):
  participacao: number | null;
  retornoEstimado: number | null;
  roiEstimado: number | null;
  percMetaAtingida: number | null;
}

async function runQuarterlyCalculation(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  now: Date,
  ajusteRetroativo: boolean,
): Promise<RoiCalculationResult> {
  const result: RoiCalculationResult = {
    companyId,
    trimestre,
    ajusteRetroativo,
    employeesCalculated: [],
    skipped: [],
    errors: [],
    economicDiagnosisPersisted: false,
  };

  const meses = getQuarterMonths(trimestre);
  if (!meses) {
    result.errors.push({
      employeeId: null,
      error: `trimestre canonico invalido: ${trimestre}`,
    });
    return result;
  }

  const ctx = await loadCompanyContext(db, companyId);
  if (!ctx) {
    result.errors.push({
      employeeId: null,
      error: `companyId ${companyId} nao encontrado`,
    });
    return result;
  }

  // Precondicao §3.7: 3 meses do trimestre em status=fechado.
  const closures = await db
    .select({ mes: monthlyClosureStatus.mes, status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(
      and(eq(monthlyClosureStatus.companyId, companyId), inArray(monthlyClosureStatus.mes, meses)),
    );
  const closureByMes = new Map<string, string>();
  for (const c of closures) {
    closureByMes.set(c.mes, c.status);
  }
  const mesesAbertos = meses.filter((m) => closureByMes.get(m) !== 'fechado');
  if (mesesAbertos.length > 0) {
    result.skipped.push({
      employeeId: null,
      mes: null,
      trimestre,
      motivo: 'trimestre_incompleto',
      detail: `meses nao fechados: ${mesesAbertos.join(', ')}`,
    });
    return result;
  }

  // Garante indices mensais dos 3 meses (idempotente).
  for (const mes of meses) {
    try {
      const monthlyResult = await computeMonthlyIndices(db, companyId, mes, now);
      result.errors.push(...monthlyResult.errors);
      // filtrar skips relevantes ao trimestre para propagar (evitando
      // duplicacao — trimestre_incompleto ja foi checado acima).
      for (const s of monthlyResult.skipped) {
        if (s.motivo === 'dias_uteis_nao_lancado' && s.employeeId === null) {
          // skip da empresa no mes -> propagar para o trimestre.
          result.skipped.push({ ...s, trimestre });
        }
      }
    } catch (err) {
      result.errors.push({
        employeeId: null,
        error: `computeMonthlyIndices ${mes}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const activeEmployees = await db
    .select({
      id: employees.id,
      nivelHierarquico: employees.nivelHierarquico,
      jobFamily: employees.jobFamily,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .orderBy(asc(employees.id));

  // Primeira passada: computa indiceTri, scoreDesempenho, capacidadeOciosa,
  // custoMedioTrimestral, retornoPotencial (dependem so de dados do
  // colaborador). Segunda passada depende de faturamentoPotencial global.
  const snapshots: EmployeeQuarterlySnapshot[] = [];
  for (const emp of activeEmployees) {
    try {
      const snap = await buildEmployeeSnapshotFirstPass(
        db,
        ctx,
        emp.id,
        emp.nivelHierarquico,
        emp.jobFamily,
        trimestre,
        meses,
        result.skipped,
      );
      if (snap) {
        snapshots.push(snap);
      }
    } catch (err) {
      result.errors.push({
        employeeId: emp.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Bloco financeiro da empresa (§3.5 Passos 1-4). Requer faturamento
  // dos 3 meses preenchido.
  const monthlyRows = await db
    .select({
      mes: companyMonthlyData.mes,
      faturamentoBruto: companyMonthlyData.faturamentoBruto,
    })
    .from(companyMonthlyData)
    .where(
      and(eq(companyMonthlyData.companyId, companyId), inArray(companyMonthlyData.mes, meses)),
    );
  const faturamentoByMes = new Map<string, number | null>();
  for (const r of monthlyRows) {
    faturamentoByMes.set(r.mes, toNumberOrNull(r.faturamentoBruto));
  }
  const faturamentos = meses.map((m) => faturamentoByMes.get(m) ?? null);
  const financialCanCompute = faturamentos.every((f) => f !== null && f > 0);

  let faturamentoMedioTrimestral: number | null = null;
  let folhaTotalMedia: number | null = null;
  let faturamentoPotencial: number | null = null;

  if (financialCanCompute) {
    faturamentoMedioTrimestral = computeMediaTrimestral(
      faturamentos[0] as number,
      faturamentos[1] as number,
      faturamentos[2] as number,
    );

    const custosEmployees = snapshots
      .filter((s) => s.custoMedioTrimestral !== null)
      .map((s) => s.custoMedioTrimestral as number);

    const cLevelRows = await db
      .select({ custoMensal: cLevelMembers.custoMensal })
      .from(cLevelMembers)
      .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
    const custosCLevels = cLevelRows.map((r) => Number(r.custoMensal));

    folhaTotalMedia = computeFolhaTotalMedia(custosEmployees, custosCLevels);

    faturamentoPotencial = snapshots
      .filter((s) => s.retornoPotencial !== null)
      .reduce((acc, s) => acc + (s.retornoPotencial as number), 0);
  } else {
    result.skipped.push({
      employeeId: null,
      mes: null,
      trimestre,
      motivo: 'faturamento_nao_lancado',
      detail: `faturamentoBruto ausente em 1+ mes do trimestre ${trimestre}`,
    });
  }

  // Segunda passada: participacao, retornoEstimado, roiEstimado,
  // percMetaAtingida. Requer faturamentoPotencial e faturamentoMedio.
  if (financialCanCompute && faturamentoPotencial !== null && faturamentoMedioTrimestral !== null) {
    for (const s of snapshots) {
      if (s.retornoPotencial === null || s.metaROI === null) {
        continue;
      }
      const participacao = computeParticipacao(s.retornoPotencial, faturamentoPotencial);
      if (participacao === null) {
        continue;
      }
      s.participacao = participacao;
      const retornoEstimado = computeRetornoEstimado(faturamentoMedioTrimestral, participacao);
      s.retornoEstimado = retornoEstimado;
      if (s.custoMedioTrimestral !== null) {
        s.roiEstimado = computeRoiEstimado(retornoEstimado, s.custoMedioTrimestral);
        if (s.roiEstimado !== null) {
          s.percMetaAtingida = computePercMetaAtingida(s.roiEstimado, s.metaROI);
        }
      }
    }
  }

  // Persistencia: uma transacao por colaborador (S055 tolerancia a
  // falha parcial). Transacao curta: performanceQuarterlyData (upsert)
  // + performanceMultiplierLog (append).
  for (const s of snapshots) {
    if (s.indiceTri === null || s.scoreDesempenho === null || s.faixaDesempenho === null) {
      // Skip ja registrado — nao persiste linha do trimestre para este
      // colaborador (canonicamente NAO cria linha vazia).
      continue;
    }
    try {
      await persistEmployeeQuarterly(db, companyId, s, trimestre, now, ajusteRetroativo);
      result.employeesCalculated.push(s.employeeId);
    } catch (err) {
      result.errors.push({
        employeeId: s.employeeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Diagnostico economico (§3.6). Requer faturamentoMedio e
  // folhaTotalMedia > 0 (senao roiEmpresa NULL e o schema exige
  // roiEmpresa notNull). Grava sempre que financialCanCompute e ha
  // folha > 0, com status adequado (inclusive `sem_referencia` quando
  // roiSegmento* NULL).
  if (
    financialCanCompute &&
    faturamentoMedioTrimestral !== null &&
    folhaTotalMedia !== null &&
    folhaTotalMedia > 0
  ) {
    try {
      await persistEconomicDiagnosis(
        db,
        companyId,
        trimestre,
        faturamentoMedioTrimestral,
        folhaTotalMedia,
        faturamentoPotencial,
        ctx,
        now,
      );
      result.economicDiagnosisPersisted = true;
    } catch (err) {
      result.errors.push({
        employeeId: null,
        error: `companyEconomicDiagnosis: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}

async function buildEmployeeSnapshotFirstPass(
  db: RoipDatabase,
  ctx: CompanyContext,
  employeeId: number,
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico',
  jobFamily: string,
  trimestre: string,
  meses: string[],
  skipped: RoiSkipLog[],
): Promise<EmployeeQuarterlySnapshot | null> {
  const isFamilia6 = jobFamily === FAMILIA_6_JOB_FAMILY;
  const metaROI = resolveMetaROI(ctx, nivelHierarquico);

  const perfRows = await db
    .select()
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, ctx.companyId),
        eq(performanceData.employeeId, employeeId),
        inArray(performanceData.mes, meses),
      ),
    );
  const perfByMes = new Map<string, (typeof perfRows)[number]>();
  for (const p of perfRows) {
    perfByMes.set(p.mes, p);
  }

  // Passo 5 canonico: media dos 3 indices mensais (populados pelo
  // computeMonthlyIndices logo antes).
  const indicesPorMes: (number | null)[] = meses.map((mes) => {
    const p = perfByMes.get(mes);
    return p ? toNumberOrNull(p.indiceDesempenho) : null;
  });
  const indiceTri = computeIndiceDesempenhoTrimestral(
    indicesPorMes[0] ?? null,
    indicesPorMes[1] ?? null,
    indicesPorMes[2] ?? null,
  );

  if (indiceTri === null) {
    skipped.push({
      employeeId,
      mes: null,
      trimestre,
      motivo: 'sem_demanda',
      detail: `colaborador ${employeeId} sem indice mensal em 1+ mes do trimestre`,
    });
    return null;
  }

  const scoreDesempenho = computeScoreDesempenho(indiceTri);
  const faixaDesempenho = computeFaixaDesempenho(
    scoreDesempenho,
    ctx.thresholdDesempenhoBaixo,
    ctx.thresholdDesempenhoMedio,
  );

  // Capacidade ociosa: baseada no ULTIMO mes do trimestre (S056).
  const ultimoMes = meses[2];
  const perfUltimo = ultimoMes ? perfByMes.get(ultimoMes) : undefined;
  let capacidadeOciosa: number | null = null;
  if (perfUltimo && !isFamilia6) {
    const goalsRows = await db
      .select({
        variableIndex: employeeGoals.variableIndex,
        weight: employeeGoals.weight,
        goal: employeeGoals.goal,
      })
      .from(employeeGoals)
      .where(eq(employeeGoals.employeeId, employeeId))
      .orderBy(asc(employeeGoals.variableIndex));
    const varRows = await db
      .select({
        variableIndex: performanceVariableData.variableIndex,
        demanda: performanceVariableData.demanda,
      })
      .from(performanceVariableData)
      .where(eq(performanceVariableData.performanceDataId, perfUltimo.id));
    const demandaByIndex = new Map<number, number | null>();
    for (const v of varRows) {
      demandaByIndex.set(v.variableIndex, toNumberOrNull(v.demanda));
    }
    const ociosaInput = goalsRows.map((g) => ({
      weight: Number(g.weight),
      demanda: demandaByIndex.get(g.variableIndex) ?? null,
      goal: Number(g.goal),
    }));
    capacidadeOciosa = computeCapacidadeOciosa(ociosaInput, false);
  }

  // Bloco financeiro individual: custoMedioTrimestral, retornoPotencial.
  // Requer custoTotalMes preenchido nos 3 meses.
  let custoMedioTrimestral: number | null = null;
  let retornoPotencial: number | null = null;
  const custos: (number | null)[] = meses.map((mes) => {
    const p = perfByMes.get(mes);
    return p ? toNumberOrNull(p.custoTotalMes) : null;
  });
  const custosOk = custos.every((c) => c !== null && c > 0);
  if (!custosOk) {
    skipped.push({
      employeeId,
      mes: null,
      trimestre,
      motivo: 'custo_nao_lancado',
      detail: `colaborador ${employeeId} sem custoTotalMes em 1+ mes; financeiro nao calculado`,
    });
  } else {
    custoMedioTrimestral = computeMediaTrimestral(
      custos[0] as number,
      custos[1] as number,
      custos[2] as number,
    );
    if (metaROI === null) {
      skipped.push({
        employeeId,
        mes: null,
        trimestre,
        motivo: 'meta_roi_nao_configurada',
        detail:
          `nivelHierarquico=${nivelHierarquico} sem metaROI configurada; ` +
          `financeiro nao calculado`,
      });
    } else {
      retornoPotencial = computeRetornoPotencial(custoMedioTrimestral, metaROI);
    }
  }

  return {
    employeeId,
    nivelHierarquico,
    jobFamily,
    isFamilia6,
    metaROI,
    indiceTri,
    scoreDesempenho,
    faixaDesempenho,
    capacidadeOciosa,
    custoMedioTrimestral,
    retornoPotencial,
    participacao: null,
    retornoEstimado: null,
    roiEstimado: null,
    percMetaAtingida: null,
  };
}

async function persistEmployeeQuarterly(
  db: RoipDatabase,
  companyId: number,
  s: EmployeeQuarterlySnapshot,
  trimestre: string,
  now: Date,
  ajusteRetroativo: boolean,
): Promise<void> {
  if (s.indiceTri === null || s.scoreDesempenho === null || s.faixaDesempenho === null) {
    throw new Error('persistEmployeeQuarterly: snapshot sem Eixo X');
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(performanceQuarterlyData)
      .values({
        companyId,
        employeeId: s.employeeId,
        trimestre,
        indiceDesempenho: String(s.indiceTri),
        scoreDesempenho: String(s.scoreDesempenho),
        capacidadeOciosa: s.capacidadeOciosa === null ? null : String(s.capacidadeOciosa * 100),
        faixaDesempenho: s.faixaDesempenho,
        custoMedioTrimestral:
          s.custoMedioTrimestral === null ? null : String(s.custoMedioTrimestral),
        metaROI: s.metaROI === null ? null : String(s.metaROI),
        retornoPotencial: s.retornoPotencial === null ? null : String(s.retornoPotencial),
        participacao: s.participacao === null ? null : String(s.participacao),
        retornoEstimado: s.retornoEstimado === null ? null : String(s.retornoEstimado),
        roiEstimado: s.roiEstimado === null ? null : String(s.roiEstimado),
        percMetaAtingida: s.percMetaAtingida === null ? null : String(s.percMetaAtingida),
        calculadoEm: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          indiceDesempenho: String(s.indiceTri),
          scoreDesempenho: String(s.scoreDesempenho),
          capacidadeOciosa: s.capacidadeOciosa === null ? null : String(s.capacidadeOciosa * 100),
          faixaDesempenho: s.faixaDesempenho,
          custoMedioTrimestral:
            s.custoMedioTrimestral === null ? null : String(s.custoMedioTrimestral),
          metaROI: s.metaROI === null ? null : String(s.metaROI),
          retornoPotencial: s.retornoPotencial === null ? null : String(s.retornoPotencial),
          participacao: s.participacao === null ? null : String(s.participacao),
          retornoEstimado: s.retornoEstimado === null ? null : String(s.retornoEstimado),
          roiEstimado: s.roiEstimado === null ? null : String(s.roiEstimado),
          percMetaAtingida: s.percMetaAtingida === null ? null : String(s.percMetaAtingida),
          calculadoEm: now,
        },
      });

    // Carrega o id atualizado do performanceQuarterlyData para logar.
    const [qdRow] = await tx
      .select({ id: performanceQuarterlyData.id })
      .from(performanceQuarterlyData)
      .where(
        and(
          eq(performanceQuarterlyData.companyId, companyId),
          eq(performanceQuarterlyData.employeeId, s.employeeId),
          eq(performanceQuarterlyData.trimestre, trimestre),
        ),
      )
      .limit(1);
    if (!qdRow) {
      throw new Error(
        `persistEmployeeQuarterly: performanceQuarterlyData nao encontrado apos upsert ` +
          `(employeeId=${s.employeeId}, trimestre=${trimestre})`,
      );
    }

    // Log canonico §3.8 (append-only). `metaROIUsada` e obrigatoria pelo
    // schema — quando `metaROI` do colaborador e NULL, gravamos 0 como
    // sentinela canonica.
    await tx.insert(performanceMultiplierLog).values({
      quarterlyDataId: qdRow.id,
      employeeId: s.employeeId,
      trimestre,
      nivelHierarquico: s.nivelHierarquico,
      metaROIUsada: s.metaROI === null ? '0' : String(s.metaROI),
      ajusteRetroativo,
      calculadoEm: now,
    });
  });
}

async function persistEconomicDiagnosis(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  faturamentoMedio: number,
  folhaTotalMedia: number,
  faturamentoPotencial: number | null,
  ctx: CompanyContext,
  now: Date,
): Promise<void> {
  const roiEmpresa = computeRoiEmpresa(faturamentoMedio, folhaTotalMedia);
  const folhaPorcentagem = computeFolhaPorcentagem(folhaTotalMedia, faturamentoMedio);
  const statusDiagnostico: StatusDiagnostico =
    roiEmpresa === null
      ? 'sem_referencia'
      : computeStatusDiagnostico(roiEmpresa, ctx.roiSegmentoMinimo, ctx.roiSegmentoMaximo);

  let roiMuitoBom: number | null = null;
  let faturamentoIdeal: number | null = null;
  if (ctx.roiSegmentoMinimo !== null && ctx.roiSegmentoMaximo !== null) {
    roiMuitoBom = computeRoiMuitoBom(ctx.roiSegmentoMinimo, ctx.roiSegmentoMaximo);
    faturamentoIdeal = computeFaturamentoIdeal(folhaTotalMedia, roiMuitoBom);
  }

  const values = {
    companyId,
    trimestre,
    faturamentoMedioTrimestral: String(faturamentoMedio),
    folhaTotalMedia: String(folhaTotalMedia),
    faturamentoPotencial: faturamentoPotencial === null ? null : String(faturamentoPotencial),
    roiEmpresa: roiEmpresa === null ? '0' : String(roiEmpresa),
    folhaPorcentagem: folhaPorcentagem === null ? '0' : String(folhaPorcentagem),
    roiSegmentoMinimo: ctx.roiSegmentoMinimo === null ? null : String(ctx.roiSegmentoMinimo),
    roiSegmentoMaximo: ctx.roiSegmentoMaximo === null ? null : String(ctx.roiSegmentoMaximo),
    roiMuitoBom: roiMuitoBom === null ? null : String(roiMuitoBom),
    faturamentoIdeal: faturamentoIdeal === null ? null : String(faturamentoIdeal),
    statusDiagnostico,
    calculadoEm: now,
  } as const;

  await db
    .insert(companyEconomicDiagnosis)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        faturamentoMedioTrimestral: values.faturamentoMedioTrimestral,
        folhaTotalMedia: values.folhaTotalMedia,
        faturamentoPotencial: values.faturamentoPotencial,
        roiEmpresa: values.roiEmpresa,
        folhaPorcentagem: values.folhaPorcentagem,
        roiSegmentoMinimo: values.roiSegmentoMinimo,
        roiSegmentoMaximo: values.roiSegmentoMaximo,
        roiMuitoBom: values.roiMuitoBom,
        faturamentoIdeal: values.faturamentoIdeal,
        statusDiagnostico: values.statusDiagnostico,
        calculadoEm: values.calculadoEm,
      },
    });
}
