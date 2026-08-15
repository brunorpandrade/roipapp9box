// ROIP APP 9BOX — teste de integracao idempotencia bit-exact do seedUbatuba
// (ME-080b Dispatch 5, D5.7 canonizado).
//
// Regua canonica RV-03: prova que reset+reseed do Ubatuba produz estado
// bit-exact identico em 2 rodadas sucessivas. Comparacao via SHA-256 de
// SELECT * ORDER BY id de cada tabela.
//
// PROVA NOS DOIS SENTIDOS (RV-03):
//   - CASO BOM: as 14 tabelas populadas pelo seed devem ter SHA-256 identico
//     em ambas as rodadas -> `exit 0`.
//   - CASO RUIM (validado em teste isolado no diretorio unit): defeito
//     injetado que substitui `createdAt` explicito por Date.now() no
//     derivador de climate quebra a idempotencia -> hashes divergem ->
//     `exit != 0`.
//
// Isolamento canonico: base MySQL dedicada `roip_test_ubatuba_idempotency`,
// DROP+CREATE entre rodada A e rodada B para eliminar side-effects.
//
// RV-11: banco MySQL real. RV-15: hashes medidos, nao estimados.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { UBATUBA_COMPANY_ID } from '../../src/db/seed/ubatuba/constants';
import { seedUbatuba } from '../../src/db/seed/ubatuba/loadUbatubaFixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const TEST_DB = 'roip_test_ubatuba_idempotency';

const DEFAULT_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

/**
 * Tabelas populadas pelo seedUbatuba (canonizadas no orquestrador).
 * Comparacao de SHA-256 por SELECT * ORDER BY <chave-canonica> em cada uma.
 */
const UBATUBA_TABLES: readonly { name: string; orderBy: string }[] = [
  { name: 'companies', orderBy: 'id' },
  { name: 'cLevelMembers', orderBy: 'id' },
  { name: 'employees', orderBy: 'id' },
  { name: 'companyJobFamilies', orderBy: 'id' },
  { name: 'companyMonthlyData', orderBy: 'id' },
  { name: 'monthlyClosureStatus', orderBy: 'id' },
  { name: 'companyEconomicDiagnosis', orderBy: 'id' },
  { name: 'cycleSchedule', orderBy: 'id' },
  { name: 'lgpdConsents', orderBy: 'id' },
  { name: 'responsavelFinanceiroTransferLog', orderBy: 'id' },
  { name: 'climateEngagementData', orderBy: 'id' },
  { name: 'dataAccessLog', orderBy: 'id' },
  { name: 'alerts', orderBy: 'id' },
  { name: 'notifications', orderBy: 'id' },
];

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
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await admin.query(
      `CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
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
    database: TEST_DB,
    multipleStatements: true,
  });
  try {
    await conn.query(migrationSql);
    await conn.query(
      `INSERT INTO superAdmins (id, name, email, passwordHash) ` +
        `VALUES (1, 'Fixture Super Admin (idem test)', 'idem-test@roip.local', 'x')`,
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
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  } finally {
    await admin.end();
  }
}

/**
 * Captura SHA-256 canonico do estado de uma tabela restrito por companyId.
 * Ignora colunas nao-deterministicas (passwordHash com salt aleatorio; id
 * autoincrement em `alerts` e `notifications` que sao inseridas em ordem
 * mas com autoincrement dinamico).
 *
 * ESTRATEGIA: filtrar colunas dinamicas ANTES do hash. Para simplificar, o
 * hash e feito sobre JSON.stringify das rows apos remocao de:
 *   - passwordHash (bcrypt tem salt aleatorio)
 *   - id (autoincrement variavel entre rodadas)
 */
async function captureTableHash(
  client: RoipDbClient,
  tableName: string,
  orderBy: string,
  companyId: number,
): Promise<string> {
  const whereCol = tableName === 'companies' ? 'id' : 'companyId';
  const query =
    `SELECT * FROM \`${tableName}\` WHERE \`${whereCol}\` = ${companyId} ` + `ORDER BY ${orderBy}`;
  const [rows] = await client.pool.query<mysql.RowDataPacket[]>(query);

  // Sanitize: remove campos com nao-determinismo esperado.
  const sanitized = rows.map((r) => {
    const c = { ...r };
    delete c.passwordHash;
    delete c.id;
    // Datas sao serializadas via toISOString para consistencia (Buffer em
    // MySQL pode variar por driver).
    for (const k of Object.keys(c)) {
      if (c[k] instanceof Date) {
        c[k] = (c[k] as Date).toISOString();
      }
    }
    return c;
  });

  const serialized = JSON.stringify(sanitized);
  return createHash('sha256').update(serialized).digest('hex');
}

async function fullSeed(client: RoipDbClient): Promise<void> {
  const result = await seedUbatuba(client.db, {
    hashPassword: (plain: string) => bcrypt.hash(plain, 4),
  });
  if (!result.applied) {
    throw new Error(`seedUbatuba nao aplicou: ${result.reason}`);
  }
}

describe('ubatubaReseedIdempotency — RV-03 bit-exact D5.7', () => {
  const cfg = parseDatabaseUrl(DEFAULT_URL);
  let client: RoipDbClient;
  let hashesA: Map<string, string>;
  let hashesB: Map<string, string>;

  beforeAll(async () => {
    // Rodada A.
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    let dbUrl = buildUrl(cfg, TEST_DB);
    client = createDbClient(dbUrl);
    await fullSeed(client);

    hashesA = new Map();
    for (const t of UBATUBA_TABLES) {
      hashesA.set(t.name, await captureTableHash(client, t.name, t.orderBy, UBATUBA_COMPANY_ID));
    }
    await closeDbClient(client);

    // Rodada B (DROP+CREATE+migration+seed novamente).
    await dropAndCreateDb(cfg);
    await applyMigrationAndSeedSuperAdmin(cfg);
    dbUrl = buildUrl(cfg, TEST_DB);
    client = createDbClient(dbUrl);
    await fullSeed(client);

    hashesB = new Map();
    for (const t of UBATUBA_TABLES) {
      hashesB.set(t.name, await captureTableHash(client, t.name, t.orderBy, UBATUBA_COMPANY_ID));
    }
  }, 120000);

  afterAll(async () => {
    if (client) {
      await closeDbClient(client);
    }
    await dropDb(cfg);
  });

  it('CASO BOM: SHA-256 identico em ambas rodadas para todas as 14 tabelas', () => {
    for (const t of UBATUBA_TABLES) {
      const hA = hashesA.get(t.name);
      const hB = hashesB.get(t.name);
      expect(hA, `hash ausente para ${t.name} na rodada A`).toBeDefined();
      expect(hB, `hash ausente para ${t.name} na rodada B`).toBeDefined();
      expect(
        hA,
        `IDEMPOTENCIA QUEBRADA: tabela=${t.name} ` +
          `hashA=${hA?.slice(0, 12)}... hashB=${hB?.slice(0, 12)}...`,
      ).toBe(hB);
    }
  });

  it('hashes das 14 tabelas registrados (sanity: nao ha string vazia)', () => {
    for (const [name, hash] of hashesA.entries()) {
      expect(hash.length, `hash vazio para ${name}`).toBe(64); // SHA-256 hex
    }
  });
});
