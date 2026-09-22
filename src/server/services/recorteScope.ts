// ROIP APP 9BOX — membros dos recortes dos dashboards agregados (ESPEC
// §2, §3, §6, §7). Departamento (mesma etiqueta, exclui C-levels —
// que não são employees), equipe direta (primeiro anel de um líder) e
// cadeia total (todos os níveis abaixo, exceto o próprio líder). Fonte
// única do grafo em `leaderGraph`.
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees } from '../../db/schema';
import type { Departamento } from '../../db/schema/enums';

import { collectDescendantEmployeeIds, loadActiveLeaderLinks } from './leaderGraph';

/** Líder alvo de um recorte de equipe/cadeia: employee ou C-level. */
export interface RecorteLeader {
  readonly tipo: 'employee' | 'clevel';
  readonly id: number;
}

function ordenar(ids: Iterable<number>): readonly number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/**
 * IDs dos employees ativos de um departamento (mesma etiqueta). C-levels
 * não são employees, então já ficam de fora (§6.2).
 */
export async function listDepartmentEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  departamento: Departamento,
): Promise<readonly number[]> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.departamento, departamento),
        eq(employees.status, 'ativo'),
      ),
    );
  return ordenar(rows.map((r) => r.id));
}

/**
 * IDs do primeiro anel de um líder (equipe direta, §7): liderados a
 * exatamente um nível. Líder employee casa por `liderId`; C-level por
 * `clevelId`.
 */
export async function listDirectReportEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  leader: RecorteLeader,
): Promise<readonly number[]> {
  const links = await loadActiveLeaderLinks(db, companyId);
  const ids: number[] = [];
  for (const l of links) {
    const isDirect = leader.tipo === 'clevel' ? l.clevelId === leader.id : l.liderId === leader.id;
    if (isDirect) {
      ids.push(l.employeeId);
    }
  }
  return ordenar(ids);
}

/**
 * IDs da cadeia total de um líder (§7): todos os níveis abaixo, diretos
 * e indiretos, EXCLUINDO o próprio líder. Líder employee: descendentes
 * via `liderId`. C-level: diretos por `clevelId` + descendentes de cada.
 */
export async function listChainEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  leader: RecorteLeader,
): Promise<readonly number[]> {
  const links = await loadActiveLeaderLinks(db, companyId);
  if (leader.tipo === 'employee') {
    return ordenar(collectDescendantEmployeeIds(leader.id, links));
  }
  const todos = new Set<number>();
  for (const l of links) {
    if (l.clevelId === leader.id) {
      todos.add(l.employeeId);
      for (const id of collectDescendantEmployeeIds(l.employeeId, links)) {
        todos.add(id);
      }
    }
  }
  return ordenar(todos);
}
