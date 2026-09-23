// ROIP APP 9BOX — teste unitario da regua pura de escopo do dashboard
// individual (`assertAlvoNoEscopo`). Prova nos dois sentidos (RV-03):
//   - `scope === null` (Bruno, RH, RH-Lider, C-level total/unico) libera
//     qualquer alvo;
//   - escopo restrito libera o alvo na cadeia e NEGA (FORBIDDEN) o alvo fora.

import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { assertAlvoNoEscopo } from '../../src/server/routers/dashboard';

describe('assertAlvoNoEscopo', () => {
  it('scope null libera qualquer alvo (sem PC1h)', () => {
    expect(() => assertAlvoNoEscopo(null, 1)).not.toThrow();
    expect(() => assertAlvoNoEscopo(null, 999)).not.toThrow();
  });

  it('alvo dentro da cadeia -> libera', () => {
    const scope = new Set<string>(['employee-5', 'employee-9', 'employee-12']);
    expect(() => assertAlvoNoEscopo(scope, 5)).not.toThrow();
    expect(() => assertAlvoNoEscopo(scope, 12)).not.toThrow();
  });

  it('alvo fora da cadeia -> FORBIDDEN', () => {
    const scope = new Set<string>(['employee-5', 'employee-9']);
    expect(() => assertAlvoNoEscopo(scope, 7)).toThrow(TRPCError);
    try {
      assertAlvoNoEscopo(scope, 7);
      expect.unreachable('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('escopo vazio nega qualquer alvo (C-level restrito sem cadeia)', () => {
    const scope = new Set<string>();
    expect(() => assertAlvoNoEscopo(scope, 1)).toThrow(TRPCError);
  });
});
