// ROIP APP 9BOX — teste unit ME-1.14 (Conversa 4b, Despacho B — D-B4).
//
// Regua RV-03 dirigida a `getTrimestreEmAndamento` + `formatTrimestreEm
// AndamentoLabel` + `buildTurnoverHref` — funcoes puras canonicas usadas
// pelo card em tempo real de turnover.
//
// Injecao canonica RV-03: trocar `Math.floor(utcMonth / 3) + 1` por
// `Math.floor(utcMonth / 3)` (defeito classico de off-by-one) → o teste
// "primeiro mes de Q1" reprova.

import { describe, expect, it } from 'vitest';

import { buildTurnoverHref } from '../../src/lib/shared/turnoverHref';
import type { TurnoverCardData } from '../../src/server/services/turnoverPanel';
import {
  formatTrimestreEmAndamentoLabel,
  getTrimestreEmAndamento,
} from '../../src/server/services/turnoverPanel';

describe('ME-1.14 — getTrimestreEmAndamento', () => {
  it('janeiro (UTC) → YYYY-Q1', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-Q1');
  });

  it('marco → ainda Q1', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 2, 31)))).toBe('2026-Q1');
  });

  it('abril → Q2', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 3, 1)))).toBe('2026-Q2');
  });

  it('setembro → Q3', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 8, 15)))).toBe('2026-Q3');
  });

  it('outubro → Q4', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 9, 1)))).toBe('2026-Q4');
  });

  it('dezembro → ainda Q4', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-Q4');
  });

  it('ano novo (janeiro de ano seguinte)', () => {
    expect(getTrimestreEmAndamento(new Date(Date.UTC(2027, 0, 1)))).toBe('2027-Q1');
  });
});

describe('ME-1.14 — formatTrimestreEmAndamentoLabel', () => {
  it('acrescenta " (em andamento)" ao label canonico', () => {
    expect(formatTrimestreEmAndamentoLabel('2026-Q4')).toBe('4º trimestre de 2026 (em andamento)');
  });

  it('entrada invalida → devolve a propria string', () => {
    expect(formatTrimestreEmAndamentoLabel('qualquer-coisa')).toBe('qualquer-coisa');
  });
});

describe('ME-1.14 — buildTurnoverHref', () => {
  const base = '/super-admin/empresa/1/turnover';

  function card(estado: 'parcial' | 'fechado', trimestre: string): TurnoverCardData {
    return {
      trimestre,
      label: trimestre,
      total: { saidas: 1, percentual: 1, headcountBase: 10 },
      voluntario: { saidas: 1, percentual: 1 },
      involuntario: { saidas: 0, percentual: 0 },
      estado,
    };
  }

  it('card null → basePath intacto', () => {
    expect(buildTurnoverHref(base, null)).toBe(base);
  });

  it("card 'fechado' → basePath intacto", () => {
    expect(buildTurnoverHref(base, card('fechado', '2026-Q3'))).toBe(base);
  });

  it("card 'parcial' → acrescenta ?trimestre=<em-andamento>", () => {
    expect(buildTurnoverHref(base, card('parcial', '2026-Q4'))).toBe(`${base}?trimestre=2026-Q4`);
  });
});
