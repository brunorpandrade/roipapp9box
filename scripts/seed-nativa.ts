// ROIP APP 9BOX — entry point TypeScript do seed Nativa (ME-068).
//
// Executado via `tsx` a partir do wrapper `seed-nativa.mjs`. Importa
// diretamente `seedNativa` de `src/db/seed/nativa/loadFixtures.ts` e o
// cliente Drizzle canonico. Nenhuma logica de negocio aqui — apenas
// bootstrap, execucao e logging.
//
// RV-13: chamado por seed-nativa.mjs. Nao publicado como export.

import bcrypt from 'bcryptjs';

import { closeDbClient, createDbClient } from '../src/db/client';
import { seedNativa } from '../src/db/seed/nativa/loadFixtures';

const BCRYPT_COST_PRODUCTION = 12;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log('[seed-nativa] Iniciando. Verificando idempotencia...');
  const client = createDbClient(url);

  try {
    const result = await seedNativa(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, BCRYPT_COST_PRODUCTION),
    });

    if (!result.applied) {
      console.log(`[seed-nativa] IDEMPOTENTE: ${result.reason ?? ''}`);
      process.exit(0);
    }

    console.log('[seed-nativa] APLICADO. Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts ?? {})) {
      console.log(`  ${table}: ${count}`);
    }
    console.log('[seed-nativa] DONE');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL seed-nativa: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
