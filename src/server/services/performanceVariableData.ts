// ROIP APP 9BOX — service `performanceVariableData` (ME-013).
//
// Repositorio tipado da tabela canonica `performanceVariableData` (DOC 01
// §7.2). Uma linha por variavel (variableIndex 0..3) por linha de
// `performanceData`. UNIQUE (`performanceDataId`, `variableIndex`)
// impede duplicar variavel dentro do mesmo mes.
//
// Regra canonica de nomenclatura (§7.2): a FK chama-se `performanceDataId`.
// A forma abreviada de versoes antigas esta em §19 (nomenclatura abandonada);
// este service usa apenas o nome canonico.
//
// Estrutura consolidada (S425): inclui `desempenho` e `peso`, gravados
// pelo motor mensal. `desempenho` = executado/demanda (com ceiling
// aplicado na Fase 2, DOC 03); `peso` = snapshot do peso vigente em
// `companyJobFamilies` no momento do calculo — importante quando o
// peso muda entre meses (motor congela o peso usado).
//
// A CASCADE de `performanceData` (ON DELETE) apaga automaticamente as
// linhas correspondentes desta tabela. Este service expoe delete
// explicito por (`performanceDataId`) para uso em testes onde a
// dependencia inversa exige limpeza controlada.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { performanceVariableData } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewPerformanceVariableData = typeof performanceVariableData.$inferInsert;

/**
 * Insere uma linha para uma variavel de uma linha de `performanceData`.
 * Retorna o `id` autogerado. Erros de FK (`performanceDataId` invalido) e
 * de UNIQUE (`uq_perfVar`) sobem como excecoes do mysql2.
 */
export async function insertPerformanceVariableData(
  db: RoipDatabase,
  data: NewPerformanceVariableData,
): Promise<number> {
  const [result] = await db.insert(performanceVariableData).values(data).$returningId();
  if (!result) {
    throw new Error('insertPerformanceVariableData: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getPerformanceVariableDataById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(performanceVariableData)
    .where(eq(performanceVariableData.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca uma variavel pelo par (performanceDataId, variableIndex) — o
 * UNIQUE canonico da §7.2. Retorna `undefined` se nao existir.
 */
export async function getPerformanceVariableDataByIndex(
  db: RoipDatabase,
  performanceDataId: number,
  variableIndex: number,
) {
  const rows = await db
    .select()
    .from(performanceVariableData)
    .where(
      and(
        eq(performanceVariableData.performanceDataId, performanceDataId),
        eq(performanceVariableData.variableIndex, variableIndex),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista as 4 variaveis de uma linha de `performanceData` em ordem
 * crescente de `variableIndex`. Consumida pelo motor mensal (calcula
 * `indiceDesempenho` a partir dessas 4 linhas + pesos) e pela tela
 * `/dados-mensais/rh` (renderiza as 4 linhas em ordem).
 */
export async function listPerformanceVariableDataByPerformance(
  db: RoipDatabase,
  performanceDataId: number,
) {
  return await db
    .select()
    .from(performanceVariableData)
    .where(eq(performanceVariableData.performanceDataId, performanceDataId))
    .orderBy(asc(performanceVariableData.variableIndex));
}

/**
 * Atualiza `desempenho` e `peso` de uma variavel — os dois campos
 * gravados pelo motor mensal (§7.2). Identificacao pelo par UNIQUE
 * (performanceDataId, variableIndex). Retorna o numero de linhas
 * afetadas.
 */
export async function updatePerformanceVariableCalculo(
  db: RoipDatabase,
  performanceDataId: number,
  variableIndex: number,
  patch: { desempenho: string; peso: string },
): Promise<number> {
  const [result] = await db
    .update(performanceVariableData)
    .set({ desempenho: patch.desempenho, peso: patch.peso })
    .where(
      and(
        eq(performanceVariableData.performanceDataId, performanceDataId),
        eq(performanceVariableData.variableIndex, variableIndex),
      ),
    );
  return result.affectedRows;
}

/**
 * Remove todas as linhas de variaveis associadas a uma linha de
 * `performanceData`. Em producao esta limpeza ocorre por CASCADE
 * automatica ao deletar a linha pai; este setter existe para teardown
 * de testes onde o teste quer limpar variaveis sem apagar o pai (ex.:
 * simular reinicializacao antes de novo calculo). Retorna o numero de
 * linhas afetadas.
 */
export async function deletePerformanceVariableDataByPerformance(
  db: RoipDatabase,
  performanceDataId: number,
): Promise<number> {
  const [result] = await db
    .delete(performanceVariableData)
    .where(eq(performanceVariableData.performanceDataId, performanceDataId));
  return result.affectedRows;
}
