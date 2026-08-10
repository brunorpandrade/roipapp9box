// ROIP APP 9BOX — orchestrator canonico do seed Nativa Alimentos Ltda. (ME-068).
//
// Coordena o INSERT canonico bit-exact das ~29 tabelas cobertas pela fixture
// Nativa (17 via JSON com SHA-256 pinado + 12 derivadas canonicamente).
//
// Idempotencia: SELECT companies WHERE id=1 antes de qualquer INSERT; se existe,
// retorna { applied: false, reason: 'Nativa ja seed em base' }. Padrao S299
// preservado (mesmo padrao de seed-super-admin.mjs).
//
// Ordem canonica de INSERT (respeita FKs):
//   1. companies (1)
//   2. cLevelMembers (3)
//   3. employees (66) — com bcrypt runtime para os 14 acessos
//   4. companyJobFamilies (20)
//   5. employeeGoals (192)
//   6. employeeLeaderHistory (68)
//   7. lgpdConsents (14)
//   8. responsavelFinanceiroTransferLog (2)
//   9. companyMonthlyData (24)
//  10. monthlyClosureStatus (24)
//  11. companyEconomicDiagnosis (8)
//  12. cycleSchedule (5)
//  13. individualProfilePlaceholders (69)
//  14. individualProfileAssessments (66) — JSON respostas + assessment metadata
//  15. individualProfileScores (66) — JSON, FK -> assessments
//  16. performanceData (1210) — JSON
//  17. performanceVariableData (4840) — derivado do performance_mensal.json
//  18. performanceQuarterlyData (415) — JSON
//  19. instrumentA_responses (8020) — JSON
//  20. instrumentC_assessments (8020) — JSON
//  21. plenitudeData (401) — JSON
//  22. nineBoxClassifications (387) — JSON
//  23. instrumentD_responses (4000) — JSON
//  24. iqlData (45) — JSON
//  25. copsoqCycles (1) — JSON
//  26. copsoqCycleSnapshot (54) — JSON
//  27. copsoq_responses (1344) — JSON
//  28. copsoqFactorScores (56) — JSON
//  29. nr1AreaDivergenceAnalysis (6) — JSON
//  30. employeeTerminationEvents (13) — JSON
//
// RV-13: consumido por scripts/seed-nativa.mjs + tests/integration/nativaSeed.test.ts.
// RV-09 canonica bit-exact: mappers batem 1:1 com o schema Drizzle real
// (src/db/schema/tables.ts). Se o schema mudar, o TypeScript falha.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import type {
  Departamento,
  JobFamily,
  NivelHierarquico,
  OnboardingEstagio,
} from '../../schema/enums';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  companyJobFamilies,
  companyMonthlyData,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  copsoq_responses,
  cycleSchedule,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentD_responses,
  iqlData,
  lgpdConsents,
  monthlyClosureStatus,
  nineBoxClassifications,
  nr1AreaDivergenceAnalysis,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
  plenitudeData,
  responsavelFinanceiroTransferLog,
} from '../../schema';
import {
  NATIVA_CLEVELS,
  NATIVA_COMPANY_ROW,
  NATIVA_EMPLOYEES,
  type NativaCLevelRow,
  type NativaEmployeeRow,
} from './constants';
import { deriveEmployeeRow } from './deriveEmployee';
import { deriveNativaEmployeeGoals } from './deriveEmployeeGoals';
import { deriveNativaEmployeeLeaderHistory } from './deriveEmployeeLeaderHistory';
import {
  deriveCompanyJobFamilies,
  deriveCompanyMonthlyData,
  deriveCycleSchedule,
  deriveEconomicDiagnosis,
  deriveLgpdConsents,
  deriveMonthlyClosureStatus,
  deriveProfilePlaceholders,
  deriveRfTransferLog,
} from './deriveMisc';
import { loadFixture, validateNativaManifest } from './loadJsonFixtures';

// ---------------------------------------------------------------------
// Configuracao canonica
// ---------------------------------------------------------------------

/** ID canonico bit-exact da Nativa em `companies`. */
export const NATIVA_COMPANY_ID = 1 as const;

/** Senha canonica para os 14 acessos + 3 C-levels da Nativa (MD §4.1). */
export const NATIVA_UNIVERSAL_PASSWORD = 'NativaDemo2027!' as const;

/** Versao canonica do termo LGPD ativo no seed. */
export const NATIVA_LGPD_TERM_VERSION = 'nativa-v1' as const;

/** ID do Super Admin (Bruno) que atua como `updatedBy`/`actor` no seed. */
export const NATIVA_SUPER_ADMIN_ID = 1 as const;

// ---------------------------------------------------------------------
// Helpers canonicos
// ---------------------------------------------------------------------

/**
 * Converte string ISO 'YYYY-MM-DD' em Date UTC canonico bit-exact.
 * Drizzle `date()` exige Date object; strings ISO nao passam o overload.
 */
function toDate(iso: string): Date {
  return new Date(iso + 'T00:00:00.000Z');
}

interface EmployeeIdIndex {
  byName: Map<string, number>;
  cLevelByName: Map<string, number>;
}

function buildIdIndex(): EmployeeIdIndex {
  const byName = new Map<string, number>();
  for (const emp of NATIVA_EMPLOYEES) {
    byName.set(emp.nomeCompleto, emp.id);
    // Alias curto (primeiro + segundo nome) para JSONs de fixture.
    const partes = emp.nomeCompleto.split(' ');
    if (partes.length >= 2) {
      byName.set(`${partes[0]!} ${partes[1]!}`, emp.id);
    }
  }
  const cLevelByName = new Map<string, number>();
  for (const cl of NATIVA_CLEVELS) {
    cLevelByName.set(cl.nomeCompleto, cl.id);
    // Alias curto (sem sobrenomes)
    const partes = cl.nomeCompleto.split(' ');
    if (partes.length >= 2) {
      cLevelByName.set(`${partes[0]!} ${partes[1]!}`, cl.id);
    }
  }
  return { byName, cLevelByName };
}

