// ROIP APP 9BOX — Route Handler `GET /api/portal/lgpd/portability`
// (ME-062b, DOC 06 §19.6, S197 + S207 + S343).
//
// Endpoint canonico de download do PDF de portabilidade LGPD do
// titular autenticado no portal do colaborador. Chamado pelo botao
// canonico `[📥 Baixar meus dados em PDF]` da aba **"Meus dados"** do
// modal *"Privacidade e proteção de dados"* (DOC 05 §6.4).
//
// S207 canonica absoluta: portal autenticado por `portalToken` NUNCA
// usa tRPC. Este handler consome service + template + PdfRendererFacade
// diretamente — sem sub-router tRPC intermediario.
//
// S343 canonizada nesta ME: a autorizacao canonica §19.7 e derivada
// literalmente do `portalToken` — o handler NAO aceita `employeeId`
// (nem `titularId`) via input do cliente. O identity do titular vem
// exclusivamente dos claims verificados. Isso elimina qualquer
// superficie de input tampering e alinha bit-exact com o padrao
// defense-in-depth consolidado S317/S319.
//
// Cobertura canonica §19.6:
// - Consulta dados cadastrais do titular (`employees` OU
//   `cLevelMembers`, derivado do `titularType` do token).
// - Consulta respostas do proprio titular aos 4 instrumentos (A, D,
//   COPSOQ, Perfil Individual).
// - Renderiza PDF unico on-the-fly (nome canonico
//   `dados_pessoais_{nomeSanitizado}_{YYYYMMDD}.pdf`).
// - Sem persistencia, sem cache, sem log em `dataAccessLog`
//   (autoacesso do titular canonicamente nao e auditado §19.6).
//
// Retornos canonicos:
// - 200 + application/pdf — sucesso (Content-Disposition attachment
//   + Cache-Control no-store).
// - 401 — token ausente, invalido, expirado ou scope errado.
// - 404 — titular ou empresa nao encontrada (corrida rara com deletes
//   posteriores a emissao do token).
// - 500 — falha na renderizacao (Puppeteer indisponivel, crash etc.).
//
// GET canonico: o botao do modal dispara `<a href="?token=...">` ou
// equivalente; Content-Disposition attachment funciona bem com GET;
// nao ha corpo (dados vem do token verificado).

import { NextResponse } from 'next/server';

import { createDbClient, type RoipDbClient } from '../../../../../db/client';
import { verifyPortalToken } from '../../../../../server/auth/portalToken';
import {
  buildLgpdPortabilityPayload,
  LgpdPortabilityCompanyNotFoundError,
  LgpdPortabilityTitularNotFoundError,
} from '../../../../../server/services/lgpdPortability';
import {
  composeLgpdPortabilityFilename,
  renderLgpdPortabilityHTML,
} from '../../../../../server/pdf-templates/lgpdPortabilityTemplate';
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

function getDbClient(): RoipDbClient {
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

/** Hook interno para testes substituirem o renderer (S260). */
export function __setLgpdPortabilityPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}

// ============================================================
// Relogio injetavel (S100 / padrao consolidado)
// ============================================================

let nowFn: () => Date = () => new Date();

/** Hook interno para testes substituirem o `now` (S100). */
export function __setLgpdPortabilityNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos padronizados
// ============================================================

function returnMissingToken(): NextResponse {
  return NextResponse.json({ msg: MSG_MISSING_TOKEN_LGPD_PORTABILITY }, { status: 401 });
}

function returnInvalidToken(): NextResponse {
  return NextResponse.json({ msg: MSG_INVALID_TOKEN_LGPD_PORTABILITY }, { status: 401 });
}

function returnExpiredToken(): NextResponse {
  return NextResponse.json({ msg: MSG_EXPIRED_TOKEN_LGPD_PORTABILITY }, { status: 401 });
}

function returnTitularNotFound(): NextResponse {
  return NextResponse.json({ msg: MSG_TITULAR_NOT_FOUND_LGPD_PORTABILITY }, { status: 404 });
}

function returnCompanyNotFound(): NextResponse {
  return NextResponse.json({ msg: MSG_COMPANY_NOT_FOUND_LGPD_PORTABILITY }, { status: 404 });
}

function returnFalhaRender(message: string): NextResponse {
  return NextResponse.json({ error: 'falha_render', message }, { status: 500 });
}

// ============================================================
// Handler canonico
// ============================================================

/**
 * `GET /api/portal/lgpd/portability?token={portalToken}`.
 *
 * Deriva `titularType` + `titularId` + `companyId` diretamente dos
 * claims verificados do portalToken (S343). Sem aceite de input do
 * cliente — a proc canonica opera como derivacao literal do token.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const raw = url.searchParams.get('token');
  if (raw === null || raw.length === 0) {
    return returnMissingToken();
  }

  const verified = await verifyPortalToken(raw);
  if (!verified.valid) {
    return verified.reason === 'expired' ? returnExpiredToken() : returnInvalidToken();
  }

  const { companyId, titularType, titularId } = verified.claims;
  const client = getDbClient();
  const db = client.db;

  // SELECTs canonicos do payload (§19.6). Falha defensiva com 404 se
  // titular ou empresa nao existirem — cobre corrida com deletes
  // administrativos posteriores a emissao do token.
  let payload;
  try {
    payload = await buildLgpdPortabilityPayload(db, companyId, titularType, titularId);
  } catch (err) {
    if (err instanceof LgpdPortabilityTitularNotFoundError) {
      return returnTitularNotFound();
    }
    if (err instanceof LgpdPortabilityCompanyNotFoundError) {
      return returnCompanyNotFound();
    }
    throw err;
  }

  // Data canonica de geracao (`YYYY-MM-DD` UTC, deterministico).
  const now = nowFn();
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const generatedAtDate = `${yy}-${mm}-${dd}`;

  // Renderiza HTML canonico bit-exact.
  const html = renderLgpdPortabilityHTML({
    company: { nomeFantasia: payload.companyNomeFantasia },
    cadastrais: payload.cadastrais,
    instrumentA: payload.instrumentA,
    instrumentD: payload.instrumentD,
    copsoq: payload.copsoq,
    individualProfile: payload.individualProfile,
    generatedAtDate,
  });

  // Converte HTML->PDF via Facade canonica (S260). Testes substituem
  // por stub deterministico; producao usa Puppeteer via
  // `puppeteer-core` com binario canonico do ambiente.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await pdfRendererFacade.renderPdf(html);
  } catch (err) {
    return returnFalhaRender((err as Error).message);
  }

  const filename = composeLgpdPortabilityFilename(payload.cadastrais.nome, generatedAtDate);

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
