// ROIP APP 9BOX — teste integracao religacao auth.ts (ME-060 §12.9).
// Cobre:
// - forgotPassword branch Super Admin → Template 1 enfileirado.
// - requestEmailChange (super_admin) → Template 3 enfileirado.
// Nota: confirmEmailChange (Template 4) requer JWT valido do fluxo
// requestEmailChange + accessTokens matching; testes existentes de
// `auth-emailChange.test.ts` (do repo baseline) exercitam o handler
// integral e agora consomem a religacao canonica automaticamente.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { accessTokens, emailQueue, superAdmins } from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { TRANSACTIONAL_MARKER_HEAD } from '../../src/lib/email';
import { authRouter } from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me060-religacao';

const IP_TEST = '10.0.0.99';
const createCaller = createCallerFactory(authRouter);

function ctxAuthed(client: RoipDbClient, bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: IP_TEST,
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

describe('religacao auth.ts (ME-060 §12.9)', () => {
  let client: RoipDbClient;
  let superAdminId: number;
  let passwordHash: string;
  const emailAntigo = 'bruno-religacao@roip.local';
  const emailNovo = 'bruno-religacao-novo@roip.local';
  const senha = 'SenhaCanonica@123';

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    passwordHash = await hashPassword(senha);
    const [row] = await client.db
      .insert(superAdmins)
      .values({ name: 'Bruno Religacao', email: emailAntigo, passwordHash })
      .$returningId();
    if (!row) throw new Error('superAdmin insert falhou');
    superAdminId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(accessTokens).where(eq(accessTokens.userId, superAdminId));
    await client.db.delete(emailQueue).where(eq(emailQueue.destinatarioEmail, emailAntigo));
    await client.db.delete(emailQueue).where(eq(emailQueue.destinatarioEmail, emailNovo));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, superAdminId));
    await closeDbClient(client);
  });

  it('forgotPassword Super Admin → Template 1 (CC052 companyId=null)', async () => {
    const caller = createCaller(ctxAuthed(client, null));
    const res = await caller.forgotPassword({ email: emailAntigo });
    expect(res.enviado).toBe(true);

    const queueRows = await client.db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.destinatarioEmail, emailAntigo));
    expect(queueRows.length).toBeGreaterThanOrEqual(1);
    const q = queueRows[0];
    if (q === undefined) throw new Error('queue row missing');
    expect(q.companyId).toBeNull();
    expect(q.destinatarioTipo).toBe('bruno');
    expect(q.tipoEnvio).toBe('imediato');
    const marker = q.alertIds as unknown as [string, string, string];
    expect(marker[0]).toBe(TRANSACTIONAL_MARKER_HEAD);
    expect(marker[1]).toBe('1');
    const payload = JSON.parse(marker[2]) as { nomeDoUsuario: string; jwtToken: string };
    expect(payload.nomeDoUsuario).toBe('Bruno Religacao');
    expect(payload.jwtToken.length).toBeGreaterThan(10);
  });

  it('requestEmailChange → Template 3 enfileirado no novoEmail', async () => {
    const bearer = await signSuperAdminFor(superAdminId, passwordHash, emailAntigo);
    const caller = createCaller(ctxAuthed(client, bearer));
    const res = await caller.requestEmailChange({
      senhaAtual: senha,
      novoEmail: emailNovo,
      confirmarEmail: emailNovo,
    });
    expect(res.status).toBe('solicitado');

    const queueRows = await client.db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.destinatarioEmail, emailNovo));
    expect(queueRows.length).toBeGreaterThanOrEqual(1);
    const q = queueRows[0];
    if (q === undefined) throw new Error('queue row missing');
    expect(q.companyId).toBeNull();
    expect(q.destinatarioTipo).toBe('bruno');
    const marker = q.alertIds as unknown as [string, string, string];
    expect(marker[1]).toBe('3');
    const payload = JSON.parse(marker[2]) as { nomeDoBruno: string; jwtToken: string };
    expect(payload.nomeDoBruno).toBe('Bruno Religacao');
    expect(payload.jwtToken.length).toBeGreaterThan(10);
  });
});
