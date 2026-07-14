// ROIP APP 9BOX — cliente Drizzle (ME-010).
//
// Factory unica de cliente Drizzle sobre `mysql2/promise`. Toda persistencia
// no repo passa por aqui; RV-12 (zero SQL cru fora de src/db/schema e
// src/db/migrations) e RV-13 (motor com chamador) sao mantidos porque:
//
// - Retornamos exclusivamente a instancia `db` do drizzle-orm/mysql2, cuja
//   API eh tipada contra o schema reexportado por `./schema`. Chamadores
//   nao usam `pool.query` nem execucao crua diretamente — o padrao proibido
//   pela `check-no-raw-sql.sh` (RV-12) nao pode aparecer no codigo.
// - `createDbClient` e `closeDbClient` sao consumidas por
//   `tests/integration/setup.ts` (setup global) e pelos testes de
//   integracao; o script `check-no-dead-exports.sh` (RV-13) nao aplica a
//   `src/db/client.ts`, mas mantemos a disciplina: cada export tem
//   consumidor real na propria ME-010.

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';

import * as schema from './schema';

export type RoipDatabase = MySql2Database<typeof schema>;

export interface RoipDbClient {
  db: RoipDatabase;
  pool: Pool;
}

/**
 * Cria uma instancia Drizzle sobre um pool `mysql2/promise` derivado da URL
 * fornecida. Nao ha singleton: o teste de integracao usa DATABASE_URL_TEST,
 * o script de validacao usa DATABASE_URL_VALIDATE, e a aplicacao usara
 * DATABASE_URL — cada consumidor decide.
 */
export function createDbClient(url: string): RoipDbClient {
  const pool = mysql.createPool({
    uri: url,
    multipleStatements: false,
    supportBigNumbers: true,
    decimalNumbers: false,
    dateStrings: false,
  });
  const db = drizzle(pool, { schema, mode: 'default' });
  return { db, pool };
}

/**
 * Fecha o pool subjacente. Chamada obrigatoria ao fim do processo para nao
 * pendurar conexoes ativas (o vitest global teardown chama).
 */
export async function closeDbClient(client: RoipDbClient): Promise<void> {
  await client.pool.end();
}
