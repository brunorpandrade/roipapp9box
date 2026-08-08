// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/consent-lgpd/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient e
// escape hatch de teste (`__set*`) migram para modulo irmao. Zero
// mudanca de comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_INVALID_TOKEN` + `MSG_EXPIRED_TOKEN` + `MSG_MISSING_TOKEN`
//   consumidos por `./route.ts` (POST) e tests.
// - `getDbClient` consumido por `./route.ts` (POST).
// - `__setPortalConsentDbClient` consumido por
//   `tests/integration/portal-endpoints.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';

export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

let dbClient: RoipDbClient | null = null;

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

export function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

export function __setPortalConsentDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}
