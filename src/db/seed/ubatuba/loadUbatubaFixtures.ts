// ROIP APP 9BOX — orquestrador canonico do seed Bebidas Ubatuba Ltda.
// (ME-080b Dispatch 5, companies.id=2).
//
// Estrategia canonica: clone estrutural da Nativa Alimentos com identidade
// propria (CNPJ, razao social, endereco, contatos, encarregado LGPD, CPFs,
// emails) + as atualizacoes do Dispatch 5 (matricula, senha individual
// determinstica, 4 tabelas novas: climateEngagementData, dataAccessLog,
// notifications, alerts).
//
// Escopo do Dispatch 5 (canonizado por Bruno em 15/08/2026):
// TABELAS POPULADAS (14):
//   1. companies (1) — UBATUBA_COMPANY_ROW
//   2. cLevelMembers (3) — IDs 4-6, senha individual, matricula
//   3. employees (66) — IDs 70-135, senha individual condicional, matricula
//   4. companyJobFamilies (20) — reuso deriveCompanyJobFamilies(2, 1)
//   5. companyMonthlyData (24) — reuso deriveCompanyMonthlyData(2)
//   6. monthlyClosureStatus (24) — reuso deriveMonthlyClosureStatus(2)
//   7. companyEconomicDiagnosis (8) — reuso deriveEconomicDiagnosis(2)
//   8. cycleSchedule (5) — reuso deriveCycleSchedule(2)
//   9. lgpdConsents (14) — deriva de Ubatuba employees/cLevels com shift
//  10. responsavelFinanceiroTransferLog (2) — shift dos IDs Nativa
//  11. climateEngagementData (84) — NOVO derivador
//  12. dataAccessLog (200) — NOVO derivador
//  13. alerts (13) — NOVO derivador
//  14. notifications (92) — NOVO derivador (alertId FK -> alerts.id)
//
// TABELAS FORA DO ESCOPO desta ME (registradas como BACKLOG-07 a BACKLOG-13):
// employeeGoals, employeeLeaderHistory, individualProfilePlaceholders/
// Assessments/Scores, performanceData/VariableData/QuarterlyData,
// instrumentA/C/D_responses/assessments, plenitudeData, nineBoxClassifications,
// iqlData, copsoqCycles/CycleSnapshot/responses/FactorScores,
// nr1AreaDivergenceAnalysis, employeeTerminationEvents.
// Motivo canonico: essas 22 tabelas dependem de JSONs pinados por SHA-256
// (~30k linhas) com userId/employeeId hardcoded 1..69. Aplicar shift +3/+66
// em cada mapper exige ~800 linhas adicionais de codigo de shift; extrapola
// o escopo aprovado do Dispatch 5. Serao clonadas em ME futura.
//
// Idempotencia: SELECT companies WHERE id=UBATUBA_COMPANY_ID antes de qualquer
// INSERT; se existe, retorna { applied: false, reason }. Padrao S299 preservado
// (mesmo padrao de seedNativa).
//
// RV-13: chamador canonico via `scripts/seed-ubatuba.mjs` + testes.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import type { Departamento, JobFamily } from '../../schema/enums';
import {
  alerts,
  cLevelMembers,
  climateEngagementData,
  companies,
  companyEconomicDiagnosis,
  companyJobFamilies,
  companyMonthlyData,
  cycleSchedule,
  dataAccessLog,
  employees,
  lgpdConsents,
  monthlyClosureStatus,
  notifications,
  responsavelFinanceiroTransferLog,
} from '../../schema';
import {
  deriveCompanyJobFamilies,
  deriveCompanyMonthlyData,
  deriveCycleSchedule,
  deriveEconomicDiagnosis,
  deriveMonthlyClosureStatus,
  deriveRfTransferLog,
  NATIVA_CLOSURE_STATUS_COUNT,
  NATIVA_COMPANY_JOB_FAMILIES_COUNT,
  NATIVA_CYCLE_SCHEDULE_COUNT,
  NATIVA_ECONOMIC_DIAGNOSIS_COUNT,
  NATIVA_MONTHLY_DATA_COUNT,
  NATIVA_RF_LOG_COUNT,
} from '../nativa/deriveMisc';
import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_COMPANY_ROW,
  UBATUBA_EMPLOYEE_ID_SHIFT,
  UBATUBA_LGPD_TERM_VERSION,
  UBATUBA_SUPER_ADMIN_ID,
} from './constants';
import { deriveAlerts, UBATUBA_ALERTS_TOTAL_ESPERADO } from './deriveAlerts';
import { deriveClimateEngagementData } from './deriveClimateEngagementData';
import { deriveDataAccessLog, UBATUBA_DAL_TOTAL_ESPERADO } from './deriveDataAccessLog';
import { deriveNotifications, UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO } from './deriveNotifications';
import { deriveUbatubaCLevels } from './deriveUbatubaCLevels';
import { deriveUbatubaEmployees, type PasswordHasher } from './deriveUbatubaEmployees';

