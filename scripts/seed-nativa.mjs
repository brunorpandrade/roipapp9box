#!/usr/bin/env node
// ROIP APP 9BOX — seed da fixture Nativa Alimentos Ltda. (ME-068).
//
// Executa uma unica vez no deploy real (ou em ambiente de desenvolvimento)
// para semear a empresa-demo canonica Nativa Alimentos Ltda. e todas as
// tabelas correlatas. Idempotente por design: segunda execucao detecta que
// `companies.id=1` ja existe e retorna sem tocar a base.
//
// Fonte canonica bit-exact: EMPRESA_DEMO_NATIVA.md v1.1 + 20 JSONs pinados
// por SHA-256 em `src/db/seed/nativa/manifest.sha256.ts`.
//
// Politicas canonicas:
//   - `DATABASE_URL` obrigatoria; aborta com RC=2 se ausente.
//   - bcrypt runtime cost 12 (S010) para 14 acessos + 3 C-levels.
//   - Idempotencia por companies.id=1: SELECT antes do INSERT; se existe,
//     nao altera nada.
//   - RV-02: SHA-256 dos 20 JSONs validados ANTES de qualquer INSERT.
//     Divergencia = ABORT (throw canonico).
//   - `isDemo=true` em companies para desviar dos motores automaticos
//     (E-068-11).
//
// Chamador canonico (RV-13): `npm run seed:nativa` (registrado em
// package.json na mesma ME-068) + tests/integration/nativaSeed.test.ts.
//
// Estrategia de carga TypeScript: este wrapper .mjs delega a execucao real
// a um subprocess `tsx scripts/seed-nativa.ts`. Padrao canonico do repo
// para nao introduzir loader ESM in-process (menos superficie de falha
// que `tsImport`). tsx@4.23.11 e devDependency canonica ja fixada.

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
console.log('[seed-nativa] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-nativa.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-nativa: ${err.message}`);
  process.exit(1);
});
