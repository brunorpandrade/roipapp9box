// ROIP APP 9BOX — teste unit ME-1.15.a (Conversa 4b, Despacho B — D-B6).
//
// Regua RV-03 dirigida a `truncateCorpoDialogo` — funcao pura canonica
// que trunca o corpo de dialogos de desenvolvimento enviados ao motor IA.
//
// Injecao canonica RV-03: trocar `<= maxChars` por `< maxChars` no guard
// → o teste "corpo exatamente no limite nao e truncado" reprova.

import { describe, expect, it } from 'vitest';

import {
  DIALOGO_CORPO_MAX_CHARS,
  DIALOGO_CORPO_SUFIXO_TRUNCADO,
  truncateCorpoDialogo,
} from '../../src/server/services/_shared/dashboardIndividualContext';

describe('ME-1.15.a — truncateCorpoDialogo', () => {
  it('corpo null → null', () => {
    expect(truncateCorpoDialogo(null)).toBeNull();
  });

  it('corpo curto → inalterado', () => {
    expect(truncateCorpoDialogo('curto')).toBe('curto');
  });

  it('corpo exatamente no limite nao e truncado', () => {
    const texto = 'a'.repeat(DIALOGO_CORPO_MAX_CHARS);
    expect(truncateCorpoDialogo(texto)).toBe(texto);
  });

  it('corpo acima do limite → truncado com sufixo canonico', () => {
    const texto = 'a'.repeat(DIALOGO_CORPO_MAX_CHARS + 10);
    const r = truncateCorpoDialogo(texto);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(DIALOGO_CORPO_MAX_CHARS);
    expect(r!.endsWith(DIALOGO_CORPO_SUFIXO_TRUNCADO)).toBe(true);
  });

  it('respeita cap custom quando informado', () => {
    const r = truncateCorpoDialogo('a'.repeat(100), 20);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(20);
    expect(r!.endsWith(DIALOGO_CORPO_SUFIXO_TRUNCADO)).toBe(true);
  });
});
