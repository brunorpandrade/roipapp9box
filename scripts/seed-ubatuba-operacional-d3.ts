// ROIP APP 9BOX — entry point TypeScript do seed operacional Ubatuba
// Dispatch 3 (ME-080e D3).

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  UbatubaOperacionalD3PreconditionError,
  seedUbatubaOperacionalD3,
} from '../src/db/seed/ubatuba/seedUbatubaOperacionalD3';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log('[seed-ubatuba-op-d3] Iniciando. Verificando idempotencia por tabela...');
  const client = createDbClient(url);

  try {
    const result = await seedUbatubaOperacionalD3(client.db);

    if (!result.applied) {
      console.log(`[seed-ubatuba-op-d3] IDEMPOTENTE: ${result.reason ?? ''}`);
      if (result.skippedTables.length > 0) {
        console.log(`[seed-ubatuba-op-d3] Tabelas ja semeadas: ${result.skippedTables.join(', ')}`);
      }
      process.exit(0);
    }

    console.log('[seed-ubatuba-op-d3] APLICADO. Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts)) {
      console.log(`  ${table}: ${count}`);
    }
    if (result.skippedTables.length > 0) {
      const skipList = result.skippedTables.join(', ');
      console.log(`[seed-ubatuba-op-d3] Tabelas skipadas (ja presentes): ${skipList}`);
    }
    console.log('[seed-ubatuba-op-d3] DONE');
    process.exit(0);
  } catch (err) {
    if (err instanceof UbatubaOperacionalD3PreconditionError) {
      console.error(`FAIL seed-ubatuba-op-d3 (pre-condicao): ${err.message}`);
      process.exit(3);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL seed-ubatuba-op-d3: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
