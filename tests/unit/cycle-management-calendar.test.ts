// ROIP APP 9BOX — testes unit de calendarioHelpers de
// `/cycle-management` (ME-B9.1 §14.18 Area 1).

import { describe, expect, it } from 'vitest';

import type { CycleScheduleRow } from '../../src/app/cycle-management/internals';
import {
  cicloRefTrimestral,
  mesesDoTrimestre,
  nextTrimestre,
  resolveCalendarioEventos,
  resolveTrimestre,
  trimestreLabel,
} from '../../src/app/cycle-management/calendarioHelpers';

describe('resolveTrimestre — classifica trimestre canonico', () => {
  it('janeiro → Q1', () => {
    expect(resolveTrimestre(new Date(Date.UTC(2026, 0, 15)))).toEqual({ ano: 2026, numero: 1 });
  });
  it('abril → Q2', () => {
    expect(resolveTrimestre(new Date(Date.UTC(2026, 3, 15)))).toEqual({ ano: 2026, numero: 2 });
  });
  it('julho → Q3', () => {
    expect(resolveTrimestre(new Date(Date.UTC(2026, 6, 15)))).toEqual({ ano: 2026, numero: 3 });
  });
  it('outubro → Q4', () => {
    expect(resolveTrimestre(new Date(Date.UTC(2026, 9, 15)))).toEqual({ ano: 2026, numero: 4 });
  });
});

describe('nextTrimestre — avanca com rollover de ano', () => {
  it('Q1 → Q2 (mesmo ano)', () => {
    expect(nextTrimestre({ ano: 2026, numero: 1 })).toEqual({ ano: 2026, numero: 2 });
  });
  it('Q3 → Q4 (mesmo ano)', () => {
    expect(nextTrimestre({ ano: 2026, numero: 3 })).toEqual({ ano: 2026, numero: 4 });
  });
  it('Q4 → Q1 (proximo ano)', () => {
    expect(nextTrimestre({ ano: 2026, numero: 4 })).toEqual({ ano: 2027, numero: 1 });
  });
});

describe('trimestreLabel + cicloRefTrimestral', () => {
  it('label canonico "Q2 2026"', () => {
    expect(trimestreLabel({ ano: 2026, numero: 2 })).toBe('Q2 2026');
  });
  it('cicloRef canonico "2026-Q2"', () => {
    expect(cicloRefTrimestral({ ano: 2026, numero: 2 })).toBe('2026-Q2');
  });
});

describe('mesesDoTrimestre — meses canonicos YYYY-MM', () => {
  it('Q1 → jan-mar', () => {
    expect(mesesDoTrimestre({ ano: 2026, numero: 1 })).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('Q3 → jul-set', () => {
    expect(mesesDoTrimestre({ ano: 2026, numero: 3 })).toEqual(['2026-07', '2026-08', '2026-09']);
  });
  it('Q4 → out-dez', () => {
    expect(mesesDoTrimestre({ ano: 2026, numero: 4 })).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('resolveCalendarioEventos — producao de eventos canonicos', () => {
  const now = new Date(Date.UTC(2026, 6, 5)); // 05/07/2026 (Q3 iniciando)

  function head<T>(arr: readonly T[]): T {
    const first = arr[0];
    if (first === undefined) {
      throw new Error('array vazio');
    }
    return first;
  }

  it('instrumento A aberto no Q3 produz evento futuro', () => {
    const row: CycleScheduleRow = {
      id: 1,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-Q3',
      dataAbertura: '2026-09-16T00:00:00Z',
      dataCorte: null,
      dataFechamento: null,
      status: 'aberto',
      totalElegiveis: 100,
      totalRespondidos: 0,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(eventos).toHaveLength(1);
    expect(head(eventos).trimestre).toBe('Q3 2026');
    expect(head(eventos).status).toBe('futuro');
    expect(head(eventos).titulo).toBe('Abertura Instrumento A');
  });

  it('fechamento mensal Q3 fechado com >=80% adesao → concluido', () => {
    const row: CycleScheduleRow = {
      id: 2,
      tipoCiclo: 'fechamento_mensal',
      cicloReferencia: '2026-07',
      dataAbertura: '2026-07-01T00:00:00Z',
      dataCorte: '2026-08-11T00:00:00Z',
      dataFechamento: '2026-08-11T00:00:00Z',
      status: 'fechado',
      totalElegiveis: 100,
      totalRespondidos: 85,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(eventos).toHaveLength(1);
    expect(head(eventos).status).toBe('concluido');
    expect(head(eventos).trimestre).toBe('Q3 2026');
  });

  it('fechamento mensal fechado com <80% adesao → atrasado', () => {
    const row: CycleScheduleRow = {
      id: 3,
      tipoCiclo: 'fechamento_mensal',
      cicloReferencia: '2026-07',
      dataAbertura: '2026-07-01T00:00:00Z',
      dataCorte: '2026-08-11T00:00:00Z',
      dataFechamento: '2026-08-11T00:00:00Z',
      status: 'fechado',
      totalElegiveis: 100,
      totalRespondidos: 50,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(head(eventos).status).toBe('atrasado');
  });

  it('instrumento aberto dentro do trimestre atual → atual', () => {
    const row: CycleScheduleRow = {
      id: 4,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-Q3',
      dataAbertura: '2026-07-01T00:00:00Z', // ja aberto em relacao a now 05/07
      dataCorte: '2026-08-10T00:00:00Z',
      dataFechamento: null,
      status: 'aberto',
      totalElegiveis: 100,
      totalRespondidos: 20,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(head(eventos).status).toBe('atual');
  });

  it('instrumento com status atrasado → atrasado (trimestre atual)', () => {
    const row: CycleScheduleRow = {
      id: 5,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-Q3',
      dataAbertura: '2026-07-01T00:00:00Z',
      dataCorte: '2026-07-10T00:00:00Z',
      dataFechamento: null,
      status: 'atrasado',
      totalElegiveis: 100,
      totalRespondidos: 70,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(head(eventos).status).toBe('atrasado');
  });

  it('trimestre fora do atual + proximo é ignorado', () => {
    const row: CycleScheduleRow = {
      id: 6,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2025-Q4',
      dataAbertura: '2025-12-16T00:00:00Z',
      dataCorte: null,
      dataFechamento: null,
      status: 'fechado',
      totalElegiveis: 100,
      totalRespondidos: 85,
    };
    const eventos = resolveCalendarioEventos([row], now);
    expect(eventos).toHaveLength(0);
  });

  it('eventos sao ordenados por trimestre asc e dentro do mesmo trimestre por data asc', () => {
    const rows: CycleScheduleRow[] = [
      {
        id: 10,
        tipoCiclo: 'instrumento_c',
        cicloReferencia: '2026-Q4',
        dataAbertura: '2026-12-16T00:00:00Z',
        dataCorte: null,
        dataFechamento: null,
        status: 'aberto',
        totalElegiveis: 0,
        totalRespondidos: 0,
      },
      {
        id: 11,
        tipoCiclo: 'instrumento_a',
        cicloReferencia: '2026-Q3',
        dataAbertura: '2026-09-16T00:00:00Z',
        dataCorte: null,
        dataFechamento: null,
        status: 'aberto',
        totalElegiveis: 0,
        totalRespondidos: 0,
      },
    ];
    const eventos = resolveCalendarioEventos(rows, now);
    expect(eventos.length).toBe(2);
    expect(head(eventos).trimestre).toBe('Q3 2026');
    const e1 = eventos[1];
    if (e1 === undefined) {
      throw new Error('ev1 esperado');
    }
    expect(e1.trimestre).toBe('Q4 2026');
  });
});
