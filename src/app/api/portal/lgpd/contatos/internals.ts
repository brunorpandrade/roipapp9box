// ROIP APP 9BOX — internals irmao do Route Handler
// `GET /api/portal/lgpd/contatos` (ME-B11.1c, LGPD2).
//
// Padrao canonico S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient e
// escape hatches de teste (`__set*`) migram para modulo irmao. Zero
// mudanca de comportamento, autorizacao (derivada literal do
// portalToken, S343), SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*_LGPD_CONTATOS` consumidos por `./route.ts` (GET).
// - `getDbClient` consumido por `./route.ts` (GET).
// - `__setLgpdContatosDbClient` consumido por
//   `tests/integration/lgpd-contatos-route.test.ts`.

import { createDbClient, type RoipDbClient } from '../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';

// ============================================================
// Mensagens canonicas exportadas (padrao consolidado)
// ============================================================

export const MSG_INVALID_TOKEN_LGPD_CONTATOS = 'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN_LGPD_CONTATOS = 'Sessão expirada. Faça a identificação novamente.';
export const MSG_MISSING_TOKEN_LGPD_CONTATOS = 'Sessão ausente.';
export const MSG_COMPANY_NOT_FOUND_LGPD_CONTATOS = 'Empresa não encontrada.';

// ============================================================
// Cliente de banco injetavel (S036)
// ============================================================

let dbClient: RoipDbClient | null = null;

export function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

/** Hook interno para testes substituirem o client (S036). */
export function __setLgpdContatosDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}
