// ROIP APP 9BOX — service `employeeTerminationEvents` (ME-011).
//
// Repositorio tipado dos eventos de saida de colaborador (DOC 01 §13.1).
// Append-only. Base do calculo de turnover trimestral (formulas no DOC 03).
// Ator polimorfico padrao B (`actorTipo` employee/superAdmin + `actorId`
// sem FK formal — historico sobrevive a delecao do ator).

import { asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeTerminationEvents } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewTerminationEvent = typeof employeeTerminationEvents.$inferInsert;

/**
 * Insere um evento de desligamento. Retorna o `id` autogerado. Erros de FK
 * (`employeeId`, `companyId`) sobem como excecoes do mysql2. Em producao,
 * a insercao ocorre na mesma transacao de `employees.status = 'inativo'`
 * (§13.1 regra 1), mas essa atomicidade e responsabilidade do caller.
 */
export async function insertTerminationEvent(
  db: RoipDatabase,
  data: NewTerminationEvent,
): Promise<number> {
  const [result] = await db.insert(employeeTerminationEvents).values(data).$returningId();
  if (!result) {
    throw new Error('insertTerminationEvent: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todos os eventos de desligamento de uma empresa em ordem
 * cronologica decrescente por `dataInativacao`. Consumida pelo motor de
 * turnover (B3).
 */
export async function listTerminationsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(employeeTerminationEvents)
    .where(eq(employeeTerminationEvents.companyId, companyId))
    .orderBy(desc(employeeTerminationEvents.dataInativacao), desc(employeeTerminationEvents.id));
}

/**
 * Lista todos os eventos de desligamento de um colaborador especifico em
 * ordem cronologica crescente por `dataInativacao`. Suporta reativacao +
 * nova inativacao (§13.1 regra 3): cada saida gera um registro.
 */
export async function listTerminationsByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(employeeTerminationEvents)
    .where(eq(employeeTerminationEvents.employeeId, employeeId))
    .orderBy(asc(employeeTerminationEvents.dataInativacao), asc(employeeTerminationEvents.id));
}
