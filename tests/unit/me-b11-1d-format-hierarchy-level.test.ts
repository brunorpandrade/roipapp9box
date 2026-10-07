// ROIP APP 9BOX — teste unitario canonico do helper
// `formatHierarchyLevel` (ME-B11.1d, XLSX2).
//
// RV-03 bi-direcional canonica: valores canonicos do enum
// `NIVEL_HIERARQUICO_VALUES` produzem labels humanizados pt-BR com
// acentuacao canonica; valores nao-canonicos ou nulos preservam
// comportamento defensivo.
//
// Padrao bit-exact ao teste canonico de `formatJobFamily` da
// ME-B11.1c PATCH2.

import { describe, expect, it } from 'vitest';

import { NIVEL_HIERARQUICO_VALUES } from '../../src/db/schema/enums';
import {
  NIVEL_HIERARQUICO_LABELS,
  formatHierarchyLevel,
} from '../../src/lib/hierarchy-level/formatHierarchyLevel';

describe('formatHierarchyLevel — ME-B11.1d XLSX2', () => {
  it('humaniza os 3 valores canonicos bit-exact (DOC 01 §15.3)', () => {
    expect(formatHierarchyLevel('operacional')).toBe('Operacional');
    expect(formatHierarchyLevel('tatico')).toBe('Tático');
    expect(formatHierarchyLevel('estrategico')).toBe('Estratégico');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(formatHierarchyLevel(null)).toBe('');
    expect(formatHierarchyLevel(undefined)).toBe('');
  });

  it('preserva valores nao-canonicos bit-exact (defensivo)', () => {
    expect(formatHierarchyLevel('xxx_desconhecido')).toBe('xxx_desconhecido');
    expect(formatHierarchyLevel('')).toBe('');
    expect(formatHierarchyLevel('TATICO')).toBe('TATICO');
  });

  it('expoe NIVEL_HIERARQUICO_LABELS com os 3 mapeamentos canonicos', () => {
    expect(NIVEL_HIERARQUICO_LABELS).toEqual({
      operacional: 'Operacional',
      tatico: 'Tático',
      estrategico: 'Estratégico',
    });
  });

  it('cobertura completa — todos os valores do enum tem label', () => {
    for (const v of NIVEL_HIERARQUICO_VALUES) {
      expect(formatHierarchyLevel(v)).toBe(NIVEL_HIERARQUICO_LABELS[v]);
      expect(NIVEL_HIERARQUICO_LABELS[v]).not.toBe(v);
    }
  });
});
