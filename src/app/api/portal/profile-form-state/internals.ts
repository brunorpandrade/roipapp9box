// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/profile-form-state/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, tipo `ProfileFormStateSuccess` e escape hatches de teste
// (`__set*`) migram para modulo irmao. Zero mudanca de comportamento,
// autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `ProfileFormStateSuccess` consumido por `./route.ts` e
//   `tests/integration/portal-profile-form-state.test.ts` (import tipo).
// - `getDbClient` + `getNowFn` consumidos por `./route.ts`.
// - `__setPortalProfileFormStateDbClient` +
//   `__setPortalProfileFormStateNow` consumidos por
//   `tests/integration/portal-profile-form-state.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';

// ============================================================
// Mensagens canonicas (paralelas a save-instrument-a)
// ============================================================

/** Token ausente no body -> 400. */
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

/** Token invalido -> 401. */
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401. */
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado -> 400. */
export const MSG_BODY_MALFORMED = 'Requisição malformada.';

/** Erro inesperado -> 500. */
export const MSG_UNEXPECTED = 'Erro ao ler o estado do questionário.';

// ============================================================
// Cliente DB e DI para testes
// ============================================================

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

/** Hook interno para testes (padrao S036). */
export function __setPortalProfileFormStateDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

/** Hook interno para testes (padrao S100 replicado). */
export function __setPortalProfileFormStateNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 de `profile-form-state`. Contrato tipado
 * (DOC 05 §7.5: pop-up abre em `blocoAtual`, respostas de blocos
 * anteriores pre-preenchidas visualmente, barra de progresso mostra
 * `blocoAtual - 1` de 10 concluidos).
 */
export interface ProfileFormStateSuccess {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  assessmentId: number;
  tentativa: number;
  blocoAtual: number;
  blocosCompletos: readonly number[];
  respostas: Record<string, string | number>;
  totalBlocos: number;
  itensPorBloco: number;
}
