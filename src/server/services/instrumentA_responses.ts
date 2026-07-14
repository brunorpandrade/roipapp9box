// ROIP APP 9BOX — service `instrumentA_responses` (ME-015).
//
// Repositorio tipado da tabela canonica `instrumentA_responses` (DOC 01
// §8.1). Autoavaliacao trimestral do colaborador — 20 itens (4 dimensoes
// x 5 itens), valores 0-4. Entrada do Eixo Y do 9-Box (via plenitude).
//
// Regime de mutabilidade (§16.2): respostas nunca sao editadas nem
// excluidas; correcoes ocorrem apenas via fluxo canonico de desbloqueio
// (registrado em `instrumentUnlockLog`, §8.5) que grava por cima dentro
// da janela autorizada. A UNIQUE `uq_iA_unica_resposta` (employeeId,
// trimestre, dimensao, itemIndex) garante a unicidade logica de cada
// item. A unica mutacao exposta e `overwriteInstrumentAResponseValor`,
// que atualiza `valor` e `respondidoEm` pela chave logica — consumida
// exclusivamente pelo fluxo de desbloqueio (Bloco B3). Nenhum DELETE.
//
// A resposta completa (20 registros) e gravada pelo caller em transacao
// atomica; este service persiste item a item e nao gerencia transacao.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { instrumentA_responses } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewInstrumentAResponse = typeof instrumentA_responses.$inferInsert;

/**
 * Insere um item de resposta do Instrumento A. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`) e de UNIQUE
 * (`uq_iA_unica_resposta`) sobem como excecoes do mysql2. A validacao
 * dos intervalos canonicos (dimensao 1-4, itemIndex 1-5, valor 0-4) e
 * responsabilidade do caller — este service apenas persiste.
 */
export async function insertInstrumentAResponse(
  db: RoipDatabase,
  data: NewInstrumentAResponse,
): Promise<number> {
  const [result] = await db.insert(instrumentA_responses).values(data).$returningId();
  if (!result) {
    throw new Error('insertInstrumentAResponse: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um item pelo `id`. Retorna `undefined` se nao existir. */
export async function getInstrumentAResponseById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(instrumentA_responses)
    .where(eq(instrumentA_responses.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca um item pela chave logica UNIQUE (`employeeId`, `trimestre`,
 * `dimensao`, `itemIndex`). Retorna `undefined` se nao existir.
 */
export async function getInstrumentAResponseByKey(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
) {
  const rows = await db
    .select()
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.employeeId, employeeId),
        eq(instrumentA_responses.trimestre, trimestre),
        eq(instrumentA_responses.dimensao, dimensao),
        eq(instrumentA_responses.itemIndex, itemIndex),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista os itens de um colaborador em um trimestre, ordenados por
 * (`dimensao`, `itemIndex`) ascendente — a resposta completa tem 20
 * itens. Consumida pelo motor de plenitude (Bloco B3).
 */
export async function listInstrumentAResponsesByEmployeeQuarter(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.employeeId, employeeId),
        eq(instrumentA_responses.trimestre, trimestre),
      ),
    )
    .orderBy(asc(instrumentA_responses.dimensao), asc(instrumentA_responses.itemIndex));
}

/**
 * Lista todos os itens de uma empresa em um trimestre, ordenados por
 * (`employeeId`, `dimensao`, `itemIndex`) ascendente. Consumida pelos
 * calculos de cobertura/adesao do Clima e Engajamento (§8.9).
 */
export async function listInstrumentAResponsesByCompanyQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.companyId, companyId),
        eq(instrumentA_responses.trimestre, trimestre),
      ),
    )
    .orderBy(
      asc(instrumentA_responses.employeeId),
      asc(instrumentA_responses.dimensao),
      asc(instrumentA_responses.itemIndex),
    );
}

/**
 * Grava por cima o `valor` de um item existente, pela chave logica
 * UNIQUE, atualizando tambem `respondidoEm`. Esta e a UNICA mutacao
 * autorizada sobre esta tabela (§16.2) — consumida exclusivamente pelo
 * fluxo canonico de desbloqueio dentro da janela autorizada (Bloco B3).
 * Retorna o numero de linhas afetadas (0 se a chave nao existir).
 */
export async function overwriteInstrumentAResponseValor(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
  valor: number,
  respondidoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(instrumentA_responses)
    .set({ valor, respondidoEm })
    .where(
      and(
        eq(instrumentA_responses.employeeId, employeeId),
        eq(instrumentA_responses.trimestre, trimestre),
        eq(instrumentA_responses.dimensao, dimensao),
        eq(instrumentA_responses.itemIndex, itemIndex),
      ),
    );
  return result.affectedRows;
}
