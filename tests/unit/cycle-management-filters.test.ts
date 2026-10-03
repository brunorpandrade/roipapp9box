// ROIP APP 9BOX — testes unit de filters.ts de `/cycle-management`
// (ME-B9.1 §14.18).

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS,
  PAGINATION_DEFAULT_PAGE_SIZE,
  PAGINATION_PAGE_SIZE_VALUES,
  parseCycleScheduleFilters,
} from '../../src/app/cycle-management/filters';

describe('CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS — defaults canonicos', () => {
  it('todos os filtros null + trimestre_atual + page 1 + pageSize 25', () => {
    expect(CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS).toEqual({
      tipoCiclo: null,
      status: null,
      periodo: 'trimestre_atual',
      page: 1,
      pageSize: 25,
    });
  });
});

describe('PAGINATION_PAGE_SIZE_VALUES — 25/50/100', () => {
  it('exatamente 3 valores canonicos', () => {
    expect(PAGINATION_PAGE_SIZE_VALUES).toEqual([25, 50, 100]);
  });
  it('default = 25', () => {
    expect(PAGINATION_DEFAULT_PAGE_SIZE).toBe(25);
  });
});

describe('parseCycleScheduleFilters — parsing safe', () => {
  it('sem params → defaults', () => {
    expect(parseCycleScheduleFilters({})).toEqual(CANONICAL_CYCLE_SCHEDULE_DEFAULT_FILTERS);
  });
  it('tipoCiclo valido', () => {
    const f = parseCycleScheduleFilters({ tipoCiclo: 'instrumento_a' });
    expect(f.tipoCiclo).toBe('instrumento_a');
  });
  it('tipoCiclo invalido → null (default)', () => {
    const f = parseCycleScheduleFilters({ tipoCiclo: 'inexistente' });
    expect(f.tipoCiclo).toBe(null);
  });
  it('status valido', () => {
    expect(parseCycleScheduleFilters({ status: 'aberto' }).status).toBe('aberto');
    expect(parseCycleScheduleFilters({ status: 'atrasado' }).status).toBe('atrasado');
    expect(parseCycleScheduleFilters({ status: 'fechado' }).status).toBe('fechado');
  });
  it('status invalido → null', () => {
    expect(parseCycleScheduleFilters({ status: 'other' }).status).toBe(null);
  });
  it('periodo valido', () => {
    expect(parseCycleScheduleFilters({ periodo: 'ultimos_90_dias' }).periodo).toBe(
      'ultimos_90_dias',
    );
    expect(parseCycleScheduleFilters({ periodo: 'trimestre_anterior' }).periodo).toBe(
      'trimestre_anterior',
    );
  });
  it('periodo invalido → default trimestre_atual', () => {
    expect(parseCycleScheduleFilters({ periodo: 'outro' }).periodo).toBe('trimestre_atual');
  });
  it('page >= 1 preservado', () => {
    expect(parseCycleScheduleFilters({ page: '3' }).page).toBe(3);
  });
  it('page invalido → 1', () => {
    expect(parseCycleScheduleFilters({ page: '0' }).page).toBe(1);
    expect(parseCycleScheduleFilters({ page: 'xx' }).page).toBe(1);
  });
  it('pageSize valido', () => {
    expect(parseCycleScheduleFilters({ pageSize: '50' }).pageSize).toBe(50);
    expect(parseCycleScheduleFilters({ pageSize: '100' }).pageSize).toBe(100);
  });
  it('pageSize invalido → default 25', () => {
    expect(parseCycleScheduleFilters({ pageSize: '77' }).pageSize).toBe(25);
    expect(parseCycleScheduleFilters({ pageSize: 'abc' }).pageSize).toBe(25);
  });
  it('array vem como primeiro elemento', () => {
    expect(parseCycleScheduleFilters({ tipoCiclo: ['instrumento_c', 'xx'] }).tipoCiclo).toBe(
      'instrumento_c',
    );
  });
});
