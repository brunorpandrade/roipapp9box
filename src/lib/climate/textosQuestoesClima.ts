// ROIP APP 9BOX — textos canonicos literais das 20 questoes do
// instrumento de Clima (ME-1.3d-REV DIS-B, L125).
//
// Fonte primaria canonica: CAMADA_NEGOCIO §6.2 (redacao fixa,
// autoavaliacao). Extraido do callsite original
// `BlocoClimaDetailClient.tsx` (constante `TEXTOS_QUESTOES`) para
// consumo compartilhado entre a UI do super-admin e o template PDF
// `climaEngajamentoTemplate.ts` + `executiveReportTemplate.ts`.
//
// Convencao canonica de indexacao linear: `(dim - 1) * 5 + (item - 1)`
// (`item` em 1..5, `dim` em 1..4), identica a `notasQuestao` do motor
// `climateCalculationEngine`. Array tem exatamente 20 posicoes.

/**
 * Dimensao canonica do instrumento de Clima. 4 dimensoes fechadas.
 */
export const DIMENSOES_CLIMA = [
  'Engajamento',
  'Desenvolvimento',
  'Pertencimento',
  'Realização',
] as const;

export type DimensaoClima = (typeof DIMENSOES_CLIMA)[number];

/**
 * Textos canonicos literais das 20 questoes do instrumento de Clima,
 * em ordem canonica `(dim - 1) * 5 + (item - 1)`.
 */
export const TEXTOS_QUESTOES_CLIMA: readonly string[] = [
  // Dimensao 1 — Engajamento (questoes 1..5)
  'Sinto energia e disposição para o trabalho.',
  'Tenho entusiasmo com o que faço.',
  'Sinto-me comprometido com os resultados da área.',
  'Consigo manter o foco e a concentração nas minhas atividades.',
  'Mesmo diante de dificuldades, mantenho minha dedicação ao trabalho.',
  // Dimensao 2 — Desenvolvimento (questoes 6..10)
  'Tenho aprendido e evoluído na função.',
  'Vejo oportunidades de crescimento aqui.',
  'Recebo desafios que me desenvolvem.',
  'Tenho clareza sobre o que preciso desenvolver para crescer na empresa.',
  'Sinto que minhas habilidades estão sendo bem aproveitadas no trabalho.',
  // Dimensao 3 — Pertencimento (questoes 11..15)
  'Sinto que faço parte do time e da empresa.',
  'Sinto-me valorizado pelo que entrego.',
  'Tenho boas relações com quem trabalho.',
  'Sinto que posso ser eu mesmo no ambiente de trabalho.',
  'Sinto que minha opinião é ouvida e considerada pela equipe.',
  // Dimensao 4 — Realizacao (questoes 16..20)
  'Meu trabalho tem sentido para mim.',
  'Sinto satisfação com o que realizo.',
  'Termino a maior parte das semanas com sensação de realização.',
  'Sinto que meu trabalho contribui de forma relevante para a empresa.',
  'Tenho orgulho do que produzo e entrego.',
] as const;

/**
 * Retorna o texto canonico de uma questao pelo par `(dim, item)`,
 * com `dim` em 1..4 e `item` em 1..5. Retorna string vazia para
 * valores fora do dominio canonico.
 */
export function textoQuestaoClima(dim: number, item: number): string {
  if (!Number.isInteger(dim) || !Number.isInteger(item)) return '';
  if (dim < 1 || dim > 4) return '';
  if (item < 1 || item > 5) return '';
  const idx = (dim - 1) * 5 + (item - 1);
  return TEXTOS_QUESTOES_CLIMA[idx] ?? '';
}

/**
 * Retorna o rotulo canonico da dimensao (1..4) ou string vazia fora
 * do dominio.
 */
export function rotuloDimensaoClima(dim: number): string {
  if (!Number.isInteger(dim) || dim < 1 || dim > 4) return '';
  return DIMENSOES_CLIMA[dim - 1] ?? '';
}
