// ROIP APP 9BOX — teste de integracao do seedUbatubaOperacionalD1
// (ME-080e D1). Cobre invariantes canonicas bit-exact em MySQL real:
//   - employeeLeaderHistory: 68 linhas com JOIN companyId=UBATUBA_COMPANY_ID
//     * 2 rows com dataFim NOT NULL
//     * 66 rows com dataFim NULL
//     * clevelId sempre em {1002, 1003} ou null
//     * liderId em 1004..1069 ou null
//     * XOR liderId vs clevelId por row
//   - employeeGoals: 192 linhas com JOIN companyId=UBATUBA_COMPANY_ID
//     * 48 employees distintos, 4 variableIndex cada
//     * unique (employeeId, variableIndex)
//
// Isolamento canonico: base MySQL dedicada `roip_test_ubatuba_operacional`.
// Bootstrap: aplica migration + super admin + seed estrutural Ubatuba
// (ME-080b via seedUbatuba) + seed operacional D1.
//
// RV-11: banco MySQL real, contagens medidas via COUNT(*) e JOIN.
// RV-13: chamador real de seedUbatubaOperacionalD1.

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
  UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO,
  UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO,
  seedUbatubaOperacionalD1,
} from '../../src/db/seed/ubatuba/seedUbatubaOperacionalD1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const OP_TEST_DB = 'roip_test_ubatuba_operacional';

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
  return `mysql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port}/${dbName}`;
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
        `VALUES (1, 'Fixture Super Admin (op d1 test)', 'op-d1-test@roip.local', 'x')`,
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

describe('seedUbatubaOperacionalD1 — invariantes canonicas bit-exact (ME-080e D1)', () => {
  const cfg = parseDatabaseUrl(DEFAULT_URL);
  let client: RoipDbClient;

  beforeAll(async () => {
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    const dbUrl = buildUrl(cfg, OP_TEST_DB);
    client = createDbClient(dbUrl);
    // Bootstrap estrutural Ubatuba (ME-080b).
    const structural = await seedUbatuba(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });
    expect(structural.applied).toBe(true);
    // Aplica D1 operacional.
    const operacional = await seedUbatubaOperacionalD1(client.db);
    expect(operacional.applied).toBe(true);
    expect(operacional.counts.employeeLeaderHistory).toBe(
      UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO,
    );
    expect(operacional.counts.employeeGoals).toBe(UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO);
    expect(operacional.skippedTables.length).toBe(0);
  }, 120000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('employeeLeaderHistory: 68 rows total para employees Ubatuba', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(68);
  });

  it('employeeLeaderHistory: exatamente 2 rows com dataFim NOT NULL', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT elh.employeeId, elh.dataFim FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} AND elh.dataFim IS NOT NULL ` +
        `ORDER BY elh.employeeId`,
    );
    expect(rows.length).toBe(2);
    expect(Number(rows[0]!.employeeId)).toBe(1047);
    expect(Number(rows[1]!.employeeId)).toBe(1059);
  });

  it('employeeLeaderHistory: 66 rows com dataFim NULL', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} AND elh.dataFim IS NULL`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(66);
  });

  it('employeeLeaderHistory: §4.6 XOR liderId vs clevelId em cada row', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} ` +
        `  AND ((elh.liderId IS NULL AND elh.clevelId IS NULL) ` +
        `       OR (elh.liderId IS NOT NULL AND elh.clevelId IS NOT NULL))`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(0);
  });

  it('employeeLeaderHistory: clevelId (quando nao-null) sempre em {1002, 1003}', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT elh.clevelId FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} AND elh.clevelId IS NOT NULL ` +
        `ORDER BY elh.clevelId`,
    );
    const ids = rows.map((r) => Number(r.clevelId));
    expect(ids).toEqual([1002, 1003]);
  });

  it('employeeLeaderHistory: transferBatchId formato UUID + unicidade', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT elh.transferBatchId FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(rows.length).toBe(68);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const uniq = new Set<string>();
    for (const row of rows) {
      const uuid = String(row.transferBatchId);
      expect(uuidRe.test(uuid)).toBe(true);
      uniq.add(uuid);
    }
    expect(uniq.size).toBe(68);
  });

  it('employeeGoals: 192 rows total para employees Ubatuba', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeGoals g ` +
        `INNER JOIN employees e ON e.id = g.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(192);
  });

  it('employeeGoals: 48 employees distintos, 4 variableIndex cada', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT g.employeeId, COUNT(*) AS n FROM employeeGoals g ` +
        `INNER JOIN employees e ON e.id = g.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} ` +
        `GROUP BY g.employeeId`,
    );
    expect(rows.length).toBe(48);
    for (const r of rows) {
      expect(Number(r.n)).toBe(4);
    }
  });

  it('employeeGoals: variableIndex sempre em {0,1,2,3}', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT g.variableIndex FROM employeeGoals g ` +
        `INNER JOIN employees e ON e.id = g.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} ` +
        `ORDER BY g.variableIndex`,
    );
    expect(rows.map((r) => Number(r.variableIndex))).toEqual([0, 1, 2, 3]);
  });

  it('employeeGoals: updatedBy = "rh" em 100% das rows canonicas', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT g.updatedBy, COUNT(*) AS n FROM employeeGoals g ` +
        `INNER JOIN employees e ON e.id = g.employeeId ` +
        `WHERE e.companyId = ${UBATUBA_COMPANY_ID} ` +
        `GROUP BY g.updatedBy`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.updatedBy).toBe('rh');
    expect(Number(rows[0]!.n)).toBe(192);
  });

  it('isolamento multi-empresa: Nativa (id=1) permanece com zero rows das 2 tabelas', async () => {
    const [elh] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeLeaderHistory elh ` +
        `INNER JOIN employees e ON e.id = elh.employeeId WHERE e.companyId = 1`,
    );
    const [goals] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM employeeGoals g ` +
        `INNER JOIN employees e ON e.id = g.employeeId WHERE e.companyId = 1`,
    );
    expect(Number((elh[0] as CountResult).n)).toBe(0);
    expect(Number((goals[0] as CountResult).n)).toBe(0);
  });
});
