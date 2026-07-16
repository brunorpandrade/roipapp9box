// ROIP APP 9BOX — service `cLevelMembers` (ME-011).
//
// Repositorio tipado da tabela canonica `cLevelMembers` (DOC 01 §4.4).
// Regras de negocio (procedure `setResponsavelFinanceiro`, guarda de
// `acessoTotal` quando ha C-level unico, exclusividade global do papel
// financeiro entre employees + cLevelMembers) vivem no Bloco B3, sobre
// estes primitivos.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `cLevelMembers`). */
export type NewCLevelMember = typeof cLevelMembers.$inferInsert;

/**
 * Insere um novo C-level. Retorna o `id` autogerado. Erros de FK
 * (`companyId` invalido) e de UNIQUE (`uq_clevel_cpf`) sobem como excecoes
 * do mysql2.
 */
export async function createCLevelMember(db: RoipDatabase, data: NewCLevelMember): Promise<number> {
  const [result] = await db.insert(cLevelMembers).values(data).$returningId();
  if (!result) {
    throw new Error('createCLevelMember: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um C-level pelo id. Retorna `undefined` se nao existir. */
export async function getCLevelMemberById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(cLevelMembers).where(eq(cLevelMembers.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um C-level pelo par (companyId, cpf) — UNIQUE canonico da §4.4.
 * Retorna `undefined` se nao existir.
 */
export async function getCLevelMemberByCpf(db: RoipDatabase, companyId: number, cpf: string) {
  const rows = await db
    .select()
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.cpf, cpf)))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os C-levels de uma empresa em ordem crescente de `id`.
 * Consumida por rotas de painel C-level e pelo motor de organograma (§11).
 */
export async function listCLevelMembersByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(cLevelMembers)
    .where(eq(cLevelMembers.companyId, companyId))
    .orderBy(asc(cLevelMembers.id));
}

/**
 * Atualiza apenas `status` do C-level. Retorna o numero de linhas
 * afetadas. Regras de fluxo (`inativo` bloqueado se responsavel financeiro
 * vigente) vivem no Bloco B3.
 */
export async function updateCLevelStatus(
  db: RoipDatabase,
  id: number,
  status: 'ativo' | 'inativo',
): Promise<number> {
  const [result] = await db.update(cLevelMembers).set({ status }).where(eq(cLevelMembers.id, id));
  return result.affectedRows;
}

/**
 * Setter simples do papel funcional `isResponsavelFinanceiro` no C-level.
 * Cardinalidade global entre employees e cLevelMembers e responsabilidade
 * do Bloco B3.
 */
export async function setCLevelIsResponsavelFinanceiro(
  db: RoipDatabase,
  id: number,
  value: boolean,
): Promise<number> {
  const [result] = await db
    .update(cLevelMembers)
    .set({ isResponsavelFinanceiro: value })
    .where(eq(cLevelMembers.id, id));
  return result.affectedRows;
}

/**
 * Remove um C-level pelo id. Somente para teardown de testes; em producao a
 * inativacao e via `updateCLevelStatus` e o gate estrutural bloqueia
 * exclusao com historico (ON DELETE RESTRICT das tabelas dependentes).
 */
export async function deleteCLevelMemberById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(cLevelMembers).where(eq(cLevelMembers.id, id));
  return result.affectedRows;
}

/**
 * Atualiza a credencial (`passwordHash` e opcionalmente `passwordSet`) de
 * um C-level. Consumidores canonicos (DOC 02 §4.5, §4.7):
 *
 *   - `auth.resetPassword` (ME-022b): passa `passwordSet` omitido.
 *   - `auth.firstAccess` (ME-022b): passa `passwordSet: true` (primeira
 *     definicao de senha — libera o login §5.5).
 *   - `auth.changePassword` (ME-022c): passa `passwordSet` omitido.
 *
 * A troca de `passwordHash` invalida naturalmente todas as sessoes JWT
 * anteriores (§5.7 via S011).
 *
 * Retorna o numero de linhas afetadas.
 */
export async function updateCLevelMemberCredential(
  db: RoipDatabase,
  id: number,
  data: { passwordHash: string; passwordSet?: boolean },
): Promise<number> {
  const patch: { passwordHash: string; passwordSet?: boolean } = {
    passwordHash: data.passwordHash,
  };
  if (data.passwordSet !== undefined) {
    patch.passwordSet = data.passwordSet;
  }
  const [result] = await db.update(cLevelMembers).set(patch).where(eq(cLevelMembers.id, id));
  return result.affectedRows;
}
