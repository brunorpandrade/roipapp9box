// ROIP APP 9BOX — ME §8.06.6a — movimento do coletivo no 9-Box (teste
// puro, sem banco). Prova o `buildMovimento9box`: guarda as posições
// (célula) do centro de massa atual e anterior, os deltas e os
// quadrantes; os casos sem base (sem trimestre anterior, centro de
// massa ausente) zeram posições anteriores e deltas. A seta/veredito é
// derivada na UI por `derivarSeta` (coberto em nineBoxSeta.test.ts).

import { describe, expect, it } from 'vitest';

import { buildMovimento9box } from '../../src/server/services/companyAggregate';
import type { AggregateResult } from '../../src/server/services/aggregationEngine';
import type {
  NineBoxPosicaoX,
  NineBoxPosicaoY,
  NineBoxQuadrante,
} from '../../src/server/services/nineBoxCalculationEngine';

interface CmInput {
  readonly x: number | null;
  readonly y: number | null;
  readonly posicaoX: NineBoxPosicaoX | null;
  readonly posicaoY: NineBoxPosicaoY | null;
  readonly quadrante: NineBoxQuadrante | null;
}

function agg(cm: CmInput): AggregateResult {
  return {
    headcount: 3,
    abaixoDoPiso: false,
    desempenhoScore: cm.x,
    indiceDesempenho: null,
    ociosidade: null,
    eixoY: cm.y,
    dimensoes: [],
    heatmap: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    heatmapClassificados: 3,
    centroMassa: cm,
  };
}

const vazio = agg({ x: null, y: null, posicaoX: null, posicaoY: null, quadrante: null });

describe('ME §8.06.6a — buildMovimento9box', () => {
  it('com base: guarda posições atual/anterior, deltas e quadrantes', () => {
    const atual = agg({
      x: 90,
      y: 85,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    });
    const ant = agg({
      x: 80,
      y: 70,
      posicaoX: 'alto',
      posicaoY: 'media',
      quadrante: 'ALTA ENTREGA',
    });
    const m = buildMovimento9box(atual, ant, '2025-Q2');
    expect(m?.quadranteAtual).toBe('ALTO IMPACTO');
    expect(m?.quadranteAnterior).toBe('ALTA ENTREGA');
    expect(m?.posicaoXAtual).toBe('alto');
    expect(m?.posicaoYAtual).toBe('alta');
    expect(m?.posicaoXAnterior).toBe('alto');
    expect(m?.posicaoYAnterior).toBe('media');
    expect(m?.deltaX).toBe(10);
    expect(m?.deltaY).toBe(15);
    expect(m?.trimestreAnterior).toBe('2025-Q2');
  });

  it('deltas negativos quando o centro de massa recua', () => {
    const atual = agg({
      x: 55,
      y: 40,
      posicaoX: 'medio',
      posicaoY: 'baixa',
      quadrante: 'DESGASTE OCULTO',
    });
    const ant = agg({
      x: 58,
      y: 55,
      posicaoX: 'medio',
      posicaoY: 'media',
      quadrante: 'EQUILÍBRIO FRÁGIL',
    });
    const m = buildMovimento9box(atual, ant, '2025-Q2');
    expect(m?.deltaX).toBe(-3);
    expect(m?.deltaY).toBe(-15);
    expect(m?.posicaoYAnterior).toBe('media');
    expect(m?.posicaoYAtual).toBe('baixa');
  });

  it('mesma célula: posições atual e anterior iguais (UI marca Manteve)', () => {
    const atual = agg({
      x: 90,
      y: 85,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    });
    const ant = agg({
      x: 88,
      y: 84,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    });
    const m = buildMovimento9box(atual, ant, '2025-Q2');
    expect(m?.posicaoXAtual).toBe('alto');
    expect(m?.posicaoXAnterior).toBe('alto');
    expect(m?.posicaoYAtual).toBe('alta');
    expect(m?.posicaoYAnterior).toBe('alta');
  });

  it('sem trimestre anterior: posições anteriores e deltas nulos', () => {
    const atual = agg({
      x: 90,
      y: 85,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    });
    const m = buildMovimento9box(atual, null, null);
    expect(m?.quadranteAtual).toBe('ALTO IMPACTO');
    expect(m?.quadranteAnterior).toBeNull();
    expect(m?.posicaoXAtual).toBe('alto');
    expect(m?.posicaoXAnterior).toBeNull();
    expect(m?.posicaoYAnterior).toBeNull();
    expect(m?.deltaX).toBeNull();
    expect(m?.deltaY).toBeNull();
    expect(m?.trimestreAnterior).toBeNull();
  });

  it('anterior sem centro de massa (abaixo do piso): posições anteriores nulas', () => {
    const atual = agg({
      x: 90,
      y: 85,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    });
    const m = buildMovimento9box(atual, vazio, '2025-Q2');
    expect(m?.quadranteAnterior).toBeNull();
    expect(m?.posicaoXAnterior).toBeNull();
    expect(m?.trimestreAnterior).toBeNull();
  });

  it('atual sem centro de massa: sem movimento (null)', () => {
    const m = buildMovimento9box(
      vazio,
      agg({ x: 80, y: 70, posicaoX: 'alto', posicaoY: 'media', quadrante: 'ALTA ENTREGA' }),
      '2025-Q2',
    );
    expect(m).toBeNull();
  });
});
