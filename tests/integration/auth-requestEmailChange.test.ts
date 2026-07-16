// ROIP APP 9BOX — teste de integracao `auth.requestEmailChange` (ME-022c).
//
// Cobre ordem canonica DOC 02 §4.8 Bloco A passo 5 contra MySQL real.
// Foco: exclusivo super_admin (roleProcedure); rate limit; solicitacao
// pendente ativa (S031 discriminacao por metadado JWT); bcrypt.compare
// senhaAtual; novoEmail === atual; emissao correta do JWT com metadado
// (S027 + S028) + INSERT accessTokens type='password_reset' TTL 24h.
//
// S030 anti-enumeracao: NAO verifica pre-existencia de novoEmail em outro
// super_admin — coberto no teste de confirmEmailChange.
//
// L32 — cleanup em afterAll.

import { and, eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { accessTokens, superAdmins } from '../../src/db/schema';
import { signCredentialToken, verifyCredentialToken } from '../../src/server/auth/credentialToken';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  authRouter,
  MSG_EMAIL_CHANGE_PENDING,
  MSG_NEW_EMAIL_MUST_DIFFER,
  MSG_PASSWORD_ACTUAL_INCORRECT,
  MSG_RATE_LIMIT,
} from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022c-requestEmailChange';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_ATUAL = 'SenhaAtual1';
const EMAIL_NOVO = 'sa-novo@teste.local';
const EMAIL_CONFIRM = 'sa-confirm@teste.local';
const IP_A = '10.0.0.51';

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

