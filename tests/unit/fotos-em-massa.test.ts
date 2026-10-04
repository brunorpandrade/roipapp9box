// ROIP APP 9BOX — testes unit canonicos do `FotosEmMassaModal`
// (ME-B9.3 Fase B).
//
// Cobre canonicamente os helpers puros exportados (`extractCpfFromFilename`,
// `validateFotoFile`) + constantes canonicas literais (RV-13).

import { describe, expect, it } from 'vitest';

import {
  MAX_FOTOS_PER_UPLOAD,
  MSG_CAP_EXCEDIDO,
  MSG_CPF_INVALIDO,
  extractCpfFromFilename,
  validateFotoFile,
} from '../../src/components/import-mass/FotosEmMassaModal';

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('extractCpfFromFilename — matching canonico por CPF', () => {
  it('CPF puro 11 digitos + extensao', () => {
    expect(extractCpfFromFilename('12345678900.png')).toBe('12345678900');
  });

  it('CPF formatado 123.456.789-00 + extensao', () => {
    expect(extractCpfFromFilename('123.456.789-00.jpg')).toBe('12345678900');
  });

  it('CPF formatado com espacos', () => {
    expect(extractCpfFromFilename('123 456 789 00.webp')).toBe('12345678900');
  });

  it('nome sem CPF - letras', () => {
    expect(extractCpfFromFilename('acacio-leal.png')).toBeNull();
  });

  it('nome com menos de 11 digitos', () => {
    expect(extractCpfFromFilename('1234567890.png')).toBeNull();
  });

  it('nome com mais de 11 digitos', () => {
    expect(extractCpfFromFilename('123456789001.png')).toBeNull();
  });

  it('arquivo sem extensao', () => {
    expect(extractCpfFromFilename('12345678900')).toBe('12345678900');
  });

  it('arquivo com extensao SVG', () => {
    expect(extractCpfFromFilename('98765432100.svg')).toBe('98765432100');
  });

  it('arquivo com extensao composta — pega apenas o ultimo ponto', () => {
    expect(extractCpfFromFilename('98765432100.old.png')).toBe('98765432100');
  });
});

describe('validateFotoFile — mesma logica canonica do ImageUploader', () => {
  it('PNG dentro do limite -> ok', () => {
    const r = validateFotoFile(makeFile('12345678900.png', 'image/png', 100 * 1024));
    expect(r.ok).toBe(true);
  });

  it('JPEG dentro do limite -> ok', () => {
    const r = validateFotoFile(makeFile('12345678900.jpg', 'image/jpeg', 50 * 1024));
    expect(r.ok).toBe(true);
  });

  it('GIF -> MIME invalido', () => {
    const r = validateFotoFile(makeFile('12345678900.gif', 'image/gif', 10 * 1024));
    expect(r.ok).toBe(false);
  });

  it('PDF -> MIME invalido', () => {
    const r = validateFotoFile(makeFile('12345678900.pdf', 'application/pdf', 10 * 1024));
    expect(r.ok).toBe(false);
  });

  it('PNG acima do limite 300KB -> tamanho excedido', () => {
    const r = validateFotoFile(makeFile('12345678900.png', 'image/png', 400 * 1024));
    expect(r.ok).toBe(false);
  });

  it('PNG exatamente no limite 300KB -> ok', () => {
    const r = validateFotoFile(makeFile('12345678900.png', 'image/png', 300 * 1024));
    expect(r.ok).toBe(true);
  });
});

describe('Constantes canonicas literais', () => {
  it('MAX_FOTOS_PER_UPLOAD = 100', () => {
    expect(MAX_FOTOS_PER_UPLOAD).toBe(100);
  });

  it('MSG_CAP_EXCEDIDO literal', () => {
    expect(MSG_CAP_EXCEDIDO).toBe('Maximo de 100 arquivos por envio. Divida em lotes menores.');
  });

  it('MSG_CPF_INVALIDO literal', () => {
    expect(MSG_CPF_INVALIDO).toBe(
      'Nome do arquivo deve conter o CPF do colaborador (ex.: 12345678900.png).',
    );
  });
});
