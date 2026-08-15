// ROIP APP 9BOX — teste de integracao seedUbatubaOperacionalD4Final
// (ME-080e D4-final).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { UBATUBA_COMPANY_ID } from '../../src/db/seed/ubatuba/constants';
import { seedUbatuba } from '../../src/db/seed/ubatuba/loadUbatubaFixtures';
import {
  UBATUBA_OPERACIONAL_D4_FINAL_TOTAL_ESPERADO,
  seedUbatubaOperacionalD4Final,
} from '../../src/db/seed/ubatuba/seedUbatubaOperacionalD4Final';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const OP_TEST_DB = 'roip_test_ubatuba_op_d4_final';

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
        `VALUES (1, 'Fixture Super Admin (op d4-final test)', 'op-d4f-test@roip.local', 'x')`,
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

async function countUbatuba(client: RoipDbClient, table: string): Promise<number> {
  const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE companyId = ${UBATUBA_COMPANY_ID}`,
  );
  return Number((rows[0] as CountResult).n);
}

describe('seedUbatubaOperacionalD4Final — bit-exact (ME-080e D4-final)', () => {
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
    const operacional = await seedUbatubaOperacionalD4Final(client.db);
    expect(operacional.applied).toBe(true);
    expect(operacional.skippedTables.length).toBe(0);
    const total = Object.values(operacional.counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(UBATUBA_OPERACIONAL_D4_FINAL_TOTAL_ESPERADO);
  }, 240000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('instrumentA_responses: 8020', async () => {
    expect(await countUbatuba(client, 'instrumentA_responses')).toBe(8020);
  });

  it('instrumentC_assessments: 8020', async () => {
    expect(await countUbatuba(client, 'instrumentC_assessments')).toBe(8020);
  });

  it('instrumentD_responses: 4000', async () => {
    expect(await countUbatuba(client, 'instrumentD_responses')).toBe(4000);
  });

  it('plenitudeData: 401', async () => {
    expect(await countUbatuba(client, 'plenitudeData')).toBe(401);
  });

  it('nineBoxClassifications: 387', async () => {
    expect(await countUbatuba(client, 'nineBoxClassifications')).toBe(387);
  });

  it('iqlData: 45', async () => {
    expect(await countUbatuba(client, 'iqlData')).toBe(45);
  });

  it('copsoqCycles: 1', async () => {
    expect(await countUbatuba(client, 'copsoqCycles')).toBe(1);
  });

  it('copsoqCycleSnapshot: 51', async () => {
    expect(await countUbatuba(client, 'copsoqCycleSnapshot')).toBe(51);
  });

  it('copsoq_responses: 1248', async () => {
    expect(await countUbatuba(client, 'copsoq_responses')).toBe(1248);
  });

  it('copsoqFactorScores: 56', async () => {
    expect(await countUbatuba(client, 'copsoqFactorScores')).toBe(56);
  });

  it('nr1AreaDivergenceAnalysis: 6', async () => {
    expect(await countUbatuba(client, 'nr1AreaDivergenceAnalysis')).toBe(6);
  });

  it('employeeTerminationEvents: 13', async () => {
    expect(await countUbatuba(client, 'employeeTerminationEvents')).toBe(13);
  });

  it('isolamento: Nativa (id=1) permanece com zero rows nas 12 tabelas', async () => {
    const tabelas = [
      'instrumentA_responses',
      'instrumentC_assessments',
      'instrumentD_responses',
      'plenitudeData',
      'nineBoxClassifications',
      'iqlData',
      'copsoqCycles',
      'copsoqCycleSnapshot',
      'copsoq_responses',
      'copsoqFactorScores',
      'nr1AreaDivergenceAnalysis',
      'employeeTerminationEvents',
    ];
    for (const t of tabelas) {
      const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM ${t} WHERE companyId = 1`,
      );
      expect(Number((rows[0] as CountResult).n)).toBe(0);
    }
  });

  it('idempotencia: segunda execucao skipa todas as 12 tabelas', async () => {
    const result = await seedUbatubaOperacionalD4Final(client.db);
    expect(result.applied).toBe(false);
    expect(result.skippedTables.length).toBe(12);
  });
});
