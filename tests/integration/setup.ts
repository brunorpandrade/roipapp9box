// ROIP APP 9BOX — setup global do vitest (ME-010).
//
// Roda uma unica vez ANTES de todos os testes de integracao e uma vez
// DEPOIS de todos. Ciclo:
//
//   1. DROP+CREATE da base efemera `roip_test` (S007 estendido — o passo 9
//      da regua §4 nao arrasta estado entre rodadas).
//   2. Aplica `src/db/migrations/0000_canonical.sql` inteira. Isso semeia
//      os 19 departments (§15.1) e cria as 53 tabelas com as 107 FKs.
//   3. Semeia UMA fixture de `superAdmins` (id=1). Necessaria porque
//      `companyJobFamilies.updatedBy` referencia `superAdmins.id`. Os
//      testes reutilizam esse id.
//   4. Ao final, DROP da base — mesma politica de nao arrastar estado.
//
// Convivencia com `verify-migration.mjs` (passo 8): as duas bases sao
// distintas (`roip_validate` vs `roip_test`). O passo 8 valida invariantes;
// o passo 9 valida a camada de acesso a dados. Rodam em sequencia sem
// colisao.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');

const TEST_DB = 'roip_test';
const DEFAULT_URL = `mysql://root:roip_local_root@127.0.0.1:3306/${TEST_DB}`;

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

function getConfig(): ParsedUrl {
  const raw = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? DEFAULT_URL;
  return parseDatabaseUrl(raw);
}

async function dropDatabase(cfg: ParsedUrl): Promise<void> {
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

export default async function globalSetup(): Promise<() => Promise<void>> {
  const cfg = getConfig();

  // 1) DROP + CREATE da base efemera.
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

  // 2) Aplica a migration canonica inteira (mesmo padrao do verify-migration).
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
    // 3) Semeia UMA fixture de superAdmins para atender FKs de companyJobFamilies.
    await conn.query(
      `INSERT INTO superAdmins (id, name, email, passwordHash) ` +
        `VALUES (1, 'Fixture Super Admin (test)', 'fixture-test@roip.local', 'x')`,
    );
  } finally {
    await conn.end();
  }

  // Retorna teardown: chamado uma vez apos TODOS os testes.
  return async () => {
    await dropDatabase(cfg);
  };
}
