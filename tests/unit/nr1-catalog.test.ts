// ROIP APP 9BOX — teste unit do catalogo canonico do Radar NR-1
// (ME-B10-03, S254). Cobre cardinalidade, unicidade, forma das
// legendas e ALINHAMENTO CANONICO bit-a-bit com `FATORES_NR1` do
// motor (`src/server/services/nr1CalculationEngine.ts`).
//
// Este teste e o guarda-corpo canonico do RV-13 dirigido: qualquer
// divergencia de id/nome/tipo entre o catalogo do front-end e o
// motor do back-end quebra a suite imediatamente.

import { describe, expect, it } from 'vitest';

import { NR1_CATALOG } from '../../src/lib/instruments/nr1Catalog';
import {
  FATORES_NR1,
  NUM_FATORES_NR1,
  NUM_ITENS_POR_FATOR_NR1,
  NUM_ITENS_TOTAL_NR1,
  VALOR_MAXIMO_NR1,
  VALOR_MINIMO_NR1,
} from '../../src/server/services/nr1CalculationEngine';

describe('NR1_CATALOG — estrutura canonica §11.4 + §11.6', () => {
  it('nome canonico', () => {
    expect(NR1_CATALOG.nome).toBe('Radar NR-1');
  });

  it('8 fatores canonicos', () => {
    expect(NR1_CATALOG.fatores.length).toBe(NUM_FATORES_NR1);
  });

  it('cada fator tem 4 itens', () => {
    for (const fator of NR1_CATALOG.fatores) {
      expect(fator.itens.length).toBe(NUM_ITENS_POR_FATOR_NR1);
    }
  });

  it('numeroItens total canonico = 32', () => {
    expect(NR1_CATALOG.numeroItens).toBe(NUM_ITENS_TOTAL_NR1);
    const soma = NR1_CATALOG.fatores.reduce((acc, f) => acc + f.itens.length, 0);
    expect(soma).toBe(NUM_ITENS_TOTAL_NR1);
  });

  it('grid canonico 8x4: (fator, itemIndex) unicos e no range 1..8 x 1..4', () => {
    const chaves = new Set<string>();
    for (const fator of NR1_CATALOG.fatores) {
      for (const item of fator.itens) {
        expect(item.fator).toBeGreaterThanOrEqual(1);
        expect(item.fator).toBeLessThanOrEqual(NUM_FATORES_NR1);
        expect(item.itemIndex).toBeGreaterThanOrEqual(1);
        expect(item.itemIndex).toBeLessThanOrEqual(NUM_ITENS_POR_FATOR_NR1);
        expect(item.fator).toBe(fator.id);
        chaves.add(`${item.fator}-${item.itemIndex}`);
      }
    }
    expect(chaves.size).toBe(NUM_ITENS_TOTAL_NR1);
  });

  it('escala Likert canonica: 5 opcoes de valor 0..4 com legendas literais', () => {
    expect(NR1_CATALOG.legendas.length).toBe(5);
    const valores = NR1_CATALOG.legendas.map((l) => l.valor);
    expect(valores).toEqual([VALOR_MINIMO_NR1, 1, 2, 3, VALOR_MAXIMO_NR1]);
    const labels = NR1_CATALOG.legendas.map((l) => l.label);
    expect(labels).toEqual(['Nunca', 'Quase nunca', 'Às vezes', 'Quase sempre', 'Sempre']);
  });

  it('enunciados nao-vazios', () => {
    for (const fator of NR1_CATALOG.fatores) {
      for (const item of fator.itens) {
        expect(item.enunciado.length).toBeGreaterThan(0);
      }
    }
  });

  it('imutabilidade canonica: Object.freeze aplicado', () => {
    expect(Object.isFrozen(NR1_CATALOG)).toBe(true);
    expect(Object.isFrozen(NR1_CATALOG.fatores)).toBe(true);
    expect(Object.isFrozen(NR1_CATALOG.legendas)).toBe(true);
  });
});

describe('NR1_CATALOG — alinhamento canonico com FATORES_NR1 do motor', () => {
  it('mesma cardinalidade de fatores', () => {
    expect(NR1_CATALOG.fatores.length).toBe(FATORES_NR1.length);
  });

  it('cada fator do catalogo tem id, nome e tipo bit-a-bit iguais ao motor', () => {
    for (const engineFator of FATORES_NR1) {
      const catalogFator = NR1_CATALOG.fatores.find((f) => f.id === engineFator.id);
      expect(catalogFator, `Fator id=${engineFator.id} ausente no catalogo`).toBeDefined();
      if (catalogFator === undefined) {
        continue;
      }
      expect(catalogFator.nome).toBe(engineFator.nome);
      expect(catalogFator.tipo).toBe(engineFator.tipo);
    }
  });

  it('ordem canonica dos fatores (1..8) preservada', () => {
    const idsCatalogo = NR1_CATALOG.fatores.map((f) => f.id);
    const idsEngine = FATORES_NR1.map((f) => f.id);
    expect(idsCatalogo).toEqual(idsEngine);
  });

  it('nomes canonicos literais do §11.6', () => {
    const nomes = NR1_CATALOG.fatores.map((f) => f.nome);
    expect(nomes).toEqual([
      'Exigências quantitativas',
      'Ritmo de trabalho',
      'Conflitos de papel',
      'Autonomia',
      'Suporte social do líder',
      'Suporte social de colegas',
      'Insegurança no trabalho',
      'Saúde geral autopercebida',
    ]);
  });

  it('tipos canonicos (risco vs recurso) do §11.6', () => {
    const tipoPorId = new Map<number, string>();
    for (const f of NR1_CATALOG.fatores) {
      tipoPorId.set(f.id, f.tipo);
    }
    expect(tipoPorId.get(1)).toBe('risco');
    expect(tipoPorId.get(2)).toBe('risco');
    expect(tipoPorId.get(3)).toBe('risco');
    expect(tipoPorId.get(4)).toBe('recurso');
    expect(tipoPorId.get(5)).toBe('recurso');
    expect(tipoPorId.get(6)).toBe('recurso');
    expect(tipoPorId.get(7)).toBe('risco');
    expect(tipoPorId.get(8)).toBe('recurso');
  });
});
