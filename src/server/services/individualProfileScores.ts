// ROIP APP 9BOX — service `individualProfileScores` (ME-015).
//
// Repositorio tipado da tabela canonica `individualProfileScores`
// (DOC 01 §9.2). Vetor de 24 dimensoes (0.00-100.00, NULL quando
// confiabilidade baixa) + resultados interpretativos do motor
// deterministico + cache dos textos de IA. Filha de
// `individualProfileAssessments` via `assessmentId` com FK ON DELETE
// RESTRICT — a tentativa pai nao pode ser deletada enquanto houver
// score.
//
// Cache imutavel (§16.2): `resumoJson` e `expandidoJson` sao gerados
// uma unica vez, na primeira visualizacao de cada relatorio; novo
// conteudo exige nova tentativa. Os setters de cache deste service
// impoem a regra no proprio UPDATE (guarda `IS NULL` na coluna alvo):
// segunda tentativa de escrita retorna 0 linhas afetadas.
//
// Polimorfismo padrao B (§2.3) no titular: `userType` enum
// (`employee` | `clevel`) + `userId` sem FK formal. A UNIQUE
// `uq_ips_tentativa` (companyId, userType, userId, tentativa) bloqueia
// sobrescrita anomala de uma tentativa ja pontuada.

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { individualProfileScores } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewIndividualProfileScore = typeof individualProfileScores.$inferInsert;

/**
 * Insere o resultado de pontuacao de uma tentativa. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `assessmentId`) e de UNIQUE
 * (`uq_ips_tentativa`) sobem como excecoes do mysql2. O vetor de 24
 * dimensoes e os resultados interpretativos nascem no proprio INSERT
 * (o motor grava o registro completo apos a Camada 1 aprovar).
 */
export async function insertIndividualProfileScore(
  db: RoipDatabase,
  data: NewIndividualProfileScore,
): Promise<number> {
  const [result] = await db.insert(individualProfileScores).values(data).$returningId();
  if (!result) {
    throw new Error('insertIndividualProfileScore: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um score pelo `id`. Retorna `undefined` se nao existir. */
export async function getIndividualProfileScoreById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(individualProfileScores)
    .where(eq(individualProfileScores.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca um score pela chave logica UNIQUE (`companyId`, `userType`,
 * `userId`, `tentativa`). Retorna `undefined` se nao existir.
 */
export async function getIndividualProfileScoreByTentativa(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
  tentativa: number,
) {
  const rows = await db
    .select()
    .from(individualProfileScores)
    .where(
      and(
        eq(individualProfileScores.companyId, companyId),
        eq(individualProfileScores.userType, userType),
        eq(individualProfileScores.userId, userId),
        eq(individualProfileScores.tentativa, tentativa),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Busca o score gerado a partir de uma tentativa pai (`assessmentId`).
 * Retorna `undefined` se nao existir.
 */
export async function getIndividualProfileScoreByAssessment(
  db: RoipDatabase,
  assessmentId: number,
) {
  const rows = await db
    .select()
    .from(individualProfileScores)
    .where(eq(individualProfileScores.assessmentId, assessmentId))
    .limit(1);
  return rows[0];
}

/**
 * Lista os scores de um titular, ordenados por `tentativa` ascendente.
 * Cobre o indice `idx_ips_user` — consumida pelo historico de perfil.
 */
export async function listIndividualProfileScoresByUser(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
) {
  return await db
    .select()
    .from(individualProfileScores)
    .where(
      and(
        eq(individualProfileScores.companyId, companyId),
        eq(individualProfileScores.userType, userType),
        eq(individualProfileScores.userId, userId),
      ),
    )
    .orderBy(asc(individualProfileScores.tentativa));
}

/**
 * Grava o cache do relatorio Resumo (primeira visualizacao). A guarda
 * `resumoJson IS NULL` impoe a imutabilidade do cache (§16.2): se o
 * cache ja existe, nenhuma linha e afetada e o conteudo original e
 * preservado. Retorna o numero de linhas afetadas (1 na primeira
 * geracao; 0 nas seguintes).
 */
export async function setIndividualProfileResumoCache(
  db: RoipDatabase,
  id: number,
  resumoJson: unknown,
  resumoGeradoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(individualProfileScores)
    .set({ resumoJson, resumoGeradoEm })
    .where(and(eq(individualProfileScores.id, id), isNull(individualProfileScores.resumoJson)));
  return result.affectedRows;
}

/**
 * Grava o cache do relatorio Expandido (primeira visualizacao). Mesma
 * guarda de imutabilidade do cache Resumo, sobre `expandidoJson`.
 * Retorna o numero de linhas afetadas (1 na primeira geracao; 0 nas
 * seguintes).
 */
export async function setIndividualProfileExpandidoCache(
  db: RoipDatabase,
  id: number,
  expandidoJson: unknown,
  expandidoGeradoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(individualProfileScores)
    .set({ expandidoJson, expandidoGeradoEm })
    .where(and(eq(individualProfileScores.id, id), isNull(individualProfileScores.expandidoJson)));
  return result.affectedRows;
}

/**
 * Remove um score pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva. Retorna o numero de linhas afetadas.
 */
export async function deleteIndividualProfileScoreById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db
    .delete(individualProfileScores)
    .where(eq(individualProfileScores.id, id));
  return result.affectedRows;
}
