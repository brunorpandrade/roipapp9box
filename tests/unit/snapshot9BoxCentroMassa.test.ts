// ROIP APP 9BOX — testes unit do centro de massa + comparativo dept x
// empresa do Snapshot 9-Box (ME-1.3c CC079-v4).

import { describe, expect, it } from 'vitest';

import {
  composeTextoComparativoDeptEmpresa,
  detectarCentrosDeMassa,
  type NineBoxBlocoEscopo,
  type NineBoxDistribuicao,
  renderGrid9BoxSvg,
} from '../../src/server/pdf-templates/snapshot9BoxTemplate';

const DIST_ZERO: NineBoxDistribuicao = {
  'ALTO IMPACTO': 0,
  'DESEMPENHO REPRESADO': 0,
  'POTENCIAL SUBUTILIZADO': 0,
  'ALTA ENTREGA': 0,
  'EQUILÍBRIO FRÁGIL': 0,
  'DESEMPENHO CRÍTICO': 0,
  'RISCO DE ESGOTAMENTO': 0,
  'DESGASTE OCULTO': 0,
  'RISCO CRÍTICO': 0,
};

function dist(partial: Partial<NineBoxDistribuicao>): NineBoxDistribuicao {
  return { ...DIST_ZERO, ...partial };
}

describe('detectarCentrosDeMassa', () => {
  it('retorna Set vazio quando todos os quadrantes sao zero', () => {
    const centros = detectarCentrosDeMassa(DIST_ZERO);
    expect(centros.size).toBe(0);
  });

  it('identifica unico quadrante vencedor', () => {
    const centros = detectarCentrosDeMassa(dist({ 'ALTO IMPACTO': 21, 'ALTA ENTREGA': 14 }));
    expect(centros.has('ALTO IMPACTO')).toBe(true);
    expect(centros.has('ALTA ENTREGA')).toBe(false);
    expect(centros.size).toBe(1);
  });

  it('identifica empates — multiplos centros', () => {
    const centros = detectarCentrosDeMassa(
      dist({ 'ALTO IMPACTO': 14, 'ALTA ENTREGA': 14, 'EQUILÍBRIO FRÁGIL': 14 }),
    );
    expect(centros.size).toBe(3);
    expect(centros.has('ALTO IMPACTO')).toBe(true);
    expect(centros.has('ALTA ENTREGA')).toBe(true);
    expect(centros.has('EQUILÍBRIO FRÁGIL')).toBe(true);
  });

  it('ignora quadrantes empatados em zero', () => {
    const centros = detectarCentrosDeMassa(dist({ 'ALTO IMPACTO': 1 }));
    expect(centros.size).toBe(1);
    expect(centros.has('ALTO IMPACTO')).toBe(true);
  });
});

