// ROIP APP 9BOX — orquestrador canonico do seed operacional Bebidas
// Ubatuba, Dispatch 3 (ME-080e D3). Popula perfil individual trio:
//   1. individualProfilePlaceholders (69) — desbloqueia lista de perfis
//      no dashboard RH/lider (badge pendente/respondido).
//   2. individualProfileAssessments (66) — desbloqueia acesso ao
//      questionario respondido.
//   3. individualProfileScores (66) — desbloqueia secao perfil
//      comportamental do dashboard individual (POST, EST, MOT, EQU, ASS).
//
// Volume total canonico bit-exact: 201 rows.
//
// Idempotencia canonica (padrao S299 granular): cada tabela verificada
// independentemente via SELECT COUNT WHERE companyId=2.
//
// Ordem canonica INSERT (D3.4 aprovado):
//   1. individualProfilePlaceholders (69) — sem FK entre irmas.
//   2. individualProfileAssessments (66).
//   3. SELECT ids assessments → indice {userType:userId:tentativa -> id}.
//   4. individualProfileScores (66) — usa indice para FK assessmentId.
//
// Pre-condicoes: companies.id=2 existe.
//
// RV-11/12/13/14 canonicas.

import { and, eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import {
  companies,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../schema';

import { UBATUBA_COMPANY_ID } from './constants';
import {
  UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO,
  deriveUbatubaProfileAssessments,
} from './deriveUbatubaProfileAssessments';
import {
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
  deriveUbatubaProfilePlaceholders,
} from './deriveUbatubaProfilePlaceholders';
import {
  UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO,
  deriveUbatubaProfileScoresSemAssessmentId,
} from './deriveUbatubaProfileScores';

/**
 * Re-exports canonicos dos totais para consumidores externos (testes).
 */
export {
  UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO,
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
  UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO,
};

export interface SeedUbatubaOperacionalD3Result {
  readonly applied: boolean;
  readonly counts: Record<string, number>;
  readonly skippedTables: readonly string[];
  readonly reason?: string;
}

export class UbatubaOperacionalD3PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UbatubaOperacionalD3PreconditionError';
  }
}

async function ensureUbatubaCompanyExists(db: RoipDatabase): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, UBATUBA_COMPANY_ID));
  if (rows.length === 0) {
    throw new UbatubaOperacionalD3PreconditionError(
      `Bebidas Ubatuba (companies.id=${UBATUBA_COMPANY_ID}) nao encontrada. ` +
        `Rode 'npm run seed:ubatuba' primeiro (seed estrutural ME-080b).`,
    );
  }
}

async function countPlaceholders(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(individualProfilePlaceholders)
    .where(eq(individualProfilePlaceholders.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

async function countAssessments(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

async function countScores(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(individualProfileScores)
    .where(eq(individualProfileScores.companyId, UBATUBA_COMPANY_ID));
  return rows[0] ? Number(rows[0].n) : 0;
}

/**
 * Executa o seed operacional D3 canonico bit-exact. Idempotente por
 * tabela.
 */
export async function seedUbatubaOperacionalD3(
  db: RoipDatabase,
): Promise<SeedUbatubaOperacionalD3Result> {
  await ensureUbatubaCompanyExists(db);

  const counts: Record<string, number> = {};
  const skippedTables: string[] = [];

  // -----------------------------------------------------------------
  // 1. individualProfilePlaceholders (69)
  // -----------------------------------------------------------------
  const phExisting = await countPlaceholders(db);
  if (phExisting > 0) {
    skippedTables.push('individualProfilePlaceholders');
  } else {
    const rows = deriveUbatubaProfilePlaceholders();
    if (rows.length !== UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD3: placeholders contagem quebrada — ` +
          `esperado ${UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO}, derivado ${rows.length}.`,
      );
    }
    await db.insert(individualProfilePlaceholders).values([...rows]);
    counts.individualProfilePlaceholders = rows.length;
  }

  // -----------------------------------------------------------------
  // 2. individualProfileAssessments (66)
  // -----------------------------------------------------------------
  const aExisting = await countAssessments(db);
  if (aExisting > 0) {
    skippedTables.push('individualProfileAssessments');
  } else {
    const rows = deriveUbatubaProfileAssessments();
    if (rows.length !== UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD3: assessments contagem quebrada — ` +
          `esperado ${UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO}, derivado ${rows.length}.`,
      );
    }
    await db.insert(individualProfileAssessments).values([...rows]);
    counts.individualProfileAssessments = rows.length;
  }

  // -----------------------------------------------------------------
  // 3. individualProfileScores (66) — FK cascade em assessments
  // -----------------------------------------------------------------
  const sExisting = await countScores(db);
  if (sExisting > 0) {
    skippedTables.push('individualProfileScores');
  } else {
    // Constroi indice {userType:userId:tentativa -> assessmentId} para
    // preencher FK. Filtra por companyId Ubatuba.
    const idRows = await db
      .select({
        id: individualProfileAssessments.id,
        userType: individualProfileAssessments.userType,
        userId: individualProfileAssessments.userId,
        tentativa: individualProfileAssessments.tentativa,
      })
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.companyId, UBATUBA_COMPANY_ID));
    if (idRows.length !== UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD3: assessments Ubatuba tem ${idRows.length} rows; ` +
          `esperado ${UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO} antes de derivar scores.`,
      );
    }
    const assessmentIdIndex = new Map<string, number>();
    for (const a of idRows) {
      assessmentIdIndex.set(`${a.userType}:${a.userId}:${a.tentativa}`, a.id);
    }
    const scoreRowsSemFk = deriveUbatubaProfileScoresSemAssessmentId();
    if (scoreRowsSemFk.length !== UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD3: scores contagem quebrada — ` +
          `esperado ${UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO}, derivado ${scoreRowsSemFk.length}.`,
      );
    }
    const scoreRows = scoreRowsSemFk.map((s) => {
      const key = `${s.userType}:${s.userId}:${s.tentativa}`;
      const assessmentId = assessmentIdIndex.get(key);
      if (assessmentId === undefined) {
        throw new Error(`seedUbatubaOperacionalD3: assessmentId nao encontrado para ${key}.`);
      }
      return { ...s, assessmentId };
    });
    await db.insert(individualProfileScores).values(scoreRows);
    counts.individualProfileScores = scoreRows.length;
  }

  const applied = Object.keys(counts).length > 0;
  const result: SeedUbatubaOperacionalD3Result = {
    applied,
    counts,
    skippedTables: Object.freeze(skippedTables),
    reason: applied
      ? undefined
      : `Todas as tabelas D3 ja semeadas em Ubatuba. Nenhum INSERT aplicado.`,
  };
  return result;
}

// Guard nao utilizado abaixo — silenciar unused import de 'and' via uso trivial.
void and;

/**
 * Total canonico bit-exact esperado apos D3 aplicado do zero (69+66+66=201).
 */
export const UBATUBA_OPERACIONAL_D3_TOTAL_ESPERADO = 201 as const;
if (
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO +
    UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO +
    UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO !==
  UBATUBA_OPERACIONAL_D3_TOTAL_ESPERADO
) {
  throw new Error(
    `UBATUBA_OPERACIONAL_D3_TOTAL_ESPERADO invariante quebrado: ` +
      `${UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO} + ` +
      `${UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO} + ` +
      `${UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO} != ${UBATUBA_OPERACIONAL_D3_TOTAL_ESPERADO}`,
  );
}
