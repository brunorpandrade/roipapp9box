// ROIP APP 9BOX — loader do dashboard agregado da empresa (ESPEC §7
// empresa + §10 + §11 + §14.25). Resolve o escopo dos CLASSIFICADOS do
// trimestre (colaboradores comuns com Eixo X e Eixo Y), os thresholds do
// 9-Box, o gate de trimestre fechado, e reune: os escores agregados (via
// motor puro), o financeiro da empresa (folha, faturamento, ROD =
// faturamento / folha, §11.1), a assiduidade media e o turnover (§11.2,
// reuso de `loadTurnoverPage`).
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, avg, eq, inArray, isNotNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { performanceData } from '../../db/schema';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';

import { listClosedQuarters } from './closedQuarters';
import { getCompanyEconomicDiagnosisByQuarter } from './companyEconomicDiagnosis';
import { computePosicaoX, computePosicaoY, readThresholds } from './nineBoxCalculationEngine';
import { listPerformanceQuarterlyDataByCompany } from './performanceQuarterlyData';
import { listPlenitudeDataByCompany } from './plenitudeData';
import { loadTurnoverPage, type TurnoverPageData } from './turnoverPanel';
import {
  computeAggregate,
  type AggregateResult,
  type AggregationThresholds,
  type PersonQuarterInput,
} from './aggregationEngine';

/** Financeiro da empresa (§11.1). ROI = faturamento medio / folha media. */
interface FinanceiroEmpresa {
  readonly folhaMedia: number | null;
  readonly faturamentoMedio: number | null;
  readonly roi: number | null;
}

type ClosedQuarterItem = Awaited<ReturnType<typeof listClosedQuarters>>[number];

/** Dados da pagina do dashboard agregado da empresa. */
export interface CompanyAggregatePage {
  readonly trimestresFechados: readonly ClosedQuarterItem[];
  readonly trimestre: string | null;
  readonly label: string | null;
  readonly trimestreAnterior: string | null;
  readonly trimestreSeguinte: string | null;
  readonly aggregate: AggregateResult | null;
  readonly thresholds: AggregationThresholds | null;
  readonly financeiro: FinanceiroEmpresa | null;
  readonly assiduidade: number | null;
  readonly turnover: TurnoverPageData | null;
}

function parseDec(v: string | null | undefined): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

type PerfRow = Awaited<ReturnType<typeof listPerformanceQuarterlyDataByCompany>>[number];
type PlenRow = Awaited<ReturnType<typeof listPlenitudeDataByCompany>>[number];

function dimensoesDe(pl: PlenRow | undefined): PersonQuarterInput['dimensoes'] {
  if (pl === undefined) {
    return [];
  }
  return [
    { label: 'Engajamento', a: parseDec(pl.engajamentoA), c: parseDec(pl.engajamentoC) },
    {
      label: 'Desenvolvimento',
      a: parseDec(pl.desenvolvimentoA),
      c: parseDec(pl.desenvolvimentoC),
    },
    { label: 'Pertencimento', a: parseDec(pl.pertencimentoA), c: parseDec(pl.pertencimentoC) },
    { label: 'Realização', a: parseDec(pl.realizacaoA), c: parseDec(pl.realizacaoC) },
  ];
}

interface Escopo {
  readonly pessoas: readonly PersonQuarterInput[];
  readonly ids: readonly number[];
  readonly thresholds: AggregationThresholds;
}

/**
 * Escopo dos classificados do trimestre: colaboradores com desempenho E
 * plenitude no trimestre. Posicoes X/Y derivadas dos escores com os
 * thresholds da empresa (mesma regra do 9-Box individual).
 */
