// ROIP APP 9BOX — testes unit dos filters canonicos do historico da
// empresa (ME-057c Bloco A — §14.21).
//
// Cobre bit-exact:
//   - Parse tolerante de searchParams (Next 15) para HistoricoFilters.
//   - Defaults canonicos §14.21 (periodo 90, tipo null, ator vazio,
//     pagina 1, pageSize 25).
//   - Normalizacao S324 do input "Ator" (min 2, max 100, trim + colapso
//     de whitespace).
//   - resolvePeriodoRange em todos os 4 modos (30, 90, 365,
//     personalizado).
//   - PERIODO_VALUES canonicos (4 opcoes do mockup 170-173).

import { describe, expect, it } from 'vitest';

import {
  ATOR_BUSCA_MAX_LEN,
  ATOR_BUSCA_MIN_LEN,
  CANONICAL_HISTORICO_DEFAULT_FILTERS,
  PERIODO_VALUES,
  normalizeAtorBusca,
  parseHistoricoFiltersFromSearchParams,
  resolvePeriodoRange,
} from '../../src/app/super-admin/empresa/[id]/historico/filters';

describe('historico-filters — CANONICAL_HISTORICO_DEFAULT_FILTERS', () => {
  it('periodo default = 90 (mockup selected linha 171)', () => {
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.periodo).toBe('90');
  });

  it('tipo default = null (Todos)', () => {
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.tipo).toBeNull();
  });

  it('atorBusca default = "" (sem filtro)', () => {
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.atorBusca).toBe('');
  });

  it('page default = 1, pageSize default = 25', () => {
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.page).toBe(1);
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.pageSize).toBe(25);
  });

  it('periodo personalizado inicio/fim = null', () => {
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.periodoPersonalizadoInicio).toBeNull();
    expect(CANONICAL_HISTORICO_DEFAULT_FILTERS.periodoPersonalizadoFim).toBeNull();
  });
});

describe('historico-filters — PERIODO_VALUES', () => {
  it('4 opcoes canonicas mockup (linhas 170-173)', () => {
    expect(PERIODO_VALUES).toEqual(['30', '90', '365', 'personalizado']);
  });
});

describe('historico-filters — parseHistoricoFiltersFromSearchParams', () => {
  it('input vazio → defaults canonicos', () => {
    const result = parseHistoricoFiltersFromSearchParams({});
    expect(result).toEqual(CANONICAL_HISTORICO_DEFAULT_FILTERS);
  });

  it('periodo=30 casa e demais defaults', () => {
    const r = parseHistoricoFiltersFromSearchParams({ periodo: '30' });
    expect(r.periodo).toBe('30');
    expect(r.tipo).toBeNull();
  });

  it('periodo=365 casa', () => {
    const r = parseHistoricoFiltersFromSearchParams({ periodo: '365' });
    expect(r.periodo).toBe('365');
  });

  it('periodo=personalizado + de/ate parseiam datas', () => {
    const r = parseHistoricoFiltersFromSearchParams({
      periodo: 'personalizado',
      de: '2026-01-01',
      ate: '2026-06-30',
    });
    expect(r.periodo).toBe('personalizado');
    expect(r.periodoPersonalizadoInicio?.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(r.periodoPersonalizadoFim?.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('periodo=90 + de/ate ignorados (nao-personalizado)', () => {
    const r = parseHistoricoFiltersFromSearchParams({
      periodo: '90',
      de: '2026-01-01',
      ate: '2026-06-30',
    });
    expect(r.periodoPersonalizadoInicio).toBeNull();
    expect(r.periodoPersonalizadoFim).toBeNull();
  });

  it('periodo invalido → fallback 90', () => {
    const r = parseHistoricoFiltersFromSearchParams({ periodo: 'xyz' });
    expect(r.periodo).toBe('90');
  });

  it('tipo=respfin parseia', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: 'respfin' });
    expect(r.tipo).toBe('respfin');
  });

  it('tipo=desbloqueio parseia', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: 'desbloqueio' });
    expect(r.tipo).toBe('desbloqueio');
  });

  it('tipo=transferencia parseia', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: 'transferencia' });
    expect(r.tipo).toBe('transferencia');
  });

  it('tipo=solicitacao parseia', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: 'solicitacao' });
    expect(r.tipo).toBe('solicitacao');
  });

  it('tipo invalido → null (Todos)', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: 'meta_roi' });
    expect(r.tipo).toBeNull();
  });

  it('tipo array → pega o primeiro', () => {
    const r = parseHistoricoFiltersFromSearchParams({ tipo: ['solicitacao', 'respfin'] });
    expect(r.tipo).toBe('solicitacao');
  });

  it('ator=Bruno → normalizado', () => {
    const r = parseHistoricoFiltersFromSearchParams({ ator: 'Bruno' });
    expect(r.atorBusca).toBe('Bruno');
  });

  it('ator com 1 char → normalizado a "" (min 2)', () => {
    const r = parseHistoricoFiltersFromSearchParams({ ator: 'B' });
    expect(r.atorBusca).toBe('');
  });

  it('pageSize=50 valido', () => {
    const r = parseHistoricoFiltersFromSearchParams({ pageSize: '50' });
    expect(r.pageSize).toBe(50);
  });

  it('pageSize=100 valido', () => {
    const r = parseHistoricoFiltersFromSearchParams({ pageSize: '100' });
    expect(r.pageSize).toBe(100);
  });

  it('pageSize=13 (invalido) → fallback 25', () => {
    const r = parseHistoricoFiltersFromSearchParams({ pageSize: '13' });
    expect(r.pageSize).toBe(25);
  });

  it('page=3 aceito', () => {
    const r = parseHistoricoFiltersFromSearchParams({ page: '3' });
    expect(r.page).toBe(3);
  });

  it('page=0 (invalido) → fallback 1', () => {
    const r = parseHistoricoFiltersFromSearchParams({ page: '0' });
    expect(r.page).toBe(1);
  });
});

