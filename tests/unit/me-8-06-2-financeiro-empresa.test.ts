// ROIP APP 9BOX — teste unit ME §8.06.2 (financeiro da empresa aos 5
// indicadores). Cobre a zona de cor da % folha sobre faturamento
// (ESPEC §11.1), tomando o limite superior da faixa como referência.

import { describe, expect, it } from 'vitest';

import { zonaFolhaPercentual } from '../../src/lib/folhaFaturamento';

describe('ME §8.06.2 — zonaFolhaPercentual (§11.1)', () => {
  it('dentro da faixa (<= limite superior) é verde', () => {
    expect(zonaFolhaPercentual(25, 30)).toBe('verde');
    expect(zonaFolhaPercentual(30, 30)).toBe('verde');
  });

  it('abaixo do limite inferior também é verde', () => {
    expect(zonaFolhaPercentual(15, 30)).toBe('verde');
  });

  it('acima do limite superior até +20% é amarelo', () => {
    expect(zonaFolhaPercentual(33, 30)).toBe('amarelo');
    expect(zonaFolhaPercentual(36, 30)).toBe('amarelo');
  });

  it('acima de +20% do limite superior é vermelho', () => {
    expect(zonaFolhaPercentual(37, 30)).toBe('vermelho');
  });

  it('valor nulo ou faixa não configurada é neutro', () => {
    expect(zonaFolhaPercentual(null, 30)).toBe('neutro');
    expect(zonaFolhaPercentual(25, null)).toBe('neutro');
  });
});
