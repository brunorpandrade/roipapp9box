// ROIP APP 9BOX — service `plenitudeData` (ME-014).
//
// Repositorio tipado da tabela canonica `plenitudeData` (DOC 01 §8.3).
// Pontuacao de plenitude consolidada por colaborador por trimestre — base
// do Eixo Y do 9-Box. Estrutura consolidada: scores principais
// (`scoreA` autoavaliacao / `scoreC` lider / `plenitudeScore` composto /
// `faixaPlenitude` / `divergencia` / `alertaDivergencia`) e scores por
// dimensao para cada instrumento (engajamento, desenvolvimento,
// pertencimento, realizacao — 8 colunas A/C).
//
// UNIQUE (`companyId`, `employeeId`, `trimestre`) garante uma linha unica
// por colaborador por trimestre. O motor de plenitude e disparado a cada
// gravacao de `instrumentA_responses` ou `instrumentC_assessments` do
// trimestre, e sobrescreve o registro (mutavel).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { plenitudeData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `plenitudeData`). */
export type NewPlenitudeData = typeof plenitudeData.$inferInsert;

/**
 * Insere uma linha trimestral de plenitude para um colaborador. Retorna
 * o `id` autogerado. Erros de FK (`companyId`, `employeeId`) e de UNIQUE
 * (`uq_plenitude`) sobem como excecoes do mysql2. A rota canonica de
 * "criar ou atualizar" vive no router (Bloco B3): tenta insert; em
 * colisao chama `updatePlenitudeCalculo`.
 */
export async function insertPlenitudeData(
  db: RoipDatabase,
  data: NewPlenitudeData,
): Promise<number> {
  const [result] = await db.insert(plenitudeData).values(data).$returningId();
  if (!result) {
    throw new Error('insertPlenitudeData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getPlenitudeDataById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(plenitudeData).where(eq(plenitudeData.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, employeeId, trimestre) — o UNIQUE canonico
 * da §8.3. Retorna `undefined` se nao existir. Consumida pelo motor
 * 9-Box (le `plenitudeScore` como Eixo Y) e pelo dashboard individual.
 */
export async function getPlenitudeDataByQuarter(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(plenitudeData)
    .where(
      and(
        eq(plenitudeData.companyId, companyId),
        eq(plenitudeData.employeeId, employeeId),
        eq(plenitudeData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as linhas trimestrais de plenitude de um colaborador em
 * ordem cronologica crescente por `trimestre`. Consumida pelo dashboard
 * individual (linha do tempo do Eixo Y) e pelos motores 9-Box para
 * comparar trimestres.
 */
export async function listPlenitudeDataByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(plenitudeData)
    .where(eq(plenitudeData.employeeId, employeeId))
    .orderBy(asc(plenitudeData.trimestre));
}

/**
 * Lista todas as linhas trimestrais de plenitude de uma empresa em
 * ordem crescente de `trimestre` e depois `employeeId`. Consumida pelos
 * exportaveis e por motores de agregacao (media da empresa,
 * distribuicao por faixa, agregacao de clima e engajamento).
 */
export async function listPlenitudeDataByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(plenitudeData)
    .where(eq(plenitudeData.companyId, companyId))
    .orderBy(asc(plenitudeData.trimestre), asc(plenitudeData.employeeId));
}

/**
 * Atualiza todos os campos calculados pelo motor de plenitude:
 * scores principais (`scoreA`, `scoreC`, `plenitudeScore`,
 * `faixaPlenitude`, `divergencia`, `alertaDivergencia`) e scores por
 * dimensao para cada instrumento (8 colunas A/C), atualiza
 * `calculadoEm`. Retorna o numero de linhas afetadas.
 */
export async function updatePlenitudeCalculo(
  db: RoipDatabase,
  id: number,
  patch: {
    scoreA: string | null;
    scoreC: string | null;
    plenitudeScore: string | null;
    faixaPlenitude: 'baixa' | 'media' | 'alta' | null;
    divergencia: string | null;
    alertaDivergencia: boolean;
    engajamentoA: string | null;
    engajamentoC: string | null;
    desenvolvimentoA: string | null;
    desenvolvimentoC: string | null;
    pertencimentoA: string | null;
    pertencimentoC: string | null;
    realizacaoA: string | null;
    realizacaoC: string | null;
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(plenitudeData)
    .set({
      scoreA: patch.scoreA,
      scoreC: patch.scoreC,
      plenitudeScore: patch.plenitudeScore,
      faixaPlenitude: patch.faixaPlenitude,
      divergencia: patch.divergencia,
      alertaDivergencia: patch.alertaDivergencia,
      engajamentoA: patch.engajamentoA,
      engajamentoC: patch.engajamentoC,
      desenvolvimentoA: patch.desenvolvimentoA,
      desenvolvimentoC: patch.desenvolvimentoC,
      pertencimentoA: patch.pertencimentoA,
      pertencimentoC: patch.pertencimentoC,
      realizacaoA: patch.realizacaoA,
      realizacaoC: patch.realizacaoC,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(plenitudeData.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre `employees`
 * e `companies` bloqueia). Retorna o numero de linhas afetadas.
 */
export async function deletePlenitudeDataById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(plenitudeData).where(eq(plenitudeData.id, id));
  return result.affectedRows;
}
