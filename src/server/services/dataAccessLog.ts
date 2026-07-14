// ROIP APP 9BOX — service `dataAccessLog` (ME-012).
//
// Repositorio tipado da tabela canonica `dataAccessLog` (DOC 01 §14.2).
// Append-only (§16.1 item 7): apenas INSERT. Nenhum UPDATE nem DELETE
// sobre registros existentes — a limpeza fisica so ocorre em cascata pelo
// ON DELETE CASCADE da FK `titularEmployeeId` (§14.2). Este service NAO
// expoe delete nem update: e uma restricao canonica, nao uma limitacao
// tecnica.
//
// Agente polimorfico padrao B (§2.3 e §14.2): `agentType` enum
// (`super_admin | rh | lider | clevel`) + `agentId` sem FK formal — o
// historico sobrevive a delecao do agente. Integridade do par (agentType,
// agentId) e responsabilidade do caller (verificar existencia do agente
// em `superAdmins`, `employees` ou `cLevelMembers` conforme o tipo).
//
// Consumo canonico (DOC 06): as inserсoes ocorrem automaticamente no
// backend a cada leitura seletiva dentro do escopo fechado — dashboard
// individual, relatorio do Perfil Individual e exportacoes em planilha
// (enum `tipoAcesso`). As listagens sao acessadas pela Fase 8 (telas
// `/super-admin/logs/acesso-individual` e `/logs/acesso-individual`).

import { desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { dataAccessLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewDataAccessLogEntry = typeof dataAccessLog.$inferInsert;

/**
 * Insere uma entrada no log de acesso individual. Retorna o `id`
 * autogerado. Erros de FK (`companyId` invalido, `titularEmployeeId`
 * invalido) sobem como excecoes do mysql2. Em producao, a insercao ocorre
 * atomicamente com a leitura logada (o backend registra antes de devolver
 * a resposta ao agente), mas essa atomicidade e responsabilidade do
 * caller.
 */
export async function insertDataAccessLogEntry(
  db: RoipDatabase,
  data: NewDataAccessLogEntry,
): Promise<number> {
  const [result] = await db.insert(dataAccessLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertDataAccessLogEntry: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca uma entrada pelo `id`. Retorna `undefined` se nao existir. Uso
 * pontual em telas administrativas (drill-down a partir da listagem).
 */
export async function getDataAccessLogById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(dataAccessLog).where(eq(dataAccessLog.id, id)).limit(1);
  return rows[0];
}

/**
 * Lista todas as entradas de log de uma empresa em ordem cronologica
 * decrescente por `createdAt` (mais recente primeiro), com desempate por
 * `id` decrescente. Consumida pela tela `/logs/acesso-individual` (RH) e
 * `/super-admin/logs/acesso-individual` (Bruno, filtrada por empresa) —
 * DOC 06.
 */
export async function listDataAccessLogByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(dataAccessLog)
    .where(eq(dataAccessLog.companyId, companyId))
    .orderBy(desc(dataAccessLog.createdAt), desc(dataAccessLog.id));
}

/**
 * Lista todas as entradas de log de um titular especifico em ordem
 * cronologica decrescente por `createdAt`. Suporta a visao "quem acessou
 * meus dados" quando/se exposta em portal futuro; hoje usada apenas em
 * operacoes internas de auditoria.
 */
export async function listDataAccessLogByTitular(db: RoipDatabase, titularEmployeeId: number) {
  return await db
    .select()
    .from(dataAccessLog)
    .where(eq(dataAccessLog.titularEmployeeId, titularEmployeeId))
    .orderBy(desc(dataAccessLog.createdAt), desc(dataAccessLog.id));
}
