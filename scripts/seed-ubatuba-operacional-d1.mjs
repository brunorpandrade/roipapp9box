#!/usr/bin/env node
// ROIP APP 9BOX — seed operacional Bebidas Ubatuba Dispatch 1
// (ME-080e D1). Popula employeeLeaderHistory (68) + employeeGoals (192).
//
// Executa uma unica vez em cada base para adicionar as duas tabelas
// operacionais criticas de desbloqueio (organograma + metas).
// Idempotente por tabela: segunda execucao detecta contagens ja
// preenchidas e skipa (nenhum INSERT duplicado, nenhuma FK violada).
//
// Prerrequisitos canonicos:
//   - `DATABASE_URL` obrigatoria; aborta com RC=2 se ausente.
//   - Ubatuba estrutural ja aplicada: companies.id=2 + cLevelMembers
//     1001..1003 + employees 1004..1069 presentes. Rodar
//     'npm run seed:ubatuba' antes se necessario.
//
// Chamador canonico (RV-13): `npm run seed:ubatuba:op-d1` (registrado
// em package.json nesta ME-080e D1) +
// tests/integration/ubatubaOperacionalD1Seed.test.ts.
//
// Estrategia de carga TypeScript: mesmo padrao de seed-ubatuba.mjs —
// wrapper .mjs delega a subprocess `tsx scripts/seed-ubatuba-operacional-d1.ts`.

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
console.log('[seed-ubatuba-op-d1] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-ubatuba-operacional-d1.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-ubatuba-op-d1: ${err.message}`);
  process.exit(1);
});
