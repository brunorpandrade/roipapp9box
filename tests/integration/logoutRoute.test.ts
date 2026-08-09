// ROIP APP 9BOX — teste do Route Handler `GET /logout` (ME-Rota-C-D075
// + ME-072-fix3 detecção de prefetch).
//
// Cobertura canonica bit-exact:
// - Request normal (sem headers de prefetch): chama `clearSessionCookie()`
//   → `cookieStore.delete('session')`, e chama `redirect('/')` → lanca
//   NEXT_REDIRECT com destino '/'.
// - Request de prefetch (`Next-Router-Prefetch: 1` ou `Purpose: prefetch`):
//   retorna 204 SEM tocar no cookie e SEM redirect. Protege contra
//   apagamento silencioso da sessao por prefetch automatico do Next 15
//   App Router (bug canonico bit-exact detectado em ME-072-fix3).

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

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/logout', { headers });
}

describe('GET /logout — route handler canonico (ME-Rota-C-D075 + fix3)', () => {
  beforeEach(() => {
    cookieDeleteCallsRef.length = 0;
  });

  it("apaga cookie 'session' e lanca NEXT_REDIRECT para '/' em request normal", async () => {
    let caughtDigest: string | null = null;
    try {
      await GET(makeRequest());
      throw new Error('esperava NEXT_REDIRECT');
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string') caughtDigest = digest;
    }
    expect(caughtDigest).not.toBeNull();
    expect(caughtDigest ?? '').toContain('NEXT_REDIRECT');
    expect(caughtDigest ?? '').toMatch(/replace;\/;/);
    expect(cookieDeleteCallsRef).toEqual(['session']);
  });

  it('retorna 204 SEM tocar no cookie quando header Next-Router-Prefetch: 1', async () => {
    const res = await GET(makeRequest({ 'Next-Router-Prefetch': '1' }));
    expect(res.status).toBe(204);
    expect(cookieDeleteCallsRef).toEqual([]);
  });

  it('retorna 204 SEM tocar no cookie quando header Purpose: prefetch', async () => {
    const res = await GET(makeRequest({ Purpose: 'prefetch' }));
    expect(res.status).toBe(204);
    expect(cookieDeleteCallsRef).toEqual([]);
  });
});
