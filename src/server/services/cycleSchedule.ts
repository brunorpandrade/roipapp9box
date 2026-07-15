// ROIP APP 9BOX — service `cycleSchedule` (ME-017).
//
// Repositorio tipado da tabela canonica `cycleSchedule`
// (DOC 01 §12.6). Calendario unificado de ciclos por empresa, com
// 5 tipos canonicos:
//   `instrumento_a` | `instrumento_c` | `instrumento_d` |
//   `radar_nr1` | `fechamento_mensal`
//
// Chave logica UNIQUE (`companyId`, `tipoCiclo`, `cicloReferencia`).
// Estado `status ENUM('aberto','atrasado','fechado')` com transicao
// livre (o caller — job de scheduler do Bloco B3 — decide; nao ha
// invariante de maquina de estados em nivel de persistencia).
//
// `origemDbId` (nullable, sem FK formal por design — verificar): quando
// `tipoCiclo='radar_nr1'`, aponta para o `copsoqCycles.id` do ciclo pai
// (ligacao logica; o schema declara a coluna INT sem `references()`).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cycleSchedule } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCycleSchedule = typeof cycleSchedule.$inferInsert;

/** Tipos canonicos de ciclo (§12.6). */
export type CycleScheduleTipo =
  'instrumento_a' | 'instrumento_c' | 'instrumento_d' | 'radar_nr1' | 'fechamento_mensal';

/**
 * Insere um novo item no calendario de ciclos. Retorna o `id`
 * autogerado. Erros de FK (`companyId`) e de UNIQUE
 * (`uk_cycleSchedule_ciclo`) sobem como excecoes do mysql2.
 */
export async function insertCycleSchedule(
  db: RoipDatabase,
  data: NewCycleSchedule,
): Promise<number> {
  const [result] = await db.insert(cycleSchedule).values(data).$returningId();
  if (!result) {
    throw new Error('insertCycleSchedule: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um ciclo pelo `id`. Retorna `undefined` se nao existir. */
export async function getCycleScheduleById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(cycleSchedule).where(eq(cycleSchedule.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um ciclo pela chave logica UNIQUE (`companyId`, `tipoCiclo`,
 * `cicloReferencia`). Retorna `undefined` se nao existir.
 */
export async function getCycleScheduleByChave(
  db: RoipDatabase,
  companyId: number,
  tipoCiclo: CycleScheduleTipo,
  cicloReferencia: string,
) {
  const rows = await db
    .select()
    .from(cycleSchedule)
    .where(
      and(
        eq(cycleSchedule.companyId, companyId),
        eq(cycleSchedule.tipoCiclo, tipoCiclo),
        eq(cycleSchedule.cicloReferencia, cicloReferencia),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista os ciclos de uma empresa filtrando por tipo, ordenados por
 * `cicloReferencia` ascendente. Cobre o indice
 * `idx_cycleSchedule_company_tipo_status`.
 */
export async function listCycleSchedulesByCompanyTipo(
  db: RoipDatabase,
  companyId: number,
  tipoCiclo: CycleScheduleTipo,
) {
  return await db
    .select()
    .from(cycleSchedule)
    .where(and(eq(cycleSchedule.companyId, companyId), eq(cycleSchedule.tipoCiclo, tipoCiclo)))
    .orderBy(asc(cycleSchedule.cicloReferencia), asc(cycleSchedule.id));
}

/**
 * Atualiza o `status` de um ciclo. Transicao livre (o caller decide),
 * sem guard de estado anterior. Retorna linhas afetadas.
 */
export async function updateCycleScheduleStatus(
  db: RoipDatabase,
  id: number,
  status: 'aberto' | 'atrasado' | 'fechado',
): Promise<number> {
  const [result] = await db.update(cycleSchedule).set({ status }).where(eq(cycleSchedule.id, id));
  return result.affectedRows;
}

/**
 * Atualiza os contadores `totalElegiveis` e `totalRespondidos` de um
 * ciclo. Passar `null` limpa. Retorna linhas afetadas.
 */
export async function updateCycleScheduleContadores(
  db: RoipDatabase,
  id: number,
  totalElegiveis: number | null,
  totalRespondidos: number | null,
): Promise<number> {
  const [result] = await db
    .update(cycleSchedule)
    .set({ totalElegiveis, totalRespondidos })
    .where(eq(cycleSchedule.id, id));
  return result.affectedRows;
}

/**
 * Remove todos os ciclos de uma empresa (teardown de testes). Retorna
 * linhas afetadas.
 */
export async function deleteCycleSchedulesByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  return result.affectedRows;
}
