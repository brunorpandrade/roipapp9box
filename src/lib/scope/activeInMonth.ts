// ROIP APP 9BOX — helper canonico de elegibilidade temporal de employees
// por mes de referencia (ME-fila2-seed — S260 aprovada).
//
// Origem canonica:
// - `monthBounds`: novo helper puro; deriva primeiro e ultimo instante
//   UTC do mes 'YYYY-MM'. Substitui o codigo inline previamente presente
//   em `src/server/services/leaderMonthlyStatus.ts` linhas 72-76.
// - `resolveDesligadosPreviosIds`: novo helper async; retorna IDs de
//   employees canonicamente desligados ANTES do primeiro instante do
//   mes M. Materializa o array como padrao S066/S080 canonico do repo
//   (RV-12: `inArray`/`notInArray` sempre com array materializado,
//   nunca com subquery — precedente `leadershipTransfer.ts:518`).
// - `activeInMonthWhere`: predicado canonico §3.11 puro — recebe o
//   array ja materializado de desligados previos e retorna clause
//   SQL bit-a-bit componivel via `and(...)`.
//
// Semantica canonica: employee eh elegivel no mes M se
//   (1) `employees.companyId = companyId`
//   E (2) `employees.dataAdmissao <= bounds.lastDay`
//   E (3) `employees.id NAO IN` desligadosPreviosIds.
//
// Substitui o filtro por `status='ativo'` que previamente era usado em
// `getMonthlyInputForm(aba='rh')` (monthlyData.ts:494-496) e em
// `listDirectLedInMonth` (leaderMonthlyStatus.ts:89, 111) — ambos os
// quais listavam incorretamente colaboradores por estado presente
// ignorando cronologia de admissao/desligamento.
//
// Consequencias canonicas ME-fila2-seed:
// - Colaborador admitido em mes N > M NAO aparece em consultas do mes M.
// - Colaborador desligado em mes N < M NAO aparece em consultas do mes M.
// - Colaborador desligado em mes N == M APARECE em consultas do mes M
//   (comportamento canonico — dado o dia de inativacao dentro do mes,
//   o colaborador esteve ativo por parte do mes).
// - Estado `employees.status` NAO participa mais do filtro temporal.
//
// RV-13: consumidor canonico e `src/server/routers/monthlyData.ts` +
//   `src/server/services/leaderMonthlyStatus.ts` + teste
//   `tests/integration/me-fila2-active-in-month.test.ts`.
// RV-14: um statement por linha, largura <= 100 colunas.

import { and, eq, lt, lte, notInArray, type SQL } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees, employeeTerminationEvents } from '../../db/schema';

/**
 * Limites UTC de um mes 'YYYY-MM'.
 * - `firstDay`: primeiro instante do mes (00:00:00.000Z do dia 1).
 * - `lastDay`: ultimo instante do mes (23:59:59.999Z do ultimo dia).
 */
export interface MonthBounds {
  readonly firstDay: Date;
  readonly lastDay: Date;
}

/**
 * Deriva `MonthBounds` canonicos de um `mes` no formato 'YYYY-MM'.
 * Trunca a UTC — motor canonicamente opera em UTC (TZ=UTC).
 *
 * @param mes string 'YYYY-MM' — ex.: '2026-09'.
 * @returns MonthBounds — { firstDay, lastDay } em UTC.
 */
export function monthBounds(mes: string): MonthBounds {
  const parts = mes.split('-');
  const ano = Number(parts[0]);
  const mesNum = Number(parts[1]);
  const firstDay = new Date(Date.UTC(ano, mesNum - 1, 1, 0, 0, 0, 0));
  const lastDay = new Date(Date.UTC(ano, mesNum, 0, 23, 59, 59, 999));
  return { firstDay, lastDay };
}

/**
 * Materializa o array canonico de employeeIds desligados antes do
 * primeiro instante de M (fonte: `employeeTerminationEvents`).
 * Indexado canonicamente por `idx_ete_company_data(companyId,
 * dataInativacao)`.
 *
 * @param db instancia canonica `RoipDatabase`.
 * @param companyId escopo canonico da consulta.
 * @param firstDay primeiro instante do mes M.
 * @returns array de employeeIds desligados antes de firstDay (pode ser vazio).
 */
export async function resolveDesligadosPreviosIds(
  db: RoipDatabase,
  companyId: number,
  firstDay: Date,
): Promise<number[]> {
  const rows = await db
    .select({ id: employeeTerminationEvents.employeeId })
    .from(employeeTerminationEvents)
    .where(
      and(
        eq(employeeTerminationEvents.companyId, companyId),
        lt(employeeTerminationEvents.dataInativacao, firstDay),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Predicado canonico §3.11 de elegibilidade temporal de employee em
 * um mes M. Retorna um `SQL` clause pronto para uso em `where(...)`.
 *
 * Uso canonico:
 *   const bounds = monthBounds(mes);
 *   const desligados = await resolveDesligadosPreviosIds(
 *     db, companyId, bounds.firstDay,
 *   );
 *   const where = activeInMonthWhere(companyId, bounds, desligados);
 *   await db.select().from(employees).where(where);
 *
 * @param companyId escopo canonico.
 * @param bounds limites derivados via `monthBounds(mes)`.
 * @param desligadosPreviosIds materializados via
 *   `resolveDesligadosPreviosIds`.
 * @returns SQL clause pronto para uso em `where(...)`.
 */
export function activeInMonthWhere(
  companyId: number,
  bounds: MonthBounds,
  desligadosPreviosIds: number[],
): SQL {
  const clauses: SQL[] = [
    eq(employees.companyId, companyId),
    lte(employees.dataAdmissao, bounds.lastDay),
  ];
  if (desligadosPreviosIds.length > 0) {
    clauses.push(notInArray(employees.id, desligadosPreviosIds));
  }
  const predicate = and(...clauses);
  if (predicate === undefined) {
    throw new Error('activeInMonthWhere: predicado canonico nao pode ser undefined.');
  }
  return predicate;
}
