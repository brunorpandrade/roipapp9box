// ROIP APP 9BOX — orquestrador canonico do seed operacional Bebidas
// Ubatuba, Dispatch 2 (ME-080e D2). Popula tres tabelas do performance
// trio:
//   1. performanceData (1210) — desbloqueia dashboards operacionais
//      (custos mensais, faltas, assiduidade, indice de desempenho).
//   2. performanceVariableData (4840) — desbloqueia dashboard individual
//      secao "Desempenho x Meta" (junto com employeeGoals do D1).
//   3. performanceQuarterlyData (415) — desbloqueia executive report
//      ROI trimestral.
//
// Volume total canonico bit-exact: 6465 rows.
//
// Idempotencia canonica (D2.5 aprovado, padrao S299 granular): cada
// tabela verificada independentemente via JOIN com employees WHERE
// companyId=UBATUBA_COMPANY_ID. Se count >= 1, skip; se count == 0,
// INSERT. Retomada parcial cirurgica possivel em caso de erro.
//
// Ordem canonica INSERT (D2.4 aprovado):
//   1. performanceData — depende de employees, companies (ambos ja
//      presentes desde ME-080b).
//   2. SELECT dos ids recem-inseridos para construir indice
//      {employeeId:mes -> performanceDataId}. Nativa faz isso na linha
//      407 do loadFixtures.ts (padrao canonico consolidado).
//   3. performanceVariableData — usa indice acima para preencher FK
//      cascade `performanceDataId`.
//   4. performanceQuarterlyData — independente (FK direta em employees
//      + companies).
//
// Pre-condicoes assumidas (verificadas antes do INSERT):
//   - companies WHERE id=UBATUBA_COMPANY_ID existe (seed estrutural
//     ME-080b executado). Sem ela, throw canonico.
//
// RV-11: banco MySQL real via `db` injetada.
// RV-12: 100% Drizzle tipado. Zero SQL cru.
// RV-13: chamado por scripts/seed-ubatuba-operacional-d2.ts + testes.
// RV-14: um statement por linha, largura <= 100 colunas.

import { eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import {
  companies,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../schema';

import { UBATUBA_COMPANY_ID } from './constants';
import {
  UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO,
  deriveUbatubaPerformanceData,
  deriveUbatubaPerformanceVariables,
} from './deriveUbatubaPerformanceData';
import {
  UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO,
  deriveUbatubaPerformanceQuarterlyData,
} from './deriveUbatubaPerformanceQuarterlyData';

/**
 * Re-exports canonicos dos totais das 3 tabelas D2. Os derivadores sao
 * a fonte da verdade; o orquestrador reexporta para ponto unico de
 * import por consumidores externos (testes de integracao).
 */
export {
  UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO,
};

/**
 * Contrato do resultado do seed operacional D2.
 */
export interface SeedUbatubaOperacionalD2Result {
  readonly applied: boolean;
  readonly counts: Record<string, number>;
  readonly skippedTables: readonly string[];
  readonly reason?: string;
}

/**
 * Erro canonico lancado quando alguma pre-condicao estrutural nao esta
 * satisfeita antes de aplicar o seed operacional D2.
 */
export class UbatubaOperacionalD2PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UbatubaOperacionalD2PreconditionError';
  }
}

/**
 * Verifica que a empresa Ubatuba existe. Sem ela, o seed estrutural
 * (ME-080b) nao rodou nesta base — abortar antes de qualquer INSERT.
 */
async function ensureUbatubaCompanyExists(db: RoipDatabase): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, UBATUBA_COMPANY_ID));
  if (rows.length === 0) {
    throw new UbatubaOperacionalD2PreconditionError(
      `Bebidas Ubatuba (companies.id=${UBATUBA_COMPANY_ID}) nao encontrada. ` +
        `Rode 'npm run seed:ubatuba' primeiro (seed estrutural ME-080b).`,
    );
  }
}

/**
 * Conta rows de uma tabela filtradas por employees.companyId da
 * Ubatuba. Usado para idempotencia por tabela.
 */
