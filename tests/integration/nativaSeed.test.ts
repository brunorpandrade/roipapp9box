// ROIP APP 9BOX — teste de integracao do seedNativa (ME-068).
//
// Cobre invariantes canonicas bit-exact §18.4 do EMPRESA_DEMO_NATIVA.md v1.1:
//   - companies: 1 linha (id=1, isDemo=true)
//   - cLevelMembers: 3
//   - employees: 66
//   - companyJobFamilies: 20
//   - employeeGoals: 192
//   - employeeLeaderHistory: 68
//   - lgpdConsents: 14
//   - responsavelFinanceiroTransferLog: 2
//   - companyMonthlyData: 24
//   - monthlyClosureStatus: 24
//   - companyEconomicDiagnosis: 8
//   - cycleSchedule: 5
//   - individualProfilePlaceholders: 69
//   - individualProfileAssessments: 66
//   - individualProfileScores: 66
//   - performanceData: 1210
//   - performanceVariableData: 4840
//   - performanceQuarterlyData: 415
//   - instrumentA_responses: 8020
//   - instrumentC_assessments: 8020
//   - plenitudeData: 401
//   - nineBoxClassifications: 387
//   - instrumentD_responses: 4000
//   - iqlData: 45
//   - copsoqCycles: 1
//   - copsoqCycleSnapshot: 51 (Opção A ME-068a-fix)
//   - copsoq_responses: 1248 (Opção A ME-068a-fix)
//   - copsoqFactorScores: 56
//   - nr1AreaDivergenceAnalysis: 6
//   - employeeTerminationEvents: 13
//
// Isolamento canonico: o teste usa uma BASE MYSQL DEDICADA `roip_test_nativa`,
// criada em `beforeAll` e dropada em `afterAll`. Nao ha interferencia com a
// `roip_test` do setup global (usada pelos demais testes de integracao).
//
// RV-11: banco MySQL real, contagens medidas via COUNT(*) autentico.
// RV-13: chamador real de seedNativa + validateNativaManifest.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies } from '../../src/db/schema';
import {
  NATIVA_COMPANY_ID,
  NATIVA_UNIVERSAL_PASSWORD,
  seedNativa,
} from '../../src/db/seed/nativa/loadFixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const NATIVA_TEST_DB = 'roip_test_nativa';

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
    await admin.query(`DROP DATABASE IF EXISTS \`${NATIVA_TEST_DB}\``);
    await admin.query(
      `CREATE DATABASE \`${NATIVA_TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
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
    database: NATIVA_TEST_DB,
    multipleStatements: true,
  });
  try {
    await conn.query(migrationSql);
    // Semeia superAdmin id=1 (referenciado por companyJobFamilies.updatedBy
    // e responsavelFinanceiroTransferLog.actorSuperAdminId).
    await conn.query(
      `INSERT INTO superAdmins (id, name, email, passwordHash) ` +
        `VALUES (1, 'Fixture Super Admin (nativa test)', 'nativa-test@roip.local', 'x')`,
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
    await admin.query(`DROP DATABASE IF EXISTS \`${NATIVA_TEST_DB}\``);
  } finally {
    await admin.end();
  }
}

async function countTable(client: RoipDbClient, tableName: string): Promise<number> {
  // Usamos SQL cru DENTRO do teste apenas para COUNT canonico (RV-12 permite
  // exceção para invariantes de teste). Nome da tabela vem de constante
  // literal do proprio teste — sem risco de injecao.
  const [rows] = await client.pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${tableName}\``,
  );
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

