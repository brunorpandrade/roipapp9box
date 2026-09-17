// ROIP APP 9BOX — teste estrutural (ME-fila7 construcao dispatch 3,
// fase 1). Cobre os exports puros da tela Dashboard individual e a grade
// 9-Box. A regra de negocio (dados/escopo/diagnostico) permanece coberta
// por `tests/integration/dashboard-router*` e afins.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NINE_BOX_GRID,
  QUADRANTE_LEGENDA,
  colIndexFor,
  currentTrimestreUTC,
  direcaoArrow,
  faixaDesempenhoLabel,
  faixaPlenitudeLabel,
  formatPercent,
  formatScore,
  initialsOf,
  parseEmployeeIdParam,
  rowIndexFor,
} from '../../src/app/dashboard-individual/[id]/internals';

const REPO_ROOT = resolve(__dirname, '../..');

describe('dashboard individual — helpers puros', () => {
  it('parseEmployeeIdParam aceita inteiro positivo e rejeita invalido', () => {
    expect(parseEmployeeIdParam('42')).toBe(42);
    expect(parseEmployeeIdParam('0')).toBeNull();
    expect(parseEmployeeIdParam('abc')).toBeNull();
    expect(parseEmployeeIdParam('')).toBeNull();
  });

  it('currentTrimestreUTC devolve YYYY-QN', () => {
    expect(currentTrimestreUTC(new Date('2026-09-17T12:00:00Z'))).toBe('2026-Q3');
    expect(currentTrimestreUTC(new Date('2026-01-05T12:00:00Z'))).toBe('2026-Q1');
    expect(currentTrimestreUTC(new Date('2026-12-31T12:00:00Z'))).toBe('2026-Q4');
  });

  it('initialsOf devolve ate 2 iniciais maiusculas', () => {
    expect(initialsOf('Fernanda Costa')).toBe('FC');
    expect(initialsOf('Marina')).toBe('M');
  });

  it('formatPercent e formatScore tratam nulo/invalido', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent('98.4')).toBe('98,4%');
    expect(formatScore(null)).toBe('—');
    expect(formatScore('80.6')).toBe('81');
  });

  it('faixa labels mapeiam corretamente', () => {
    expect(faixaDesempenhoLabel('alto')).toBe('Alto desempenho');
    expect(faixaPlenitudeLabel('baixa')).toBe('Baixa plenitude');
  });

  it('direcaoArrow mapeia enum de movimento', () => {
    expect(direcaoArrow('subiu').char).toBe('↑');
    expect(direcaoArrow('desceu').char).toBe('↓');
    expect(direcaoArrow('estavel').char).toBe('');
    expect(direcaoArrow(null).char).toBe('');
  });
});

describe('dashboard individual — grade 9-Box', () => {
  it('tem 3x3 celulas', () => {
    expect(NINE_BOX_GRID).toHaveLength(3);
    for (const row of NINE_BOX_GRID) {
      expect(row).toHaveLength(3);
    }
  });

  it('cobre os 9 quadrantes com legenda', () => {
    const quadrantes = NINE_BOX_GRID.flat().map((c) => c.quadrante);
    expect(new Set(quadrantes).size).toBe(9);
    for (const q of quadrantes) {
      expect(QUADRANTE_LEGENDA[q]).toBeDefined();
    }
  });

  it('posiciona ALTO IMPACTO em plenitude alta + desempenho alto', () => {
    const cell = NINE_BOX_GRID[rowIndexFor('alta')]?.[colIndexFor('alto')];
    expect(cell?.quadrante).toBe('ALTO IMPACTO');
  });

  it('posiciona RISCO CRÍTICO em plenitude baixa + desempenho baixo', () => {
    const cell = NINE_BOX_GRID[rowIndexFor('baixa')]?.[colIndexFor('baixo')];
    expect(cell?.quadrante).toBe('RISCO CRÍTICO');
  });
});

describe('dashboard individual — rota existe', () => {
  it('a page esta presente', () => {
    expect(existsSync(resolve(REPO_ROOT, 'src/app/dashboard-individual/[id]/page.tsx'))).toBe(true);
  });
});
