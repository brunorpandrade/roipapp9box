// ROIP APP 9BOX — variaveis vigentes por colaborador (DOC 03 §3.2/§3.3,
// ME-fila6 D3).
//
// O motor do Eixo X consome exclusivamente o snapshot individual em
// `employeeGoals` (nome, unidade, peso e meta das 4 variaveis). O lancamento
// mensal do lider (tela, salvamento e planilhas) usava o template-empresa
// (`companyJobFamilies`) para decidir "peso zero", o que diverge do motor
// assim que o RH define pesos individuais pelo modal [Definir metas].
//
// Regra desta fonte unica:
// - colaborador com as 4 metas da familia atual → snapshot individual;
// - caso contrario (metas pendentes) → template-empresa da familia.
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, asc, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companyJobFamilies, employeeGoals } from '../../db/schema';
import type { JobFamily } from '../../db/schema';
import { VARIAVEIS_POR_FAMILIA } from '../../lib/shared/employeeGoalsForm';

/** Variavel vigente do colaborador. */
interface EmployeeVariable {
  readonly variableIndex: number;
  readonly variableName: string;
  readonly unit: string;
  readonly weight: string;
}

/**
 * Resolve as variaveis vigentes de cada colaborador informado. Retorna um
 * mapa `employeeId -> variaveis` ordenado por `variableIndex`.
 */
export async function listEmployeeVariables(
  db: RoipDatabase,
  companyId: number,
  emps: readonly { readonly id: number; readonly jobFamily: JobFamily }[],
): Promise<Map<number, EmployeeVariable[]>> {
  const out = new Map<number, EmployeeVariable[]>();
  if (emps.length === 0) {
    return out;
  }
  const familias = [...new Set(emps.map((e) => e.jobFamily))];
  const templateRows = await db
    .select({
      jobFamily: companyJobFamilies.jobFamily,
      variableIndex: companyJobFamilies.variableIndex,
      variableName: companyJobFamilies.variableName,
      unit: companyJobFamilies.unit,
      weight: companyJobFamilies.weight,
    })
    .from(companyJobFamilies)
    .where(
      and(
        eq(companyJobFamilies.companyId, companyId),
        inArray(companyJobFamilies.jobFamily, familias),
      ),
    )
    .orderBy(asc(companyJobFamilies.variableIndex));
  const goalRows = await db
    .select({
      employeeId: employeeGoals.employeeId,
      jobFamily: employeeGoals.jobFamily,
      variableIndex: employeeGoals.variableIndex,
      variableName: employeeGoals.variableName,
      unit: employeeGoals.unit,
      weight: employeeGoals.weight,
    })
    .from(employeeGoals)
    .where(
      inArray(
        employeeGoals.employeeId,
        emps.map((e) => e.id),
      ),
    )
    .orderBy(asc(employeeGoals.variableIndex));

  for (const emp of emps) {
    const individuais = goalRows.filter(
      (g) => g.employeeId === emp.id && g.jobFamily === emp.jobFamily,
    );
    const fonte =
      individuais.length === VARIAVEIS_POR_FAMILIA
        ? individuais
        : templateRows.filter((t) => t.jobFamily === emp.jobFamily);
    out.set(
      emp.id,
      fonte.map((v) => ({
        variableIndex: v.variableIndex,
        variableName: v.variableName,
        unit: v.unit,
        weight: v.weight,
      })),
    );
  }
  return out;
}
