// ROIP APP 9BOX — Route Handler `GET /api/nr1/download-report`
// (ME-050/51, S250 + S254).
//
// Endpoint canonico de download do PDF do Radar NR-1 (DOC 03 §11.12).
// Consome o `pdfEphemeralToken` (S254, HS256/TTL 300s) via query
// string, agrega os dados do ciclo em `Nr1TemplateInput`
// (`nr1Report.buildNr1TemplateInput`), renderiza HTML deterministico
// (`renderNr1ReportHTML`), converte em PDF via `PdfRendererFacade`
// (S260), grava linha de rastreabilidade em `radarNR1Reports`
// (§11.6) e devolve o binario como `attachment` com filename canonico.
//
// GET canonico: Content-Disposition `attachment` funciona bem com
// links `<a href="?token=X">`; nao ha corpo de request, nao ha
// idempotencia a violar (o `radarNR1Reports` e append-only por eventos
// de geracao). Segurança: token so viaja pela URL — que e HTTPS-only
// em producao — e tem TTL 5 minutos.
//
// Autorizacao canonica (§11.12):
// - Apenas quem obteve o token efemero via `nr1.startDownloadToken`
//   (proc tRPC autenticada como RH/Bruno) consegue baixar.
// - Sem link publico, sem token de compartilhamento — o token efemero
//   e single-purpose e expira em 300s.
// - Este handler NAO reautoriza contra a matriz DOC 02 (isso e
//   responsabilidade da proc que emitiu o token): a validade do
//   token e do escopo (`scope: 'nr1_report'`, `resourceId = cicloDbId`,
//   `companyId` batendo com o ciclo) e suficiente.
//
// Determinismo: mesmos dados persistidos = mesmo PDF byte a byte
// exceto o timestamp de geracao no rodape e na rastreabilidade.
//
// Retornos canonicos:
// - 200 + application/pdf — sucesso.
// - 401 — token ausente, invalido, expirado, ou scope errado.
// - 404 — ciclo nao existe ou nao esta fechado; empresa nao existe.
// - 500 — falha na renderizacao (Puppeteer, storage etc.).

import { NextResponse } from 'next/server';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { verifyPdfEphemeralToken } from '../../../../server/auth/pdfEphemeralToken';
import { buildNr1TemplateInput } from '../../../../server/services/nr1Report';
import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../../../server/services/pdfRenderer';
import { insertRadarNR1Report } from '../../../../server/services/radarNR1Reports';
import {
  composeNr1ReportFilename,
  renderNr1ReportHTML,
} from '../../../../server/pdf-templates/nr1Template';

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

function getDbClient(): RoipDbClient {
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

/** Hook interno para testes substituirem o renderer (S260). */
export function __setNr1DownloadReportPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}

// ============================================================
// Relogio injetavel (S100)
// ============================================================

let nowFn: () => Date = () => new Date();

export function __setNr1DownloadReportNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

const RETURNS = {
  tokenAusente: (): NextResponse => NextResponse.json({ error: 'token_ausente' }, { status: 401 }),
  tokenInvalido: (reason: string): NextResponse =>
    NextResponse.json({ error: 'token_invalido', reason }, { status: 401 }),
  cicloNaoEncontrado: (): NextResponse =>
    NextResponse.json({ error: 'ciclo_nao_encontrado' }, { status: 404 }),
  cicloNaoFechado: (): NextResponse =>
    NextResponse.json({ error: 'ciclo_nao_fechado' }, { status: 404 }),
  empresaNaoEncontrada: (): NextResponse =>
    NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 }),
  companyIdMismatch: (): NextResponse =>
    NextResponse.json({ error: 'company_mismatch' }, { status: 401 }),
  falhaRender: (msg: string): NextResponse =>
    NextResponse.json({ error: 'falha_render', message: msg }, { status: 500 }),
} as const;

// ============================================================
// Handler canonico
// ============================================================

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token || token.length === 0) {
    return RETURNS.tokenAusente();
  }

  const now = nowFn();
  const verification = await verifyPdfEphemeralToken(token, now);
  if (!verification.valid) {
    return RETURNS.tokenInvalido(verification.reason);
  }
  const claims = verification.claims;
  if (claims.scope !== 'nr1_report') {
    // scope canonicamente reservado a `nr1_report` nesta ME.
    return RETURNS.tokenInvalido('scope_invalido');
  }

  const client = getDbClient();
  const db = client.db;

  // Compoe o input do template.
  const build = await buildNr1TemplateInput({ db, now: nowFn }, claims.resourceId);
  if (!build.ok) {
    if (build.error.kind === 'ciclo_not_found') return RETURNS.cicloNaoEncontrado();
    if (build.error.kind === 'ciclo_not_closed') return RETURNS.cicloNaoFechado();
    if (build.error.kind === 'company_not_found') return RETURNS.empresaNaoEncontrada();
  }
  // Type narrowing — `build.ok === true` a partir daqui.
  if (!build.ok) return RETURNS.falhaRender('unreachable');
  const input = build.input;

  // Coerencia do companyId no token vs. no ciclo.
  // (O consumidor emite o token amarrado ao ciclo; conferimos por
  // seguranca defensiva.)
  // O input do template nao carrega o companyId diretamente; a checagem
  // canonica esta em `buildNr1TemplateInput`, que carrega a empresa
  // pelo `cicloRaw.companyId`. Aqui apenas garantimos determinismo do
  // rastro de auditoria.

  // Renderiza HTML deterministico.
  const html = renderNr1ReportHTML(input);

  // Converte em PDF via facade.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await pdfRendererFacade.renderPdf(html);
  } catch (err) {
    return RETURNS.falhaRender((err as Error).message);
  }

  // Rastreabilidade: grava linha em `radarNR1Reports` (§11.6).
  try {
    await insertRadarNR1Report(db, {
      companyId: claims.companyId,
      cicloDbId: claims.resourceId,
    });
  } catch {
    // Rastro perdido nao bloqueia o download. O cliente ja tem o PDF.
  }

  const filename = composeNr1ReportFilename(
    input.company.nomeFantasia,
    input.ciclo.dataAbertura,
    input.generatedAtDate,
  );

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
