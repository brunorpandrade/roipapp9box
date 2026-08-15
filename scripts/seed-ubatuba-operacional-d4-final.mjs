#!/usr/bin/env node
// ROIP APP 9BOX — seed operacional Bebidas Ubatuba Dispatch 4-final
// (ME-080e D4-final). Consolida D4+D5: popula 12 tabelas restantes
// (instrumentos + agregados + COPSOQ + termination) = 22252 rows.
//
// Idempotente por tabela.

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
console.log('[seed-ubatuba-op-d4-final] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-ubatuba-operacional-d4-final.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-ubatuba-op-d4-final: ${err.message}`);
  process.exit(1);
});
