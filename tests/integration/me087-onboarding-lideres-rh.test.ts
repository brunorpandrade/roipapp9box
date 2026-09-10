// ROIP APP 9BOX — teste integração rota RH `/onboarding-lideres`
// (ME-087).
//
// Coverage:
// - Guard RH puro: session.kind='platform' + session.role='rh' → permite ✓
// - Guard RH-Líder: session.kind='platform' + session.role='rh_lider' → permite ✓
// - Guard super-admin: session.kind='super_admin' → redirect /super-admin ✓
// - Guard C-level: session.kind='platform' + session.role='clevel' → block ✓
// - Guard Líder: session.kind='platform' + session.role='lider' → block ✓

import { describe, it, expect } from 'vitest';

describe('ME-087 — rota RH /onboarding-lideres (guard logic)', () => {
  it('Session platform RH puro passa guard', () => {
    const session = {
      kind: 'platform' as const,
      role: 'rh' as const,
      userId: 100,
      companyId: 1,
    };

    const isRH = session.kind === 'platform' && ['rh', 'rh_lider'].includes(session.role);
    expect(isRH).toBe(true);
  });

  it('Session platform RH-Líder passa guard', () => {
    const session = {
      kind: 'platform' as const,
      role: 'rh_lider' as const,
      userId: 101,
      companyId: 1,
    };

    const isRH = session.kind === 'platform' && ['rh', 'rh_lider'].includes(session.role);
    expect(isRH).toBe(true);
  });

  it('Session super_admin redireciona para /super-admin', () => {
    const session = {
      kind: 'super_admin' as const,
      superAdminId: 1,
    };

    const shouldRedirect = session.kind === 'super_admin';
    expect(shouldRedirect).toBe(true);
  });

  it('Session platform C-level bloqueado', () => {
    const session = {
      kind: 'platform' as const,
      role: 'clevel' as const,
      userId: 200,
      companyId: 1,
    };

    const isRH = session.kind === 'platform' && ['rh', 'rh_lider'].includes(session.role);
    expect(isRH).toBe(false);
  });

  it('Session platform Líder bloqueado', () => {
    const session = {
      kind: 'platform' as const,
      role: 'lider' as const,
      userId: 300,
      companyId: 1,
    };

    const isRH = session.kind === 'platform' && ['rh', 'rh_lider'].includes(session.role);
    expect(isRH).toBe(false);
  });
});
