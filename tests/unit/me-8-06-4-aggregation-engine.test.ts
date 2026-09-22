// ROIP APP 9BOX — ME §8.06.4 — motor puro de agregacao (ESPEC §10).
// Teste puro (sem banco).

import { describe, expect, it } from 'vitest';

import {
  AGGREGATION_PISO_HEADCOUNT,
  computeAggregate,
  type AggregationThresholds,
  type PersonQuarterInput,
} from '../../src/server/services/aggregationEngine';

const TH: AggregationThresholds = { xBaixo: 60, xMedio: 85, yBaixo: 50, yMedio: 75 };

function dims(a: number, c: number) {
  return [
    { label: 'Engajamento', a, c },
    { label: 'Realização', a, c },
  ];
}

function pessoa(
  score: number,
  indice: number,
  ociosa: number,
  plen: number,
  px: PersonQuarterInput['posicaoX'],
  py: PersonQuarterInput['posicaoY'],
  dimA = plen,
  dimC = plen,
): PersonQuarterInput {
  return {
    desempenhoScore: score,
    indiceDesempenho: indice,
    capacidadeOciosa: ociosa,
    plenitudeScore: plen,
    dimensoes: dims(dimA, dimC),
    posicaoX: px,
    posicaoY: py,
  };
}

describe('ME §8.06.4 — computeAggregate (§10)', () => {
  it('compoe media ponderada, heatmap e centro de massa', () => {
    const pessoas = [
      pessoa(90, 1.1, 10, 80, 'alto', 'alta'),
      pessoa(50, 0.7, 30, 45, 'baixo', 'baixa'),
    ];
    const r = computeAggregate(pessoas, TH);
    expect(r.headcount).toBe(2);
    expect(r.abaixoDoPiso).toBe(false);
    expect(r.desempenhoScore).toBe(70);
    expect(r.indiceDesempenho).toBe(0.9);
    expect(r.ociosidade).toBe(20);
    expect(r.eixoY).toBe(62.5);
    expect(r.centroMassa.posicaoX).toBe('medio');
    expect(r.centroMassa.posicaoY).toBe('media');
    expect(r.centroMassa.quadrante).toBe('EQUILÍBRIO FRÁGIL');
    expect(r.heatmap[0][2]).toBe(1);
    expect(r.heatmap[2][0]).toBe(1);
    expect(r.heatmapClassificados).toBe(2);
    // Dimensao combinada: dims iguais ao plenitudeScore -> media 62.5.
    expect(r.dimensoes).toEqual([
      { label: 'Engajamento', score: 62.5, posicao: 'media' },
      { label: 'Realização', score: 62.5, posicao: 'media' },
    ]);
  });

  it('score da dimensao combina A e C com pesos 0.4/0.6', () => {
    // A=80, C=90 -> 0.4*80 + 0.6*90 = 86 (para ambas as pessoas).
    const pessoas = [
      pessoa(90, 1, 10, 80, 'alto', 'alta', 80, 90),
      pessoa(88, 1, 10, 78, 'alto', 'alta', 80, 90),
    ];
    const r = computeAggregate(pessoas, TH);
    expect(r.dimensoes[0]).toEqual({ label: 'Engajamento', score: 86, posicao: 'alta' });
  });

  it('piso: com 1 pessoa nao ha agregado', () => {
    expect(AGGREGATION_PISO_HEADCOUNT).toBe(2);
    const r = computeAggregate([pessoa(90, 1.1, 10, 80, 'alto', 'alta')], TH);
    expect(r.headcount).toBe(1);
    expect(r.abaixoDoPiso).toBe(true);
    expect(r.desempenhoScore).toBeNull();
    expect(r.dimensoes).toEqual([]);
  });
});
