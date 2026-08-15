// ROIP APP 9BOX — derivacao canonica bit-exact de employeeGoals da Bebidas
// Ubatuba (ME-080e Dispatch 1).
//
// Estrategia canonica: consome deriveNativaEmployeeGoals() como fonte da
// verdade e aplica shift +UBATUBA_EMPLOYEE_ID_SHIFT (=1000, D5.9) sobre
// employeeId. Nenhuma outra transformacao — jobFamily, variableIndex,
// variableName, unit, weight, goal e updatedBy sao preservados bit-exact
// da fixture Nativa canonica (§16.1: metas por cargo iguais entre
// empresas do mesmo porte + segmento comparaveis).
//
// Total canonico bit-exact: 192 rows (48 employees pre-kickoff × 4
// variaveis). Os 18 employees pos-kickoff Ubatuba (ids 1052..1069 minus
// os que sao ativos pre-kickoff) canonicamente NAO tem goals iniciais —
// mesmo gap intencional §16.1 da fixture Nativa (badge "Metas pendentes"
// no perfil).
//
// D1.1 (aprovado): variant isolada Ubatuba, nao parametriza Nativa.
// D1.2 (aprovado): determinismo total via reuso da fonte determinista
//   Nativa + transformacao pura (shift). Zero PRNG proprio necessario.
// D1.3 (aprovado): 192 rows bit-exact.
//
// RV-12: 100% Drizzle-ready via consumidor loadFixtures.
// RV-13: consumido por src/db/seed/ubatuba/seedUbatubaOperacionalD1.ts +
//   tests/unit/ubatuba/deriveEmployeeGoals.test.ts.
// RV-14: um statement por linha, largura <= 100 colunas.
// RV-15: contagem 192 medida e exportada como constante canonica.

import {
  deriveNativaEmployeeGoals,
  type DerivedEmployeeGoal,
  NATIVA_EMPLOYEE_GOALS_COUNT,
} from '../nativa/deriveEmployeeGoals';

import { UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

/**
 * Estrutura canonica bit-exact para INSERT em employeeGoals da Ubatuba.
 * Mesmo shape do DerivedEmployeeGoal Nativa — apenas employeeId ja
 * deslocado.
 */
export type DerivedUbatubaEmployeeGoal = DerivedEmployeeGoal;

/**
 * Deriva os 192 employeeGoals canonicos bit-exact da Bebidas Ubatuba
 * (companies.id=2). Consome a fonte canonica Nativa e aplica shift
 * +UBATUBA_EMPLOYEE_ID_SHIFT sobre employeeId.
 *
 * @returns array congelado de exatamente 192 registros.
 */
export function deriveUbatubaEmployeeGoals(): readonly DerivedUbatubaEmployeeGoal[] {
  const nativaGoals = deriveNativaEmployeeGoals();
  const ubatubaGoals: DerivedUbatubaEmployeeGoal[] = nativaGoals.map((goal) => ({
    employeeId: goal.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
    jobFamily: goal.jobFamily,
    variableIndex: goal.variableIndex,
    variableName: goal.variableName,
    unit: goal.unit,
    weight: goal.weight,
    goal: goal.goal,
    updatedBy: goal.updatedBy,
  }));
  return Object.freeze(ubatubaGoals);
}

/**
 * Contagem canonica bit-exact esperada em Ubatuba (mesma da Nativa —
 * espelho estrutural declarado em §16.1).
 */
export const UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO = NATIVA_EMPLOYEE_GOALS_COUNT;
