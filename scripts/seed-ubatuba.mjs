#!/usr/bin/env node
// ROIP APP 9BOX — seed da fixture Bebidas Ubatuba Ltda. (ME-080b Dispatch 5).
//
// Executa uma unica vez (ou em ambiente de desenvolvimento) para semear a
// empresa canonica Bebidas Ubatuba Ltda. (companies.id=2) e todas as tabelas
// correlatas listadas em `src/db/seed/ubatuba/loadUbatubaFixtures.ts`.
// Idempotente por design: segunda execucao detecta que companies.id=2 ja existe
// e retorna sem tocar a base.
//
// Prerrequisito canonico: seedNativa (companies.id=1) NAO e obrigatorio. Ubatuba
// e uma empresa independente com IDs proprios (cLevelMembers 4-6, employees
// 70-135). Rodar seedNativa antes ou depois nao afeta o resultado.
//
// Politicas canonicas:
//   - `DATABASE_URL` obrigatoria; aborta com RC=2 se ausente.
//   - bcrypt runtime cost 10 (S010) para os 3 C-levels + acessos employees
//     (isLider || isRH || isResponsavelFinanceiro).
//   - Idempotencia por companies.id=2: SELECT antes do INSERT.
//   - `isDemo=true` em companies para desviar dos motores automaticos.
//
// Chamador canonico (RV-13): `npm run seed:ubatuba` (registrado em package.json
// nesta ME-080b Dispatch 5) + tests/integration/ubatubaSeed.test.ts.
//
// Estrategia de carga TypeScript: mesmo padrao de seed-nativa.mjs — wrapper
// .mjs delega a subprocess `tsx scripts/seed-ubatuba.ts`.

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
console.log('[seed-ubatuba] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'seed-ubatuba.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL seed-ubatuba: ${err.message}`);
  process.exit(1);
});
