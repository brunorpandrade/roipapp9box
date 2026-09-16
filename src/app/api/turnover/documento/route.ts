// ROIP APP 9BOX — PDF on-the-fly dos documentos padrao de desligamento
// (`GET /api/turnover/documento?tipo=...&companyId=...`, ME-fila6 D2).
//
// Especificacao "Turnover e desligamento" §6/§7: [Baixar PDF] do roteiro
// de entrevista voluntaria e do formulario de justificativa involuntaria,
// sem cache. Acesso: Bruno, RH puro, RH-Lider e C-level com acesso total.
//
// Autenticacao pelo cookie de sessao (mesma origem da pagina). O
// documento nao contem dados de pessoas; `companyId` so e aceito para
// Bruno (cabecalho da empresa) — platform usa a propria empresa.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { NextResponse } from 'next/server';

import { closeDbClient, createDbClient } from '../../../../db/client';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../lib/logs/companyHistoryLog';
import {
  composeDocumentoPadraoFilename,
  parseDocumentoPadraoTipo,
  renderDocumentoPadraoPdfHtml,
} from '../../../../server/pdf-templates/terminationFormDocumentTemplate';
import { getServerSession } from '../../../../server/session/serverSession';
import { resolveTurnoverAccess } from '../../../turnover/internals';

import { getDocumentoPdfRenderer } from './internals';

function parseCompanyId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  return n > 0 ? n : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const tipo = parseDocumentoPadraoTipo(url.searchParams.get('tipo'));
  if (tipo === null) {
    return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 });
  }
  const session = await getServerSession();
  if (session === null) {
    return NextResponse.json({ error: 'sessao_ausente' }, { status: 401 });
  }

  const client = createDbClient(resolveDatabaseUrl());
  let html: string;
  try {
    const companyIdParam = parseCompanyId(url.searchParams.get('companyId'));
    const access = await resolveTurnoverAccess(client.db, session, companyIdParam);
    if (access === null) {
      return NextResponse.json({ error: 'acesso_negado' }, { status: 403 });
    }
    const company = await findCompanyDisplayInfo(client.db, access.companyId);
    if (company === null) {
      return NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 });
    }
    const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    html = renderDocumentoPadraoPdfHtml(
      tipo,
      { nomeFantasia: company.nomeFantasia, logoUrl: company.logoUrl ?? undefined },
      `Gerado em ${geradoEm}`,
    );
  } finally {
    await closeDbClient(client);
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await getDocumentoPdfRenderer().renderPdf(html);
  } catch (err) {
    return NextResponse.json(
      { error: 'falha_render', message: (err as Error).message },
      { status: 500 },
    );
  }
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${composeDocumentoPadraoFilename(tipo)}"`,
      'cache-control': 'no-store',
    },
  });
}