describe('auth.requestEmailChange — ordem canonica §4.8 (ME-022c)', () => {
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
        name: 'SA Request',
        email,
        passwordHash: hashSenha,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    return row.id;
  }

  it('sem sessao rejeita com UNAUTHORIZED', async () => {
    const caller = createCaller(ctxAuthed(client, null));
    await expect(
      caller.requestEmailChange({
        senhaAtual: SENHA_ATUAL,
        novoEmail: EMAIL_NOVO,
        confirmarEmail: EMAIL_NOVO,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('novoEmail !== confirmarEmail → BAD_REQUEST do zod', async () => {
    const email = 'sa-req-1@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.requestEmailChange({
        senhaAtual: SENHA_ATUAL,
        novoEmail: EMAIL_NOVO,
        confirmarEmail: EMAIL_CONFIRM,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('senhaAtual errada → 401 canonica + registerFailure', async () => {
    const email = 'sa-req-2@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.requestEmailChange({
        senhaAtual: 'errada-1',
        novoEmail: EMAIL_NOVO,
        confirmarEmail: EMAIL_NOVO,
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: MSG_PASSWORD_ACTUAL_INCORRECT,
    });

    // Nao criou accessTokens.
    const tokens = await client.db.select().from(accessTokens).where(eq(accessTokens.userId, saId));
    expect(tokens.length).toBe(0);
  });

  it('novoEmail === email atual → 400 canonica MSG_NEW_EMAIL_MUST_DIFFER', async () => {
    const email = 'sa-req-3@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.requestEmailChange({
        senhaAtual: SENHA_ATUAL,
        novoEmail: email,
        confirmarEmail: email,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_NEW_EMAIL_MUST_DIFFER,
    });
  });

  it('sucesso: 200 canonico + INSERT accessTokens com JWT metadado tipo=email_change', async () => {
    const email = 'sa-req-4@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));

    const result = await caller.requestEmailChange({
      senhaAtual: SENHA_ATUAL,
      novoEmail: EMAIL_NOVO,
      confirmarEmail: EMAIL_NOVO,
    });
    expect(result).toEqual({ status: 'solicitado', novoEmail: EMAIL_NOVO });

    // 1 registro em accessTokens type=password_reset ativo.
    const rows = await client.db
      .select()
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.userType, 'super_admin'),
          eq(accessTokens.userId, saId),
          eq(accessTokens.type, 'password_reset'),
        ),
      );
    expect(rows.length).toBe(1);
    const only = rows[0];
    expect(only).toBeDefined();
    if (only === undefined) {
      return;
    }
    expect(only.usedAt).toBeNull();

    // TTL canonico 24h (§5.4).
    if (only.createdAt !== null) {
      const ttlMs = only.expiresAt.getTime() - only.createdAt.getTime();
      const target = 24 * 60 * 60 * 1000;
      expect(Math.abs(ttlMs - target)).toBeLessThan(5000);
    }

    // JWT com tipo=email_change + novoEmail correto (S027 + S028).
    const verified = await verifyCredentialToken(only.token);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.tipo).toBe('email_change');
      expect(verified.claims.userType).toBe('super_admin');
      expect(verified.claims.userId).toBe(saId);
      expect(verified.claims.novoEmail).toBe(EMAIL_NOVO);
    }
  });

  it('solicitacao pendente ativa (email_change) bloqueia nova → 409 canonica', async () => {
    const email = 'sa-req-5@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));

    // 1a solicitacao — sucesso.
    await caller.requestEmailChange({
      senhaAtual: SENHA_ATUAL,
      novoEmail: EMAIL_NOVO,
      confirmarEmail: EMAIL_NOVO,
    });

    // 2a solicitacao — CONFLICT canonico.
    await expect(
      caller.requestEmailChange({
        senhaAtual: SENHA_ATUAL,
        novoEmail: 'outro-novo@teste.local',
        confirmarEmail: 'outro-novo@teste.local',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_EMAIL_CHANGE_PENDING,
    });
  });

  it('reset comum ativo NAO bloqueia requestEmailChange (S031 discriminacao)', async () => {
    const email = 'sa-req-6@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);

    // Semeia um token de RESET COMUM ativo (tipo='reset' no payload).
    const resetJwt = await signCredentialToken({
      userId: saId,
      tipo: 'reset',
      userType: 'super_admin',
    });
    await client.db.insert(accessTokens).values({
      userType: 'super_admin',
      userId: saId,
      token: resetJwt,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // requestEmailChange deve prosseguir — o pendente ativo e de reset,
    // nao de email_change.
    const caller = createCaller(ctxAuthed(client, token));
    const result = await caller.requestEmailChange({
      senhaAtual: SENHA_ATUAL,
      novoEmail: EMAIL_NOVO,
      confirmarEmail: EMAIL_NOVO,
    });
    expect(result).toEqual({ status: 'solicitado', novoEmail: EMAIL_NOVO });

    // O reset comum foi invalidado pela concorrencia canonica (§5.4) —
    // apenas 1 ativo por (userType, userId, type). O passo (g) do
    // resolver chama `invalidateActiveTokensByUserAndType`.
    const active = await client.db
      .select()
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.userType, 'super_admin'),
          eq(accessTokens.userId, saId),
          eq(accessTokens.type, 'password_reset'),
        ),
      );
    // Apos requestEmailChange: reset comum ficou usedAt=now (invalido), 1 novo email_change ativo.
    expect(active.length).toBe(2);
    const ativos = active.filter((r) => r.usedAt === null);
    expect(ativos.length).toBe(1);
    const ativo = ativos[0];
    expect(ativo).toBeDefined();
    if (ativo !== undefined) {
      const v = await verifyCredentialToken(ativo.token);
      expect(v.valid).toBe(true);
      if (v.valid) {
        expect(v.claims.tipo).toBe('email_change');
      }
    }
  });

  it('rate limit atingido (5 falhas de senha) bloqueia proxima com TOO_MANY_REQUESTS', async () => {
    const email = 'sa-req-7@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashSenha, email);
    const caller = createCaller(ctxAuthed(client, token));

    for (let i = 0; i < 5; i += 1) {
      await expect(
        caller.requestEmailChange({
          senhaAtual: 'errada-' + String(i),
          novoEmail: EMAIL_NOVO,
          confirmarEmail: EMAIL_NOVO,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    await expect(
      caller.requestEmailChange({
        senhaAtual: SENHA_ATUAL,
        novoEmail: EMAIL_NOVO,
        confirmarEmail: EMAIL_NOVO,
      }),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: MSG_RATE_LIMIT,
    });
  });
});
