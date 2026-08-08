// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/lgpd/portability/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// renderer PDF, relogio e escape hatches de teste (`__set*`) migram
// para modulo irmao. Zero mudanca de comportamento, autorizacao
// (S343 — derivada literal do portalToken), SQL ou binario PDF.
//
// RV-13: cada export tem chamador:
// - `MSG_*_LGPD_PORTABILITY` consumidos por `./route.ts` (GET).
// - `getDbClient` + `getPdfRendererFacade` + `getNowFn` consumidos por
//   `./route.ts` (GET).
// - `__setLgpdPortabilityDbClient` + `__setLgpdPortabilityPdfRenderer`
//   + `__setLgpdPortabilityNow` consumidos por
//   `tests/integration/lgpd-portability-route.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../../db/client';
import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../../../../server/services/pdfRenderer';

// ============================================================
// Mensagens canonicas exportadas (padrao consolidado)
// ============================================================

export const MSG_INVALID_TOKEN_LGPD_PORTABILITY =
  'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN_LGPD_PORTABILITY =
  'Sessão expirada. Faça a identificação novamente.';
export const MSG_MISSING_TOKEN_LGPD_PORTABILITY = 'Sessão ausente.';
export const MSG_TITULAR_NOT_FOUND_LGPD_PORTABILITY = 'Titular não encontrado.';
export const MSG_COMPANY_NOT_FOUND_LGPD_PORTABILITY = 'Empresa não encontrada.';

// ============================================================
// Cliente de banco injetavel (S036)
// ============================================================

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

let dbClient: RoipDbClient | null = null;

export function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

/** Hook interno para testes substituirem o client (S036). */
export function __setLgpdPortabilityDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Renderer PDF injetavel (S260)
// ============================================================

let pdfRendererFacade: PdfRendererFacade = DEFAULT_PDF_RENDERER_FACADE;

export function getPdfRendererFacade(): PdfRendererFacade {
  return pdfRendererFacade;
}

/** Hook interno para testes substituirem o renderer (S260). */
export function __setLgpdPortabilityPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}

// ============================================================
// Relogio injetavel (S100 / padrao consolidado)
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

/** Hook interno para testes substituirem o `now` (S100). */
export function __setLgpdPortabilityNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}
