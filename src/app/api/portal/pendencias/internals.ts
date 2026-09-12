// ROIP APP 9BOX — internals do Route Handler
// `GET /api/portal/pendencias` (ME-B10-01, S250 Opção B).
//
// Padrão S366: mensagens canônicas + estado privado do dbClient
// separados do arquivo `route.ts` para conformidade Next 15 App Router
// (o handler exporta somente `GET`).

import { closeDbClient, createDbClient, type RoipDbClient } from '../../../../db/client';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';

// ============================================================
// Mensagens canônicas
// ============================================================

export const MSG_MISSING_TOKEN_PORTAL_PENDENCIAS = 'Token de sessão ausente ou inválido.';
export const MSG_INVALID_TOKEN_PORTAL_PENDENCIAS = 'Token de sessão inválido.';
export const MSG_EXPIRED_TOKEN_PORTAL_PENDENCIAS = 'Sessão expirada. Faça login novamente.';

// ============================================================
// dbClient privado (singleton por processo)
// ============================================================

let dbClientSingleton: RoipDbClient | null = null;

export function getDbClient(): RoipDbClient {
  if (dbClientSingleton === null) {
    dbClientSingleton = createDbClient(resolveDatabaseUrl());
  }
  return dbClientSingleton;
}

/** Escape hatch canônico para testes (padrão S366 bit-a-bit). */
export function _resetDbClientForTests(): void {
  if (dbClientSingleton !== null) {
    void closeDbClient(dbClientSingleton);
  }
  dbClientSingleton = null;
}

/** Escape hatch canônico para injeção de dbClient em testes. */
export function _setDbClientForTests(client: RoipDbClient): void {
  dbClientSingleton = client;
}
