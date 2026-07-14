// ROIP APP 9BOX — service `instrumentC_assessments` (ME-015).
//
// Repositorio tipado da tabela canonica `instrumentC_assessments` (DOC 01
// §8.2). Avaliacao do lider sobre o liderado — 20 itens (4 dimensoes x 5
// itens), valores 0-4. Entrada do Eixo Y do 9-Box (via plenitude).
//
// Polimorfismo padrao A (§2.3) no AVALIADOR: `liderId` (employee) XOR
// `clevelId` (C-level), ambos com FK nativa RESTRICT; o CHECK canonico
// `chk_iC_avaliador_unico` (vive na migration — S004) bloqueia linha com
// os dois preenchidos ou os dois nulos. O avaliado e sempre `employeeId`.
//
// Regime de mutabilidade (§16.2): avaliacoes nunca sao editadas nem
// excluidas; correcoes ocorrem apenas via fluxo canonico de desbloqueio
// (`instrumentUnlockLog`, §8.5) que grava por cima dentro da janela
// autorizada. A UNIQUE `uq_iC_unica_avaliacao` (employeeId, trimestre,
// dimensao, itemIndex) garante a unicidade logica por item avaliado. A
// unica mutacao exposta e `overwriteInstrumentCAssessmentValor`. Nenhum
// DELETE. A avaliacao completa (20 registros) e gravada pelo caller em
// transacao atomica.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { instrumentC_assessments } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewInstrumentCAssessment = typeof instrumentC_assessments.$inferInsert;

/**
 * Insere um item de avaliacao do Instrumento C. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`, `liderId`,
 * `clevelId`), de UNIQUE (`uq_iC_unica_avaliacao`) e do CHECK
 * `chk_iC_avaliador_unico` sobem como excecoes do mysql2.
 */
export async function insertInstrumentCAssessment(
  db: RoipDatabase,
  data: NewInstrumentCAssessment,
): Promise<number> {
  const [result] = await db.insert(instrumentC_assessments).values(data).$returningId();
  if (!result) {
    throw new Error('insertInstrumentCAssessment: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um item pelo `id`. Retorna `undefined` se nao existir. */
export async function getInstrumentCAssessmentById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(instrumentC_assessments)
    .where(eq(instrumentC_assessments.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca um item pela chave logica UNIQUE (`employeeId`, `trimestre`,
 * `dimensao`, `itemIndex`). Retorna `undefined` se nao existir.
 */
export async function getInstrumentCAssessmentByKey(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
) {
  const rows = await db
    .select()
    .from(instrumentC_assessments)
    .where(
      and(
        eq(instrumentC_assessments.employeeId, employeeId),
        eq(instrumentC_assessments.trimestre, trimestre),
        eq(instrumentC_assessments.dimensao, dimensao),
        eq(instrumentC_assessments.itemIndex, itemIndex),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista os itens de avaliacao de um colaborador avaliado em um
 * trimestre, ordenados por (`dimensao`, `itemIndex`) ascendente — a
 * avaliacao completa tem 20 itens. Consumida pelo motor de plenitude
 * (Bloco B3).
 */
export async function listInstrumentCAssessmentsByEmployeeQuarter(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentC_assessments)
    .where(
      and(
        eq(instrumentC_assessments.employeeId, employeeId),
        eq(instrumentC_assessments.trimestre, trimestre),
      ),
    )
    .orderBy(asc(instrumentC_assessments.dimensao), asc(instrumentC_assessments.itemIndex));
}

/**
 * Lista todos os itens de uma empresa em um trimestre, ordenados por
 * (`employeeId`, `dimensao`, `itemIndex`) ascendente. Consumida por
 * telas administrativas e verificacoes de completude do ciclo.
 */
export async function listInstrumentCAssessmentsByCompanyQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentC_assessments)
    .where(
      and(
        eq(instrumentC_assessments.companyId, companyId),
        eq(instrumentC_assessments.trimestre, trimestre),
      ),
    )
    .orderBy(
      asc(instrumentC_assessments.employeeId),
      asc(instrumentC_assessments.dimensao),
      asc(instrumentC_assessments.itemIndex),
    );
}

/**
 * Grava por cima o `valor` de um item existente, pela chave logica
 * UNIQUE, atualizando tambem `respondidoEm`. Esta e a UNICA mutacao
 * autorizada sobre esta tabela (§16.2) — consumida exclusivamente pelo
 * fluxo canonico de desbloqueio dentro da janela autorizada (Bloco B3).
 * Retorna o numero de linhas afetadas (0 se a chave nao existir).
 */
export async function overwriteInstrumentCAssessmentValor(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  dimensao: number,
  itemIndex: number,
  valor: number,
  respondidoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(instrumentC_assessments)
    .set({ valor, respondidoEm })
    .where(
      and(
        eq(instrumentC_assessments.employeeId, employeeId),
        eq(instrumentC_assessments.trimestre, trimestre),
        eq(instrumentC_assessments.dimensao, dimensao),
        eq(instrumentC_assessments.itemIndex, itemIndex),
      ),
    );
  return result.affectedRows;
}
