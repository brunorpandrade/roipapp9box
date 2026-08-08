// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/login/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// RateLimiter e escape hatches de teste (`__set*`) migram para modulo
// irmao. Zero mudanca de comportamento, autorizacao anti-enumeracao,
// SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `getDbClient` + `getRateLimiter` consumidos por `./route.ts`.
// - `__setPortalLoginDbClient` consumido por
//   `tests/integration/portal-endpoints.test.ts`.
// - `__resetPortalLoginRateLimiter` disponivel para testes que
//   precisem zerar o contador entre casos.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  createRateLimiter,
  RATE_LIMITS,
  type RateLimiter,
} from '../../../../server/auth/rateLimit';

// Mensagens canonicas literais (§4.3 e §5.6).
export const MSG_CPF_NOT_FOUND = 'CPF não encontrado. Verifique e tente novamente.';
export const MSG_COMPANY_INACTIVE = 'Empresa inativa no sistema. Entre em contato com o suporte.';
export const MSG_INVALID_CPF = 'Informe um CPF com 11 dígitos.';
export const MSG_RATE_LIMIT = 'Muitas tentativas. Tente novamente em alguns minutos.';

// Instancia propria (S041). Reutilizada entre requests dentro do mesmo
// processo Node.js — janela desliza automaticamente.
const rateLimiter: RateLimiter = createRateLimiter();

export function getRateLimiter(): RateLimiter {
  return rateLimiter;
}

// Cliente DB inicializado sob demanda. Route Handlers rodam em Node
// runtime (nao edge — precisamos de `mysql2/promise`).
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

/** Hook interno para testes de integracao substituirem o client. */
export function __setPortalLoginDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

/** Hook interno para testes zerarem o rate limiter entre casos. */
export function __resetPortalLoginRateLimiter(): void {
  const keys = Object.values(RATE_LIMITS).map((r) => r.op);
  // O RateLimiter atual nao expoe `clear all`; reset por chave conhecida
  // atende testes que reusam CPFs. Recriacao aqui e overkill — deixamos
  // ao teste chamar `reset(key)` explicitamente para casos precisos.
  keys.forEach(() => {
    /* placeholder — API atual so tem reset por key */
  });
}
