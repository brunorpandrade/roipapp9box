// ROIP APP 9BOX — service `nineBoxClassifications` (ME-014).
//
// Repositorio tipado da tabela canonica `nineBoxClassifications` (DOC 01
// §8.4). Classificacao trimestral final do 9-Box por colaborador — saida
// do motor 9-Box (Bloco B3 ME-035). Congela em uma unica linha o
// resultado da interseccao Eixo X (`scoreDesempenho` de
// `performanceQuarterlyData`) x Eixo Y (`plenitudeScore` de
// `plenitudeData`), com identificacao do quadrante e comparacao com o
// trimestre anterior.
//
// UNIQUE (`companyId`, `employeeId`, `trimestre`) garante uma linha unica
// por colaborador por trimestre. Rota canonica de "criar ou atualizar"
// vive no router (Bloco B3): tenta insert; em colisao chama
// `updateNineBoxCalculo`.
//
// Enum `quadrante` preserva os 9 nomes canonicos com acentos e caixa
// alta literalmente (§8.4) — a comparacao em `quadranteAnterior`
// (VARCHAR(50)) tambem tem que respeitar essa grafia exata.
//
// Regra canonica de retroatividade (§8.4): alteracoes nos thresholds do
// 9-Box do cadastro da empresa NAO recalculam classificacoes de
// trimestres ja fechados — valem apenas de entao em diante.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { nineBoxClassifications } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `nineBoxClassifications`). */
export type NewNineBoxClassification = typeof nineBoxClassifications.$inferInsert;

/** Enum canonico dos 9 quadrantes — grafia literal preservada (§8.4). */
export type QuadranteNineBox =
  | 'ALTO IMPACTO'
  | 'DESEMPENHO REPRESADO'
  | 'POTENCIAL SUBUTILIZADO'
  | 'ALTA ENTREGA'
  | 'EQUILÍBRIO FRÁGIL'
  | 'DESEMPENHO CRÍTICO'
  | 'RISCO DE ESGOTAMENTO'
  | 'DESGASTE OCULTO'
  | 'RISCO CRÍTICO';

/**
 * Insere uma classificacao trimestral no 9-Box. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`) e de UNIQUE
 * (`uq_nineBox`) sobem como excecoes do mysql2.
 */
export async function insertNineBoxClassification(
  db: RoipDatabase,
  data: NewNineBoxClassification,
): Promise<number> {
  const [result] = await db.insert(nineBoxClassifications).values(data).$returningId();
  if (!result) {
    throw new Error('insertNineBoxClassification: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getNineBoxClassificationById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(nineBoxClassifications)
    .where(eq(nineBoxClassifications.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, employeeId, trimestre) — o UNIQUE canonico
 * da §8.4. Retorna `undefined` se nao existir. Consumida pelo dashboard
 * individual (quadrante atual), pelo dashboard executivo (contagem por
 * quadrante) e pelo proprio motor 9-Box (para decidir insert vs update
 * e para popular `quadranteAnterior` no proximo trimestre).
 */
export async function getNineBoxClassificationByQuarter(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(nineBoxClassifications)
    .where(
      and(
        eq(nineBoxClassifications.companyId, companyId),
        eq(nineBoxClassifications.employeeId, employeeId),
        eq(nineBoxClassifications.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as classificacoes de um colaborador em ordem cronologica
 * crescente por `trimestre`. Consumida pelo dashboard individual (linha
 * do tempo do 9-Box) e pelo motor 9-Box para resolver a trilha do
 * colaborador ao calcular `direcaoMovimento`.
 */
export async function listNineBoxClassificationsByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(nineBoxClassifications)
    .where(eq(nineBoxClassifications.employeeId, employeeId))
    .orderBy(asc(nineBoxClassifications.trimestre));
}

/**
 * Lista todas as classificacoes de uma empresa em ordem crescente de
 * `trimestre` e depois `employeeId`. Consumida pelos exportaveis e pelo
 * dashboard executivo (mapa de calor por quadrante).
 */
export async function listNineBoxClassificationsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(nineBoxClassifications)
    .where(eq(nineBoxClassifications.companyId, companyId))
    .orderBy(asc(nineBoxClassifications.trimestre), asc(nineBoxClassifications.employeeId));
}

/**
 * Atualiza todos os campos calculados pelo motor 9-Box: eixos
 * (`scoreDesempenho`, `plenitudeScore`, `posicaoX`, `posicaoY`), quadrante
 * canonico (`quadrante`), comparacao com o trimestre anterior
 * (`quadranteAnterior`, `direcaoMovimento`) e `calculadoEm`. Retorna o
 * numero de linhas afetadas.
 */
export async function updateNineBoxCalculo(
  db: RoipDatabase,
  id: number,
  patch: {
    scoreDesempenho: string | null;
    plenitudeScore: string | null;
    posicaoX: 'baixo' | 'medio' | 'alto';
    posicaoY: 'baixa' | 'media' | 'alta';
    quadrante: QuadranteNineBox;
    quadranteAnterior: string | null;
    direcaoMovimento: 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez' | null;
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(nineBoxClassifications)
    .set({
      scoreDesempenho: patch.scoreDesempenho,
      plenitudeScore: patch.plenitudeScore,
      posicaoX: patch.posicaoX,
      posicaoY: patch.posicaoY,
      quadrante: patch.quadrante,
      quadranteAnterior: patch.quadranteAnterior,
      direcaoMovimento: patch.direcaoMovimento,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(nineBoxClassifications.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre `employees`
 * e `companies` bloqueia). Retorna o numero de linhas afetadas.
 */
export async function deleteNineBoxClassificationById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db.delete(nineBoxClassifications).where(eq(nineBoxClassifications.id, id));
  return result.affectedRows;
}
