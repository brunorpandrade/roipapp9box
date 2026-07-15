// ROIP APP 9BOX — service `aiConversations` (ME-017).
//
// Repositorio tipado da tabela canonica `aiConversations` (DOC 01 §10.2).
// Historico do Chat IA dos dashboards no padrao polimorfico B para o
// usuario (userId + userType). Cada mensagem e uma linha (par de
// pergunta/resposta e reconstituido no leitor por `createdAt` + `role`).
// Tabela imutavel por regra de negocio §16.2: nunca deletadas em
// producao — arquivamento semestral via `archivedAt`. Historico ativo
// tem `archivedAt IS NULL`; arquivado e read-only.
//
// Escopos canonicos de `contextId` (§10.2):
// - `individual` → `employees.id`
// - `equipe`     → `employees.id` do lider
// - `departamento` → id resolvido pelo backend a partir do enum
// - `global`     → NULL
//
// A coerencia do trio (userId, userType, dashboardLevel) e a resolucao
// de `contextId` sao responsabilidade do caller — o service apenas
// grava e le pelo indice canonico `idx_ac_user_ctx`.

import { and, asc, eq, isNull, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { aiConversations } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewAiConversation = typeof aiConversations.$inferInsert;

/**
 * Insere uma mensagem no historico do Chat IA. Retorna o `id`
 * autogerado. Erros de FK (`companyId`) sobem como excecoes do mysql2.
 */
export async function insertAiConversation(
  db: RoipDatabase,
  data: NewAiConversation,
): Promise<number> {
  const [result] = await db.insert(aiConversations).values(data).$returningId();
  if (!result) {
    throw new Error('insertAiConversation: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Lista o historico ATIVO de um usuario para um contexto de dashboard,
 * ordenado por `createdAt` ascendente. Cobre o indice
 * `idx_ac_user_ctx` (userId, userType, dashboardLevel, contextId,
 * archivedAt). `contextId` nulo (dashboard global) e filtrado via
 * `IS NULL` porque o operador `=` em MySQL nao casa NULL.
 */
export async function listAiConversationsActive(
  db: RoipDatabase,
  userId: number,
  userType: 'employee' | 'clevel' | 'super_admin',
  dashboardLevel: 'global' | 'departamento' | 'equipe' | 'individual',
  contextId: number | null,
) {
  const contextClause =
    contextId === null
      ? isNull(aiConversations.contextId)
      : eq(aiConversations.contextId, contextId);
  return await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.userId, userId),
        eq(aiConversations.userType, userType),
        eq(aiConversations.dashboardLevel, dashboardLevel),
        contextClause,
        isNull(aiConversations.archivedAt),
      ),
    )
    .orderBy(asc(aiConversations.createdAt), asc(aiConversations.id));
}

/**
 * Marca como arquivado (archivedAt = valor) todo historico ATIVO de uma
 * empresa cuja `createdAt` seja anterior ao `cutoff`. Usada pelo job
 * semestral (Bloco B3). Retorna linhas afetadas.
 */
export async function archiveAiConversationsBefore(
  db: RoipDatabase,
  companyId: number,
  cutoff: Date,
  archivedAt: Date,
): Promise<number> {
  const [result] = await db
    .update(aiConversations)
    .set({ archivedAt })
    .where(
      and(
        eq(aiConversations.companyId, companyId),
        lt(aiConversations.createdAt, cutoff),
        isNull(aiConversations.archivedAt),
      ),
    );
  return result.affectedRows;
}

/**
 * Remove todo o historico de uma empresa (teardown de testes; producao
 * usa arquivamento). Retorna linhas afetadas.
 */
export async function deleteAiConversationsByCompanyId(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(aiConversations).where(eq(aiConversations.companyId, companyId));
  return result.affectedRows;
}
