// ROIP APP 9BOX — testes unitarios `lib/cycleDates` (ME-030).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Cobre parse/format canonicos, aritmetica de trimestre e mes,
// conversao local→UTC, datas canonicas por tipo, iteradores de horizonte
// e inspetores de calendario local — todos com timezone canonico
// `America/Sao_Paulo` (default de `companies.timezone`) e mais uma
// travessia com timezone alternativo `UTC` para provar a generalidade.

import { describe, expect, it } from 'vitest';

import {
  formatMensalCicloReferencia,
  formatTrimestreCicloReferencia,
  getDayInTimezone,
  getFechamentoMensalDataAbertura,
  getFechamentoMensalDataCorte,
  getInstrumentoABDataAbertura,
  getInstrumentoABDataCorte,
  getLastMonthOfTrimestre,
  getMonthInTimezone,
  getPreviousMonth,
  getPreviousTrimestre,
  getTrimestreFromMonth,
  getYearInTimezone,
  isCicloReferenciaImediatamenteAnterior,
  localDateTimeToUTC,
  nextFechamentoMensalCiclos,
  nextInstrumentoABCiclos,
  nextInstrumentoDCiclos,
  parseMensalCicloReferencia,
  parseTrimestreCicloReferencia,
  type Trimestre,
} from '../../src/lib/cycleDates';

const TZ = 'America/Sao_Paulo';

describe('lib/cycleDates — parse e format canonicos (ME-030)', () => {
  it('parseTrimestreCicloReferencia aceita os 4 trimestres canonicos', () => {
    expect(parseTrimestreCicloReferencia('2026-Q1')).toEqual({ ano: 2026, trimestre: 1 });
    expect(parseTrimestreCicloReferencia('2026-Q2')).toEqual({ ano: 2026, trimestre: 2 });
    expect(parseTrimestreCicloReferencia('2026-Q3')).toEqual({ ano: 2026, trimestre: 3 });
    expect(parseTrimestreCicloReferencia('2026-Q4')).toEqual({ ano: 2026, trimestre: 4 });
  });

  it('parseTrimestreCicloReferencia rejeita formatos nao canonicos', () => {
    expect(parseTrimestreCicloReferencia('2026-Q5')).toBeNull();
    expect(parseTrimestreCicloReferencia('2026-Q0')).toBeNull();
    expect(parseTrimestreCicloReferencia('2026-01')).toBeNull();
    expect(parseTrimestreCicloReferencia('26-Q1')).toBeNull();
    expect(parseTrimestreCicloReferencia('')).toBeNull();
  });

  it('formatTrimestreCicloReferencia serializa no padrao canonico', () => {
    expect(formatTrimestreCicloReferencia(2026, 1)).toBe('2026-Q1');
    expect(formatTrimestreCicloReferencia(2027, 4)).toBe('2027-Q4');
  });

  it('parseMensalCicloReferencia aceita os 12 meses canonicos', () => {
    for (let m = 1; m <= 12; m += 1) {
      const ref = `2026-${m.toString().padStart(2, '0')}`;
      expect(parseMensalCicloReferencia(ref)).toEqual({ ano: 2026, mes: m });
    }
  });

  it('parseMensalCicloReferencia rejeita formatos nao canonicos', () => {
    expect(parseMensalCicloReferencia('2026-13')).toBeNull();
    expect(parseMensalCicloReferencia('2026-00')).toBeNull();
    expect(parseMensalCicloReferencia('2026-Q1')).toBeNull();
    expect(parseMensalCicloReferencia('26-01')).toBeNull();
    expect(parseMensalCicloReferencia('2026-1')).toBeNull();
  });

  it('formatMensalCicloReferencia pad-zera o mes', () => {
    expect(formatMensalCicloReferencia(2026, 1)).toBe('2026-01');
    expect(formatMensalCicloReferencia(2026, 12)).toBe('2026-12');
  });
});

describe('lib/cycleDates — aritmetica canonica (ME-030)', () => {
  it('getTrimestreFromMonth mapeia os 12 meses corretamente', () => {
    const esperado: Array<[number, Trimestre]> = [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
      [6, 2],
      [7, 3],
      [8, 3],
      [9, 3],
      [10, 4],
      [11, 4],
      [12, 4],
    ];
    for (const [mes, trim] of esperado) {
      expect(getTrimestreFromMonth(mes)).toBe(trim);
    }
  });

  it('getLastMonthOfTrimestre retorna 3/6/9/12', () => {
    expect(getLastMonthOfTrimestre(1)).toBe(3);
    expect(getLastMonthOfTrimestre(2)).toBe(6);
    expect(getLastMonthOfTrimestre(3)).toBe(9);
    expect(getLastMonthOfTrimestre(4)).toBe(12);
  });

  it('getPreviousMonth transita janeiro para dezembro do ano anterior', () => {
    expect(getPreviousMonth(2026, 6)).toEqual({ ano: 2026, mes: 5 });
    expect(getPreviousMonth(2026, 1)).toEqual({ ano: 2025, mes: 12 });
    expect(getPreviousMonth(2026, 12)).toEqual({ ano: 2026, mes: 11 });
  });

  it('getPreviousTrimestre transita Q1 para Q4 do ano anterior', () => {
    expect(getPreviousTrimestre(2026, 2)).toEqual({ ano: 2026, trimestre: 1 });
    expect(getPreviousTrimestre(2026, 1)).toEqual({ ano: 2025, trimestre: 4 });
    expect(getPreviousTrimestre(2026, 4)).toEqual({ ano: 2026, trimestre: 3 });
  });
});

