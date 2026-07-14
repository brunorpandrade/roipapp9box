// ROIP APP 9BOX — service `leaderOnboardingStageLog` (ME-011).
//
// Log de mudanca de estagio do kanban de onboarding (DOC 01 §14.4).
// Append-only. Registrado APENAS quando o estagio efetivamente muda —
// anotacao pura sem mudanca de estagio nao gera registro aqui, apenas em
// `leaderOnboardingNotes`. A atualizacao de `employees.onboardingEstagio`
// ocorre na mesma transacao do INSERT (responsabilidade do caller B3).

import { asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { leaderOnboardingStageLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewStageLogEntry = typeof leaderOnboardingStageLog.$inferInsert;

/**
 * Insere uma entrada no log de mudanca de estagio. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`) sobem como excecoes
 * do mysql2. FK em `employees` e ON DELETE CASCADE (§14.4).
 */
export async function insertStageLogEntry(
  db: RoipDatabase,
  data: NewStageLogEntry,
): Promise<number> {
  const [result] = await db.insert(leaderOnboardingStageLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertStageLogEntry: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todas as mudancas de estagio de um colaborador em ordem
 * cronologica crescente (mais antiga primeiro). Consumida pelo Historico
 * da empresa (DOC 06) e pelo kanban de onboarding (visao "linha do tempo"
 * do card).
 */
export async function listStageLogByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(leaderOnboardingStageLog)
    .where(eq(leaderOnboardingStageLog.employeeId, employeeId))
    .orderBy(asc(leaderOnboardingStageLog.createdAt), asc(leaderOnboardingStageLog.id));
}

/**
 * Retorna a mudanca de estagio mais recente de um colaborador. Retorna
 * `undefined` se nao houver historico. Consumido pelo detalhe do card do
 * kanban para exibir "estagio atual + quando entrou nele".
 */
export async function getLatestStageLogByEmployee(db: RoipDatabase, employeeId: number) {
  const rows = await db
    .select()
    .from(leaderOnboardingStageLog)
    .where(eq(leaderOnboardingStageLog.employeeId, employeeId))
    .orderBy(desc(leaderOnboardingStageLog.createdAt), desc(leaderOnboardingStageLog.id))
    .limit(1);
  return rows[0];
}
