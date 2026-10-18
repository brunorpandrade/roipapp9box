// ROIP APP 9BOX — teste unit canonico `src/lib/lgpd/termoLiteral.ts`
// (ME-1.12.c Despacho A, item [1.12.c] do roadmap V4).

import { describe, expect, it } from 'vitest';

import {
  TERMO_LITERAL_POR_VERSAO,
  TERMO_LITERAL_V10,
  TERMO_RESUMO_POR_VERSAO,
  TERMO_RESUMO_V10,
  getTermoLiteral,
  getTermoResumo,
} from '../../src/lib/lgpd/termoLiteral';

describe('termoLiteral — getters canonicos', () => {
  it('retorna o texto literal canonico v1.0 bit-exact', () => {
    const texto = getTermoLiteral('1.0');
    expect(texto).toBe(TERMO_LITERAL_V10);
    expect(texto).toContain('direitos previstos na lei');
    expect(texto).toContain('LGPD');
  });

  it('retorna o resumo curto canonico v1.0 bit-exact', () => {
    const resumo = getTermoResumo('1.0');
    expect(resumo).toBe(TERMO_RESUMO_V10);
    expect(resumo).not.toBeNull();
    if (resumo !== null) {
      expect(resumo.length).toBeLessThan(TERMO_LITERAL_V10.length);
    }
    expect(resumo).toContain('LGPD');
  });

  it('retorna null para versao desconhecida (literal)', () => {
    expect(getTermoLiteral('99.9')).toBeNull();
    expect(getTermoLiteral('')).toBeNull();
  });

  it('retorna null para versao desconhecida (resumo)', () => {
    expect(getTermoResumo('99.9')).toBeNull();
    expect(getTermoResumo('')).toBeNull();
  });

  it('mapa literal e resumo cobrem exatamente o mesmo conjunto de versoes', () => {
    const literalKeys = Object.keys(TERMO_LITERAL_POR_VERSAO).sort();
    const resumoKeys = Object.keys(TERMO_RESUMO_POR_VERSAO).sort();
    expect(resumoKeys).toEqual(literalKeys);
  });
});
