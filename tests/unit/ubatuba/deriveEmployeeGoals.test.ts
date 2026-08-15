// ROIP APP 9BOX — testes unit do derivador Ubatuba employeeGoals
// (ME-080e D1). Cobre invariantes canonicas bit-exact:
//   - Total: 192 rows (48 employees pre-kickoff × 4 variaveis).
//   - IDs Ubatuba: shift +1000 sobre Nativa (48 IDs distintos em
//     1004..1051 aproximadamente — exatos determinados pela fixture).
//   - jobFamily, variableIndex, variableName, unit, weight, goal,
//     updatedBy: preservados bit-exact da fixture Nativa.
//   - Unicidade natural (employeeId, variableIndex).
//   - Determinismo: 2 execucoes produzem output identico.
//
// RV-15: numeros medidos, nao estimados. RV-13: derivadores exercitados.

import { describe, expect, it } from 'vitest';

import { deriveNativaEmployeeGoals } from '../../../src/db/seed/nativa/deriveEmployeeGoals';
import { UBATUBA_EMPLOYEE_ID_SHIFT } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO,
  deriveUbatubaEmployeeGoals,
} from '../../../src/db/seed/ubatuba/deriveUbatubaEmployeeGoals';

describe('deriveUbatubaEmployeeGoals — invariantes canonicas bit-exact (ME-080e D1)', () => {
  const goals = deriveUbatubaEmployeeGoals();

  it('total = 192 rows (48 employees pre-kickoff × 4 variaveis)', () => {
    expect(goals.length).toBe(192);
    expect(goals.length).toBe(UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO);
  });

  it('todos os employeeIds tem shift +1000 aplicado sobre a fonte Nativa', () => {
    const nativa = deriveNativaEmployeeGoals();
    for (let index = 0; index < goals.length; index++) {
      const ubatubaGoal = goals[index];
      const nativaGoal = nativa[index];
      expect(ubatubaGoal).toBeDefined();
      expect(nativaGoal).toBeDefined();
      expect(ubatubaGoal!.employeeId).toBe(nativaGoal!.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT);
      expect(ubatubaGoal!.employeeId).toBeGreaterThanOrEqual(1004);
      expect(ubatubaGoal!.employeeId).toBeLessThanOrEqual(1069);
    }
  });

  it('preserva jobFamily/variableIndex/variableName/unit/weight/goal/updatedBy bit-exact', () => {
    const nativa = deriveNativaEmployeeGoals();
    for (let index = 0; index < goals.length; index++) {
      const u = goals[index]!;
      const n = nativa[index]!;
      expect(u.jobFamily).toBe(n.jobFamily);
      expect(u.variableIndex).toBe(n.variableIndex);
      expect(u.variableName).toBe(n.variableName);
      expect(u.unit).toBe(n.unit);
      expect(u.weight).toBe(n.weight);
      expect(u.goal).toBe(n.goal);
      expect(u.updatedBy).toBe(n.updatedBy);
    }
  });

  it('unicidade natural (employeeId, variableIndex)', () => {
    const seen = new Set<string>();
    for (const goal of goals) {
      const key = `${goal.employeeId}:${goal.variableIndex}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(192);
  });

  it('exatamente 48 employees distintos (invariante 192 / 4)', () => {
    const employeeIds = new Set(goals.map((g) => g.employeeId));
    expect(employeeIds.size).toBe(48);
  });

  it('variableIndex sempre em {0,1,2,3}', () => {
    for (const goal of goals) {
      expect([0, 1, 2, 3]).toContain(goal.variableIndex);
    }
  });

  it('determinismo: duas execucoes produzem arrays com mesmos valores', () => {
    const first = deriveUbatubaEmployeeGoals();
    const second = deriveUbatubaEmployeeGoals();
    expect(first.length).toBe(second.length);
    for (let index = 0; index < first.length; index++) {
      expect(second[index]).toEqual(first[index]);
    }
  });

  it('array retornado e congelado (Object.freeze)', () => {
    expect(Object.isFrozen(goals)).toBe(true);
  });
});
