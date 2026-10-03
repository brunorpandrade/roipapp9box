// ROIP APP 9BOX — testes unit do validador puro de `LogoUploader`
// (ME-B9.2 Bloco B9, débito D-LOGO-UPLOAD).
//
// Cobre canonicamente a função pura `validateLogoFile` + constantes
// canônicas literais exportadas (RV-13).

import { describe, expect, it } from 'vitest';

import {
  LABEL_REMOVER,
  LABEL_UPLOAD,
  LOGO_ACCEPTED_MIME_TYPES,
  LOGO_MAX_SIZE_BYTES,
  MSG_LOGO_MIME_INVALIDO,
  MSG_LOGO_TAMANHO_EXCEDIDO,
  TEXT_SEM_LOGO,
  validateLogoFile,
} from '../../src/components/forms/LogoUploader';

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('LOGO_ACCEPTED_MIME_TYPES — 4 formatos canonicos §13.1', () => {
  it('contem exatamente PNG, JPEG, WebP, SVG', () => {
    expect(LOGO_ACCEPTED_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ]);
  });
});

describe('LOGO_MAX_SIZE_BYTES — cap canonico 300KB', () => {
  it('= 300 * 1024 bytes', () => {
    expect(LOGO_MAX_SIZE_BYTES).toBe(300 * 1024);
  });
});

describe('Mensagens canonicas literais', () => {
  it('MIME invalido', () => {
    expect(MSG_LOGO_MIME_INVALIDO).toBe(
      'Formato de arquivo não suportado. Use PNG, JPEG, WebP ou SVG.',
    );
  });
  it('tamanho excedido', () => {
    expect(MSG_LOGO_TAMANHO_EXCEDIDO).toBe('Arquivo excede o tamanho máximo de 300KB.');
  });
});

describe('Labels canonicos de UI', () => {
  it('botao upload', () => {
    expect(LABEL_UPLOAD).toBe('Escolher arquivo');
  });
  it('botao remover', () => {
    expect(LABEL_REMOVER).toBe('Remover logo');
  });
  it('texto vazio', () => {
    expect(TEXT_SEM_LOGO).toBe('Nenhum logo definido.');
  });
});

describe('validateLogoFile — decisao canonica pura', () => {
  it('PNG dentro do limite → ok', () => {
    const file = makeFile('logo.png', 'image/png', 100 * 1024);
    const r = validateLogoFile(file);
    expect(r.ok).toBe(true);
  });
  it('JPEG dentro do limite → ok', () => {
    const r = validateLogoFile(makeFile('a.jpg', 'image/jpeg', 50 * 1024));
    expect(r.ok).toBe(true);
  });
  it('WebP dentro do limite → ok', () => {
    const r = validateLogoFile(makeFile('a.webp', 'image/webp', 200 * 1024));
    expect(r.ok).toBe(true);
  });
  it('SVG dentro do limite → ok', () => {
    const r = validateLogoFile(makeFile('a.svg', 'image/svg+xml', 10 * 1024));
    expect(r.ok).toBe(true);
  });
  it('GIF → MIME invalido', () => {
    const r = validateLogoFile(makeFile('a.gif', 'image/gif', 10 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_LOGO_MIME_INVALIDO });
  });
  it('PDF → MIME invalido', () => {
    const r = validateLogoFile(makeFile('a.pdf', 'application/pdf', 10 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_LOGO_MIME_INVALIDO });
  });
  it('PNG acima do limite → tamanho excedido', () => {
    const r = validateLogoFile(makeFile('big.png', 'image/png', 400 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_LOGO_TAMANHO_EXCEDIDO });
  });
  it('PNG exatamente no limite → ok', () => {
    const r = validateLogoFile(makeFile('limite.png', 'image/png', 300 * 1024));
    expect(r.ok).toBe(true);
  });
  it('PNG 1 byte acima do limite → tamanho excedido', () => {
    const r = validateLogoFile(makeFile('x.png', 'image/png', 300 * 1024 + 1));
    expect(r.ok).toBe(false);
  });
});
