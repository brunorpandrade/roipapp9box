#!/usr/bin/env node
// ROIP APP 9BOX — reset+reseed standalone Bebidas Ubatuba
// (ME-080b Dispatch 5, canonizado por CC075/D5.3).
//
// Escopo canonico: apagar TODOS os dados da empresa companies.id=2 (Bebidas
// Ubatuba) das tabelas populadas pelo seed Ubatuba, e reaplicar o seed a
// partir das constantes canonicas. Idempotencia bit-exact garantida (rodar
// 2x produz mesmo SHA-256 por tabela).
//
// NAO TOCA na Nativa Alimentos (companies.id=1) nem em qualquer outra
// empresa. O DELETE e restrito por WHERE companyId=UBATUBA_COMPANY_ID.
//
// FOREIGN_KEY_CHECKS=0 canonicamente aceito (D5.8 aprovado) — isolado a este
// script standalone, permite DELETE em ordem simplificada sem se preocupar
// com FKs entre as tabelas Ubatuba. Rehabilitado imediatamente antes do
// seed reaplicar.
//
// Prerrequisito: `DATABASE_URL` obrigatoria; aborta com RC=2 se ausente.
//
// Uso: `npm run reset-reseed:ubatuba` (registrado em package.json nesta ME).
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
console.log('[reset-reseed-ubatuba] DATABASE_URL detectada; delegando a subprocess tsx.');

const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const seedScript = join(__dirname, 'reset-reseed-ubatuba.ts');

const child = spawn(tsxBin, [seedScript], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  console.error(`FAIL reset-reseed-ubatuba: ${err.message}`);
  process.exit(1);
});
