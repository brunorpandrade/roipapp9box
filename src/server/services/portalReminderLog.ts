// ROIP APP 9BOX — service `portalReminderLog` (ME-017).
//
// Repositorio tipado da tabela canonica `portalReminderLog`
// (DOC 01 §12.1). Log persistido de TODOS os envios de lembretes do
// portal, bem-sucedidos e falhos. Append-only strict (§16.1 item 5).
//
// PK CHAR(36) UUID gerada pelo BACKEND — o service nao gera; recebe.
// Isso preserva a rastreabilidade: o caller (worker de envio) decide
// o UUID antes de tentar o envio e insere a linha com o resultado.
//
// Padrao polimorfico B para o remetente:
// - `sentBy`     VARCHAR(36) — `employees.id` (RH) ou `superAdmins.id`
//   (Bruno) sempre serializado como string, para uniformidade.
// - `sentByType` ENUM('employee','superAdmin') distingue a origem.
//
// Reader canonico: `countRemindersInCooldownWindow` alimenta o gate de
// cooldown antes do envio (Bloco B3). Cobre o indice `idx_prl_cooldown`
// (employeeId, instrumentType, cycleReference, sentAt DESC).

import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { portalReminderLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewPortalReminderLog = typeof portalReminderLog.$inferInsert;

/**
 * Insere uma linha no log de lembretes do portal. O caller fornece o
 * `id` (UUID CHAR(36)). Erros de FK (`employeeId`) sobem como excecoes
 * do mysql2. Retorna o UUID inserido para conveniencia do caller.
 */
export async function insertPortalReminderLog(
  db: RoipDatabase,
  data: NewPortalReminderLog,
): Promise<string> {
  await db.insert(portalReminderLog).values(data);
  return data.id;
}

/**
 * Busca uma linha pelo `id` (UUID). Retorna `undefined` se nao existir.
 */
export async function getPortalReminderLogById(db: RoipDatabase, id: string) {
  const rows = await db
    .select()
    .from(portalReminderLog)
    .where(eq(portalReminderLog.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Conta lembretes dentro da janela de cooldown para uma tupla
 * (employeeId, instrumentType, cycleReference) desde `since`. Alimenta
 * o gate de cooldown (Bloco B3). `cycleReference` nulo (caso Meu
 * perfil) e filtrado via `IS NULL`.
 */
export async function countRemindersInCooldownWindow(
  db: RoipDatabase,
  employeeId: number,
  instrumentType: 'meuPerfil' | 'autoAvaliacao' | 'avaliacaoLiderancaDireta' | 'radarNR1',
  cycleReference: string | null,
  since: Date,
): Promise<number> {
  const cycleClause =
    cycleReference === null
      ? isNull(portalReminderLog.cycleReference)
      : eq(portalReminderLog.cycleReference, cycleReference);
  const rows = await db
    .select({ n: count() })
    .from(portalReminderLog)
    .where(
      and(
        eq(portalReminderLog.employeeId, employeeId),
        eq(portalReminderLog.instrumentType, instrumentType),
        cycleClause,
        gte(portalReminderLog.sentAt, since),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Lista lembretes de um employee para um instrumento desde `since`,
 * ordenados por `sentAt` descendente. Cobre o indice `idx_prl_cooldown`.
 */
export async function listRemindersByEmployeeSince(
  db: RoipDatabase,
  employeeId: number,
  instrumentType: 'meuPerfil' | 'autoAvaliacao' | 'avaliacaoLiderancaDireta' | 'radarNR1',
  cycleReference: string | null,
  since: Date,
) {
  const cycleClause =
    cycleReference === null
      ? isNull(portalReminderLog.cycleReference)
      : eq(portalReminderLog.cycleReference, cycleReference);
  return await db
    .select()
    .from(portalReminderLog)
    .where(
      and(
        eq(portalReminderLog.employeeId, employeeId),
        eq(portalReminderLog.instrumentType, instrumentType),
        cycleClause,
        gte(portalReminderLog.sentAt, since),
      ),
    )
    .orderBy(desc(portalReminderLog.sentAt), desc(portalReminderLog.id));
}

/**
 * Remove todos os lembretes de um employee (teardown de testes).
 * Retorna linhas afetadas.
 */
export async function deletePortalReminderLogByEmployee(
  db: RoipDatabase,
  employeeId: number,
): Promise<number> {
  const [result] = await db
    .delete(portalReminderLog)
    .where(eq(portalReminderLog.employeeId, employeeId));
  return result.affectedRows;
}