describe('seedNativa — invariantes canonicas bit-exact §18.4 (ME-068)', () => {
  const cfg = parseDatabaseUrl(DEFAULT_URL);
  let client: RoipDbClient;

  beforeAll(async () => {
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    client = createDbClient(buildUrl(cfg, NATIVA_TEST_DB));

    const result = await seedNativa(client.db, {
      // bcrypt runtime cost baixo para testes — 4 acelera de ~2s para ~150ms
      // sem alterar semantica canonica (o hash canonico cost 12 e usado
      // apenas em producao via seed-nativa.mjs).
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });

    if (!result.applied) {
      throw new Error(`beforeAll seedNativa: nao aplicou. reason=${result.reason}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (client) await closeDbClient(client);
    await dropDb(cfg);
  });

  it('company Nativa existe com id=1 e isDemo=true (E-068-11)', async () => {
    const rows = await client.db
      .select({
        id: companies.id,
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
        isDemo: companies.isDemo,
        status: companies.status,
      })
      .from(companies)
      .where(sql`${companies.id} = ${NATIVA_COMPANY_ID}`);

    expect(rows.length).toBe(1);
    const nativa = rows[0]!;
    expect(nativa.id).toBe(1);
    expect(nativa.razaoSocial).toBe('Nativa Alimentos Ltda.');
    expect(nativa.isDemo).toBe(true);
    expect(nativa.status).toBe('ativa');
  });

  it('cLevelMembers = 3 (Ricardo, Patricia, Camila M.)', async () => {
    expect(await countTable(client, 'cLevelMembers')).toBe(3);
  });

  it('employees = 66', async () => {
    expect(await countTable(client, 'employees')).toBe(66);
  });

  it('companyJobFamilies = 20', async () => {
    expect(await countTable(client, 'companyJobFamilies')).toBe(20);
  });

  it('employeeGoals = 192 (E-068-1)', async () => {
    expect(await countTable(client, 'employeeGoals')).toBe(192);
  });

  it('employeeLeaderHistory = 68', async () => {
    expect(await countTable(client, 'employeeLeaderHistory')).toBe(68);
  });

  it('lgpdConsents = 14', async () => {
    expect(await countTable(client, 'lgpdConsents')).toBe(14);
  });

  it('responsavelFinanceiroTransferLog = 2', async () => {
    expect(await countTable(client, 'responsavelFinanceiroTransferLog')).toBe(2);
  });

  it('companyMonthlyData = 24', async () => {
    expect(await countTable(client, 'companyMonthlyData')).toBe(24);
  });

  it('monthlyClosureStatus = 24', async () => {
    expect(await countTable(client, 'monthlyClosureStatus')).toBe(24);
  });

  it('companyEconomicDiagnosis = 8', async () => {
    expect(await countTable(client, 'companyEconomicDiagnosis')).toBe(8);
  });

  it('cycleSchedule = 5', async () => {
    expect(await countTable(client, 'cycleSchedule')).toBe(5);
  });

  it('individualProfilePlaceholders = 69', async () => {
    expect(await countTable(client, 'individualProfilePlaceholders')).toBe(69);
  });

  it('individualProfileAssessments = 66', async () => {
    expect(await countTable(client, 'individualProfileAssessments')).toBe(66);
  });

  it('individualProfileScores = 66', async () => {
    expect(await countTable(client, 'individualProfileScores')).toBe(66);
  });

  it('performanceData = 1210', async () => {
    expect(await countTable(client, 'performanceData')).toBe(1210);
  });

  it('performanceVariableData = 4840 (1210 × 4 vars)', async () => {
    expect(await countTable(client, 'performanceVariableData')).toBe(4840);
  });

  it('performanceQuarterlyData = 415', async () => {
    expect(await countTable(client, 'performanceQuarterlyData')).toBe(415);
  });

  it('instrumentA_responses = 8020', async () => {
    expect(await countTable(client, 'instrumentA_responses')).toBe(8020);
  });

  it('instrumentC_assessments = 8020', async () => {
    expect(await countTable(client, 'instrumentC_assessments')).toBe(8020);
  });

  it('plenitudeData = 401', async () => {
    expect(await countTable(client, 'plenitudeData')).toBe(401);
  });

  it('nineBoxClassifications = 387', async () => {
    expect(await countTable(client, 'nineBoxClassifications')).toBe(387);
  });

  it('instrumentD_responses = 4000', async () => {
    expect(await countTable(client, 'instrumentD_responses')).toBe(4000);
  });

  it('iqlData = 45', async () => {
    expect(await countTable(client, 'iqlData')).toBe(45);
  });

  it('copsoqCycles = 1', async () => {
    expect(await countTable(client, 'copsoqCycles')).toBe(1);
  });

  it('copsoqCycleSnapshot = 51 (Opção A ME-068a-fix: c-levels filtrados)', async () => {
    expect(await countTable(client, 'copsoqCycleSnapshot')).toBe(51);
  });

  it('copsoq_responses = 1248 (Opção A ME-068a-fix: c-levels filtrados)', async () => {
    expect(await countTable(client, 'copsoq_responses')).toBe(1248);
  });

  it('copsoqFactorScores = 56', async () => {
    expect(await countTable(client, 'copsoqFactorScores')).toBe(56);
  });

  it('nr1AreaDivergenceAnalysis = 6', async () => {
    expect(await countTable(client, 'nr1AreaDivergenceAnalysis')).toBe(6);
  });

  it('employeeTerminationEvents = 13', async () => {
    expect(await countTable(client, 'employeeTerminationEvents')).toBe(13);
  });

  it('idempotencia: segunda execucao retorna applied=false', async () => {
    const second = await seedNativa(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, 4),
    });
    expect(second.applied).toBe(false);
    expect(second.reason).toMatch(/ja existe/);
  });

  it('senha canonica NATIVA_UNIVERSAL_PASSWORD e string nao-vazia', () => {
    expect(NATIVA_UNIVERSAL_PASSWORD).toBeTypeOf('string');
    expect(NATIVA_UNIVERSAL_PASSWORD.length).toBeGreaterThan(0);
  });
});
