#!/usr/bin/env node
// ROIP APP 9BOX — ME-REPROC-IASOC: wrapper .mjs que delega execucao a
// `tsx scripts/reprocess-ia-soc-inconsistentes.ts`. Padrao canonico do
// repo para scripts que tocam o banco (seed/reset-reseed/reproject);
// preserva superficie minima e nao introduz loader ESM in-process.
//
// Repassa os argumentos extras (ex.: `--apply`) ao subprocess tsx.
//
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso:
//   npm run reprocess:ia-soc            (dry-run)
//   npm run reprocess:ia-soc -- --apply (aplica de verdade)

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
console.log('[reprocess-ia-soc] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const entryScript = join(__dirname, 'reprocess-ia-soc-inconsistentes.ts');
const extraArgs = process.argv.slice(2);

const child = spawn(tsxBin, [entryScript, ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL reprocess-ia-soc: ${err.message}`);
  process.exit(1);
});
