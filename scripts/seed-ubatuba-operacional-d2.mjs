#!/usr/bin/env node
// ROIP APP 9BOX — seed operacional Bebidas Ubatuba Dispatch 2
// (ME-080e D2). Popula performanceData (1210) + performanceVariableData
// (4840) + performanceQuarterlyData (415) = 6465 rows.
//
// Executa uma unica vez em cada base para adicionar as 3 tabelas do
// performance trio. Idempotente por tabela: segunda execucao detecta
// contagens ja preenchidas e skipa.
//
// Prerrequisitos canonicos:
//   - `DATABASE_URL` obrigatoria; aborta com RC=2 se ausente.
//   - Ubatuba estrutural ja aplicada (ME-080b).
//   - Nao depende de D1 — pode rodar antes ou depois.
//
// Chamador canonico (RV-13): `npm run seed:ubatuba:op-d2` (registrado em
// package.json nesta ME-080e D2) + tests/integration/
// ubatubaOperacionalD2Seed.test.ts.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }
  return url;
}

resolveDatabaseUrl();
console.log('[seed-ubatuba-op-d2] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-ubatuba-operacional-d2.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-ubatuba-op-d2: ${err.message}`);
  process.exit(1);
});
