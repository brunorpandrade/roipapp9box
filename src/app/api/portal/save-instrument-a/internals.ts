// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/save-instrument-a/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, motor de plenitude (S105) e tipo `SaveInstrumentASuccess`,
// junto com escape hatches de teste (`__set*`), migram para modulo
// irmao. Zero mudanca de comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `SaveInstrumentASuccess` consumido por `./route.ts` e
//   `tests/integration/portal-save-instrument-a.test.ts` (import tipo).
// - `getDbClient` + `getNowFn` + `getPortalSaveInstrumentAPlenitudeEngine`
//   consumidos por `./route.ts` (POST).
// - `__setPortalSaveInstrumentADbClient` +
//   `__setPortalSaveInstrumentANow` +
//   `__setPortalSaveInstrumentAPlenitudeEngine` consumidos por
//   `tests/integration/portal-save-instrument-a.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  DEFAULT_PLENITUDE_ENGINE,
  type PlenitudeEngineFacade,
} from '../../../../server/services/plenitudeCalculationEngine';

// ============================================================
// Mensagens canonicas de token (paralelas a ME-023, S036 literal)
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
 * `tests/integration/portal-save-instrument-a.test.ts`.
 */
export function __setPortalSaveInstrumentADbClient(next: RoipDbClient | null): void {
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
 * Hook interno para testes substituirem o relogio, permitindo cobertura
 * deterministica dos ramos de janela (`nao_aberta`, `aberta`,
 * `desbloqueada`). Passar `null` restaura o default `() => new Date()`.
 */
export function __setPortalSaveInstrumentANow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor de plenitude injetavel (S105 herdado do S060 do Eixo X)
// ============================================================

let plenitudeEngine: PlenitudeEngineFacade = DEFAULT_PLENITUDE_ENGINE;

export function getPortalSaveInstrumentAPlenitudeEngine(): PlenitudeEngineFacade {
  return plenitudeEngine;
}

/**
 * Hook interno para testes substituirem o motor de plenitude, permitindo
 * assertividade de acoplamento (spy que conta chamadas / valida input) e
 * isolamento de defeitos do motor durante o teste do Route Handler.
 * Passar `null` restaura o default `DEFAULT_PLENITUDE_ENGINE` (ME-040).
 */
export function __setPortalSaveInstrumentAPlenitudeEngine(
  next: PlenitudeEngineFacade | null,
): void {
  plenitudeEngine = next ?? DEFAULT_PLENITUDE_ENGINE;
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 do save. `operacao` distingue INSERT (primeiro
 * envio) de OVERWRITE (dentro de desbloqueio vigente).
 */
export interface SaveInstrumentASuccess {
  companyId: number;
  employeeId: number;
  trimestre: string;
  itensGravados: number;
  operacao: 'insert' | 'overwrite';
  respondidoEm: string;
}
