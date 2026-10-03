// ROIP APP 9BOX — testes unit do validador puro de `ImageUploader`
// (ME-B9.3 Bloco B9).
//
// Cobre canonicamente a função pura `validateImageFile` + constantes
// canônicas literais exportadas (RV-13). Substitui bit-exact a cobertura
// anterior de `LogoUploader` (ME-B9.2) após o rename canônico L125/RV-14.

import { describe, expect, it } from 'vitest';

import {
  HINT_DEFAULT,
  IMAGE_ACCEPTED_MIME_TYPES,
  IMAGE_MAX_SIZE_BYTES,
  LABEL_REMOVER_DEFAULT,
  LABEL_UPLOAD,
  MSG_IMAGE_MIME_INVALIDO,
  MSG_IMAGE_TAMANHO_EXCEDIDO,
  TEXT_SEM_IMAGEM_DEFAULT,
  validateImageFile,
} from '../../src/components/forms/ImageUploader';

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('IMAGE_ACCEPTED_MIME_TYPES — 4 formatos canonicos §13.1', () => {
  it('contem exatamente PNG, JPEG, WebP, SVG', () => {
    expect(IMAGE_ACCEPTED_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ]);
  });
});

describe('IMAGE_MAX_SIZE_BYTES — cap canonico 300KB', () => {
  it('= 300 * 1024 bytes', () => {
    expect(IMAGE_MAX_SIZE_BYTES).toBe(300 * 1024);
  });
});

describe('Mensagens canonicas literais', () => {
  it('MIME invalido', () => {
    expect(MSG_IMAGE_MIME_INVALIDO).toBe(
      'Formato de arquivo não suportado. Use PNG, JPEG, WebP ou SVG.',
    );
  });
  it('tamanho excedido', () => {
    expect(MSG_IMAGE_TAMANHO_EXCEDIDO).toBe('Arquivo excede o tamanho máximo de 300KB.');
  });
});

describe('Labels e textos default canonicos', () => {
  it('botao upload', () => {
    expect(LABEL_UPLOAD).toBe('Escolher arquivo');
  });
  it('botao remover default', () => {
    expect(LABEL_REMOVER_DEFAULT).toBe('Remover');
  });
  it('texto vazio default', () => {
    expect(TEXT_SEM_IMAGEM_DEFAULT).toBe('Nenhuma imagem definida.');
  });
  it('hint default', () => {
    expect(HINT_DEFAULT).toBe('PNG, JPEG, WebP ou SVG. Máximo 300KB.');
  });
});

describe('validateImageFile — decisao canonica pura', () => {
  it('PNG dentro do limite → ok', () => {
    const file = makeFile('logo.png', 'image/png', 100 * 1024);
    const r = validateImageFile(file);
    expect(r.ok).toBe(true);
  });
  it('JPEG dentro do limite → ok', () => {
    const r = validateImageFile(makeFile('a.jpg', 'image/jpeg', 50 * 1024));
    expect(r.ok).toBe(true);
  });
  it('WebP dentro do limite → ok', () => {
    const r = validateImageFile(makeFile('a.webp', 'image/webp', 200 * 1024));
    expect(r.ok).toBe(true);
  });
  it('SVG dentro do limite → ok', () => {
    const r = validateImageFile(makeFile('a.svg', 'image/svg+xml', 10 * 1024));
    expect(r.ok).toBe(true);
  });
  it('GIF → MIME invalido', () => {
    const r = validateImageFile(makeFile('a.gif', 'image/gif', 10 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_IMAGE_MIME_INVALIDO });
  });
  it('PDF → MIME invalido', () => {
    const r = validateImageFile(makeFile('a.pdf', 'application/pdf', 10 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_IMAGE_MIME_INVALIDO });
  });
  it('PNG acima do limite → tamanho excedido', () => {
    const r = validateImageFile(makeFile('big.png', 'image/png', 400 * 1024));
    expect(r).toEqual({ ok: false, error: MSG_IMAGE_TAMANHO_EXCEDIDO });
  });
  it('PNG exatamente no limite → ok', () => {
    const r = validateImageFile(makeFile('limite.png', 'image/png', 300 * 1024));
    expect(r.ok).toBe(true);
  });
  it('PNG 1 byte acima do limite → tamanho excedido', () => {
    const r = validateImageFile(makeFile('x.png', 'image/png', 300 * 1024 + 1));
    expect(r.ok).toBe(false);
  });
});
