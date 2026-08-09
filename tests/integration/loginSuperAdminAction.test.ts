// ROIP APP 9BOX — teste de integracao server action
// `loginSuperAdminAction` (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact dos ramos de FALHA (o ramo de sucesso
// `authenticateSuperAdmin` chama `redirect()` do Next 15 que lanca
// NEXT_REDIRECT — coberto por `authenticateSuperAdmin.test.ts` no
// nivel do helper puro + smoke manual na FASE 3 ME-072).
//
// Mock canonico bit-exact `next/headers` — retorna cookie store fake
// com `.get(): undefined` e captura chamadas `.set`, `.delete`, e o
// header `x-forwarded-for` para o IP canonico.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { superAdmins } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import { MSG_LOGIN_SUPER_ADMIN_INVALID } from '../../src/server/routers/auth';

// -----------------------------------------------------------------------
// Mock canonico bit-exact `next/headers` e `next/navigation`
// -----------------------------------------------------------------------

const cookieCalls: {
  set: { name: string; value: string }[];
  delete: string[];
} = { set: [], delete: [] };

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === 'x-forwarded-for') return '10.0.0.40';
      return null;
    },
  }),
  cookies: async () => ({
    set: (name: string, value: string) => {
      cookieCalls.set.push({ name, value });
    },
    delete: (name: string) => {
      cookieCalls.delete.push(name);
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

// Import DEPOIS dos mocks.
import { loginSuperAdminAction } from '../../src/app/login-super-admin/actions';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-rota-c-d075-loginSuperAdminAction';
process.env.DATABASE_URL = TEST_URL;

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const SENHA_ERRADA = 'SenhaErrada123';

describe('loginSuperAdminAction — server action §4.2 (ME-Rota-C-D075)', () => {
  let client: RoipDbClient;
  let hashOk: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashOk = await hashPassword(SENHA_OK, BCRYPT_COST_TEST);
  });

  afterAll(async () => {
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
    cookieCalls.set = [];
    cookieCalls.delete = [];
  });

  async function seed(email: string, hash: string): Promise<void> {
    await client.db.insert(superAdmins).values({
      name: 'Super Admin Test D075',
      email,
      passwordHash: hash,
    });
  }

  it('email vazio → unauthorized canonico (sem tocar rate limit nem DB)', async () => {
    const r = await loginSuperAdminAction({ email: '', senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe('unauthorized');
      expect(r.message).toBe(MSG_LOGIN_SUPER_ADMIN_INVALID);
    }
    // Nao deve gravar cookie.
    expect(cookieCalls.set).toHaveLength(0);
  });

  it('email invalido (sem @) → unauthorized canonico', async () => {
    const r = await loginSuperAdminAction({ email: 'foo', senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe('unauthorized');
      expect(r.message).toBe(MSG_LOGIN_SUPER_ADMIN_INVALID);
    }
  });

  it('senha vazia → unauthorized canonico', async () => {
    const r = await loginSuperAdminAction({ email: 'valid@roip.test', senha: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
  });

  it('email nao encontrado no DB → unauthorized', async () => {
    const r = await loginSuperAdminAction({
      email: 'inexistente@roip.test',
      senha: SENHA_OK,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe('unauthorized');
      expect(r.message).toBe(MSG_LOGIN_SUPER_ADMIN_INVALID);
    }
    expect(cookieCalls.set).toHaveLength(0);
  });

  it('senha errada → unauthorized', async () => {
    await seed('admin.action@roip.test', hashOk);
    const r = await loginSuperAdminAction({
      email: 'admin.action@roip.test',
      senha: SENHA_ERRADA,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
    expect(cookieCalls.set).toHaveLength(0);
  });

  it('sucesso → grava cookie session + lanca NEXT_REDIRECT para /super-admin', async () => {
    await seed('admin.ok.action@roip.test', hashOk);
    let caughtDigest: string | null = null;
    try {
      await loginSuperAdminAction({
        email: 'admin.ok.action@roip.test',
        senha: SENHA_OK,
      });
      throw new Error('esperava NEXT_REDIRECT');
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string') caughtDigest = digest;
    }
    expect(caughtDigest).not.toBeNull();
    expect(caughtDigest ?? '').toContain('/super-admin');
    // Cookie session gravado.
    expect(cookieCalls.set).toHaveLength(1);
    expect(cookieCalls.set[0]!.name).toBe('session');
    expect(cookieCalls.set[0]!.value.length).toBeGreaterThan(10);
  });

  it('email com case diferente e trim → normaliza e autentica', async () => {
    await seed('admin.case@roip.test', hashOk);
    let redirected = false;
    try {
      await loginSuperAdminAction({
        email: '  ADMIN.case@ROIP.TEST  ',
        senha: SENHA_OK,
      });
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string' && digest.includes('/super-admin')) redirected = true;
    }
    expect(redirected).toBe(true);
  });
});
