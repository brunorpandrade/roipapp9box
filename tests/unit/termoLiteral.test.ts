// ROIP APP 9BOX — teste unit canonico `src/lib/lgpd/termoLiteral.ts`
// (ME-1.12.c Despacho A, item [1.12.c] do roadmap V4; estendido
// ME-1.12.d — texto literal V1.0 substituido pelo termo juridico
// estruturado definitivo, com HTML + plain-text + resumo canonico).

import { describe, expect, it } from 'vitest';

import {
  TERMO_LITERAL_HTML_POR_VERSAO,
  TERMO_LITERAL_POR_VERSAO,
  TERMO_LITERAL_V10,
  TERMO_LITERAL_V10_HTML,
  TERMO_RESUMO_POR_VERSAO,
  TERMO_RESUMO_V10,
  getTermoLiteral,
  getTermoLiteralHtml,
  getTermoResumo,
} from '../../src/lib/lgpd/termoLiteral';

describe('termoLiteral — getters canonicos (plain-text)', () => {
  it('retorna o texto literal canonico v1.0 bit-exact', () => {
    const texto = getTermoLiteral('1.0');
    expect(texto).toBe(TERMO_LITERAL_V10);
    expect(texto).toContain('ROIPeople — Plataforma de gestão de pessoas e desempenho');
    expect(texto).toContain('Versão 1.0 — vigente a partir de 18 de outubro de 2026');
    expect(texto).toContain('14. Registro de aceite');
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
    expect(resumo).toContain('operadora');
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

describe('termoLiteral — getter canonico HTML (ME-1.12.d)', () => {
  it('retorna o HTML estruturado canonico v1.0 bit-exact', () => {
    const html = getTermoLiteralHtml('1.0');
    expect(html).toBe(TERMO_LITERAL_V10_HTML);
    expect(html).toContain('<h4>Termo de ciência e política de privacidade</h4>');
    expect(html).toContain('<h4>1. Quem é controlador e quem é operador</h4>');
    expect(html).toContain('<h4>14. Registro de aceite</h4>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('<strong>');
  });

  it('retorna null para versao desconhecida', () => {
    expect(getTermoLiteralHtml('99.9')).toBeNull();
    expect(getTermoLiteralHtml('')).toBeNull();
  });

  it('mapa HTML cobre exatamente o mesmo conjunto de versoes dos outros mapas', () => {
    const htmlKeys = Object.keys(TERMO_LITERAL_HTML_POR_VERSAO).sort();
    const literalKeys = Object.keys(TERMO_LITERAL_POR_VERSAO).sort();
    expect(htmlKeys).toEqual(literalKeys);
  });

  it('HTML estruturado tem as 13 secoes canonicas numeradas', () => {
    const html = getTermoLiteralHtml('1.0');
    expect(html).not.toBeNull();
    if (html === null) return;
    for (let i = 1; i <= 14; i += 1) {
      expect(html).toContain(`<h4>${i}.`);
    }
  });
});
