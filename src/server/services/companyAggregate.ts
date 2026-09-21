// ROIP APP 9BOX — loader do dashboard agregado da empresa
// (ESPEC_ORGANOGRAMAS_E_AGREGADOS §7 empresa + §10 + §14.25). Resolve o
// conjunto de pessoas do trimestre (colaboradores comuns; C-levels fora
// por construcao — vivem em `cLevelMembers`, nao em `employees`), os
// thresholds do 9-Box da empresa e o gate de trimestre fechado, e delega
// a composicao ao motor puro `aggregationEngine`.
//
// **RV-12.** Drizzle tipado (via loaders existentes). **RV-14.** 100 cols.

import type { RoipDatabase } from '../../db/client';

import { listClosedQuarters } from './closedQuarters';
import { computePosicaoX, computePosicaoY, readThresholds } from './nineBoxCalculationEngine';
import { listPerformanceQuarterlyDataByCompany } from './performanceQuarterlyData';
import { listPlenitudeDataByCompany } from './plenitudeData';
import {
  computeAggregate,
  type AggregateResult,
  type PersonQuarterInput,
} from './aggregationEngine';

/** Dados da pagina do dashboard agregado da empresa. */
type ClosedQuarterItem = Awaited<ReturnType<typeof listClosedQuarters>>[number];

export interface CompanyAggregatePage {
  readonly trimestresFechados: readonly ClosedQuarterItem[];
  readonly trimestre: string | null;
  readonly label: string | null;
  readonly trimestreAnterior: string | null;
  readonly trimestreSeguinte: string | null;
  readonly aggregate: AggregateResult | null;
}

/** Converte decimal do Drizzle (string | null) em number | null. */
function parseDec(v: string | null | undefined): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

/**
 * Agrega a empresa inteira no trimestre. Escopo = colaboradores comuns
 * com registro de desempenho ou de plenitude no trimestre. Posicoes X/Y
 * derivadas dos escores com os thresholds da empresa (mesma regra do
 * 9-Box individual).
 */
async function computeCompanyAggregate(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<AggregateResult> {
  const th = await readThresholds(db, companyId);
  const perfAll = await listPerformanceQuarterlyDataByCompany(db, companyId);
  const plenAll = await listPlenitudeDataByCompany(db, companyId);
  const perf = perfAll.filter((r) => r.trimestre === trimestre);
  const plen = plenAll.filter((r) => r.trimestre === trimestre);
  const perfById = new Map<number, PerfRow>(perf.map((r) => [r.employeeId, r]));
  const plenById = new Map<number, PlenRow>(plen.map((r) => [r.employeeId, r]));

  const ids = new Set<number>();
  for (const r of perf) {
    ids.add(r.employeeId);
  }
  for (const r of plen) {
    ids.add(r.employeeId);
  }

  const pessoas: PersonQuarterInput[] = [];
  for (const id of ids) {
    const pr = perfById.get(id);
    const pl = plenById.get(id);
    const desempenhoScore = parseDec(pr?.scoreDesempenho);
    const plenitudeScore = parseDec(pl?.plenitudeScore);
    pessoas.push({
      desempenhoScore,
      indiceDesempenho: parseDec(pr?.indiceDesempenho),
      capacidadeOciosa: parseDec(pr?.capacidadeOciosa),
      plenitudeScore,
      dimensoes: dimensoesDe(pl),
      posicaoX:
        desempenhoScore === null
          ? null
          : computePosicaoX(desempenhoScore, th.desempenhoBaixo, th.desempenhoMedio),
      posicaoY:
        plenitudeScore === null
          ? null
          : computePosicaoY(plenitudeScore, th.plenitudeBaixo, th.plenitudeMedio),
      retornoEstimado: parseDec(pr?.retornoEstimado),
      custoMedioTrimestral: parseDec(pr?.custoMedioTrimestral),
    });
  }

  return computeAggregate(pessoas, {
    xBaixo: th.desempenhoBaixo,
    xMedio: th.desempenhoMedio,
    yBaixo: th.plenitudeBaixo,
    yMedio: th.plenitudeMedio,
  });
}

/**
 * Dados da pagina: lista de trimestres fechados, o trimestre selecionado
 * (o pedido, se fechado; senao o mais recente) e o agregado. Sem
 * trimestre fechado, `aggregate` e nulo (mesmo gate do individual §10.5).
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
    };
  }
  const idxPedido = fechados.findIndex((q) => q.trimestre === trimestrePedido);
  const idx = idxPedido >= 0 ? idxPedido : 0;
  const selecionado = fechados[idx] ?? maisRecente;
  const aggregate = await computeCompanyAggregate(db, companyId, selecionado.trimestre);
  return {
    trimestresFechados: fechados,
    trimestre: selecionado.trimestre,
    label: selecionado.label,
    trimestreAnterior: fechados[idx + 1]?.trimestre ?? null,
    trimestreSeguinte: idx > 0 ? (fechados[idx - 1]?.trimestre ?? null) : null,
    aggregate,
  };
}
