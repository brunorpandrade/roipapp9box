#!/usr/bin/env node
// ROIP APP 9BOX — reprojecao canonica de performanceQuarterlyData da
// Nativa (ME-1.4b — regeneracao do fixture via motor v2 TS canonico).
//
// Wrapper .mjs que delega execucao a `tsx scripts/reproject-nativa-
// performance-quarterly.ts`. Padrao canonico do repo para scripts
// seed/reset-reseed; preserva superficie minima.
//
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso: `npm run reproject:nativa:performance-quarterly`.

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
console.log('[reproject-nativa-pq] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const entryScript = join(__dirname, 'reproject-nativa-performance-quarterly.ts');

const child = spawn(tsxBin, [entryScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL reproject-nativa-pq: ${err.message}`);
  process.exit(1);
});
