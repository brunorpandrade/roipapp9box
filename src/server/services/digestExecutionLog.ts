// ROIP APP 9BOX — service `digestExecutionLog` (ME-017).
//
// Repositorio tipado da tabela canonica `digestExecutionLog`
// (DOC 01 §12.8). Controle de idempotencia do digest semanal.
// Append-only strict (§16.1 item 11). Uma linha por (companyId,
// weekStart) via UNIQUE `uk_digestExecutionLog_week`. Colisao gera
// excecao do mysql2 — o caller sabe que ja executou aquela semana.
//
// Grava linha MESMO com `emailsEnviados = 0` (§12.8) — a existencia da
// linha e a prova de que o digest daquela semana foi processado, ainda
// que nao houvesse destinatarios.

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { digestExecutionLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewDigestExecutionLog = typeof digestExecutionLog.$inferInsert;

/**
 * Insere uma linha de execucao do digest. Retorna o `id` autogerado.
 * Erros de FK (`companyId`) e de UNIQUE (`uk_digestExecutionLog_week`)
 * sobem como excecoes do mysql2.
 */
export async function insertDigestExecutionLog(
  db: RoipDatabase,
  data: NewDigestExecutionLog,
): Promise<number> {
  const [result] = await db.insert(digestExecutionLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertDigestExecutionLog: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getDigestExecutionLogById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(digestExecutionLog)
    .where(eq(digestExecutionLog.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca a linha canonica de uma semana para uma empresa. Retorna
 * `undefined` se nao existir. `weekStart` e coluna DATE — o caller
 * fornece `Date` e o Drizzle formata.
 */
export async function getDigestExecutionLogByWeek(
  db: RoipDatabase,
  companyId: number,
  weekStart: Date,
) {
  const rows = await db
    .select()
    .from(digestExecutionLog)
    .where(
      and(eq(digestExecutionLog.companyId, companyId), eq(digestExecutionLog.weekStart, weekStart)),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista o historico de execucoes do digest de uma empresa, ordenado por
 * `executedAt` descendente.
 */
export async function listDigestExecutionLogsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(digestExecutionLog)
    .where(eq(digestExecutionLog.companyId, companyId))
    .orderBy(desc(digestExecutionLog.executedAt), desc(digestExecutionLog.id));
}

/**
 * Remove todo o historico de digest de uma empresa (teardown de
 * testes; producao mantem tudo). Retorna linhas afetadas.
 */
export async function deleteDigestExecutionLogByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(digestExecutionLog)
    .where(eq(digestExecutionLog.companyId, companyId));
  return result.affectedRows;
}
