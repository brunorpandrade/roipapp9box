// ROIP APP 9BOX — service `nr1AreaDivergenceAnalysis` (ME-016).
//
// Repositorio tipado da tabela canonica `nr1AreaDivergenceAnalysis`
// (DOC 01 §11.5). Analise de convergencia/divergencia por departamento
// (ou agregacao de departamentos com amostra insuficiente) por ciclo do
// Radar NR-1. Filha de `copsoqCycles` com ON DELETE CASCADE.
//
// Regime de mutabilidade: a analise e calculada e gravada UMA unica vez
// no fechamento do ciclo; reprocessamento gera NOVO ciclo, nunca
// sobrescrita. Sem UPDATE nem DELETE — a limpeza ocorre exclusivamente
// pelo CASCADE do ciclo pai.
//
// Semantica da UNIQUE `uq_divergence` (cicloDbId, escopo,
// escopoDepartamentoId, escopoNomeAgregacao): mesmas colunas de escopo
// nullaveis de `copsoqFactorScores` (§11.4) — no MySQL, NULL em indice
// UNIQUE nao colide, entao o indice nao bloqueia duplicatas na pratica;
// a coerencia (uma analise por escopo por ciclo) e responsabilidade do
// caller. Os payloads `fatoresDivergentesCriticos` e
// `fatoresDivergentesPositivos` sao arrays JSON de objetos
// { fator, scoreDept, scoreEmpresa, diferenca }.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { nr1AreaDivergenceAnalysis } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewNr1AreaDivergenceAnalysis = typeof nr1AreaDivergenceAnalysis.$inferInsert;

/**
 * Insere uma analise de divergencia de area. Retorna o `id` autogerado.
 * Erros de FK (`cicloDbId`, `companyId`, `escopoDepartamentoId`) sobem
 * como excecoes do mysql2. A coerencia do trio de escopo e
 * responsabilidade do caller (motor de fechamento, Bloco B3).
 */
export async function insertNr1AreaDivergenceAnalysis(
  db: RoipDatabase,
  data: NewNr1AreaDivergenceAnalysis,
): Promise<number> {
  const [result] = await db.insert(nr1AreaDivergenceAnalysis).values(data).$returningId();
  if (!result) {
    throw new Error(
      'insertNr1AreaDivergenceAnalysis: insert retornou sem id (estado inconsistente)',
    );
  }
  return result.id;
}

/** Busca uma analise pelo `id`. Retorna `undefined` se nao existir. */
export async function getNr1AreaDivergenceAnalysisById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(nr1AreaDivergenceAnalysis)
    .where(eq(nr1AreaDivergenceAnalysis.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista as analises de um ciclo, ordenadas por (`escopo` na posicao
 * declarada do enum, `id`) ascendente — departamentos antes de
 * agregacoes. Base da visao por area do Radar NR-1.
 */
export async function listNr1AreaDivergenceAnalysisByCiclo(db: RoipDatabase, cicloDbId: number) {
  return await db
    .select()
    .from(nr1AreaDivergenceAnalysis)
    .where(eq(nr1AreaDivergenceAnalysis.cicloDbId, cicloDbId))
    .orderBy(asc(nr1AreaDivergenceAnalysis.escopo), asc(nr1AreaDivergenceAnalysis.id));
}

/**
 * Lista as analises de um ciclo com uma dada `classificacao`
 * ('convergente' | 'divergencia_critica' | 'divergencia_positiva'),
 * ordenadas por `id` ascendente. Consumida pelos destaques do
 * relatorio do Radar NR-1.
 */
export async function listNr1AreaDivergenceAnalysisByCicloClassificacao(
  db: RoipDatabase,
  cicloDbId: number,
  classificacao: 'convergente' | 'divergencia_critica' | 'divergencia_positiva',
) {
  return await db
    .select()
    .from(nr1AreaDivergenceAnalysis)
    .where(
      and(
        eq(nr1AreaDivergenceAnalysis.cicloDbId, cicloDbId),
        eq(nr1AreaDivergenceAnalysis.classificacao, classificacao),
      ),
    )
    .orderBy(asc(nr1AreaDivergenceAnalysis.id));
}
