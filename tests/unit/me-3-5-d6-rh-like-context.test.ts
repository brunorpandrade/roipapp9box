// ROIP APP 9BOX — teste unit da funcao pura `decideRhLikeIdentity`
// (ME 3.5 D6). Cobre as 6 combinacoes canonicas de sessao vs flags
// que decidem a identidade RH-like das 6 pages RH-facing (rh, rh_lider,
// clevel+isRH, clevel-sem-isRH, lider, registro deletado).
//
// **RV-13.** Consumidor real de `decideRhLikeIdentity`,
// `RhLikeIdentityInput` (tipo) e do proprio `loadRhLikePageContext`.

import { describe, expect, it } from 'vitest';

import type { CLevelSessionContext } from '../../src/lib/session/cLevelSessionContext';
import {
  decideRhLikeIdentity,
  type RhLikeIdentityInput,
} from '../../src/lib/session/loadRhLikePageContext';
import type { PlatformSession } from '../../src/lib/session/platformMenuContext';
import type { RhSessionFlags } from '../../src/lib/session/rhSessionFlags';

function platformSession(
  role: PlatformSession['role'],
  overrides: Partial<PlatformSession> = {},
): PlatformSession {
  return {
    kind: 'platform',
    role,
    userId: 42,
    companyId: 7,
    ...overrides,
  };
}

function rhFlags(overrides: Partial<RhSessionFlags> = {}): RhSessionFlags {
  return {
    isRH: true,
    isLider: false,
    isResponsavelFinanceiro: false,
    hasDescendingChain: false,
    ...overrides,
  };
}

function cLevelCtx(overrides: Partial<CLevelSessionContext> = {}): CLevelSessionContext {
  return {
    acessoTotal: true,
    isResponsavelFinanceiro: false,
    isRH: true,
    cLevelCount: 1,
    ...overrides,
  };
}

describe('decideRhLikeIdentity — decisao pura ME 3.5 D6', () => {
  it('role=rh com rhFlags carregadas → "rh"', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('rh'),
      rhFlags: rhFlags({ isRH: true }),
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBe('rh');
  });

  it('role=rh_lider com rhFlags carregadas (C1) → "rh_lider"', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('rh_lider'),
      rhFlags: rhFlags({ isRH: true, isLider: true, hasDescendingChain: false }),
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBe('rh_lider');
  });

  it('role=rh_lider com rhFlags carregadas (C2) → "rh_lider"', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('rh_lider'),
      rhFlags: rhFlags({ isRH: true, isLider: true, hasDescendingChain: true }),
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBe('rh_lider');
  });

  it('role=clevel + cLevelMembers.isRH=true → "clevel_as_rh"', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('clevel'),
      rhFlags: null,
      cLevelCtx: cLevelCtx({ isRH: true }),
    };
    expect(decideRhLikeIdentity(input)).toBe('clevel_as_rh');
  });

  it('role=clevel + cLevelMembers.isRH=false → null', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('clevel'),
      rhFlags: null,
      cLevelCtx: cLevelCtx({ isRH: false }),
    };
    expect(decideRhLikeIdentity(input)).toBeNull();
  });

  it('role=clevel + cLevelCtx null (registro deletado) → null', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('clevel'),
      rhFlags: null,
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBeNull();
  });

  it('role=lider (qualquer flag) → null', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('lider'),
      rhFlags: rhFlags({ isRH: false, isLider: true }),
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBeNull();
  });

  it('role=rh com rhFlags null (registro deletado) → null', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('rh'),
      rhFlags: null,
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBeNull();
  });

  it('role=rh_lider com rhFlags null → null', () => {
    const input: RhLikeIdentityInput = {
      session: platformSession('rh_lider'),
      rhFlags: null,
      cLevelCtx: null,
    };
    expect(decideRhLikeIdentity(input)).toBeNull();
  });
});
