// ROIP APP 9BOX — service `companyMonthlyData` (ME-013).
//
// Repositorio tipado da tabela canonica `companyMonthlyData` (DOC 01 §4.3).
// Dados mensais agregados da empresa: `faturamentoBruto` (Responsavel
// financeiro / Bruno, via /faturamento-mensal) e `diasUteis` (RH, via aba
// de dados da empresa). UNIQUE (`companyId`, `mes`) garante uma linha
// unica por mes por empresa.
//
// Fonte canonica de dias uteis do mes: exclusivamente esta tabela
// (`companyMonthlyData.diasUteis`). O campo homonimo de `performanceData`
// nao e gravado nem lido pelo motor (§4.3, §7.1).
//
// Este service expoe setters dedicados por dono do dado (regra §4.3):
// `updateCompanyMonthlyDataFaturamento` para o Responsavel financeiro e
// `updateCompanyMonthlyDataDiasUteis` para o RH. Nenhum update generico
// e exposto — a separacao ajuda o Bloco B3 a rastrear autoria sem
// carregar coluna dedicada. As regras de autorizacao vivem no router
// tRPC (Bloco B2/B3), nao aqui.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companyMonthlyData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `companyMonthlyData`). */
export type NewCompanyMonthlyData = typeof companyMonthlyData.$inferInsert;

/**
 * Insere uma linha mensal para uma empresa. Retorna o `id` autogerado.
 * Erros de FK (`companyId` invalido) e de UNIQUE (`uq_companyMonthly`)
 * sobem como excecoes do mysql2 — a rota canonica de "criar ou atualizar"
 * vive no router (Bloco B3): tenta insert, e em colisao chama o setter
 * apropriado.
 */
export async function insertCompanyMonthlyData(
  db: RoipDatabase,
  data: NewCompanyMonthlyData,
): Promise<number> {
  const [result] = await db.insert(companyMonthlyData).values(data).$returningId();
  if (!result) {
    throw new Error('insertCompanyMonthlyData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getCompanyMonthlyDataById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(companyMonthlyData)
    .where(eq(companyMonthlyData.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo par (companyId, mes) — o UNIQUE canonico da §4.3. Retorna
 * `undefined` se nao existir. Este e o caminho canonico usado pelos
 * motores da Fase 2 para resolver os `diasUteis` do mes.
 */
export async function getCompanyMonthlyDataByMonth(
  db: RoipDatabase,
  companyId: number,
  mes: string,
) {
  const rows = await db
    .select()
    .from(companyMonthlyData)
    .where(and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, mes)))
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as linhas mensais de uma empresa em ordem crescente de
 * `mes` (formato YYYY-MM ordena lexicograficamente igual a cronologico).
 * Consumida pelo dashboard da empresa, pelos motores trimestrais (que
 * precisam dos 3 meses do trimestre) e pelos exportaveis.
 */
export async function listCompanyMonthlyDataByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(companyMonthlyData)
    .where(eq(companyMonthlyData.companyId, companyId))
    .orderBy(asc(companyMonthlyData.mes));
}

/**
 * Atualiza apenas `faturamentoBruto` do par (companyId, mes). Escrito
 * exclusivamente pelo Responsavel financeiro / Bruno via /faturamento-
 * mensal (regra §4.3). A validacao "> 0" e responsabilidade do caller
 * (Bloco B3, router `revenue`). Retorna o numero de linhas afetadas.
 */
export async function updateCompanyMonthlyDataFaturamento(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  faturamentoBruto: string,
): Promise<number> {
  const [result] = await db
    .update(companyMonthlyData)
    .set({ faturamentoBruto })
    .where(and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, mes)));
  return result.affectedRows;
}

/**
 * Atualiza apenas `diasUteis` do par (companyId, mes). Escrito pelo RH
 * na aba de dados da empresa (regra §4.3). Retorna o numero de linhas
 * afetadas.
 */
export async function updateCompanyMonthlyDataDiasUteis(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  diasUteis: number,
): Promise<number> {
  const [result] = await db
    .update(companyMonthlyData)
    .set({ diasUteis })
    .where(and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, mes)));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela nao expoe deleção manual: a limpeza estrutural
 * ocorreria apenas por ON DELETE de `companies` (RESTRICT bloqueia).
 * Retorna o numero de linhas afetadas.
 */
export async function deleteCompanyMonthlyDataById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(companyMonthlyData).where(eq(companyMonthlyData.id, id));
  return result.affectedRows;
}
