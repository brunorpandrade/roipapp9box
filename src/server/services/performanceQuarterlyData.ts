// ROIP APP 9BOX — service `performanceQuarterlyData` (ME-014).
//
// Repositorio tipado da tabela canonica `performanceQuarterlyData` (DOC 01
// §7.3). Resultado trimestral por colaborador, base do Eixo X do 9-Box.
// A estrutura consolidada abriga tres blocos gravados pelo motor
// trimestral da Fase 2 e o cache de texto do Diagnostico IA (Fase 4):
//
// - Bloco Eixo X: `indiceDesempenho` (media dos 3 indices mensais),
//   `scoreDesempenho` (min(indiceDesempenho x 100, 150)), `capacidadeOciosa`
//   (NULL para familia 6) e `faixaDesempenho`.
// - Bloco financeiro: `custoMedioTrimestral`, `metaROI` (snapshot),
//   `retornoPotencial`, `participacao`, `retornoEstimado`, `roiEstimado`,
//   `percMetaAtingida`.
// - Bloco Diagnostico IA: `diagnosticoIA` (texto interpretativo) e
//   `diagnosticoIAgeradoEm`. A IA nunca calcula — apenas descreve.
//
// UNIQUE (`companyId`, `employeeId`, `trimestre`) garante uma linha unica
// por colaborador por trimestre. Snapshots congelam valores vigentes no
// momento do calculo (metaROI, faixaDesempenho, etc.); recalculos
// retroativos gravam nova versao aqui e registram a metaROI usada no log
// filho `performanceMultiplierLog`.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { performanceQuarterlyData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `performanceQuarterlyData`). */
export type NewPerformanceQuarterlyData = typeof performanceQuarterlyData.$inferInsert;

/**
 * Insere uma linha trimestral de desempenho para um colaborador. Retorna
 * o `id` autogerado. Erros de FK (`companyId`, `employeeId`) e de UNIQUE
 * (`uq_perfQuarter`) sobem como excecoes do mysql2. A rota canonica de
 * "criar ou atualizar" vive no router (Bloco B3): tenta insert; em
 * colisao chama o setter apropriado.
 */
export async function insertPerformanceQuarterlyData(
  db: RoipDatabase,
  data: NewPerformanceQuarterlyData,
): Promise<number> {
  const [result] = await db.insert(performanceQuarterlyData).values(data).$returningId();
  if (!result) {
    throw new Error(
      'insertPerformanceQuarterlyData: insert retornou sem id (estado inconsistente)',
    );
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getPerformanceQuarterlyDataById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, employeeId, trimestre) — o UNIQUE canonico
 * da §7.3. Retorna `undefined` se nao existir. Consumida pelo motor
 * trimestral (para decidir insert vs update), pelo dashboard individual
 * e pelos motores 9-Box (le o `scoreDesempenho` como Eixo X).
 */
export async function getPerformanceQuarterlyDataByQuarter(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.companyId, companyId),
        eq(performanceQuarterlyData.employeeId, employeeId),
        eq(performanceQuarterlyData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os trimestres de um colaborador em ordem cronologica
 * crescente por `trimestre` (formato YYYY-QN ordena lexicograficamente
 * igual a cronologico). Consumida pelo dashboard individual (linha do
 * tempo do Eixo X) e pelos motores de calculo do 9-Box (compara com
 * trimestre anterior).
 */
export async function listPerformanceQuarterlyDataByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.employeeId, employeeId))
    .orderBy(asc(performanceQuarterlyData.trimestre));
}

/**
 * Lista todos os trimestres de uma empresa em ordem crescente de
 * `trimestre` e depois `employeeId`. Consumida pelos exportaveis e pelos
 * motores de agregacao (companyEconomicDiagnosis, participacao).
 */
export async function listPerformanceQuarterlyDataByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.companyId, companyId))
    .orderBy(asc(performanceQuarterlyData.trimestre), asc(performanceQuarterlyData.employeeId));
}

/**
 * Atualiza os blocos calculados pelo motor trimestral da Fase 2:
 * Eixo X (`indiceDesempenho`, `scoreDesempenho`, `capacidadeOciosa`,
 * `faixaDesempenho`) e financeiro (`custoMedioTrimestral`, `metaROI`,
 * `retornoPotencial`, `participacao`, `retornoEstimado`, `roiEstimado`,
 * `percMetaAtingida`), atualiza `calculadoEm`. Nao toca no bloco
 * Diagnostico IA — este tem setter proprio. Retorna o numero de linhas
 * afetadas.
 */
export async function updatePerformanceQuarterlyCalculo(
  db: RoipDatabase,
  id: number,
  patch: {
    indiceDesempenho: string;
    scoreDesempenho: string;
    capacidadeOciosa: string | null;
    faixaDesempenho: 'baixo' | 'medio' | 'alto';
    custoMedioTrimestral: string;
    metaROI: string;
    retornoPotencial: string;
    participacao: string;
    retornoEstimado: string;
    roiEstimado: string;
    percMetaAtingida: string;
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(performanceQuarterlyData)
    .set({
      indiceDesempenho: patch.indiceDesempenho,
      scoreDesempenho: patch.scoreDesempenho,
      capacidadeOciosa: patch.capacidadeOciosa,
      faixaDesempenho: patch.faixaDesempenho,
      custoMedioTrimestral: patch.custoMedioTrimestral,
      metaROI: patch.metaROI,
      retornoPotencial: patch.retornoPotencial,
      participacao: patch.participacao,
      retornoEstimado: patch.retornoEstimado,
      roiEstimado: patch.roiEstimado,
      percMetaAtingida: patch.percMetaAtingida,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(performanceQuarterlyData.id, id));
  return result.affectedRows;
}

/**
 * Atualiza o cache do Diagnostico IA (texto interpretativo) — Fase 4.
 * A IA nunca calcula: ela apenas descreve os numeros que o motor
 * trimestral ja gravou. Retorna o numero de linhas afetadas.
 */
export async function updatePerformanceQuarterlyDiagnosticoIA(
  db: RoipDatabase,
  id: number,
  patch: { diagnosticoIA: string; diagnosticoIAgeradoEm: Date },
): Promise<number> {
  const [result] = await db
    .update(performanceQuarterlyData)
    .set({
      diagnosticoIA: patch.diagnosticoIA,
      diagnosticoIAgeradoEm: patch.diagnosticoIAgeradoEm,
    })
    .where(eq(performanceQuarterlyData.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre `employees`
 * e `companies` bloqueia). Retorna o numero de linhas afetadas.
 */
export async function deletePerformanceQuarterlyDataById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db
    .delete(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.id, id));
  return result.affectedRows;
}
