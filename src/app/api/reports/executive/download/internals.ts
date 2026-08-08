// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/reports/executive/download/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Estado privado dbClient, storage facade, relogio e
// respectivos escape hatches de teste (`__set*`) migram para modulo
// irmao. Zero mudanca de comportamento, autorizacao, cache lookup ou
// binario PDF.
//
// RV-13: cada export tem chamador:
// - `getDbClient` + `getExecutiveDownloadStorage` + `getNowFn`
//   consumidos por `./route.ts` (GET).
// - `__setExecutiveDownloadDbClient` + `__setExecutiveDownloadStorage`
//   + `__setExecutiveDownloadNow` consumidos por
//   `tests/integration/executive-report-download-handler.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../../db/client';
import {
  DEFAULT_EXECUTIVE_REPORT_STORAGE,
  type ExecutiveReportStorageFacade,
} from '../../../../../server/services/executiveReportStorage';

// ============================================================
// Cliente de banco (S036)
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

export function __setExecutiveDownloadDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Storage injetavel (S276)
// ============================================================

let storageFacade: ExecutiveReportStorageFacade = DEFAULT_EXECUTIVE_REPORT_STORAGE;

export function getExecutiveDownloadStorage(): ExecutiveReportStorageFacade {
  return storageFacade;
}

export function __setExecutiveDownloadStorage(next: ExecutiveReportStorageFacade | null): void {
  storageFacade = next ?? DEFAULT_EXECUTIVE_REPORT_STORAGE;
}

// ============================================================
// Relogio injetavel (S100)
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

export function __setExecutiveDownloadNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}
