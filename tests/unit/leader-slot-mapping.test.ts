// ROIP APP 9BOX — teste unitario ME-B9.8-PATCH1 do slot mapping canonico
// da tabela do lider (`src/lib/shared/leaderSlotMapping.ts`).
//
// Cobre canonicamente bit-exact:
//   1. Mapeamento canonico de 4 variaveis 0-based nos 4 slots.
//   2. Descarte silencioso de `variableIndex` fora de [0, 3].
//   3. Subset de variaveis (goals parciais) preserva indices nos slots
//      corretos — slots nao preenchidos ficam `null`.
//   4. Ordem de entrada aleatoria produz os mesmos slots.
//   5. Regressao canonica: `variableIndex=0` NAO e descartado (bug
//      corrigido nesta ME).
//   6. Array vazio retorna 4 slots `null`.
//   7. `LEADER_SLOT_COUNT === 4` preservado.
//
// **RV-13.** Consome exports canonicos de
// `src/lib/shared/leaderSlotMapping.ts`.

import { describe, expect, it } from 'vitest';

import { LEADER_SLOT_COUNT, buildVariaveisPorSlot } from '../../src/lib/shared/leaderSlotMapping';

describe('buildVariaveisPorSlot (ME-B9.8-PATCH1 — DOC 05 §14.14)', () => {
  it('mapeia 4 variaveis 0-based nos 4 slots respectivos', () => {
    const vars = [
      { variableIndex: 0, label: 'v1' },
      { variableIndex: 1, label: 'v2' },
      { variableIndex: 2, label: 'v3' },
      { variableIndex: 3, label: 'v4' },
    ];
    const slots = buildVariaveisPorSlot(vars);
    expect(slots).toHaveLength(LEADER_SLOT_COUNT);
    expect(slots[0]?.label).toBe('v1');
    expect(slots[1]?.label).toBe('v2');
    expect(slots[2]?.label).toBe('v3');
    expect(slots[3]?.label).toBe('v4');
  });

  it('variableIndex fora de [0, 3] e descartado silenciosamente', () => {
    const vars = [
      { variableIndex: -1, label: 'invalido-negativo' },
      { variableIndex: 0, label: 'v1' },
      { variableIndex: 4, label: 'invalido-acima' },
      { variableIndex: 99, label: 'invalido-muito-acima' },
    ];
    const slots = buildVariaveisPorSlot(vars);
    expect(slots).toHaveLength(LEADER_SLOT_COUNT);
    expect(slots[0]?.label).toBe('v1');
    expect(slots[1]).toBeNull();
    expect(slots[2]).toBeNull();
    expect(slots[3]).toBeNull();
  });

  it('subset de variaveis preserva os indices (goals parciais)', () => {
    const vars = [
      { variableIndex: 1, label: 'v2' },
      { variableIndex: 3, label: 'v4' },
    ];
    const slots = buildVariaveisPorSlot(vars);
    expect(slots[0]).toBeNull();
    expect(slots[1]?.label).toBe('v2');
    expect(slots[2]).toBeNull();
    expect(slots[3]?.label).toBe('v4');
  });

  it('ordem de entrada aleatoria produz os mesmos slots', () => {
    const vars = [
      { variableIndex: 3, label: 'v4' },
      { variableIndex: 0, label: 'v1' },
      { variableIndex: 2, label: 'v3' },
      { variableIndex: 1, label: 'v2' },
    ];
    const slots = buildVariaveisPorSlot(vars);
    expect(slots[0]?.label).toBe('v1');
    expect(slots[1]?.label).toBe('v2');
    expect(slots[2]?.label).toBe('v3');
    expect(slots[3]?.label).toBe('v4');
  });

  it('regressao canonica: variableIndex=0 NAO e descartado (bug ME-B9.8-PATCH1)', () => {
    const vars = [{ variableIndex: 0, label: 'variavel-canonica-1' }];
    const slots = buildVariaveisPorSlot(vars);
    expect(slots[0]?.label).toBe('variavel-canonica-1');
    expect(slots[1]).toBeNull();
    expect(slots[2]).toBeNull();
    expect(slots[3]).toBeNull();
  });

  it('array vazio retorna 4 slots null', () => {
    const slots = buildVariaveisPorSlot([]);
    expect(slots).toEqual([null, null, null, null]);
  });

  it('preserva LEADER_SLOT_COUNT = 4', () => {
    expect(LEADER_SLOT_COUNT).toBe(4);
  });
});
