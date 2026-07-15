// ROIP APP 9BOX — service `emailNotifications` (ME-017).
//
// Repositorio tipado da tabela canonica `emailNotifications`
// (DOC 01 §12.5). Historico de e-mails enviados. Append-only strict
// (§16.1 item 12). O INSERT ocorre APOS o processamento do envio: os
// campos `enviadoEm`, `success`, `failReason` e `smtpMessageId` ja vem
// populados pelo caller (worker de envio) e nunca sao atualizados.
//
// Regra canonica relevante (§12.5): `digest_diario` e reserva de
// extensibilidade — nao usado no MVP, preservado no enum
// `tipoEnvio ENUM('imediato','digest_semanal','digest_diario')`.
// Configuracoes de e-mail por empresa nao existem no MVP (SMTP global
// via variaveis de ambiente); nao ha tabela de settings de e-mail (§19).

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { emailNotifications } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewEmailNotification = typeof emailNotifications.$inferInsert;

/**
 * Insere uma linha no historico de e-mails. Retorna o `id` autogerado.
 * Erros de FK (`companyId`, `notificationId`, `destinatarioEmployeeId`)
 * sobem como excecoes do mysql2.
 */
export async function insertEmailNotification(
  db: RoipDatabase,
  data: NewEmailNotification,
): Promise<number> {
  const [result] = await db.insert(emailNotifications).values(data).$returningId();
  if (!result) {
    throw new Error('insertEmailNotification: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca uma linha pelo `id`. Retorna `undefined` se nao existir.
 */
export async function getEmailNotificationById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(emailNotifications)
    .where(eq(emailNotifications.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista o historico de e-mails de uma empresa, ordenado por `createdAt`
 * descendente. Cobre o indice `idx_emailNotifications_company_created`.
 */
export async function listEmailNotificationsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(emailNotifications)
    .where(eq(emailNotifications.companyId, companyId))
    .orderBy(desc(emailNotifications.createdAt), desc(emailNotifications.id));
}

/**
 * Lista o historico de e-mails de um destinatario (por email), ordenado
 * por `enviadoEm` descendente. Cobre o indice
 * `idx_emailNotifications_destinatario`.
 */
export async function listEmailNotificationsByDestinatario(
  db: RoipDatabase,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmail: string,
) {
  return await db
    .select()
    .from(emailNotifications)
    .where(
      and(
        eq(emailNotifications.destinatarioTipo, destinatarioTipo),
        eq(emailNotifications.destinatarioEmail, destinatarioEmail),
      ),
    )
    .orderBy(desc(emailNotifications.enviadoEm), desc(emailNotifications.id));
}

/**
 * Remove todo o historico de e-mails de uma empresa (teardown de
 * testes; producao mantem tudo). Retorna linhas afetadas.
 */
export async function deleteEmailNotificationsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(emailNotifications)
    .where(eq(emailNotifications.companyId, companyId));
  return result.affectedRows;
}
