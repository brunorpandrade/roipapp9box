// ROIP APP 9BOX — service `performanceData` (ME-013).
//
// Repositorio tipado da tabela canonica `performanceData` (DOC 01 §7.1).
// Dados mensais de desempenho por colaborador — base do calculo trimestral
// do Eixo X. UNIQUE (`companyId`, `employeeId`, `mes`) garante uma linha
// unica por colaborador por mes.
//
// Motor mensal (Bloco B3, DOC 03 Fase 2) grava:
// - `custoTotalMes` e `faltas` (entrada do RH / integracao);
// - `assiduidade` = derivada de `faltas` e `companyMonthlyData.diasUteis`
//   (fonte canonica unica de dias uteis — §4.3, §7.1);
// - `indiceDesempenho` = derivado das linhas de `performanceVariableData`
//   e das metas de `employeeGoals`.
//
// O campo local `diasUteis` permanece no schema por compatibilidade e
// NAO e gravado nem lido pelo motor (regra explicita da §7.1). Este
// service tambem nao expoe setter para esse campo.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { performanceData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `performanceData`). */
export type NewPerformanceData = typeof performanceData.$inferInsert;

/**
 * Insere uma linha mensal de desempenho para um colaborador. Retorna o
 * `id` autogerado. Erros de FK (`companyId`, `employeeId`) e de UNIQUE
 * (`uq_perfData`) sobem como excecoes do mysql2.
 */
export async function insertPerformanceData(
  db: RoipDatabase,
  data: NewPerformanceData,
): Promise<number> {
  const [result] = await db.insert(performanceData).values(data).$returningId();
  if (!result) {
    throw new Error('insertPerformanceData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getPerformanceDataById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(performanceData).where(eq(performanceData.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca pelo trio (companyId, employeeId, mes) — o UNIQUE canonico da
 * §7.1. Retorna `undefined` se nao existir. Consumida pelos motores
 * trimestrais (agregam 3 meses) e pela tela `/dados-mensais/rh`.
 */
export async function getPerformanceDataByMonth(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  mes: string,
) {
  const rows = await db
    .select()
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        eq(performanceData.employeeId, employeeId),
        eq(performanceData.mes, mes),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as linhas de desempenho de um colaborador em ordem
 * crescente de `mes` (formato YYYY-MM ordena cronologicamente). Consumida
 * pelo dashboard individual e pelos motores de calculo trimestral.
 */
export async function listPerformanceDataByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(performanceData)
    .where(eq(performanceData.employeeId, employeeId))
    .orderBy(asc(performanceData.mes));
}

/**
 * Lista todas as linhas de desempenho de uma empresa em ordem crescente
 * de `mes` e depois `employeeId`. Consumida pelos exportaveis e por
 * cargas de motor da empresa inteira.
 */
export async function listPerformanceDataByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(performanceData)
    .where(eq(performanceData.companyId, companyId))
    .orderBy(asc(performanceData.mes), asc(performanceData.employeeId));
}

/**
 * Atualiza apenas os campos gravados pelo motor mensal: `assiduidade`,
 * `indiceDesempenho` e `calculadoEm`. Retorna o numero de linhas
 * afetadas. Nao toca em `custoTotalMes` nem `faltas` (dados de entrada
 * — sao mantidos pelos setters `insertPerformanceData` e por futuros
 * setters dedicados do Bloco B3).
 */
export async function updatePerformanceDataCalculo(
  db: RoipDatabase,
  id: number,
  patch: { assiduidade: string; indiceDesempenho: string; calculadoEm: Date },
): Promise<number> {
  const [result] = await db
    .update(performanceData)
    .set({
      assiduidade: patch.assiduidade,
      indiceDesempenho: patch.indiceDesempenho,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(performanceData.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre `employees`
 * bloqueia). Retorna o numero de linhas afetadas.
 */
export async function deletePerformanceDataById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(performanceData).where(eq(performanceData.id, id));
  return result.affectedRows;
}
