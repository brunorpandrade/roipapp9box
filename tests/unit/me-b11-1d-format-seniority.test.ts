// ROIP APP 9BOX — teste unitario canonico do helper
// `formatSeniority` (ME-B11.1d, XLSX2).
//
// RV-03 bi-direcional canonica: valores canonicos do enum produzem
// labels humanizados pt-BR com acentuacao canonica; valores
// nao-canonicos ou nulos preservam comportamento defensivo.
//
// Padrao bit-exact ao teste canonico de `formatJobFamily` da
// ME-B11.1c PATCH2.

import { describe, expect, it } from 'vitest';

import {
  SENIORIDADE_LABELS,
  SENIORITY_VALUES,
  formatSeniority,
} from '../../src/lib/seniority/formatSeniority';

describe('formatSeniority — ME-B11.1d XLSX2', () => {
  it('humaniza os 3 valores canonicos bit-exact (DOC 01 §4.5)', () => {
    expect(formatSeniority('junior')).toBe('Júnior');
    expect(formatSeniority('pleno')).toBe('Pleno');
    expect(formatSeniority('senior')).toBe('Sênior');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(formatSeniority(null)).toBe('');
    expect(formatSeniority(undefined)).toBe('');
  });

  it('preserva valores nao-canonicos bit-exact (defensivo)', () => {
    expect(formatSeniority('xxx_desconhecido')).toBe('xxx_desconhecido');
    expect(formatSeniority('')).toBe('');
    expect(formatSeniority('JUNIOR')).toBe('JUNIOR');
  });

  it('expoe SENIORITY_VALUES com os 3 valores canonicos na ordem canonica', () => {
    expect(SENIORITY_VALUES).toEqual(['junior', 'pleno', 'senior']);
  });

  it('expoe SENIORIDADE_LABELS com os 3 mapeamentos canonicos', () => {
    expect(SENIORIDADE_LABELS).toEqual({
      junior: 'Júnior',
      pleno: 'Pleno',
      senior: 'Sênior',
    });
  });

  it('cobertura completa — todos os valores do enum tem label', () => {
    for (const v of SENIORITY_VALUES) {
      expect(formatSeniority(v)).toBe(SENIORIDADE_LABELS[v]);
      expect(SENIORIDADE_LABELS[v]).not.toBe(v);
    }
  });
});
