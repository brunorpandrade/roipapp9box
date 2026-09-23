// ROIP APP 9BOX — régua única da seta de movimento no 9-Box
// (lib/nineBoxSeta), compartilhada por individual e agregados (§8.06.6a).
// 8 direções por posição; cor verde/amarelo/vermelho; sem movimento ou
// sem base -> vazio. Ajuste de cor §8.06.6a: um eixo retrocede = amarelo
// (antes vermelho); vermelho só quando ambos retrocedem.

import { describe, expect, it } from 'vitest';

import { colIndexFor, derivarSeta, rowIndexFor } from '../../src/lib/nineBoxSeta';

const VERDE = '#16A34A';
const AMARELO = '#F2A900';
const VERMELHO = '#DC2626';

describe('lib/nineBoxSeta — derivarSeta', () => {
  it('sem base anterior -> vazio', () => {
    const s = derivarSeta('medio', 'media', null, null);
    expect(s.char).toBe('');
    expect(s.label).toBe('');
    expect(s.color).toBe('');
  });

  it('mesma célula -> vazio (nada na grade, Manteve no card)', () => {
    const s = derivarSeta('medio', 'media', 'medio', 'media');
    expect(s.char).toBe('');
    expect(s.label).toBe('');
  });

  it('↗ direita+cima -> verde, "Subiu"', () => {
    const s = derivarSeta('alto', 'alta', 'medio', 'media');
    expect(s.char).toBe('↗');
    expect(s.color).toBe(VERDE);
    expect(s.label).toBe('Subiu');
  });

  it('→ só desempenho sobe -> verde, "Desempenho subiu"', () => {
    const s = derivarSeta('alto', 'media', 'medio', 'media');
    expect(s.char).toBe('→');
    expect(s.color).toBe(VERDE);
    expect(s.label).toBe('Desempenho subiu');
  });

  it('↑ só plenitude sobe -> verde, "Plenitude subiu"', () => {
    const s = derivarSeta('medio', 'alta', 'medio', 'media');
    expect(s.char).toBe('↑');
    expect(s.color).toBe(VERDE);
    expect(s.label).toBe('Plenitude subiu');
  });

  it('↓ só plenitude cai -> amarelo, "Plenitude caiu"', () => {
    const s = derivarSeta('medio', 'baixa', 'medio', 'media');
    expect(s.char).toBe('↓');
    expect(s.color).toBe(AMARELO);
    expect(s.label).toBe('Plenitude caiu');
  });

  it('← só desempenho cai -> amarelo, "Desempenho caiu"', () => {
    const s = derivarSeta('baixo', 'media', 'medio', 'media');
    expect(s.char).toBe('←');
    expect(s.color).toBe(AMARELO);
    expect(s.label).toBe('Desempenho caiu');
  });

  it('↖ plenitude sobe, desempenho cai -> amarelo', () => {
    const s = derivarSeta('baixo', 'alta', 'medio', 'media');
    expect(s.char).toBe('↖');
    expect(s.color).toBe(AMARELO);
    expect(s.label).toBe('Plenitude subiu, desempenho caiu');
  });

  it('↘ desempenho sobe, plenitude cai -> amarelo', () => {
    const s = derivarSeta('alto', 'baixa', 'medio', 'media');
    expect(s.char).toBe('↘');
    expect(s.color).toBe(AMARELO);
    expect(s.label).toBe('Desempenho subiu, plenitude caiu');
  });

  it('↙ ambos caem -> vermelho, "Caiu"', () => {
    const s = derivarSeta('baixo', 'baixa', 'medio', 'media');
    expect(s.char).toBe('↙');
    expect(s.color).toBe(VERMELHO);
    expect(s.label).toBe('Caiu');
  });

  it('índices de posição', () => {
    expect(colIndexFor('baixo')).toBe(0);
    expect(colIndexFor('alto')).toBe(2);
    expect(rowIndexFor('alta')).toBe(0);
    expect(rowIndexFor('baixa')).toBe(2);
  });
});
