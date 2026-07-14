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
