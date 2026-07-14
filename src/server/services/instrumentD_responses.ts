// ROIP APP 9BOX — service `instrumentD_responses` (ME-015).
//
// Repositorio tipado da tabela canonica `instrumentD_responses` (DOC 01
// §8.7). Avaliacao ascendente do lider (Instrumento D) — 20 itens (4
// dimensoes x 5 itens), valores 0-4, com `versaoInstrumento` (default 1).
// Entrada do IQL (§8.8).
//
// Polimorfismo padrao A (§2.3) no AVALIADO: `liderId` (employee) XOR
// `clevelId` (C-level), ambos com FK nativa RESTRICT; o CHECK canonico
// `chk_iD_avaliado_unico` (vive na migration — S004) bloqueia linha com
// os dois preenchidos ou os dois nulos. O respondente e sempre
// `respondenteId` (employee NOT NULL).
//
// Regime de mutabilidade (§16.2): respostas nunca sao editadas nem
// excluidas; correcoes ocorrem apenas via fluxo canonico de
// desbloqueio/reprocessamento que grava por cima dentro da janela
// autorizada. A UNIQUE `uq_iD_unica_resposta` (respondenteId, trimestre,
// dimensao, itemIndex) garante a unicidade logica por item respondido. A
// unica mutacao exposta e `overwriteInstrumentDResponseValor`. Nenhum
// DELETE. A resposta completa (20 registros) e gravada pelo caller em
// transacao atomica (§8.7).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { instrumentD_responses } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewInstrumentDResponse = typeof instrumentD_responses.$inferInsert;

/**
 * Insere um item de resposta do Instrumento D. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `respondenteId`, `liderId`,
 * `clevelId`), de UNIQUE (`uq_iD_unica_resposta`) e do CHECK
 * `chk_iD_avaliado_unico` sobem como excecoes do mysql2.
 */
export async function insertInstrumentDResponse(
  db: RoipDatabase,
  data: NewInstrumentDResponse,
): Promise<number> {
  const [result] = await db.insert(instrumentD_responses).values(data).$returningId();
  if (!result) {
    throw new Error('insertInstrumentDResponse: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um item pelo `id`. Retorna `undefined` se nao existir. */
export async function getInstrumentDResponseById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(instrumentD_responses)
    .where(eq(instrumentD_responses.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca um item pela chave logica UNIQUE (`respondenteId`, `trimestre`,
 * `dimensao`, `itemIndex`). Retorna `undefined` se nao existir.
 */
export async function getInstrumentDResponseByKey(
  db: RoipDatabase,
  respondenteId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
) {
  const rows = await db
    .select()
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.respondenteId, respondenteId),
        eq(instrumentD_responses.trimestre, trimestre),
        eq(instrumentD_responses.dimensao, dimensao),
        eq(instrumentD_responses.itemIndex, itemIndex),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista os itens de um respondente em um trimestre, ordenados por
 * (`dimensao`, `itemIndex`) ascendente — a resposta completa tem 20
 * itens. Cobre o indice `idx_iD_resp_trim`.
 */
export async function listInstrumentDResponsesByRespondenteQuarter(
  db: RoipDatabase,
  respondenteId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.respondenteId, respondenteId),
        eq(instrumentD_responses.trimestre, trimestre),
      ),
    )
    .orderBy(asc(instrumentD_responses.dimensao), asc(instrumentD_responses.itemIndex));
}

/**
 * Lista os itens que avaliam um lider employee em um trimestre,
 * ordenados por (`respondenteId`, `dimensao`, `itemIndex`) ascendente.
 * Cobre o indice `idx_iD_lider_trim` — consumida pelo motor IQL (§8.8).
 */
export async function listInstrumentDResponsesByLiderQuarter(
  db: RoipDatabase,
  liderId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.liderId, liderId),
        eq(instrumentD_responses.trimestre, trimestre),
      ),
    )
    .orderBy(
      asc(instrumentD_responses.respondenteId),
      asc(instrumentD_responses.dimensao),
      asc(instrumentD_responses.itemIndex),
    );
}

/**
 * Lista os itens que avaliam um C-level em um trimestre, ordenados por
 * (`respondenteId`, `dimensao`, `itemIndex`) ascendente. Cobre o indice
 * `idx_iD_clevel_trim` — consumida pelo motor IQL (§8.8).
 */
export async function listInstrumentDResponsesByClevelQuarter(
  db: RoipDatabase,
  clevelId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.clevelId, clevelId),
        eq(instrumentD_responses.trimestre, trimestre),
      ),
    )
    .orderBy(
      asc(instrumentD_responses.respondenteId),
      asc(instrumentD_responses.dimensao),
      asc(instrumentD_responses.itemIndex),
    );
}

/**
 * Grava por cima o `valor` de um item existente, pela chave logica
 * UNIQUE, atualizando tambem `respondidoEm`. Esta e a UNICA mutacao
 * autorizada sobre esta tabela (§16.2) — consumida exclusivamente pelo
 * fluxo canonico de desbloqueio/reprocessamento dentro da janela
 * autorizada (Bloco B3). Retorna o numero de linhas afetadas (0 se a
 * chave nao existir).
 */
export async function overwriteInstrumentDResponseValor(
  db: RoipDatabase,
  respondenteId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
  valor: number,
  respondidoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(instrumentD_responses)
    .set({ valor, respondidoEm })
    .where(
      and(
        eq(instrumentD_responses.respondenteId, respondenteId),
        eq(instrumentD_responses.trimestre, trimestre),
        eq(instrumentD_responses.dimensao, dimensao),
        eq(instrumentD_responses.itemIndex, itemIndex),
      ),
    );
  return result.affectedRows;
}
