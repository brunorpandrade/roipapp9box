// ROIP APP 9BOX — service `employees` (ME-011).
//
// Repositorio tipado da tabela canonica `employees` (DOC 01 §4.5). Toda
// persistencia via API tipada do Drizzle — nenhuma execucao crua (RV-12).
// Cada export tem chamador nos testes de integracao da propria ME-011
// (RV-13), e futuramente nos routers tRPC (Bloco B2/B3).
//
// A ME-011 nao implementa as regras de negocio da §4.5 (validacao de
// `isResponsavelFinanceiro` global entre employees + cLevelMembers,
// procedure `setResponsavelFinanceiro`, gates de inativacao/delecao). Essas
// regras vivem no Bloco B3, sobre estes primitivos.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees } from '../../db/schema';
import type { OnboardingEstagio } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `employees`). */
export type NewEmployee = typeof employees.$inferInsert;

/**
 * Insere um novo colaborador. Retorna o `id` autogerado. Erros de FK
 * (`companyId` invalido) e de UNIQUE (`uq_employee_cpf`) sobem como
 * excecoes do mysql2.
 */
export async function createEmployee(db: RoipDatabase, data: NewEmployee): Promise<number> {
  const [result] = await db.insert(employees).values(data).$returningId();
  if (!result) {
    throw new Error('createEmployee: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um colaborador pelo id. Retorna `undefined` se nao existir. */
export async function getEmployeeById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um colaborador pelo par (companyId, cpf) — o UNIQUE canonico da
 * §4.5. Retorna `undefined` se nao existir.
 */
export async function getEmployeeByCpf(db: RoipDatabase, companyId: number, cpf: string) {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.cpf, cpf)))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os colaboradores de uma empresa em ordem crescente de `id`.
 * Consumida por rotas de listagem e por batches de calculo (B3).
 */
export async function listEmployeesByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, companyId))
    .orderBy(asc(employees.id));
}

/**
 * Atualiza apenas o campo `status` de um colaborador. Nao toca em outros
 * campos. Retorna o numero de linhas afetadas.
 */
export async function updateEmployeeStatus(
  db: RoipDatabase,
  id: number,
  status: 'ativo' | 'inativo',
): Promise<number> {
  const [result] = await db.update(employees).set({ status }).where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Atualiza o estagio de onboarding de lider (§4.5 — relevante apenas quando
 * `isLider = true`). Retorna o numero de linhas afetadas.
 */
export async function updateOnboardingEstagio(
  db: RoipDatabase,
  id: number,
  estagio: OnboardingEstagio,
): Promise<number> {
  const [result] = await db
    .update(employees)
    .set({ onboardingEstagio: estagio })
    .where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Setter simples do papel funcional `isResponsavelFinanceiro`. A garantia de
 * cardinalidade global (max 1 `true` por empresa considerando a uniao com
 * `cLevelMembers`, §4.5) e responsabilidade da procedure
 * `setResponsavelFinanceiro` do Bloco B3 — nao imposta aqui. Retorna o
 * numero de linhas afetadas.
 */
export async function setEmployeeIsResponsavelFinanceiro(
  db: RoipDatabase,
  id: number,
  value: boolean,
): Promise<number> {
  const [result] = await db
    .update(employees)
    .set({ isResponsavelFinanceiro: value })
    .where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Remove um colaborador pelo id. Somente para teardown de testes — em
 * producao a inativacao e via `updateEmployeeStatus` e o gate estrutural de
 * ON DELETE RESTRICT bloqueia excluir colaborador com historico analitico
 * (§17.3). Retorna o numero de linhas afetadas.
 */
export async function deleteEmployeeById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(employees).where(eq(employees.id, id));
  return result.affectedRows;
}
