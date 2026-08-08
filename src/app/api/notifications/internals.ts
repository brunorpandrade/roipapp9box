// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/notifications/route.ts` (ME-069, padrao S366).
//
// Origem canonica S366 (ME-069): Route Handler Next 15 App Router
// aceita apenas exports HTTP canonicos (GET/HEAD/OPTIONS/POST/PUT/
// PATCH/DELETE) + Route Segment Config (dynamic/revalidate/runtime/
// preferredRegion/maxDuration/fetchCache/dynamicParams). Qualquer
// outro export publico em `route.ts` faz `next build` reprovar com
// erro literal:
//
//   Type error: Route "src/app/api/notifications/route.ts" does not
//   match the required types of a Next.js Route Handler.
//     "<identificador>" is not a valid Route export field.
//
// Segregacao canonica: constantes de mensagem, tipos de payload,
// limites de dominio e escape hatches de teste ficam em modulo
// irmao `internals.ts`. Next 15 ignora arquivos `.ts` no diretorio
// de rota que nao sejam `route.ts`, `page.tsx`, `layout.tsx`,
// `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`,
// `template.tsx`. `internals.ts` e nome canonico livre.
//
// Este modulo preserva bit-exact os simbolos migrados da ME-059
// (Bloco B6 sub-a). Zero mudanca de comportamento, payload,
// autorizacao ou SQL. O contrato canonico DOC 06 §10.1-§10.6 fica
// integralmente honrado — o refactor e puramente estrutural.
//
// RV-13: cada export tem chamador:
// - MSG_* + LISTA_UNREAD_LIMIT + tipos + `__setNotificationsRouteDbClient`
//   consumidos por `./route.ts` (GET/PATCH) e/ou
//   `tests/integration/alerts-notifications-endpoint.test.ts`.
// - `getDbClient` consumido por `./route.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../db/client';

export const MSG_UNAUTHORIZED = 'Sessao ausente.';
export const MSG_FORBIDDEN = 'Perfil sem sino canonico (§10.1).';
export const MSG_INVALID_MODE = 'Parametro "mode" invalido — use count OU unread.';
export const MSG_INVALID_ACTION = 'Parametro "action" invalido — use read OU archive.';
export const MSG_MISSING_ID = 'Parametro "id" ausente ou invalido.';
export const MSG_NOT_FOUND = 'Notificacao nao encontrada OU sem permissao.';

/**
 * Limite canonico do dropdown do sino (§10.4 — 10 ultimas nao lidas).
 */
export const LISTA_UNREAD_LIMIT = 10 as const;

/**
 * Payload canonico `?mode=count` (§10.2 linha 1097).
 */
export interface UnreadCountPayload {
  total: number;
  criticoCount: number;
  atencaoCount: number;
  observacaoCount: number;
  infoCount: number;
}

/**
 * Payload canonico `?mode=unread` (§10.4). Item nu — o pop-up de
 * detalhe consome via `notifications.getById(id)` em rota separada
 * (fora do escopo ME-059).
 */
export interface UnreadListItem {
  id: number;
  tipo: string;
  titulo: string;
  subtitulo: string | null;
  linkDestino: string | null;
  severidade: string;
  createdAt: string; // ISO
}

/**
 * Escape hatch canonico de teste. Padrao bit-exact estabelecido em
 * ME-057c (Route Handler `/api/portal/consent-lgpd`) e preservado
 * em ME-069 no refactor S366. Injeta cliente customizado (ex.:
 * MySQL fixture) para permitir teste de integracao sem levantar
 * servidor Next. Estado `dbClient` mantido no proprio modulo:
 * `getDbClient()` le do mesmo escopo, garantindo que a injecao
 * afete a instancia consumida por GET/PATCH.
 */
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

export function __setNotificationsRouteDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}
