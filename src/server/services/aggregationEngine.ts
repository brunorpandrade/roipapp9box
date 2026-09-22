// ROIP APP 9BOX — motor puro de agregacao dos dashboards agregados
// (ESPEC_ORGANOGRAMAS_E_AGREGADOS §10). Fonte unica de composicao dos
// escores agregados (empresa, departamento, equipe, cadeia).
//
// Composicao (§10.1): cada pessoa entra com peso 1. Escores e taxas sao
// media ponderada por headcount (media simples dos valores finais das
// pessoas do escopo). O escopo recebido ja e o dos CLASSIFICADOS — as
// pessoas com Eixo X e Eixo Y no trimestre — de modo que a soma do
// heatmap 3x3 e igual ao headcount.
//
// Desempenho tem dois indicadores (§10.3), ambos por media ponderada:
// `desempenhoScore` (0-100, o Eixo X do 9-Box e do centro de massa) e
// `indiceDesempenho` (razao, o indice trimestral).
//
// Dimensoes do Eixo Y: um score unico por dimensao, combinando
// autoavaliacao (A) e avaliacao do lider (C) com os pesos canonicos do
// `plenitudeScore` (0.40 x A + 0.60 x C).
//
// 9-Box (§10.3): heatmap 3x3 (contagem por celula) + centro de massa =
// (Eixo X do coletivo, Eixo Y do coletivo). Piso (§10.4): n >= 2.
//
// Modulo puro. **RV-14.** 100 colunas.

import {
  computePosicaoX,
  computePosicaoY,
  computeQuadrante,
  type NineBoxPosicaoX,
  type NineBoxPosicaoY,
  type NineBoxQuadrante,
} from './nineBoxCalculationEngine';
import { PESO_SCORE_A, PESO_SCORE_C } from './plenitudeCalculationEngine';

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

/** Valor final trimestral de uma pessoa classificada do escopo (§10.1). */
export interface PersonQuarterInput {
  readonly desempenhoScore: number | null;
  readonly indiceDesempenho: number | null;
  readonly capacidadeOciosa: number | null;
  readonly plenitudeScore: number | null;
  readonly dimensoes: readonly PersonDimensaoInput[];
  readonly posicaoX: NineBoxPosicaoX | null;
  readonly posicaoY: NineBoxPosicaoY | null;
}

/** Dimensao agregada — um score unico por dimensao (§10.3). */
interface AggregatedDimensao {
  readonly label: string;
  readonly score: number | null;
  readonly posicao: NineBoxPosicaoY | null;
}

/** Centro de massa do 9-Box coletivo (§10.3). */
interface CentroMassa {
  readonly x: number | null;
  readonly y: number | null;
  readonly posicaoX: NineBoxPosicaoX | null;
  readonly posicaoY: NineBoxPosicaoY | null;
  readonly quadrante: NineBoxQuadrante | null;
}

/**
 * Heatmap 3x3 de contagem. Linhas (Eixo Y) de cima para baixo: 0 = alta,
 * 1 = media, 2 = baixa. Colunas (Eixo X) da esquerda para a direita:
 * 0 = baixo, 1 = medio, 2 = alto.
 */
type HeatmapMatrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

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
}

const ORDEM_X: readonly NineBoxPosicaoX[] = ['baixo', 'medio', 'alto'];
const ORDEM_Y_TOPO_BASE: readonly NineBoxPosicaoY[] = ['alta', 'media', 'baixa'];

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function mediaNaoNula(valores: readonly (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v !== null);
  if (presentes.length === 0) {
    return null;
  }
  const soma = presentes.reduce((acc, v) => acc + v, 0);
  return round2(soma / presentes.length);
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

/** Score combinado de uma dimensao para uma pessoa: 0.4 x A + 0.6 x C. */
function scoreDimensaoPessoa(d: PersonDimensaoInput): number | null {
  if (d.a === null || d.c === null) {
    return null;
  }
  return round2(PESO_SCORE_A * d.a + PESO_SCORE_C * d.c);
}

function agregaDimensoes(
  pessoas: readonly PersonQuarterInput[],
  thresholds: AggregationThresholds,
): AggregatedDimensao[] {
  const labels: string[] = [];
  for (const p of pessoas) {
    for (const d of p.dimensoes) {
      if (!labels.includes(d.label)) {
        labels.push(d.label);
      }
    }
  }
  return labels.map((label) => {
    const scores: (number | null)[] = [];
    for (const p of pessoas) {
      const d = p.dimensoes.find((x) => x.label === label);
      scores.push(d === undefined ? null : scoreDimensaoPessoa(d));
    }
    const score = mediaNaoNula(scores);
    const posicao =
      score === null ? null : computePosicaoY(score, thresholds.yBaixo, thresholds.yMedio);
    return { label, score, posicao };
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
  };
}

/**
 * Compoe o agregado de um escopo a partir do valor final de cada pessoa
 * classificada (§10). Piso n >= 2: com menos de 2 pessoas retorna
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
  const dimensoes = agregaDimensoes(pessoas, thresholds);

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
  };
}
