// ROIP APP 9BOX — helper canonico `countEmployeesByJobFamily`
// (ME-1.17.2, Conversa 5 — UI de gestao de familias).
//
// Retorna um mapa `Record<JobFamily, number>` com a contagem de
// colaboradores ATIVOS (`statusVinculo = 'ativo'`) de uma empresa
// agrupados por `jobFamily`. Todas as 26 chaves canonicas de
// `JOB_FAMILY_VALUES` sao retornadas; familias sem colaboradores
// recebem contagem 0.
//
// Consumidores canonicos (RV-13):
// - `src/app/super-admin/empresa/[id]/familias/page.tsx` — expoe
//   contagem no card de cada familia (badge "N colaboradores").
// - `src/app/super-admin/empresa/[id]/familias/actions.ts` — guard
//   de desativacao (D6 canonizada ME-1.17.2): familia com
//   contagem > 0 nao pode ser desativada.
//
// RV-12: Drizzle tipado.

import { and, eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees } from '../../db/schema';
import type { JobFamily } from '../../db/schema/enums';
import { JOB_FAMILY_VALUES } from '../../db/schema/enums';

/**
 * Tipo canonico serializavel: mapa de contagem por familia. Todas as
 * 26 chaves presentes; familias sem colaboradores com valor 0.
 */
export type EmployeeCountByFamily = Readonly<Record<JobFamily, number>>;

/**
 * Conta colaboradores ATIVOS (`statusVinculo = 'ativo'`) de uma
 * empresa agrupados por `jobFamily`. Retorno canonico cobre as 26
 * chaves — chaves sem colaboradores recebem 0.
 *
 * Custo: 1 SELECT com GROUP BY sobre `employees` (indexado por
 * `companyId` + `jobFamily` via patterns canonicos existentes).
 */
export async function countEmployeesByJobFamily(
  db: RoipDatabase,
  companyId: number,
): Promise<EmployeeCountByFamily> {
  const rows = await db
    .select({
      jobFamily: employees.jobFamily,
      total: sql<number>`CAST(COUNT(*) AS UNSIGNED)`,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .groupBy(employees.jobFamily);

  const result = {} as Record<JobFamily, number>;
  for (const key of JOB_FAMILY_VALUES) {
    result[key] = 0;
  }
  for (const row of rows) {
    result[row.jobFamily] = Number(row.total);
  }
  return result;
}
