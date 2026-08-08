// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/save-instrument-d/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, motor IQL (S152) e tipo `SaveInstrumentDSuccess`, junto com
// escape hatches de teste (`__set*`), migram para modulo irmao. Zero
// mudanca de comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `SaveInstrumentDSuccess` consumido por `./route.ts` e
//   `tests/integration/portal-save-instrument-d.test.ts` (import tipo).
// - `getDbClient` + `getNowFn` + `getPortalSaveInstrumentDIqlEngine`
//   consumidos por `./route.ts` (POST).
// - `__setPortalSaveInstrumentDDbClient` +
//   `__setPortalSaveInstrumentDNow` +
//   `__setPortalSaveInstrumentDIqlEngine` consumidos por
//   `tests/integration/portal-save-instrument-d.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  DEFAULT_IQL_ENGINE,
  type IqlEngineFacade,
} from '../../../../server/services/iqlCalculationEngine';

// ============================================================
// Mensagens canonicas de token (paralelas ao save-instrument-a)
// ============================================================

/** Token ausente no body -> 400 (§4.3 padrao portal). */
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

/** Token invalido -> 401 (§4.3 padrao portal). */
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401 (§4.3 padrao portal). */
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado (payload nao-JSON, campos ausentes, tipos errados) -> 400. */
export const MSG_BODY_MALFORMED = 'Requisição malformada.';

// ============================================================
// Cliente DB e DI para testes (padrao S036 herdado da ME-023)
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

/**
 * Hook interno para testes de integracao substituirem o client
 * (padrao S036 da ME-023 — `__setPortalXxxDbClient`). Consumido por
 * `tests/integration/portal-save-instrument-d.test.ts`. Passar `null`
 * restaura o comportamento default.
 */
export function __setPortalSaveInstrumentDDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel (paralelo a S100 do router A)
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

/**
 * Hook interno para testes substituirem o relogio, permitindo
 * cobertura deterministica dos ramos de snapshot dia 16 (§8.3) e
 * classificacao de status (§8.1). Passar `null` restaura o default
 * `() => new Date()`.
 */
export function __setPortalSaveInstrumentDNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor IQL injetavel (S152 herdado do S060/S105)
// ============================================================

let iqlEngine: IqlEngineFacade = DEFAULT_IQL_ENGINE;

export function getPortalSaveInstrumentDIqlEngine(): IqlEngineFacade {
  return iqlEngine;
}

/**
 * Hook interno para testes substituirem o motor IQL, permitindo
 * assertividade de acoplamento (spy que conta chamadas / valida
 * input) e isolamento de defeitos do motor durante o teste do Route
 * Handler. Passar `null` restaura o default `DEFAULT_IQL_ENGINE`.
 */
export function __setPortalSaveInstrumentDIqlEngine(next: IqlEngineFacade | null): void {
  iqlEngine = next ?? DEFAULT_IQL_ENGINE;
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 do save. Diferente do A, o D so tem operacao
 * `insert` — nao ha OVERWRITE porque o D nao fecha (§8.1) e a
 * resposta e imutavel apos gravada. Reflete o par avaliado
 * resolvido pelo snapshot §8.3 para consumo pelo cliente do portal.
 */
export interface SaveInstrumentDSuccess {
  companyId: number;
  respondenteId: number;
  avaliadoTipo: 'employee' | 'clevel';
  avaliadoId: number;
  trimestre: string;
  itensGravados: number;
  operacao: 'insert';
  respondidoEm: string;
}