function resolveEmployeeId(nome: string, idx: EmployeeIdIndex): number {
  const id = idx.byName.get(nome);
  if (id === undefined) {
    throw new Error(`resolveEmployeeId: nome nao encontrado='${nome}'`);
  }
  return id;
}

function resolveCLevelId(nome: string, idx: EmployeeIdIndex): number {
  const id = idx.cLevelByName.get(nome);
  if (id === undefined) {
    throw new Error(`resolveCLevelId: nome nao encontrado='${nome}'`);
  }
  return id;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

export interface SeedNativaResult {
  applied: boolean;
  reason?: string;
  counts?: Record<string, number>;
}

export interface SeedNativaOptions {
  /** Wrapper de bcrypt runtime — injetavel para testes acelerarem o cost. */
  readonly hashPassword: (plain: string) => Promise<string>;
}

/**
 * Executa o seed canonico bit-exact da Nativa. Idempotente por design:
 * segunda execucao detecta que companies.id=1 ja existe e retorna sem tocar
 * a base.
 */
export async function seedNativa(
  db: RoipDatabase,
  opts: SeedNativaOptions,
): Promise<SeedNativaResult> {
  // Idempotencia canonica bit-exact.
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, NATIVA_COMPANY_ID));
  if (existing.length > 0) {
    return {
      applied: false,
      reason: `Nativa Alimentos Ltda. (id=${NATIVA_COMPANY_ID}) ja existe. Seed nao reaplicado.`,
    };
  }

  // Prova canonica: 20 JSONs carregam com SHA-256 esperado antes de qualquer INSERT.
  const manifest = validateNativaManifest();
  if (manifest.totalFiles !== 20) {
    throw new Error(`seedNativa: manifest tem ${manifest.totalFiles} arquivos; esperado=20.`);
  }

  const idIdx = buildIdIndex();
  const passwordHash = await opts.hashPassword(NATIVA_UNIVERSAL_PASSWORD);
  const counts: Record<string, number> = {};

  // 1. companies
  const companyRow = {
    ...NATIVA_COMPANY_ROW,
    kickoffDate: toDate(NATIVA_COMPANY_ROW.kickoffDate),
  };
  await db.insert(companies).values(companyRow);
  counts.companies = 1;

  // 2. cLevelMembers (3)
  const cLevelRows = NATIVA_CLEVELS.map((cl: NativaCLevelRow) => ({
    id: cl.id,
    companyId: NATIVA_COMPANY_ID,
    name: cl.nomeCompleto,
    cpf: cl.cpf,
    email: cl.email,
    photoUrl: null,
    dataNascimento: toDate(cl.dataNascimento),
    dataAdmissao: toDate(cl.dataAdmissao),
    cargo: cl.cargo,
    descricaoCargo: cl.descricaoCargo,
    departamento: cl.departamento as Departamento,
    custoMensal: cl.custoMensal.toFixed(2),
    acessoTotal: cl.acessoTotal,
    isResponsavelFinanceiro: cl.isResponsavelFinanceiro,
    status: 'ativo' as const,
    passwordHash,
    passwordSet: true,
    createdAt: toDate(cl.dataAdmissao),
  }));
  await db.insert(cLevelMembers).values(cLevelRows);
  counts.cLevelMembers = cLevelRows.length;

  // 3. employees (66)
  const employeeRows = NATIVA_EMPLOYEES.map((emp: NativaEmployeeRow) => {
    const derived = deriveEmployeeRow(emp, NATIVA_COMPANY_ID);
    const isAcessoHabilitado = derived.isLider || derived.isRH;
    return {
      id: derived.id,
      companyId: derived.companyId,
      name: derived.name,
      cpf: derived.cpf,
      email: derived.email,
      photoUrl: derived.photoUrl,
      dataNascimento: toDate(derived.dataNascimento),
      dataAdmissao: toDate(derived.dataAdmissao),
      cbo: derived.cbo,
      descricaoCBO: derived.descricaoCBO,
      jobFamily: derived.jobFamily as JobFamily,
      senioridade: derived.senioridade,
      nivelHierarquico: derived.nivelHierarquico as NivelHierarquico,
      departamento: derived.departamento as Departamento,
      status: derived.status,
      isRH: derived.isRH,
      isLider: derived.isLider,
      isResponsavelFinanceiro: derived.isResponsavelFinanceiro,
      onboardingEstagio: derived.onboardingEstagio as OnboardingEstagio,
      passwordHash: isAcessoHabilitado ? passwordHash : null,
      passwordSet: isAcessoHabilitado,
      createdAt: derived.createdAt,
    };
  });
  await db.insert(employees).values(employeeRows);
  counts.employees = employeeRows.length;

  // 4. companyJobFamilies (20)
  const jobFamilyRows = deriveCompanyJobFamilies(NATIVA_COMPANY_ID, NATIVA_SUPER_ADMIN_ID);
  await db.insert(companyJobFamilies).values([...jobFamilyRows]);
  counts.companyJobFamilies = jobFamilyRows.length;

  // 5. employeeGoals (192)
  const goalsRows = deriveNativaEmployeeGoals().map((g) => ({
    employeeId: g.employeeId,
    jobFamily: g.jobFamily as JobFamily,
    variableIndex: g.variableIndex,
    variableName: g.variableName,
    unit: g.unit,
    weight: g.weight,
    goal: g.goal,
    updatedBy: g.updatedBy,
  }));
  await db.insert(employeeGoals).values(goalsRows);
  counts.employeeGoals = goalsRows.length;

  // 6. employeeLeaderHistory (68)
  const leaderHistoryRows = deriveNativaEmployeeLeaderHistory().map((h) => ({
    employeeId: h.employeeId,
    liderId: h.liderId,
    clevelId: h.clevelId,
    dataInicio: toDate(h.dataInicio),
    dataFim: h.dataFim === null ? null : toDate(h.dataFim),
    reason: h.reason,
    transferBatchId: h.transferBatchId,
    createdAt: h.createdAt,
  }));
  await db.insert(employeeLeaderHistory).values(leaderHistoryRows);
  counts.employeeLeaderHistory = leaderHistoryRows.length;

  // 7. lgpdConsents (14)
  const lgpdRows = deriveLgpdConsents(NATIVA_COMPANY_ID, NATIVA_LGPD_TERM_VERSION);
  await db.insert(lgpdConsents).values([...lgpdRows]);
  counts.lgpdConsents = lgpdRows.length;

  // 8. responsavelFinanceiroTransferLog (2)
  const rfLogRows = deriveRfTransferLog(NATIVA_COMPANY_ID, NATIVA_SUPER_ADMIN_ID);
  await db.insert(responsavelFinanceiroTransferLog).values([...rfLogRows]);
  counts.responsavelFinanceiroTransferLog = rfLogRows.length;

  // 9. companyMonthlyData (24)
  const monthlyDataRows = deriveCompanyMonthlyData(NATIVA_COMPANY_ID);
  await db.insert(companyMonthlyData).values([...monthlyDataRows]);
  counts.companyMonthlyData = monthlyDataRows.length;

  // 10. monthlyClosureStatus (24)
  const closureRows = deriveMonthlyClosureStatus(NATIVA_COMPANY_ID);
  await db.insert(monthlyClosureStatus).values([...closureRows]);
  counts.monthlyClosureStatus = closureRows.length;

  // 11. companyEconomicDiagnosis (8)
  const diagRows = deriveEconomicDiagnosis(NATIVA_COMPANY_ID);
  await db.insert(companyEconomicDiagnosis).values([...diagRows]);
  counts.companyEconomicDiagnosis = diagRows.length;

  // 12. cycleSchedule (5)
  const cycleRows = deriveCycleSchedule(NATIVA_COMPANY_ID);
  await db.insert(cycleSchedule).values([...cycleRows]);
  counts.cycleSchedule = cycleRows.length;

  // 13. individualProfilePlaceholders (69)
  const placeholderRows = deriveProfilePlaceholders(NATIVA_COMPANY_ID);
  await db.insert(individualProfilePlaceholders).values([...placeholderRows]);
  counts.individualProfilePlaceholders = placeholderRows.length;

  // --- Carregamento dos JSONs (validacao SHA-256 ja feita no manifest above).
  //
  // Ordem canonica S366: assessments ANTES de scores porque
  // individualProfileScores.assessmentId e FK NOT NULL para
  // individualProfileAssessments.id.

  // 14. individualProfileAssessments + responses embutidas (66 assessments, 5280 respostas)
  const assessmentsJson = loadFixture<Array<Record<string, unknown>>>(
    'individual_profile_assessments.json',
  );
  const responsesJson = loadFixture<Array<Record<string, unknown>>>(
    'individual_profile_responses.json',
  );
  const respostasByKey = buildRespostasIndex(responsesJson.data);
  const assessmentRows = assessmentsJson.data.map((r) =>
    mapAssessmentToRow(r, respostasByKey, idIdx),
  );
  await db.insert(individualProfileAssessments).values(assessmentRows);
  counts.individualProfileAssessments = assessmentRows.length;
  counts.individualProfileResponses_embedded = responsesJson.data.length;

  // Recupera IDs dos assessments recem inseridos para preencher FK dos scores.
  const assessmentIdRows = await db
    .select({
      id: individualProfileAssessments.id,
      userType: individualProfileAssessments.userType,
      userId: individualProfileAssessments.userId,
      tentativa: individualProfileAssessments.tentativa,
    })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.companyId, NATIVA_COMPANY_ID));
  const assessmentIdIndex = new Map<string, number>();
  for (const a of assessmentIdRows) {
    assessmentIdIndex.set(`${a.userType}:${a.userId}:${a.tentativa}`, a.id);
  }

  // 15. individualProfileScores (66)
  const scoresJson = loadFixture<Array<Record<string, unknown>>>('individual_profile_scores.json');
  const scoresRows = scoresJson.data.map((r) => mapScoreToRow(r, idIdx, assessmentIdIndex));
  await db.insert(individualProfileScores).values(scoresRows);
  counts.individualProfileScores = scoresRows.length;

  // 16. Performance Data (1210)
  const perfMensalJson = loadFixture<Array<Record<string, unknown>>>('performance_mensal.json');
  const perfMensalRows = perfMensalJson.data.map((r) => mapPerfMensalToRow(r));
  await db.insert(performanceData).values(perfMensalRows);
  counts.performanceData = perfMensalRows.length;

  // Recupera IDs de performanceData recem inseridos para preencher FK de
  // performanceVariableData (performanceDataId).
  const perfDataIdRows = await db
    .select({
      id: performanceData.id,
      employeeId: performanceData.employeeId,
      mes: performanceData.mes,
    })
    .from(performanceData)
    .where(eq(performanceData.companyId, NATIVA_COMPANY_ID));
  const perfDataIdIndex = new Map<string, number>();
  for (const p of perfDataIdRows) {
    perfDataIdIndex.set(`${p.employeeId}:${p.mes}`, p.id);
  }

  // 17. Performance Variable Data (4840 derivados)
  const perfVarRows: Array<{
    performanceDataId: number;
    variableIndex: number;
    demanda: string;
    executado: string;
    desempenho: string;
    peso: string;
  }> = [];
  for (const raw of perfMensalJson.data) {
    const empId = raw.employeeId as number;
    const mes = raw.mes as string;
    const perfId = perfDataIdIndex.get(`${empId}:${mes}`);
    if (perfId === undefined) {
      throw new Error(
        `performanceVariableData: performanceDataId nao encontrado empId=${empId} mes=${mes}`,
      );
    }
    const variables = raw.variables as Array<[number, number, number, number, number]>;
    for (const [variableIndex, demanda, executado, desempenho, weight] of variables) {
      perfVarRows.push({
        performanceDataId: perfId,
        variableIndex,
        demanda: demanda.toFixed(2),
        executado: executado.toFixed(2),
        desempenho: desempenho.toFixed(4),
        peso: weight.toFixed(2),
      });
    }
  }
  if (perfVarRows.length !== 4840) {
    throw new Error(`performanceVariableData: derivou ${perfVarRows.length}; esperado=4840`);
  }
  await db.insert(performanceVariableData).values(perfVarRows);
  counts.performanceVariableData = perfVarRows.length;

  // 18. Performance Quarterly Data (415)
  const perfTrimJson = loadFixture<Array<Record<string, unknown>>>('performance_trimestral.json');
  const perfTrimRows = perfTrimJson.data.map((r) => mapPerfTrimToRow(r));
  await db.insert(performanceQuarterlyData).values(perfTrimRows);
  counts.performanceQuarterlyData = perfTrimRows.length;

  // 19. Instrumento A (8020)
  const instAJson = loadFixture<Array<Record<string, unknown>>>('instrumento_a_respostas.json');
  const instARows = instAJson.data.map((r) => mapInstAToRow(r, idIdx));
  await db.insert(instrumentA_responses).values(instARows);
  counts.instrumentA_responses = instARows.length;

  // 20. Instrumento C (8020)
  const instCJson = loadFixture<Array<Record<string, unknown>>>('instrumento_c_respostas.json');
  const instCRows = instCJson.data.map((r) => mapInstCToRow(r, idIdx));
  await db.insert(instrumentC_assessments).values(instCRows);
  counts.instrumentC_assessments = instCRows.length;

  // 21. Plenitude Data (401)
  const plenJson = loadFixture<Array<Record<string, unknown>>>('plenitude_completa.json');
  const plenRows = plenJson.data.map(mapPlenitudeToRow);
  await db.insert(plenitudeData).values(plenRows);
  counts.plenitudeData = plenRows.length;

  // 22. Nine Box (387)
  const nineJson = loadFixture<Array<Record<string, unknown>>>('nine_box.json');
  const nineRows = nineJson.data.map(mapNineBoxToRow);
  await db.insert(nineBoxClassifications).values(nineRows);
  counts.nineBoxClassifications = nineRows.length;

  // 23. Instrumento D (4000)
  const instDJson = loadFixture<Array<Record<string, unknown>>>('instrumento_d_respostas.json');
  const instDRows = instDJson.data.map((r) => mapInstDToRow(r, idIdx));
  await db.insert(instrumentD_responses).values(instDRows);
  counts.instrumentD_responses = instDRows.length;

  // 24. IQL (45)
  const iqlJson = loadFixture<Array<Record<string, unknown>>>('iql_data.json');
  const iqlRows = iqlJson.data.map((r) => mapIqlToRow(r, idIdx));
  await db.insert(iqlData).values(iqlRows);
  counts.iqlData = iqlRows.length;

  // 25. NR-1 Ciclos (1)
  const nr1CicloJson = loadFixture<Record<string, unknown>>('nr1_ciclo.json');
  await db.insert(copsoqCycles).values([mapNr1CycleToRow(nr1CicloJson.data)]);
  counts.copsoqCycles = 1;

  // Recupera cicloDbId para preencher FKs das tabelas subsequentes.
  const [cicloRow] = await db
    .select({ id: copsoqCycles.id })
    .from(copsoqCycles)
    .where(eq(copsoqCycles.companyId, NATIVA_COMPANY_ID));
  if (!cicloRow) {
    throw new Error('copsoqCycles: cicloDbId nao encontrado apos INSERT.');
  }
  const cicloDbId = cicloRow.id;

  // 26. NR-1 Snapshots (51 employees; c-levels sao filtrados — RV-09 Opcao A
  // ME-068a-fix: schema copsoqCycleSnapshot exige employeeId FK employees NOT NULL,
  // sem coluna cLevelId. C-levels no JSON original violavam schema; sao inelegiveis
  // por regulamentacao NR-1. MD Nativa v1.1 §13.1 (54) sera corrigido em MD v1.2
  // para 51 (39 respondentes + 12 nao-respondentes elegiveis).
  const nr1SnapJson = loadFixture<Array<Record<string, unknown>>>('nr1_snapshots.json');
  const nr1SnapFiltered = nr1SnapJson.data.filter(
    (r) => ((r.userType as string) ?? 'employee') === 'employee',
  );
  const nr1SnapRows = nr1SnapFiltered.map((r) => mapNr1SnapToRow(r, cicloDbId, idIdx));
  await db.insert(copsoqCycleSnapshot).values(nr1SnapRows);
  counts.copsoqCycleSnapshot = nr1SnapRows.length;

  // 27. NR-1 Responses (1248 = 39 employees × 32 itens; c-levels filtrados — Opcao A)
  // MD Nativa v1.1 §13.1 (1344 = 42 × 32) sera corrigido em MD v1.2 para 1248.
  const nr1RespJson = loadFixture<Array<Record<string, unknown>>>('nr1_respostas.json');
  const nr1RespFiltered = nr1RespJson.data.filter(
    (r) => ((r.userType as string) ?? 'employee') === 'employee',
  );
  const nr1RespRows = nr1RespFiltered.map((r) => mapNr1RespToRow(r, cicloDbId, idIdx));
  await db.insert(copsoq_responses).values(nr1RespRows);
  counts.copsoq_responses = nr1RespRows.length;

  // 28. NR-1 Factor Scores (56)
  const nr1FactJson = loadFixture<Array<Record<string, unknown>>>('nr1_factor_scores.json');
  const nr1FactRows = nr1FactJson.data.map((r) => mapNr1FactToRow(r, cicloDbId));
  await db.insert(copsoqFactorScores).values(nr1FactRows);
  counts.copsoqFactorScores = nr1FactRows.length;

  // 29. NR-1 Divergencias (6)
  const nr1DivJson = loadFixture<Array<Record<string, unknown>>>('nr1_divergencias.json');
  const nr1DivRows = nr1DivJson.data.map((r) => mapNr1DivToRow(r, cicloDbId));
  await db.insert(nr1AreaDivergenceAnalysis).values(nr1DivRows);
  counts.nr1AreaDivergenceAnalysis = nr1DivRows.length;

  // 30. Turnover Events (13)
  const turnEvJson = loadFixture<Array<Record<string, unknown>>>('nr1_turnover_events.json');
  const turnRows = turnEvJson.data.map((r) => mapTerminationToRow(r));
  await db.insert(employeeTerminationEvents).values(turnRows);
  counts.employeeTerminationEvents = turnRows.length;

  return { applied: true, counts };
}

