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

function dims(v: number) {
  return [
    { label: 'Engajamento', a: v, c: v },
    { label: 'Realização', a: v, c: v },
  ];
}

function pessoa(
  score: number,
  indice: number,
  ociosa: number,
  plen: number,
  px: PersonQuarterInput['posicaoX'],
  py: PersonQuarterInput['posicaoY'],
  ret: number,
  custo: number,
): PersonQuarterInput {
  return {
    desempenhoScore: score,
    indiceDesempenho: indice,
    capacidadeOciosa: ociosa,
    plenitudeScore: plen,
    dimensoes: dims(plen),
    posicaoX: px,
    posicaoY: py,
    retornoEstimado: ret,
    custoMedioTrimestral: custo,
  };
}

describe('ME §8.06.4 — computeAggregate (§10)', () => {
  it('compoe media ponderada, ROI dos brutos, heatmap e centro de massa', () => {
    const pessoas = [
      pessoa(90, 1.1, 10, 80, 'alto', 'alta', 10000, 5000),
      pessoa(50, 0.7, 30, 45, 'baixo', 'baixa', 4000, 4000),
    ];
    const r = computeAggregate(pessoas, TH);
    expect(r.headcount).toBe(2);
    expect(r.abaixoDoPiso).toBe(false);
    expect(r.desempenhoScore).toBe(70);
    expect(r.indiceDesempenho).toBe(0.9);
    expect(r.ociosidade).toBe(20);
    expect(r.eixoY).toBe(62.5);
    // ROI recalculado dos brutos: 14000 / 9000.
    expect(r.retornoTotal).toBe(14000);
    expect(r.custoTotal).toBe(9000);
    expect(r.roi).toBe(1.56);
    // Centro de massa: score 70 -> medio, plenitude 62.5 -> media.
    expect(r.centroMassa.posicaoX).toBe('medio');
    expect(r.centroMassa.posicaoY).toBe('media');
    expect(r.centroMassa.quadrante).toBe('EQUILÍBRIO FRÁGIL');
    // Heatmap: (alto,alta) e (baixo,baixa).
    expect(r.heatmap[0][2]).toBe(1);
    expect(r.heatmap[2][0]).toBe(1);
    expect(r.heatmapClassificados).toBe(2);
    expect(r.dimensoes).toEqual([
      { label: 'Engajamento', a: 62.5, c: 62.5 },
      { label: 'Realização', a: 62.5, c: 62.5 },
    ]);
  });

  it('piso: com 1 pessoa nao ha agregado', () => {
    expect(AGGREGATION_PISO_HEADCOUNT).toBe(2);
    const r = computeAggregate([pessoa(90, 1.1, 10, 80, 'alto', 'alta', 1, 1)], TH);
    expect(r.headcount).toBe(1);
    expect(r.abaixoDoPiso).toBe(true);
    expect(r.desempenhoScore).toBeNull();
    expect(r.roi).toBeNull();
  });

  it('ROI nulo quando custo total e zero', () => {
    const r = computeAggregate(
      [
        pessoa(70, 1, 10, 60, 'medio', 'media', 5000, 0),
        pessoa(70, 1, 10, 60, 'medio', 'media', 3000, 0),
      ],
      TH,
    );
    expect(r.custoTotal).toBe(0);
    expect(r.roi).toBeNull();
  });
});