describe('historico-filters — normalizeAtorBusca (S324)', () => {
  it('undefined → ""', () => {
    expect(normalizeAtorBusca(undefined)).toBe('');
  });

  it('trim + colapso de whitespace', () => {
    expect(normalizeAtorBusca('   Bruno   Andrade  ')).toBe('Bruno Andrade');
  });

  it(`min length = ${ATOR_BUSCA_MIN_LEN} → 1 char devolve ""`, () => {
    expect(normalizeAtorBusca('B')).toBe('');
  });

  it('2 chars preservados', () => {
    expect(normalizeAtorBusca('Br')).toBe('Br');
  });

  it(`max length = ${ATOR_BUSCA_MAX_LEN} — trunca`, () => {
    const long = 'X'.repeat(200);
    expect(normalizeAtorBusca(long).length).toBe(ATOR_BUSCA_MAX_LEN);
  });

  it('whitespace no meio → colapso single-space', () => {
    expect(normalizeAtorBusca('Ana\t\n\rSilva')).toBe('Ana Silva');
  });
});

describe('historico-filters — resolvePeriodoRange', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');

  it('periodo=30 → [now-30d, now]', () => {
    const r = resolvePeriodoRange('30', null, null, now);
    expect(r.inicio?.toISOString()).toBe('2026-06-30T12:00:00.000Z');
    expect(r.fim?.toISOString()).toBe(now.toISOString());
  });

  it('periodo=90 → [now-90d, now]', () => {
    const r = resolvePeriodoRange('90', null, null, now);
    expect(r.inicio?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    expect(r.fim?.toISOString()).toBe(now.toISOString());
  });

  it('periodo=365 → [now-365d, now]', () => {
    const r = resolvePeriodoRange('365', null, null, now);
    expect(r.inicio?.toISOString()).toBe('2025-07-30T12:00:00.000Z');
    expect(r.fim?.toISOString()).toBe(now.toISOString());
  });

  it('periodo=personalizado → repassa inicio/fim como recebidos', () => {
    const inicio = new Date('2026-01-01T00:00:00.000Z');
    const fim = new Date('2026-06-30T23:59:59.000Z');
    const r = resolvePeriodoRange('personalizado', inicio, fim, now);
    expect(r.inicio).toEqual(inicio);
    expect(r.fim).toEqual(fim);
  });

  it('periodo=personalizado + inicio null → devolve inicio null', () => {
    const fim = new Date('2026-06-30T23:59:59.000Z');
    const r = resolvePeriodoRange('personalizado', null, fim, now);
    expect(r.inicio).toBeNull();
    expect(r.fim).toEqual(fim);
  });
});