async function countUbatubaPerformanceData(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(performanceData)
    .where(eq(performanceData.companyId, UBATUBA_COMPANY_ID));
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

async function countUbatubaPerformanceVariable(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(performanceVariableData)
    .innerJoin(performanceData, eq(performanceData.id, performanceVariableData.performanceDataId))
    .where(eq(performanceData.companyId, UBATUBA_COMPANY_ID));
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

async function countUbatubaPerformanceQuarterly(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.companyId, UBATUBA_COMPANY_ID));
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

/**
 * Executa o seed operacional D2 canonico bit-exact da Bebidas Ubatuba.
 * Idempotente por tabela.
 *
 * @param db cliente Drizzle canonico.
 * @returns objeto com { applied, counts, skippedTables }.
 * @throws UbatubaOperacionalD2PreconditionError se companies.id=2 nao existe.
 */
export async function seedUbatubaOperacionalD2(
  db: RoipDatabase,
): Promise<SeedUbatubaOperacionalD2Result> {
  await ensureUbatubaCompanyExists(db);

  const counts: Record<string, number> = {};
  const skippedTables: string[] = [];

  // -----------------------------------------------------------------
  // 1. performanceData (1210 rows)
  // -----------------------------------------------------------------
  const perfDataExisting = await countUbatubaPerformanceData(db);
  let perfDataApplied = false;
  if (perfDataExisting > 0) {
    skippedTables.push('performanceData');
  } else {
    const rows = deriveUbatubaPerformanceData();
    if (rows.length !== UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD2: performanceData contagem quebrada — ` +
          `esperado ${UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO}, derivado ${rows.length}.`,
      );
    }
    // INSERT em batches para MySQL max_allowed_packet — 1210 rows sao
    // pequenas o suficiente para caber em um unico INSERT, mesmo assim
    // dividir em blocos de 500 e defensivo canonico (proximos dispatches
    // podem ter volumes maiores). Aqui, batch unico e suficiente.
    await db.insert(performanceData).values([...rows]);
    counts.performanceData = rows.length;
    perfDataApplied = true;
  }

  // -----------------------------------------------------------------
  // 2. performanceVariableData (4840 rows) — FK cascade em performanceData
  // -----------------------------------------------------------------
  const perfVarExisting = await countUbatubaPerformanceVariable(db);
  if (perfVarExisting > 0) {
    skippedTables.push('performanceVariableData');
  } else {
    // Constroi indice {employeeId:mes -> performanceDataId} a partir das
    // rows presentes no banco (recem-inseridas OU pre-existentes de uma
    // execucao previa parcial). Filtra por companyId=UBATUBA_COMPANY_ID
    // para nao contaminar com IDs Nativa.
    const idRows = await db
      .select({
        id: performanceData.id,
        employeeId: performanceData.employeeId,
        mes: performanceData.mes,
      })
      .from(performanceData)
      .where(eq(performanceData.companyId, UBATUBA_COMPANY_ID));
    if (idRows.length !== UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD2: performanceData Ubatuba tem ${idRows.length} rows; ` +
          `esperado ${UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO} antes de derivar variables.`,
      );
    }
    const perfDataIdIndex = new Map<string, number>();
    for (const p of idRows) {
      perfDataIdIndex.set(`${p.employeeId}:${p.mes}`, p.id);
    }
    const varRows = deriveUbatubaPerformanceVariables(perfDataIdIndex);
    if (varRows.length !== UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD2: performanceVariableData contagem quebrada — ` +
          `esperado ${UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO}, ` +
          `derivado ${varRows.length}.`,
      );
    }
    // 4840 rows: split em batches de 1000 por defesa contra
    // max_allowed_packet default do MySQL. Padrao canonico defensivo.
    const BATCH_SIZE = 1000;
    for (let i = 0; i < varRows.length; i += BATCH_SIZE) {
      const batch = varRows.slice(i, i + BATCH_SIZE);
      await db.insert(performanceVariableData).values(batch);
    }
    counts.performanceVariableData = varRows.length;
  }

  // -----------------------------------------------------------------
  // 3. performanceQuarterlyData (415 rows) — independente
  // -----------------------------------------------------------------
  const perfQuarterlyExisting = await countUbatubaPerformanceQuarterly(db);
  if (perfQuarterlyExisting > 0) {
    skippedTables.push('performanceQuarterlyData');
  } else {
    const rows = deriveUbatubaPerformanceQuarterlyData();
    if (rows.length !== UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD2: performanceQuarterlyData contagem quebrada — ` +
          `esperado ${UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO}, ` +
          `derivado ${rows.length}.`,
      );
    }
    await db.insert(performanceQuarterlyData).values([...rows]);
    counts.performanceQuarterlyData = rows.length;
  }

  // Nota: perfDataApplied usado como sanity guard — se performanceData
  // foi aplicada agora mas variables foi skipped, algo esta inconsistente
  // (INSERT parcial passado). Log apenas, nao aborta — idempotencia
  // ja lida com o skip.
  if (perfDataApplied && perfVarExisting > 0) {
    console.warn(
      `[seedUbatubaOperacionalD2] Estado inconsistente detectado: ` +
        `performanceData vazia mas performanceVariableData preenchida. ` +
        `Inspecionar retomada parcial de dispatch anterior.`,
    );
  }

  const applied = Object.keys(counts).length > 0;
  const result: SeedUbatubaOperacionalD2Result = {
    applied,
    counts,
    skippedTables: Object.freeze(skippedTables),
    reason: applied
      ? undefined
      : `Todas as tabelas D2 ja semeadas em Ubatuba. Nenhum INSERT aplicado.`,
  };
  return result;
}

/**
 * Total canonico bit-exact esperado apos D2 aplicado do zero
 * (1210 + 4840 + 415 = 6465). Guard-check invariante em runtime
 * abaixo — se algum derivador desincroniza, lanca antes do INSERT.
 */
export const UBATUBA_OPERACIONAL_D2_TOTAL_ESPERADO = 6465 as const;
if (
  UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO +
    UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO +
    UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO !==
  UBATUBA_OPERACIONAL_D2_TOTAL_ESPERADO
) {
  throw new Error(
    `UBATUBA_OPERACIONAL_D2_TOTAL_ESPERADO invariante quebrado: ` +
      `${UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO} + ` +
      `${UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO} + ` +
      `${UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO} != ` +
      `${UBATUBA_OPERACIONAL_D2_TOTAL_ESPERADO}`,
  );
}