// ---------------------------------------------------------------------
// Mappers JSON → schema Drizzle (bit-exact ao schema real).
// ---------------------------------------------------------------------

function buildRespostasIndex(
  responses: Array<Record<string, unknown>>,
): Map<string, Record<string, number>> {
  const idx = new Map<string, Record<string, number>>();
  for (const r of responses) {
    const key = `${r.userType}:${r.userId}`;
    let bucket = idx.get(key);
    if (bucket === undefined) {
      bucket = {};
      idx.set(key, bucket);
    }
    const itemKey = `ITEM_${String(r.itemIndex).padStart(3, '0')}`;
    bucket[itemKey] = r.valor as number;
  }
  return idx;
}

/**
 * Mapper canonico para individualProfileAssessments.
 * Schema exige: companyId, userType, userId, tentativa, status, blocoAtual,
 * blocosCompletos (json), respostas (json), confiabilidadeNivel, ia_att/soc/acq/cons/ext,
 * enviadoEm, calculadoEm, createdAt, updatedAt.
 */
function mapAssessmentToRow(
  r: Record<string, unknown>,
  respostasByKey: Map<string, Record<string, number>>,
  idx: EmployeeIdIndex,
) {
  const nome = r.nome as string;
  // JSON canonico do gerador nao serializa userType. Detectamos pelo nome:
  // se bate com C-level (nome completo ou alias curto), e clevel; senao employee.
  const declaredType = r.userType as string | undefined;
  const userType = (declaredType ?? (idx.cLevelByName.has(nome) ? 'clevel' : 'employee')) as
    'employee' | 'clevel';
  const userId = userType === 'clevel' ? resolveCLevelId(nome, idx) : resolveEmployeeId(nome, idx);
  const respostas = respostasByKey.get(`${userType}:${userId}`) ?? {};
  const enviadoEm = r.respondidoEm ? new Date(String(r.respondidoEm) + 'T10:00:00.000Z') : null;
  const rawStatus = (r.status as string) ?? 'enviado';
  // JSON canonico usa 'respondido' como sinonimo semantico de 'enviado'
  // (ambos indicam questionario submetido com sucesso). Schema canonico
  // §861 aceita apenas 'em_andamento' | 'enviado' | 'inconsistente'.
  const normalized = rawStatus === 'respondido' ? 'enviado' : rawStatus;
  return {
    companyId: NATIVA_COMPANY_ID,
    userType,
    userId,
    tentativa: 1,
    status: normalized as 'em_andamento' | 'enviado' | 'inconsistente',
    blocoAtual: 10,
    blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    respostas,
    confiabilidadeNivel: (r.confiabilidadeNivel ?? 'alta') as 'alta' | 'moderada' | 'baixa',
    enviadoEm,
    calculadoEm: enviadoEm,
    createdAt: enviadoEm ?? new Date(),
    updatedAt: enviadoEm ?? new Date(),
  };
}

