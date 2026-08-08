// ROIP APP 9BOX — Route Handler `GET /api/reports/board-deck/download`
// (ME-053, S275; ME-070 refactor S366).
//
// Endpoint canonico de download do PDF do Board deck (DOC 03 §13.8).
// Gera on-the-fly — sem cache. Consome o `pdfEphemeralToken`
// (scope=`board_deck`, TTL 300s). Elementos canonicos §13.8:
//   1. Distribuicao 9-Box.
//   2. ROI agregado.
//   3. Radar de riscos psicossociais.
//   4. Turnover (empresa: abertura por nivel hierarquico; departamento:
//      sem abertura por nivel).
//
// Escopo canonico §13.8: empresa ou departamento (sem equipe).
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): estado privado
// dbClient, renderer PDF, relogio e respectivos escape hatches
// migraram para `./internals.ts` irmao. Este arquivo exporta apenas
// GET para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';

import { type RoipDbClient } from '../../../../../db/client';
import {
  companies,
  companyEconomicDiagnosis,
  copsoqCycles,
  copsoqFactorScores,
  departments,
  employees,
  nineBoxClassifications,
} from '../../../../../db/schema';
import { getFatorNr1 } from '../../../../../server/services/nr1CalculationEngine';
import { verifyPdfEphemeralToken } from '../../../../../server/auth/pdfEphemeralToken';
import { deriveResourceIdCanonicoEscopo } from '../../../../../server/routers/exports';
import {
  composeBoardDeckFilename,
  renderBoardDeckHTML,
  type BoardDeckRadarFator,
  type BoardDeckTurnoverPorNivel,
} from '../../../../../server/pdf-templates/boardDeckTemplate';
import {
  NINE_BOX_QUADRANTES,
  type NineBoxDistribuicao,
  type NineBoxQuadrante,
} from '../../../../../server/pdf-templates/snapshot9BoxTemplate';
import {
  computeTurnoverByCompany,
  computeTurnoverByDepartamento,
} from '../../../../../server/services/turnoverEngine';
import { sanitizeRazaoSocial } from '../../../../../server/routers/spreadsheets';
import {
  formatTrimestreCicloReferencia,
  getLastMonthOfTrimestre,
  getPreviousTrimestre,
  parseTrimestreCicloReferencia,
} from '../../../../../lib/cycleDates';

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
  if (escopoTipo !== 'empresa' && escopoTipo !== 'departamento') {
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
  if (claims.scope !== 'board_deck') {
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

  const companyRows = await db
    .select({ nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, claims.companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    return NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 });
  }

  // Elemento 1: distribuição 9-Box no escopo.
  const { distribuicao, totalClassificados } = await compute9BoxDistribution(
    db,
    claims.companyId,
    trimestre,
    escopoTipo,
    escopoRef,
  );

  // Elemento 2: ROI.
  const roi = await computeRoiElement(db, claims.companyId, trimestre, escopoTipo);

  // Elemento 3: radar dos 8 fatores NR-1 (ME-054 — fecha D060).
  // Leitura de `copsoqFactorScores` do ciclo fechado vigente no
  // trimestre; placeholder canonico preservado quando nao ha ciclo
  // elegivel ou scores no escopo.
  const radar = await computeRadarElement(db, claims.companyId, trimestre, escopoTipo, escopoRef);

  // Elemento 4: turnover.
  const turnover = await computeTurnoverElement(
    db,
    claims.companyId,
    trimestre,
    escopoTipo,
    escopoRef,
  );

  const geradoEmIso = now.toISOString();
  const razaoSocialSan = sanitizeRazaoSocial(company.razaoSocial);
  const html = renderBoardDeckHTML({
    nomeFantasia: company.nomeFantasia,
    razaoSocialSanitizada: razaoSocialSan,
    trimestre,
    escopoTipo,
    escopoRotulo: escopoRef ?? 'Empresa',
    nineBoxDistribuicao: distribuicao,
    totalClassificados,
    roi,
    radarPsicossocial: radar,
    turnover,
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

  const filename = composeBoardDeckFilename(razaoSocialSan, trimestre, geradoEmIso);

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
// Agregacoes auxiliares
// ============================================================

async function compute9BoxDistribution(
  db: RoipDbClient['db'],
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento',
  escopoReferencia: string | null,
): Promise<{ distribuicao: NineBoxDistribuicao; totalClassificados: number }> {
  const empWhere = [eq(employees.companyId, companyId), eq(employees.status, 'ativo')];
  if (escopoTipo === 'departamento' && escopoReferencia !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
    empWhere.push(eq(employees.departamento, escopoReferencia as any));
  }
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(...empWhere));
  const empIds = empRows.map((r) => r.id);
  const distribuicao: NineBoxDistribuicao = NINE_BOX_QUADRANTES.reduce(
    (acc, q) => ({ ...acc, [q]: 0 }),
    {} as NineBoxDistribuicao,
  );
  if (empIds.length === 0) return { distribuicao, totalClassificados: 0 };
  const nbRows = await db
    .select({ quadrante: nineBoxClassifications.quadrante })
    .from(nineBoxClassifications)
    .where(
      and(
        eq(nineBoxClassifications.companyId, companyId),
        eq(nineBoxClassifications.trimestre, trimestre),
        inArray(nineBoxClassifications.employeeId, empIds),
      ),
    );
  for (const nb of nbRows) {
    const q = nb.quadrante as NineBoxQuadrante;
    distribuicao[q] += 1;
  }
  return { distribuicao, totalClassificados: nbRows.length };
}

/**
 * Elemento 3 canonico §13.8 (ME-054 — fecha D060): radar dos 8
 * fatores psicossociais agregado no escopo.
 *
 * Regra de selecao do ciclo (pre-canonizacao ME-054, D8): ciclo
 * `copsoqCycles` mais recente com `status='fechado'` e
 * `dataFechamento` <= ultimo dia do trimestre solicitado — o radar
 * "vigente" no trimestre. Scores lidos de `copsoqFactorScores` (ja
 * materializados pelo motor NR-1 no fechamento do ciclo):
 * `escopo='empresa'` para empresa; `escopo='departamento'` +
 * `escopoDepartamentoId` resolvido por nome para departamento.
 * Nomes canonicos dos fatores via `getFatorNr1` (§11.6). Array
 * vazio (placeholder canonico do template) quando nao ha ciclo
 * elegivel, departamento inexistente ou scores ausentes.
 */
async function computeRadarElement(
  db: RoipDbClient['db'],
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento',
  escopoReferencia: string | null,
): Promise<BoardDeckRadarFator[]> {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return [];
  }
  const ultimoMes = getLastMonthOfTrimestre(parsed.trimestre);
  const fimTrimestre = new Date(Date.UTC(parsed.ano, ultimoMes, 0));

  const [ciclo] = await db
    .select({ id: copsoqCycles.id })
    .from(copsoqCycles)
    .where(
      and(
        eq(copsoqCycles.companyId, companyId),
        eq(copsoqCycles.status, 'fechado'),
        lte(copsoqCycles.dataFechamento, fimTrimestre),
      ),
    )
    .orderBy(desc(copsoqCycles.dataFechamento), desc(copsoqCycles.id))
    .limit(1);
  if (!ciclo) {
    return [];
  }

  const scoreWhere = [
    eq(copsoqFactorScores.cicloDbId, ciclo.id),
    eq(copsoqFactorScores.companyId, companyId),
  ];
  if (escopoTipo === 'empresa') {
    scoreWhere.push(eq(copsoqFactorScores.escopo, 'empresa'));
  } else {
    if (escopoReferencia === null) {
      return [];
    }
    const [dept] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.nome, escopoReferencia))
      .limit(1);
    if (!dept) {
      return [];
    }
    scoreWhere.push(
      eq(copsoqFactorScores.escopo, 'departamento'),
      eq(copsoqFactorScores.escopoDepartamentoId, dept.id),
    );
  }

  const scoreRows = await db
    .select({ fator: copsoqFactorScores.fator, score: copsoqFactorScores.score })
    .from(copsoqFactorScores)
    .where(and(...scoreWhere))
    .orderBy(copsoqFactorScores.fator);

  const radar: BoardDeckRadarFator[] = [];
  for (const row of scoreRows) {
    const descritor = getFatorNr1(row.fator);
    if (!descritor) {
      continue;
    }
    radar.push({
      fatorId: descritor.id,
      nome: descritor.nome,
      scoreZeroCem: Math.round(Number.parseFloat(row.score) * 100) / 100,
    });
  }
  return radar;
}

