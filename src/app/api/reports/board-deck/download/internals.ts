// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/reports/board-deck/download/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Estado privado dbClient, renderer PDF, relogio e
// respectivos escape hatches de teste (`__set*`) migram para modulo
// irmao. Zero mudanca de comportamento, autorizacao, SQL ou binario
// PDF.
//
// RV-13: cada export tem chamador:
// - `getDbClient` + `getPdfRendererFacade` + `getNowFn` consumidos por
//   `./route.ts` (GET).
// - `__setBoardDeckDbClient` + `__setBoardDeckPdfRenderer` +
//   `__setBoardDeckNow` consumidos por
//   `tests/integration/me054-board-deck-radar.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../../db/client';
import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../../../../server/services/pdfRenderer';

// ============================================================
// Cliente injetavel
// ============================================================

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
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

export function __setBoardDeckDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

let pdfRendererFacade: PdfRendererFacade = DEFAULT_PDF_RENDERER_FACADE;

export function getPdfRendererFacade(): PdfRendererFacade {
  return pdfRendererFacade;
}

export function __setBoardDeckPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

export function __setBoardDeckNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}
