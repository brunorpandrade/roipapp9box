// ROIP APP 9BOX — motor puro de agregacao dos dashboards agregados
// (ESPEC_ORGANOGRAMAS_E_AGREGADOS §10). Fonte unica de composicao
// consumida pelos dashboards de empresa, departamento, equipe e cadeia.
//
// Principio de composicao (§10.1): cada pessoa entra com peso 1. Escores
// e taxas sao media ponderada por headcount (equivalente a media simples
// dos valores finais das pessoas do escopo); grandezas monetarias sao
// soma; multiplos financeiros sao razao recalculada dos brutos
// (Sigma retorno / Sigma custo), nunca media de multiplos (§10.2/§10.3).
//
// Dois indicadores de desempenho (§10.3), ambos por media ponderada:
//   - `desempenhoScore` (0-100) — o Eixo X do 9-Box; mapeia a celula do
//     centro de massa pelos mesmos thresholds do individual.
//   - `indiceDesempenho` (razao) — o indice de desempenho trimestral.
//
// 9-Box (§10.3): heatmap 3x3 com a contagem de pessoas por celula (pelas
// posicoes ja classificadas de cada pessoa), mais o centro de massa =
// (Eixo X do coletivo, Eixo Y do coletivo). Nao existe "quadrante medio":
// a celula do centro de massa vem das medias continuas (`desempenhoScore`
// e `plenitudeScore`) mapeadas pelos mesmos thresholds.
//
// Piso (§10.4): n >= 2 gera agregado; com n = 1 nao ha agregado.
//
// Modulo puro (sem I/O). O loader de escopo resolve as pessoas e os
// thresholds e chama `computeAggregate`. **RV-14.** 100 colunas.

import {
  computePosicaoX,
  computePosicaoY,
  computeQuadrante,
  type NineBoxPosicaoX,
  type NineBoxPosicaoY,
  type NineBoxQuadrante,
} from './nineBoxCalculationEngine';

/** Piso amostral canonico (§10.4): abaixo disso nao ha agregado. */
export const AGGREGATION_PISO_HEADCOUNT = 2;

/** Thresholds dos eixos (mesmos limiares do 9-Box individual). */
export interface AggregationThresholds {
  readonly xBaixo: number;
  readonly xMedio: number;
  readonly yBaixo: number;
  readonly yMedio: number;
}

/** Dimensao da plenitude de uma pessoa (par A/C). */
interface PersonDimensaoInput {
  readonly label: string;
  readonly a: number | null;
  readonly c: number | null;
}

/** Valor final trimestral de uma pessoa do escopo (§10.1). */
export interface PersonQuarterInput {
  readonly desempenhoScore: number | null;
  readonly indiceDesempenho: number | null;
  readonly capacidadeOciosa: number | null;
  readonly plenitudeScore: number | null;
  readonly dimensoes: readonly PersonDimensaoInput[];
  readonly posicaoX: NineBoxPosicaoX | null;
  readonly posicaoY: NineBoxPosicaoY | null;
  readonly retornoEstimado: number | null;
  readonly custoMedioTrimestral: number | null;
}

/** Dimensao agregada (media ponderada por headcount de A e de C). */
interface AggregatedDimensao {
  readonly label: string;
  readonly a: number | null;
  readonly c: number | null;
}

/** Centro de massa do 9-Box coletivo (§10.3). */
interface CentroMassa {
  readonly x: number | null;
  readonly y: number | null;
  readonly posicaoX: NineBoxPosicaoX | null;
  readonly posicaoY: NineBoxPosicaoY | null;
  readonly quadrante: NineBoxQuadrante | null;
}

/** Resultado canonico do escopo agregado. */
export interface AggregateResult {
  readonly headcount: number;
  readonly abaixoDoPiso: boolean;
  readonly desempenhoScore: number | null;
  readonly indiceDesempenho: number | null;
  readonly ociosidade: number | null;
  readonly eixoY: number | null;
  readonly dimensoes: readonly AggregatedDimensao[];
  readonly heatmap: HeatmapMatrix;
  readonly heatmapClassificados: number;
  readonly centroMassa: CentroMassa;
  readonly retornoTotal: number;
  readonly custoTotal: number;
  readonly roi: number | null;
}

/**
 * Heatmap 3x3 de contagem. Indices de linha (Eixo Y) de cima para baixo:
 * 0 = alta, 1 = media, 2 = baixa. Indices de coluna (Eixo X) da esquerda
 * para a direita: 0 = baixo, 1 = medio, 2 = alto.
 */
type HeatmapMatrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const ORDEM_X: readonly NineBoxPosicaoX[] = ['baixo', 'medio', 'alto'];
const ORDEM_Y_TOPO_BASE: readonly NineBoxPosicaoY[] = ['alta', 'media', 'baixa'];

