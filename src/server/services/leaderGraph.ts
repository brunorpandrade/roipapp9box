// ROIP APP 9BOX — grafo de liderança (fonte única). Vínculos ativos de
// `employeeLeaderHistory` e travessia de descendentes. Consumido por
// `hierarchicalScope` (escopo de acesso PC1h) e por `recorteScope`
// (membros de equipe direta / cadeia total dos dashboards agregados,
// ESPEC §7). Extraído de `hierarchicalScope` na ME §8.06.5 (RV-14) para
// não duplicar a query de vínculos nem a BFS de descendentes.
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeLeaderHistory, employees } from '../../db/schema';

/** Vínculo ativo de liderança de um employee (líder employee ou C-level). */
export interface LeaderLink {
  readonly employeeId: number;
  readonly liderId: number | null;
  readonly clevelId: number | null;
}

/**
 * Vínculos de liderança ativos (`dataFim` nulo) da empresa. Uma leitura
 * por chamada; a travessia se faz em memória sobre o resultado.
 */
export async function loadActiveLeaderLinks(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly LeaderLink[]> {
  return db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));
}

/**
 * IDs de todos os descendentes de `rootEmployeeId` via `liderId` (diretos
 * e indiretos), EXCLUINDO o próprio root. BFS iterativo — resiste a
 * cadeias profundas.
 */
export function collectDescendantEmployeeIds(
  rootEmployeeId: number,
  links: readonly LeaderLink[],
): ReadonlySet<number> {
  const out = new Set<number>();
  const queue: number[] = [rootEmployeeId];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    for (const l of links) {
      if (l.liderId === currentId && !visited.has(l.employeeId)) {
        out.add(l.employeeId);
        queue.push(l.employeeId);
      }
    }
  }
  return out;
}
