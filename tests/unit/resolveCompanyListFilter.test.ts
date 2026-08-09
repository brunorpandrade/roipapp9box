// ROIP APP 9BOX — teste unit `resolveCompanyListFilter` (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact:
// - undefined → DEFAULT_COMPANY_LIST_FILTER ('active').
// - 'active' → 'active'.
// - 'all' → 'all'.
// - 'inactive' → 'inactive'.
// - string invalido → DEFAULT ('active') — fallback canonico bit-exact seguro.
// - array com primeiro valor canonico → mesmo valor.
// - array vazio → DEFAULT.
// - array com primeiro valor invalido → DEFAULT.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPANY_LIST_FILTER,
  resolveCompanyListFilter,
} from '../../src/lib/company/resolveCompanyListFilter';

describe('resolveCompanyListFilter — helper puro §5.3 (ME-Rota-C-D075)', () => {
  it('DEFAULT_COMPANY_LIST_FILTER = "active"', () => {
    expect(DEFAULT_COMPANY_LIST_FILTER).toBe('active');
  });

  it('undefined → "active"', () => {
    expect(resolveCompanyListFilter(undefined)).toBe('active');
  });

  it('"active" → "active"', () => {
    expect(resolveCompanyListFilter('active')).toBe('active');
  });

  it('"all" → "all"', () => {
    expect(resolveCompanyListFilter('all')).toBe('all');
  });

  it('"inactive" → "inactive"', () => {
    expect(resolveCompanyListFilter('inactive')).toBe('inactive');
  });

  it('string invalido → "active"', () => {
    expect(resolveCompanyListFilter('foo')).toBe('active');
    expect(resolveCompanyListFilter('')).toBe('active');
    expect(resolveCompanyListFilter('ATIVA')).toBe('active');
  });

  it('array com primeiro valor canonico → mesmo valor', () => {
    expect(resolveCompanyListFilter(['inactive', 'active'])).toBe('inactive');
    expect(resolveCompanyListFilter(['all'])).toBe('all');
  });

  it('array vazio → "active"', () => {
    expect(resolveCompanyListFilter([])).toBe('active');
  });

  it('array com primeiro valor invalido → "active"', () => {
    expect(resolveCompanyListFilter(['foo', 'inactive'])).toBe('active');
  });
});
