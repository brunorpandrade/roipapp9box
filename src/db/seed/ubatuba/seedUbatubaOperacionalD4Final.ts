// ROIP APP 9BOX — orquestrador canonico do seed operacional Bebidas
// Ubatuba, Dispatch 4-final (ME-080e D4-final). Consolida D4+D5:
// popula 12 tabelas operacionais restantes.
//
// Escopo canonico bit-exact:
//   1. instrumentA_responses (8020)
//   2. instrumentC_assessments (8020)
//   3. instrumentD_responses (4000)
//   4. plenitudeData (401)
//   5. nineBoxClassifications (387)
//   6. iqlData (45)
//   7. copsoqCycles (1)
//   8. copsoqCycleSnapshot (51)
//   9. copsoq_responses (1248)
//  10. copsoqFactorScores (56)
//  11. nr1AreaDivergenceAnalysis (6)
//  12. employeeTerminationEvents (13)
//
// Volume total canonico: 22.252 rows.
//
// Idempotencia canonica granular por tabela via SELECT COUNT WHERE
// companyId=2. Padrao S299 consolidado (D1-D3).
//
// Ordem canonica INSERT respeitando FKs:
//   Blocos independentes: 1-6, 12 (nao dependem de FK cascade externa).
//   Bloco COPSOQ (7-11): copsoqCycles PRIMEIRO, depois SELECT cicloDbId,
//   depois snapshot/responses/factorScores/divergences com FK cascade.
//
// INSERT em batches de 1000 para respostas dos instrumentos (8020,
// 8020, 4000, 1248) — defesa contra max_allowed_packet do MySQL.
//
// Pre-condicoes: companies.id=2 existe (throw canonico se nao).
//
// RV-11/12/13/14 canonicas.

import { eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import {
  companies,
  copsoq_responses,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  employeeTerminationEvents,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentD_responses,
  iqlData,
  nineBoxClassifications,
  nr1AreaDivergenceAnalysis,
  plenitudeData,
} from '../../schema';

import { UBATUBA_COMPANY_ID } from './constants';
import {
  UBATUBA_COPSOQ_CYCLES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO,
  UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO,
  deriveUbatubaCopsoqCycle,
  deriveUbatubaCopsoqFactorScores,
  deriveUbatubaCopsoqResponses,
  deriveUbatubaCopsoqSnapshots,
  deriveUbatubaNr1Divergences,
} from './deriveUbatubaCopsoq';
import {
  UBATUBA_IQL_TOTAL_ESPERADO,
  UBATUBA_NINE_BOX_TOTAL_ESPERADO,
  UBATUBA_PLENITUDE_TOTAL_ESPERADO,
  deriveUbatubaIql,
  deriveUbatubaNineBox,
  deriveUbatubaPlenitude,
} from './deriveUbatubaAggregates';
import {
  UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO,
  deriveUbatubaInstrumentA,
  deriveUbatubaInstrumentC,
  deriveUbatubaInstrumentD,
} from './deriveUbatubaInstruments';
import {
  UBATUBA_TERMINATION_TOTAL_ESPERADO,
  deriveUbatubaTermination,
} from './deriveUbatubaTermination';

/**
 * Re-exports canonicos dos totais das 12 tabelas para consumidores externos.
 */
export {
  UBATUBA_COPSOQ_CYCLES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO,
  UBATUBA_IQL_TOTAL_ESPERADO,
  UBATUBA_NINE_BOX_TOTAL_ESPERADO,
  UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO,
  UBATUBA_PLENITUDE_TOTAL_ESPERADO,
  UBATUBA_TERMINATION_TOTAL_ESPERADO,
};

export interface SeedUbatubaOperacionalD4FinalResult {
  readonly applied: boolean;
  readonly counts: Record<string, number>;
  readonly skippedTables: readonly string[];
  readonly reason?: string;
}

export class UbatubaOperacionalD4FinalPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UbatubaOperacionalD4FinalPreconditionError';
  }
}

async function ensureUbatubaCompanyExists(db: RoipDatabase): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, UBATUBA_COMPANY_ID));
  if (rows.length === 0) {
    throw new UbatubaOperacionalD4FinalPreconditionError(
      `Bebidas Ubatuba (companies.id=${UBATUBA_COMPANY_ID}) nao encontrada. ` +
        `Rode 'npm run seed:ubatuba' primeiro (seed estrutural ME-080b).`,
    );
  }
}