/**
 * Mapper canonico para individualProfileScores.
 * Schema tem 26 colunas decimais nomeadas (post_assert..ass_transc) + vetores
 * + jsons. O JSON de fixture carrega apenas um subset — usamos placeholders
 * '50.00' para as 26 decimais quando ausentes (nao ha calculo canonico do
 * gerador Python para elas isoladamente; a assinatura vetorial e o que importa
 * para os testes de UI).
 */
function mapScoreToRow(
  r: Record<string, unknown>,
  idx: EmployeeIdIndex,
  assessmentIdIndex: Map<string, number>,
) {
  const nome = r.nome as string;
  const declaredType = r.userType as string | undefined;
  const userType = (declaredType ?? (idx.cLevelByName.has(nome) ? 'clevel' : 'employee')) as
    'employee' | 'clevel';
  const userId = userType === 'clevel' ? resolveCLevelId(nome, idx) : resolveEmployeeId(nome, idx);
  const assessmentId = assessmentIdIndex.get(`${userType}:${userId}:1`);
  if (assessmentId === undefined) {
    throw new Error(`mapScoreToRow: assessment nao encontrado ${userType}:${userId}:1`);
  }
  const perf = (r.perfilComportamental as string | null) ?? null;
  const vetorDom = (r.vetorDominante as string | null) ?? null;
  const top3 = (r.top3 as unknown) ?? null;
  const flags = (r.flags as unknown) ?? null;
  const scores = (r.scores as Record<string, number> | undefined) ?? {};
  const dec = (k: string): string => {
    const v = scores[k];
    return typeof v === 'number' ? v.toFixed(2) : '50.00';
  };
  const calculadoEm = new Date('2026-02-15T10:00:00.000Z');
  return {
    companyId: NATIVA_COMPANY_ID,
    userType,
    userId,
    assessmentId,
    tentativa: 1,
    post_assert: dec('post_assert'),
    post_tarefas: dec('post_tarefas'),
    post_pessoas: dec('post_pessoas'),
    post_pressao: dec('post_pressao'),
    est_abert: dec('est_abert'),
    est_disc: dec('est_disc'),
    est_ext: dec('est_ext'),
    est_amab: dec('est_amab'),
    est_estab: dec('est_estab'),
    mot_maestria: dec('mot_maestria'),
    mot_lideranca: dec('mot_lideranca'),
    mot_autonomia: dec('mot_autonomia'),
    mot_seguranca: dec('mot_seguranca'),
    mot_proposito: dec('mot_proposito'),
    equ_autocons: dec('equ_autocons'),
    equ_autogest: dec('equ_autogest'),
    equ_leitura: dec('equ_leitura'),
    equ_influencia: dec('equ_influencia'),
    equ_indice: dec('equ_indice'),
    ass_sabed: dec('ass_sabed'),
    ass_coragem: dec('ass_coragem'),
    ass_humanid: dec('ass_humanid'),
    ass_justica: dec('ass_justica'),
    ass_temper: dec('ass_temper'),
    ass_transc: dec('ass_transc'),
    perfilComportamental: perf,
    vetorDominante: vetorDom,
    vetorSustentacao: null,
    vetorNegligenciado: null,
    top3Assinatura: top3,
    flags,
    resumoJson: null,
    expandidoJson: null,
    createdAt: calculadoEm,
    updatedAt: calculadoEm,
  };
}

