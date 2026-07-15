// ROIP APP 9BOX — service `copsoqFactorScores` (ME-016).
//
// Repositorio tipado da tabela canonica `copsoqFactorScores` (DOC 01
// §11.4). Scores por fator (1-8) por escopo ('empresa' | 'departamento'
// | 'agregacao') por ciclo do Radar NR-1. Filha de `copsoqCycles` com
// ON DELETE CASCADE.
//
// Regime de mutabilidade: os scores sao calculados e gravados UMA unica
// vez no fechamento do ciclo; reprocessamento gera NOVO ciclo, nunca
// sobrescrita. Por isso o service nao expoe UPDATE nem DELETE — a
// limpeza ocorre exclusivamente pelo CASCADE do ciclo pai.
//
// Semantica da UNIQUE `uq_score` (cicloDbId, escopo,
// escopoDepartamentoId, escopoNomeAgregacao, fator), confirmada por
// leitura direta do §11.4: as colunas de escopo sao NULLAVEIS e, no
// MySQL, linhas com NULL em coluna de indice UNIQUE nao colidem entre
// si. Como cada escopo deixa ao menos uma das duas colunas nula
// (empresa: ambas; departamento: nome nulo; agregacao: departamento
// nulo), o indice nao bloqueia duplicatas na pratica — a coerencia
// (um score por fator por escopo por ciclo) e responsabilidade do
// caller (motor de fechamento, Bloco B3). Os intervalos canonicos sao
// impostos na migration §S004 (`chk_score_fator` 1-8,
// `chk_score_range` 0-100).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { copsoqFactorScores } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCopsoqFactorScore = typeof copsoqFactorScores.$inferInsert;

/**
 * Insere um score de fator. Retorna o `id` autogerado. Erros de FK
 * (`cicloDbId`, `companyId`, `escopoDepartamentoId`) e dos CHECKs
 * canonicos sobem como excecoes do mysql2. A coerencia do trio de
 * escopo (enum + colunas nullaveis) e responsabilidade do caller.
 */
export async function insertCopsoqFactorScore(
  db: RoipDatabase,
  data: NewCopsoqFactorScore,
): Promise<number> {
  const [result] = await db.insert(copsoqFactorScores).values(data).$returningId();
  if (!result) {
    throw new Error('insertCopsoqFactorScore: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um score pelo `id`. Retorna `undefined` se nao existir. */
export async function getCopsoqFactorScoreById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(copsoqFactorScores)
    .where(eq(copsoqFactorScores.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista os scores de escopo 'empresa' de um ciclo, ordenados por
 * `fator` ascendente (8 linhas no ciclo fechado). Base da visao geral
 * do Radar NR-1 e referencia da analise de divergencia (§11.5).
 */
export async function listCopsoqFactorScoresByCicloEmpresa(db: RoipDatabase, cicloDbId: number) {
  return await db
    .select()
    .from(copsoqFactorScores)
    .where(
      and(eq(copsoqFactorScores.cicloDbId, cicloDbId), eq(copsoqFactorScores.escopo, 'empresa')),
    )
    .orderBy(asc(copsoqFactorScores.fator));
}

/**
 * Lista os scores de um departamento em um ciclo, ordenados por
 * `fator` ascendente. Consumida pela visao por area e pela analise de
 * divergencia (§11.5).
 */
export async function listCopsoqFactorScoresByCicloDepartamento(
  db: RoipDatabase,
  cicloDbId: number,
  escopoDepartamentoId: number,
) {
  return await db
    .select()
    .from(copsoqFactorScores)
    .where(
      and(
        eq(copsoqFactorScores.cicloDbId, cicloDbId),
        eq(copsoqFactorScores.escopo, 'departamento'),
        eq(copsoqFactorScores.escopoDepartamentoId, escopoDepartamentoId),
      ),
    )
    .orderBy(asc(copsoqFactorScores.fator));
}

/**
 * Lista todos os scores de um ciclo, ordenados por (`escopo` na posicao
 * declarada do enum, `fator`, `id`) ascendente. Cobre o indice
 * `idx_scores_ciclo`.
 */
export async function listCopsoqFactorScoresByCiclo(db: RoipDatabase, cicloDbId: number) {
  return await db
    .select()
    .from(copsoqFactorScores)
    .where(eq(copsoqFactorScores.cicloDbId, cicloDbId))
    .orderBy(
      asc(copsoqFactorScores.escopo),
      asc(copsoqFactorScores.fator),
      asc(copsoqFactorScores.id),
    );
}

/**
 * Lista o historico de um fator em uma empresa (todos os ciclos),
 * ordenado por `id` ascendente. Cobre o indice
 * `idx_scores_company_fator` — base da visao de evolucao entre ciclos.
 */
export async function listCopsoqFactorScoresByCompanyFator(
  db: RoipDatabase,
  companyId: number,
  fator: number,
) {
  return await db
    .select()
    .from(copsoqFactorScores)
    .where(and(eq(copsoqFactorScores.companyId, companyId), eq(copsoqFactorScores.fator, fator)))
    .orderBy(asc(copsoqFactorScores.id));
}
