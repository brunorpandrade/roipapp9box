// ROIP APP 9BOX — teste unit ME 3.5 Dispatch 3.
//
// Regua RV-03 dirigida a `parseMenuMode` e `resolveMenuMode` — funcoes
// puras canonicas que decidem qual painel (clevel ou rh) o C-level com
// isRH=true esta operando. Cobre canonicamente:
//
//   1. parseMenuMode reconhece 'clevel' e 'rh' bit-exact.
//   2. parseMenuMode retorna null para cookie ausente/vazio/corrompido.
//   3. resolveMenuMode aplica fallback canonico MENU_MODE_DEFAULT.
//   4. MENU_MODE_COOKIE_NAME e o literal canonico 'roip.menu.mode'.
//
// Injecao canonica RV-03:
//   - Caso bom (esta regua no HEAD): pass.
//   - Defeito injetado (fallback errado, ex: 'rh'): teste "resolveMenuMode
//     retorna 'clevel' para cookie invalido" reprova.

import { describe, expect, it } from 'vitest';

import {
  MENU_MODE_COOKIE_NAME,
  MENU_MODE_DEFAULT,
  parseMenuMode,
  resolveMenuMode,
  type MenuMode,
} from '../../src/lib/menu/menuMode';

// -----------------------------------------------------------------------
// 1) parseMenuMode — enum canonico
// -----------------------------------------------------------------------

describe('ME 3.5 D3 — parseMenuMode reconhece enum canonico', () => {
  it("'clevel' → 'clevel'", () => {
    expect(parseMenuMode('clevel')).toBe('clevel');
  });

  it("'rh' → 'rh'", () => {
    expect(parseMenuMode('rh')).toBe('rh');
  });
});

// -----------------------------------------------------------------------
// 2) parseMenuMode — tolerancia canonica
// -----------------------------------------------------------------------

describe('ME 3.5 D3 — parseMenuMode tolera input invalido', () => {
  it('null → null', () => {
    expect(parseMenuMode(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(parseMenuMode(undefined)).toBeNull();
  });

  it('string vazia → null', () => {
    expect(parseMenuMode('')).toBeNull();
  });

  it('valor desconhecido → null', () => {
    expect(parseMenuMode('super_admin')).toBeNull();
    expect(parseMenuMode('CLEVEL')).toBeNull();
    expect(parseMenuMode('Rh')).toBeNull();
    expect(parseMenuMode('  clevel  ')).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 3) resolveMenuMode — fallback canonico
// -----------------------------------------------------------------------

describe('ME 3.5 D3 — resolveMenuMode aplica MENU_MODE_DEFAULT', () => {
  it("cookie 'clevel' → 'clevel'", () => {
    expect(resolveMenuMode('clevel')).toBe('clevel');
  });

  it("cookie 'rh' → 'rh'", () => {
    expect(resolveMenuMode('rh')).toBe('rh');
  });

  it('cookie null → MENU_MODE_DEFAULT', () => {
    expect(resolveMenuMode(null)).toBe(MENU_MODE_DEFAULT);
  });

  it('cookie undefined → MENU_MODE_DEFAULT', () => {
    expect(resolveMenuMode(undefined)).toBe(MENU_MODE_DEFAULT);
  });

  it('cookie invalido → MENU_MODE_DEFAULT', () => {
    expect(resolveMenuMode('lider')).toBe(MENU_MODE_DEFAULT);
    expect(resolveMenuMode('')).toBe(MENU_MODE_DEFAULT);
  });
});

// -----------------------------------------------------------------------
// 4) Constantes canonicas (RV-13)
// -----------------------------------------------------------------------

describe('ME 3.5 D3 — constantes canonicas (RV-13)', () => {
  it("MENU_MODE_COOKIE_NAME e literal 'roip.menu.mode'", () => {
    expect(MENU_MODE_COOKIE_NAME).toBe('roip.menu.mode');
  });

  it("MENU_MODE_DEFAULT e 'clevel' (protege contra vazamento de RH em C-level puro)", () => {
    expect(MENU_MODE_DEFAULT).toBe('clevel');
  });

  it("tipo MenuMode e 'clevel' | 'rh'", () => {
    const a: MenuMode = 'clevel';
    const b: MenuMode = 'rh';
    expect([a, b]).toEqual(['clevel', 'rh']);
  });
});
