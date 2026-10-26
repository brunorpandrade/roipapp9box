// ROIP APP 9BOX — regua canonica RV-03 bi-direcional do helper
// `src/lib/date/formatDataEditorial.ts` (ME-1.3d, item [1.10]).
//
// Cobertura:
// - MESES_PT_BR tem 12 entradas, mes de marco com cedilha correta.
// - dataCivilBrtFromIso derrapa cross-timezone preservado.
// - dataCivilBrtFromIso retorna input bit-exact em data invalida.
// - formatDataEditorial formata YYYY-MM-DD canonicamente.
// - formatDataEditorial retorna input bit-exact em formato nao conforme.
// - formatDataEditorial retorna input bit-exact em mes fora de 1..12.
//
// RV-13: chamadores reais listados (nr1Template, snapshot9BoxTemplate,
// boardDeckTemplate, executiveReportTemplate, climaEngajamentoTemplate).

import { describe, expect, it } from 'vitest';

import {
  MESES_PT_BR,
  dataCivilBrtFromIso,
  formatDataEditorial,
} from '../../src/lib/date/formatDataEditorial';

describe('MESES_PT_BR — constante canonica', () => {
  it('tem exatamente 12 meses', () => {
    expect(MESES_PT_BR).toHaveLength(12);
  });

  it('contem marco com cedilha correta na posicao 2', () => {
    expect(MESES_PT_BR[2]).toBe('março');
  });

  it('inicia em janeiro e termina em dezembro', () => {
    expect(MESES_PT_BR[0]).toBe('janeiro');
    expect(MESES_PT_BR[11]).toBe('dezembro');
  });
});

describe('dataCivilBrtFromIso — fuso BRT canonico', () => {
  it('converte 2026-10-19T02:00:00Z para 2026-10-18 (BRT UTC-3)', () => {
    expect(dataCivilBrtFromIso('2026-10-19T02:00:00Z')).toBe('2026-10-18');
  });

  it('preserva o dia quando ISO ja esta em BRT valido', () => {
    expect(dataCivilBrtFromIso('2026-10-18T12:00:00Z')).toBe('2026-10-18');
  });

  it('retorna input bit-exact quando ISO e invalido', () => {
    expect(dataCivilBrtFromIso('data-invalida')).toBe('data-invalida');
    expect(dataCivilBrtFromIso('')).toBe('');
  });
});

describe('formatDataEditorial — padrao canonico ROIPeople', () => {
  it('formata YYYY-MM-DD em "DD de mes de YYYY" sem zero a esquerda', () => {
    expect(formatDataEditorial('2026-10-18')).toBe('18 de outubro de 2026');
    expect(formatDataEditorial('2026-01-07')).toBe('7 de janeiro de 2026');
    expect(formatDataEditorial('2026-03-03')).toBe('3 de março de 2026');
  });

  it('aceita ISO UTC completo preservando a data civil derivada', () => {
    expect(formatDataEditorial('2026-10-18T12:00:00Z')).toBe('18 de outubro de 2026');
  });

  it('retorna input bit-exact quando formato nao casa YYYY-MM-DD', () => {
    expect(formatDataEditorial('18/10/2026')).toBe('18/10/2026');
    expect(formatDataEditorial('invalido')).toBe('invalido');
  });

  it('retorna input bit-exact quando mes esta fora de 1..12', () => {
    expect(formatDataEditorial('2026-13-01')).toBe('2026-13-01');
    expect(formatDataEditorial('2026-00-01')).toBe('2026-00-01');
  });
});

describe('RV-03 defeito injetado — formatDataEditorial', () => {
  it('crua ISO nao e aceita como humanizada', () => {
    const cru = '2026-10-18';
    const humanizado = formatDataEditorial(cru);
    expect(humanizado).not.toBe(cru);
    expect(humanizado).toMatch(/^\d{1,2} de \w+ de \d{4}$/);
  });
});