// Helper generico para contagem por companyId em tabelas com esse campo direto.
async function countByCompany(
  db: RoipDatabase,
  table:
    | typeof instrumentA_responses
    | typeof instrumentC_assessments
    | typeof instrumentD_responses
    | typeof plenitudeData
    | typeof nineBoxClassifications
    | typeof iqlData
    | typeof copsoqCycles
    | typeof employeeTerminationEvents,
): Promise<number> {
  // Cada tabela tem coluna companyId; TS infere. Usa raw sql pra COUNT.
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(table)
    .where(eq(table.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

// COPSOQ snapshot/responses/factorScores/divergences precisam de contagem
// via cicloDbId — filtramos por companyId direto (todas tem companyId).
async function countCopsoqSnapshots(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(copsoqCycleSnapshot)
    .where(eq(copsoqCycleSnapshot.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

async function countCopsoqResponses(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(copsoq_responses)
    .where(eq(copsoq_responses.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

async function countCopsoqFactorScores(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(copsoqFactorScores)
    .where(eq(copsoqFactorScores.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

async function countNr1Divergences(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(nr1AreaDivergenceAnalysis)
    .where(eq(nr1AreaDivergenceAnalysis.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

const BATCH_SIZE = 1000;

async function insertInBatches<T>(
  insert: (rows: T[]) => Promise<unknown>,
  rows: readonly T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await insert(chunk as T[]);
  }
}

/**
 * Executa o seed operacional D4-final canonico bit-exact. Idempotente
 * por tabela.
 */
export async function seedUbatubaOperacionalD4Final(
  db: RoipDatabase,
): Promise<SeedUbatubaOperacionalD4FinalResult> {
  await ensureUbatubaCompanyExists(db);

  const counts: Record<string, number> = {};
  const skipped: string[] = [];

  // -----------------------------------------------------------------
  // 1. instrumentA_responses (8020)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, instrumentA_responses)) > 0) {
    skipped.push('instrumentA_responses');
  } else {
    const rows = deriveUbatubaInstrumentA();
    if (rows.length !== UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO) {
      throw new Error(`instrumentA contagem quebrada: ${rows.length}`);
    }
    await insertInBatches((chunk) => db.insert(instrumentA_responses).values(chunk), rows);
    counts.instrumentA_responses = rows.length;
  }

  // -----------------------------------------------------------------
  // 2. instrumentC_assessments (8020)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, instrumentC_assessments)) > 0) {
    skipped.push('instrumentC_assessments');
  } else {
    const rows = deriveUbatubaInstrumentC();
    if (rows.length !== UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO) {
      throw new Error(`instrumentC contagem quebrada: ${rows.length}`);
    }
    await insertInBatches((chunk) => db.insert(instrumentC_assessments).values(chunk), rows);
    counts.instrumentC_assessments = rows.length;
  }

  // -----------------------------------------------------------------
  // 3. instrumentD_responses (4000)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, instrumentD_responses)) > 0) {
    skipped.push('instrumentD_responses');
  } else {
    const rows = deriveUbatubaInstrumentD();
    if (rows.length !== UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO) {
      throw new Error(`instrumentD contagem quebrada: ${rows.length}`);
    }
    await insertInBatches((chunk) => db.insert(instrumentD_responses).values(chunk), rows);
    counts.instrumentD_responses = rows.length;
  }

  // -----------------------------------------------------------------
  // 4. plenitudeData (401)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, plenitudeData)) > 0) {
    skipped.push('plenitudeData');
  } else {
    const rows = deriveUbatubaPlenitude();
    if (rows.length !== UBATUBA_PLENITUDE_TOTAL_ESPERADO) {
      throw new Error(`plenitude contagem quebrada: ${rows.length}`);
    }
    await db.insert(plenitudeData).values([...rows]);
    counts.plenitudeData = rows.length;
  }

  // -----------------------------------------------------------------
  // 5. nineBoxClassifications (387)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, nineBoxClassifications)) > 0) {
    skipped.push('nineBoxClassifications');
  } else {
    const rows = deriveUbatubaNineBox();
    if (rows.length !== UBATUBA_NINE_BOX_TOTAL_ESPERADO) {
      throw new Error(`nineBox contagem quebrada: ${rows.length}`);
    }
    await db.insert(nineBoxClassifications).values([...rows]);
    counts.nineBoxClassifications = rows.length;
  }

  // -----------------------------------------------------------------
  // 6. iqlData (45)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, iqlData)) > 0) {
    skipped.push('iqlData');
  } else {
    const rows = deriveUbatubaIql();
    if (rows.length !== UBATUBA_IQL_TOTAL_ESPERADO) {
      throw new Error(`iqlData contagem quebrada: ${rows.length}`);
    }
    await db.insert(iqlData).values([...rows]);
    counts.iqlData = rows.length;
  }

  // -----------------------------------------------------------------
  // 7-11. COPSOQ bloco (cycle → snapshot/responses/factorScores/divergences)
  // -----------------------------------------------------------------
  // 7. copsoqCycles (1)
  let cicloDbId: number | null = null;
  if ((await countByCompany(db, copsoqCycles)) > 0) {
    skipped.push('copsoqCycles');
    // Recupera cicloDbId existente para uso pelas tabelas subsequentes
    // (caso venham a ser semeadas nesta rodada).
    const [existing] = await db
      .select({ id: copsoqCycles.id })
      .from(copsoqCycles)
      .where(eq(copsoqCycles.companyId, UBATUBA_COMPANY_ID));
    cicloDbId = existing ? existing.id : null;
  } else {
    const cycle = deriveUbatubaCopsoqCycle();
    await db.insert(copsoqCycles).values(cycle);
    counts.copsoqCycles = UBATUBA_COPSOQ_CYCLES_TOTAL_ESPERADO;
    const [inserted] = await db
      .select({ id: copsoqCycles.id })
      .from(copsoqCycles)
      .where(eq(copsoqCycles.companyId, UBATUBA_COMPANY_ID));
    if (!inserted) {
      throw new Error('copsoqCycles: cicloDbId nao encontrado apos INSERT.');
    }
    cicloDbId = inserted.id;
  }

  // 8. copsoqCycleSnapshot (51)
  if ((await countCopsoqSnapshots(db)) > 0) {
    skipped.push('copsoqCycleSnapshot');
  } else {
    if (cicloDbId === null) {
      throw new Error('copsoqCycleSnapshot: cicloDbId indisponivel.');
    }
    const rows = deriveUbatubaCopsoqSnapshots(cicloDbId);
    if (rows.length !== UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO) {
      throw new Error(`copsoqSnapshot contagem quebrada: ${rows.length}`);
    }
    await db.insert(copsoqCycleSnapshot).values([...rows]);
    counts.copsoqCycleSnapshot = rows.length;
  }

  // 9. copsoq_responses (1248)
  if ((await countCopsoqResponses(db)) > 0) {
    skipped.push('copsoq_responses');
  } else {
    if (cicloDbId === null) {
      throw new Error('copsoq_responses: cicloDbId indisponivel.');
    }
    const rows = deriveUbatubaCopsoqResponses(cicloDbId);
    if (rows.length !== UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO) {
      throw new Error(`copsoq_responses contagem quebrada: ${rows.length}`);
    }
    await insertInBatches((chunk) => db.insert(copsoq_responses).values(chunk), rows);
    counts.copsoq_responses = rows.length;
  }

  // 10. copsoqFactorScores (56)
  if ((await countCopsoqFactorScores(db)) > 0) {
    skipped.push('copsoqFactorScores');
  } else {
    if (cicloDbId === null) {
      throw new Error('copsoqFactorScores: cicloDbId indisponivel.');
    }
    const rows = deriveUbatubaCopsoqFactorScores(cicloDbId);
    if (rows.length !== UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO) {
      throw new Error(`copsoqFactorScores contagem quebrada: ${rows.length}`);
    }
    await db.insert(copsoqFactorScores).values([...rows]);
    counts.copsoqFactorScores = rows.length;
  }

  // 11. nr1AreaDivergenceAnalysis (6)
  if ((await countNr1Divergences(db)) > 0) {
    skipped.push('nr1AreaDivergenceAnalysis');
  } else {
    if (cicloDbId === null) {
      throw new Error('nr1AreaDivergenceAnalysis: cicloDbId indisponivel.');
    }
    const rows = deriveUbatubaNr1Divergences(cicloDbId);
    if (rows.length !== UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO) {
      throw new Error(`nr1Divergences contagem quebrada: ${rows.length}`);
    }
    await db.insert(nr1AreaDivergenceAnalysis).values([...rows]);
    counts.nr1AreaDivergenceAnalysis = rows.length;
  }

  // -----------------------------------------------------------------
  // 12. employeeTerminationEvents (13)
  // -----------------------------------------------------------------
  if ((await countByCompany(db, employeeTerminationEvents)) > 0) {
    skipped.push('employeeTerminationEvents');
  } else {
    const rows = deriveUbatubaTermination();
    if (rows.length !== UBATUBA_TERMINATION_TOTAL_ESPERADO) {
      throw new Error(`termination contagem quebrada: ${rows.length}`);
    }
    await db.insert(employeeTerminationEvents).values([...rows]);
    counts.employeeTerminationEvents = rows.length;
  }

  const applied = Object.keys(counts).length > 0;
  return {
    applied,
    counts,
    skippedTables: Object.freeze(skipped),
    reason: applied
      ? undefined
      : `Todas as tabelas D4-final ja semeadas em Ubatuba. Nenhum INSERT aplicado.`,
  };
}

/**
 * Total canonico bit-exact esperado apos D4-final aplicado do zero:
 * 8020+8020+4000+401+387+45+1+51+1248+56+6+13 = 22248 rows.
 */
export const UBATUBA_OPERACIONAL_D4_FINAL_TOTAL_ESPERADO = 22248 as const;
if (
  UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO +
    UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO +
    UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO +
    UBATUBA_PLENITUDE_TOTAL_ESPERADO +
    UBATUBA_NINE_BOX_TOTAL_ESPERADO +
    UBATUBA_IQL_TOTAL_ESPERADO +
    UBATUBA_COPSOQ_CYCLES_TOTAL_ESPERADO +
    UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO +
    UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO +
    UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO +
    UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO +
    UBATUBA_TERMINATION_TOTAL_ESPERADO !==
  UBATUBA_OPERACIONAL_D4_FINAL_TOTAL_ESPERADO
) {
  throw new Error(`UBATUBA_OPERACIONAL_D4_FINAL_TOTAL_ESPERADO invariante quebrado.`);
}