async function computeRoiElement(
  db: RoipDbClient['db'],
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento',
): Promise<{
  roiAgregado: number | null;
  variacaoTrimestreAnterior: number | null;
  variacaoAnoAnterior: number | null;
}> {
  const isEmpresa = escopoTipo === 'empresa';
  if (!isEmpresa) {
    return { roiAgregado: null, variacaoTrimestreAnterior: null, variacaoAnoAnterior: null };
  }
  const [rowAtual] = await db
    .select({ roiEmpresa: companyEconomicDiagnosis.roiEmpresa })
    .from(companyEconomicDiagnosis)
    .where(
      and(
        eq(companyEconomicDiagnosis.companyId, companyId),
        eq(companyEconomicDiagnosis.trimestre, trimestre),
      ),
    )
    .limit(1);
  const roiAtual = rowAtual?.roiEmpresa ? Number(rowAtual.roiEmpresa) : null;

  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed)
    return { roiAgregado: roiAtual, variacaoTrimestreAnterior: null, variacaoAnoAnterior: null };
  const prev = getPreviousTrimestre(parsed.ano, parsed.trimestre);
  const trimestreAnt = formatTrimestreCicloReferencia(prev.ano, prev.trimestre);
  const trimestreAno = formatTrimestreCicloReferencia(parsed.ano - 1, parsed.trimestre);
  const [rowAnt] = await db
    .select({ roiEmpresa: companyEconomicDiagnosis.roiEmpresa })
    .from(companyEconomicDiagnosis)
    .where(
      and(
        eq(companyEconomicDiagnosis.companyId, companyId),
        eq(companyEconomicDiagnosis.trimestre, trimestreAnt),
      ),
    )
    .limit(1);
  const roiAnt = rowAnt?.roiEmpresa ? Number(rowAnt.roiEmpresa) : null;
  const [rowAno] = await db
    .select({ roiEmpresa: companyEconomicDiagnosis.roiEmpresa })
    .from(companyEconomicDiagnosis)
    .where(
      and(
        eq(companyEconomicDiagnosis.companyId, companyId),
        eq(companyEconomicDiagnosis.trimestre, trimestreAno),
      ),
    )
    .limit(1);
  const roiAno = rowAno?.roiEmpresa ? Number(rowAno.roiEmpresa) : null;
  return {
    roiAgregado: roiAtual,
    variacaoTrimestreAnterior:
      roiAtual !== null && roiAnt !== null && roiAnt !== 0
        ? Math.round(((roiAtual - roiAnt) / Math.abs(roiAnt)) * 100 * 100) / 100
        : null,
    variacaoAnoAnterior:
      roiAtual !== null && roiAno !== null && roiAno !== 0
        ? Math.round(((roiAtual - roiAno) / Math.abs(roiAno)) * 100 * 100) / 100
        : null,
  };
}

