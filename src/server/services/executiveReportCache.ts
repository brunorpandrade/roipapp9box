// ROIP APP 9BOX — service `executiveReportCache` (ME-017).
//
// Repositorio tipado da tabela canonica `executiveReportCache`
// (DOC 01 §13.2). Cache do Relatorio executivo trimestral — unico
// artefato com chamada a Claude API no MVP.
//
// UNIQUE `uq_erc_chave` sobre (`companyId`, `escopoTipo`,
// `escopoReferencia`, `trimestre`). Nova geracao sobre a mesma chave
// **sobrescreve por UPDATE** (§13.2) — nao versionado. Padrao idem ao
// de `performanceQuarterlyData.diagnosticoIA`.
//
// A sobrescrita e feita em duas etapas (RV-12 proibe `onDuplicateKey`
// via `sql\`\``): getByChave → INSERT ou UPDATE por `id`. Race entre
// dois callers concorrentes e mitigada pela UNIQUE do banco — o INSERT
// perdedor levanta ER_DUP_ENTRY, e o caller pode fazer retry.
//
// `escopoReferencia` e nullable: para `escopoTipo='empresa'` o valor
// canonico e NULL (nao ha referencia adicional). Como MySQL trata NULL
// como distinto em UNIQUE, o filtro do getByChave usa `IS NULL` quando
// aplicavel.

import { and, desc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { executiveReportCache } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewExecutiveReportCache = typeof executiveReportCache.$inferInsert;

/** Escopos canonicos (§13.2). */
type ExecutiveReportEscopoTipo = 'empresa' | 'departamento' | 'equipe';

/**
 * Busca a entrada de cache pela chave logica UNIQUE. Retorna
 * `undefined` se nao existir. `escopoReferencia` nulo e filtrado via
 * `IS NULL`.
 */
export async function getExecutiveReportCacheByChave(
  db: RoipDatabase,
  companyId: number,
  escopoTipo: ExecutiveReportEscopoTipo,
  escopoReferencia: string | null,
  trimestre: string,
) {
  const refClause =
    escopoReferencia === null
      ? isNull(executiveReportCache.escopoReferencia)
      : eq(executiveReportCache.escopoReferencia, escopoReferencia);
  const rows = await db
    .select()
    .from(executiveReportCache)
    .where(
      and(
        eq(executiveReportCache.companyId, companyId),
        eq(executiveReportCache.escopoTipo, escopoTipo),
        refClause,
        eq(executiveReportCache.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Upsert por chave logica UNIQUE. Se ja existir entrada com
 * (`companyId`, `escopoTipo`, `escopoReferencia`, `trimestre`),
 * atualiza os campos mutaveis (`conteudoPdfUrl`, `geradoPorTipo`,
 * `geradoPorId`, `geradoEm`). Caso contrario, insere. Retorna o `id`
 * da linha (novo ou existente).
 */
export async function upsertExecutiveReportCache(
  db: RoipDatabase,
  data: NewExecutiveReportCache,
): Promise<number> {
  const existing = await getExecutiveReportCacheByChave(
    db,
    data.companyId,
    data.escopoTipo,
    data.escopoReferencia ?? null,
    data.trimestre,
  );
  if (existing) {
    await db
      .update(executiveReportCache)
      .set({
        conteudoPdfUrl: data.conteudoPdfUrl,
        geradoPorTipo: data.geradoPorTipo,
        geradoPorId: data.geradoPorId,
        geradoEm: data.geradoEm ?? new Date(),
      })
      .where(eq(executiveReportCache.id, existing.id));
    return existing.id;
  }
  const [result] = await db.insert(executiveReportCache).values(data).$returningId();
  if (!result) {
    throw new Error('upsertExecutiveReportCache: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca uma linha de cache pelo `id`. Retorna `undefined` se nao
 * existir.
 */
export async function getExecutiveReportCacheById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(executiveReportCache)
    .where(eq(executiveReportCache.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista as entradas de cache de uma empresa ordenadas por `geradoEm`
 * descendente.
 */
export async function listExecutiveReportCacheByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(executiveReportCache)
    .where(eq(executiveReportCache.companyId, companyId))
    .orderBy(desc(executiveReportCache.geradoEm), desc(executiveReportCache.id));
}

/**
 * Remove todas as entradas de cache de uma empresa (teardown de
 * testes; producao mantem o cache indefinidamente por chave, com
 * sobrescrita via UPDATE). Retorna linhas afetadas.
 */
export async function deleteExecutiveReportCacheByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(executiveReportCache)
    .where(eq(executiveReportCache.companyId, companyId));
  return result.affectedRows;
}