describe('renderGrid9BoxSvg', () => {
  const distNativa = dist({
    'ALTO IMPACTO': 21,
    'DESEMPENHO REPRESADO': 1,
    'POTENCIAL SUBUTILIZADO': 1,
    'EQUILÍBRIO FRÁGIL': 14,
    'ALTA ENTREGA': 14,
    'DESEMPENHO CRÍTICO': 1,
  });

  it('contem numero grande centralizado + nome do quadrante no mesmo card', () => {
    const svg = renderGrid9BoxSvg(distNativa, { size: 'large', destacarCentroMassa: false });
    // 21 colaboradores em ALTO IMPACTO renderizado como texto.
    expect(svg).toContain('>21</text>');
    expect(svg).toContain('ALTO IMPACTO');
  });

  it('destaca o centro de massa com borda escura quando flag ligada', () => {
    const svgDestacado = renderGrid9BoxSvg(distNativa, {
      size: 'large',
      destacarCentroMassa: true,
    });
    const svgLimpo = renderGrid9BoxSvg(distNativa, { size: 'large', destacarCentroMassa: false });
    // Borda stroke-width maior aparece apenas quando destaque esta ligado.
    const occurrencesDestacado = (svgDestacado.match(/stroke-width="2\.5"/g) ?? []).length;
    const occurrencesLimpo = (svgLimpo.match(/stroke-width="2\.5"/g) ?? []).length;
    expect(occurrencesDestacado).toBeGreaterThan(occurrencesLimpo);
    expect(occurrencesLimpo).toBe(0);
  });

  it('eixo PLENITUDE vem com seta ↑ independente apontando para cima', () => {
    const svg = renderGrid9BoxSvg(distNativa, { size: 'large', destacarCentroMassa: false });
    // Seta ↑ como glifo independente (nao dentro do text rotacionado).
    expect(svg).toContain('>↑</text>');
    expect(svg).toContain('PLENITUDE');
    // Seta → do eixo horizontal
    expect(svg).toContain('>→</text>');
    expect(svg).toContain('DESEMPENHO');
    // Pega o <text ...>↑</text> especifico e garante que esse elemento
    // nao carrega transform=rotate (= seta aponta pra cima no SVG).
    const arrowMatch = /<text[^>]*>↑<\/text>/.exec(svg);
    expect(arrowMatch).not.toBeNull();
    expect(arrowMatch?.[0]).not.toContain('transform');
  });

  it('tamanhos mini / medium / large produzem SVGs de dimensoes diferentes', () => {
    const svgL = renderGrid9BoxSvg(distNativa, { size: 'large', destacarCentroMassa: false });
    const svgM = renderGrid9BoxSvg(distNativa, { size: 'medium', destacarCentroMassa: false });
    const svgMini = renderGrid9BoxSvg(distNativa, { size: 'mini', destacarCentroMassa: false });
    expect(svgL).toContain('viewBox="0 0 720 720"');
    expect(svgM).toContain('viewBox="0 0 480 480"');
    expect(svgMini).toContain('viewBox="0 0 240 240"');
  });

  it('mini quebra nome do quadrante em duas linhas para caber', () => {
    const svgMini = renderGrid9BoxSvg(distNativa, { size: 'mini', destacarCentroMassa: false });
    // RISCO DE ESGOTAMENTO quebrado em RISCO DE + ESGOTAMENTO
    const occRiscoDe = (svgMini.match(/>RISCO DE</g) ?? []).length;
    const occEsgot = (svgMini.match(/>ESGOTAMENTO</g) ?? []).length;
    expect(occRiscoDe).toBe(1);
    expect(occEsgot).toBe(1);
  });
});

describe('composeTextoComparativoDeptEmpresa', () => {
  const empresa: NineBoxBlocoEscopo = {
    titulo: 'Visão geral',
    totalClassificados: 52,
    distribuicao: dist({
      'ALTO IMPACTO': 21,
      'DESEMPENHO REPRESADO': 1,
      'POTENCIAL SUBUTILIZADO': 1,
      'EQUILÍBRIO FRÁGIL': 14,
      'ALTA ENTREGA': 14,
      'DESEMPENHO CRÍTICO': 1,
    }),
    colaboradores: [],
  };

  it('indica tamanho relativo + 2 maiores desvios + comparativo de centros de massa', () => {
    const prod: NineBoxBlocoEscopo = {
      titulo: 'Produção',
      totalClassificados: 24,
      distribuicao: dist({
        'ALTO IMPACTO': 9,
        'ALTA ENTREGA': 7,
        'EQUILÍBRIO FRÁGIL': 6,
        'DESEMPENHO CRÍTICO': 1,
        'DESEMPENHO REPRESADO': 1,
      }),
      colaboradores: [],
    };
    const texto = composeTextoComparativoDeptEmpresa(prod, empresa);
    expect(texto).toContain('24 colaboradores');
    expect(texto).toContain('52');
    // Os 2 maiores desvios aparecem em bullets com nomes de quadrante.
    expect(texto).toMatch(/<strong>[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ ]+<\/strong>/);
    // Comparativo de centros de massa aparece textualmente.
    expect(texto).toContain('Centro de massa');
  });

  it('texto fallback quando nao ha dados classificados', () => {
    const vazio: NineBoxBlocoEscopo = {
      titulo: 'Vazio',
      totalClassificados: 0,
      distribuicao: DIST_ZERO,
      colaboradores: [],
    };
    const texto = composeTextoComparativoDeptEmpresa(vazio, empresa);
    expect(texto).toContain('indisponível');
  });
});
