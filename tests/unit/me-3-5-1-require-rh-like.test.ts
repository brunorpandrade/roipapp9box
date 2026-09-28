// ROIP APP 9BOX — teste unit canonico do helper `requireRhLikeOrSuperAdmin`
// (ME 3.5.1 Debito B).
//
// Estrategia canonica bit-exact ao teste unit de `decideRhAllowed`
// (ME 3.5 D2): decisao pura testavel sem tRPC nem banco. Como o helper
// consulta `loadCLevelSessionContext` para o branch clevel, mockamos
// o `db` como fake que retorna uma linha canonica (usa `select().from()
// .where().limit()` chain — retornamos o array esperado).

import { describe, expect, it } from 'vitest';

import { requireRhLikeOrSuperAdmin } from '../../src/lib/routes/requireRhLikeOrSuperAdmin';
import type { RoipDatabase } from '../../src/db/client';
import type { ServerSession } from '../../src/server/session/serverSession';

// Fake canonico bit-exact do chain Drizzle usado por
// `loadCLevelSessionContext`. Suporta as duas selects (member row +
// count row). O parametro `memberIsRH` decide o retorno da 1a select.
function makeFakeDb(memberIsRH: boolean | null): RoipDatabase {
  let selectCall = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      selectCall += 1;
      if (selectCall === 1) {
        if (memberIsRH === null) {
          return [];
        }
        return [
          {
            acessoTotal: true,
            isResponsavelFinanceiro: false,
            isRH: memberIsRH,
          },
        ];
      }
      return [{ n: 1 }];
    },
  };
  return {
    select: () => chain,
  } as unknown as RoipDatabase;
}

const PLATFORM_BASE = {
  kind: 'platform' as const,
  userId: 42,
  companyId: 7,
  displayName: 'Test User',
  companyDisplayName: 'Test Co',
  companyLogoUrl: null,
};

describe('ME 3.5.1 — requireRhLikeOrSuperAdmin', () => {
  const anyDb = makeFakeDb(true);

  it('rejeita sessao null com mensagem canonica generica', async () => {
    await expect(requireRhLikeOrSuperAdmin(anyDb, null, 'testAction')).rejects.toThrow(
      /sessao ausente ou expirada/,
    );
  });

  it('admite super_admin sem tocar db', async () => {
    const session: ServerSession = {
      kind: 'super_admin',
      superAdminId: 1,
      displayName: 'Bruno',
    } as unknown as ServerSession;
    const result = await requireRhLikeOrSuperAdmin(makeFakeDb(null), session, 'testAction');
    expect(result.kind).toBe('super_admin');
  });

  it('admite platform rh', async () => {
    const session = { ...PLATFORM_BASE, role: 'rh' } as unknown as ServerSession;
    const result = await requireRhLikeOrSuperAdmin(makeFakeDb(null), session, 'testAction');
    expect(result.kind).toBe('platform');
    if (result.kind === 'platform') {
      expect(result.role).toBe('rh');
      expect(result.companyId).toBe(7);
    }
  });

  it('admite platform rh_lider', async () => {
    const session = { ...PLATFORM_BASE, role: 'rh_lider' } as unknown as ServerSession;
    const result = await requireRhLikeOrSuperAdmin(makeFakeDb(null), session, 'testAction');
    expect(result.kind).toBe('platform');
    if (result.kind === 'platform') {
      expect(result.role).toBe('rh_lider');
    }
  });

  it('admite platform clevel quando cLevelMembers.isRH === true', async () => {
    const session = { ...PLATFORM_BASE, role: 'clevel' } as unknown as ServerSession;
    const result = await requireRhLikeOrSuperAdmin(makeFakeDb(true), session, 'testAction');
    expect(result.kind).toBe('platform');
    if (result.kind === 'platform') {
      expect(result.role).toBe('clevel');
    }
  });

  it('rejeita platform clevel quando cLevelMembers.isRH === false', async () => {
    const session = { ...PLATFORM_BASE, role: 'clevel' } as unknown as ServerSession;
    await expect(
      requireRhLikeOrSuperAdmin(makeFakeDb(false), session, 'testAction'),
    ).rejects.toThrow(/acesso restrito/);
  });

  it('rejeita platform clevel quando cLevelMembers nao encontrado', async () => {
    const session = { ...PLATFORM_BASE, role: 'clevel' } as unknown as ServerSession;
    await expect(
      requireRhLikeOrSuperAdmin(makeFakeDb(null), session, 'testAction'),
    ).rejects.toThrow(/acesso restrito/);
  });

  it('rejeita platform lider puro', async () => {
    const session = { ...PLATFORM_BASE, role: 'lider' } as unknown as ServerSession;
    await expect(
      requireRhLikeOrSuperAdmin(makeFakeDb(null), session, 'testAction'),
    ).rejects.toThrow(/acesso restrito/);
  });
});
