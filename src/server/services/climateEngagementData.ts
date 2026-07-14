// ROIP APP 9BOX — service `climateEngagementData` (ME-015).
//
// Repositorio tipado da tabela canonica `climateEngagementData` (DOC 01
// §8.9). Agregados do Bloco Clima e Engajamento por escopo por
// trimestre: nota geral (`notaClima`), adesao, contagens de cobertura,
// 4 notas por dimensao e 20 notas por questao (todas 0-10). Tabela
// MUTAVEL: o registro nasce apos o fechamento do trimestre e e
// recalculado e sobrescrito a cada novo `scoreA` gravado em
// `plenitudeData` do trimestre.
//
// Escopos canonicos (enum de 3 valores):
// - `empresa`: `departamento` e `liderId` NULL.
// - `departamento`: apenas `departamento` preenchido (nome exato do
//   enum de `employees.departamento`).
// - `equipe`: apenas `liderId` preenchido (cadeia descendente completa
//   do lider).
// A coerencia entre `escopo` e as colunas de escopo e responsabilidade
// do caller (Bloco B3) — nao ha CHECK canonico no §8.9. A UNIQUE
// `uq_climate_escopo` (companyId, escopo, departamento, liderId,
// trimestre) contem colunas anulaveis; pela semantica de NULL do MySQL
// em indices unicos, a unicidade logica por escopo tambem e garantida
// pelo motor (caller), nao pelo banco.
//
// Piso de anonimato de 3 respondentes: decisao da camada de leitura,
// consultando `countCobertura` — o service persiste sempre.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { climateEngagementData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewClimateEngagementData = typeof climateEngagementData.$inferInsert;

/** Payload dos campos calculados pelo motor de Clima e Engajamento. */
export type ClimateCalculoPatch = {
  notaClima: string | null;
  adesao: string | null;
  countCobertura: number;
  countTotal: number;
  notaEngajamento: string | null;
  notaDesenvolvimento: string | null;
  notaPertencimento: string | null;
  notaRealizacao: string | null;
  notasQuestoes: Partial<
    Pick<
      NewClimateEngagementData,
      | 'notaQuestao01'
      | 'notaQuestao02'
      | 'notaQuestao03'
      | 'notaQuestao04'
      | 'notaQuestao05'
      | 'notaQuestao06'
      | 'notaQuestao07'
      | 'notaQuestao08'
      | 'notaQuestao09'
      | 'notaQuestao10'
      | 'notaQuestao11'
      | 'notaQuestao12'
      | 'notaQuestao13'
      | 'notaQuestao14'
      | 'notaQuestao15'
      | 'notaQuestao16'
      | 'notaQuestao17'
      | 'notaQuestao18'
      | 'notaQuestao19'
      | 'notaQuestao20'
    >
  >;
  calculadoEm: Date;
};

/**
 * Insere um agregado de clima para um escopo em um trimestre. Retorna o
 * `id` autogerado. Erros de FK (`companyId`, `liderId` quando presente)
 * sobem como excecoes do mysql2.
 */
export async function insertClimateEngagementData(
  db: RoipDatabase,
  data: NewClimateEngagementData,
): Promise<number> {
  const [result] = await db.insert(climateEngagementData).values(data).$returningId();
  if (!result) {
    throw new Error('insertClimateEngagementData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um agregado pelo `id`. Retorna `undefined` se nao existir. */
export async function getClimateEngagementDataById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(climateEngagementData)
    .where(eq(climateEngagementData.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca o agregado de escopo `empresa` de um trimestre. Retorna
 * `undefined` se nao existir.
 */
export async function getClimateByEmpresaQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(climateEngagementData)
    .where(
      and(
        eq(climateEngagementData.companyId, companyId),
        eq(climateEngagementData.escopo, 'empresa'),
        eq(climateEngagementData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Busca o agregado de escopo `departamento` de um trimestre, pelo nome
 * canonico do departamento. Retorna `undefined` se nao existir.
 */
export async function getClimateByDepartamentoQuarter(
  db: RoipDatabase,
  companyId: number,
  departamento: string,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(climateEngagementData)
    .where(
      and(
        eq(climateEngagementData.companyId, companyId),
        eq(climateEngagementData.escopo, 'departamento'),
        eq(climateEngagementData.departamento, departamento),
        eq(climateEngagementData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Busca o agregado de escopo `equipe` de um trimestre, pelo lider da
 * cadeia. Retorna `undefined` se nao existir.
 */
export async function getClimateByEquipeQuarter(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(climateEngagementData)
    .where(
      and(
        eq(climateEngagementData.companyId, companyId),
        eq(climateEngagementData.escopo, 'equipe'),
        eq(climateEngagementData.liderId, liderId),
        eq(climateEngagementData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os agregados de uma empresa em um trimestre, ordenados
 * por `escopo` (posicao declarada do enum — empresa, departamento,
 * equipe) com desempate por `id` ascendente. Consumida pela tela do
 * Bloco Clima e Engajamento.
 */
export async function listClimateEngagementDataByCompanyQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(climateEngagementData)
    .where(
      and(
        eq(climateEngagementData.companyId, companyId),
        eq(climateEngagementData.trimestre, trimestre),
      ),
    )
    .orderBy(asc(climateEngagementData.escopo), asc(climateEngagementData.id));
}

/**
 * Grava os campos calculados pelo motor de Clima e Engajamento
 * (recalculo sobrescreve — §8.9). Retorna o numero de linhas afetadas.
 */
export async function updateClimateCalculo(
  db: RoipDatabase,
  id: number,
  patch: ClimateCalculoPatch,
): Promise<number> {
  const [result] = await db
    .update(climateEngagementData)
    .set({
      notaClima: patch.notaClima,
      adesao: patch.adesao,
      countCobertura: patch.countCobertura,
      countTotal: patch.countTotal,
      notaEngajamento: patch.notaEngajamento,
      notaDesenvolvimento: patch.notaDesenvolvimento,
      notaPertencimento: patch.notaPertencimento,
      notaRealizacao: patch.notaRealizacao,
      ...patch.notasQuestoes,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(climateEngagementData.id, id));
  return result.affectedRows;
}

/**
 * Remove um agregado pelo `id`. Somente para teardown de testes — em
 * producao o registro e retentivo (recalculo sobrescreve, nunca
 * deleta). Retorna o numero de linhas afetadas.
 */
export async function deleteClimateEngagementDataById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db.delete(climateEngagementData).where(eq(climateEngagementData.id, id));
  return result.affectedRows;
}
