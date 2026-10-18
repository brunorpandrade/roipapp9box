// ROIP APP 9BOX — Route Handler `GET /api/super-admin/lgpd/exportar`
// (ME-1.12.b Despacho A, item [1.12.b] do roadmap V4).
//
// Endpoint canonico de exportacao LGPD completa de qualquer titular
// pela superficie exclusiva do Super Admin. Preserva §19.6 integral
// (cadastrais + todas as respostas brutas aos 4 instrumentos + termo
// de aceite). Acesso restrito a Super Admin via `getServerSession` +
// narrowing `kind === 'super_admin'` (defense-in-depth ao middleware
// `/super-admin/`).
//
// Diferenca canonica em relacao a `/api/portal/lgpd/portability`:
//   - Autenticacao por `getServerSession` (cookie de sessao SA) em vez
//     de `portalToken` (JWT do portal do colaborador).
//   - `modo: 'super_admin'` propagado ao `buildLgpdPortabilityPayload`
//     (todas as respostas brutas incluidas no payload e no template).
//   - `companyId` + `titularType` + `titularId` recebidos por query
//     string canonica (SA opera cross-empresa).
//   - Filename canonico preservado bit-exact
//     (`dados_pessoais_{nome}_{YYYYMMDD}.pdf`).
//
// Autorizacao canonica: apenas Super Admin pode exportar. Qualquer
// outra sessao retorna 403.
//
// **RV-12.** Zero SQL cru. **RV-13.** Consumido pelo botao canonico
// "Exportar PDF" da rota `/super-admin/empresa/[id]/lgpd`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { NextResponse } from 'next/server';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import {
  buildLgpdPortabilityPayload,
  LgpdPortabilityCompanyNotFoundError,
  LgpdPortabilityTitularNotFoundError,
} from '../../../../../server/services/lgpdPortability';
import {
  composeLgpdPortabilityFilename,
  renderLgpdPortabilityHTML,
} from '../../../../../server/pdf-templates/lgpdPortabilityTemplate';
import { DEFAULT_PDF_RENDERER_FACADE } from '../../../../../server/services/pdfRenderer';
import { getServerSession } from '../../../../../server/session/serverSession';

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  return n > 0 ? n : null;
}

function parseTitularType(raw: string | null): 'employee' | 'clevel' | null {
  if (raw === 'employee') return 'employee';
  if (raw === 'clevel') return 'clevel';
  return null;
}

interface RenderResult {
  readonly html: string;
  readonly generatedAtDate: string;
  readonly nomeTitular: string;
}

async function renderLgpdSuperAdminHtml(
  companyId: number,
  titularType: 'employee' | 'clevel',
  titularId: number,
): Promise<RenderResult> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const payload = await buildLgpdPortabilityPayload(
      client.db,
      companyId,
      titularType,
      titularId,
      'super_admin',
    );
    const now = new Date();
    const yy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const generatedAtDate = `${yy}-${mm}-${dd}`;
    const generatedAtTimestamp = now.toISOString();
    const html = renderLgpdPortabilityHTML({
      company: { nomeFantasia: payload.companyNomeFantasia },
      cadastrais: payload.cadastrais,
      instrumentA: payload.instrumentA,
      instrumentD: payload.instrumentD,
      copsoq: payload.copsoq,
      individualProfile: payload.individualProfile,
      modo: 'super_admin',
      termoAceite: payload.termoAceite,
      generatedAtDate,
      generatedAtTimestamp,
    });
    return { html, generatedAtDate, nomeTitular: payload.cadastrais.nome };
  } finally {
    await closeDbClient(client);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession();
  if (session === null) {
    return NextResponse.json({ error: 'sessao_ausente' }, { status: 401 });
  }
  if (session.kind !== 'super_admin') {
    return NextResponse.json({ error: 'acesso_negado' }, { status: 403 });
  }

  const url = new URL(req.url);
  const companyId = parsePositiveInt(url.searchParams.get('companyId'));
  const titularType = parseTitularType(url.searchParams.get('titularType'));
  const titularId = parsePositiveInt(url.searchParams.get('titularId'));
  if (companyId === null || titularType === null || titularId === null) {
    return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 });
  }

  let rendered: RenderResult;
  try {
    rendered = await renderLgpdSuperAdminHtml(companyId, titularType, titularId);
  } catch (err) {
    if (err instanceof LgpdPortabilityTitularNotFoundError) {
      return NextResponse.json({ error: 'titular_nao_encontrado' }, { status: 404 });
    }
    if (err instanceof LgpdPortabilityCompanyNotFoundError) {
      return NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 });
    }
    throw err;
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await DEFAULT_PDF_RENDERER_FACADE.renderPdf(rendered.html);
  } catch (err) {
    return NextResponse.json(
      { error: 'falha_render', message: (err as Error).message },
      { status: 500 },
    );
  }

  const filename = composeLgpdPortabilityFilename(rendered.nomeTitular, rendered.generatedAtDate);
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
