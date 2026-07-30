// ROIP APP 9BOX — tests unit `resolveProfileKey` (ME-056 Bloco B).
//
// Cobre bit-exact as 10 configuracoes canonicas §3.1-§3.10 (DOC 05).
//
// Origem canonica: DOC 05 §3.1-§3.10. §3.10 (colaborador puro) nao
// aparece — colaborador nao emite JWT, portanto `ServerSession` nunca
// reflete essa configuracao (verificado por assercao negativa
// implicita no tipo).

import { describe, it, expect } from 'vitest';

import { resolveProfileKey, type ProfileKeyInput } from '../../src/lib/session/resolveProfileKey';
import type { ServerSession } from '../../src/server/session/serverSession';

// -----------------------------------------------------------------------
// Fabricas de sessao (proximas do canonico DOC 02 §2.2)
// -----------------------------------------------------------------------

function superAdminSession(): ServerSession {
  return {
    kind: 'super_admin',
    superAdminId: 1,
    displayName: 'Bruno Andrade',
  };
}

function platformSession(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): ServerSession {
  return {
    kind: 'platform',
    role,
    userId: 100,
    companyId: 200,
    displayName: 'Fulano de Tal',
    companyDisplayName: 'Empresa Exemplo',
    companyLogoUrl: null,
  };
}

function baseFlags(
  overrides: Partial<Omit<ProfileKeyInput, 'session'>>,
): Omit<ProfileKeyInput, 'session'> {
  return {
    isRH: false,
    isLider: false,
    acessoTotal: false,
    hasDescendingChain: false,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// §3.1 — super_admin_global
// §3.2 — super_admin_in_company
// -----------------------------------------------------------------------

describe('resolveProfileKey — Super Admin (§3.1, §3.2)', () => {
  it('super_admin_global quando isSuperAdminInCompany=false', () => {
    const result = resolveProfileKey({
      session: superAdminSession(),
      ...baseFlags({ isSuperAdminInCompany: false }),
    });
    expect(result).toBe('super_admin_global');
  });

  it('super_admin_in_company quando isSuperAdminInCompany=true', () => {
    const result = resolveProfileKey({
      session: superAdminSession(),
      ...baseFlags({ isSuperAdminInCompany: true }),
    });
    expect(result).toBe('super_admin_in_company');
  });
});

// -----------------------------------------------------------------------
// §3.3 — rh
// -----------------------------------------------------------------------

describe('resolveProfileKey — RH puro (§3.3)', () => {
  it('retorna rh independente de flags cadeia (irrelevantes)', () => {
    const result = resolveProfileKey({
      session: platformSession('rh'),
      ...baseFlags({ isRH: true, hasDescendingChain: false }),
    });
    expect(result).toBe('rh');
  });

  it('retorna rh mesmo se hasDescendingChain=true (nunca deve acontecer canonicamente)', () => {
    // Cenario defensivo: JWT diz "rh", mesmo se a query trouxer sinal
    // inconsistente, respeitamos o role canonico do JWT (§2.2).
    const result = resolveProfileKey({
      session: platformSession('rh'),
      ...baseFlags({ isRH: true, hasDescendingChain: true }),
    });
    expect(result).toBe('rh');
  });
});

// -----------------------------------------------------------------------
// §3.4 — rh_lider_c1
// §3.5 — rh_lider_c2
// -----------------------------------------------------------------------

describe('resolveProfileKey — RH-Líder (§3.4, §3.5)', () => {
  it('rh_lider_c1 quando hasDescendingChain=false', () => {
    const result = resolveProfileKey({
      session: platformSession('rh_lider'),
      ...baseFlags({ isRH: true, isLider: true, hasDescendingChain: false }),
    });
    expect(result).toBe('rh_lider_c1');
  });

  it('rh_lider_c2 quando hasDescendingChain=true', () => {
    const result = resolveProfileKey({
      session: platformSession('rh_lider'),
      ...baseFlags({ isRH: true, isLider: true, hasDescendingChain: true }),
    });
    expect(result).toBe('rh_lider_c2');
  });
});

// -----------------------------------------------------------------------
// §3.6 — lider_c1
// §3.7 — lider_c2
// -----------------------------------------------------------------------

describe('resolveProfileKey — Líder (§3.6, §3.7)', () => {
  it('lider_c1 quando hasDescendingChain=false', () => {
    const result = resolveProfileKey({
      session: platformSession('lider'),
      ...baseFlags({ isLider: true, hasDescendingChain: false }),
    });
    expect(result).toBe('lider_c1');
  });

  it('lider_c2 quando hasDescendingChain=true', () => {
    const result = resolveProfileKey({
      session: platformSession('lider'),
      ...baseFlags({ isLider: true, hasDescendingChain: true }),
    });
    expect(result).toBe('lider_c2');
  });
});

// -----------------------------------------------------------------------
// §3.8 — clevel_full (unico OU multiplo com acessoTotal=true)
// §3.9 — clevel_restricted
// -----------------------------------------------------------------------

describe('resolveProfileKey — C-level (§3.8, §3.9)', () => {
  it('clevel_full quando cLevelCount===1 (unico)', () => {
    const result = resolveProfileKey({
      session: platformSession('clevel'),
      ...baseFlags({ cLevelCount: 1, acessoTotal: false }),
    });
    expect(result).toBe('clevel_full');
  });

  it('clevel_full quando cLevelCount>1 e acessoTotal=true', () => {
    const result = resolveProfileKey({
      session: platformSession('clevel'),
      ...baseFlags({ cLevelCount: 3, acessoTotal: true }),
    });
    expect(result).toBe('clevel_full');
  });

  it('clevel_restricted quando cLevelCount>1 e acessoTotal=false', () => {
    const result = resolveProfileKey({
      session: platformSession('clevel'),
      ...baseFlags({ cLevelCount: 3, acessoTotal: false }),
    });
    expect(result).toBe('clevel_restricted');
  });
});

// -----------------------------------------------------------------------
// Determinismo canonico — mesma entrada → mesma saida
// -----------------------------------------------------------------------

describe('resolveProfileKey — determinismo canonico', () => {
  it('produz saida identica para entradas identicas (10 chamadas)', () => {
    const input: ProfileKeyInput = {
      session: platformSession('rh_lider'),
      ...baseFlags({ isRH: true, isLider: true, hasDescendingChain: true }),
    };
    const results = Array.from({ length: 10 }, () => resolveProfileKey(input));
    for (const r of results) {
      expect(r).toBe('rh_lider_c2');
    }
  });
});
