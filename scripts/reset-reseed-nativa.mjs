#!/usr/bin/env node
// ROIP APP 9BOX — reset+reseed standalone Nativa Alimentos
// (ME-fila7 — re-abertura completa apos correcao dos mappers de plenitude e
// Radar NR-1).
//
// Escopo: apagar TODOS os dados da empresa companies.id=1 (Nativa Alimentos)
// das tabelas com companyId + employeeLeaderHistory + companies, e reaplicar
// o seed a partir dos fixtures pinados com o loader corrigido.
//
// NAO TOCA na Bebidas Ubatuba (companies.id=2) nem no super-admin. Todo
// DELETE e restrito por WHERE companyId=1 (companies por id=1).
//
// FOREIGN_KEY_CHECKS=0 isolado a este script standalone, rehabilitado antes
// do reseed.
//
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso: `npm run reset-reseed:nativa`.
//
// IMPORTANTE: nao rodar em producao com clientes reais. Pre-first-client only.

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
console.log('[reset-reseed-nativa] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'reset-reseed-nativa.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL reset-reseed-nativa: ${err.message}`);
  process.exit(1);
});
