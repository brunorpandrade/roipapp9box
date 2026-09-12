// ROIP APP 9BOX — teste unit catalogos canonicos de Instrumento
// (ME-B10-02, S253). Cobre cardinalidade, unicidade e forma das
// legendas Likert dos catalogos A e D.

import { describe, expect, it } from 'vitest';

import { INSTRUMENT_A_CATALOG } from '../../src/lib/instruments/instrumentACatalog';
import { INSTRUMENT_D_CATALOG } from '../../src/lib/instruments/instrumentDCatalog';

describe('INSTRUMENT_A_CATALOG — estrutura canonica §6.2', () => {
  it('nome canonico', () => {
    expect(INSTRUMENT_A_CATALOG.nome).toBe('Autoavaliação');
  });

  it('4 dimensoes canonicas', () => {
    expect(INSTRUMENT_A_CATALOG.dimensoes.length).toBe(4);
    const nomes = INSTRUMENT_A_CATALOG.dimensoes.map((d) => d.nome);
    expect(nomes).toEqual(['Engajamento', 'Desenvolvimento', 'Pertencimento', 'Realização']);
  });

  it('cada dimensao tem 5 itens', () => {
    for (const dim of INSTRUMENT_A_CATALOG.dimensoes) {
      expect(dim.itens.length).toBe(5);
    }
  });

  it('numeroItens total canonico = 20', () => {
    expect(INSTRUMENT_A_CATALOG.numeroItens).toBe(20);
    const soma = INSTRUMENT_A_CATALOG.dimensoes.reduce((acc, d) => acc + d.itens.length, 0);
    expect(soma).toBe(20);
  });

  it('grid canonico 4x5: (dimensao, itemIndex) unicos e no range 1..4 x 1..5', () => {
    const chaves = new Set<string>();
    for (const dim of INSTRUMENT_A_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        expect(item.dimensao).toBeGreaterThanOrEqual(1);
        expect(item.dimensao).toBeLessThanOrEqual(4);
        expect(item.itemIndex).toBeGreaterThanOrEqual(1);
        expect(item.itemIndex).toBeLessThanOrEqual(5);
        chaves.add(`${item.dimensao}-${item.itemIndex}`);
      }
    }
    expect(chaves.size).toBe(20);
  });

  it('escala Likert canonica: 5 opcoes de valor 0..4 com legendas literais', () => {
    expect(INSTRUMENT_A_CATALOG.legendas.length).toBe(5);
    const valores = INSTRUMENT_A_CATALOG.legendas.map((l) => l.valor);
    expect(valores).toEqual([0, 1, 2, 3, 4]);
    const labels = INSTRUMENT_A_CATALOG.legendas.map((l) => l.label);
    expect(labels).toEqual(['Nunca', 'Quase nunca', 'Às vezes', 'Quase sempre', 'Sempre']);
  });

  it('enunciados nao-vazios', () => {
    for (const dim of INSTRUMENT_A_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        expect(item.enunciado.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('INSTRUMENT_D_CATALOG — estrutura canonica §8.2', () => {
  it('nome canonico', () => {
    expect(INSTRUMENT_D_CATALOG.nome).toBe('Avaliação da liderança direta');
  });

  it('4 dimensoes canonicas', () => {
    expect(INSTRUMENT_D_CATALOG.dimensoes.length).toBe(4);
    const nomes = INSTRUMENT_D_CATALOG.dimensoes.map((d) => d.nome);
    expect(nomes).toEqual([
      'Direcionamento e clareza',
      'Desenvolvimento e apoio',
      'Relacionamento e confiança',
      'Gestão e resultados',
    ]);
  });

  it('cada dimensao tem 5 itens', () => {
    for (const dim of INSTRUMENT_D_CATALOG.dimensoes) {
      expect(dim.itens.length).toBe(5);
    }
  });

  it('numeroItens total canonico = 20', () => {
    expect(INSTRUMENT_D_CATALOG.numeroItens).toBe(20);
  });

  it('grid canonico 4x5: (dimensao, itemIndex) unicos e no range 1..4 x 1..5', () => {
    const chaves = new Set<string>();
    for (const dim of INSTRUMENT_D_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        expect(item.dimensao).toBeGreaterThanOrEqual(1);
        expect(item.dimensao).toBeLessThanOrEqual(4);
        expect(item.itemIndex).toBeGreaterThanOrEqual(1);
        expect(item.itemIndex).toBeLessThanOrEqual(5);
        chaves.add(`${item.dimensao}-${item.itemIndex}`);
      }
    }
    expect(chaves.size).toBe(20);
  });

  it('escala Likert identica ao A: 5 opcoes 0..4 mesmas legendas', () => {
    expect(INSTRUMENT_D_CATALOG.legendas.length).toBe(5);
    const valores = INSTRUMENT_D_CATALOG.legendas.map((l) => l.valor);
    expect(valores).toEqual([0, 1, 2, 3, 4]);
    const labels = INSTRUMENT_D_CATALOG.legendas.map((l) => l.label);
    expect(labels).toEqual(['Nunca', 'Quase nunca', 'Às vezes', 'Quase sempre', 'Sempre']);
  });

  it('todos os enunciados comecam com "Meu líder" (foco canonico §8.2)', () => {
    for (const dim of INSTRUMENT_D_CATALOG.dimensoes) {
      for (const item of dim.itens) {
        expect(item.enunciado.startsWith('Meu líder')).toBe(true);
      }
    }
  });
});

describe('Reuso de tipos entre catalogos A e D (S253)', () => {
  it('mesma estrutura de forma InstrumentCatalog para ambos', () => {
    for (const cat of [INSTRUMENT_A_CATALOG, INSTRUMENT_D_CATALOG]) {
      expect(typeof cat.nome).toBe('string');
      expect(Array.isArray(cat.dimensoes)).toBe(true);
      expect(Array.isArray(cat.legendas)).toBe(true);
      expect(typeof cat.numeroItens).toBe('number');
    }
  });

  it('imutabilidade canonica: Object.freeze aplicado', () => {
    expect(Object.isFrozen(INSTRUMENT_A_CATALOG)).toBe(true);
    expect(Object.isFrozen(INSTRUMENT_D_CATALOG)).toBe(true);
  });
});
