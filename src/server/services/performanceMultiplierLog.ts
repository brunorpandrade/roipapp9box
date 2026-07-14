// ROIP APP 9BOX — service `performanceMultiplierLog` (ME-014).
//
// Repositorio tipado da tabela canonica `performanceMultiplierLog` (DOC 01
// §7.4). Log de auditabilidade da `metaROI` utilizada em cada calculo
// trimestral, incluindo ajustes retroativos. Append-only §16.1 item 10 —
// nenhum UPDATE ou DELETE em producao (§20 item 17). Nao ha excecao de
// janela: contraste explicito com `monthlyUnlockLog` e `instrumentUnlockLog`.
//
// FK formal para a tabela pai `performanceQuarterlyData(id) ON DELETE
// CASCADE` — quando uma linha trimestral e reprocessada, o log historico
// dela e naturalmente descartado se a propria linha pai for removida em
// teardown (situacao normal apenas em testes; em producao performance
// trimestral e retentiva).
//
// Um novo registro e gravado a cada calculo do motor trimestral, incluindo
// ajustes retroativos (o campo `ajusteRetroativo` distingue). O snapshot
// canonico do log e: (`nivelHierarquico`, `metaROIUsada`, `trimestre`) —
// suficiente para reconstruir a decisao mesmo apos o cadastro do
// `companies.metaROI*` ter sido alterado.

import { and, asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { performanceMultiplierLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `performanceMultiplierLog`). */
export type NewPerformanceMultiplierLog = typeof performanceMultiplierLog.$inferInsert;

/**
 * Insere um registro de log de multiplicador (metaROI). Retorna o `id`
 * autogerado. Erros de FK (`quarterlyDataId`, `employeeId`) sobem como
 * excecoes do mysql2. Este e o unico caminho de escrita canonico —
 * nenhum setter nem delete e exposto (append-only sem excecao).
 */
export async function insertPerformanceMultiplierLog(
  db: RoipDatabase,
  data: NewPerformanceMultiplierLog,
): Promise<number> {
  const [result] = await db.insert(performanceMultiplierLog).values(data).$returningId();
  if (!result) {
    throw new Error(
      'insertPerformanceMultiplierLog: insert retornou sem id (estado inconsistente)',
    );
  }
  return result.id;
}

/** Busca um registro pelo `id`. Retorna `undefined` se nao existir. */
export async function getPerformanceMultiplierLogById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(performanceMultiplierLog)
    .where(eq(performanceMultiplierLog.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os registros de log de uma linha trimestral pai
 * (`quarterlyDataId`) em ordem cronologica crescente por `calculadoEm`
 * com desempate por `id`. Consumida pela tela de historico do
 * colaborador para exibir as versoes sucessivas da `metaROI` daquele
 * trimestre (calculo inicial + eventuais ajustes retroativos).
 */
export async function listPerformanceMultiplierLogByQuarterly(
  db: RoipDatabase,
  quarterlyDataId: number,
) {
  return await db
    .select()
    .from(performanceMultiplierLog)
    .where(eq(performanceMultiplierLog.quarterlyDataId, quarterlyDataId))
    .orderBy(asc(performanceMultiplierLog.calculadoEm), asc(performanceMultiplierLog.id));
}

/**
 * Lista todos os registros de log de um colaborador em ordem cronologica
 * decrescente por `trimestre` com desempate por `id` desc. Consumida
 * pelo Historico da empresa (UNION multi-fonte) e pela auditoria
 * administrativa.
 */
export async function listPerformanceMultiplierLogByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(performanceMultiplierLog)
    .where(eq(performanceMultiplierLog.employeeId, employeeId))
    .orderBy(desc(performanceMultiplierLog.trimestre), desc(performanceMultiplierLog.id));
}

/**
 * Lista todos os registros de log do par (`employeeId`, `trimestre`) em
 * ordem cronologica crescente por `calculadoEm`, com desempate por `id`.
 * Consumida por auditoria fina quando ha ajustes retroativos separados
 * em linhas trimestrais distintas (raro, mas suportado).
 */
export async function listPerformanceMultiplierLogByEmployeeQuarter(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(performanceMultiplierLog)
    .where(
      and(
        eq(performanceMultiplierLog.employeeId, employeeId),
        eq(performanceMultiplierLog.trimestre, trimestre),
      ),
    )
    .orderBy(asc(performanceMultiplierLog.calculadoEm), asc(performanceMultiplierLog.id));
}
