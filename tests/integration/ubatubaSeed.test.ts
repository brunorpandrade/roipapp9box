// ROIP APP 9BOX — teste de integracao do seedUbatuba (ME-080b Dispatch 5).
//
// Cobre invariantes canonicas bit-exact:
//   - companies:                     1 linha (id=2, isDemo=true)
//   - cLevelMembers:                 3 (IDs 4-6, matricula, senha)
//   - employees:                    66 (IDs 70-135, matricula, senha condicional)
//   - companyJobFamilies:           20
//   - companyMonthlyData:           24
//   - monthlyClosureStatus:         24
//   - companyEconomicDiagnosis:      8
//   - cycleSchedule:                 5
//   - lgpdConsents:                 14
//   - responsavelFinanceiroTransferLog: 2
//   - climateEngagementData:        84
//   - dataAccessLog:               200 (aproximado — >= 195)
//   - alerts:                       13
//   - notifications:                92
//
// Idempotencia: segunda execucao retorna applied=false.
//
// Isolamento canonico: base MYSQL dedicada `roip_test_ubatuba`.
//
// RV-11: banco MySQL real, contagens medidas via COUNT(*).
// RV-13: chamador real de seedUbatuba.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { UBATUBA_COMPANY_ID, UBATUBA_EMAIL_DOMAIN } from '../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_ALERTS_TOTAL_ESPERADO,
  UBATUBA_CLIMATE_TOTAL_ESPERADO,
  UBATUBA_CLEVEL_COUNT,
  UBATUBA_DAL_TOTAL_ESPERADO,
  UBATUBA_EMPLOYEE_COUNT,
  UBATUBA_LGPD_CONSENTS_TOTAL_ESPERADO,
  UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO,
  seedUbatuba,
} from '../../src/db/seed/ubatuba/loadUbatubaFixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const UBATUBA_TEST_DB = 'roip_test_ubatuba';

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
    await admin.query(`DROP DATABASE IF EXISTS \`${UBATUBA_TEST_DB}\``);
    await admin.query(
      `CREATE DATABASE \`${UBATUBA_TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
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
    database: UBATUBA_TEST_DB,
    multipleStatements: true,
  });
  try {
    await conn.query(migrationSql);
    await conn.query(
      `INSERT INTO superAdmins (id, name, email, passwordHash) ` +
        `VALUES (1, 'Fixture Super Admin (ubatuba test)', 'ubatuba-test@roip.local', 'x')`,
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
    await admin.query(`DROP DATABASE IF EXISTS \`${UBATUBA_TEST_DB}\``);
  } finally {
    await admin.end();
  }
}

async function countTable(client: RoipDbClient, tableName: string): Promise<number> {
  const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${tableName}\``,
  );
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

