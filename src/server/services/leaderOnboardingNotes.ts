// ROIP APP 9BOX — service `leaderOnboardingNotes` (ME-011).
//
// Anotacoes versionadas do kanban de onboarding de lideres (DOC 01 §14.3).
// Append-only. Autor polimorfico padrao B (super_admin ou rh). Nunca
// visivel ao proprio lider (regra de UI, nao imposta aqui).

import { desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { leaderOnboardingNotes } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewOnboardingNote = typeof leaderOnboardingNotes.$inferInsert;

/**
 * Insere uma anotacao no kanban de onboarding de um lider. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`) sobem como excecoes
 * do mysql2. FK em `employees` e ON DELETE CASCADE (§14.3) — anotacoes de
 * um colaborador deletado saem com ele.
 */
export async function insertOnboardingNote(
  db: RoipDatabase,
  data: NewOnboardingNote,
): Promise<number> {
  const [result] = await db.insert(leaderOnboardingNotes).values(data).$returningId();
  if (!result) {
    throw new Error('insertOnboardingNote: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todas as anotacoes de um colaborador (lider) em ordem cronologica
 * decrescente (mais recente primeiro), conforme regra de exibicao do modal
 * de edicao do card (§14.3).
 */
export async function listOnboardingNotesByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(leaderOnboardingNotes)
    .where(eq(leaderOnboardingNotes.employeeId, employeeId))
    .orderBy(desc(leaderOnboardingNotes.createdAt), desc(leaderOnboardingNotes.id));
}
