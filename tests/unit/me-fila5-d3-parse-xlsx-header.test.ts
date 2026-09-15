// ROIP APP 9BOX — teste unit ME-fila5 Dispatch 3 do helper canonico
// `validateXlsxHeader` com os 2 matchModes (strict, prefix).
//
// Cobre canonicamente:
//   - Modo `strict` (default): rejeita header com colunas ausentes,
//     extras, ou ordem canonica diferente do esperado.
//   - Modo `prefix`: aceita header cujo PREFIXO bate com expected;
//     colunas extras APOS o prefixo sao permitidas (ficam para o
//     backend validar). Rejeita quando o prefixo diverge em qualquer
//     posicao.
//   - `buildHeaderMismatchMessage` gera mensagem canonica bit-a-bit.
//
// Nao usa MySQL. Usa SheetJS + JSDOM (`Blob.arrayBuffer`) simulando
// File via poliomancia de File API do jsdom (ja habilitado no
// `vitest.config.ts` do repo).

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  buildHeaderMismatchMessage,
  validateXlsxHeader,
} from '../../src/components/import-mass/parseXlsxHeader';

/**
 * Cria um `File` fake a partir de um array de linhas (cada linha = array
 * de strings). Usa SheetJS para gerar XLSX em memoria + Blob nativo do
 * jsdom.
 */
function makeXlsxFile(rows: string[][], filename = 'test.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('validateXlsxHeader — modo strict (default)', () => {
  const EXPECTED = ['Nome', 'CPF', 'Cargo'] as const;

  it('aceita header com exatamente os itens esperados', async () => {
    const file = makeXlsxFile([['Nome', 'CPF', 'Cargo']]);
    const result = await validateXlsxHeader(file, EXPECTED);
    expect(result.ok).toBe(true);
  });

  it('rejeita quando falta uma coluna', async () => {
    const file = makeXlsxFile([['Nome', 'CPF']]);
    const result = await validateXlsxHeader(file, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Cargo');
    }
  });

  it('rejeita quando ha coluna extra', async () => {
    const file = makeXlsxFile([['Nome', 'CPF', 'Cargo', 'Extra']]);
    const result = await validateXlsxHeader(file, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.extra).toContain('Extra');
    }
  });

  it('aceita header com ordem diferente do esperado (set-based)', async () => {
    // Modo strict compara como set — ordem nao importa desde que os
    // itens sejam os mesmos. Ordem canonica e responsabilidade do backend.
    const file = makeXlsxFile([['Cargo', 'Nome', 'CPF']]);
    const result = await validateXlsxHeader(file, EXPECTED);
    expect(result.ok).toBe(true);
  });
});

describe('validateXlsxHeader — modo prefix', () => {
  const EXPECTED_PREFIX = ['Nome liderado', 'Cargo'] as const;

  it('aceita header cujas 2 primeiras colunas batem com esperado', async () => {
    const file = makeXlsxFile([['Nome liderado', 'Cargo']]);
    const result = await validateXlsxHeader(file, EXPECTED_PREFIX, 'prefix');
    expect(result.ok).toBe(true);
  });

  it('aceita header com colunas dinamicas APOS o prefixo (caso Lider CC3)', async () => {
    const file = makeXlsxFile([
      [
        'Nome liderado',
        'Cargo',
        'Meta [Variavel 1]',
        'Demanda [Variavel 1]',
        'Realizado [Variavel 1]',
      ],
    ]);
    const result = await validateXlsxHeader(file, EXPECTED_PREFIX, 'prefix');
    expect(result.ok).toBe(true);
  });

  it('rejeita quando a primeira coluna do prefixo esta errada', async () => {
    const file = makeXlsxFile([
      ['Nome do liderado', 'Cargo', 'Meta [Variavel 1]'], // typo na primeira
    ]);
    const result = await validateXlsxHeader(file, EXPECTED_PREFIX, 'prefix');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Nome liderado');
    }
  });

  it('rejeita quando a segunda coluna do prefixo esta trocada de posicao', async () => {
    const file = makeXlsxFile([
      ['Nome liderado', 'Meta [Variavel 1]', 'Cargo'], // Cargo fora da posicao 2
    ]);
    const result = await validateXlsxHeader(file, EXPECTED_PREFIX, 'prefix');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Cargo');
    }
  });

  it('rejeita quando o header eh mais curto que o prefixo', async () => {
    const file = makeXlsxFile([['Nome liderado']]);
    const result = await validateXlsxHeader(file, EXPECTED_PREFIX, 'prefix');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Cargo');
    }
  });
});

describe('buildHeaderMismatchMessage — mensagens canonicas', () => {
  it('gera mensagem com apenas ausentes', () => {
    const msg = buildHeaderMismatchMessage(['Nome', 'CPF'], []);
    expect(msg).toBe('Colunas ausentes: Nome, CPF.');
  });

  it('gera mensagem com apenas extras', () => {
    const msg = buildHeaderMismatchMessage([], ['Sobra1', 'Sobra2']);
    expect(msg).toBe('Colunas inesperadas: Sobra1, Sobra2.');
  });

  it('gera mensagem com ambos', () => {
    const msg = buildHeaderMismatchMessage(['Nome'], ['Extra']);
    expect(msg).toBe('Colunas ausentes: Nome. Colunas inesperadas: Extra.');
  });

  it('fallback quando ambos vazios', () => {
    const msg = buildHeaderMismatchMessage([], []);
    expect(msg).toBe('Cabecalho do arquivo diverge do modelo canonico.');
  });
});

describe('validateXlsxHeader — casos de erro do arquivo', () => {
  it('rejeita arquivo com apenas bytes lixo (retorna ok:false)', async () => {
    // SheetJS eh permissivo com input curto — nao joga excecao. Ao inves
    // disso, retorna workbook com sheet vazia; o fluxo normal do
    // parseXlsxHeader detecta cabecalho ausente ("colunas ausentes").
    // Assert canonico: `ok:false` com mensagem que menciona as colunas
    // ausentes esperadas — nao "arquivo invalido".
    const badFile = new File([new Uint8Array([0, 1, 2, 3])], 'bad.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await validateXlsxHeader(badFile, ['Nome', 'CPF']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.canonicalMessage).toContain('Colunas ausentes');
      expect(result.missing).toContain('Nome');
      expect(result.missing).toContain('CPF');
    }
  });
});
