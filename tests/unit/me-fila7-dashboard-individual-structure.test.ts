// ROIP APP 9BOX — teste estrutural (ME-fila7 dispatch 3.2/3.3). Cobre os
// exports puros da tela Dashboard individual, a grade 9-Box, os formatadores
// e a escolha do trimestre default. Regra de negocio permanece em
// `tests/integration/dashboard-router*`.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NINE_BOX_GRID,
  QUADRANTE_LEGENDA,
  colIndexFor,
  currentTrimestreUTC,
  derivarSeta,
  formatBRLInt,
  formatMultiplier,
  formatNumBR,
  formatPercent,
  formatPercentFrac,
  formatScore,
  idadeAnos,
  initialsOf,
  ociosidadeTier,
  parseEmployeeIdParam,
  pickDefaultTrimestre,
  quarterLabel,
  rowIndexFor,
  tempoEmpresa,
} from '../../src/app/dashboard-individual/[id]/internals';

const REPO_ROOT = resolve(__dirname, '../..');

describe('dashboard individual — helpers puros', () => {
  it('parseEmployeeIdParam aceita inteiro positivo e rejeita invalido', () => {
    expect(parseEmployeeIdParam('42')).toBe(42);
    expect(parseEmployeeIdParam('0')).toBeNull();
    expect(parseEmployeeIdParam('abc')).toBeNull();
  });

  it('currentTrimestreUTC devolve YYYY-QN', () => {
    expect(currentTrimestreUTC(new Date('2026-09-17T12:00:00Z'))).toBe('2026-Q3');
    expect(currentTrimestreUTC(new Date('2026-12-31T12:00:00Z'))).toBe('2026-Q4');
  });

  it('quarterLabel rotula a faixa de meses', () => {
    expect(quarterLabel('2026-Q1')).toBe('Janeiro a Março de 2026');
    expect(quarterLabel('2025-Q4')).toBe('Outubro a Dezembro de 2025');
    expect(quarterLabel(null)).toBe('—');
  });

  it('pickDefaultTrimestre escolhe o mais recente <= atual', () => {
    const lista = ['2028-Q1', '2027-Q4', '2026-Q3', '2026-Q2', '2026-Q1'];
    expect(pickDefaultTrimestre(lista, '2026-Q3')).toBe('2026-Q3');
    expect(pickDefaultTrimestre(['2027-Q1', '2026-Q4'], '2026-Q4')).toBe('2026-Q4');
    expect(pickDefaultTrimestre([], '2026-Q3')).toBeNull();
  });

  it('formatadores tratam nulo/invalido', () => {
    expect(formatPercent('98.4')).toBe('98,4%');
    expect(formatPercentFrac('0.984')).toBe('98,4%');
    expect(formatMultiplier('3.4')).toBe('3,4×');
    expect(formatBRLInt('13260')).toContain('13.260');
    expect(formatNumBR('1800')).toContain('1.800');
    expect(formatNumBR('10.2')).toBe('10,2');
    expect(formatNumBR(null)).toBe('—');
    expect(formatScore('80.6')).toBe('81');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercentFrac(null)).toBe('—');
  });

  it('ociosidadeTier segue as faixas de negocio', () => {
    expect(ociosidadeTier('0')).toBe('critica');
    expect(ociosidadeTier('4.9')).toBe('critica');
    expect(ociosidadeTier('5')).toBe('saudavel');
    expect(ociosidadeTier('15')).toBe('saudavel');
    expect(ociosidadeTier('20')).toBe('atencao');
    expect(ociosidadeTier('25')).toBe('atencao');
    expect(ociosidadeTier('30')).toBe('critica');
    expect(ociosidadeTier(null)).toBe('sem_dado');
  });

  it('initialsOf e derivarSeta', () => {
    expect(initialsOf('Fernanda Costa')).toBe('FC');
    // sem anterior -> sem seta
    expect(derivarSeta('medio', 'media', null, null).char).toBe('');
    // mesmo quadrante -> sem seta
    expect(derivarSeta('medio', 'media', 'medio', 'media').char).toBe('');
    // so direita (desempenho subiu) -> -> verde
    const dir = derivarSeta('alto', 'media', 'medio', 'media');
    expect(dir.char).toBe('→');
    expect(dir.color).toBe('#16A34A');
    // so cima (plenitude subiu: media->alta) -> ↑ verde
    const cima = derivarSeta('medio', 'alta', 'medio', 'media');
    expect(cima.char).toBe('↑');
    expect(cima.color).toBe('#16A34A');
    // direita + cima -> ↗ verde
    expect(derivarSeta('alto', 'alta', 'medio', 'media').char).toBe('↗');
    // so esquerda (desempenho cai, plenitude igual) -> ← amarelo (§8.06.6a)
    const esq = derivarSeta('baixo', 'media', 'medio', 'media');
    expect(esq.char).toBe('←');
    expect(esq.color).toBe('#F2A900');
    // baixo (plenitude desceu: media->baixa) -> ↓ amarelo (§8.06.6a)
    const baixo = derivarSeta('medio', 'baixa', 'medio', 'media');
    expect(baixo.char).toBe('↓');
    expect(baixo.color).toBe('#F2A900');
    // esquerda + baixo (ambos retrocedem) -> ↙ vermelho
    const esqBaixo = derivarSeta('baixo', 'baixa', 'medio', 'media');
    expect(esqBaixo.char).toBe('↙');
    expect(esqBaixo.color).toBe('#DC2626');
    // misto: direita + baixo -> ↘ amarelo
    const misto = derivarSeta('alto', 'baixa', 'medio', 'media');
    expect(misto.char).toBe('↘');
    expect(misto.color).toBe('#F2A900');
    // misto: esquerda + cima -> ↖ amarelo
    expect(derivarSeta('baixo', 'alta', 'medio', 'media').color).toBe('#F2A900');
  });

  it('idadeAnos e tempoEmpresa', () => {
    expect(idadeAnos(null)).toBeNull();
    expect(idadeAnos('data-invalida')).toBeNull();
    expect(idadeAnos('2000-01-01')).toBeGreaterThanOrEqual(20);
    expect(tempoEmpresa(null)).toBe('—');
    expect(tempoEmpresa('2023-01-01')).toMatch(/^\d+a \d+m$/);
  });
});

describe('dashboard individual — grade 9-Box', () => {
  it('tem 3x3 celulas e cobre 9 quadrantes com legenda', () => {
    expect(NINE_BOX_GRID).toHaveLength(3);
    const quadrantes = NINE_BOX_GRID.flat().map((c) => c.quadrante);
    expect(new Set(quadrantes).size).toBe(9);
    for (const q of quadrantes) {
      expect(QUADRANTE_LEGENDA[q]).toBeDefined();
    }
  });

  it('posiciona ALTO IMPACTO e RISCO CRÍTICO corretamente', () => {
    expect(NINE_BOX_GRID[rowIndexFor('alta')]?.[colIndexFor('alto')]?.quadrante).toBe(
      'ALTO IMPACTO',
    );
    expect(NINE_BOX_GRID[rowIndexFor('baixa')]?.[colIndexFor('baixo')]?.quadrante).toBe(
      'RISCO CRÍTICO',
    );
  });
});

describe('dashboard individual — rota existe', () => {
  it('a page esta presente', () => {
    expect(existsSync(resolve(REPO_ROOT, 'src/app/dashboard-individual/[id]/page.tsx'))).toBe(true);
  });
});