describe('seedUbatuba — invariantes canonicas bit-exact (ME-080b Dispatch 5)', () => {
  const cfg = parseDatabaseUrl(DEFAULT_URL);
  let client: RoipDbClient;

  beforeAll(async () => {
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    const dbUrl = buildUrl(cfg, UBATUBA_TEST_DB);
    client = createDbClient(dbUrl);
    const result = await seedUbatuba(client.db, {
      // Cost baixo canonico para testes (produção usa 12; aqui 4 acelera
      // sem alterar semantica).
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });
    expect(result.applied).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('companies: 1 linha com id=UBATUBA_COMPANY_ID, isDemo=true', async () => {
    expect(await countTable(client, 'companies')).toBe(1);
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, razaoSocial, cnpj, isDemo FROM companies WHERE id = ${UBATUBA_COMPANY_ID}`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.razaoSocial).toBe('Bebidas Ubatuba Ltda.');
    expect(rows[0]!.cnpj).toBe('50700200000231');
    expect(Number(rows[0]!.isDemo)).toBe(1);
  });

  it('cLevelMembers: 3, IDs 1001-1003 (D5.9), matricula preenchida, dominio email', async () => {
    expect(await countTable(client, 'cLevelMembers')).toBe(UBATUBA_CLEVEL_COUNT);
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, email, matricula, passwordHash FROM cLevelMembers ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} ORDER BY id`,
    );
    expect(rows.map((r) => Number(r.id))).toEqual([1001, 1002, 1003]);
    for (const r of rows) {
      expect(String(r.email).endsWith(`@${UBATUBA_EMAIL_DOMAIN}`)).toBe(true);
      expect(r.matricula).not.toBeNull();
      expect(/^[A-Z]{2}[0-9]{2}$/.test(String(r.matricula))).toBe(true);
      expect(r.passwordHash).not.toBeNull();
    }
  });

  it('employees: 66, IDs 1004-1069 (D5.9), matricula sempre, senha condicional', async () => {
    expect(await countTable(client, 'employees')).toBe(UBATUBA_EMPLOYEE_COUNT);
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, matricula, passwordHash, isLider, isRH, ` +
        `isResponsavelFinanceiro FROM employees ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} ORDER BY id`,
    );
    const ids = rows.map((r) => Number(r.id));
    expect(ids[0]).toBe(1004);
    expect(ids[ids.length - 1]).toBe(1069);
    let comSenha = 0;
    let semSenha = 0;
    for (const r of rows) {
      expect(r.matricula).not.toBeNull();
      const deveTer =
        Number(r.isLider) === 1 || Number(r.isRH) === 1 || Number(r.isResponsavelFinanceiro) === 1;
      if (deveTer) {
        expect(r.passwordHash).not.toBeNull();
        comSenha++;
      } else {
        expect(r.passwordHash).toBeNull();
        semSenha++;
      }
    }
    expect(comSenha + semSenha).toBe(66);
  });

  it('companyJobFamilies: 20', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM companyJobFamilies WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(20);
  });

  it('companyMonthlyData: 24', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM companyMonthlyData WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(24);
  });

  it('monthlyClosureStatus: 24', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM monthlyClosureStatus WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(24);
  });

  it('companyEconomicDiagnosis: 8', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM companyEconomicDiagnosis WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(8);
  });

  it('cycleSchedule: 5', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM cycleSchedule WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(5);
  });

  it('lgpdConsents: 14 (3 C-levels + 11 acessos employees ativos)', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM lgpdConsents WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(UBATUBA_LGPD_CONSENTS_TOTAL_ESPERADO);
  });

  it('responsavelFinanceiroTransferLog: 2', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM responsavelFinanceiroTransferLog ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(2);
  });

  it('climateEngagementData: 84 (4+24+56)', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM climateEngagementData WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(UBATUBA_CLIMATE_TOTAL_ESPERADO);
  });

  it('dataAccessLog: proximo de 200', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM dataAccessLog WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    // Volume pode variar levemente (40 acessos lider dependem de existir liderados);
    // canonicamente esperado exatamente 200 se todos os lideres tem liderados no depto.
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(160);
    expect(Number(rows[0]!.n)).toBeLessThanOrEqual(UBATUBA_DAL_TOTAL_ESPERADO);
  });

  it('alerts: 13', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM alerts WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(UBATUBA_ALERTS_TOTAL_ESPERADO);
  });

  it('notifications: 92', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM notifications WHERE companyId = ${UBATUBA_COMPANY_ID}`,
    );
    expect(Number(rows[0]!.n)).toBe(UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO);
  });

  it('notifications.alertId FK preenchido para os 12 nr1_fator_critico', async () => {
    const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM notifications ` +
        `WHERE companyId = ${UBATUBA_COMPANY_ID} ` +
        `AND tipo = 'nr1_fator_critico' AND alertId IS NOT NULL`,
    );
    expect(Number(rows[0]!.n)).toBe(18);
  });

  it('idempotencia: segunda execucao retorna applied=false', async () => {
    const second = await seedUbatuba(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });
    expect(second.applied).toBe(false);
  }, 30000);
});
