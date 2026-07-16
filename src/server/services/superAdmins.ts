// ROIP APP 9BOX — service `superAdmins` (ME-012).
//
// Repositorio tipado da tabela canonica `superAdmins` (DOC 01 §4.1). Toda
// persistencia via API tipada do Drizzle — nenhuma execucao crua (RV-12).
// Cada export tem chamador nos testes de integracao da propria ME-012
// (RV-13), e futuramente no wrapper de autenticacao do Bloco B2 (ME-020,
// ME-022).
//
// A tabela `superAdmins` nao possui tela de cadastro (§4.1 regra 2): os
// registros nascem exclusivamente do seed §18.1. Consequentemente este
// service NAO expoe `createSuperAdmin`, `updateSuperAdmin` nem
// `deleteSuperAdmin` — apenas leitura por id / por email / listagem
// completa (consumida pelo motor de destinatarios do DOC 08 na Fase 8).
//
// Nao ha coluna `status` na tabela (§4.1 regra 1): a regra canonica trata
// todos os registros como ativos. Este service, portanto, nao filtra por
// status em nenhum ponto.

import { asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { superAdmins } from '../../db/schema';

/**
 * Busca um Super Admin pelo `id`. Retorna `undefined` se nao existir. O
 * `id=1` da fixture do `globalSetup` sempre existe no ambiente de teste
 * (ME-010).
 */
export async function getSuperAdminById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(superAdmins).where(eq(superAdmins.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um Super Admin pelo email (UNIQUE §4.1). Retorna `undefined` se
 * nao existir. Consumido pelo fluxo de login unificado + login super admin
 * do Bloco B2 (ME-022, DOC 02).
 */
export async function getSuperAdminByEmail(db: RoipDatabase, email: string) {
  const rows = await db.select().from(superAdmins).where(eq(superAdmins.email, email)).limit(1);
  return rows[0];
}

/**
 * Lista todos os Super Admins em ordem crescente de `id`. Consumida pelo
 * motor de destinatarios de e-mail/notificacao (§4.1 regra 1: ausencia de
 * `status` implica todos ativos) e por telas administrativas de Bruno.
 */
export async function listSuperAdmins(db: RoipDatabase) {
  return await db.select().from(superAdmins).orderBy(asc(superAdmins.id));
}

/**
 * Atualiza o `passwordHash` de um Super Admin. Consumidores canonicos
 * (DOC 02 §4.5, §4.7):
 *
 *   - `auth.resetPassword` (ME-022b): via link `[Esqueci minha senha]` de
 *     `/login-super-admin` (§4.4).
 *   - `auth.changePassword` (ME-022c): via `/alterar-senha` (§4.7).
 *
 * Nao existe `first_access` para Super Admin (S429 canonizada + DOC 02
 * §5.4 lista apenas `password_reset` para superAdmins): Bruno nasce com
 * senha semeada §18.1 DOC 01. A tabela nao tem `passwordSet` — o valor e
 * implicito verdadeiro apos o seed.
 *
 * A troca de `passwordHash` invalida naturalmente todas as sessoes JWT
 * anteriores (§5.7 via S011: o `pwv` do Super Admin e derivado de
 * `passwordHash + email`, logo muda com a troca de senha).
 *
 * Retorna o numero de linhas afetadas.
 */
export async function updateSuperAdminPassword(
  db: RoipDatabase,
  id: number,
  passwordHash: string,
): Promise<number> {
  const [result] = await db.update(superAdmins).set({ passwordHash }).where(eq(superAdmins.id, id));
  return result.affectedRows;
}

/**
 * Atualiza o `email` de um Super Admin. Consumidor canonico exclusivo:
 * `auth.confirmEmailChange` (ME-022c), fluxo §4.9d — o Bloco B do
 * `/alterar-email` (H3) confirma a alteracao clicando no link enviado ao
 * novo endereco. O helper NAO valida formato de e-mail nem verifica
 * disponibilidade — cabe ao caller (o zod da procedure e o passo canonico
 * §4.8 5f garantem novoEmail diferente do atual; a coluna `email` e UNIQUE
 * global no DOC 01 §4.1, entao colisao concorrente sobe como excecao do
 * mysql2 e o caller a mapeia para status canonico `{ status: 'invalido' }`
 * — S030 anti-enumeracao).
 *
 * Efeitos colaterais canonicos (§5.7 via S011): o `pwv` do Super Admin e
 * derivado de `passwordHash + email` (`jwt.ts:currentCredentialVersion`),
 * logo a troca de e-mail muda a derivacao e TODOS os JWTs de sessao em
 * circulacao caem no middleware `authed` — inclusive a sessao que
 * originou a operacao (§5.7 "inclusive a atual"). Nenhum codigo adicional
 * de blacklist e necessario.
 *
 * Retorna o numero de linhas afetadas.
 */
export async function updateSuperAdminEmail(
  db: RoipDatabase,
  id: number,
  email: string,
): Promise<number> {
  const [result] = await db.update(superAdmins).set({ email }).where(eq(superAdmins.id, id));
  return result.affectedRows;
}