describe('lib/cycleDates — conversao local → UTC (ME-030)', () => {
  it('localDateTimeToUTC em America/Sao_Paulo aplica offset -03:00 fixo', () => {
    // 2026-01-16 00:00 America/Sao_Paulo == 2026-01-16 03:00 UTC.
    const utc = localDateTimeToUTC(2026, 1, 16, 0, 0, 0, TZ);
    expect(utc.toISOString()).toBe('2026-01-16T03:00:00.000Z');
  });

  it('localDateTimeToUTC em UTC retorna o proprio instante como UTC', () => {
    // 2026-03-16 00:00 UTC == 2026-03-16 00:00 UTC.
    const utc = localDateTimeToUTC(2026, 3, 16, 0, 0, 0, 'UTC');
    expect(utc.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('localDateTimeToUTC preserva segundos', () => {
    const utc = localDateTimeToUTC(2026, 4, 10, 23, 59, 59, TZ);
    // 23:59:59 -03:00 == 02:59:59 UTC do dia seguinte.
    expect(utc.toISOString()).toBe('2026-04-11T02:59:59.000Z');
  });
});

describe('lib/cycleDates — datas canonicas por tipo de ciclo (ME-030)', () => {
  it('getInstrumentoABDataAbertura Q1/2026 SP → 2026-03-16 00:00 -03:00', () => {
    const d = getInstrumentoABDataAbertura(2026, 1, TZ);
    expect(d.toISOString()).toBe('2026-03-16T03:00:00.000Z');
  });

  it('getInstrumentoABDataAbertura Q4/2026 SP → 2026-12-16 00:00 -03:00', () => {
    const d = getInstrumentoABDataAbertura(2026, 4, TZ);
    expect(d.toISOString()).toBe('2026-12-16T03:00:00.000Z');
  });

  it('getInstrumentoABDataCorte Q1/2026 SP → 2026-04-10 23:59:59 -03:00', () => {
    const d = getInstrumentoABDataCorte(2026, 1, TZ);
    expect(d.toISOString()).toBe('2026-04-11T02:59:59.000Z');
  });

  it('getInstrumentoABDataCorte Q4/2026 SP transita para janeiro do ano seguinte', () => {
    // Q4/2026 = out/nov/dez; corte = 2027-01-10 23:59:59 -03:00.
    const d = getInstrumentoABDataCorte(2026, 4, TZ);
    expect(d.toISOString()).toBe('2027-01-11T02:59:59.000Z');
  });

  it('getFechamentoMensalDataAbertura mes 6/2026 SP → 2026-06-01 00:00 -03:00', () => {
    const d = getFechamentoMensalDataAbertura(2026, 6, TZ);
    expect(d.toISOString()).toBe('2026-06-01T03:00:00.000Z');
  });

  it('getFechamentoMensalDataCorte mes 12/2026 SP transita para janeiro do ano seguinte', () => {
    const d = getFechamentoMensalDataCorte(2026, 12, TZ);
    expect(d.toISOString()).toBe('2027-01-11T02:59:59.000Z');
  });
});

describe('lib/cycleDates — iteradores de horizonte (ME-030)', () => {
  it('nextInstrumentoABCiclos a partir de 2026-01-15 SP cobre pelo menos Q1', () => {
    const from = new Date('2026-01-15T12:00:00Z');
    const ciclos = nextInstrumentoABCiclos(from, TZ, 6);
    expect(ciclos.length).toBeGreaterThan(0);
    expect(ciclos[0]!.cicloReferencia).toBe('2026-Q1');
    // Todos devem ter dataAbertura ordenada ascendente.
    for (let i = 1; i < ciclos.length; i += 1) {
      expect(ciclos[i]!.dataAbertura.getTime()).toBeGreaterThanOrEqual(
        ciclos[i - 1]!.dataAbertura.getTime(),
      );
    }
  });

  it('nextInstrumentoABCiclos gera ciclos consecutivos em ordem canonica', () => {
    const from = new Date('2026-01-15T12:00:00Z');
    const ciclos = nextInstrumentoABCiclos(from, TZ, 12);
    const refs = ciclos.map((c) => c.cicloReferencia);
    // Deve iniciar em Q1/2026 e continuar em ordem.
    expect(refs[0]).toBe('2026-Q1');
    if (refs.length >= 2) expect(refs[1]).toBe('2026-Q2');
    if (refs.length >= 3) expect(refs[2]).toBe('2026-Q3');
  });

  it('nextInstrumentoDCiclos filtra somente Q1 e Q3', () => {
    const from = new Date('2026-01-15T12:00:00Z');
    const ciclos = nextInstrumentoDCiclos(from, TZ, 24);
    for (const c of ciclos) {
      const parsed = parseTrimestreCicloReferencia(c.cicloReferencia);
      expect(parsed?.trimestre === 1 || parsed?.trimestre === 3).toBe(true);
    }
  });

  it('nextFechamentoMensalCiclos a partir de 2026-06-05 SP inicia em 2026-06', () => {
    const from = new Date('2026-06-05T12:00:00Z');
    const ciclos = nextFechamentoMensalCiclos(from, TZ, 6);
    expect(ciclos[0]!.cicloReferencia).toBe('2026-06');
    // Deve conter pelo menos 2026-06 e 2026-07.
    const refs = ciclos.map((c) => c.cicloReferencia);
    expect(refs).toContain('2026-07');
  });

  it('nextFechamentoMensalCiclos vira o ano corretamente (dezembro → janeiro)', () => {
    const from = new Date('2026-11-05T12:00:00Z');
    const ciclos = nextFechamentoMensalCiclos(from, TZ, 6);
    const refs = ciclos.map((c) => c.cicloReferencia);
    expect(refs[0]).toBe('2026-11');
    expect(refs).toContain('2026-12');
    expect(refs).toContain('2027-01');
  });
});

describe('lib/cycleDates — inspetores de calendario local (ME-030)', () => {
  it('getDayInTimezone respeita o fuso da empresa', () => {
    // 2026-04-11 02:59:59 UTC == 2026-04-10 23:59:59 America/Sao_Paulo.
    const now = new Date('2026-04-11T02:59:59Z');
    expect(getDayInTimezone(now, TZ)).toBe(10);
    expect(getDayInTimezone(now, 'UTC')).toBe(11);
  });

  it('getMonthInTimezone e getYearInTimezone respeitam o fuso', () => {
    // 2026-01-01 02:00 UTC == 2025-12-31 23:00 America/Sao_Paulo.
    const now = new Date('2026-01-01T02:00:00Z');
    expect(getMonthInTimezone(now, TZ)).toBe(12);
    expect(getYearInTimezone(now, TZ)).toBe(2025);
    expect(getMonthInTimezone(now, 'UTC')).toBe(1);
    expect(getYearInTimezone(now, 'UTC')).toBe(2026);
  });

  it('isCicloReferenciaImediatamenteAnterior — mensal detecta mes anterior no fuso', () => {
    // Empresa em SP, dia 11 do mes 4 de 2026 (fuso local) — mes anterior canonico = 2026-03.
    const now = new Date('2026-04-11T15:00:00Z');
    expect(isCicloReferenciaImediatamenteAnterior('2026-03', 'mensal', now, TZ)).toBe(true);
    expect(isCicloReferenciaImediatamenteAnterior('2026-04', 'mensal', now, TZ)).toBe(false);
    expect(isCicloReferenciaImediatamenteAnterior('2026-02', 'mensal', now, TZ)).toBe(false);
  });

  it('isCicloReferenciaImediatamenteAnterior — trimestre detecta trim anterior no fuso', () => {
    // Empresa em SP, dia 11 do mes 4 de 2026 → trim atual = Q2/2026, anterior = Q1/2026.
    const now = new Date('2026-04-11T15:00:00Z');
    expect(isCicloReferenciaImediatamenteAnterior('2026-Q1', 'trimestre', now, TZ)).toBe(true);
    expect(isCicloReferenciaImediatamenteAnterior('2026-Q2', 'trimestre', now, TZ)).toBe(false);
    expect(isCicloReferenciaImediatamenteAnterior('2025-Q4', 'trimestre', now, TZ)).toBe(false);
  });

  it('isCicloReferenciaImediatamenteAnterior — vira o ano em janeiro', () => {
    // 2026-01-11 15:00 UTC — em SP, dia 11 do mes 1 de 2026 → anterior = 2025-12 (mensal),
    // Q1/2026 → anterior Q4/2025 (trimestre).
    const now = new Date('2026-01-11T15:00:00Z');
    expect(isCicloReferenciaImediatamenteAnterior('2025-12', 'mensal', now, TZ)).toBe(true);
    expect(isCicloReferenciaImediatamenteAnterior('2025-Q4', 'trimestre', now, TZ)).toBe(true);
  });

  it('isCicloReferenciaImediatamenteAnterior — rejeita cicloReferencia invalido', () => {
    const now = new Date('2026-04-11T15:00:00Z');
    expect(isCicloReferenciaImediatamenteAnterior('lixo', 'mensal', now, TZ)).toBe(false);
    expect(isCicloReferenciaImediatamenteAnterior('lixo', 'trimestre', now, TZ)).toBe(false);
  });
});
