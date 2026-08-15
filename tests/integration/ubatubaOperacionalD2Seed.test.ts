// ROIP APP 9BOX — teste de integracao do seedUbatubaOperacionalD2
// (ME-080e D2). Cobre invariantes bit-exact em MySQL real:
//   - performanceData: 1210 rows para companyId=2
//   - performanceVariableData: 4840 rows JOIN performanceData Ubatuba
//   - performanceQuarterlyData: 415 rows para companyId=2
//   - isolamento: Nativa (companyId=1) permanece zero rows nas 3 tabelas
//
// Isolamento canonico: base `roip_test_ubatuba_op_d2`.
// Bootstrap: migration + super admin + seed estrutural Ubatuba (ME-080b)
// + seed operacional D2.
//
// RV-11: banco MySQL real.

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
  UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO,
  seedUbatubaOperacionalD2,
} from '../../src/db/seed/ubatuba/seedUbatubaOperacionalD2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const OP_TEST_DB = 'roip_test_ubatuba_op_d2';

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
        `VALUES (1, 'Fixture Super Admin (op d2 test)', 'op-d2-test@roip.local', 'x')`,
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

describe('seedUbatubaOperacionalD2 — bit-exact (ME-080e D2)', () => {
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
    const operacional = await seedUbatubaOperacionalD2(client.db);
    expect(operacional.applied).toBe(true);
    expect(operacional.counts.performanceData).toBe(UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO);
    expect(operacional.counts.performanceVariableData).toBe(
      UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO,
    );
    expect(operacional.counts.performanceQuarterlyData).toBe(
      UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO,
    );
    expect(operacional.skippedTables.length).toBe(0);
  }, 180000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('performanceData: 1210 rows para companyId=2', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceData WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(1210);
  });

  it('performanceVariableData: 4840 rows JOIN performanceData Ubatuba', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceVariableData pv ` +
        `INNER JOIN performanceData pd ON pd.id = pv.performanceDataId ` +
        `WHERE pd.companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(4840);
  });

  it('performanceQuarterlyData: 415 rows para companyId=2', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceQuarterlyData WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(415);
  });

  it('performanceData: employeeIds no range Ubatuba [1004..1069]', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT MIN(employeeId) AS mn, MAX(employeeId) AS mx FROM performanceData ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.mn)).toBeGreaterThanOrEqual(1004);
    expect(Number(rows[0]!.mx)).toBeLessThanOrEqual(1069);
  });

  it('performanceVariableData: variableIndex sempre em {0,1,2,3}', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT pv.variableIndex FROM performanceVariableData pv ` +
        `INNER JOIN performanceData pd ON pd.id = pv.performanceDataId ` +
        `WHERE pd.companyId = ${UBATUBA_COMPANY_ID} ORDER BY pv.variableIndex`,
    );
    expect(rows.map((r) => Number(r.variableIndex))).toEqual([0, 1, 2, 3]);
  });

  it('performanceQuarterlyData: faixaDesempenho no enum quando nao-null', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT faixaDesempenho FROM performanceQuarterlyData ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} AND faixaDesempenho IS NOT NULL`,
    );
    const valores = rows.map((r) => String(r.faixaDesempenho)).sort();
    for (const v of valores) {
      expect(['alto', 'baixo', 'medio']).toContain(v);
    }
  });

  it('isolamento multi-empresa: Nativa (id=1) permanece com zero rows nas 3 tabelas', async () => {
    const [perf] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceData WHERE companyId = 1`,
    );
    const [perfVar] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceVariableData pv ` +
        `INNER JOIN performanceData pd ON pd.id = pv.performanceDataId WHERE pd.companyId = 1`,
    );
    const [perfQ] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM performanceQuarterlyData WHERE companyId = 1`,
    );
    expect(Number((perf[0] as CountResult).n)).toBe(0);
    expect(Number((perfVar[0] as CountResult).n)).toBe(0);
    expect(Number((perfQ[0] as CountResult).n)).toBe(0);
  });
});
