// ROIP APP 9BOX — teste unitario do guard de auto-visao (D-SELF, ME
// §8.05). Funcao pura, sem banco: prova nos dois sentidos (RV-03) que
// `assertNaoAutoVisaoEmployee` bloqueia a auto-visao para perfis
// operacionais e isenta Bruno (super_admin) e C-level.
//
// RV-13: cobre o unico export com logica de `_shared/selfViewGuard`.

import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';

import {
  MSG_AUTO_VISAO_DASHBOARD,
  MSG_AUTO_VISAO_PERFIL,
  assertNaoAutoVisaoEmployee,
} from '../../src/server/routers/_shared/selfViewGuard';
import type { AuthenticatedUser } from '../../src/server/trpc';

const SUPER_ADMIN: AuthenticatedUser = { role: 'super_admin', superAdminId: 1 };
const CLEVEL: AuthenticatedUser = { role: 'clevel', userId: 7, companyId: 1 };
const LIDER: AuthenticatedUser = { role: 'lider', userId: 7, companyId: 1 };
const RH: AuthenticatedUser = { role: 'rh', userId: 7, companyId: 1 };
const RH_LIDER: AuthenticatedUser = { role: 'rh_lider', userId: 7, companyId: 1 };

describe('assertNaoAutoVisaoEmployee — bloqueia auto-visao (D-SELF)', () => {
  it('lider vendo o proprio employeeId -> FORBIDDEN', () => {
    try {
      assertNaoAutoVisaoEmployee(LIDER, 7, MSG_AUTO_VISAO_DASHBOARD);
      expect.unreachable('deveria ter lancado FORBIDDEN');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toBe(MSG_AUTO_VISAO_DASHBOARD);
    }
  });

  it('rh vendo o proprio employeeId -> FORBIDDEN', () => {
    expect(() => assertNaoAutoVisaoEmployee(RH, 7, MSG_AUTO_VISAO_PERFIL)).toThrow(TRPCError);
  });

  it('rh_lider vendo o proprio employeeId -> FORBIDDEN', () => {
    expect(() => assertNaoAutoVisaoEmployee(RH_LIDER, 7, MSG_AUTO_VISAO_DASHBOARD)).toThrow(
      TRPCError,
    );
  });
});

describe('assertNaoAutoVisaoEmployee — permite os demais casos (D-SELF)', () => {
  it('lider vendo OUTRO employeeId -> ok', () => {
    expect(() => assertNaoAutoVisaoEmployee(LIDER, 9, MSG_AUTO_VISAO_DASHBOARD)).not.toThrow();
  });

  it('super_admin (Bruno) e isento mesmo com id coincidente -> ok', () => {
    expect(() =>
      assertNaoAutoVisaoEmployee(SUPER_ADMIN, 7, MSG_AUTO_VISAO_DASHBOARD),
    ).not.toThrow();
  });

  it('clevel e isento: userId e cLevelId, nao employeeId -> ok', () => {
    expect(() => assertNaoAutoVisaoEmployee(CLEVEL, 7, MSG_AUTO_VISAO_PERFIL)).not.toThrow();
  });
});
