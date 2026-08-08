// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/nr1/download-report/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos (GET/HEAD/
// OPTIONS/POST/PUT/PATCH/DELETE) + Route Segment Config. Qualquer
// outro export publico em `route.ts` faz `next build` reprovar com
// erro literal:
//
//   Type error: Route "src/app/api/nr1/download-report/route.ts" does
//   not match the required types of a Next.js Route Handler.
//     "<identificador>" is not a valid Route export field.
//
// Segregacao canonica: estado privado de conexao DB, renderer PDF
// injetavel, relogio injetavel e respectivos escape hatches de teste
// (`__set*`) ficam em modulo irmao `internals.ts`. Next 15 ignora
// arquivos `.ts` no diretorio de rota que nao sejam `route.ts`,
// `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`,
// `default.tsx`, `template.tsx`. `internals.ts` e nome canonico livre.
//
// Este modulo preserva bit-exact os simbolos migrados da ME-050/51.
// Zero mudanca de comportamento, autorizacao, SQL ou binario PDF.
//
// RV-13: cada export tem chamador:
// - `getDbClient` + `getPdfRendererFacade` + `getNowFn` consumidos por
//   `./route.ts` (GET).
// - `__setNr1DownloadReportDbClient` + `__setNr1DownloadReportPdfRenderer`
//   + `__setNr1DownloadReportNow` consumidos por
//   `tests/integration/me050-integration.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../../../server/services/pdfRenderer';

// ============================================================
// Cliente de banco (S036)
// ============================================================

let dbClient: RoipDbClient | null = null;

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
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

/** Hook interno para testes substituirem o client (S036). */
export function __setNr1DownloadReportDbClient(next: RoipDbClient | null): void {
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
export function __setNr1DownloadReportPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}

// ============================================================
// Relogio injetavel (S100)
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

export function __setNr1DownloadReportNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}
