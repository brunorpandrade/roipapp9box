// ROIP APP 9BOX — teste de integração ME-080d Onda 1b.
//
// Cobre bit-exact o `NotFoundBackButton` client component criado
// para corrigir o bug do CTA outline do 404 §16.2 (era anchor com
// `href="javascript:history.back()"`, bloqueado pelo CSP padrao do
// Next 15 em producao Railway).
//
// Estrategia canonica: como o componente e client-side ('use client'),
// evitamos render via jsdom (dependencia adicional nao presente no
// stack canonico). Testamos:
//
// 1. Constante canonica `NOT_FOUND_BACK_LABEL` bit-exact ao texto
//    do mockup §16.2.
// 2. Alias `NOT_FOUND_CTA_BACK_LABEL` (exportado de not-found.tsx)
//    preservado bit-exact (contrato para testes existentes).
// 3. Smoke: componente exportado e importavel.

import { describe, expect, it } from 'vitest';

import { NotFoundBackButton, NOT_FOUND_BACK_LABEL } from '../../src/app/NotFoundBackButton';
import { NOT_FOUND_CTA_BACK_LABEL } from '../../src/app/not-found';

describe('ME-080d Onda 1b — NotFoundBackButton (fix CSP javascript:)', () => {
  it('NOT_FOUND_BACK_LABEL bit-exact ao mockup §16.2', () => {
    expect(NOT_FOUND_BACK_LABEL).toBe('Voltar');
  });

  it('NOT_FOUND_CTA_BACK_LABEL alias preservado bit-exact', () => {
    expect(NOT_FOUND_CTA_BACK_LABEL).toBe('Voltar');
    expect(NOT_FOUND_CTA_BACK_LABEL).toBe(NOT_FOUND_BACK_LABEL);
  });

  it('NotFoundBackButton exportado e importavel', () => {
    expect(NotFoundBackButton).toBeDefined();
    expect(typeof NotFoundBackButton).toBe('function');
  });
});
