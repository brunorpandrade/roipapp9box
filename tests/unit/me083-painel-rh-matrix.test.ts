// ROIP APP 9BOX — teste unitario ME-083 (guards canonicos de rota).
//
// Cobre canonicamente bit-exact contra a matriz `src/lib/routes/matrix.ts`:
//   1. `/painel-rh` — decisao bit-exact §10.3 linha 808 (D-ME083-4
//      aprovado):
//      - super_admin → 'redirect_painel' (para /super-admin).
//      - rh → 'allow'.
//      - rh_lider → 'allow'.
//      - clevel → 'deny'.
//      - lider → 'deny'.
//   2. `/minha-equipe` — matriz §10.4 (stub §5.2 D-ME083-5):
//      - super_admin → 'redirect_super_admin'.
//      - rh → 'deny' (RH puro sem liderados).
//      - rh_lider → 'allow'.
//      - clevel → 'allow'.
//      - lider → 'allow'.
//   3. `/cadeia-indireta` — matriz §10.4 (stub §5.2 D-ME083-5):
//      - super_admin → 'redirect_super_admin'.
//      - rh → 'deny'.
//      - rh_lider → 'allow' (C1 devolve vazio na pratica; C2 devolve
//        cadeia real).
//      - clevel → 'allow'.
//      - lider → 'allow'.

import { describe, expect, it } from 'vitest';

import { findRouteRule } from '../../src/lib/routes/matrix';

describe('ME-083 — matriz de rotas §10 bit-exact para /painel-rh + stubs', () => {
  describe('/painel-rh — DECISAO D-ME083-4 (Bruno redirect_painel)', () => {
    it('regra existe bit-exact na matriz canonica', () => {
      const rule = findRouteRule('/painel-rh');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      expect(rule.pattern).toBe('/painel-rh');
    });

    it('super_admin redireciona ao painel canonico (Bruno → /super-admin)', () => {
      const rule = findRouteRule('/painel-rh');
      expect(rule?.byRole.super_admin).toBe('redirect_painel');
    });

    it('rh e rh_lider tem allow canonico', () => {
      const rule = findRouteRule('/painel-rh');
      expect(rule?.byRole.rh).toBe('allow');
      expect(rule?.byRole.rh_lider).toBe('allow');
    });

    it('clevel e lider recebem deny canonico', () => {
      const rule = findRouteRule('/painel-rh');
      expect(rule?.byRole.clevel).toBe('deny');
      expect(rule?.byRole.lider).toBe('deny');
    });
  });

  describe('/minha-equipe — stub §5.2 D-ME083-5', () => {
    it('regra existe bit-exact na matriz canonica', () => {
      const rule = findRouteRule('/minha-equipe');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      expect(rule.pattern).toBe('/minha-equipe');
    });

    it('super_admin recebe redirect_super_admin canonico', () => {
      const rule = findRouteRule('/minha-equipe');
      expect(rule?.byRole.super_admin).toBe('redirect_super_admin');
    });

    it('rh puro recebe deny (RH puro nao tem liderados)', () => {
      const rule = findRouteRule('/minha-equipe');
      expect(rule?.byRole.rh).toBe('deny');
    });

    it('rh_lider, clevel, lider tem allow canonico', () => {
      const rule = findRouteRule('/minha-equipe');
      expect(rule?.byRole.rh_lider).toBe('allow');
      expect(rule?.byRole.clevel).toBe('allow');
      expect(rule?.byRole.lider).toBe('allow');
    });
  });

  describe('/cadeia-indireta — stub §5.2 D-ME083-5', () => {
    it('regra existe bit-exact na matriz canonica', () => {
      const rule = findRouteRule('/cadeia-indireta');
      expect(rule).not.toBe(null);
      if (rule === null) return;
      expect(rule.pattern).toBe('/cadeia-indireta');
    });

    it('super_admin recebe redirect_super_admin canonico', () => {
      const rule = findRouteRule('/cadeia-indireta');
      expect(rule?.byRole.super_admin).toBe('redirect_super_admin');
    });

    it('rh puro recebe deny bit-exact', () => {
      const rule = findRouteRule('/cadeia-indireta');
      expect(rule?.byRole.rh).toBe('deny');
    });

    it('rh_lider, clevel, lider tem allow canonico', () => {
      const rule = findRouteRule('/cadeia-indireta');
      expect(rule?.byRole.rh_lider).toBe('allow');
      expect(rule?.byRole.clevel).toBe('allow');
      expect(rule?.byRole.lider).toBe('allow');
    });
  });
});
