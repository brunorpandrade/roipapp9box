// ROIP APP 9BOX — teste unit ME-B9-fechamento.
// Cobre helpers puros novos + reforco documental da matriz de acesso:
// (1) `parseCompanyIdParam` da rota `/super-admin/empresa/[id]/painel-
//     rh-preview` (D-ME083-D-RH-IMPERSONATION-PAINEL-RH ENCERRADO).
// (2) `findRouteRule` canonico bit-a-bit para `/nr1` e
//     `/onboarding-lideres` — reforco documental do
//     D-ME088-CENARIO-COLABORADOR-DIFERIDO (validacao empirica de
//     colaborador puro em produção diferida por infra de login;
//     cobertura via matriz canonica cobre bit-a-bit os 5 roles
//     platform+super_admin).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @stylistic/max-len -- path canonico da rota nova ME-B9-fechamento
import { parseCompanyIdParam } from '../../src/app/super-admin/empresa/[id]/painel-rh-preview/internals';
import { findRouteRule } from '../../src/lib/routes/matrix';

describe('ME-B9-fechamento — parseCompanyIdParam', () => {
  it('aceita inteiro positivo canonico', () => {
    expect(parseCompanyIdParam('1')).toBe(1);
    expect(parseCompanyIdParam('42')).toBe(42);
    expect(parseCompanyIdParam('999999')).toBe(999999);
  });

  it('rejeita zero', () => {
    expect(parseCompanyIdParam('0')).toBe(null);
  });

  it('rejeita negativo', () => {
    expect(parseCompanyIdParam('-1')).toBe(null);
  });

  it('rejeita string nao-numerica', () => {
    expect(parseCompanyIdParam('abc')).toBe(null);
  });

  it('rejeita string vazia', () => {
    expect(parseCompanyIdParam('')).toBe(null);
  });
});

describe(
  'ME-B9-fechamento — matriz /nr1 e /onboarding-lideres ' +
    '(D-ME088-CENARIO-COLABORADOR-DIFERIDO)',
  () => {
    it('/nr1 canonicamente allow para super_admin, rh, rh_lider; deny para clevel, lider', () => {
      const rule = findRouteRule('/nr1');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      expect(rule.byRole.super_admin).toBe('allow');
      expect(rule.byRole.rh).toBe('allow');
      expect(rule.byRole.rh_lider).toBe('allow');
      expect(rule.byRole.clevel).toBe('deny');
      expect(rule.byRole.lider).toBe('deny');
    });

    it('/onboarding-lideres canonicamente allow para super_admin+rh+rh_lider; deny outros', () => {
      const rule = findRouteRule('/onboarding-lideres');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      expect(rule.byRole.super_admin).toBe('allow');
      expect(rule.byRole.rh).toBe('allow');
      expect(rule.byRole.rh_lider).toBe('allow');
      expect(rule.byRole.clevel).toBe('deny');
      expect(rule.byRole.lider).toBe('deny');
    });

    it('colaborador puro nao aparece na matriz (nao tem role platform)', () => {
      // Colaborador puro autentica-se APENAS via /colaborador (S037);
      // nao ha PlatformRole 'colab'. Middleware bloqueia por ausencia
      // de cookie `session` (S038 passo 2) → redirect canonico para
      // `/`. Este teste documenta o contrato: matriz tem 5 roles
      // (super_admin + 4 PlatformRole). A ausencia de 'colab' e
      // proposital.
      const rule = findRouteRule('/nr1');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      const roles = Object.keys(rule.byRole).sort();
      expect(roles).toEqual(['clevel', 'lider', 'rh', 'rh_lider', 'super_admin']);
    });
  },
);
