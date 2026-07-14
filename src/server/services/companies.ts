// ROIP APP 9BOX — service `companies` (ME-010).
//
// Repositorio tipado da tabela canonica `companies` (DOC 01 §4.2). Toda
// persistencia via API tipada do Drizzle — nenhum SQL cru (RV-12). Cada
// export tem chamador nos testes de integracao da propria ME-010 (RV-13),
// e futuramente nos routers tRPC (Bloco B2).

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `companies`). */
export type NewCompany = typeof companies.$inferInsert;

/**
 * Insere uma nova empresa. Retorna o `id` autogerado. Nao valida regras de
 * negocio da §4.2 (isso vive nos routers da B3); aqui e apenas persistencia
 * tipada.
 */
export async function createCompany(db: RoipDatabase, data: NewCompany): Promise<number> {
  const [result] = await db.insert(companies).values(data).$returningId();
  if (!result) {
    throw new Error('createCompany: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca uma empresa pelo id. Retorna `undefined` se nao existir.
 */
export async function getCompanyById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca uma empresa pelo CNPJ (apenas digitos, sem formatacao — DOC 01
 * §4.2). Retorna `undefined` se nao existir.
 */
export async function getCompanyByCnpj(db: RoipDatabase, cnpj: string) {
  const rows = await db.select().from(companies).where(eq(companies.cnpj, cnpj)).limit(1);
  return rows[0];
}

/**
 * Atualiza apenas o campo `status` de uma empresa. Nao toca em outros
 * campos. Retorna o numero de linhas afetadas para permitir asserts de
 * teste sem SELECT adicional.
 */
export async function updateCompanyStatus(
  db: RoipDatabase,
  id: number,
  status: 'ativa' | 'inativa',
): Promise<number> {
  const [result] = await db.update(companies).set({ status }).where(eq(companies.id, id));
  return result.affectedRows;
}

/**
 * Remove uma empresa pelo id. Somente para uso em teardown de testes; em
 * producao a inativacao e via `updateCompanyStatus`. Retorna o numero de
 * linhas afetadas.
 */
export async function deleteCompanyById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(companies).where(eq(companies.id, id));
  return result.affectedRows;
}
