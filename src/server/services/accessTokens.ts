// ROIP APP 9BOX — service `accessTokens` (ME-012).
//
// Repositorio tipado da tabela canonica `accessTokens` (DOC 01 §4.8). Toda
// persistencia via API tipada do Drizzle — nenhuma execucao crua (RV-12).
// Cada export tem chamador nos testes de integracao da propria ME-012
// (RV-13), e futuramente nos fluxos de first-access, password reset e
// alteracao de email do Bloco B2 (ME-022, DOC 02).
//
// Polimorfismo padrao B (§2.3 e §4.8): `userType` enum
// (`employee | clevel | super_admin`) + `userId` sem FK formal — historico
// sobrevive a delecao do ator. A integridade do par (userType, userId) e
// responsabilidade do caller. Este service nao valida existencia do
// usuario referenciado; e a camada de aplicacao (Bloco B2) que aciona o
// motor de lookup em `employees`, `cLevelMembers` ou `superAdmins` conforme
// `userType`.
//
// Regras nao implementadas neste service (vivem em ME-022 / DOC 02):
// - Geracao criptografica de `token` (256 bits, base64url); aqui apenas
//   se armazena a string ja gerada.
// - Politica canonica `expiresAt = createdAt + 7 dias`.
// - Hash de senha e verificacao de senha temporaria.
// Estes primitivos servem apenas para persistencia e consulta.

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { accessTokens } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `accessTokens`). */
export type NewAccessToken = typeof accessTokens.$inferInsert;

/**
 * Insere um novo `accessToken`. Retorna o `id` autogerado. Erros de
 * UNIQUE (coluna `token`) sobem como excecoes do mysql2. Nao ha FK
 * formal em (`userType`, `userId`) — padrao B.
 */
export async function createAccessToken(db: RoipDatabase, data: NewAccessToken): Promise<number> {
  const [result] = await db.insert(accessTokens).values(data).$returningId();
  if (!result) {
    throw new Error('createAccessToken: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um accessToken pelo `id`. Retorna `undefined` se nao existir. */
export async function getAccessTokenById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(accessTokens).where(eq(accessTokens.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um accessToken pela string `token` (UNIQUE §4.8). Retorna
 * `undefined` se nao existir. Este e o caminho canonico de verificacao no
 * fluxo de first-access / password reset: o link do email carrega a
 * string, o backend resolve o registro por esta funcao, checa
 * `usedAt IS NULL` e `expiresAt > NOW()` na camada de aplicacao antes de
 * consumir o token via `markTokenAsUsed`.
 */
export async function getAccessTokenByToken(db: RoipDatabase, token: string) {
  const rows = await db.select().from(accessTokens).where(eq(accessTokens.token, token)).limit(1);
  return rows[0];
}

/**
 * Lista tokens ATIVOS (nao usados e nao expirados) de um par (userType,
 * userId), do mais recente ao mais antigo por `id`. Ativo = `usedAt IS
 * NULL` E `expiresAt > referencia` (default: agora). O `now` e injetado
 * para os testes fixarem o instante e evitarem flakes por relogio.
 */
export async function listActiveTokensByUser(
  db: RoipDatabase,
  userType: NewAccessToken['userType'],
  userId: number,
  now: Date = new Date(),
) {
  return await db
    .select()
    .from(accessTokens)
    .where(
      and(
        eq(accessTokens.userType, userType),
        eq(accessTokens.userId, userId),
        isNull(accessTokens.usedAt),
        gt(accessTokens.expiresAt, now),
      ),
    );
}

/**
 * Marca um token como usado, gravando `usedAt`. Idempotencia e
 * responsabilidade do caller: uma segunda chamada sobrescreve o
 * `usedAt` anterior. A prevencao contra reuso vive no fluxo de aplicacao
 * (verificar `usedAt IS NULL` antes de consumir).
 */
export async function markTokenAsUsed(
  db: RoipDatabase,
  id: number,
  usedAt: Date = new Date(),
): Promise<void> {
  await db.update(accessTokens).set({ usedAt }).where(eq(accessTokens.id, id));
}

/**
 * Remove um accessToken pelo `id`. Uso: housekeeping do backend (limpeza
 * periodica de tokens expirados). Nao ha FK apontando para `accessTokens`,
 * portanto a delecao e livre.
 */
export async function deleteAccessTokenById(db: RoipDatabase, id: number): Promise<void> {
  await db.delete(accessTokens).where(eq(accessTokens.id, id));
}
