// ROIP APP 9BOX — formato de exibicao de turnover (DOC 03 §12.5,
// revisto na ME §8.06.1/§8.06.2).
//
// Padrao: numero absoluto seguido do percentual entre parenteses, sem
// mencao redundante a periodo — ex.: "4 (10,0%)". Aplica-se a todas as
// superficies onde o turnover aparece (card do painel, pagina de turnover,
// card exclusivo da empresa), a partir de uma fonte unica de calculo.
// Modulo puro.

/** Percentual pt-BR com 1 casa decimal (uso interno do modulo). */
function formatPercentualTurnover(percentual: number): string {
  const n = percentual.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${n}%`;
}

/** Numero absoluto com percentual entre parenteses — ex.: "4 (10,0%)". */
export function formatTurnoverAbsPct(saidas: number, percentual: number): string {
  return `${saidas} (${formatPercentualTurnover(percentual)})`;
}

/** Base do total: "sobre N colaboradores no fechamento anterior". */
export function formatBaseFechamento(headcount: number): string {
  const c = headcount === 1 ? 'colaborador' : 'colaboradores';
  return `sobre ${headcount} ${c} no fechamento anterior`;
}

/** Texto do card quando ainda nao ha trimestre fechado. */
export const TURNOVER_SEM_TRIMESTRE_FECHADO = 'Nenhum trimestre fechado ainda.';
