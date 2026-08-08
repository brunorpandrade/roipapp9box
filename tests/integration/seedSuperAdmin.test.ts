// ROIP APP 9BOX — teste de integracao do seed do Super Admin (CORR-D071).
//
// Chamador canonico (RV-13) e regua RV-03 no caminho de aceite (passo 9
// `vitest run` do `scripts/validate.sh`) para `scripts/seed-super-admin.mjs`.
// Fecha o par motor+chamador+teste na mesma ME (L107 gap-closing = ZERO).
//
// Escopo:
//   1. Faltando `SEED_SUPER_ADMIN_PASSWORD` -> RC=2 com literal canonico.
//   2. Faltando `DATABASE_URL` -> RC=2 com literal canonico.
//   3. Primeira execucao com env valido -> RC=0, cria 1 linha em
//      `superAdmins` com o email canonico e mensagem canonica.
//   4. Segunda execucao com env valido -> RC=0, mantem 1 linha
//      (idempotente) e emite a mensagem canonica de "ja existe".
//
// Interacao com o fixture do globalSetup (tests/integration/setup.ts):
//   - O globalSetup semeia `superAdmins` id=1 com email
//     'fixture-test@roip.local'. Este teste opera EXCLUSIVAMENTE sobre
//     o email canonico do Bruno ('brunorpandrade@gmail.com'), nunca
//     tocando a fixture, para preservar as FKs de
//     `companyJobFamilies.updatedBy` referenciadas por outros testes.
//   - beforeEach/afterEach fazem DELETE targeting apenas por
//     `email = SEED_EMAIL`, jamais por id nem por wildcard.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { superAdmins } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'seed-super-admin.mjs');

const SEED_EMAIL = 'brunorpandrade@gmail.com';
const SEED_NAME = 'Bruno Andrade';
const TEST_PASSWORD = 'seed-test-pass-1234!';

const DEFAULT_URL = 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? DEFAULT_URL;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(env?: Record<string, string | undefined>): RunResult {
  // Monta env explicitamente removendo variaveis nao desejadas quando o
  // caller passa undefined (para simular ausencia).
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  // Remove as duas variaveis que o teste controla, para nao vazar
  // do processo pai.
  delete cleanEnv.SEED_SUPER_ADMIN_PASSWORD;
  delete cleanEnv.DATABASE_URL;

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete cleanEnv[key];
      } else {
        cleanEnv[key] = value;
      }
    }
  }

  const res = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    env: cleanEnv,
  });

  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

let client: RoipDbClient | null = null;

async function getClient(): Promise<RoipDbClient> {
  if (!client) {
    client = createDbClient(getDatabaseUrl());
  }
  return client;
}

async function deleteSeedRow(): Promise<void> {
  const c = await getClient();
  await c.db.delete(superAdmins).where(eq(superAdmins.email, SEED_EMAIL));
}

async function countSeedRows(): Promise<number> {
  const c = await getClient();
  const rows = await c.db
    .select({ id: superAdmins.id })
    .from(superAdmins)
    .where(eq(superAdmins.email, SEED_EMAIL));
  return rows.length;
}

describe('seed-super-admin.mjs — regua canonica CORR-D071', () => {
  beforeEach(async () => {
    await deleteSeedRow();
  });

  afterEach(async () => {
    await deleteSeedRow();
  });

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
      client = null;
    }
  });

  it('aborta com RC=2 se SEED_SUPER_ADMIN_PASSWORD ausente', () => {
    const r = runScript({ DATABASE_URL: getDatabaseUrl() });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('SEED_SUPER_ADMIN_PASSWORD nao definida');
  });

  it('aborta com RC=2 se DATABASE_URL ausente', () => {
    const r = runScript({ SEED_SUPER_ADMIN_PASSWORD: TEST_PASSWORD });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('DATABASE_URL nao definida');
  });

  it('primeira execucao cria o registro canonico do Bruno', async () => {
    const r = runScript({
      SEED_SUPER_ADMIN_PASSWORD: TEST_PASSWORD,
      DATABASE_URL: getDatabaseUrl(),
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Super admin criado');
    expect(r.stdout).toContain(SEED_EMAIL);

    const c = await getClient();
    const rows = await c.db
      .select({
        id: superAdmins.id,
        name: superAdmins.name,
        email: superAdmins.email,
        passwordHash: superAdmins.passwordHash,
      })
      .from(superAdmins)
      .where(eq(superAdmins.email, SEED_EMAIL));

    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe(SEED_NAME);
    expect(rows[0]?.email).toBe(SEED_EMAIL);
    // Hash bcrypt tem formato `$2a$` ou `$2b$`; nunca vazio nem plaintext.
    expect(rows[0]?.passwordHash).toMatch(/^\$2[ab]\$/);
    expect(rows[0]?.passwordHash).not.toBe(TEST_PASSWORD);
  });

  it('segunda execucao e idempotente (COUNT permanece 1)', async () => {
    const first = runScript({
      SEED_SUPER_ADMIN_PASSWORD: TEST_PASSWORD,
      DATABASE_URL: getDatabaseUrl(),
    });
    expect(first.status).toBe(0);
    expect(await countSeedRows()).toBe(1);

    const second = runScript({
      SEED_SUPER_ADMIN_PASSWORD: TEST_PASSWORD,
      DATABASE_URL: getDatabaseUrl(),
    });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Super admin ja existe');
    expect(second.stdout).toContain(SEED_EMAIL);

    // Idempotencia canonica: nao duplicou.
    expect(await countSeedRows()).toBe(1);
  });
});
