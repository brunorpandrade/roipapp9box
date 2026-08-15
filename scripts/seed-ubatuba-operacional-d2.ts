// ROIP APP 9BOX — entry point TypeScript do seed operacional Ubatuba
// Dispatch 2 (ME-080e D2).
//
// Executado via `tsx` a partir do wrapper `seed-ubatuba-operacional-d2.mjs`.
// Importa `seedUbatubaOperacionalD2` e cliente Drizzle canonico.
// Nenhuma logica de negocio aqui — apenas bootstrap, execucao e logging.
//
// RV-13: chamado por seed-ubatuba-operacional-d2.mjs.

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  UbatubaOperacionalD2PreconditionError,
  seedUbatubaOperacionalD2,
} from '../src/db/seed/ubatuba/seedUbatubaOperacionalD2';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log('[seed-ubatuba-op-d2] Iniciando. Verificando idempotencia por tabela...');
  const client = createDbClient(url);

  try {
    const result = await seedUbatubaOperacionalD2(client.db);

    if (!result.applied) {
      console.log(`[seed-ubatuba-op-d2] IDEMPOTENTE: ${result.reason ?? ''}`);
      if (result.skippedTables.length > 0) {
        console.log(`[seed-ubatuba-op-d2] Tabelas ja semeadas: ${result.skippedTables.join(', ')}`);
      }
      process.exit(0);
    }

    console.log('[seed-ubatuba-op-d2] APLICADO. Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts)) {
      console.log(`  ${table}: ${count}`);
    }
    if (result.skippedTables.length > 0) {
      const skipList = result.skippedTables.join(', ');
      console.log(`[seed-ubatuba-op-d2] Tabelas skipadas (ja presentes): ${skipList}`);
    }
    console.log('[seed-ubatuba-op-d2] DONE');
    process.exit(0);
  } catch (err) {
    if (err instanceof UbatubaOperacionalD2PreconditionError) {
      console.error(`FAIL seed-ubatuba-op-d2 (pre-condicao): ${err.message}`);
      process.exit(3);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL seed-ubatuba-op-d2: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
