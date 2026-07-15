// ROIP APP 9BOX — service `notifications` (ME-017).
//
// Repositorio tipado da tabela canonica `notifications` (DOC 01 §12.4).
// Sino do header (RH e Bruno). Imutavel por regra de negocio §16.2:
// nunca deletadas em producao — apenas `lidaEm` e `arquivadaEm` mudam
// (ortogonais entre si).
//
// Setters granulares com WHERE guard de destinatario para evitar
// cross-tenant: nao basta ter o `id`; o par (destinatarioTipo,
// destinatarioEmployeeId) precisa bater com o gravado. Isso protege
// contra chamadas com id valido mas de destinatario diferente.
//
// Regras canonicas relevantes (§12.4):
// - `alertId` e populado sempre que o passo M5 do pipeline executa. O
//   caller decide; o service nao valida coerencia com `alerts`.
// - Notificacoes globais do Bruno tem `companyId IS NULL` e
//   `destinatarioTipo = 'bruno'` (schema permite ambos).

import { and, desc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { notifications } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewNotification = typeof notifications.$inferInsert;

/**
 * Insere uma notificacao. Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `destinatarioEmployeeId`, `alertId`) sobem como
 * excecoes do mysql2.
 */
export async function insertNotification(db: RoipDatabase, data: NewNotification): Promise<number> {
  const [result] = await db.insert(notifications).values(data).$returningId();
  if (!result) {
    throw new Error('insertNotification: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma notificacao pelo `id`. Retorna `undefined` se nao existir. */
export async function getNotificationById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return rows[0];
}

/**
 * Marca uma notificacao como lida (`lidaEm = valor`) com WHERE guard de
 * destinatario. So altera se o (destinatarioTipo,
 * destinatarioEmployeeId) do request bater com o gravado. Idempotente
 * em relacao ao valor de `lidaEm` — mesma notificacao ja lida sera
 * sobrescrita pelo novo timestamp; se o caller quiser preservar,
 * verifica antes. Retorna linhas afetadas.
 */
export async function markNotificationRead(
  db: RoipDatabase,
  id: number,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmployeeId: number | null,
  lidaEm: Date,
): Promise<number> {
  const destClause =
    destinatarioEmployeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, destinatarioEmployeeId);
  const [result] = await db
    .update(notifications)
    .set({ lidaEm })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.destinatarioTipo, destinatarioTipo),
        destClause,
      ),
    );
  return result.affectedRows;
}

/**
 * Arquiva uma notificacao (`arquivadaEm = valor`) com WHERE guard de
 * destinatario. Arquivamento e ortogonal a leitura. Retorna linhas
 * afetadas.
 */
export async function archiveNotification(
  db: RoipDatabase,
  id: number,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmployeeId: number | null,
  arquivadaEm: Date,
): Promise<number> {
  const destClause =
    destinatarioEmployeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, destinatarioEmployeeId);
  const [result] = await db
    .update(notifications)
    .set({ arquivadaEm })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.destinatarioTipo, destinatarioTipo),
        destClause,
      ),
    );
  return result.affectedRows;
}

/**
 * Lista notificacoes NAO LIDAS de um destinatario, ordenadas por
 * `createdAt` descendente. Cobre o indice
 * `idx_notifications_destinatario_naoLida`.
 */
export async function listUnreadNotificationsByDestinatario(
  db: RoipDatabase,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmployeeId: number | null,
) {
  const destClause =
    destinatarioEmployeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, destinatarioEmployeeId);
  return await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.destinatarioTipo, destinatarioTipo),
        destClause,
        isNull(notifications.lidaEm),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id));
}

/**
 * Remove todas as notificacoes de uma empresa (teardown de testes).
 * Retorna linhas afetadas.
 */
export async function deleteNotificationsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(notifications).where(eq(notifications.companyId, companyId));
  return result.affectedRows;
}