async function computeTurnoverElement(
  db: RoipDbClient['db'],
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento',
  escopoReferencia: string | null,
): Promise<{
  trimestralPercentual: number;
  anualizadoPercentual: number;
  aberturaPorNivel: BoardDeckTurnoverPorNivel | null;
}> {
  if (escopoTipo === 'empresa') {
    const t = await computeTurnoverByCompany(db, companyId, trimestre);
    const aberturaPorNivel: BoardDeckTurnoverPorNivel = {
      estrategico: { turnoverPercentual: 0, saidas: 0 },
      tatico: { turnoverPercentual: 0, saidas: 0 },
      operacional: { turnoverPercentual: 0, saidas: 0 },
    };
    for (const linha of t.aberturaPorNivel) {
      if (linha.nivel === 'estrategico') {
        aberturaPorNivel.estrategico = {
          turnoverPercentual: linha.taxaTrimestral,
          saidas: linha.saidasTrimestre,
        };
      } else if (linha.nivel === 'tatico') {
        aberturaPorNivel.tatico = {
          turnoverPercentual: linha.taxaTrimestral,
          saidas: linha.saidasTrimestre,
        };
      } else if (linha.nivel === 'operacional') {
        aberturaPorNivel.operacional = {
          turnoverPercentual: linha.taxaTrimestral,
          saidas: linha.saidasTrimestre,
        };
      }
    }
    return {
      trimestralPercentual: t.taxaTrimestral,
      anualizadoPercentual: t.taxaAnualizada,
      aberturaPorNivel,
    };
  }
  if (escopoReferencia === null) {
    return {
      trimestralPercentual: 0,
      anualizadoPercentual: 0,
      aberturaPorNivel: null,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
  const t = await computeTurnoverByDepartamento(db, companyId, escopoReferencia as any, trimestre);
  return {
    trimestralPercentual: t.taxaTrimestral,
    anualizadoPercentual: t.taxaAnualizada,
    aberturaPorNivel: null,
  };
}