/**
 * Volume canonico esperado de climateEngagementData (RV-15, medido).
 *
 * Formula canonica bit-exact:
 *   - escopo empresa: 1 × 4 trimestres = 4
 *   - escopo departamento: 6 deptos × 4 trimestres = 24
 *     (Producao, Comercial, Logistica, Financeiro, Administrativo, Qualidade;
 *      RH excluido — apenas 3 employees, nao gera climate agregado nesta ME)
 *   - escopo equipe: 9 lideres unicos × 4 trimestres = 36
 *   Total: 4 + 24 + 36 = 64
 */
export const UBATUBA_CLIMATE_TOTAL_ESPERADO = 64 as const;

/**
 * Re-exports canonicos dos totais das 4 tabelas novas (Dispatch 5). Os
 * derivadores sao a fonte da verdade; o orquestrador reexporta para que
 * consumidores externos (testes de integracao) tenham um ponto unico de
 * import. Evita drift silencioso entre derivador e teste.
 */
export {
  UBATUBA_ALERTS_TOTAL_ESPERADO,
  UBATUBA_DAL_TOTAL_ESPERADO,
  UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO,
};

/** Contagem total canonica de LGPD consents (3 C-levels + 11 acessos employee ativos). */
export const UBATUBA_LGPD_CONSENTS_TOTAL_ESPERADO = 14 as const;

/** Contagem canonica de employees Ubatuba (mesma da Nativa). */
export const UBATUBA_EMPLOYEE_COUNT = 66 as const;

/** Contagem canonica de C-levels Ubatuba (mesma da Nativa). */
export const UBATUBA_CLEVEL_COUNT = 3 as const;

/** Contrato do resultado do seed. */
export interface SeedUbatubaResult {
  readonly applied: boolean;
  readonly reason?: string;
  readonly counts?: Record<string, number>;
}

/** Contrato do wrapper de hash bcrypt (injecao para testes). */
export interface SeedUbatubaOptions {
  readonly hashPassword: PasswordHasher;
}

/**
 * Converte string ISO 'YYYY-MM-DD' para Date UTC 00:00. Espelha `toDate` do
 * loadFixtures Nativa (mesmo comportamento canonico).
 */
function toDate(iso: string): Date {
  return new Date(iso + 'T00:00:00.000Z');
}

/**
 * Executa o seed canonico bit-exact da Bebidas Ubatuba Ltda. Idempotente:
 * se companies.id=UBATUBA_COMPANY_ID ja existe, retorna sem tocar a base.
 *
 * @param db     cliente Drizzle canonico.
 * @param opts   hasher bcrypt (injecao para testes).
 * @returns objeto com { applied, counts } ou { applied: false, reason }.
 */