/** Arredonda para 2 casas (padrao dos escores do produto). */
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Media dos valores nao-nulos; `null` quando nao ha nenhum. */
function mediaNaoNula(valores: readonly (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v !== null);
  if (presentes.length === 0) {
    return null;
  }
  const soma = presentes.reduce((acc, v) => acc + v, 0);
  return round2(soma / presentes.length);
}

/** Soma dos valores nao-nulos (nulos contam como zero). */
function somaNaoNula(valores: readonly (number | null)[]): number {
  return valores.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function heatmapZerado(): number[][] {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

function congelaHeatmap(m: readonly (readonly number[])[]): HeatmapMatrix {
  return [
    [m[0]![0]!, m[0]![1]!, m[0]![2]!],
    [m[1]![0]!, m[1]![1]!, m[1]![2]!],
    [m[2]![0]!, m[2]![1]!, m[2]![2]!],
  ];
}

function agregaDimensoes(pessoas: readonly PersonQuarterInput[]): AggregatedDimensao[] {
  const labels: string[] = [];
  for (const p of pessoas) {
    for (const d of p.dimensoes) {
      if (!labels.includes(d.label)) {
        labels.push(d.label);
      }
    }
  }
  return labels.map((label) => {
    const as: (number | null)[] = [];
    const cs: (number | null)[] = [];
    for (const p of pessoas) {
      const d = p.dimensoes.find((x) => x.label === label);
      if (d !== undefined) {
        as.push(d.a);
        cs.push(d.c);
      }
    }
    return { label, a: mediaNaoNula(as), c: mediaNaoNula(cs) };
  });
}

function resultadoVazio(headcount: number, abaixoDoPiso: boolean): AggregateResult {
  return {
    headcount,
    abaixoDoPiso,
    desempenhoScore: null,
    indiceDesempenho: null,
    ociosidade: null,
    eixoY: null,
    dimensoes: [],
    heatmap: congelaHeatmap(heatmapZerado()),
    heatmapClassificados: 0,
    centroMassa: { x: null, y: null, posicaoX: null, posicaoY: null, quadrante: null },
    retornoTotal: 0,
    custoTotal: 0,
    roi: null,
  };
}

/**
 * Compoe o agregado de um escopo a partir do valor final de cada pessoa
 * (§10). `pessoas` ja e o conjunto do escopo (empresa, departamento,
 * cadeia ou equipe). Piso n >= 2: com menos de 2 pessoas retorna
 * `abaixoDoPiso = true` sem metricas.
 */
export function computeAggregate(
  pessoas: readonly PersonQuarterInput[],
  thresholds: AggregationThresholds,
): AggregateResult {
  const headcount = pessoas.length;
  if (headcount < AGGREGATION_PISO_HEADCOUNT) {
    return resultadoVazio(headcount, true);
  }

  const desempenhoScore = mediaNaoNula(pessoas.map((p) => p.desempenhoScore));
  const indiceDesempenho = mediaNaoNula(pessoas.map((p) => p.indiceDesempenho));
  const ociosidade = mediaNaoNula(pessoas.map((p) => p.capacidadeOciosa));
  const eixoY = mediaNaoNula(pessoas.map((p) => p.plenitudeScore));
  const dimensoes = agregaDimensoes(pessoas);

  const matriz = heatmapZerado();
  let classificados = 0;
  for (const p of pessoas) {
    if (p.posicaoX === null || p.posicaoY === null) {
      continue;
    }
    const col = ORDEM_X.indexOf(p.posicaoX);
    const row = ORDEM_Y_TOPO_BASE.indexOf(p.posicaoY);
    if (col >= 0 && row >= 0) {
      const linha = matriz[row]!;
      linha[col] = (linha[col] ?? 0) + 1;
      classificados += 1;
    }
  }

  const posicaoX =
    desempenhoScore === null
      ? null
      : computePosicaoX(desempenhoScore, thresholds.xBaixo, thresholds.xMedio);
  const posicaoY =
    eixoY === null ? null : computePosicaoY(eixoY, thresholds.yBaixo, thresholds.yMedio);
  const quadrante =
    posicaoX !== null && posicaoY !== null ? computeQuadrante(posicaoX, posicaoY) : null;

  const retornoTotal = round2(somaNaoNula(pessoas.map((p) => p.retornoEstimado)));
  const custoTotal = round2(somaNaoNula(pessoas.map((p) => p.custoMedioTrimestral)));
  const roi = custoTotal > 0 ? round2(retornoTotal / custoTotal) : null;

  return {
    headcount,
    abaixoDoPiso: false,
    desempenhoScore,
    indiceDesempenho,
    ociosidade,
    eixoY,
    dimensoes,
    heatmap: congelaHeatmap(matriz),
    heatmapClassificados: classificados,
    centroMassa: { x: desempenhoScore, y: eixoY, posicaoX, posicaoY, quadrante },
    retornoTotal,
    custoTotal,
    roi,
  };
}
