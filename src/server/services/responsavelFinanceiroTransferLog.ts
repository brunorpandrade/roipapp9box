// ROIP APP 9BOX — service `responsavelFinanceiroTransferLog` (ME-011).
//
// Log dedicado append-only das transicoes do papel Responsavel financeiro
// (DOC 01 §5.1). Registro obrigatorio em qualquer transacao
// `company.setResponsavelFinanceiro` do Bloco B3. Aqui expomos apenas os
// primitivos de insercao e leitura — o append-only e a exclusividade de
// Bruno como ator sao garantidos pelo caller.

import { asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { responsavelFinanceiroTransferLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewTransferLogEntry = typeof responsavelFinanceiroTransferLog.$inferInsert;

/**
 * Insere um evento no log de transferencia. Retorna o `id` autogerado.
 * Erros de FK (`companyId`, `actorSuperAdminId`) sobem como excecoes do
 * mysql2.
 */
export async function insertTransferLogEntry(
  db: RoipDatabase,
  data: NewTransferLogEntry,
): Promise<number> {
  const [result] = await db.insert(responsavelFinanceiroTransferLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertTransferLogEntry: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista todos os eventos do log de uma empresa em ordem cronologica
 * crescente (do mais antigo ao mais recente). Consumida pela superficie
 * `/super-admin/logs/responsavel-financeiro` (DOC 06).
 */
export async function listTransferLogByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(responsavelFinanceiroTransferLog)
    .where(eq(responsavelFinanceiroTransferLog.companyId, companyId))
    .orderBy(
      asc(responsavelFinanceiroTransferLog.createdAt),
      asc(responsavelFinanceiroTransferLog.id),
    );
}

/**
 * Retorna o evento mais recente do log de uma empresa. Consumido pela
 * procedure `setResponsavelFinanceiro` (B3) para descobrir o titular
 * vigente sem varredura de employees + cLevelMembers. Retorna `undefined`
 * se a empresa nunca teve titular.
 */
export async function getLatestTransferLogByCompany(db: RoipDatabase, companyId: number) {
  const rows = await db
    .select()
    .from(responsavelFinanceiroTransferLog)
    .where(eq(responsavelFinanceiroTransferLog.companyId, companyId))
    .orderBy(
      desc(responsavelFinanceiroTransferLog.createdAt),
      desc(responsavelFinanceiroTransferLog.id),
    )
    .limit(1);
  return rows[0];
}
