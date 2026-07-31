// ROIP APP 9BOX — teste unitario `weeklyDigestDate` (ME-060).
// Cobre §11.4 passo 1-2 (gatilho segunda 08h fuso local) + §11.5 passo 1
// (weekStart/weekEnd) + §12.7 (formato canonico DD/MM/YYYY e DD/MM).

import { describe, expect, it } from 'vitest';

import {
  formatWeekRangeDDMM,
  formatWeekRangeDDMMYYYY,
  getWeekBounds,
  isMondayEightAmLocal,
} from '../../src/lib/email/weeklyDigestDate';

const TZ_SP = 'America/Sao_Paulo';

describe('isMondayEightAmLocal — §11.4 passo 2', () => {
  it('segunda 08:00 fuso SP retorna true', () => {
    // 2026-01-05 segunda 08:00 BRT (UTC-3) = 2026-01-05 11:00 UTC
    const now = new Date('2026-01-05T11:00:00Z');
    expect(isMondayEightAmLocal(now, TZ_SP)).toBe(true);
  });
  it('segunda 08:30 fuso SP retorna true (janela [08:00,08:59])', () => {
    const now = new Date('2026-01-05T11:30:00Z');
    expect(isMondayEightAmLocal(now, TZ_SP)).toBe(true);
  });
  it('segunda 07:59 fuso SP retorna false', () => {
    const now = new Date('2026-01-05T10:59:00Z');
    expect(isMondayEightAmLocal(now, TZ_SP)).toBe(false);
  });
  it('segunda 09:00 fuso SP retorna false', () => {
    const now = new Date('2026-01-05T12:00:00Z');
    expect(isMondayEightAmLocal(now, TZ_SP)).toBe(false);
  });
  it('terca 08:00 fuso SP retorna false', () => {
    const now = new Date('2026-01-06T11:00:00Z');
    expect(isMondayEightAmLocal(now, TZ_SP)).toBe(false);
  });
});

describe('getWeekBounds — §11.5 passo 1', () => {
  it('segunda 08h SP → weekStart=segunda 08h, weekEnd=segunda seguinte 08h', () => {
    const now = new Date('2026-01-05T11:00:00Z'); // seg 2026-01-05 08h BRT
    const { weekStart, weekEnd } = getWeekBounds(now, TZ_SP);
    // 08h BRT = 11h UTC
    expect(weekStart.toISOString()).toBe('2026-01-05T11:00:00.000Z');
    expect(weekEnd.toISOString()).toBe('2026-01-12T11:00:00.000Z');
  });

  it('lanca erro se chamado fora do gatilho (dia != segunda)', () => {
    const now = new Date('2026-01-06T11:00:00Z');
    expect(() => getWeekBounds(now, TZ_SP)).toThrow(/gatilho canonico/);
  });
});

describe('formatWeekRangeDDMMYYYY — §12.7 assunto', () => {
  it('semana de 05/01/2026 a 12/01/2026', () => {
    const weekStart = new Date('2026-01-05T11:00:00Z');
    const weekEnd = new Date('2026-01-12T11:00:00Z');
    const { startFull, endFull } = formatWeekRangeDDMMYYYY(weekStart, weekEnd, TZ_SP);
    expect(startFull).toBe('05/01/2026');
    expect(endFull).toBe('12/01/2026');
  });
});

describe('formatWeekRangeDDMM — §12.7 corpo', () => {
  it('semana de 05/01 a 12/01', () => {
    const weekStart = new Date('2026-01-05T11:00:00Z');
    const weekEnd = new Date('2026-01-12T11:00:00Z');
    const { startDDMM, endDDMM } = formatWeekRangeDDMM(weekStart, weekEnd, TZ_SP);
    expect(startDDMM).toBe('05/01');
    expect(endDDMM).toBe('12/01');
  });
});
