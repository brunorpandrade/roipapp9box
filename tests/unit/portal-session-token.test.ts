// ROIP APP 9BOX — teste unit endpoint POST /api/portal/session-token
// (ME-B10-02, S252). Cobre o guard canonico:
// - sem sessao -> 401 MSG_SEM_SESSAO_SESSION_TOKEN
// - super_admin -> 403 MSG_ACESSO_NEGADO_SESSION_TOKEN
// - platform -> 200 com portalToken emitido TTL 600s + claims
//   canonicos (titularType mapeado corretamente de role)
//
// Padrao dos testes unit do Bloco B10-01: usa `vi.mock` do vitest para
// substituir `getServerSession` sem tocar cookies() do Next nem banco.
// A dependencia `signPortalToken` e usada de verdade (JWT real com
// JWT_SECRET injetado).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET_ORIGINAL = process.env.JWT_SECRET;
const SECRET_TESTE = 'test-secret-me-b10-02-session-token';

// Estado mutavel do mock de sessao — cada teste seta o cenario antes
// de chamar POST().
let mockSession: unknown = null;

vi.mock('../../src/server/session/serverSession', () => {
  return {
    getServerSession: async () => mockSession,
  };
});

beforeAll(() => {
  process.env.JWT_SECRET = SECRET_TESTE;
});

afterAll(() => {
  if (SECRET_ORIGINAL === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = SECRET_ORIGINAL;
  }
});

beforeEach(() => {
  mockSession = null;
});

async function importarHandler(): Promise<
  typeof import('../../src/app/api/portal/session-token/route')
> {
  return import('../../src/app/api/portal/session-token/route');
}

async function importarInternals(): Promise<
  typeof import('../../src/app/api/portal/session-token/internals')
> {
  return import('../../src/app/api/portal/session-token/internals');
}

async function importarPortalToken(): Promise<typeof import('../../src/server/auth/portalToken')> {
  return import('../../src/server/auth/portalToken');
}

describe('POST /api/portal/session-token — guards canonicos (S252)', () => {
  it('sessao ausente -> 401 MSG_SEM_SESSAO_SESSION_TOKEN', async () => {
    mockSession = null;
    const { POST } = await importarHandler();
    const { MSG_SEM_SESSAO_SESSION_TOKEN } = await importarInternals();

    const res = await POST();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_SEM_SESSAO_SESSION_TOKEN);
  });

  it('sessao super_admin -> 403 MSG_ACESSO_NEGADO_SESSION_TOKEN', async () => {
    mockSession = {
      kind: 'super_admin',
      superAdminId: 1,
      displayName: 'Bruno Andrade',
    };
    const { POST } = await importarHandler();
    const { MSG_ACESSO_NEGADO_SESSION_TOKEN } = await importarInternals();

    const res = await POST();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ACESSO_NEGADO_SESSION_TOKEN);
  });

  it('sessao platform role=lider -> 200 com portalToken titularType employee', async () => {
    mockSession = {
      kind: 'platform',
      role: 'lider',
      userId: 42,
      companyId: 1,
      displayName: 'Fulana da Silva',
      companyDisplayName: 'Nativa Alimentos',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const { POST } = await importarHandler();
    const { verifyPortalToken, PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP } =
      await importarPortalToken();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      portalToken: string;
      expiresAtEpochSeconds: number;
      ttlSeconds: number;
    };
    expect(typeof body.portalToken).toBe('string');
    expect(body.portalToken.length).toBeGreaterThan(0);
    expect(body.ttlSeconds).toBe(PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP);
    expect(body.expiresAtEpochSeconds).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verified = await verifyPortalToken(body.portalToken);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.companyId).toBe(1);
      expect(verified.claims.titularType).toBe('employee');
      expect(verified.claims.titularId).toBe(42);
    }
  });

  it('sessao platform role=clevel -> 200 com portalToken titularType clevel', async () => {
    mockSession = {
      kind: 'platform',
      role: 'clevel',
      userId: 7,
      companyId: 2,
      displayName: 'CEO Exemplo',
      companyDisplayName: 'Bebidas Ubatuba',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const { POST } = await importarHandler();
    const { verifyPortalToken } = await importarPortalToken();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { portalToken: string };
    const verified = await verifyPortalToken(body.portalToken);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.companyId).toBe(2);
      expect(verified.claims.titularType).toBe('clevel');
      expect(verified.claims.titularId).toBe(7);
    }
  });

  it('sessao platform role=rh -> titularType employee (fallback canonico)', async () => {
    mockSession = {
      kind: 'platform',
      role: 'rh',
      userId: 88,
      companyId: 1,
      displayName: 'RH Exemplo',
      companyDisplayName: 'Nativa Alimentos',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const { POST } = await importarHandler();
    const { verifyPortalToken } = await importarPortalToken();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { portalToken: string };
    const verified = await verifyPortalToken(body.portalToken);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.titularType).toBe('employee');
      expect(verified.claims.titularId).toBe(88);
    }
  });

  it('sessao platform role=rh_lider -> titularType employee', async () => {
    mockSession = {
      kind: 'platform',
      role: 'rh_lider',
      userId: 55,
      companyId: 1,
      displayName: 'RH Lider Exemplo',
      companyDisplayName: 'Nativa Alimentos',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const { POST } = await importarHandler();
    const { verifyPortalToken } = await importarPortalToken();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { portalToken: string };
    const verified = await verifyPortalToken(body.portalToken);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.titularType).toBe('employee');
    }
  });
});
