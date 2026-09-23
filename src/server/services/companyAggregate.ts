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
import type { Departamento } from '../../db/schema/enums';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';

import { listClosedQuarters } from './closedQuarters';
import { getCompanyEconomicDiagnosisByQuarter } from './companyEconomicDiagnosis';
import {
  computePosicaoX,
  computePosicaoY,
  readThresholds,
  type NineBoxPosicaoX,
  type NineBoxPosicaoY,
  type NineBoxQuadrante,
} from './nineBoxCalculationEngine';
import { listPerformanceQuarterlyDataByCompany } from './performanceQuarterlyData';
import { listPlenitudeDataByCompany } from './plenitudeData';
import {
  listChainEmployeeIds,
  listDepartmentEmployeeIds,
  listDirectReportEmployeeIds,
  type RecorteLeader,
} from './recorteScope';
import { getIqlDataByClevelQuarter, getIqlDataByLiderQuarter } from './iqlData';
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
  idsPermitidos?: ReadonlySet<number>,
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
    if (idsPermitidos !== undefined && !idsPermitidos.has(id)) {
      continue;
    }
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

/** Trimestre selecionado + navegacao, resolvido dos fechados. */
interface TrimestreNav {
  readonly selecionado: ClosedQuarterItem;
  readonly anterior: string | null;
  readonly seguinte: string | null;
}

function resolveTrimestreNav(
  fechados: readonly ClosedQuarterItem[],
  trimestrePedido: string | null,
): TrimestreNav | null {
  const maisRecente = fechados[0];
  if (maisRecente === undefined) {
    return null;
  }
  const idxPedido = fechados.findIndex((q) => q.trimestre === trimestrePedido);
  const idx = idxPedido >= 0 ? idxPedido : 0;
  const selecionado = fechados[idx] ?? maisRecente;
  return {
    selecionado,
    anterior: fechados[idx + 1]?.trimestre ?? null,
    seguinte: idx > 0 ? (fechados[idx - 1]?.trimestre ?? null) : null,
  };
}

/**
 * Dados da pagina da empresa: trimestres fechados, o trimestre
 * selecionado (o pedido, se fechado; senao o mais recente), os escores
 * agregados, o financeiro, a assiduidade e o turnover. Sem trimestre
 * fechado, tudo nulo (mesmo gate do individual §10.5).
 */
