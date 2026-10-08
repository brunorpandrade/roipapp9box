// ROIP APP 9BOX — testes unitarios do INSTRUMENT_C_CATALOG (ME-B11.2b).
// Verifica cardinalidade canonica (4 dimensoes x 5 itens = 20),
// unicidade (dimensao, itemIndex), legendas canonicas 0..4, e nomes
// das 4 dimensoes canonicas espelhados do Instrumento A.

import { describe, it, expect } from 'vitest';

import { INSTRUMENT_C_CATALOG } from '../../src/lib/instruments/instrumentCCatalog';

describe('INSTRUMENT_C_CATALOG', () => {
  it('tem 4 dimensoes canonicas na ordem fixa', () => {
    const nomes = INSTRUMENT_C_CATALOG.dimensoes.map((d) => d.nome);
    expect(nomes).toEqual(['Engajamento', 'Desenvolvimento', 'Pertencimento', 'Realização']);
  });

  it('tem exatamente 20 itens (4 dim x 5 itens)', () => {
    expect(INSTRUMENT_C_CATALOG.numeroItens).toBe(20);
    const total = INSTRUMENT_C_CATALOG.dimensoes.reduce((acc, d) => acc + d.itens.length, 0);
    expect(total).toBe(20);
    for (const dim of INSTRUMENT_C_CATALOG.dimensoes) {
      expect(dim.itens).toHaveLength(5);
    }
  });

  it('tem 5 legendas canonicas 0..4', () => {
    expect(INSTRUMENT_C_CATALOG.legendas).toHaveLength(5);
    expect(INSTRUMENT_C_CATALOG.legendas.map((l) => l.valor)).toEqual([0, 1, 2, 3, 4]);
    expect(INSTRUMENT_C_CATALOG.legendas.map((l) => l.label)).toEqual([
      'Nunca',
      'Quase nunca',
      'Às vezes',
      'Quase sempre',
      'Sempre',
    ]);
  });

  it('cada (dimensao, itemIndex) e unico', () => {
    const chaves = new Set<string>();
    for (const dim of INSTRUMENT_C_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        const key = `${item.dimensao}-${item.itemIndex}`;
        expect(chaves.has(key)).toBe(false);
        chaves.add(key);
      }
    }
    expect(chaves.size).toBe(20);
  });

  it('todo item tem enunciado nao vazio', () => {
    for (const dim of INSTRUMENT_C_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        expect(item.enunciado.length).toBeGreaterThan(10);
      }
    }
  });
});
