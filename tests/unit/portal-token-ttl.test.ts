// ROIP APP 9BOX — teste unit portalToken TTL (ME-B10-02, S251).
//
// Cobre a extensao retrocompativel de `signPortalToken`:
// - Sem `ttlSeconds` -> TTL default 12h preservado bit-a-bit (S042
//   canonico da ME-023).
// - Com `ttlSeconds: PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP` (600s)
//   -> TTL curto para respondente platform (S247-Alfa).
// - Com `ttlSeconds` invalido (0, negativo, nao-inteiro) -> cai no
//   default 12h (nunca emite token sem exp).
// - `verifyPortalToken` continua reconhecendo ambos os TTLs.
//
// Sem jsdom — teste puro sobre a assinatura + verificacao do JWT
// canonico. Injeta `JWT_SECRET` no ambiente antes de importar o
// modulo (mesmo padrao dos testes de `auth-jwt.test.ts`).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SECRET_ORIGINAL = process.env.JWT_SECRET;
const SECRET_TESTE = 'test-secret-me-b10-02-portal-token-ttl';

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

async function importarModulo(): Promise<typeof import('../../src/server/auth/portalToken')> {
  return import('../../src/server/auth/portalToken');
}

async function decodePayload(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  expect(parts.length).toBe(3);
  const payloadB64 = parts[1]!;
  const buf = Buffer.from(payloadB64, 'base64url');
  return JSON.parse(buf.toString('utf-8')) as Record<string, unknown>;
}

describe('signPortalToken — TTL default retrocompativel (S042)', () => {
  it('sem ttlSeconds -> emite token com exp = iat + 12h', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 1,
      titularType: 'employee',
      titularId: 42,
    });
    const payload = await decodePayload(token);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(12 * 60 * 60);
  });

  it('ttlSeconds negativo -> cai no default 12h', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 1,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: -30,
    });
    const payload = await decodePayload(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(12 * 60 * 60);
  });

  it('ttlSeconds zero -> cai no default 12h', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 1,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: 0,
    });
    const payload = await decodePayload(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(12 * 60 * 60);
  });

  it('ttlSeconds fracionario -> cai no default 12h (Number.isInteger falso)', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 1,
      titularType: 'employee',
      titularId: 42,
      ttlSeconds: 600.5,
    });
    const payload = await decodePayload(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(12 * 60 * 60);
  });
});

describe('signPortalToken — TTL customizado para respondente platform (S251)', () => {
  it('constante PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP = 600 segundos (10 min)', async () => {
    const mod = await importarModulo();
    expect(mod.PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP).toBe(10 * 60);
  });

  it('ttlSeconds = 600 -> emite token com exp = iat + 600', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 7,
      titularType: 'clevel',
      titularId: 3,
      ttlSeconds: mod.PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP,
    });
    const payload = await decodePayload(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(600);
  });

  it('token TTL curto e verificavel pelo mesmo verifyPortalToken canonico', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 2,
      titularType: 'employee',
      titularId: 99,
      ttlSeconds: 600,
    });
    const result = await mod.verifyPortalToken(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.kind).toBe('portal');
      expect(result.claims.companyId).toBe(2);
      expect(result.claims.titularType).toBe('employee');
      expect(result.claims.titularId).toBe(99);
    }
  });
});

describe('signPortalToken — claims canonicos preservados independente do TTL', () => {
  it('claims preservam kind, sub, companyId, titularType para TTL default', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 5,
      titularType: 'employee',
      titularId: 88,
    });
    const payload = await decodePayload(token);
    expect(payload.kind).toBe('portal');
    expect(payload.companyId).toBe(5);
    expect(payload.titularType).toBe('employee');
    expect(payload.sub).toBe('88');
  });

  it('claims preservam kind, sub, companyId, titularType para TTL curto', async () => {
    const mod = await importarModulo();
    const token = await mod.signPortalToken({
      companyId: 5,
      titularType: 'clevel',
      titularId: 12,
      ttlSeconds: 600,
    });
    const payload = await decodePayload(token);
    expect(payload.kind).toBe('portal');
    expect(payload.companyId).toBe(5);
    expect(payload.titularType).toBe('clevel');
    expect(payload.sub).toBe('12');
  });
});
