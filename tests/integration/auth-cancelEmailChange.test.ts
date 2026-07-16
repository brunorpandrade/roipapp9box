// ROIP APP 9BOX — teste de integracao `auth.cancelEmailChange` (ME-022c).
//
// Cobre o botao `[Cancelar solicitacao]` do Bloco B do fluxo H3 (§4.8
// ultimo paragrafo). Foco: exclusivo super_admin; idempotencia (sem token
// ativo devolve sucesso); filtragem por metadado `tipo=email_change` NAO
// afeta tokens de reset comum coexistentes; multiplos email_change ativos
// sao invalidados.
//
// L32 — cleanup em afterAll.

import { and, eq, isNull, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { accessTokens, superAdmins } from '../../src/db/schema';
import { signCredentialToken } from '../../src/server/auth/credentialToken';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { authRouter } from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022c-cancelEmailChange';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_ATUAL = 'SenhaAtual1';
const IP_A = '10.0.0.52';

const createCaller = createCallerFactory(authRouter);

function ctxAuthed(client: RoipDbClient, bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: IP_A,
  });
}

async function signSuperAdminFor(
  superAdminId: number,
  passwordHash: string,
  email: string,
): Promise<string> {
  return await signSuperAdminToken({
    superAdminId,
    credentialVersion: deriveCredentialVersion(passwordHash + email),
  });
}

describe('auth.cancelEmailChange — §4.8 fim (ME-022c)', () => {
  let client: RoipDbClient;
  let hashSenha: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashSenha = await hashPassword(SENHA_ATUAL, BCRYPT_COST_TEST);
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
        name: 'SA Cancel',
        email,
        passwordHash: hashSenha,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    return row.id;
  }

  async function emitEmailChangeToken(saId: number, novoEmail: string): Promise<void> {
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
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  async function emitResetToken(saId: number): Promise<void> {
    const jwt = await signCredentialToken({
      userId: saId,
      tipo: 'reset',
      userType: 'super_admin',
    });
    await client.db.insert(accessTokens).values({
      userType: 'super_admin',
      userId: saId,
      token: jwt,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  it('sem sessao rejeita com UNAUTHORIZED', async () => {
    const caller = createCaller(ctxAuthed(client, null));
    await expect(caller.cancelEmailChange({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('idempotente: sem token ativo devolve status=cancelado', async () => {
    const email = 'sa-cancel-1@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));
    const result = await caller.cancelEmailChange({});
    expect(result).toEqual({ status: 'cancelado' });
  });

  it('cancela token de email_change ativo (marca usedAt=NOW)', async () => {
    const email = 'sa-cancel-2@teste.local';
    const saId = await seedSuperAdmin(email);
    await emitEmailChangeToken(saId, 'novo@teste.local');
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));

    const result = await caller.cancelEmailChange({});
    expect(result).toEqual({ status: 'cancelado' });

    // Token permanece na tabela mas com usedAt != null.
    const ativos = await client.db
      .select()
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.userType, 'super_admin'),
          eq(accessTokens.userId, saId),
          eq(accessTokens.type, 'password_reset'),
          isNull(accessTokens.usedAt),
        ),
      );
    expect(ativos.length).toBe(0);
  });

  it('cancela email_change SEM afetar reset comum coexistente (S031 discriminacao)', async () => {
    const email = 'sa-cancel-3@teste.local';
    const saId = await seedSuperAdmin(email);
    await emitResetToken(saId);
    await emitEmailChangeToken(saId, 'novo@teste.local');
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));

    const result = await caller.cancelEmailChange({});
    expect(result).toEqual({ status: 'cancelado' });

    // O reset comum permanece ATIVO (usedAt null).
    const ativos = await client.db
      .select()
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.userType, 'super_admin'),
          eq(accessTokens.userId, saId),
          eq(accessTokens.type, 'password_reset'),
          isNull(accessTokens.usedAt),
        ),
      );
    expect(ativos.length).toBe(1);
    // E o e-mail do super admin nao foi alterado.
    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    expect(sa[0]?.email).toBe(email);
  });
});
