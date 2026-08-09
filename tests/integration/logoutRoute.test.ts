// ROIP APP 9BOX — teste do Route Handler `GET /logout` (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact:
// - Chama `clearSessionCookie()` → `cookieStore.delete('session')`.
// - Chama `redirect('/')` → lanca NEXT_REDIRECT com destino '/'.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieDeleteCallsRef: string[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    delete: (name: string) => {
      cookieDeleteCallsRef.push(name);
    },
    set: () => {
      /* nao usado no logout */
    },
    get: () => undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT ${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));

import { GET } from '../../src/app/logout/route';

describe('GET /logout — route handler canonico (ME-Rota-C-D075)', () => {
  beforeEach(() => {
    // limpa array preservando referencia.
    cookieDeleteCallsRef.length = 0;
  });

  it("apaga cookie 'session' e lanca NEXT_REDIRECT para '/'", async () => {
    let caughtDigest: string | null = null;
    try {
      await GET();
      throw new Error('esperava NEXT_REDIRECT');
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string') caughtDigest = digest;
    }
    expect(caughtDigest).not.toBeNull();
    expect(caughtDigest ?? '').toContain('NEXT_REDIRECT');
    // Verificamos que destino e a raiz — o digest carrega ';/;' entre
    // 'replace' e o status HTTP.
    expect(caughtDigest ?? '').toMatch(/replace;\/;/);
    expect(cookieDeleteCallsRef).toEqual(['session']);
  });
});
