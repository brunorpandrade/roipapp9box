// ROIP APP 9BOX — service `departments` (ME-010).
//
// Repositorio tipado da tabela de referencia canonica `departments` (DOC 01
// §6). Os 19 registros sao semeados diretamente pela migration `M003` e
// **imutaveis** — nao ha `create*`, `update*` ou `delete*` publico. O
// service expoe apenas leitura, o suficiente para os consumidores da B3+
// resolverem `departamento` de employees/cLevel para `departments.id` sem
// duplicar SQL.

import { asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { departments } from '../../db/schema';

/**
 * Lista os 19 departamentos canonicos em ordem crescente de `id`. Ordem
 * corresponde a §15.1 do DOC 01 e sustenta o assert canonico do RV-11
 * (`departments.length === 19`).
 */
export async function listAllDepartments(db: RoipDatabase) {
  return await db.select().from(departments).orderBy(asc(departments.id));
}

/**
 * Resolve um departamento pelo nome (`nome` eh UNIQUE — DOC 01 §6). Retorna
 * `undefined` se o nome nao existir (nao deveria ocorrer em producao apos a
 * migration, mas o teste RV-03 depende disso para injetar defeito).
 */
export async function getDepartmentByName(db: RoipDatabase, nome: string) {
  const rows = await db.select().from(departments).where(eq(departments.nome, nome)).limit(1);
  return rows[0];
}
