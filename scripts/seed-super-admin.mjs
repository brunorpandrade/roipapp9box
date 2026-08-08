#!/usr/bin/env node
// ROIP APP 9BOX — seed do Super Admin (CORR-D071).
//
// Executa uma unica vez no deploy real para semear o registro canonico
// unico de `superAdmins` (Bruno Andrade). Fecha D071.
//
// Fonte canonica: DOC 01 §18.1 e §20 item 16. Estrutura da tabela:
// DOC 01 §4.1 (bit-exact ao schema Drizzle src/db/schema/tables.ts:51-57).
//
// Politicas canonicas aplicadas:
//   - `name` e `email` sao hardcoded (DOC 01 §18.1); nao vem de variavel.
//   - Senha vem exclusivamente da variavel de ambiente
//     `SEED_SUPER_ADMIN_PASSWORD` (S426: senha nao mora em codigo nem em
//     repositorio). Deploy aborta com RC=2 se a variavel nao estiver
//     definida.
//   - `DATABASE_URL` idem: exigida; aborta com RC=2 se ausente.
//   - Hash bcrypt com cost 12 (S010; wrapper canonico em
//     src/server/auth/password.ts). A constante e replicada localmente
//     porque este script e ESM puro (.mjs) e nao transpila TypeScript;
//     duplicar 1 constante e o custo aceito por rodar sem transpilacao.
//   - Idempotencia por email: SELECT antes do INSERT; se ja existe,
//     nao altera nada (UPDATE de senha e do fluxo /alterar-senha do
//     DOC 02, nao do seed).
//
// Consulta ao banco via Drizzle tipado sobre schema minimo declarado
// inline (as 5 colunas de `superAdmins`). Nao ha SQL cru; RV-12
// preservada. Nao importa `src/db/schema/tables.ts` porque este e .ts
// e o script e .mjs — reeuso via transpilacao introduziria custo
// desproporcional ao ganho.
//
// Chamador canonico (RV-13): `npm run seed:super-admin` (adicionado ao
// package.json na mesma ME CORR-D071) + o teste de integracao
// `tests/integration/seedSuperAdmin.test.ts` (mesma ME) que exercita
// o script via child_process e prova idempotencia (regua RV-03 no
// caminho de aceite via passo 9 `vitest run` do validate).
//
// Convencao ortografica dos comentarios: sem acentos, alinhada aos
// demais scripts .mjs do repo (verify-migration, verify-schema,
// verify-canonic-consistency).

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

// ---------------------------------------------------------------------
// Constantes canonicas (DOC 01 §18.1 e S010).
// ---------------------------------------------------------------------

/** Nome canonico do unico Super Admin (DOC 01 §18.1). */
const SEED_NAME = 'Bruno Andrade';

/** E-mail canonico do unico Super Admin (DOC 01 §18.1). */
const SEED_EMAIL = 'brunorpandrade@gmail.com';

/**
 * Custo canonico do bcrypt em producao (S010). Fonte autoritativa:
 * `src/server/auth/password.ts` — BCRYPT_COST. Duplicado aqui por ser
 * .mjs (ver cabecalho).
 */
const BCRYPT_COST = 12;

// ---------------------------------------------------------------------
// Schema Drizzle minimo (5 colunas — bit-exact ao DOC 01 §4.1 e ao
// schema canonico src/db/schema/tables.ts:51-57).
// ---------------------------------------------------------------------

const superAdmins = mysqlTable('superAdmins', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('passwordHash', { length: 255 }).notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ---------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------

/**
 * Registra mensagem canonica no stdout com prefixo estavel para tracing
 * operacional (facilita filtragem em logs Railway).
 */
function log(msg) {
  console.log(`[seed-super-admin] ${msg}`);
}

/**
 * Registra erro canonico no stderr com prefixo estavel.
 */
function err(msg) {
  console.error(`[seed-super-admin] ${msg}`);
}

// ---------------------------------------------------------------------
// Entrada.
// ---------------------------------------------------------------------

async function main() {
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!password || password.length === 0) {
    err('SEED_SUPER_ADMIN_PASSWORD nao definida. Abortando (DOC 01 §18.1).');
    process.exit(2);
  }

  if (!databaseUrl || databaseUrl.length === 0) {
    err('DATABASE_URL nao definida. Abortando.');
    process.exit(2);
  }

  const pool = mysql.createPool({
    uri: databaseUrl,
    multipleStatements: false,
    supportBigNumbers: true,
    decimalNumbers: false,
    dateStrings: false,
  });

  try {
    const db = drizzle(pool, { schema: { superAdmins }, mode: 'default' });

    const existing = await db
      .select({ id: superAdmins.id })
      .from(superAdmins)
      .where(eq(superAdmins.email, SEED_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      log(`Super admin ja existe (email=${SEED_EMAIL}). Nada a fazer.`);
      return 0;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    await db.insert(superAdmins).values({
      name: SEED_NAME,
      email: SEED_EMAIL,
      passwordHash,
    });

    log(`Super admin criado (email=${SEED_EMAIL}).`);
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((rc) => process.exit(rc ?? 0))
  .catch((e) => {
    err(`Falha nao tratada: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