function mapPerfMensalToRow(r: Record<string, unknown>) {
  const mes = r.mes as string;
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: r.employeeId as number,
    mes,
    custoTotalMes: (r.custoTotalMes as number).toFixed(2),
    faltas: r.faltas as number,
    diasUteis: 22,
    assiduidade: (r.assiduidade as number).toFixed(2),
    indiceDesempenho: (r.indiceDesempenho as number).toFixed(4),
    createdAt: new Date(`${mes}-11T00:00:00.000Z`),
  };
}

function mapPerfTrimToRow(r: Record<string, unknown>) {
  const trim = r.trimestre as string;
  const [ano, qStr] = trim.split('-Q');
  const q = parseInt(qStr!, 10);
  const mesFim = q * 3;
  const anoFech = mesFim === 12 ? parseInt(ano!, 10) + 1 : parseInt(ano!, 10);
  const mesFech = mesFim === 12 ? 1 : mesFim + 1;
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: r.employeeId as number,
    trimestre: trim,
    indiceDesempenho: r.indiceDesempenho ? (r.indiceDesempenho as number).toFixed(4) : null,
    scoreDesempenho: r.scoreDesempenho ? (r.scoreDesempenho as number).toFixed(2) : null,
    capacidadeOciosa: r.capacidadeOciosa != null ? (r.capacidadeOciosa as number).toFixed(2) : null,
    faixaDesempenho: (r.faixaDesempenho ?? null) as 'baixo' | 'medio' | 'alto' | null,
    custoMedioTrimestral: (r.custoMedioTrimestral as number).toFixed(2),
    metaROI: (r.metaROI as number).toFixed(2),
    retornoPotencial: r.retornoPotencial != null ? (r.retornoPotencial as number).toFixed(2) : null,
    participacao: r.participacao != null ? (r.participacao as number).toFixed(6) : null,
    retornoEstimado: r.retornoEstimado != null ? (r.retornoEstimado as number).toFixed(2) : null,
    roiEstimado: r.roiEstimado != null ? (r.roiEstimado as number).toFixed(4) : null,
    percMetaAtingida: r.percMetaAtingida != null ? (r.percMetaAtingida as number).toFixed(2) : null,
    createdAt: new Date(`${anoFech}-${String(mesFech).padStart(2, '0')}-11T00:00:00.000Z`),
  };
}

