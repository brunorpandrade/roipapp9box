// ROIP APP 9BOX — teste de integracao `auth.loginSuperAdmin` (ME-022a).
//
// Exercita a ordem canonica a-e do DOC 02 §4.2 contra MySQL real. Cobre:
//   (a) rate limit atingido → TOO_MANY_REQUESTS.
//   (c) email nao encontrado → UNAUTHORIZED + incremento.
//   (d) senha errada → UNAUTHORIZED + incremento.
//   (e) sucesso → reset, JWT SEM claim `exp` (§5.1), payload correto.
//   Contrato de resposta: { token, user: { id, name, email, role: 'super_admin' } }.
//   Anti-enumeracao: mesma mensagem canonica para (c) e (d).
//
// L32: preservar `superAdmins` id=1 (fixture global). L36: datas < 2037.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ne } from 'drizzle-orm';
import { jwtVerify } from 'jose';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { superAdmins } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  authRouter,
  MSG_LOGIN_SUPER_ADMIN_INVALID,
  MSG_RATE_LIMIT,
} from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022a-loginSuperAdmin';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const SENHA_ERRADA = 'SenhaErrada123';
const IP_A = '10.0.0.10';

const createCaller = createCallerFactory(authRouter);

function ctxWith(client: RoipDbClient, ip: string): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip,
  });
}

function makeSharedCtxFactory(client: RoipDbClient, ip: string) {
  const limiter = createRateLimiter();
  return () =>
    createContextInner({
      db: client.db,
      rateLimiter: limiter,
      bearerToken: null,
      ip,
    });
}

describe('auth.loginSuperAdmin — ordem canonica §4.2 (ME-022a)', () => {
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
  });

  async function seedSuperAdmin(
    email: string,
    passwordHash: string,
    name = 'Bruno',
  ): Promise<number> {
    const [row] = await client.db
      .insert(superAdmins)
      .values({ name, email, passwordHash })
      .$returningId();
    if (!row) {
      throw new Error('seedSuperAdmin sem id');
    }
    return row.id;
  }

  // ---- (c) email nao encontrado ----------------------------------------

  it('email nao encontrado → UNAUTHORIZED com mensagem canonica', async () => {
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginSuperAdmin({ email: 'inexistente@roip.test', senha: SENHA_OK }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: MSG_LOGIN_SUPER_ADMIN_INVALID,
    });
  });

  // ---- (d) senha errada ------------------------------------------------

  it('senha errada → UNAUTHORIZED (mesma mensagem que email nao encontrado)', async () => {
    await seedSuperAdmin('bruno@roip.test', hashOk);
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginSuperAdmin({ email: 'bruno@roip.test', senha: SENHA_ERRADA }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: MSG_LOGIN_SUPER_ADMIN_INVALID,
    });
  });

  // ---- (a) rate limit --------------------------------------------------

  it('5 falhas seguidas → 6a bloqueia com TOO_MANY_REQUESTS + retryAfterSeconds', async () => {
    await seedSuperAdmin('bruno@roip.test', hashOk);
    const makeCtx = makeSharedCtxFactory(client, IP_A);
    for (let i = 0; i < 5; i++) {
      const caller = createCaller(makeCtx());
      await caller
        .loginSuperAdmin({ email: 'bruno@roip.test', senha: SENHA_ERRADA })
        .catch(() => undefined);
    }
    const caller = createCaller(makeCtx());
    try {
      await caller.loginSuperAdmin({ email: 'bruno@roip.test', senha: SENHA_ERRADA });
      throw new Error('deveria ter bloqueado');
    } catch (err) {
      const e = err as { code?: string; message?: string; cause?: { retryAfterSeconds?: number } };
      expect(e.code).toBe('TOO_MANY_REQUESTS');
      expect(e.message).toBe(MSG_RATE_LIMIT);
      expect(e.cause?.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  // ---- (e) sucesso — JWT sem exp, pwv derivado de hash+email -----------

  it('sucesso → JWT sem claim `exp` (§5.1), pwv derivado de hash+email', async () => {
    const email = 'bruno@roip.test';
    const superAdminId = await seedSuperAdmin(email, hashOk, 'Bruno');
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginSuperAdmin({ email, senha: SENHA_OK });
    expect(result.user.role).toBe('super_admin');
    expect(result.user.id).toBe(superAdminId);
    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe('Bruno');
    const { payload } = await jwtVerify(
      result.token,
      new TextEncoder().encode(process.env.JWT_SECRET),
    );
    expect(payload.role).toBe('super_admin');
    expect(payload.exp).toBeUndefined();
    expect(payload.sub).toBe(String(superAdminId));
    expect(typeof payload.pwv).toBe('string');
  });

  it('sucesso reseta rate limit', async () => {
    const email = 'bruno.reset@roip.test';
    await seedSuperAdmin(email, hashOk);
    const makeCtx = makeSharedCtxFactory(client, IP_A);
    // 4 falhas (nao bloqueia).
    for (let i = 0; i < 4; i++) {
      const c = createCaller(makeCtx());
      await c.loginSuperAdmin({ email, senha: SENHA_ERRADA }).catch(() => undefined);
    }
    // Sucesso reseta.
    const c = createCaller(makeCtx());
    await c.loginSuperAdmin({ email, senha: SENHA_OK });
    // Pos-reset: 5 falhas ainda nao bloqueiam; a 6a bloqueia.
    for (let i = 0; i < 5; i++) {
      const cc = createCaller(makeCtx());
      await expect(cc.loginSuperAdmin({ email, senha: SENHA_ERRADA })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }
    const cf = createCaller(makeCtx());
    await expect(cf.loginSuperAdmin({ email, senha: SENHA_ERRADA })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  // ---- input validation ------------------------------------------------

  it('email fora do formato → BAD_REQUEST via zod', async () => {
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginSuperAdmin({ email: 'nao-e-email', senha: SENHA_OK }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
