// ROIP APP 9BOX — service `iqlData` (ME-014).
//
// Repositorio tipado da tabela canonica `iqlData` (DOC 01 §8.8).
// Agregados do IQL (Indice de Qualidade da Lideranca) por lider ou
// C-level por trimestre. Nome canonico unico: `iqlData` (S422 — o alias
// historico do §19 esta superado e proibido; ver DOC 01 §19).
//
// Padrao A canonico polimorfico (§2.3): `liderId` (FK employees) XOR
// `clevelId` (FK cLevelMembers), garantido pelo CHECK
// `chk_iqlData_avaliado_unico` na migration. Duas UNIQUE parciais no
// schema: `(companyId, liderId, trimestre)` e `(companyId, clevelId,
// trimestre)` — cada avaliado tem uma linha unica por trimestre.
//
// Composicao do IQL (§8.8): media aritmetica de quatro subscores
// dimensionais (direcionamento e clareza, desenvolvimento e apoio,
// relacionamento e confianca, gestao de resultados). O motor
// (Bloco B3 ME-036) recalcula e sobrescreve a cada nova resposta gravada
// em `instrumentD_responses`. Scores e `iql` sao gravados
// independentemente do piso de 3 respondentes (a decisao de exibir ou
// anonimizar e da camada de leitura, consultando `countRespondentes`).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { iqlData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `iqlData`). */
export type NewIqlData = typeof iqlData.$inferInsert;

/**
 * Insere uma linha trimestral de IQL. Retorna o `id` autogerado. Erros
 * de FK (`companyId`, `liderId`, `clevelId`) e de UNIQUE
 * (`uq_iqlData_lider` ou `uq_iqlData_clevel`) e do CHECK
 * `chk_iqlData_avaliado_unico` (exclusividade avaliado) sobem como
 * excecoes do mysql2. A rota canonica de "criar ou atualizar" vive no
 * router (Bloco B3): tenta insert; em colisao chama `updateIqlCalculo`.
 */
export async function insertIqlData(db: RoipDatabase, data: NewIqlData): Promise<number> {
  const [result] = await db.insert(iqlData).values(data).$returningId();
  if (!result) {
    throw new Error('insertIqlData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getIqlDataById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(iqlData).where(eq(iqlData.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, liderId, trimestre) — UNIQUE parcial
 * `uq_iqlData_lider` da §8.8. Retorna `undefined` se nao existir.
 * Consumida pelo dashboard do lider (tipo employee) e pelo motor de
 * atualizacao apos gravacao de `instrumentD_responses`.
 */
export async function getIqlDataByLiderQuarter(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(iqlData)
    .where(
      and(
        eq(iqlData.companyId, companyId),
        eq(iqlData.liderId, liderId),
        eq(iqlData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, clevelId, trimestre) — UNIQUE parcial
 * `uq_iqlData_clevel` da §8.8. Retorna `undefined` se nao existir.
 * Consumida pelo dashboard do C-level (avaliado) e pelo motor de
 * atualizacao apos gravacao de `instrumentD_responses`.
 */
export async function getIqlDataByClevelQuarter(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(iqlData)
    .where(
      and(
        eq(iqlData.companyId, companyId),
        eq(iqlData.clevelId, clevelId),
        eq(iqlData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as linhas de IQL de uma empresa em ordem crescente de
 * `trimestre` e depois `id`. Consumida pelos exportaveis e pelo
 * dashboard executivo (mapa de calor da qualidade da lideranca).
 */
export async function listIqlDataByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(iqlData)
    .where(eq(iqlData.companyId, companyId))
    .orderBy(asc(iqlData.trimestre), asc(iqlData.id));
}

/**
 * Atualiza todos os campos calculados pelo motor IQL: subscores
 * dimensionais (`scoreDirecionamentoClareza`, `scoreDesenvolvimentoApoio`,
 * `scoreRelacionamentoConfianca`, `scoreGestaoResultados`), `iql`
 * agregado, contagens (`countRespondentes`, `countRespondentesElegiveis`)
 * e `calculadoEm`. Retorna o numero de linhas afetadas.
 */
export async function updateIqlCalculo(
  db: RoipDatabase,
  id: number,
  patch: {
    scoreDirecionamentoClareza: string | null;
    scoreDesenvolvimentoApoio: string | null;
    scoreRelacionamentoConfianca: string | null;
    scoreGestaoResultados: string | null;
    iql: string | null;
    countRespondentes: number;
    countRespondentesElegiveis: number;
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(iqlData)
    .set({
      scoreDirecionamentoClareza: patch.scoreDirecionamentoClareza,
      scoreDesenvolvimentoApoio: patch.scoreDesenvolvimentoApoio,
      scoreRelacionamentoConfianca: patch.scoreRelacionamentoConfianca,
      scoreGestaoResultados: patch.scoreGestaoResultados,
      iql: patch.iql,
      countRespondentes: patch.countRespondentes,
      countRespondentesElegiveis: patch.countRespondentesElegiveis,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(iqlData.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre
 * `companies`, `employees` e `cLevelMembers` bloqueia). Retorna o
 * numero de linhas afetadas.
 */
export async function deleteIqlDataById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(iqlData).where(eq(iqlData.id, id));
  return result.affectedRows;
}
