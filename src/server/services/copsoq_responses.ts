// ROIP APP 9BOX — service `copsoq_responses` (ME-016).
//
// Repositorio tipado da tabela canonica `copsoq_responses` (DOC 01
// §11.3 — nomenclatura com underscore preservada). Respostas
// individuais ao Instrumento B do Radar NR-1: 32 itens (8 fatores x 4
// itens), valores 0-4. Filha de `copsoqCycles` com ON DELETE CASCADE.
//
// Regime de mutabilidade (§16.2): mesmo regime dos instrumentos A/C/D —
// respostas nunca sao editadas nem excluidas; a unica mutacao
// autorizada e a sobrescrita item-a-item pelo fluxo canonico dentro da
// janela do ciclo, exposta em `overwriteCopsoqResponseValor`. A UNIQUE
// `uq_resposta` (cicloDbId, employeeId, fator, itemIndex) garante a
// unicidade logica de cada item. Nenhum DELETE em producao — a limpeza
// ocorre exclusivamente pelo CASCADE do ciclo pai.
//
// Os intervalos canonicos sao impostos pelo banco na migration §S004
// (`chk_fator` 1-8, `chk_itemIndex` 1-4, `chk_valor` 0-4); violacoes
// sobem como excecoes do mysql2. `versaoInstrumento` tem default
// 'placeholder_MVP_v1' (§11.3): a substituicao futura dos 32 itens
// pelos itens licenciados gera nova versao, sem recalcular respostas
// anteriores.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { copsoq_responses } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCopsoqResponse = typeof copsoq_responses.$inferInsert;

/**
 * Insere um item de resposta do Instrumento B. Retorna o `id`
 * autogerado. Erros de FK (`cicloDbId`, `companyId`, `employeeId`), de
 * UNIQUE (`uq_resposta`) e dos CHECKs canonicos sobem como excecoes do
 * mysql2.
 */
export async function insertCopsoqResponse(
  db: RoipDatabase,
  data: NewCopsoqResponse,
): Promise<number> {
  const [result] = await db.insert(copsoq_responses).values(data).$returningId();
  if (!result) {
    throw new Error('insertCopsoqResponse: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um item pelo `id`. Retorna `undefined` se nao existir. */
export async function getCopsoqResponseById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(copsoq_responses).where(eq(copsoq_responses.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um item pela chave logica UNIQUE (`cicloDbId`, `employeeId`,
 * `fator`, `itemIndex`). Retorna `undefined` se nao existir.
 */
export async function getCopsoqResponseByKey(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
  fator: number,
  itemIndex: number,
) {
  const rows = await db
    .select()
    .from(copsoq_responses)
    .where(
      and(
        eq(copsoq_responses.cicloDbId, cicloDbId),
        eq(copsoq_responses.employeeId, employeeId),
        eq(copsoq_responses.fator, fator),
        eq(copsoq_responses.itemIndex, itemIndex),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista os itens de um colaborador em um ciclo, ordenados por
 * (`fator`, `itemIndex`) ascendente — a resposta completa tem 32
 * itens. Cobre o indice `idx_responses_ciclo_employee`; consumida pelo
 * motor de validade (uniformidade/tempo) do Bloco B3.
 */
export async function listCopsoqResponsesByCicloEmployee(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
) {
  return await db
    .select()
    .from(copsoq_responses)
    .where(
      and(eq(copsoq_responses.cicloDbId, cicloDbId), eq(copsoq_responses.employeeId, employeeId)),
    )
    .orderBy(asc(copsoq_responses.fator), asc(copsoq_responses.itemIndex));
}

/**
 * Lista todos os itens de um fator em um ciclo, ordenados por
 * (`employeeId`, `itemIndex`) ascendente. Cobre o indice
 * `idx_responses_ciclo_fator` — base do calculo de score por fator
 * (§11.4).
 */
export async function listCopsoqResponsesByCicloFator(
  db: RoipDatabase,
  cicloDbId: number,
  fator: number,
) {
  return await db
    .select()
    .from(copsoq_responses)
    .where(and(eq(copsoq_responses.cicloDbId, cicloDbId), eq(copsoq_responses.fator, fator)))
    .orderBy(asc(copsoq_responses.employeeId), asc(copsoq_responses.itemIndex));
}

/**
 * Grava por cima o `valor` de um item existente, pela chave logica
 * UNIQUE. Esta e a UNICA mutacao autorizada sobre esta tabela (§16.2)
 * — consumida exclusivamente pelo fluxo canonico de sobrescrita
 * item-a-item dentro da janela do ciclo (Bloco B3). Retorna o numero
 * de linhas afetadas (0 se a chave nao existir).
 */
export async function overwriteCopsoqResponseValor(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
  fator: number,
  itemIndex: number,
  valor: number,
): Promise<number> {
  const [result] = await db
    .update(copsoq_responses)
    .set({ valor })
    .where(
      and(
        eq(copsoq_responses.cicloDbId, cicloDbId),
        eq(copsoq_responses.employeeId, employeeId),
        eq(copsoq_responses.fator, fator),
        eq(copsoq_responses.itemIndex, itemIndex),
      ),
    );
  return result.affectedRows;
}
