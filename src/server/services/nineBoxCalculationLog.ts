// ROIP APP 9BOX — service `nineBoxCalculationLog` (ME-014).
//
// Repositorio tipado da tabela canonica `nineBoxCalculationLog` (DOC 01
// §8.6). Log de tentativas de calculo do 9-Box. Append-only §16.1 item 4
// — nenhum UPDATE ou DELETE em producao (§20 item 17), sem excecao de
// janela.
//
// Estrutura canonica (§8.6): FKs formais apenas para `companies(id)` e
// `employees(id)` — nao ha FK para `nineBoxClassifications`. A associacao
// com a classificacao vencedora e logica pelo trio `(companyId,
// employeeId, trimestre)`, e existe apenas nos casos de sucesso
// (`status='calculado'`). Os outros tres valores do enum
// (`eixo_x_ausente`, `eixo_y_ausente`, `ambos_ausentes`) registram
// tentativas que NAO produziram linha em `nineBoxClassifications` — por
// isso a FK formal seria impossivel.
//
// A tabela nao carrega snapshot dos eixos (`scoreDesempenho`,
// `plenitudeScore`) — o payload e apenas `status` + `observacao` de
// texto livre. O snapshot dos eixos permanece em `nineBoxClassifications`
// (quando o calculo sucede).
//
// Um novo registro e gravado a cada tentativa de calculo, incluindo as
// tentativas frustradas. Consumido pelo dashboard executivo (contagem de
// classificados x nao classificados por trimestre) e pela auditoria
// (rastrear ausencia de dados de entrada).

import { and, asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { nineBoxCalculationLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `nineBoxCalculationLog`). */
export type NewNineBoxCalculationLog = typeof nineBoxCalculationLog.$inferInsert;

/**
 * Insere um registro de log de calculo do 9-Box. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`) sobem como
 * excecoes do mysql2. Este e o unico caminho de escrita canonico —
 * nenhum setter nem delete e exposto (append-only sem excecao).
 */
export async function insertNineBoxCalculationLog(
  db: RoipDatabase,
  data: NewNineBoxCalculationLog,
): Promise<number> {
  const [result] = await db.insert(nineBoxCalculationLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertNineBoxCalculationLog: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um registro pelo `id`. Retorna `undefined` se nao existir. */
export async function getNineBoxCalculationLogById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(nineBoxCalculationLog)
    .where(eq(nineBoxCalculationLog.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os registros de log de uma empresa em ordem cronologica
 * decrescente por `registradoEm` (mais recente primeiro) com desempate
 * por `id` desc. Consumida pelo dashboard executivo e por auditoria.
 */
export async function listNineBoxCalculationLogByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(nineBoxCalculationLog)
    .where(eq(nineBoxCalculationLog.companyId, companyId))
    .orderBy(desc(nineBoxCalculationLog.registradoEm), desc(nineBoxCalculationLog.id));
}

/**
 * Lista todos os registros de log de um colaborador em ordem cronologica
 * crescente por `trimestre` com desempate por `id`. Consumida pelo
 * dashboard individual quando o colaborador precisa entender por que um
 * trimestre nao gerou classificacao.
 */
export async function listNineBoxCalculationLogByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(nineBoxCalculationLog)
    .where(eq(nineBoxCalculationLog.employeeId, employeeId))
    .orderBy(asc(nineBoxCalculationLog.trimestre), asc(nineBoxCalculationLog.id));
}

/**
 * Lista todos os registros de log de um par (`employeeId`, `trimestre`)
 * em ordem cronologica crescente por `registradoEm` com desempate por
 * `id`. Consumida por auditoria fina quando ha varias tentativas de
 * calculo no mesmo trimestre (recalculo apos correcao de dados de
 * entrada).
 */
export async function listNineBoxCalculationLogByEmployeeQuarter(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(nineBoxCalculationLog)
    .where(
      and(
        eq(nineBoxCalculationLog.employeeId, employeeId),
        eq(nineBoxCalculationLog.trimestre, trimestre),
      ),
    )
    .orderBy(asc(nineBoxCalculationLog.registradoEm), asc(nineBoxCalculationLog.id));
}
