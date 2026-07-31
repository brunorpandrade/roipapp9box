// ROIP APP 9BOX — teste unit nextWeeklyDigestDate (ME-059).
// Cobre §8.9 calculo canonico da proxima segunda 08h fuso local → UTC.

import { describe, expect, it } from 'vitest';

import {
  nextWeeklyDigestDate,
  TIMEZONE_FALLBACK,
} from '../../src/lib/alerts/pipeline/nextWeeklyDigestDate';

describe('nextWeeklyDigestDate — proxima segunda 08h fuso local → UTC', () => {
  it('TIMEZONE_FALLBACK canonico = America/Sao_Paulo', () => {
    expect(TIMEZONE_FALLBACK).toBe('America/Sao_Paulo');
  });

  describe('America/Sao_Paulo (UTC-3, sem DST desde 2019)', () => {
    it('segunda 07:00 local → mesma segunda 08:00 local = 11:00 UTC', () => {
      // Seg 2026-02-02 07:00 BRT = Seg 2026-02-02 10:00 UTC.
      const now = new Date('2026-02-02T10:00:00Z');
      const result = nextWeeklyDigestDate(now, 'America/Sao_Paulo');
      // Proxima segunda 08:00 BRT = 11:00 UTC.
      expect(result.toISOString()).toBe('2026-02-02T11:00:00.000Z');
    });

    it('segunda 08:30 local → proxima segunda +7 dias', () => {
      // Seg 2026-02-02 08:30 BRT = Seg 2026-02-02 11:30 UTC.
      const now = new Date('2026-02-02T11:30:00Z');
      const result = nextWeeklyDigestDate(now, 'America/Sao_Paulo');
      // Proxima segunda = 2026-02-09 08:00 BRT = 11:00 UTC.
      expect(result.toISOString()).toBe('2026-02-09T11:00:00.000Z');
    });

    it('terca 10:00 local → proxima segunda (6 dias depois)', () => {
      // Ter 2026-02-03 10:00 BRT = Ter 2026-02-03 13:00 UTC.
      const now = new Date('2026-02-03T13:00:00Z');
      const result = nextWeeklyDigestDate(now, 'America/Sao_Paulo');
      // Proxima segunda = 2026-02-09 08:00 BRT = 11:00 UTC.
      expect(result.toISOString()).toBe('2026-02-09T11:00:00.000Z');
    });

    it('domingo 22:00 local → proxima segunda (dia seguinte)', () => {
      // Dom 2026-02-01 22:00 BRT = Seg 2026-02-02 01:00 UTC.
      const now = new Date('2026-02-02T01:00:00Z');
      const result = nextWeeklyDigestDate(now, 'America/Sao_Paulo');
      // Proxima segunda = 2026-02-02 08:00 BRT = 11:00 UTC.
      expect(result.toISOString()).toBe('2026-02-02T11:00:00.000Z');
    });
  });

  describe('America/New_York (UTC-5 EST / UTC-4 EDT)', () => {
    it('quinta 12:00 local (janeiro EST) → proxima segunda 08:00 EST = 13:00 UTC', () => {
      // Qui 2026-01-15 12:00 EST = Qui 2026-01-15 17:00 UTC.
      const now = new Date('2026-01-15T17:00:00Z');
      const result = nextWeeklyDigestDate(now, 'America/New_York');
      // Proxima segunda = 2026-01-19 08:00 EST = 13:00 UTC.
      expect(result.toISOString()).toBe('2026-01-19T13:00:00.000Z');
    });

    it('quinta 12:00 local (junho EDT) → proxima segunda 08:00 EDT = 12:00 UTC', () => {
      // Qui 2026-06-11 12:00 EDT = Qui 2026-06-11 16:00 UTC.
      const now = new Date('2026-06-11T16:00:00Z');
      const result = nextWeeklyDigestDate(now, 'America/New_York');
      // Proxima segunda = 2026-06-15 08:00 EDT = 12:00 UTC.
      expect(result.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });
  });

  describe('Europe/London (UTC+0 GMT / UTC+1 BST)', () => {
    it('quarta janeiro (GMT) → proxima segunda 08:00 GMT = 08:00 UTC', () => {
      // Qua 2026-01-14 10:00 GMT = 10:00 UTC (GMT em janeiro).
      const now = new Date('2026-01-14T10:00:00Z');
      const result = nextWeeklyDigestDate(now, 'Europe/London');
      // Proxima segunda = 2026-01-19 08:00 GMT = 08:00 UTC.
      expect(result.toISOString()).toBe('2026-01-19T08:00:00.000Z');
    });

    it('quarta junho (BST) → proxima segunda 08:00 BST = 07:00 UTC', () => {
      // Qua 2026-06-10 10:00 BST = 09:00 UTC.
      const now = new Date('2026-06-10T09:00:00Z');
      const result = nextWeeklyDigestDate(now, 'Europe/London');
      // Proxima segunda = 2026-06-15 08:00 BST = 07:00 UTC.
      expect(result.toISOString()).toBe('2026-06-15T07:00:00.000Z');
    });
  });

  describe('resultado e sempre uma segunda no fuso local as 08:00', () => {
    it('para varios pontos de partida, resultado no fuso local sempre e segunda 08:00', () => {
      const casos = [
        { now: '2026-02-02T09:00:00Z', tz: 'America/Sao_Paulo' }, // Dom noite
        { now: '2026-02-05T15:00:00Z', tz: 'America/Sao_Paulo' }, // Qui manha
        { now: '2026-02-15T22:00:00Z', tz: 'Europe/London' }, // Dom noite
      ];
      for (const caso of casos) {
        const result = nextWeeklyDigestDate(new Date(caso.now), caso.tz);
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: caso.tz,
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'short',
          hour12: false,
        });
        const parts = fmt.formatToParts(result);
        const byType = new Map(parts.map((p) => [p.type, p.value]));
        expect(byType.get('weekday')).toBe('Mon');
        expect(byType.get('hour')).toBe('08');
        expect(byType.get('minute')).toBe('00');
      }
    });
  });
});
