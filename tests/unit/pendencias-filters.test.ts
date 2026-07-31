// ROIP APP 9BOX — testes unit dos filters canonicos de
// `/pendencias-portal` (ME-058 §14.23).
//
// Cobertura canonica:
// - parsePendenciasFilters com URLSearchParams e Record.
// - Normalizacao de busca (min/max len, trim).
// - Guardas de enum (departamento, instrumento, status).
// - Normalizacao de lider id (numerico, positivo, int).
// - Normalizacao de cicloReferencia.
// - CANONICAL_PENDENCIAS_DEFAULT_FILTERS bit-exact.
// - isDefaultFilters.

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
  SEARCH_MAX_LEN,
  SEARCH_MIN_LEN,
  isDefaultFilters,
  normalizeSearchTerm,
  parsePendenciasFilters,
} from '../../src/app/pendencias-portal/filters';

describe('normalizeSearchTerm — normalizacao canonica da busca §14.23 filtro 1', () => {
  it('null → null', () => {
    expect(normalizeSearchTerm(null)).toBe(null);
  });

  it('undefined → null', () => {
    expect(normalizeSearchTerm(undefined)).toBe(null);
  });

  it('string vazia → null', () => {
    expect(normalizeSearchTerm('')).toBe(null);
  });

  it('apenas espacos → null (trim)', () => {
    expect(normalizeSearchTerm('   ')).toBe(null);
  });

  it('menos de SEARCH_MIN_LEN → null', () => {
    expect(normalizeSearchTerm('a')).toBe(null);
  });

  it('exatamente SEARCH_MIN_LEN → preservado (trim)', () => {
    expect(normalizeSearchTerm('ab')).toBe('ab');
  });

  it('trim aplicado antes de min check', () => {
    expect(normalizeSearchTerm('  ab  ')).toBe('ab');
  });

  it('maior que SEARCH_MAX_LEN → truncado', () => {
    const longo = 'a'.repeat(SEARCH_MAX_LEN + 50);
    const resultado = normalizeSearchTerm(longo);
    expect(resultado).not.toBe(null);
    expect(resultado?.length).toBe(SEARCH_MAX_LEN);
  });

  it('case preservado (LIKE do MySQL e case-insensitive por collation)', () => {
    expect(normalizeSearchTerm('João Silva')).toBe('João Silva');
  });
});

describe('CANONICAL_PENDENCIAS_DEFAULT_FILTERS — bit-exact', () => {
  it('todos os 6 campos sao null', () => {
    expect(CANONICAL_PENDENCIAS_DEFAULT_FILTERS).toEqual({
      q: null,
      departamento: null,
      liderDiretoId: null,
      instrumento: null,
      status: null,
      cicloReferencia: null,
    });
  });

  it('objeto e Object.freeze', () => {
    expect(Object.isFrozen(CANONICAL_PENDENCIAS_DEFAULT_FILTERS)).toBe(true);
  });
});

describe('isDefaultFilters — predicado canonico', () => {
  it('default → true', () => {
    expect(isDefaultFilters(CANONICAL_PENDENCIAS_DEFAULT_FILTERS)).toBe(true);
  });

  it('qualquer campo nao-null → false', () => {
    expect(isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, q: 'joao' })).toBe(false);
    expect(
      isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, departamento: 'Financeiro' }),
    ).toBe(false);
    expect(isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, liderDiretoId: 42 })).toBe(
      false,
    );
    expect(
      isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, instrumento: 'meuPerfil' }),
    ).toBe(false);
    expect(isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, status: 'Pendente' })).toBe(
      false,
    );
    expect(
      isDefaultFilters({ ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, cicloReferencia: '2026-T1' }),
    ).toBe(false);
  });
});

