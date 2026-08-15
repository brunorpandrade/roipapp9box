// ROIP APP 9BOX — teste de integracao seedUbatubaOperacionalD3 (ME-080e D3).

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
  UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO,
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
  UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO,
  seedUbatubaOperacionalD3,
} from '../../src/db/seed/ubatuba/seedUbatubaOperacionalD3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const OP_TEST_DB = 'roip_test_ubatuba_op_d3';

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
        `VALUES (1, 'Fixture Super Admin (op d3 test)', 'op-d3-test@roip.local', 'x')`,
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

describe('seedUbatubaOperacionalD3 — bit-exact (ME-080e D3)', () => {
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
    const operacional = await seedUbatubaOperacionalD3(client.db);
    expect(operacional.applied).toBe(true);
    expect(operacional.counts.individualProfilePlaceholders).toBe(
      UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
    );
    expect(operacional.counts.individualProfileAssessments).toBe(
      UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO,
    );
    expect(operacional.counts.individualProfileScores).toBe(UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO);
    expect(operacional.skippedTables.length).toBe(0);
  }, 120000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('individualProfilePlaceholders: 69 rows para companyId=2', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM individualProfilePlaceholders ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((rows[0] as CountResult).n)).toBe(69);
  });

  it('individualProfileAssessments: 66 rows (3 clevels + 63 employees)', async () => {
    const [total] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM individualProfileAssessments ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((total[0] as CountResult).n)).toBe(66);
    const [byType] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT userType, COUNT(*) AS n FROM individualProfileAssessments ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} GROUP BY userType ORDER BY userType`,
    );
    const map = new Map<string, number>();
    for (const r of byType) {
      map.set(String(r.userType), Number(r.n));
    }
    expect(map.get('clevel')).toBe(3);
    expect(map.get('employee')).toBe(63);
  });

  it('individualProfileScores: 66 rows com assessmentId nao-null', async () => {
    const [total] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM individualProfileScores ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number((total[0] as CountResult).n)).toBe(66);
    const [orphan] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM individualProfileScores s ` +
        `LEFT JOIN individualProfileAssessments a ON a.id = s.assessmentId ` +
        `WHERE s.companyId = ${UBATUBA_COMPANY_ID} AND a.id IS NULL`,
    );
    expect(Number((orphan[0] as CountResult).n)).toBe(0);
  });

  it('placeholders: clevels pendentes + employees respondidos', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT userType, status, COUNT(*) AS n FROM individualProfilePlaceholders ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} GROUP BY userType, status`,
    );
    const found = new Map<string, number>();
    for (const r of rows) {
      found.set(`${r.userType}:${r.status}`, Number(r.n));
    }
    expect(found.get('clevel:pendente')).toBe(3);
    expect(found.get('employee:respondido')).toBe(66);
  });

  it('isolamento multi-empresa: Nativa (id=1) tem zero rows nas 3 tabelas', async () => {
    const tabelas = [
      'individualProfilePlaceholders',
      'individualProfileAssessments',
      'individualProfileScores',
    ];
    for (const t of tabelas) {
      const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM ${t} WHERE companyId = 1`,
      );
      expect(Number((rows[0] as CountResult).n)).toBe(0);
    }
  });
});
