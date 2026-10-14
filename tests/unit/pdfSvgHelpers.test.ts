// ROIP APP 9BOX — testes unit canonicos dos helpers SVG (ME-1.3c).
//
// Cobre:
// - `projectRadarPoint`: inicio no topo (idx=0 → angulo -PI/2), sentido
//   horario, raio linear em score, clamp 0-100, centro quando score=0,
//   RangeError canonico fora do dominio.
// - `projectRadarPolygon`: 8 scores produzem 8 pares x,y; precisao 2
//   casas decimais; vazio lanca RangeError.
// - `renderRadarGridSvg`: nEixos < 3 e nRings < 1 rejeitados; emite
//   polygons + lines; precisa de stroke canonico.
// - `NINE_BOX_PALETTE`: replica bit-exact a `NINE_BOX_GRID` da UI
//   canonica em `src/app/dashboard-individual/[id]/internals.ts`.
// - `classificarNr1Faixa`: fronteiras canonicas inclusivas em cima
//   (66 verde, 50 amarelo, 49 vermelho) + clamp.

import { describe, expect, it } from 'vitest';

import { NINE_BOX_GRID } from '../../src/app/dashboard-individual/[id]/internals';
import {
  classificarNr1Faixa,
  NINE_BOX_PALETTE,
  RADAR_NR1_CORES,
} from '../../src/lib/svg/pdfVisualTokens';
import {
  projectRadarPoint,
  projectRadarPolygon,
  renderRadarGridSvg,
} from '../../src/lib/svg/pdfSvgHelpers';

// ============================================================
// projectRadarPoint — projecao polar canonica do Radar NR-1
// ============================================================

describe('projectRadarPoint', () => {
  it('idx=0 com score=100 projeta para o TOPO (angulo -PI/2)', () => {
    const p = projectRadarPoint(0, 8, 100, 200, 200, 140);
    expect(p.x).toBeCloseTo(200, 2);
    expect(p.y).toBeCloseTo(60, 2);
  });

  it('idx=2 em 8 eixos projeta para a DIREITA (90 graus horario)', () => {
    const p = projectRadarPoint(2, 8, 100, 200, 200, 140);
    expect(p.x).toBeCloseTo(340, 2);
    expect(p.y).toBeCloseTo(200, 2);
  });

  it('idx=4 em 8 eixos projeta para o FUNDO (180 graus)', () => {
    const p = projectRadarPoint(4, 8, 100, 200, 200, 140);
    expect(p.x).toBeCloseTo(200, 2);
    expect(p.y).toBeCloseTo(340, 2);
  });

  it('idx=6 em 8 eixos projeta para a ESQUERDA (270 graus)', () => {
    const p = projectRadarPoint(6, 8, 100, 200, 200, 140);
    expect(p.x).toBeCloseTo(60, 2);
    expect(p.y).toBeCloseTo(200, 2);
  });

  it('score=0 projeta para o CENTRO qualquer que seja o idx', () => {
    const p = projectRadarPoint(3, 8, 0, 200, 200, 140);
    expect(p.x).toBeCloseTo(200, 2);
    expect(p.y).toBeCloseTo(200, 2);
  });

  it('score=50 projeta para METADE do raio', () => {
    const p = projectRadarPoint(0, 8, 50, 200, 200, 140);
    expect(p.x).toBeCloseTo(200, 2);
    expect(p.y).toBeCloseTo(130, 2);
  });

  it('score negativo e score > 100 sao clamp canonicamente', () => {
    const pNeg = projectRadarPoint(0, 8, -42, 200, 200, 140);
    const pOver = projectRadarPoint(0, 8, 142, 200, 200, 140);
    expect(pNeg.x).toBeCloseTo(200, 2);
    expect(pNeg.y).toBeCloseTo(200, 2);
    expect(pOver.y).toBeCloseTo(60, 2);
  });

  it('idx fora do dominio dispara RangeError canonico', () => {
    expect(() => projectRadarPoint(-1, 8, 50, 200, 200, 140)).toThrow(RangeError);
    expect(() => projectRadarPoint(8, 8, 50, 200, 200, 140)).toThrow(RangeError);
    expect(() => projectRadarPoint(1.5, 8, 50, 200, 200, 140)).toThrow(RangeError);
  });

  it('totalEixos invalido dispara RangeError canonico', () => {
    expect(() => projectRadarPoint(0, 0, 50, 200, 200, 140)).toThrow(RangeError);
    expect(() => projectRadarPoint(0, -3, 50, 200, 200, 140)).toThrow(RangeError);
  });

  it('determinismo: mesmos inputs geram saida bit-exact', () => {
    const a = projectRadarPoint(3, 8, 72.5, 200, 200, 140);
    const b = projectRadarPoint(3, 8, 72.5, 200, 200, 140);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });
});