function mapInstAToRow(r: Record<string, unknown>, idx: EmployeeIdIndex) {
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: resolveEmployeeId(r.nome as string, idx),
    trimestre: r.trimestre as string,
    dimensao: (r.dimensao ?? 1) as number,
    itemIndex: r.itemIndex as number,
    valor: r.valor as number,
  };
}

/**
 * Schema instrumentC_assessments (tables.ts:512-539): sem discriminador
 * `liderType` — apenas `liderId` (employee.id) e `clevelId` (cLevelMembers.id),
 * exatamente um preenchido por linha. O JSON de fixture provavelmente traz
 * apenas `liderId` numerico + `liderType` string ('employee'|'clevel') para
 * roteamento canonico.
 */
function mapInstCToRow(r: Record<string, unknown>, idx: EmployeeIdIndex) {
  const tipoLider = ((r.tipo_lider as string) ?? 'employee') as 'employee' | 'clevel';
  const nomeLider = r.nome_lider as string;
  const liderIdRaw =
    tipoLider === 'employee' ? resolveEmployeeId(nomeLider, idx) : resolveCLevelId(nomeLider, idx);
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: resolveEmployeeId(r.nome_liderado as string, idx),
    liderId: tipoLider === 'employee' ? liderIdRaw : null,
    clevelId: tipoLider === 'clevel' ? liderIdRaw : null,
    trimestre: r.trimestre as string,
    dimensao: (r.dimensao ?? 1) as number,
    itemIndex: r.itemIndex as number,
    valor: r.valor as number,
  };
}

