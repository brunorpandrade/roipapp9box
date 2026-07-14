// ROIP APP 9BOX — service `companyJobFamilies` (ME-010).
//
// Repositorio tipado da tabela `companyJobFamilies` (DOC 01 §12.2). Cada
// linha declara uma variavel de resultado (`variableIndex`) associada a
// uma job family de uma empresa; a chave UNIQUE (`companyId`, `jobFamily`,
// `variableIndex`) impede duplicacao. `updatedBy` referencia
// `superAdmins.id` — a insercao exige um super admin previamente semeado
// (fixture nos testes).

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
