// ROIP APP 9BOX — entry point TypeScript do seed Bebidas Ubatuba
// (ME-080b Dispatch 5).
//
// Executado via `tsx` a partir do wrapper `seed-ubatuba.mjs`. Importa
// diretamente `seedUbatuba` de `src/db/seed/ubatuba/loadUbatubaFixtures.ts`
// e o cliente Drizzle canonico. Nenhuma logica de negocio aqui — apenas
// bootstrap, execucao e logging.
//
// RV-13: chamado por seed-ubatuba.mjs. Nao publicado como export.

import bcrypt from 'bcryptjs';

import { closeDbClient, createDbClient } from '../src/db/client';
import { seedUbatuba } from '../src/db/seed/ubatuba/loadUbatubaFixtures';

const BCRYPT_COST_PRODUCTION = 12;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log('[seed-ubatuba] Iniciando. Verificando idempotencia...');
  const client = createDbClient(url);

  try {
    const result = await seedUbatuba(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, BCRYPT_COST_PRODUCTION),
    });

    if (!result.applied) {
      console.log(`[seed-ubatuba] IDEMPOTENTE: ${result.reason ?? ''}`);
      process.exit(0);
    }

    console.log('[seed-ubatuba] APLICADO. Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts ?? {})) {
      console.log(`  ${table}: ${count}`);
    }
    console.log('[seed-ubatuba] DONE');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL seed-ubatuba: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