export async function loadCompanyAggregatePage(
  db: RoipDatabase,
  companyId: number,
  trimestrePedido: string | null,
): Promise<CompanyAggregatePage> {
  const fechados = await listClosedQuarters(db, companyId);
  const nav = resolveTrimestreNav(fechados, trimestrePedido);
  if (nav === null) {
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
  const tri = nav.selecionado.trimestre;
  const escopo = await resolveEscopo(db, companyId, tri);
  const aggregate = computeAggregate(escopo.pessoas, escopo.thresholds);
  const financeiro = await loadFinanceiro(db, companyId, tri);
  const assiduidade = await loadAssiduidade(db, companyId, tri, escopo.ids);
  const turnover = await loadTurnoverPage(db, companyId, tri);

  return {
    trimestresFechados: fechados,
    trimestre: tri,
    label: nav.selecionado.label,
    trimestreAnterior: nav.anterior,
    trimestreSeguinte: nav.seguinte,
    aggregate,
    thresholds: escopo.thresholds,
    financeiro,
    assiduidade,
    turnover,
  };
}

/** Alvo de um recorte (departamento, equipe direta ou cadeia total). */
export type RecorteAlvo =
  | { readonly tipo: 'departamento'; readonly departamento: Departamento }
  | { readonly tipo: 'equipe'; readonly leader: RecorteLeader }
  | { readonly tipo: 'cadeia'; readonly leader: RecorteLeader };

/**
 * Piso de anonimizacao do IQL (§8.8): abaixo de 3 respondentes o IQL do
 * lider nao e exibido. Mesmo limiar de `composeEquipeIqlBlock`
 * (dashboardEquipeContext).
 */
const IQL_PISO_RESPONDENTES = 3;

/**
 * IQL do lider-dono de um recorte de equipe/cadeia (§8.8; geral + 4
 * dimensoes). Preenchido so quando o lider tem IQL no trimestre com ao
 * menos `IQL_PISO_RESPONDENTES` respondentes. `null` nos demais casos
 * (departamento/empresa sem lider unico; sem dado; abaixo do piso).
 * §8.06.6a.
 */
export interface IqlLiderBloco {
  readonly iql: number | null;
  readonly direcionamentoClareza: number | null;
  readonly desenvolvimentoApoio: number | null;
  readonly relacionamentoConfianca: number | null;
  readonly gestaoResultados: number | null;
  readonly countRespondentes: number;
}

/**
 * Movimento do coletivo no 9-Box entre o trimestre selecionado e o
 * imediatamente anterior fechado, sobre o MESMO conjunto de pessoas do
 * recorte (composicao atual). Guarda as posicoes (celula) do centro de
 * massa atual e anterior; a seta e o veredito sao derivados na UI pela
 * regua unica `derivarSeta` (lib/nineBoxSeta) — a mesma do dashboard
 * individual. Gatilho da seta: troca de quadrante (Opcao A). §8.06.6a.
 */
export interface Movimento9Box {
  readonly quadranteAtual: NineBoxQuadrante | null;
  readonly quadranteAnterior: NineBoxQuadrante | null;
  readonly posicaoXAtual: NineBoxPosicaoX | null;
  readonly posicaoYAtual: NineBoxPosicaoY | null;
  readonly posicaoXAnterior: NineBoxPosicaoX | null;
  readonly posicaoYAnterior: NineBoxPosicaoY | null;
  readonly deltaX: number | null;
  readonly deltaY: number | null;
  readonly trimestreAnterior: string | null;
}

/**
 * Dados da pagina de um recorte. Mesma tela da empresa MENOS folha e
 * turnover (§11, exclusivos da empresa; §8.06.5 Opcao A). Equipe direta
 * e cadeia total ganham, na coluna direita, o IQL do lider-dono e o
 * movimento no 9-Box (§8.06.6a); departamento/empresa nao (sem lider
 * unico).
 */
export interface RecorteAggregatePage {
  readonly trimestresFechados: readonly ClosedQuarterItem[];
  readonly trimestre: string | null;
  readonly label: string | null;
  readonly trimestreAnterior: string | null;
  readonly trimestreSeguinte: string | null;
  readonly aggregate: AggregateResult | null;
  readonly thresholds: AggregationThresholds | null;
  readonly assiduidade: number | null;
  readonly turnover: TurnoverPageData | null;
  readonly iqlLider: IqlLiderBloco | null;
  readonly movimento9box: Movimento9Box | null;
}

async function resolveRecorteIds(
  db: RoipDatabase,
  companyId: number,
  alvo: RecorteAlvo,
): Promise<ReadonlySet<number>> {
  if (alvo.tipo === 'departamento') {
    return new Set(await listDepartmentEmployeeIds(db, companyId, alvo.departamento));
  }
  if (alvo.tipo === 'equipe') {
    return new Set(await listDirectReportEmployeeIds(db, companyId, alvo.leader));
  }
  return new Set(await listChainEmployeeIds(db, companyId, alvo.leader));
}

/**
 * IQL do lider-dono de um recorte de equipe/cadeia no trimestre. Le a
 * linha de `iqlData` pelo tipo do lider (employee -> por liderId;
 * C-level -> por clevelId) e aplica o piso de anonimizacao §8.8.
 * Retorna `null` sem dado ou abaixo do piso. §8.06.6a.
 */
async function loadIqlLiderRecorte(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  leader: RecorteLeader,
): Promise<IqlLiderBloco | null> {
  const row =
    leader.tipo === 'clevel'
      ? await getIqlDataByClevelQuarter(db, companyId, leader.id, trimestre)
      : await getIqlDataByLiderQuarter(db, companyId, leader.id, trimestre);
  if (row === undefined) {
    return null;
  }
  const countRespondentes = row.countRespondentes ?? 0;
  if (countRespondentes < IQL_PISO_RESPONDENTES) {
    return null;
  }
  return {
    iql: parseDec(row.iql),
    direcionamentoClareza: parseDec(row.scoreDirecionamentoClareza),
    desenvolvimentoApoio: parseDec(row.scoreDesenvolvimentoApoio),
    relacionamentoConfianca: parseDec(row.scoreRelacionamentoConfianca),
    gestaoResultados: parseDec(row.scoreGestaoResultados),
    countRespondentes,
  };
}

/**
 * Monta o movimento no 9-Box do coletivo comparando o centro de massa
 * do trimestre selecionado (`atual`) com o do trimestre anterior
 * (`anterior`). Guarda as posicoes (celula) dos dois; a UI deriva a
 * seta/veredito por `derivarSeta`. Sem base de comparacao (sem
 * trimestre anterior, ou centro de massa ausente em qualquer dos dois —
 * recorte abaixo do piso), as posicoes anteriores e os deltas ficam
 * nulos. Puro (RV-13: consumido por `loadRecorteAggregatePage` /
 * `loadCompanyAggregatePage` + teste unit). §8.06.6a.
 */
export function buildMovimento9box(
  atual: AggregateResult,
  anterior: AggregateResult | null,
  trimestreAnterior: string | null,
): Movimento9Box | null {
  const cmA = atual.centroMassa;
  if (cmA.quadrante === null || cmA.posicaoX === null || cmA.posicaoY === null) {
    return null;
  }
  const semBase: Movimento9Box = {
    quadranteAtual: cmA.quadrante,
    quadranteAnterior: null,
    posicaoXAtual: cmA.posicaoX,
    posicaoYAtual: cmA.posicaoY,
    posicaoXAnterior: null,
    posicaoYAnterior: null,
    deltaX: null,
    deltaY: null,
    trimestreAnterior: null,
  };
  if (anterior === null || trimestreAnterior === null) {
    return semBase;
  }
  const cmP = anterior.centroMassa;
  if (cmP.quadrante === null || cmP.posicaoX === null || cmP.posicaoY === null) {
    return semBase;
  }
  return {
    quadranteAtual: cmA.quadrante,
    quadranteAnterior: cmP.quadrante,
    posicaoXAtual: cmA.posicaoX,
    posicaoYAtual: cmA.posicaoY,
    posicaoXAnterior: cmP.posicaoX,
    posicaoYAnterior: cmP.posicaoY,
    deltaX: cmA.x !== null && cmP.x !== null ? round2(cmA.x - cmP.x) : null,
    deltaY: cmA.y !== null && cmP.y !== null ? round2(cmA.y - cmP.y) : null,
    trimestreAnterior,
  };
}

/**
 * Dados da pagina de um recorte no trimestre selecionado. Escopo =
 * membros do recorte ∩ classificados (§8.06.5 D2). Sem financeiro nem
 * turnover.
 */
export async function loadRecorteAggregatePage(
  db: RoipDatabase,
  companyId: number,
  trimestrePedido: string | null,
  alvo: RecorteAlvo,
): Promise<RecorteAggregatePage> {
  const fechados = await listClosedQuarters(db, companyId);
  const nav = resolveTrimestreNav(fechados, trimestrePedido);
  if (nav === null) {
    return {
      trimestresFechados: fechados,
      trimestre: null,
      label: null,
      trimestreAnterior: null,
      trimestreSeguinte: null,
      aggregate: null,
      thresholds: null,
      assiduidade: null,
      turnover: null,
      iqlLider: null,
      movimento9box: null,
    };
  }
  const tri = nav.selecionado.trimestre;
  const ids = await resolveRecorteIds(db, companyId, alvo);
  const escopo = await resolveEscopo(db, companyId, tri, ids);
  const aggregate = computeAggregate(escopo.pessoas, escopo.thresholds);
  const assiduidade = await loadAssiduidade(db, companyId, tri, escopo.ids);
  const turnover =
    alvo.tipo === 'departamento'
      ? await loadTurnoverPage(db, companyId, trimestrePedido, alvo.departamento)
      : null;

  // §8.06.6a — IQL do lider-dono, movimento no 9-Box (seta na grade) e
  // card de deslocamento so em equipe/cadeia. Departamento e empresa
  // nao tem lider unico nem card/seta de movimento.
  let iqlLider: IqlLiderBloco | null = null;
  let movimento9box: Movimento9Box | null = null;
  if (alvo.tipo === 'equipe' || alvo.tipo === 'cadeia') {
    iqlLider = await loadIqlLiderRecorte(db, companyId, tri, alvo.leader);
    let aggAnterior: AggregateResult | null = null;
    if (nav.anterior !== null) {
      const escopoAnt = await resolveEscopo(db, companyId, nav.anterior, ids);
      aggAnterior = computeAggregate(escopoAnt.pessoas, escopoAnt.thresholds);
    }
    movimento9box = buildMovimento9box(aggregate, aggAnterior, nav.anterior);
  }

  return {
    trimestresFechados: fechados,
    trimestre: tri,
    label: nav.selecionado.label,
    trimestreAnterior: nav.anterior,
    trimestreSeguinte: nav.seguinte,
    aggregate,
    thresholds: escopo.thresholds,
    assiduidade,
    turnover,
    iqlLider,
    movimento9box,
  };
}