function mapPlenitudeToRow(r: Record<string, unknown>) {
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: r.employeeId as number,
    trimestre: r.trimestre as string,
    scoreA: (r.scoreA as number).toFixed(2),
    scoreC: (r.scoreC as number).toFixed(2),
    plenitudeScore: (r.plenitudeScore as number).toFixed(2),
    faixaPlenitude: (r.faixaPlenitude ?? 'media') as 'baixa' | 'media' | 'alta',
    divergencia: (r.divergencia as number).toFixed(2),
    alertaDivergencia: r.alertaDivergencia as boolean,
    engajamentoA: r.engajamentoA != null ? (r.engajamentoA as number).toFixed(2) : null,
    engajamentoC: r.engajamentoC != null ? (r.engajamentoC as number).toFixed(2) : null,
  };
}

/**
 * Schema nineBoxClassifications: posicaoX ∈ ('baixo','medio','alto') e
 * posicaoY ∈ ('baixa','media','alta'). Quadrantes em maiusculo canonico
 * (`ALTO IMPACTO`, `DESEMPENHO REPRESADO`, etc.).
 */
function mapNineBoxToRow(r: Record<string, unknown>) {
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: r.employeeId as number,
    trimestre: r.trimestre as string,
    scoreDesempenho: (r.scoreDesempenho as number).toFixed(2),
    plenitudeScore: (r.plenitudeScore as number).toFixed(2),
    posicaoX: r.posicaoX as 'baixo' | 'medio' | 'alto',
    posicaoY: r.posicaoY as 'baixa' | 'media' | 'alta',
    quadrante: r.quadrante as
      | 'ALTO IMPACTO'
      | 'DESEMPENHO REPRESADO'
      | 'POTENCIAL SUBUTILIZADO'
      | 'ALTA ENTREGA'
      | 'EQUILÍBRIO FRÁGIL'
      | 'DESEMPENHO CRÍTICO'
      | 'RISCO DE ESGOTAMENTO'
      | 'DESGASTE OCULTO'
      | 'RISCO CRÍTICO',
    quadranteAnterior: (r.quadranteAnterior as string | null) ?? null,
    direcaoMovimento: (r.direcaoMovimento ?? 'primeira_vez') as
      'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez',
  };
}

/**
 * Schema instrumentD_responses (tables.ts:664-695): respondenteId (employees.id)
 * e par liderId/clevelId (um preenchido, outro null). Sem discriminadores.
 */
function mapInstDToRow(r: Record<string, unknown>, idx: EmployeeIdIndex) {
  const liderTipo = ((r.liderTipo as string) ?? 'employee') as 'employee' | 'clevel';
  const nomeLider = r.lider as string;
  const liderIdRaw =
    liderTipo === 'employee' ? resolveEmployeeId(nomeLider, idx) : resolveCLevelId(nomeLider, idx);
  return {
    companyId: NATIVA_COMPANY_ID,
    respondenteId: resolveEmployeeId(r.respondente as string, idx),
    liderId: liderTipo === 'employee' ? liderIdRaw : null,
    clevelId: liderTipo === 'clevel' ? liderIdRaw : null,
    trimestre: r.trimestre as string,
    dimensao: (r.dimensao ?? 1) as number,
    itemIndex: r.itemIndex as number,
    valor: r.valor as number,
    versaoInstrumento: 1,
  };
}

/**
 * Schema iqlData (tables.ts:697-720): par liderId/clevelId + 4 scores parciais
 * + iql + countRespondentes/countRespondentesElegiveis. Sem faixaIql nem
 * dadosSuficientes.
 */
function mapIqlToRow(r: Record<string, unknown>, idx: EmployeeIdIndex) {
  const liderTipo = ((r.liderTipo as string) ?? 'employee') as 'employee' | 'clevel';
  const nomeLider = r.lider as string;
  const liderIdRaw =
    liderTipo === 'employee' ? resolveEmployeeId(nomeLider, idx) : resolveCLevelId(nomeLider, idx);
  const iql = r.iql != null ? (r.iql as number).toFixed(2) : null;
  // 4 scores parciais: fixture pode nao trazer — usamos iql como fallback bit-exact.
  const parcial = iql ?? null;
  return {
    companyId: NATIVA_COMPANY_ID,
    liderId: liderTipo === 'employee' ? liderIdRaw : null,
    clevelId: liderTipo === 'clevel' ? liderIdRaw : null,
    trimestre: r.trimestre as string,
    scoreDirecionamentoClareza:
      (r.scoreDirecionamentoClareza as number | undefined)?.toFixed(2) ?? parcial,
    scoreDesenvolvimentoApoio:
      (r.scoreDesenvolvimentoApoio as number | undefined)?.toFixed(2) ?? parcial,
    scoreRelacionamentoConfianca:
      (r.scoreRelacionamentoConfianca as number | undefined)?.toFixed(2) ?? parcial,
    scoreGestaoResultados: (r.scoreGestaoResultados as number | undefined)?.toFixed(2) ?? parcial,
    iql,
    countRespondentes: r.countRespondentes as number,
    countRespondentesElegiveis: r.countRespondentes as number,
  };
}

/**
 * Schema copsoqCycles (tables.ts:962-1018): usa `ciclo` (nao `nome`),
 * `dataAbertura`/`dataFechamento` como date, sem `adesao_pct`, sem
 * `countElegiveis`/`countRespondentesEfetivos`.
 */
function mapNr1CycleToRow(r: Record<string, unknown>) {
  return {
    companyId: NATIVA_COMPANY_ID,
    ciclo: r.nome as string,
    dataAbertura: toDate(r.dataAbertura as string),
    dataFechamento: toDate(r.dataFechamento as string),
    status: r.status as 'agendado' | 'aberto' | 'fechado',
    departamentosAmostraInsuficiente: r.departamentosAmostraInsuficiente,
    createdAt: new Date(String(r.dataAbertura) + 'T00:00:00.000Z'),
  };
}

/**
 * Schema copsoqCycleSnapshot (tables.ts:1020-1049): cicloDbId (FK), companyId,
 * employeeId direto (sem userType), departamentoId (FK opcional), respondeu.
 */