export async function seedUbatuba(
  db: RoipDatabase,
  opts: SeedUbatubaOptions,
): Promise<SeedUbatubaResult> {
  // Idempotencia canonica.
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, UBATUBA_COMPANY_ID));
  if (existing.length > 0) {
    return {
      applied: false,
      reason: `Bebidas Ubatuba Ltda. (id=${UBATUBA_COMPANY_ID}) ja existe. Seed nao reaplicado.`,
    };
  }

  const counts: Record<string, number> = {};

  // ---------------------------------------------------------------------
  // 1. companies (1)
  // ---------------------------------------------------------------------
  const companyRow = {
    ...UBATUBA_COMPANY_ROW,
    kickoffDate: toDate(UBATUBA_COMPANY_ROW.kickoffDate),
  };
  await db.insert(companies).values(companyRow);
  counts.companies = 1;

  // ---------------------------------------------------------------------
  // 2. cLevelMembers (3, IDs 4-6)
  // ---------------------------------------------------------------------
  const cLevelsDerived = deriveUbatubaCLevels();
  const cLevelRows = cLevelsDerived.map((cl) => ({
    id: cl.id,
    companyId: cl.companyId,
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
    // C-levels sempre recebem passwordHash + matricula individual em Ubatuba.
    // passwordSet=false (gate primeiro acesso obriga troca).
    passwordHash: null as string | null, // preenchido abaixo apos hash
    passwordSet: false,
    matricula: null as string | null, // preenchido abaixo
    createdAt: toDate(cl.dataAdmissao),
  }));
  // Hash das senhas dos C-levels + geracao de matriculas dedicadas.
  // Reusamos os geradores canonicos com seeds dedicadas para C-levels
  // (diferentes das seeds de employees para isolamento).
  const { createMatriculaPrng, generateUniqueMatriculas } =
    await import('../../../lib/auth/matriculaGenerator');
  const { createPasswordPrng, generateInitialPasswords } =
    await import('../../../lib/auth/passwordGenerator');
  const { UBATUBA_MATRICULA_SEED, UBATUBA_PASSWORD_SEED } = await import('./constants');
  const cLevelMatriculaPrng = createMatriculaPrng(UBATUBA_MATRICULA_SEED - 1);
  const cLevelPasswordPrng = createPasswordPrng(UBATUBA_PASSWORD_SEED - 1);
  const cLevelMatriculas = generateUniqueMatriculas(cLevelRows.length, cLevelMatriculaPrng);
  const cLevelSenhas = generateInitialPasswords(cLevelRows.length, cLevelPasswordPrng);
  for (let i = 0; i < cLevelRows.length; i++) {
    const senha = cLevelSenhas[i]!;
    cLevelRows[i]!.passwordHash = await opts.hashPassword(senha);
    cLevelRows[i]!.matricula = cLevelMatriculas[i]!;
  }
  await db.insert(cLevelMembers).values(cLevelRows);
  counts.cLevelMembers = cLevelRows.length;

  // ---------------------------------------------------------------------
  // 3. employees (66, IDs 70-135)
  // ---------------------------------------------------------------------
  const employeesDerived = await deriveUbatubaEmployees({
    hashPassword: opts.hashPassword,
  });
  const employeeRows = employeesDerived.map((e) => ({
    id: e.id,
    companyId: e.companyId,
    name: e.name,
    cpf: e.cpf,
    email: e.email,
    photoUrl: e.photoUrl,
    dataNascimento: toDate(e.dataNascimento),
    dataAdmissao: toDate(e.dataAdmissao),
    cbo: e.cbo,
    descricaoCBO: e.descricaoCBO,
    jobFamily: e.jobFamily,
    senioridade: e.senioridade,
    nivelHierarquico: e.nivelHierarquico,
    departamento: e.departamento,
    status: e.status,
    isRH: e.isRH,
    isLider: e.isLider,
    isResponsavelFinanceiro: e.isResponsavelFinanceiro,
    onboardingEstagio: e.onboardingEstagio,
    passwordHash: e.passwordHash,
    passwordSet: e.passwordSet,
    matricula: e.matricula,
    createdAt: e.createdAt,
  }));
  await db.insert(employees).values(employeeRows);
  counts.employees = employeeRows.length;

  // ---------------------------------------------------------------------
  // 4. companyJobFamilies (20) — reuso Nativa parametrizado.
  // ---------------------------------------------------------------------
  const jobFamilyRows = deriveCompanyJobFamilies(UBATUBA_COMPANY_ID, UBATUBA_SUPER_ADMIN_ID).map(
    (jf) => ({ ...jf, jobFamily: jf.jobFamily as JobFamily }),
  );
  await db.insert(companyJobFamilies).values([...jobFamilyRows]);
  counts.companyJobFamilies = jobFamilyRows.length;
  if (jobFamilyRows.length !== NATIVA_COMPANY_JOB_FAMILIES_COUNT) {
    throw new Error(
      `seedUbatuba: companyJobFamilies contagem inesperada ${jobFamilyRows.length}, ` +
        `esperado ${NATIVA_COMPANY_JOB_FAMILIES_COUNT}.`,
    );
  }

  // ---------------------------------------------------------------------
  // 5. companyMonthlyData (24) — reuso.
  // ---------------------------------------------------------------------
  const monthlyRows = deriveCompanyMonthlyData(UBATUBA_COMPANY_ID);
  await db.insert(companyMonthlyData).values([...monthlyRows]);
  counts.companyMonthlyData = monthlyRows.length;
  if (monthlyRows.length !== NATIVA_MONTHLY_DATA_COUNT) {
    throw new Error(`seedUbatuba: companyMonthlyData contagem inesperada ${monthlyRows.length}.`);
  }

  // ---------------------------------------------------------------------
  // 6. monthlyClosureStatus (24) — reuso.
  // ---------------------------------------------------------------------
  const closureRows = deriveMonthlyClosureStatus(UBATUBA_COMPANY_ID);
  await db.insert(monthlyClosureStatus).values([...closureRows]);
  counts.monthlyClosureStatus = closureRows.length;
  if (closureRows.length !== NATIVA_CLOSURE_STATUS_COUNT) {
    throw new Error(`seedUbatuba: monthlyClosureStatus contagem inesperada ${closureRows.length}.`);
  }

  // ---------------------------------------------------------------------
  // 7. companyEconomicDiagnosis (8) — reuso.
  // ---------------------------------------------------------------------
  const diagRows = deriveEconomicDiagnosis(UBATUBA_COMPANY_ID);
  await db.insert(companyEconomicDiagnosis).values([...diagRows]);
  counts.companyEconomicDiagnosis = diagRows.length;
  if (diagRows.length !== NATIVA_ECONOMIC_DIAGNOSIS_COUNT) {
    throw new Error(
      `seedUbatuba: companyEconomicDiagnosis contagem inesperada ${diagRows.length}.`,
    );
  }

  // ---------------------------------------------------------------------
  // 8. cycleSchedule (5) — reuso.
  // ---------------------------------------------------------------------
  const cycleRows = deriveCycleSchedule(UBATUBA_COMPANY_ID);
  await db.insert(cycleSchedule).values([...cycleRows]);
  counts.cycleSchedule = cycleRows.length;
  if (cycleRows.length !== NATIVA_CYCLE_SCHEDULE_COUNT) {
    throw new Error(`seedUbatuba: cycleSchedule contagem inesperada ${cycleRows.length}.`);
  }

  // ---------------------------------------------------------------------
  // 9. lgpdConsents (14) — deriva de Ubatuba (3 C-levels + 11 acessos employee ativos).
  // ---------------------------------------------------------------------
  const lgpdRows = deriveUbatubaLgpdConsents(
    cLevelsDerived,
    employeesDerived,
    UBATUBA_LGPD_TERM_VERSION,
  );
  await db.insert(lgpdConsents).values([...lgpdRows]);
  counts.lgpdConsents = lgpdRows.length;

  // ---------------------------------------------------------------------
  // 10. responsavelFinanceiroTransferLog (2) — shift dos IDs Nativa.
  // ---------------------------------------------------------------------
  const rfRowsNativa = deriveRfTransferLog(UBATUBA_COMPANY_ID, UBATUBA_SUPER_ADMIN_ID);
  const rfRowsUbatuba = rfRowsNativa.map((r) => ({
    ...r,
    previousHolderId:
      r.previousHolderId === null
        ? null
        : r.previousHolderType === 'cLevel'
          ? r.previousHolderId + UBATUBA_CLEVEL_ID_SHIFT
          : r.previousHolderId + UBATUBA_EMPLOYEE_ID_SHIFT,
    newHolderId:
      r.newHolderId === null
        ? null
        : r.newHolderType === 'cLevel'
          ? r.newHolderId + UBATUBA_CLEVEL_ID_SHIFT
          : r.newHolderId + UBATUBA_EMPLOYEE_ID_SHIFT,
  }));
  await db.insert(responsavelFinanceiroTransferLog).values(rfRowsUbatuba);
  counts.responsavelFinanceiroTransferLog = rfRowsUbatuba.length;
  if (rfRowsUbatuba.length !== NATIVA_RF_LOG_COUNT) {
    throw new Error(
      `seedUbatuba: responsavelFinanceiroTransferLog contagem inesperada ${rfRowsUbatuba.length}.`,
    );
  }

  // ---------------------------------------------------------------------
  // 11. climateEngagementData (84) — NOVO.
  // ---------------------------------------------------------------------
  const climateRows = deriveClimateEngagementData(employeesDerived);
  await db.insert(climateEngagementData).values(climateRows);
  counts.climateEngagementData = climateRows.length;

  // ---------------------------------------------------------------------
  // 12. dataAccessLog (~200) — NOVO.
  // ---------------------------------------------------------------------
  const dalRows = deriveDataAccessLog(employeesDerived, cLevelsDerived);
  await db.insert(dataAccessLog).values(dalRows);
  counts.dataAccessLog = dalRows.length;

  // ---------------------------------------------------------------------
  // 13. alerts (13) — NOVO. INSERT primeiro para obter IDs reais que serao
  //     referenciados por notifications.
  // ---------------------------------------------------------------------
  const alertsRows = deriveAlerts(employeesDerived);
  await db.insert(alerts).values(alertsRows);
  counts.alerts = alertsRows.length;

  // Recupera IDs dos alerts NR-1 recem-inseridos (primeiros 6, ordem canonica
  // do derivador, tipo='nr1_fator_critico'). Necessario para popular
  // notifications.alertId como FK real.
  const nr1AlertsInserted = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(eq(alerts.companyId, UBATUBA_COMPANY_ID));
  const nr1AlertIds = nr1AlertsInserted.slice(0, 6).map((r) => r.id);

  // ---------------------------------------------------------------------
  // 14. notifications (92) — NOVO, com alertId FK.
  // ---------------------------------------------------------------------
  const notifRows = deriveNotifications(employeesDerived, nr1AlertIds);
  await db.insert(notifications).values(notifRows);
  counts.notifications = notifRows.length;

  // ---------------------------------------------------------------------
  // Prova canonica de contagens totais esperadas.
  // ---------------------------------------------------------------------
  if (counts.climateEngagementData !== UBATUBA_CLIMATE_TOTAL_ESPERADO) {
    throw new Error(
      `seedUbatuba: climateEngagementData=${counts.climateEngagementData}, ` +
        `esperado=${UBATUBA_CLIMATE_TOTAL_ESPERADO}.`,
    );
  }
  if (counts.dataAccessLog !== UBATUBA_DAL_TOTAL_ESPERADO) {
    throw new Error(
      `seedUbatuba: dataAccessLog=${counts.dataAccessLog}, ` +
        `esperado=${UBATUBA_DAL_TOTAL_ESPERADO}.`,
    );
  }
  if (counts.alerts !== UBATUBA_ALERTS_TOTAL_ESPERADO) {
    throw new Error(
      `seedUbatuba: alerts=${counts.alerts}, esperado=${UBATUBA_ALERTS_TOTAL_ESPERADO}.`,
    );
  }
  if (counts.notifications !== UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO) {
    throw new Error(
      `seedUbatuba: notifications=${counts.notifications}, ` +
        `esperado=${UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO}.`,
    );
  }

  return { applied: true, counts };
}