// ============================================================
// projectRadarPolygon — 8 scores em string canonica
// ============================================================

describe('projectRadarPolygon', () => {
  it('projeta 8 scores em 8 pares x,y com precisao de 2 casas', () => {
    const pts = projectRadarPolygon([62, 58, 45, 78, 71, 82, 41, 74], 200, 200, 140);
    const pairs = pts.split(' ');
    expect(pairs).toHaveLength(8);
    pairs.forEach((pair) => {
      const [x, y] = pair.split(',');
      expect(x).toMatch(/^-?\d+\.\d{2}$/);
      expect(y).toMatch(/^-?\d+\.\d{2}$/);
    });
  });

  it('scores vazios disparam RangeError canonico', () => {
    expect(() => projectRadarPolygon([], 200, 200, 140)).toThrow(RangeError);
  });
});

// ============================================================
// renderRadarGridSvg — grade octogonal canonica
// ============================================================

describe('renderRadarGridSvg', () => {
  it('emite 4 polygons de aneis + 8 lines radiais para 8 eixos e 4 aneis', () => {
    const svg = renderRadarGridSvg(8, 200, 200, 140, 4, '#E5E7EB');
    const polys = svg.match(/<polygon /g) ?? [];
    const lines = svg.match(/<line /g) ?? [];
    expect(polys).toHaveLength(4);
    expect(lines).toHaveLength(8);
    expect(svg).toContain('stroke="#E5E7EB"');
  });

  it('rejeita nEixos < 3 com RangeError canonico', () => {
    expect(() => renderRadarGridSvg(2, 200, 200, 140, 4, '#E5E7EB')).toThrow(RangeError);
  });

  it('rejeita nRings < 1 com RangeError canonico', () => {
    expect(() => renderRadarGridSvg(8, 200, 200, 140, 0, '#E5E7EB')).toThrow(RangeError);
  });
});

// ME-1.3c CC079-v3: suite `projectNineBoxBubble` retirada junto com o
// helper na ME, por decisao canonica de produto (9-Box agora exibe
// apenas o contador por quadrante, sem bolhas). RV-13 integral — zero
// codigo morto.

// ============================================================
// NINE_BOX_PALETTE — espelho canonico bit-exact da UI
// ============================================================

describe('NINE_BOX_PALETTE', () => {
  it('replica bit-exact a NINE_BOX_GRID da UI canonica (todas as 9 caixas)', () => {
    const paletaIndex = NINE_BOX_PALETTE as Record<string, { bg: string; text: string }>;
    for (const row of NINE_BOX_GRID) {
      for (const cell of row) {
        const paleta = paletaIndex[cell.quadrante];
        expect(paleta, `quadrante ${cell.quadrante} ausente em NINE_BOX_PALETTE`).toBeDefined();
        expect(paleta?.bg).toBe(cell.bg);
        expect(paleta?.text).toBe(cell.text);
      }
    }
  });
});

// ============================================================
// classificarNr1Faixa — fronteiras canonicas inclusivas em cima
// ============================================================

describe('classificarNr1Faixa', () => {
  it('score >= 66 e verde', () => {
    expect(classificarNr1Faixa(66)).toBe('verde');
    expect(classificarNr1Faixa(100)).toBe('verde');
    expect(classificarNr1Faixa(82)).toBe('verde');
  });

  it('score entre 50 e 65 e amarelo', () => {
    expect(classificarNr1Faixa(50)).toBe('amarelo');
    expect(classificarNr1Faixa(58)).toBe('amarelo');
    expect(classificarNr1Faixa(65)).toBe('amarelo');
  });

  it('score < 50 e vermelho', () => {
    expect(classificarNr1Faixa(49)).toBe('vermelho');
    expect(classificarNr1Faixa(0)).toBe('vermelho');
    expect(classificarNr1Faixa(41)).toBe('vermelho');
  });

  it('clamp canonico 0-100', () => {
    expect(classificarNr1Faixa(-10)).toBe('vermelho');
    expect(classificarNr1Faixa(142)).toBe('verde');
  });

  it('cores canonicas por faixa', () => {
    expect(RADAR_NR1_CORES.verde).toBe('#16A34A');
    expect(RADAR_NR1_CORES.amarelo).toBe('#D97706');
    expect(RADAR_NR1_CORES.vermelho).toBe('#DC2626');
  });
});
