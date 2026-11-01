// ROIP APP 9BOX — helpers canonicos para derivacao deterministica
// de rankings e outliers no padrao consultoria estrategica
// (ME-1.3d-REV DIS-C).
//
// Zero I/O; puros TypeScript — recebem dados ja agregados no payload
// e produzem listas ordenadas para renderizacao de componentes de
// ranking (top/bottom cards, tabelas ordenadas).
//
// Determinismo canonico: dado o mesmo input, sempre o mesmo output
// bit-exato. Mesmo criterio de empate (ordenacao estavel por nome
// quando o KPI empata).

export interface RankingLinha<T> {
  item: T;
  score: number;
}

export interface RankingTopBottom<T> {
  top: readonly RankingLinha<T>[];
  bottom: readonly RankingLinha<T>[];
}

/**
 * Ordena a lista em DESC pelo criterio informado, empate quebrado por
 * `tiebreak` (ordem alfabetica ascendente). Linhas com score `null`
 * ou `NaN` sao filtradas (nao entram no ranking).
 */
export function ordenarRanking<T>(
  itens: readonly T[],
  getScore: (item: T) => number | null,
  getTiebreak: (item: T) => string,
): readonly RankingLinha<T>[] {
  const comScore: RankingLinha<T>[] = [];
  for (const item of itens) {
    const score = getScore(item);
    if (score === null || !Number.isFinite(score)) continue;
    comScore.push({ item, score });
  }
  comScore.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return getTiebreak(a.item).localeCompare(getTiebreak(b.item), 'pt-BR');
  });
  return comScore;
}

/**
 * Extrai os `N` primeiros (top) e os `N` ultimos (bottom) de uma
 * lista ja ordenada. Quando a lista tem menos de 2*N elementos,
 * retorna o top e bottom disjuntos (sem overlap: o bottom se ajusta
 * para nao sobrepor o top).
 */
export function derivarTopBottom<T>(
  ranking: readonly RankingLinha<T>[],
  n: number,
): RankingTopBottom<T> {
  if (ranking.length === 0) return { top: [], bottom: [] };
  const limiteTop = Math.min(n, ranking.length);
  const top = ranking.slice(0, limiteTop);
  const inicioBottom = Math.max(limiteTop, ranking.length - n);
  const bottom = ranking.slice(inicioBottom).reverse();
  return { top, bottom };
}
