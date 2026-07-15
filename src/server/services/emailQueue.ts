// ROIP APP 9BOX — service `emailQueue` (ME-017).
//
// Repositorio tipado da tabela canonica `emailQueue` (DOC 01 §12.7).
// Fila de e-mails processada por `runEmailQueueJob` a cada 1 minuto.
// Suporta agrupamento cross-tipo em janela de 15 min (canal `imediato`)
// e enfileiramento para digest semanal.
//
// Mutavel com maquina de estados linear:
//   pendente → processando → enviado
//                          → falhou
//
// Todos os setters de transicao usam WHERE guard de estado anterior:
// transicao invalida retorna 0 linhas afetadas e preserva o registro.
// Mesmo padrao dos setters de `copsoqCycles.abrirCopsoqCycle` /
// `fecharCopsoqCycle` (ME-016).
//
// Incremento de `retries` no `markEmailQueueFailed`: o caller ja
// fornece o novo valor (RV-12 proibe `sql\`retries + 1\``); a leitura
// previa e responsabilidade do caller.

import { and, asc, eq, lte } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { emailQueue } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewEmailQueueItem = typeof emailQueue.$inferInsert;

/** Estados canonicos da fila (§12.7). */
type EmailQueueStatus = 'pendente' | 'processando' | 'enviado' | 'falhou';

/**
 * Insere um item na fila. Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `destinatarioEmployeeId`, `emailNotificationId`) sobem
 * como excecoes do mysql2.
 */
export async function insertEmailQueueItem(
  db: RoipDatabase,
  data: NewEmailQueueItem,
): Promise<number> {
  const [result] = await db.insert(emailQueue).values(data).$returningId();
  if (!result) {
    throw new Error('insertEmailQueueItem: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um item pelo `id`. Retorna `undefined` se nao existir. */
export async function getEmailQueueItemById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(emailQueue).where(eq(emailQueue.id, id)).limit(1);
  return rows[0];
}

/**
 * Lista itens da fila em um `status`, ordenados por `scheduledFor`
 * ascendente. Cobre o indice `idx_emailQueue_status_scheduledFor`.
 * `limit` opcional para o worker tomar batch por rodada.
 */
export async function listEmailQueueByStatus(
  db: RoipDatabase,
  status: EmailQueueStatus,
  limit?: number,
) {
  const q = db
    .select()
    .from(emailQueue)
    .where(eq(emailQueue.status, status))
    .orderBy(asc(emailQueue.scheduledFor), asc(emailQueue.id));
  if (typeof limit === 'number' && limit > 0) {
    return await q.limit(limit);
  }
  return await q;
}

/**
 * Lista itens PENDENTES ja elegiveis (`scheduledFor <= now`) para o
 * worker processar. Cobre o mesmo indice
 * `idx_emailQueue_status_scheduledFor`.
 */
export async function listEmailQueuePendingReady(db: RoipDatabase, now: Date, limit?: number) {
  const q = db
    .select()
    .from(emailQueue)
    .where(and(eq(emailQueue.status, 'pendente'), lte(emailQueue.scheduledFor, now)))
    .orderBy(asc(emailQueue.scheduledFor), asc(emailQueue.id));
  if (typeof limit === 'number' && limit > 0) {
    return await q.limit(limit);
  }
  return await q;
}

/**
 * Transicao pendente → processando: grava `status='processando'` +
 * `processedAt`. WHERE guard: so afeta linha com `status='pendente'`.
 * Retorna linhas afetadas (0 se o item nao estiver pendente).
 */
export async function markEmailQueueProcessing(
  db: RoipDatabase,
  id: number,
  processedAt: Date,
): Promise<number> {
  const [result] = await db
    .update(emailQueue)
    .set({ status: 'processando', processedAt })
    .where(and(eq(emailQueue.id, id), eq(emailQueue.status, 'pendente')));
  return result.affectedRows;
}

/**
 * Transicao processando → enviado: grava `status='enviado'` e o
 * `emailNotificationId` da linha em `emailNotifications`. WHERE guard:
 * so afeta linha com `status='processando'`. Retorna linhas afetadas.
 */
export async function markEmailQueueSent(
  db: RoipDatabase,
  id: number,
  emailNotificationId: number,
): Promise<number> {
  const [result] = await db
    .update(emailQueue)
    .set({ status: 'enviado', emailNotificationId })
    .where(and(eq(emailQueue.id, id), eq(emailQueue.status, 'processando')));
  return result.affectedRows;
}

/**
 * Transicao processando → falhou: grava `status='falhou'` e o novo
 * valor de `retries` (o caller fornece — RV-12). WHERE guard: so afeta
 * linha com `status='processando'`. Retorna linhas afetadas.
 */
export async function markEmailQueueFailed(
  db: RoipDatabase,
  id: number,
  novoRetries: number,
): Promise<number> {
  const [result] = await db
    .update(emailQueue)
    .set({ status: 'falhou', retries: novoRetries })
    .where(and(eq(emailQueue.id, id), eq(emailQueue.status, 'processando')));
  return result.affectedRows;
}

/**
 * Remove todos os itens da fila de uma empresa (teardown de testes).
 * Retorna linhas afetadas.
 */
export async function deleteEmailQueueByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
  return result.affectedRows;
}
