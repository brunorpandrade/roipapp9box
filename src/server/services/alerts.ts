// ROIP APP 9BOX — service `alerts` (ME-017).
//
// Repositorio tipado da tabela canonica `alerts` (DOC 01 §12.3). Fatos
// detectados pelo motor deterministico. Imutavel por regra de negocio
// §16.2: nunca deletados, incluindo os suprimidos por cooldown.
//
// Por que so INSERT + leitura, sem setter:
// - `suprimidoPorCooldown` e decidido pelo pipeline anti-ruido ANTES do
//   INSERT (passo M4). O caller calcula a supressao consultando os
//   alertas anteriores e grava a linha ja com o valor final. Nao existe
//   mutacao pos-insert.
// - `tipo` e VARCHAR(50) com enum logico de aplicacao (§15.2 — 17
//   valores). A validacao contra a lista fechada e responsabilidade do
//   caller (motor `emitAlert`) — o service so aceita o valor gravado.
// - Escopo polimorfico (`empresa` | `departamento` | `colaborador`):
//   coerencia entre `escopo` e os campos `escopo*Id` e do caller.

import { and, desc, eq, gte } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { alerts } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewAlert = typeof alerts.$inferInsert;

/**
 * Insere um alerta. Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `escopoDepartamentoId`, `escopoEmployeeId`,
 * `cicloDbId`) sobem como excecoes do mysql2.
 */
export async function insertAlert(db: RoipDatabase, data: NewAlert): Promise<number> {
  const [result] = await db.insert(alerts).values(data).$returningId();
  if (!result) {
    throw new Error('insertAlert: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um alerta pelo `id`. Retorna `undefined` se nao existir. */
export async function getAlertById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return rows[0];
}

/**
 * Lista os alertas de uma empresa ordenados por `createdAt`
 * descendente. Cobre o indice `idx_alerts_company_created`.
 */
export async function listAlertsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(alerts)
    .where(eq(alerts.companyId, companyId))
    .orderBy(desc(alerts.createdAt), desc(alerts.id));
}

/**
 * Lista alertas de um `tipo` para um `employeeId` a partir de `since`
 * (janela de cooldown), ordenados por `createdAt` descendente. Cobre
 * o indice `idx_alerts_tipo_employee_created`.
 */
export async function listAlertsByTipoEmployeeSince(
  db: RoipDatabase,
  tipo: string,
  escopoEmployeeId: number,
  since: Date,
) {
  return await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.tipo, tipo),
        eq(alerts.escopoEmployeeId, escopoEmployeeId),
        gte(alerts.createdAt, since),
      ),
    )
    .orderBy(desc(alerts.createdAt), desc(alerts.id));
}

/**
 * Remove todos os alertas de uma empresa (teardown de testes; producao
 * mantem tudo por rastreabilidade). Retorna linhas afetadas.
 */
export async function deleteAlertsByCompany(db: RoipDatabase, companyId: number): Promise<number> {
  const [result] = await db.delete(alerts).where(eq(alerts.companyId, companyId));
  return result.affectedRows;
}
