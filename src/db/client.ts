// ROIP APP 9BOX — cliente Drizzle (ME-010 + ME-075 S499c + S499d).
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
//
// **ME-075 S499c canonica bit-exact.** L115 canoniza TZ=UTC em toda parte
// do stack. O processo Node ja e coberto por `TZ=UTC`. `timezone: 'Z'`
// no pool instrui o driver mysql2 a interpretar as strings recebidas
// como UTC ao converter para/de Date object.
//
// **ME-075 S499d canonica bit-exact.** Colunas TIMESTAMP do MySQL fazem
// conversao server-side baseada em `SESSION time_zone`. Sem forcar UTC
// na sessao, o server converte para o TZ do host (BRT em macOS local) e
// envia strings BRT que o driver mysql2 interpreta como UTC — drift de
// horas em janelas temporais. Solucao canonica bit-exact: setar
// `SET time_zone='+00:00'` a cada nova conexao do pool via handler
// `on('connection')`. Zero impacto em Railway (MySQL ja em UTC — SET e
// idempotente e reforca a garantia).

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';

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
 *
 * **S499c + S499d canonicas bit-exact.** Combinacao obrigatoria:
 * `timezone: 'Z'` no driver + `SET time_zone='+00:00'` na sessao. Ambos
 * necessarios: driver-side sozinho nao vence a conversao server-side de
 * TIMESTAMP; sessao sozinha depende do driver interpretar UTC.
 */
export function createDbClient(url: string): RoipDbClient {
  const pool = mysql.createPool({
    uri: url,
    multipleStatements: false,
    supportBigNumbers: true,
    decimalNumbers: false,
    dateStrings: false,
    timezone: 'Z',
  });
  // S499d canonica bit-exact — cada nova conexao do pool inicia com
  // session.time_zone = UTC. Fire-and-forget: o `query` retorna promessa,
  // mas nao aguardamos aqui — a conexao ja fica reservada ao consumidor
  // do checkout do pool, que so a usara apos o SET completar.
  pool.on('connection', (conn: PoolConnection) => {
    void conn.query("SET time_zone='+00:00'");
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
