// ROIP APP 9BOX — Route Handler `GET /api/reports/executive/download`
// (ME-053, S275; ME-070 refactor S366).
//
// Endpoint canonico de download do PDF do Relatorio executivo
// trimestral (DOC 03 §13.5). Consome o `pdfEphemeralToken`
// (scope=`executive_report`, HS256/TTL 300s) via query string; le a
// entrada de cache (`executiveReportCache`), busca o binario PDF via
// `ExecutiveReportStorageFacade.readPdfFromPath` e devolve como
// `attachment`.
//
// Autorizacao canonica (§13.5):
// - Apenas quem obteve o token efemero via
//   `exports.generateRelatorioExecutivo` (proc tRPC autenticada como
//   Bruno / RH / C-level acessoTotal=true / Responsavel financeiro)
//   consegue baixar.
// - Sem link publico, sem token de compartilhamento — TTL 300s.
// - Este handler NAO reautoriza contra a matriz DOC 02 (a proc que
//   emitiu ja fez); a validade + scope + companyId matching e
//   suficiente.
//
// Retornos:
// - 200 + application/pdf — sucesso.
// - 401 — token ausente/invalido/expirado/scope errado.
// - 404 — cache ausente ou binario nao encontrado no storage.
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): estado privado
// dbClient, storage facade, relogio e respectivos escape hatches
// migraram para `./internals.ts` irmao. Este arquivo exporta apenas
// GET para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';

import { verifyPdfEphemeralToken } from '../../../../../server/auth/pdfEphemeralToken';
import { getExecutiveReportCacheById } from '../../../../../server/services/executiveReportCache';

import { getDbClient, getExecutiveDownloadStorage, getNowFn } from './internals';

// ============================================================
// Handler canonico
// ============================================================

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token || token.length === 0) {
    return NextResponse.json({ error: 'token_ausente' }, { status: 401 });
  }

  const now = getNowFn()();
  const verification = await verifyPdfEphemeralToken(token, now);
  if (!verification.valid) {
    return NextResponse.json(
      { error: 'token_invalido', reason: verification.reason },
      { status: 401 },
    );
  }
  const claims = verification.claims;
  if (claims.scope !== 'executive_report') {
    return NextResponse.json(
      { error: 'token_invalido', reason: 'scope_invalido' },
      { status: 401 },
    );
  }

  const client = getDbClient();
  const db = client.db;

  const cacheRow = await getExecutiveReportCacheById(db, claims.resourceId);
  if (!cacheRow) {
    return NextResponse.json({ error: 'cache_ausente' }, { status: 404 });
  }
  if (cacheRow.companyId !== claims.companyId) {
    return NextResponse.json({ error: 'company_mismatch' }, { status: 401 });
  }

  const bytes = await getExecutiveDownloadStorage().readPdfFromPath(cacheRow.conteudoPdfUrl);
  if (bytes === null) {
    return NextResponse.json({ error: 'binario_nao_encontrado' }, { status: 404 });
  }

  const filename = `relatorio_executivo_${cacheRow.trimestre}.pdf`;

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