// ---------------------------------------------------------------------
// Helper canonico: LGPD consents Ubatuba (3 C-levels + acessos employees).
// ---------------------------------------------------------------------

interface DerivedUbatubaLgpdConsent {
  readonly companyId: number;
  readonly employeeId: number | null;
  readonly clevelId: number | null;
  readonly versaoTermoAceita: string;
  readonly aceitoEm: Date;
  readonly createdAt: Date;
}

function deriveUbatubaLgpdConsents(
  cLevels: ReadonlyArray<{ readonly id: number; readonly dataAdmissao: string }>,
  employeesUb: ReadonlyArray<{
    readonly id: number;
    readonly isLider: boolean;
    readonly isRH: boolean;
    readonly isResponsavelFinanceiro: boolean;
    readonly dataAdmissao: string;
    readonly status: 'ativo' | 'inativo';
  }>,
  termVersion: string,
): DerivedUbatubaLgpdConsent[] {
  const rows: DerivedUbatubaLgpdConsent[] = [];

  // C-levels: todos aceitam.
  for (const cl of cLevels) {
    const aceitoEm = new Date(cl.dataAdmissao + 'T10:00:00.000Z');
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      employeeId: null,
      clevelId: cl.id,
      versaoTermoAceita: termVersion,
      aceitoEm,
      createdAt: aceitoEm,
    });
  }

  // Employees com acesso (lider/RH/RF), ativos, aceitam.
  for (const emp of employeesUb) {
    if (!(emp.isLider || emp.isRH || emp.isResponsavelFinanceiro)) continue;
    if (emp.status !== 'ativo') continue;
    const aceitoEm = new Date(emp.dataAdmissao + 'T10:00:00.000Z');
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      employeeId: emp.id,
      clevelId: null,
      versaoTermoAceita: termVersion,
      aceitoEm,
      createdAt: aceitoEm,
    });
  }

  return rows;
}
