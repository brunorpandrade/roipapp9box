// ROIP APP 9BOX — teste unit dos 192 employeeGoals canonicos Nativa (ME-068).
//
// Cobre invariantes canonicas bit-exact:
//   - Total de 192 goals (48 employees pre-kickoff × 4 variaveis).
//   - Cada employee pre-kickoff aparece exatamente 4 vezes.
//   - variableIndex ∈ {0,1,2,3} para cada employee.
//   - weight canonico decimal string com 2 casas.
//   - goal canonico decimal string com 2 casas.
//   - updatedBy sempre 'rh' na fixture inicial.

import { describe, expect, it } from 'vitest';

import {
  NATIVA_EMPLOYEE_GOALS_COUNT,
  deriveNativaEmployeeGoals,
} from '../../../src/db/seed/nativa/deriveEmployeeGoals';

describe('deriveNativaEmployeeGoals — 192 canonicos bit-exact', () => {
  const goals = deriveNativaEmployeeGoals();

  it('total canonico = 192 (E-068-1)', () => {
    expect(goals.length).toBe(192);
    expect(NATIVA_EMPLOYEE_GOALS_COUNT).toBe(192);
    expect(goals.length).toBe(NATIVA_EMPLOYEE_GOALS_COUNT);
  });

  it('cada employeeId aparece exatamente 4 vezes', () => {
    const contagem = new Map<number, number>();
    for (const g of goals) {
      contagem.set(g.employeeId, (contagem.get(g.employeeId) ?? 0) + 1);
    }
    for (const [empId, count] of contagem.entries()) {
      expect(count).toBe(4);
      expect(empId).toBeGreaterThan(0);
    }
    // 192 / 4 = 48 employees pre-kickoff
    expect(contagem.size).toBe(48);
  });

  it('variableIndex ∈ {0,1,2,3} para cada employee — sem duplicata', () => {
    const porEmp = new Map<number, Set<number>>();
    for (const g of goals) {
      let bucket = porEmp.get(g.employeeId);
      if (!bucket) {
        bucket = new Set();
        porEmp.set(g.employeeId, bucket);
      }
      bucket.add(g.variableIndex);
    }
    for (const bucket of porEmp.values()) {
      expect(bucket.size).toBe(4);
      expect([...bucket].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('weight e goal sao decimal string com 2 casas', () => {
    const dec2 = /^-?\d+\.\d{2}$/;
    for (const g of goals) {
      expect(g.weight).toMatch(dec2);
      expect(g.goal).toMatch(dec2);
    }
  });

  it('updatedBy sempre "rh" na fixture inicial (D3 aprovado)', () => {
    for (const g of goals) {
      expect(g.updatedBy).toBe('rh');
    }
  });

  it('array e frozen (Object.freeze) — imutabilidade canonica', () => {
    expect(Object.isFrozen(goals)).toBe(true);
  });
});
