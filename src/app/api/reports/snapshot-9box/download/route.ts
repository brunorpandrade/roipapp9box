// ROIP APP 9BOX — Route Handler `GET /api/reports/snapshot-9box/download`
// (ME-053, S275; ME-070 refactor S366).
//
// Endpoint canonico de download do PDF do Snapshot 9-Box (DOC 03
// §13.7). Gera on-the-fly — sem cache, sem persistencia do binario.
// Consome o `pdfEphemeralToken` (scope=`snapshot_9box`, TTL 300s) e
// parametros de escopo/trimestre via query string.
//
// Parametros canonicos da query:
//   - token — token efemero.
//   - escopoTipo — 'empresa' | 'departamento' | 'equipe'.
//   - escopoReferencia — string (departamento ou liderId como string).
//   - trimestre — YYYY-QN.
//
// O `resourceId` do token e um binding audit-trail derivado
// deterministicamente da mesma tripla (companyId, escopoTipo,
// escopoReferencia) — o handler recomputa e compara para prevenir
// reuso do token com parametros diferentes.
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): estado privado
// dbClient, renderer PDF, relogio e respectivos escape hatches
// migraram para `./internals.ts` irmao. Este arquivo exporta apenas
// GET para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';

import { type RoipDbClient } from '../../../../../db/client';
import { companies, employees, nineBoxClassifications } from '../../../../../db/schema';
import { verifyPdfEphemeralToken } from '../../../../../server/auth/pdfEphemeralToken';
import { deriveResourceIdCanonicoEscopo } from '../../../../../server/routers/exports';
import {
  composeSnapshot9BoxFilename,
  NINE_BOX_QUADRANTES,
  renderSnapshot9BoxHTML,
  type NineBoxBlocoEscopo,
  type NineBoxDistribuicao,
  type NineBoxLinhaColaborador,
  type NineBoxQuadrante,
} from '../../../../../server/pdf-templates/snapshot9BoxTemplate';
import { sanitizeRazaoSocial } from '../../../../../server/routers/spreadsheets';

import { getDbClient, getNowFn, getPdfRendererFacade } from './internals';

// ============================================================
// Handler canonico
// ============================================================

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const escopoTipo = url.searchParams.get('escopoTipo');
  const escopoRefParam = url.searchParams.get('escopoReferencia');
  const trimestre = url.searchParams.get('trimestre');
  if (!token || !escopoTipo || !trimestre) {
    return NextResponse.json({ error: 'parametros_ausentes' }, { status: 400 });
  }
  if (escopoTipo !== 'empresa' && escopoTipo !== 'departamento' && escopoTipo !== 'equipe') {
    return NextResponse.json({ error: 'escopo_invalido' }, { status: 400 });
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
  if (claims.scope !== 'snapshot_9box') {
    return NextResponse.json(
      { error: 'token_invalido', reason: 'scope_invalido' },
      { status: 401 },
    );
  }
  const escopoRef = escopoRefParam ?? null;
  const expectedResourceId = deriveResourceIdCanonicoEscopo(
    claims.companyId,
    escopoTipo,
    escopoRef,
  );
  if (expectedResourceId !== claims.resourceId) {
    return NextResponse.json(
      { error: 'token_invalido', reason: 'resource_mismatch' },
      { status: 401 },
    );
  }

  const client = getDbClient();
  const db = client.db;

  // Carrega empresa.
  const companyRows = await db
    .select({ nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, claims.companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    return NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 });
  }

  // Carrega classificações 9-Box + nomes.
  const blocoPrincipal = await buildBlocoEscopo(
    db,
    claims.companyId,
    trimestre,
    escopoTipo,
    escopoRef,
    'Visão geral',
  );

  // Blocos capilares canonicos: cascata quando escopo=empresa por
  // departamento; quando escopo=departamento, cascata por equipes;
  // quando escopo=equipe, vazio.
  const blocosCapilares: NineBoxBlocoEscopo[] = [];
  if (escopoTipo === 'empresa') {
    const deptRows = await db
      .select({ departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.companyId, claims.companyId), eq(employees.status, 'ativo')))
      .groupBy(employees.departamento);
    for (const d of deptRows) {
      const b = await buildBlocoEscopo(
        db,
        claims.companyId,
        trimestre,
        'departamento',
        d.departamento,
        d.departamento,
      );
      if (b.totalClassificados > 0) blocosCapilares.push(b);
    }
  }

  const geradoEmIso = now.toISOString();
  const razaoSocialSan = sanitizeRazaoSocial(company.razaoSocial);
  const html = renderSnapshot9BoxHTML({
    nomeFantasia: company.nomeFantasia,
    razaoSocialSanitizada: razaoSocialSan,
    trimestre,
    escopoTipo,
    escopoRotulo: escopoRef ?? 'Empresa',
    blocoPrincipal,
    blocosCapilares,
    geradoEmIso,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await getPdfRendererFacade().renderPdf(html);
  } catch (err) {
    return NextResponse.json(
      { error: 'falha_render', message: (err as Error).message },
      { status: 500 },
    );
  }

  const filename = composeSnapshot9BoxFilename(razaoSocialSan, trimestre, geradoEmIso);

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

// ============================================================
// Agregacao canonica auxiliar
// ============================================================

async function buildBlocoEscopo(
  db: RoipDbClient['db'],
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
  titulo: string,
): Promise<NineBoxBlocoEscopo> {
  const empWhere = [eq(employees.companyId, companyId), eq(employees.status, 'ativo')];
  if (escopoTipo === 'departamento' && escopoReferencia !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
    empWhere.push(eq(employees.departamento, escopoReferencia as any));
  }
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      departamento: employees.departamento,
    })
    .from(employees)
    .where(and(...empWhere));
  const empIds = empRows.map((r) => r.id);
  const distribuicao: NineBoxDistribuicao = NINE_BOX_QUADRANTES.reduce(
    (acc, q) => ({ ...acc, [q]: 0 }),
    {} as NineBoxDistribuicao,
  );
  const colaboradores: NineBoxLinhaColaborador[] = [];
  if (empIds.length > 0) {
    const nbRows = await db
      .select({
        employeeId: nineBoxClassifications.employeeId,
        scoreDesempenho: nineBoxClassifications.scoreDesempenho,
        plenitudeScore: nineBoxClassifications.plenitudeScore,
        quadrante: nineBoxClassifications.quadrante,
      })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.companyId, companyId),
          eq(nineBoxClassifications.trimestre, trimestre),
          inArray(nineBoxClassifications.employeeId, empIds),
        ),
      );
    const empById = new Map(empRows.map((e) => [e.id, e]));
    for (const nb of nbRows) {
      const q = nb.quadrante as NineBoxQuadrante;
      distribuicao[q] += 1;
      const emp = empById.get(nb.employeeId);
      colaboradores.push({
        employeeId: nb.employeeId,
        nome: emp?.name ?? '',
        departamento: emp?.departamento ?? '',
        scoreDesempenho: nb.scoreDesempenho ? Number(nb.scoreDesempenho) : null,
        plenitudeScore: nb.plenitudeScore ? Number(nb.plenitudeScore) : null,
        quadrante: q,
      });
    }
  }
  return {
    titulo,
    totalClassificados: colaboradores.length,
    distribuicao,
    colaboradores,
  };
}
