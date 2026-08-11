// ROIP APP 9BOX — service `companyJobFamilies` (ME-010 + ME-075).
//
// Repositorio tipado da tabela `companyJobFamilies` (DOC 01 §12.2). Cada
// linha declara uma variavel de resultado (`variableIndex`) associada a
// uma job family de uma empresa; a chave UNIQUE (`companyId`, `jobFamily`,
// `variableIndex`) impede duplicacao. `updatedBy` referencia
// `superAdmins.id` — a insercao exige um super admin previamente semeado
// (fixture nos testes).
//
// ME-075 canonica bit-exact (D086) — adiciona `upsertJobFamilyVariables`
// consumido pelo router `company.updateJobFamilies` (§13.1 Aba 2 DOC 05 +
// §12.2 DOC 01). UPSERT via `.onDuplicateKeyUpdate()` do Drizzle MySQL —
// pre-decisao 1 aprovada por Bruno na abertura da ME.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companyJobFamilies } from '../../db/schema';
import type { JobFamily } from '../../db/schema';

/**
 * Insere uma variavel de resultado para uma job family de uma empresa.
 * Retorna o `id` autogerado. Erros de FK (`companyId` ou `updatedBy`
 * invalidos) e de UNIQUE (`uq_cjf`) sobem como excecoes do mysql2 — nao ha
 * validacao de aplicacao aqui.
 */
export async function insertJobFamilyVariable(
  db: RoipDatabase,
  data: typeof companyJobFamilies.$inferInsert,
): Promise<number> {
  const [result] = await db.insert(companyJobFamilies).values(data).$returningId();
  if (!result) {
    throw new Error('insertJobFamilyVariable: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todas as variaveis de resultado de uma empresa, agrupadas por job
 * family e ordenadas por `variableIndex`. Usada pelos motores de
 * `performanceVariableData` (B3) para conhecer as variaveis validas.
 */
export async function listJobFamiliesForCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(companyJobFamilies)
    .where(eq(companyJobFamilies.companyId, companyId))
    .orderBy(asc(companyJobFamilies.jobFamily), asc(companyJobFamilies.variableIndex));
}

/**
 * Retorna as variaveis de uma job family especifica de uma empresa.
 * Consumida pelos motores de calculo para resolver `weight`/`variableIndex`
 * sem carregar as demais job families.
 */
export async function listVariablesByJobFamily(
  db: RoipDatabase,
  companyId: number,
  jobFamily: JobFamily,
) {
  return await db
    .select()
    .from(companyJobFamilies)
    .where(
      and(eq(companyJobFamilies.companyId, companyId), eq(companyJobFamilies.jobFamily, jobFamily)),
    )
    .orderBy(asc(companyJobFamilies.variableIndex));
}

/**
 * Remove todas as variaveis de uma empresa. Somente para teardown de
 * testes — em producao a manutencao das variaveis passa por fluxo proprio
 * com auditoria. Retorna o numero de linhas afetadas.
 */
export async function deleteJobFamiliesForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(companyJobFamilies)
    .where(eq(companyJobFamilies.companyId, companyId));
  return result.affectedRows;
}

// ============================================================
// ME-075 — upsertJobFamilyVariables (D086)
// ============================================================

/**
 * Payload canonico bit-exact de uma variavel de uma job family (§13.1
 * Aba 2 DOC 05 + §12.2 DOC 01). Consumido pelo router `company.
 * updateJobFamilies`. `variableIndex` 0..3 (4 variaveis por familia).
 */
export interface JobFamilyVariableInput {
  variableIndex: number;
  variableName: string;
  unit: string;
  weight: number;
}

/**
 * UPSERT canonico bit-exact das 4 variaveis de uma job family especifica
 * de uma empresa. Pre-decisao 1 (Bruno aprovou): `.onDuplicateKeyUpdate()`
 * do Drizzle MySQL — atomico, tipado, sem SQL cru (RV-12), garantido
 * pela chave UNIQUE `uq_cjf(companyId, jobFamily, variableIndex)`.
 *
 * Validacoes de aplicacao (soma pesos = 100; familia 6 nomes/unidades
 * fixos §13.1 Aba 2) sao feitas no router antes da chamada. Este servico
 * e persistencia pura — nao decide nada.
 */
export async function upsertJobFamilyVariables(
  db: RoipDatabase,
  companyId: number,
  jobFamily: JobFamily,
  variables: JobFamilyVariableInput[],
  updatedBy: number,
): Promise<void> {
  for (const v of variables) {
    await db
      .insert(companyJobFamilies)
      .values({
        companyId,
        jobFamily,
        variableIndex: v.variableIndex,
        variableName: v.variableName,
        unit: v.unit,
        weight: String(v.weight),
        updatedBy,
      })
      .onDuplicateKeyUpdate({
        set: {
          variableName: v.variableName,
          unit: v.unit,
          weight: String(v.weight),
          updatedBy,
        },
      });
  }
}
