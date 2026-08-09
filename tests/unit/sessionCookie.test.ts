// ROIP APP 9BOX — teste unit `setSessionCookie` + `clearSessionCookie`
// (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact:
// - `setSessionCookie(token, 'super_admin')` → cookie name='session',
//   httpOnly, sameSite='lax', secure conforme NODE_ENV, path='/',
//   maxAge=365*24*60*60 (§5.1 cookie persistente).
// - `setSessionCookie(token, 'platform')` → mesmo, maxAge=8*60*60
//   (§5.2 sliding).
// - `clearSessionCookie` → cookieStore.delete('session').
//
// Mock canonico bit-exact: `next/headers` `cookies()` retorna um
// cookieStore mock que registra chamadas. Sem dependencia de Next
// runtime, sem MySQL.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock canonico bit-exact `next/headers` ----------------------------

interface CookieSetArgs {
  readonly name: string;
  readonly value: string;
  readonly options: {
    readonly httpOnly?: boolean;
    readonly sameSite?: string;
    readonly secure?: boolean;
    readonly path?: string;
    readonly maxAge?: number;
  };
}

let setCalls: CookieSetArgs[] = [];
let deleteCalls: string[] = [];

vi.mock('next/headers', () => {
  return {
    cookies: async () => ({
      set: (name: string, value: string, options: CookieSetArgs['options']) => {
        setCalls.push({ name, value, options });
      },
      delete: (name: string) => {
        deleteCalls.push(name);
      },
      get: () => undefined,
    }),
  };
});

// Import DEPOIS do mock — o modulo captura a versao mockada.
import { clearSessionCookie, setSessionCookie } from '../../src/server/session/serverSession';

describe('setSessionCookie + clearSessionCookie (ME-Rota-C-D075)', () => {
  beforeEach(() => {
    setCalls = [];
    deleteCalls = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("kind='super_admin' grava cookie 'session' httpOnly com maxAge de 365 dias", async () => {
    await setSessionCookie('token-super-abc', 'super_admin');
    expect(setCalls).toHaveLength(1);
    const call = setCalls[0]!;
    expect(call.name).toBe('session');
    expect(call.value).toBe('token-super-abc');
    expect(call.options.httpOnly).toBe(true);
    expect(call.options.sameSite).toBe('lax');
    expect(call.options.path).toBe('/');
    expect(call.options.maxAge).toBe(365 * 24 * 60 * 60);
  });

  it("kind='platform' grava cookie 'session' httpOnly com maxAge de 8h", async () => {
    await setSessionCookie('token-plat-xyz', 'platform');
    expect(setCalls).toHaveLength(1);
    const call = setCalls[0]!;
    expect(call.name).toBe('session');
    expect(call.value).toBe('token-plat-xyz');
    expect(call.options.httpOnly).toBe(true);
    expect(call.options.sameSite).toBe('lax');
    expect(call.options.path).toBe('/');
    expect(call.options.maxAge).toBe(8 * 60 * 60);
  });

  it("secure=true quando NODE_ENV='production'", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await setSessionCookie('token-prod', 'super_admin');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.options.secure).toBe(true);
  });

  it("secure=false quando NODE_ENV!='production'", async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await setSessionCookie('token-dev', 'platform');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.options.secure).toBe(false);
  });

  it("clearSessionCookie chama cookieStore.delete('session')", async () => {
    await clearSessionCookie();
    expect(deleteCalls).toEqual(['session']);
  });
});
