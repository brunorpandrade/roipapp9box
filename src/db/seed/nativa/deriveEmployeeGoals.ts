// ROIP APP 9BOX — derivacao canonica de employeeGoals (ME-068).
//
// Regra canonica bit-exact (E-068-1 fechada em Opcao 192, MD Nativa §6.2 e §16.1):
//   - Metas iniciais atribuidas apenas aos 48 employees pre-kickoff (dataAdmissao < 2026-01-01).
//   - Cada um recebe 4 variaveis do NATIVA_METAS_POR_CARGO[cargoCodigo] correspondentes.
//   - variableName e unit vem de NATIVA_JOB_FAMILY_VARIABLES[jobFamily].
//   - Total canonico bit-exact: 48 × 4 = 192 registros.
//
// Employees pos-kickoff (18 registros) tem `status='ativo'` mas NAO tem employeeGoals
// no snapshot inicial — RH deveria abrir modal `[Definir metas]` para cada um.
// Na fixture Nativa mantemos essa lacuna canonicamente aceita: badge 'Metas pendentes'
// aparece no perfil de cada entrante ao ser aberto.
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts + tests/unit/nativa/
// deriveEmployeeGoals.test.ts.

import {
  NATIVA_EMPLOYEES,
  NATIVA_JOB_FAMILY_VARIABLES,
  NATIVA_METAS_POR_CARGO,
  type NativaJobFamily,
} from './constants';
import { deriveJobFamily } from './deriveEmployee';

/**
 * Estrutura canonica para INSERT em employeeGoals (DOC 01 §4.7).
 */
export interface DerivedEmployeeGoal {
  readonly employeeId: number;
  readonly jobFamily: string;
  readonly variableIndex: number; // 0..3
  readonly variableName: string;
  readonly unit: string;
  readonly weight: string; // DECIMAL(5,2) via string bit-exact
  readonly goal: string; // DECIMAL(15,2) via string bit-exact
  readonly updatedBy: 'rh' | 'lider' | 'super_admin';
}

const KICKOFF = '2026-01-01';

/**
 * Deriva os 192 employeeGoals canonicos bit-exact da Nativa.
 * @returns array congelado de exatamente 192 registros.
 */
export function deriveNativaEmployeeGoals(): readonly DerivedEmployeeGoal[] {
  const goals: DerivedEmployeeGoal[] = [];

  for (const emp of NATIVA_EMPLOYEES) {
    // Filtro canonico: apenas pre-kickoff.
    if (emp.dataAdmissao >= KICKOFF) continue;

    const jobFamily = deriveJobFamily(emp.cargoCodigo) as NativaJobFamily;
    const variaveisFamilia = NATIVA_JOB_FAMILY_VARIABLES[jobFamily];
    const metasCargo = NATIVA_METAS_POR_CARGO[emp.cargoCodigo];

    if (variaveisFamilia === undefined) {
      throw new Error(`deriveNativaEmployeeGoals: familia sem variaveis canonicas='${jobFamily}'`);
    }
    if (metasCargo === undefined) {
      throw new Error(`deriveNativaEmployeeGoals: cargo sem metas canonicas='${emp.cargoCodigo}'`);
    }

    // 4 registros por employee.
    for (let i = 0; i < 4; i++) {
      const varFamilia = variaveisFamilia[i];
      const metaCargo = metasCargo[i];
      if (varFamilia === undefined || metaCargo === undefined) {
        throw new Error(`deriveNativaEmployeeGoals: indice ${i} ausente para emp.id=${emp.id}`);
      }
      goals.push({
        employeeId: emp.id,
        jobFamily,
        variableIndex: i,
        variableName: varFamilia.variableName,
        unit: varFamilia.unit,
        weight: metaCargo.weight.toFixed(2),
        goal: metaCargo.goal.toFixed(2),
        updatedBy: 'rh',
      });
    }
  }

  return Object.freeze(goals);
}

/** Contagem canonica bit-exact esperada. */
export const NATIVA_EMPLOYEE_GOALS_COUNT = 192 as const;