describe('parsePendenciasFilters — URLSearchParams', () => {
  it('vazio → default', () => {
    const filters = parsePendenciasFilters(new URLSearchParams());
    expect(filters).toEqual(CANONICAL_PENDENCIAS_DEFAULT_FILTERS);
  });

  it('todos os 6 filtros validos', () => {
    const params = new URLSearchParams({
      q: 'joao',
      departamento: 'Financeiro',
      lider: '42',
      instrumento: 'meuPerfil',
      status: 'Pendente',
      ciclo: '2026-T1',
    });
    const filters = parsePendenciasFilters(params);
    expect(filters.q).toBe('joao');
    expect(filters.departamento).toBe('Financeiro');
    expect(filters.liderDiretoId).toBe(42);
    expect(filters.instrumento).toBe('meuPerfil');
    expect(filters.status).toBe('Pendente');
    expect(filters.cicloReferencia).toBe('2026-T1');
  });

  it('departamento invalido → null (silencioso)', () => {
    const params = new URLSearchParams({ departamento: 'InvalidoNaoCanonico' });
    expect(parsePendenciasFilters(params).departamento).toBe(null);
  });

  it('instrumento invalido → null', () => {
    const params = new URLSearchParams({ instrumento: 'radar' });
    expect(parsePendenciasFilters(params).instrumento).toBe(null);
  });

  it('status invalido → null', () => {
    const params = new URLSearchParams({ status: 'Concluida' });
    expect(parsePendenciasFilters(params).status).toBe(null);
  });

  it('lider negativo → null', () => {
    const params = new URLSearchParams({ lider: '-5' });
    expect(parsePendenciasFilters(params).liderDiretoId).toBe(null);
  });

  it('lider zero → null', () => {
    const params = new URLSearchParams({ lider: '0' });
    expect(parsePendenciasFilters(params).liderDiretoId).toBe(null);
  });

  it('lider NaN → null', () => {
    const params = new URLSearchParams({ lider: 'abc' });
    expect(parsePendenciasFilters(params).liderDiretoId).toBe(null);
  });

  it('lider float → truncado para int', () => {
    const params = new URLSearchParams({ lider: '42.7' });
    expect(parsePendenciasFilters(params).liderDiretoId).toBe(42);
  });

  it('ciclo com mais de 20 chars → null', () => {
    const params = new URLSearchParams({
      ciclo: '2026-T1-EXTRA-LONGO-DEMAIS-BATE-VARCHAR20',
    });
    expect(parsePendenciasFilters(params).cicloReferencia).toBe(null);
  });

  it('busca com menos de MIN_LEN → null', () => {
    const params = new URLSearchParams({ q: 'a' });
    expect(parsePendenciasFilters(params).q).toBe(null);
  });
});

describe('parsePendenciasFilters — Record plano (FormData convertido)', () => {
  it('objeto vazio → default', () => {
    expect(parsePendenciasFilters({})).toEqual(CANONICAL_PENDENCIAS_DEFAULT_FILTERS);
  });

  it('objeto com valores validos', () => {
    const filters = parsePendenciasFilters({
      q: 'silva',
      departamento: 'Marketing',
      lider: '7',
      instrumento: 'radarNR1',
      status: 'Atrasado',
      ciclo: '2025-T4',
    });
    expect(filters.q).toBe('silva');
    expect(filters.departamento).toBe('Marketing');
    expect(filters.liderDiretoId).toBe(7);
    expect(filters.instrumento).toBe('radarNR1');
    expect(filters.status).toBe('Atrasado');
    expect(filters.cicloReferencia).toBe('2025-T4');
  });

  it('valor array → primeiro elemento', () => {
    const filters = parsePendenciasFilters({
      q: ['primeiro', 'segundo'],
    });
    expect(filters.q).toBe('primeiro');
  });

  it('valor array vazio → null', () => {
    const filters = parsePendenciasFilters({ q: [] });
    expect(filters.q).toBe(null);
  });

  it('undefined nos campos → default preservado', () => {
    const filters = parsePendenciasFilters({
      q: undefined,
      departamento: undefined,
    });
    expect(filters.q).toBe(null);
    expect(filters.departamento).toBe(null);
  });
});

describe('parsePendenciasFilters — mistura valida + invalida', () => {
  it('valores validos preservados, invalidos viram null', () => {
    const params = new URLSearchParams({
      q: 'silva',
      departamento: 'InvalidoCanonico',
      lider: 'abc',
      instrumento: 'meuPerfil',
      status: 'x',
      ciclo: '',
    });
    const filters = parsePendenciasFilters(params);
    expect(filters.q).toBe('silva');
    expect(filters.departamento).toBe(null);
    expect(filters.liderDiretoId).toBe(null);
    expect(filters.instrumento).toBe('meuPerfil');
    expect(filters.status).toBe(null);
    expect(filters.cicloReferencia).toBe(null);
  });
});

describe('constantes canonicas de limites', () => {
  it('SEARCH_MIN_LEN = 2', () => {
    expect(SEARCH_MIN_LEN).toBe(2);
  });

  it('SEARCH_MAX_LEN = 100', () => {
    expect(SEARCH_MAX_LEN).toBe(100);
  });
});
