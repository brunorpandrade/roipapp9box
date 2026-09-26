// ROIP APP 9BOX — teste unit do normalizador de busca compartilhado
// (ME-fila lupa + autocomplete). Prova RV-13: `normalizeForSearch` nasce
// com chamador real (OrganogramaClient + ColaboradorSearchBox) e teste na
// mesma ME. Funcao pura, sem banco — projeto `unit`.

import { describe, expect, it } from 'vitest';

import { normalizeForSearch } from '../../src/lib/text/normalizeForSearch';

describe('normalizeForSearch', () => {
  it('converte para minusculas', () => {
    expect(normalizeForSearch('JOSE')).toBe('jose');
  });

  it('remove acentos (NFD + strip de diacriticos)', () => {
    expect(normalizeForSearch('José')).toBe('jose');
  });

  it('remove cedilha e til combinados', () => {
    expect(normalizeForSearch('Conceição')).toBe('conceicao');
  });

  it('e idempotente para texto ja normalizado', () => {
    expect(normalizeForSearch('ana paula')).toBe('ana paula');
  });

  it('preserva espacos e pontuacao comum (virgula, hifen)', () => {
    expect(normalizeForSearch('Ávila, Gerente-Geral')).toBe('avila, gerente-geral');
  });

  it('string vazia normaliza para vazio', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
