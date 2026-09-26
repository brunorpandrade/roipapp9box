// ROIP APP 9BOX — régua do token de portal realmente vencido (bateria de
// segurança cross-company e autorização cruzada, Etapa 0, item 2).
//
// Lacuna anterior: `portal-endpoints.test.ts` admitia não provar o ramo
// `expired` com um token de fato vencido (caía em `malformed`). Esta
// régua assina um token com `ttlSeconds` curto, avança o relógio do
// processo (jose usa `Date.now()`) e prova, nos dois sentidos (RV-03):
//   · antes de `exp` → válido, claims intactas;
//   · depois de `exp` → `{ valid: false, reason: 'expired' }`;
//   · o endpoint `/api/portal/consent-lgpd` devolve 401 + MSG_EXPIRED_TOKEN
//     para esse token, sem tocar o banco (o `getDbClient` é mockado).
// RV-14: um statement por linha, 100 colunas.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET_ORIGINAL = process.env.JWT_SECRET;
const SECRET_TESTE = 'test-secret-seguranca-portal-expirado';

vi.mock('../../src/app/api/portal/consent-lgpd/internals', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../src/app/api/portal/consent-lgpd/internals')>();
  return {
    ...mod,
    getDbClient: () => {
      throw new Error('banco nao deve ser tocado com token expirado');
    },
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

afterEach(() => {
  vi.useRealTimers();
});

async function tokenModule(): Promise<typeof import('../../src/server/auth/portalToken')> {
  return import('../../src/server/auth/portalToken');
}

describe('portal token — expiração real com relógio simulado (RV-03)', () => {
  it('caso bom: antes de exp o token é válido e preserva as claims', async () => {
    const mod = await tokenModule();
    const token = await mod.signPortalToken({
      companyId: 7,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: 120,
    });
    const verified = await mod.verifyPortalToken(token);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.companyId).toBe(7);
      expect(verified.claims.titularId).toBe(42);
    }
  });

  it('defeito injetado: depois de exp o mesmo token cai em reason=expired', async () => {
    const mod = await tokenModule();
    const token = await mod.signPortalToken({
      companyId: 7,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: 120,
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 121 * 1000);
    const verified = await mod.verifyPortalToken(token);
    expect(verified).toEqual({ valid: false, reason: 'expired' });
  });

  it('token adulterado continua malformed, não expired', async () => {
    const mod = await tokenModule();
    const token = await mod.signPortalToken({
      companyId: 7,
      titularType: 'employee',
      titularId: 42,
    });
    const verified = await mod.verifyPortalToken(`${token}x`);
    expect(verified).toEqual({ valid: false, reason: 'malformed' });
  });

  it('endpoint consent-lgpd: token vencido → 401 MSG_EXPIRED_TOKEN e sem banco', async () => {
    const mod = await tokenModule();
    const { POST } = await import('../../src/app/api/portal/consent-lgpd/route');
    const { MSG_EXPIRED_TOKEN } = await import('../../src/app/api/portal/consent-lgpd/internals');
    const token = await mod.signPortalToken({
      companyId: 7,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: 60,
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61 * 1000);
    const req = new Request('http://localhost/api/portal/consent-lgpd', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ portalToken: token }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_EXPIRED_TOKEN);
  });
});
