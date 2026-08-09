// ROIP APP 9BOX — teste de integracao `authenticateSuperAdmin`
// (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact do helper puro §4.2 a-e:
// - (a) rate limit atingido → `code='rate_limit'` + retryAfterSeconds.
// - (c) email nao encontrado → `code='unauthorized'` + incremento.
// - (d) senha errada → `code='unauthorized'` + incremento.
// - (e) sucesso → `success:true`, JWT sem `exp`, payload canonico.
// - anti-enumeracao: mensagem canonica identica para (c) e (d).
//
// Fixture canonica bit-exact: `superAdmins` id=1 (preservada — L32).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ne } from 'drizzle-orm';
import { decodeJwt } from 'jose';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { superAdmins } from '../../src/db/schema';
import {
  authenticateSuperAdmin,
  RATE_LIMIT_IP_UNKNOWN,
} from '../../src/lib/auth/authenticateSuperAdmin';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { MSG_LOGIN_SUPER_ADMIN_INVALID, MSG_RATE_LIMIT } from '../../src/server/routers/auth';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-rota-c-d075-authenticateSuperAdmin';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const SENHA_ERRADA = 'SenhaErrada123';
const IP_A = '10.0.0.20';

describe('authenticateSuperAdmin — helper puro §4.2 (ME-Rota-C-D075)', () => {
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

  async function seed(email: string, hash: string): Promise<void> {
    await client.db.insert(superAdmins).values({
      name: 'Super Admin Test',
      email,
      passwordHash: hash,
    });
  }

  it('sentinel RATE_LIMIT_IP_UNKNOWN = "unknown"', () => {
    expect(RATE_LIMIT_IP_UNKNOWN).toBe('unknown');
  });

  it('(c) email nao encontrado → unauthorized + mensagem canonica', async () => {
    const rl = createRateLimiter();
    const result = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: rl,
      ip: IP_A,
      email: 'nao.existe@roip.test',
      senha: SENHA_OK,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('unauthorized');
      expect(result.message).toBe(MSG_LOGIN_SUPER_ADMIN_INVALID);
    }
  });

  it('(d) senha errada → unauthorized + mensagem identica a (c) anti-enumeracao', async () => {
    await seed('admin.d075@roip.test', hashOk);
    const rl = createRateLimiter();
    const result = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: rl,
      ip: IP_A,
      email: 'admin.d075@roip.test',
      senha: SENHA_ERRADA,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('unauthorized');
      expect(result.message).toBe(MSG_LOGIN_SUPER_ADMIN_INVALID);
    }
  });

  it('(e) sucesso → success:true, token JWT sem exp, payload canonico', async () => {
    await seed('admin.ok@roip.test', hashOk);
    const rl = createRateLimiter();
    const result = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: rl,
      ip: IP_A,
      email: 'admin.ok@roip.test',
      senha: SENHA_OK,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.user.role).toBe('super_admin');
      expect(result.user.email).toBe('admin.ok@roip.test');
      expect(result.user.name).toBe('Super Admin Test');
      expect(typeof result.token).toBe('string');
      // Decodifica (sem verificar assinatura — apenas confere claims).
      const claims = decodeJwt(result.token);
      expect(claims.exp).toBeUndefined();
      expect(claims.role).toBe('super_admin');
      // sub carrega o id numerico do superAdmin como string canonica.
      expect(typeof claims.sub).toBe('string');
      expect(Number(claims.sub)).toBeGreaterThan(0);
    }
  });

  it('(a) rate limit atingido → code=rate_limit + retryAfterSeconds > 0', async () => {
    await seed('admin.rl@roip.test', hashOk);
    const sharedLimiter = createRateLimiter();
    // 5 tentativas falhas seguidas — regra loginSuperAdmin = 5/15min.
    for (let i = 0; i < 5; i += 1) {
      const r = await authenticateSuperAdmin({
        db: client.db,
        rateLimiter: sharedLimiter,
        ip: IP_A,
        email: 'admin.rl@roip.test',
        senha: SENHA_ERRADA,
      });
      expect(r.success).toBe(false);
    }
    // 6a tentativa: deve ser rate-limited antes mesmo da senha.
    const blocked = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: sharedLimiter,
      ip: IP_A,
      email: 'admin.rl@roip.test',
      senha: SENHA_OK, // ainda que senha correta, rate limit corta antes.
    });
    expect(blocked.success).toBe(false);
    if (!blocked.success && blocked.code === 'rate_limit') {
      expect(blocked.message).toBe(MSG_RATE_LIMIT);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    } else {
      throw new Error('Esperava code=rate_limit');
    }
  });

  it('sucesso apos falhas reseta o contador (proximo sucesso limpa)', async () => {
    await seed('admin.reset@roip.test', hashOk);
    const sharedLimiter = createRateLimiter();
    // 2 falhas.
    for (let i = 0; i < 2; i += 1) {
      await authenticateSuperAdmin({
        db: client.db,
        rateLimiter: sharedLimiter,
        ip: IP_A,
        email: 'admin.reset@roip.test',
        senha: SENHA_ERRADA,
      });
    }
    // Sucesso — reset.
    const ok = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: sharedLimiter,
      ip: IP_A,
      email: 'admin.reset@roip.test',
      senha: SENHA_OK,
    });
    expect(ok.success).toBe(true);
    // 5 falhas seguintes NAO devem bloquear (contador foi zerado).
    for (let i = 0; i < 4; i += 1) {
      const r = await authenticateSuperAdmin({
        db: client.db,
        rateLimiter: sharedLimiter,
        ip: IP_A,
        email: 'admin.reset@roip.test',
        senha: SENHA_ERRADA,
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.code).toBe('unauthorized');
    }
  });
});
