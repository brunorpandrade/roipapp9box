// ROIP APP 9BOX — teste idempotencia seedUbatubaOperacionalD3 (ME-080e D3).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { UBATUBA_COMPANY_ID } from '../../src/db/seed/ubatuba/constants';
import { seedUbatuba } from '../../src/db/seed/ubatuba/loadUbatubaFixtures';
import { seedUbatubaOperacionalD3 } from '../../src/db/seed/ubatuba/seedUbatubaOperacionalD3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const OP_TEST_DB = 'roip_test_ubatuba_op_d3_idempotency';

const DEFAULT_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

interface ParsedUrl {
  user: string;
  password: string;
  host: string;
  port: number;
}

function parseDatabaseUrl(url: string): ParsedUrl {
  const m = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)(?:\/[^?]*)?/);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) {
    throw new Error(`DATABASE_URL_TEST invalida: ${url}`);
  }
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: Number(m[4]),
  };
}

function buildUrl(cfg: ParsedUrl, dbName: string): string {
  const u = encodeURIComponent(cfg.user);
  const p = encodeURIComponent(cfg.password);
  return `mysql://${u}:${p}@${cfg.host}:${cfg.port}/${dbName}`;
}

async function dropAndCreateDb(cfg: ParsedUrl): Promise<void> {
  const admin = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${OP_TEST_DB}\``);
    await admin.query(
      `CREATE DATABASE \`${OP_TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await admin.end();
  }
}

async function applyMigrationAndSeedSuperAdmin(cfg: ParsedUrl): Promise<void> {
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: OP_TEST_DB,
    multipleStatements: true,
  });
  try {
    await conn.query(migrationSql);
    await conn.query(
      `INSERT INTO superAdmins (id, name, email, passwordHash) ` +
        `VALUES (1, 'Fixture Super Admin (op d3 idempotency)', 'op-d3-idem@roip.local', 'x')`,
    );
  } finally {
    await conn.end();
  }
}

async function dropDb(cfg: ParsedUrl): Promise<void> {
  const admin = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${OP_TEST_DB}\``);
  } finally {
    await admin.end();
  }
}

interface CountResult {
  n: number;
}

async function count(client: RoipDbClient, table: string): Promise<number> {
  const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE companyId = ${UBATUBA_COMPANY_ID}`,
  );
  return Number((rows[0] as CountResult).n);
}

describe('seedUbatubaOperacionalD3 — idempotencia (ME-080e D3)', () => {
  const cfg = parseDatabaseUrl(DEFAULT_URL);
  let client: RoipDbClient;

  beforeAll(async () => {
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    const dbUrl = buildUrl(cfg, OP_TEST_DB);
    client = createDbClient(dbUrl);
    const structural = await seedUbatuba(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });
    expect(structural.applied).toBe(true);
  }, 120000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('primeira execucao aplica as 3 tabelas (69+66+66)', async () => {
    const result = await seedUbatubaOperacionalD3(client.db);
    expect(result.applied).toBe(true);
    expect(result.counts.individualProfilePlaceholders).toBe(69);
    expect(result.counts.individualProfileAssessments).toBe(66);
    expect(result.counts.individualProfileScores).toBe(66);
    expect(result.skippedTables.length).toBe(0);
    expect(await count(client, 'individualProfilePlaceholders')).toBe(69);
    expect(await count(client, 'individualProfileAssessments')).toBe(66);
    expect(await count(client, 'individualProfileScores')).toBe(66);
  });

  it('segunda execucao skipa todas, contagens preservadas', async () => {
    const result = await seedUbatubaOperacionalD3(client.db);
    expect(result.applied).toBe(false);
    expect(Object.keys(result.counts).length).toBe(0);
    expect(result.skippedTables).toEqual([
      'individualProfilePlaceholders',
      'individualProfileAssessments',
      'individualProfileScores',
    ]);
    expect(await count(client, 'individualProfilePlaceholders')).toBe(69);
    expect(await count(client, 'individualProfileAssessments')).toBe(66);
    expect(await count(client, 'individualProfileScores')).toBe(66);
  });

  it('terceira execucao mantem estado bit-exact', async () => {
    const result = await seedUbatubaOperacionalD3(client.db);
    expect(result.applied).toBe(false);
    expect(await count(client, 'individualProfilePlaceholders')).toBe(69);
    expect(await count(client, 'individualProfileAssessments')).toBe(66);
    expect(await count(client, 'individualProfileScores')).toBe(66);
  });
});
