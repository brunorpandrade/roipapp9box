// ROIP APP 9BOX — service `employeeGoals` (ME-011).
//
// Repositorio tipado da tabela `employeeGoals` (DOC 01 §4.7). Cada linha
// declara uma meta de variavel de resultado por colaborador; a chave UNIQUE
// (`employeeId`, `variableIndex`) impede duplicacao da mesma variavel para
// o mesmo colaborador. A definicao das variaveis por familia vive em
// `companyJobFamilies` (§12.2, ME-010); esta tabela guarda a meta que
// aquele colaborador tem para cada uma delas.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeGoals } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `employeeGoals`). */
type NewEmployeeGoal = typeof employeeGoals.$inferInsert;

/**
 * Insere uma meta para um colaborador em uma variavel especifica. Retorna
 * o `id` autogerado. Erros de FK (`employeeId`) e de UNIQUE (`uq_goal`)
 * sobem como excecoes do mysql2.
 */
export async function insertEmployeeGoal(db: RoipDatabase, data: NewEmployeeGoal): Promise<number> {
  const [result] = await db.insert(employeeGoals).values(data).$returningId();
  if (!result) {
    throw new Error('insertEmployeeGoal: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todas as metas de um colaborador em ordem crescente de
 * `variableIndex`. Consumida pelos motores de `performanceVariableData`
 * (Bloco B3) para conhecer as metas vigentes.
 */
export async function listGoalsByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(employeeGoals)
    .where(eq(employeeGoals.employeeId, employeeId))
    .orderBy(asc(employeeGoals.variableIndex));
}

/**
 * Retorna a meta especifica de um colaborador para um `variableIndex`.
 * Consumida pelos motores de calculo para resolver a meta sem carregar as
 * demais.
 */
export async function getEmployeeGoal(db: RoipDatabase, employeeId: number, variableIndex: number) {
  const rows = await db
    .select()
    .from(employeeGoals)
    .where(
      and(eq(employeeGoals.employeeId, employeeId), eq(employeeGoals.variableIndex, variableIndex)),
    )
    .limit(1);
  return rows[0];
}

/**
 * Atualiza `weight` e `goal` de uma meta existente (identificada por
 * employeeId + variableIndex, o UNIQUE canonico). `updatedBy` registra quem
 * fez a alteracao (rh/lider/super_admin). Retorna o numero de linhas
 * afetadas.
 */
export async function updateEmployeeGoal(
  db: RoipDatabase,
  employeeId: number,
  variableIndex: number,
  patch: { weight: string; goal: string; updatedBy: 'rh' | 'lider' | 'super_admin' },
): Promise<number> {
  const [result] = await db
    .update(employeeGoals)
    .set({
      weight: patch.weight,
      goal: patch.goal,
      updatedBy: patch.updatedBy,
    })
    .where(
      and(eq(employeeGoals.employeeId, employeeId), eq(employeeGoals.variableIndex, variableIndex)),
    );
  return result.affectedRows;
}

/**
 * Remove todas as metas de um colaborador. Somente para teardown de testes
 * — em producao a manutencao das metas passa por fluxo proprio com
 * auditoria. Retorna o numero de linhas afetadas.
 */
export async function deleteGoalsByEmployee(db: RoipDatabase, employeeId: number): Promise<number> {
  const [result] = await db.delete(employeeGoals).where(eq(employeeGoals.employeeId, employeeId));
  return result.affectedRows;
}
