// ROIP APP 9BOX — teste unit ME 3.5 Dispatch 2.
//
// Regua RV-03 dirigida a `decideRhAllowed`, funcao pura canonica do guard
// `rhAllowedProcedure`. Cobre a matriz canonica de decisao das 5 roles ×
// clevelIsRH:
//
//   - super_admin → allow (ignora clevelIsRH)
//   - rh → allow
//   - rh_lider → allow
//   - clevel + isRH=true → allow (ME 3.5 D2, novidade)
//   - clevel + isRH=false → forbid
//   - clevel + isRH=null → forbid (registro ausente = sessao invalida)
//   - lider → forbid (mesmo se clevelIsRH true, que nao aplica)
//
// Injecao canonica RV-03 (prova bilateral em CI):
//   - Caso bom (esta regua no HEAD): 8/8 pass.
//   - Defeito injetado (remover branch clevel do decideRhAllowed): teste
//     "clevel + isRH=true e allow" reprova.
//   - Defeito injetado (allow para lider): teste "lider e forbid"
//     reprova.

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  decideRhAllowed,
  MSG_RH_ALLOWED_FORBIDDEN,
  type RhAllowedDecision,
} from '../../src/server/auth/rhAllowedProcedure';
import type { AuthenticatedUser } from '../../src/server/trpc';

const SUPER_ADMIN: AuthenticatedUser = {
  role: 'super_admin',
  superAdminId: 1,
};

function platformUser(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): AuthenticatedUser {
  return {
    role,
    userId: 42,
    companyId: 1,
  };
}

// -----------------------------------------------------------------------
// 1) super_admin
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — decideRhAllowed(super_admin, *)', () => {
  it('allow com clevelIsRH=null', () => {
    expect(decideRhAllowed(SUPER_ADMIN, null)).toBe('allow');
  });

  it('allow com clevelIsRH=false (parametro ignorado)', () => {
    expect(decideRhAllowed(SUPER_ADMIN, false)).toBe('allow');
  });
});

// -----------------------------------------------------------------------
// 2) rh / rh_lider — comportamento historico preservado
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — decideRhAllowed(rh|rh_lider, *) preserva historico', () => {
  it('rh e allow com clevelIsRH=null', () => {
    expect(decideRhAllowed(platformUser('rh'), null)).toBe('allow');
  });

  it('rh_lider e allow com clevelIsRH=null', () => {
    expect(decideRhAllowed(platformUser('rh_lider'), null)).toBe('allow');
  });
});

// -----------------------------------------------------------------------
// 3) clevel — matriz canonica da ME 3.5 D2 (nova)
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — decideRhAllowed(clevel, clevelIsRH) — matriz canonica', () => {
  it('clevel + isRH=true e allow (ME 3.5 D2)', () => {
    expect(decideRhAllowed(platformUser('clevel'), true)).toBe('allow');
  });

  it('clevel + isRH=false e forbid', () => {
    expect(decideRhAllowed(platformUser('clevel'), false)).toBe('forbid');
  });

  it('clevel + isRH=null (registro ausente) e forbid', () => {
    expect(decideRhAllowed(platformUser('clevel'), null)).toBe('forbid');
  });
});

// -----------------------------------------------------------------------
// 4) lider — bloqueado sempre
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — decideRhAllowed(lider, *) e sempre forbid', () => {
  it('lider e forbid mesmo se clevelIsRH=true (parametro nao se aplica)', () => {
    expect(decideRhAllowed(platformUser('lider'), true)).toBe('forbid');
  });

  it('lider e forbid com clevelIsRH=null', () => {
    expect(decideRhAllowed(platformUser('lider'), null)).toBe('forbid');
  });
});

// -----------------------------------------------------------------------
// 5) Contrato de mensagem canonica
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — MSG_RH_ALLOWED_FORBIDDEN (RV-13)', () => {
  it('mensagem literal esperada', () => {
    expect(MSG_RH_ALLOWED_FORBIDDEN).toBe('Perfil sem permissao para a rota.');
  });
});

// -----------------------------------------------------------------------
// 6) Contrato de tipo canonico (RV-13)
// -----------------------------------------------------------------------

describe('ME 3.5 D2 — RhAllowedDecision (RV-13)', () => {
  it("tipo canonico e 'allow' | 'forbid'", () => {
    expectTypeOf<RhAllowedDecision>().toEqualTypeOf<'allow' | 'forbid'>();
  });

  it('retorno de decideRhAllowed casa com RhAllowedDecision', () => {
    const d: RhAllowedDecision = decideRhAllowed(SUPER_ADMIN, null);
    expect(d).toBe('allow');
  });
});
