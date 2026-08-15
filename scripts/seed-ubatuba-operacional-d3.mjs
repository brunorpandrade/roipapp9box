#!/usr/bin/env node
// ROIP APP 9BOX — seed operacional Bebidas Ubatuba Dispatch 3
// (ME-080e D3). Popula individualProfilePlaceholders (69) +
// individualProfileAssessments (66) + individualProfileScores (66) =
// 201 rows.
//
// Idempotente por tabela; requer seed estrutural Ubatuba (ME-080b)
// previamente aplicado. Nao depende de D1/D2 — pode rodar antes ou
// depois.

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
console.log('[seed-ubatuba-op-d3] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-ubatuba-operacional-d3.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-ubatuba-op-d3: ${err.message}`);
  process.exit(1);
});