function mapNr1SnapToRow(r: Record<string, unknown>, cicloDbId: number, idx: EmployeeIdIndex) {
  const userType = ((r.userType as string) ?? 'employee') as 'employee' | 'clevel';
  const userId = r.userId as number;
  // C-levels nao respondem NR-1 — apenas employees. Fallback: se vier clevel,
  // resolve por lookup (nao deveria acontecer na fixture canonica).
  const employeeId =
    userType === 'employee' ? userId : resolveEmployeeId(String(r.nome ?? ''), idx);
  return {
    cicloDbId,
    companyId: NATIVA_COMPANY_ID,
    employeeId,
    departamentoId: null,
    respondeu: true,
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
  };
}

/**
 * Schema copsoq_responses (tables.ts:1051-1077): cicloDbId, companyId,
 * employeeId, fator (tinyint), itemIndex, valor, versaoInstrumento (varchar).
 * Sem `userType` — apenas employees respondem NR-1.
 */
function mapNr1RespToRow(r: Record<string, unknown>, cicloDbId: number, idx: EmployeeIdIndex) {
  const userType = ((r.userType as string) ?? 'employee') as 'employee' | 'clevel';
  const userId = r.userId as number;
  const employeeId =
    userType === 'employee' ? userId : resolveEmployeeId(String(r.nome ?? ''), idx);
  // JSON traz itemIndex global (1..32); schema exige itemIndex local ao fator
  // (BETWEEN 1 AND 4). Conversao: ((global - 1) % 4) + 1.
  const itemIndexGlobal = r.itemIndex as number;
  const itemIndexLocal = ((itemIndexGlobal - 1) % 4) + 1;
  return {
    cicloDbId,
    companyId: NATIVA_COMPANY_ID,
    employeeId,
    fator: r.fatorNum as number,
    itemIndex: itemIndexLocal,
    valor: r.valor as number,
    versaoInstrumento: 'placeholder_MVP_v1',
  };
}

/**
 * Schema copsoqFactorScores (tables.ts:1079-1111): escopo enum
 * ('empresa','departamento','agregacao'), escopoDepartamentoId (FK) OU
 * escopoNomeAgregacao (varchar), fator (tinyint), score (decimal),
 * countRespondentes.
 */
function mapNr1FactToRow(r: Record<string, unknown>, cicloDbId: number) {
  const escopo = ((r.escopo as string) ?? 'empresa') as 'empresa' | 'departamento' | 'agregacao';
  const departamentoNome = (r.departamentoNome as string | null) ?? null;
  return {
    cicloDbId,
    companyId: NATIVA_COMPANY_ID,
    escopo,
    escopoDepartamentoId: null,
    escopoNomeAgregacao: escopo === 'empresa' ? null : departamentoNome,
    fator: r.fatorNum as number,
    score: r.score != null ? (r.score as number).toFixed(2) : '0.00',
    countRespondentes: r.countRespondentes as number,
  };
}

/**
 * Schema nr1AreaDivergenceAnalysis (tables.ts:1113-1145): cicloDbId, companyId,
 * escopo, escopoDepartamentoId ou escopoNomeAgregacao, classificacao enum.
 * Nao existem colunas `departamento`, `fatorNum`, `divergencia`, `tipo` isoladas.
 */
function mapNr1DivToRow(r: Record<string, unknown>, cicloDbId: number) {
  const departamento = r.departamento as string;
  const tipo = r.tipo as string;
  const classificacao =
    tipo === 'critica'
      ? ('divergencia_critica' as const)
      : tipo === 'positiva'
        ? ('divergencia_positiva' as const)
        : ('convergente' as const);
  return {
    cicloDbId,
    companyId: NATIVA_COMPANY_ID,
    escopo: 'departamento' as const,
    escopoDepartamentoId: null,
    escopoNomeAgregacao: departamento,
    classificacao,
    fatoresDivergentesCriticos: classificacao === 'divergencia_critica' ? [r.fatorNum] : null,
    fatoresDivergentesPositivos: classificacao === 'divergencia_positiva' ? [r.fatorNum] : null,
  };
}

/**
 * Schema employeeTerminationEvents (tables.ts:1473-1498): campo unico
 * `actorTipo` ∈ ('employee','superAdmin') + `actorId`. Sem
 * actorSuperAdminId/actorEmployeeId separados.
 */
function mapTerminationToRow(r: Record<string, unknown>) {
  const actorId = (r.actorId as number | undefined) ?? NATIVA_SUPER_ADMIN_ID;
  const actorTipo = r.actorId != null ? ('employee' as const) : ('superAdmin' as const);
  return {
    companyId: NATIVA_COMPANY_ID,
    employeeId: r.employeeId as number,
    dataInativacao: new Date(String(r.dataInativacao) + 'T00:00:00.000Z'),
    motivo: r.motivo as 'voluntario' | 'involuntario',
    nivelHierarquicoSnapshot: r.nivelHierarquicoSnapshot as NivelHierarquico,
    departamentoSnapshot: mapDepartamentoInterno(r.departamentoSnapshot as string),
    actorTipo,
    actorId,
    createdAt: new Date(String(r.createdAt) + 'T00:00:00.000Z'),
  };
}

/** Mapping canonico dos codigos internos do MD (DIR/FIN/etc) para o enum canonico. */
function mapDepartamentoInterno(codigo: string): string {
  const mapa: Record<string, string> = {
    DIR: 'Diretoria',
    FIN: 'Financeiro',
    ADM: 'Administrativo',
    QUA: 'Qualidade',
    PRO: 'Produção',
    LOG: 'Logística',
    COM: 'Comercial',
    RH: 'Recursos Humanos',
  };
  return mapa[codigo] ?? codigo;
}
