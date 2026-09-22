// ROIP APP 9BOX — ME §8.06.5 — grafo de liderança (puro, sem banco).
// Travessia de descendentes (BFS) sobre vínculos sintéticos.

import { describe, expect, it } from 'vitest';

import {
  collectDescendantEmployeeIds,
  type LeaderLink,
} from '../../src/server/services/leaderGraph';

const LINKS: LeaderLink[] = [
  { employeeId: 2, liderId: 1, clevelId: null },
  { employeeId: 4, liderId: 1, clevelId: null },
  { employeeId: 3, liderId: 2, clevelId: null },
  { employeeId: 5, liderId: null, clevelId: 9 },
];

describe('ME §8.06.5 — collectDescendantEmployeeIds', () => {
  it('coleta diretos e indiretos, excluindo o root', () => {
    const d = collectDescendantEmployeeIds(1, LINKS);
    expect([...d].sort((a, b) => a - b)).toEqual([2, 3, 4]);
    expect(d.has(1)).toBe(false);
  });

  it('líder folha: apenas o anel direto', () => {
    expect([...collectDescendantEmployeeIds(2, LINKS)]).toEqual([3]);
  });

  it('folha sem liderados: vazio', () => {
    expect(collectDescendantEmployeeIds(3, LINKS).size).toBe(0);
  });

  it('resiste a ciclo patológico sem travar', () => {
    const ciclo: LeaderLink[] = [
      { employeeId: 2, liderId: 1, clevelId: null },
      { employeeId: 1, liderId: 2, clevelId: null },
    ];
    expect(collectDescendantEmployeeIds(1, ciclo).has(2)).toBe(true);
  });
});
