#!/usr/bin/env node
// ROIP APP 9BOX — verify-migration (ME-003).
// Passo 7 da regua permanente §4: aplica src/db/migrations/0000_canonical.sql
// contra MySQL real e mede os invariantes §20 (53 tabelas, 691 colunas,
// 107 FKs, 19 departments). Falha (RC != 0) se algo divergir ou se a
// migration nao aplicar limpa.
//
// Fundacao: MySQL 8 nativo disponivel em 127.0.0.1:3306 (Docker por D002-B).
// Usa DATABASE_URL_VALIDATE se definida; caso contrario, cai para a base
// canonica `roip_validate` com credenciais do .env.example.
//
// Ciclo:
//   1. Conecta ao server (sem base) e DROP+CREATE da base de validacao.
//   2. Aplica a migration inteira contra a base.
//   3. Mede os quatro invariantes contra information_schema.
//   4. Compara literalmente com 53/691/107/19.
//   5. DROP da base ao fim (sucesso ou falha).
//
// Racional: rodar contra base efemera evita colisao com bases de
// desenvolvimento e com o banco de aplicacao. A base recriada a cada rodada
// garante que a medicao nao arrasta estado de rodadas anteriores.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');
const VALIDATE_DB = 'roip_validate';

const EXPECTED = {
  tables: 53,
  columns: 691,
  fks: 107,
  departments: 19,
};

function parseDatabaseUrl(url) {
  // mysql://user:pass@host:port/db
  const m = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)(?:\/([^?]+))?/);
  if (!m) {
    throw new Error(`DATABASE_URL invalida: ${url}`);
  }
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: Number(m[4]),
    database: m[5] || null,
  };
}

function getConnectionConfig() {
  const raw =
    process.env.DATABASE_URL_VALIDATE ||
    process.env.DATABASE_URL ||
    `mysql://root:roip_local_root@127.0.0.1:3306/${VALIDATE_DB}`;
  const parsed = parseDatabaseUrl(raw);
  // Forca sempre a base efemera; ignora qualquer base declarada na URL.
  parsed.database = VALIDATE_DB;
  return parsed;
}

async function main() {
  const cfg = getConnectionConfig();

  // Conexao 1: server sem base — para DROP/CREATE.
  const server = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    multipleStatements: true,
  });

  try {
    await server.query(`DROP DATABASE IF EXISTS \`${VALIDATE_DB}\``);
    await server.query(
      `CREATE DATABASE \`${VALIDATE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } catch (err) {
    await server.end();
    console.error(`FAIL: preparo da base ${VALIDATE_DB} falhou: ${err.message}`);
    process.exit(1);
  }

  await server.end();

  // Conexao 2: base efemera — para aplicar migration e medir.
  const db = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: VALIDATE_DB,
    multipleStatements: true,
  });

  let migrationSql;
  try {
    migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  } catch (err) {
    await db.end();
    console.error(`FAIL: leitura da migration falhou: ${err.message}`);
    process.exit(1);
  }

  try {
    await db.query(migrationSql);
  } catch (err) {
    await db.end();
    await dropDb(cfg);
    console.error(`FAIL: aplicacao da migration falhou: ${err.message}`);
    process.exit(1);
  }

  let measured;
  try {
    const [tRows] = await db.query(
      'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',
      [VALIDATE_DB],
    );
    const [cRows] = await db.query(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?',
      [VALIDATE_DB],
    );
    const [fkRows] = await db.query(
      'SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE ' +
        'WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',
      [VALIDATE_DB],
    );
    const [dRows] = await db.query('SELECT COUNT(*) AS n FROM departments');
    measured = {
      tables: Number(tRows[0].n),
      columns: Number(cRows[0].n),
      fks: Number(fkRows[0].n),
      departments: Number(dRows[0].n),
    };
  } catch (err) {
    await db.end();
    await dropDb(cfg);
    console.error(`FAIL: medicao de invariantes falhou: ${err.message}`);
    process.exit(1);
  }

  await db.end();
  await dropDb(cfg);

  const divergencias = [];
  for (const k of Object.keys(EXPECTED)) {
    if (measured[k] !== EXPECTED[k]) {
      divergencias.push(`${k}: esperado=${EXPECTED[k]} medido=${measured[k]}`);
    }
  }

  if (divergencias.length > 0) {
    console.error('FAIL: invariantes §20 divergentes:');
    for (const d of divergencias) console.error(`  - ${d}`);
    process.exit(1);
  }

  console.log(
    `OK — migration aplicada e invariantes §20 batem: ` +
      `tabelas=${measured.tables}/${EXPECTED.tables}, ` +
      `colunas=${measured.columns}/${EXPECTED.columns}, ` +
      `fks=${measured.fks}/${EXPECTED.fks}, ` +
      `depts=${measured.departments}/${EXPECTED.departments}`,
  );
  process.exit(0);
}

async function dropDb(cfg) {
  try {
    const server = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
    });
    await server.query(`DROP DATABASE IF EXISTS \`${VALIDATE_DB}\``);
    await server.end();
  } catch {
    /* limpeza best-effort */
  }
}

main().catch((err) => {
  console.error(`FAIL: excecao nao tratada: ${err.message}`);
  process.exit(1);
});
