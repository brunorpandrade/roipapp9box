// ROIP APP 9BOX — teste unitario `quarterlyPeriod` (ME-031).
//
// Helpers canonicos de calendario trimestral (DOC 03 §3.11 + §4). Puros —
// entradas literais, saidas deterministicas. Cobre `mesToTrimestre`,
// `getQuarterMonths`, `isThirdMonthOfQuarter`, `getTrimestreFromDateInTimezone`.

import { describe, expect, it } from 'vitest';

import {
  getQuarterMonths,
  getTrimestreFromDateInTimezone,
  isThirdMonthOfQuarter,
  mesToTrimestre,
} from '../../src/lib/quarterlyPeriod';

describe('quarterlyPeriod — mesToTrimestre (ME-031)', () => {
  it('primeiro mes de Q1 mapeia para YYYY-Q1', () => {
    expect(mesToTrimestre('2026-01')).toBe('2026-Q1');
  });

  it('mes do meio de Q1 mapeia para YYYY-Q1', () => {
    expect(mesToTrimestre('2026-02')).toBe('2026-Q1');
  });

  it('ultimo mes de Q1 mapeia para YYYY-Q1', () => {
    expect(mesToTrimestre('2026-03')).toBe('2026-Q1');
  });

  it('primeiro mes de Q2 mapeia para YYYY-Q2', () => {
    expect(mesToTrimestre('2026-04')).toBe('2026-Q2');
  });

  it('primeiro mes de Q3 mapeia para YYYY-Q3', () => {
    expect(mesToTrimestre('2026-07')).toBe('2026-Q3');
  });

  it('primeiro mes de Q4 mapeia para YYYY-Q4', () => {
    expect(mesToTrimestre('2026-10')).toBe('2026-Q4');
  });

  it('ultimo mes do ano mapeia para YYYY-Q4', () => {
    expect(mesToTrimestre('2026-12')).toBe('2026-Q4');
  });

  it('ano anterior mapeia corretamente', () => {
    expect(mesToTrimestre('2025-06')).toBe('2025-Q2');
  });

  it('formato invalido (mes 00) retorna null', () => {
    expect(mesToTrimestre('2026-00')).toBeNull();
  });

  it('formato invalido (mes 13) retorna null', () => {
    expect(mesToTrimestre('2026-13')).toBeNull();
  });

  it('formato invalido (YYYY-QN em vez de YYYY-MM) retorna null', () => {
    expect(mesToTrimestre('2026-Q1')).toBeNull();
  });

  it('string vazia retorna null', () => {
    expect(mesToTrimestre('')).toBeNull();
  });
});

describe('quarterlyPeriod — getQuarterMonths (ME-031)', () => {
  it('Q1 retorna Jan/Fev/Mar', () => {
    expect(getQuarterMonths('2026-Q1')).toStrictEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('Q2 retorna Abr/Mai/Jun', () => {
    expect(getQuarterMonths('2026-Q2')).toStrictEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('Q3 retorna Jul/Ago/Set', () => {
    expect(getQuarterMonths('2026-Q3')).toStrictEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('Q4 retorna Out/Nov/Dez', () => {
    expect(getQuarterMonths('2026-Q4')).toStrictEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('ano anterior preserva ano nos 3 meses', () => {
    expect(getQuarterMonths('2025-Q3')).toStrictEqual(['2025-07', '2025-08', '2025-09']);
  });

  it('formato invalido (Q5) retorna null', () => {
    expect(getQuarterMonths('2026-Q5')).toBeNull();
  });

  it('formato invalido (Q0) retorna null', () => {
    expect(getQuarterMonths('2026-Q0')).toBeNull();
  });

  it('formato invalido (YYYY-MM em vez de YYYY-QN) retorna null', () => {
    expect(getQuarterMonths('2026-03')).toBeNull();
  });
});

describe('quarterlyPeriod — isThirdMonthOfQuarter (ME-031)', () => {
  it('Marco (fim de Q1) e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-03')).toBe(true);
  });

  it('Junho (fim de Q2) e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-06')).toBe(true);
  });

  it('Setembro (fim de Q3) e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-09')).toBe(true);
  });

  it('Dezembro (fim de Q4) e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-12')).toBe(true);
  });

  it('Janeiro nao e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-01')).toBe(false);
  });

  it('Fevereiro nao e terceiro mes', () => {
    expect(isThirdMonthOfQuarter('2026-02')).toBe(false);
  });

  it('formato invalido retorna false', () => {
    expect(isThirdMonthOfQuarter('2026-Q1')).toBe(false);
  });
});

describe('quarterlyPeriod — getTrimestreFromDateInTimezone (ME-031)', () => {
  it('Marco em America/Sao_Paulo mapeia para Q1', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    expect(getTrimestreFromDateInTimezone(now, 'America/Sao_Paulo')).toStrictEqual({
      ano: 2026,
      trimestre: 1,
    });
  });

  it('Julho em America/Sao_Paulo mapeia para Q3', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    expect(getTrimestreFromDateInTimezone(now, 'America/Sao_Paulo')).toStrictEqual({
      ano: 2026,
      trimestre: 3,
    });
  });

  it('Dezembro em UTC mapeia para Q4', () => {
    const now = new Date('2026-12-25T00:00:00Z');
    expect(getTrimestreFromDateInTimezone(now, 'UTC')).toStrictEqual({
      ano: 2026,
      trimestre: 4,
    });
  });

  it('virada de ano UTC vs Sao_Paulo: 1 Jan 02:00 UTC vira 31 Dez 23:00 fuso SP', () => {
    const now = new Date('2027-01-01T02:00:00Z');
    expect(getTrimestreFromDateInTimezone(now, 'America/Sao_Paulo')).toStrictEqual({
      ano: 2026,
      trimestre: 4,
    });
    expect(getTrimestreFromDateInTimezone(now, 'UTC')).toStrictEqual({
      ano: 2027,
      trimestre: 1,
    });
  });
});
