// ROIP APP 9BOX — service `individualProfilePlaceholders` (ME-011).
//
// Repositorio tipado da tabela `individualProfilePlaceholders` (DOC 01
// §4.9). Registra pendencia do Perfil Individual no portal. Ator
// polimorfico padrao B (`userType` + `userId` sem FK formal). Transicoes de
// `status` vivem nos fluxos de Perfil Individual do Bloco B3 (DOC 03).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { individualProfilePlaceholders } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewIndividualProfilePlaceholder = typeof individualProfilePlaceholders.$inferInsert;

/** Enum canonico de `status` (§4.9). */
type PlaceholderStatus =
  'pendente' | 'em_andamento' | 'respondido' | 'inconsistente' | 'aguardando_nova_resposta';

/**
 * Cria um placeholder de Perfil Individual. Em producao, e chamado
 * automaticamente no cadastro de colaborador ou C-level (§4.9 regra 1).
 * Retorna o `id` autogerado.
 */
export async function insertPlaceholder(
  db: RoipDatabase,
  data: NewIndividualProfilePlaceholder,
): Promise<number> {
  const [result] = await db.insert(individualProfilePlaceholders).values(data).$returningId();
  if (!result) {
    throw new Error('insertPlaceholder: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Retorna o placeholder de um titular (userType + userId). Retorna
 * `undefined` se nao existir. Usado pelos motores do Perfil Individual
 * antes de transicionar status.
 */
export async function getPlaceholderByUser(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
) {
  const rows = await db
    .select()
    .from(individualProfilePlaceholders)
    .where(
      and(
        eq(individualProfilePlaceholders.companyId, companyId),
        eq(individualProfilePlaceholders.userType, userType),
        eq(individualProfilePlaceholders.userId, userId),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os placeholders de uma empresa em ordem crescente de `id`.
 * Consumida pelo dashboard de pendencias do RH e Bruno.
 */
export async function listPlaceholdersByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(individualProfilePlaceholders)
    .where(eq(individualProfilePlaceholders.companyId, companyId))
    .orderBy(asc(individualProfilePlaceholders.id));
}

/**
 * Atualiza o `status` de um placeholder. Quando o status alvo e
 * `respondido`, o caller deve fornecer o timestamp em `respondidoEm` (o
 * schema aceita NULL — a semantica de "quando" fica com o caller).
 * Retorna o numero de linhas afetadas.
 */
export async function updatePlaceholderStatus(
  db: RoipDatabase,
  id: number,
  status: PlaceholderStatus,
  respondidoEm: Date | null = null,
): Promise<number> {
  const [result] = await db
    .update(individualProfilePlaceholders)
    .set({ status, respondidoEm })
    .where(eq(individualProfilePlaceholders.id, id));
  return result.affectedRows;
}