async function resolveEscopo(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<Escopo> {
  const th = await readThresholds(db, companyId);
  const perfAll = await listPerformanceQuarterlyDataByCompany(db, companyId);
  const plenAll = await listPlenitudeDataByCompany(db, companyId);
  const perfById = new Map<number, PerfRow>(
    perfAll.filter((r) => r.trimestre === trimestre).map((r) => [r.employeeId, r]),
  );
  const plenById = new Map<number, PlenRow>(
    plenAll.filter((r) => r.trimestre === trimestre).map((r) => [r.employeeId, r]),
  );

  const pessoas: PersonQuarterInput[] = [];
  const ids: number[] = [];
  for (const [id, pr] of perfById) {
    const pl = plenById.get(id);
    const desempenhoScore = parseDec(pr.scoreDesempenho);
    const plenitudeScore = parseDec(pl?.plenitudeScore);
    if (desempenhoScore === null || plenitudeScore === null) {
      continue;
    }
    ids.push(id);
    pessoas.push({
      desempenhoScore,
      indiceDesempenho: parseDec(pr.indiceDesempenho),
      capacidadeOciosa: parseDec(pr.capacidadeOciosa),
      plenitudeScore,
      dimensoes: dimensoesDe(pl),
      posicaoX: computePosicaoX(desempenhoScore, th.desempenhoBaixo, th.desempenhoMedio),
      posicaoY: computePosicaoY(plenitudeScore, th.plenitudeBaixo, th.plenitudeMedio),
    });
  }

  return {
    pessoas,
    ids,
    thresholds: {
      xBaixo: th.desempenhoBaixo,
      xMedio: th.desempenhoMedio,
      yBaixo: th.plenitudeBaixo,
      yMedio: th.plenitudeMedio,
    },
  };
}

/** Financeiro da empresa no trimestre (§11.1). */
async function loadFinanceiro(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<FinanceiroEmpresa | null> {
  const econ = await getCompanyEconomicDiagnosisByQuarter(db, companyId, trimestre);
  if (econ === undefined) {
    return null;
  }
  const folhaMedia = parseDec(econ.folhaTotalMedia);
  const faturamentoMedio = parseDec(econ.faturamentoMedioTrimestral);
  const roi =
    folhaMedia !== null && folhaMedia > 0 && faturamentoMedio !== null
      ? round2(faturamentoMedio / folhaMedia)
      : null;
  return { folhaMedia, faturamentoMedio, roi };
}

/** Assiduidade media dos classificados no trimestre (§10.3). */
async function loadAssiduidade(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  ids: readonly number[],
): Promise<number | null> {
  const meses = getQuarterMonths(trimestre);
  if (meses === null || ids.length === 0) {
    return null;
  }
  const rows = await db
    .select({ media: avg(performanceData.assiduidade) })
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        inArray(performanceData.employeeId, [...ids]),
        inArray(performanceData.mes, meses),
        isNotNull(performanceData.assiduidade),
      ),
    );
  const media = parseDec(rows[0]?.media ?? null);
  return media === null ? null : round2(media);
}

/**
 * Dados da pagina: trimestres fechados, o trimestre selecionado (o
 * pedido, se fechado; senao o mais recente), os escores agregados, o
 * financeiro, a assiduidade e o turnover. Sem trimestre fechado, tudo
 * nulo (mesmo gate do individual §10.5).
 */
export async function loadCompanyAggregatePage(
  db: RoipDatabase,
  companyId: number,
  trimestrePedido: string | null,
): Promise<CompanyAggregatePage> {
  const fechados = await listClosedQuarters(db, companyId);
  const maisRecente = fechados[0];
  if (maisRecente === undefined) {
    return {
      trimestresFechados: fechados,
      trimestre: null,
      label: null,
      trimestreAnterior: null,
      trimestreSeguinte: null,
      aggregate: null,
      thresholds: null,
      financeiro: null,
      assiduidade: null,
      turnover: null,
    };
  }
  const idxPedido = fechados.findIndex((q) => q.trimestre === trimestrePedido);
  const idx = idxPedido >= 0 ? idxPedido : 0;
  const selecionado = fechados[idx] ?? maisRecente;

  const escopo = await resolveEscopo(db, companyId, selecionado.trimestre);
  const aggregate = computeAggregate(escopo.pessoas, escopo.thresholds);
  const financeiro = await loadFinanceiro(db, companyId, selecionado.trimestre);
  const assiduidade = await loadAssiduidade(db, companyId, selecionado.trimestre, escopo.ids);
  const turnover = await loadTurnoverPage(db, companyId, selecionado.trimestre);

  return {
    trimestresFechados: fechados,
    trimestre: selecionado.trimestre,
    label: selecionado.label,
    trimestreAnterior: fechados[idx + 1]?.trimestre ?? null,
    trimestreSeguinte: idx > 0 ? (fechados[idx - 1]?.trimestre ?? null) : null,
    aggregate,
    thresholds: escopo.thresholds,
    financeiro,
    assiduidade,
    turnover,
  };
}
