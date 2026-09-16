// ROIP APP 9BOX — formato de exibicao de turnover (DOC 03 §12.5,
// ME-fila6 D2).
//
// "percentual seguido dos numeros absolutos entre parenteses, sem mencao
// redundante a periodo" — ex.: "7,1% (3 saídas de 42 colaboradores)".
// Modulo puro (card dos paineis e pagina de turnover).

/** Percentual pt-BR com 1 casa decimal. */
export function formatPercentualTurnover(taxa: number): string {
  const n = taxa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n}%`;
}

/** Numeros absolutos entre parenteses. */
export function formatAbsolutosTurnover(saidas: number, headcount: number): string {
  const s = saidas === 1 ? 'saída' : 'saídas';
  const c = headcount === 1 ? 'colaborador' : 'colaboradores';
  return `(${saidas} ${s} de ${headcount} ${c})`;
}

/** Formato completo DOC 03 §12.5. */
export function formatTaxaTurnover(taxa: number, saidas: number, headcount: number): string {
  return `${formatPercentualTurnover(taxa)} ${formatAbsolutosTurnover(saidas, headcount)}`;
}

/** Texto do card quando ainda nao ha trimestre fechado. */
export const TURNOVER_SEM_TRIMESTRE_FECHADO = 'Nenhum trimestre fechado ainda.';
