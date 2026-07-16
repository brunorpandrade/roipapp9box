// ROIP APP 9BOX — teste de integracao `auth.confirmEmailChange` (ME-022c).
//
// Cobre ordem canonica DOC 02 §4.9 passo 3 contra MySQL real. Foco:
// publicProcedure (sem sessao); token invalido/expirado/usado → contratos
// canonicos `{ status: 'invalido' | 'expirado' }`; sucesso: UPDATE
// superAdmins.email + markTokenAsUsed + invalidacao natural de sessao via
// S011 (pwv email-based). S030 anti-enumeracao: UNIQUE violation em
// superAdmins.email cai em `{ status: 'invalido' }`.
//
// L32 — cleanup em afterAll.

import { eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { accessTokens, superAdmins } from '../../src/db/schema';
import { signCredentialToken } from '../../src/server/auth/credentialToken';
import { deriveCredentialVersion } from '../../src/server/auth/jwt';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { authRouter, MSG_EMAIL_CHANGE_LINK_INVALID } from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022c-confirmEmailChange';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA = 'SenhaAtual1';
const IP_A = '10.0.0.53';

const createCaller = createCallerFactory(authRouter);

function ctx(client: RoipDbClient): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip: IP_A,
  });
}

describe('auth.confirmEmailChange — ordem canonica §4.9 (ME-022c)', () => {
  let client: RoipDbClient;
  let hashSenha: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashSenha = await hashPassword(SENHA, BCRYPT_COST_TEST);
  });

  afterAll(async () => {
    await client.db.delete(accessTokens);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(accessTokens);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
  });

  async function seedSuperAdmin(email: string): Promise<number> {
    const [row] = await client.db
      .insert(superAdmins)
      .values({
        name: 'SA Confirm',
        email,
        passwordHash: hashSenha,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    return row.id;
  }

  async function emitEmailChangeToken(
    saId: number,
    novoEmail: string,
    options?: { expiresAt?: Date; usedAt?: Date; type?: 'password_reset' | 'first_access' },
  ): Promise<string> {
    const jwt = await signCredentialToken({
      userId: saId,
      tipo: 'email_change',
      userType: 'super_admin',
      novoEmail,
    });
    await client.db.insert(accessTokens).values({
      userType: 'super_admin',
      userId: saId,
      token: jwt,
      type: options?.type ?? 'password_reset',
      usedAt: options?.usedAt ?? null,
      expiresAt: options?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return jwt;
  }

  it('sucesso: UPDATE email + markTokenAsUsed + retorna { status: sucesso }', async () => {
    const emailAntigo = 'sa-confirm-1@teste.local';
    const emailNovo = 'sa-confirm-1-novo@teste.local';
    const saId = await seedSuperAdmin(emailAntigo);
    const jwt = await emitEmailChangeToken(saId, emailNovo);

    const caller = createCaller(ctx(client));
    const result = await caller.confirmEmailChange({ token: jwt });
    expect(result).toEqual({ status: 'sucesso' });

    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    expect(sa[0]?.email).toBe(emailNovo);

    // Token marcado como usado.
    const tk = await client.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.token, jwt))
      .limit(1);
    expect(tk[0]?.usedAt).not.toBeNull();
  });

  it('S011 email-based: pwv apos UPDATE muda (invalida sessoes)', async () => {
    const emailAntigo = 'sa-confirm-2@teste.local';
    const emailNovo = 'sa-confirm-2-novo@teste.local';
    const saId = await seedSuperAdmin(emailAntigo);
    const jwt = await emitEmailChangeToken(saId, emailNovo);

    const pwvAntes = deriveCredentialVersion(hashSenha + emailAntigo);

    const caller = createCaller(ctx(client));
    await caller.confirmEmailChange({ token: jwt });

    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    const only = sa[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      const pwvDepois = deriveCredentialVersion(only.passwordHash + only.email);
      expect(pwvDepois).not.toBe(pwvAntes);
    }
  });

  it('JWT invalido (assinatura errada) → BAD_REQUEST status=invalido', async () => {
    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: 'nao-e-jwt' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });
  });

  it('JWT de tipo=reset (nao email_change) → invalido', async () => {
    const email = 'sa-confirm-3@teste.local';
    const saId = await seedSuperAdmin(email);
    const jwt = await signCredentialToken({
      userId: saId,
      tipo: 'reset',
      userType: 'super_admin',
    });
    // Grava registro correspondente para chegar ate a discriminacao de tipo.
    await client.db.insert(accessTokens).values({
      userType: 'super_admin',
      userId: saId,
      token: jwt,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: jwt })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });
    // Email nao alterado.
    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    expect(sa[0]?.email).toBe(email);
  });

  it('token nao presente em accessTokens → expirado (JWT valido, sem registro)', async () => {
    const emailAntigo = 'sa-confirm-4@teste.local';
    const emailNovo = 'sa-confirm-4-novo@teste.local';
    const saId = await seedSuperAdmin(emailAntigo);
    // Emite JWT porem NAO grava em accessTokens.
    const jwt = await signCredentialToken({
      userId: saId,
      tipo: 'email_change',
      userType: 'super_admin',
      novoEmail: emailNovo,
    });

    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: jwt })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });
  });

  it('token ja usado (usedAt != null) → expirado', async () => {
    const emailAntigo = 'sa-confirm-5@teste.local';
    const emailNovo = 'sa-confirm-5-novo@teste.local';
    const saId = await seedSuperAdmin(emailAntigo);
    const jwt = await emitEmailChangeToken(saId, emailNovo, { usedAt: new Date() });

    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: jwt })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });
  });

  it('token expirado (expiresAt < now) → expirado', async () => {
    const emailAntigo = 'sa-confirm-6@teste.local';
    const emailNovo = 'sa-confirm-6-novo@teste.local';
    const saId = await seedSuperAdmin(emailAntigo);
    const jwt = await emitEmailChangeToken(saId, emailNovo, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: jwt })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });
  });

  it('S030 anti-enum: novoEmail ja tomado por outro super_admin → invalido', async () => {
    const emailAlvo = 'sa-confirm-7@teste.local';
    const emailOcupado = 'sa-confirm-8-ocupado@teste.local';
    const saId = await seedSuperAdmin(emailAlvo);
    // Outro super_admin ja possui o email que Bruno quer usar.
    await seedSuperAdmin(emailOcupado);

    const jwt = await emitEmailChangeToken(saId, emailOcupado);
    const caller = createCaller(ctx(client));
    await expect(caller.confirmEmailChange({ token: jwt })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_EMAIL_CHANGE_LINK_INVALID,
    });

    // Email original preservado.
    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    expect(sa[0]?.email).toBe(emailAlvo);
    // Token NAO marcado como usado (falhou antes do markTokenAsUsed).
    const tk = await client.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.token, jwt))
      .limit(1);
    expect(tk[0]?.usedAt).toBeNull();
  });
});
