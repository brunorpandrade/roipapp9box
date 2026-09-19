// ROIP APP 9BOX — labels de exibicao do relatorio do Perfil Individual
// (ME pos-fila7, DOC 05 §9.4-§9.5). Fonte unica de nomes legiveis das
// 5 dimensoes e dos 20 subvetores exibidos no pop-up do relatorio e no
// painel de escores. As chaves espelham exatamente as colunas decimais
// de `individualProfileScores` (DOC 01) — post_*, est_*, mot_*, equ_*,
// ass_*. Os rotulos sao os canonicos visiveis no mockup
// `perfil_individual_relatorio_v1.html` (§9.5).
//
// RV-13: este modulo nasce com chamador real — consumido por
// `PerfilIndividualRelatorioModal` (mesma ME) para renderizar dimensoes
// e subvetores. RV-14: um statement por linha, largura maxima 100.
//
// Nota de escopo: NAO ha `equ_indice` na lista de subvetores de
// Equilibrio abaixo — `equ_indice` e o Indice Geral (agregado canonico
// §5.4.5), tratado a parte no modal (linha destacada), nao como um
// subvetor comum.

/** As 5 dimensoes canonicas do Perfil Individual (§9.4). */
export type DimensaoPerfil = 'postura' | 'estrutura' | 'motor' | 'equilibrio' | 'assinatura';

/** Chaves decimais dos subvetores em `individualProfileScores` (DOC 01). */
export type SubvetorKey =
  | 'post_assert'
  | 'post_tarefas'
  | 'post_pessoas'
  | 'post_pressao'
  | 'est_abert'
  | 'est_disc'
  | 'est_ext'
  | 'est_amab'
  | 'est_estab'
  | 'mot_maestria'
  | 'mot_lideranca'
  | 'mot_autonomia'
  | 'mot_seguranca'
  | 'mot_proposito'
  | 'equ_autocons'
  | 'equ_autogest'
  | 'equ_leitura'
  | 'equ_influencia'
  | 'ass_sabed'
  | 'ass_coragem'
  | 'ass_humanid'
  | 'ass_justica'
  | 'ass_temper'
  | 'ass_transc';

/** Rotulo legivel de cada dimensao (§9.4 painel de escores). */
export const DIMENSAO_LABEL: Readonly<Record<DimensaoPerfil, string>> = {
  postura: 'Postura',
  estrutura: 'Estrutura',
  motor: 'Motor',
  equilibrio: 'Equilíbrio',
  assinatura: 'Assinatura',
};

/**
 * Titulo canonico de cada secao expandida (§9.5, ordem exata). A
 * Sintese executiva e as Recomendacoes executivas sao textos de IA e
 * nao aparecem aqui — este mapa cobre apenas as secoes ancoradas em
 * subvetores deterministicos.
 */
export const SECAO_EXPANDIDA_TITULO: Readonly<Record<DimensaoPerfil, string>> = {
  postura: 'Como essa pessoa age',
  estrutura: 'Quem essa pessoa é',
  motor: 'O que move essa pessoa',
  equilibrio: 'Como essa pessoa reage sob pressão',
  assinatura: 'No que essa pessoa é naturalmente excelente',
};

/** Rotulo legivel de cada subvetor (§9.5, nomes canonicos do mockup). */
export const SUBVETOR_LABEL: Readonly<Record<SubvetorKey, string>> = {
  post_assert: 'Assertividade e decisão',
  post_tarefas: 'Orientação a tarefas',
  post_pessoas: 'Orientação a pessoas',
  post_pressao: 'Comportamento sob pressão',
  est_abert: 'Abertura à experiência',
  est_disc: 'Disciplina e autogestão',
  est_ext: 'Extroversão',
  est_amab: 'Amabilidade',
  est_estab: 'Estabilidade emocional',
  mot_maestria: 'Maestria',
  mot_lideranca: 'Liderança',
  mot_autonomia: 'Autonomia',
  mot_seguranca: 'Segurança',
  mot_proposito: 'Propósito',
  equ_autocons: 'Autoconsciência',
  equ_autogest: 'Autogestão emocional',
  equ_leitura: 'Leitura do outro',
  equ_influencia: 'Influência e condução',
  ass_sabed: 'Sabedoria',
  ass_coragem: 'Coragem',
  ass_humanid: 'Humanidade',
  ass_justica: 'Justiça',
  ass_temper: 'Temperança',
  ass_transc: 'Transcendência',
};

/** Subvetores de cada dimensao, na ordem canonica de exibicao (§9.5). */
export const SUBVETORES_POR_DIMENSAO: Readonly<Record<DimensaoPerfil, readonly SubvetorKey[]>> = {
  postura: ['post_assert', 'post_tarefas', 'post_pessoas', 'post_pressao'],
  estrutura: ['est_abert', 'est_disc', 'est_ext', 'est_amab', 'est_estab'],
  motor: ['mot_maestria', 'mot_lideranca', 'mot_autonomia', 'mot_seguranca', 'mot_proposito'],
  equilibrio: ['equ_autocons', 'equ_autogest', 'equ_leitura', 'equ_influencia'],
  assinatura: [
    'ass_sabed',
    'ass_coragem',
    'ass_humanid',
    'ass_justica',
    'ass_temper',
    'ass_transc',
  ],
};

/** Ordem canonica das 5 dimensoes no painel de escores (§9.4). */
export const DIMENSOES_ORDEM: readonly DimensaoPerfil[] = [
  'postura',
  'estrutura',
  'motor',
  'equilibrio',
  'assinatura',
];

/** Faixa classificatoria canonica (§5.4.2 DOC 03). */
export type FaixaPerfil = 'muito_baixo' | 'baixo' | 'medio' | 'alto' | 'muito_alto';

/** Rotulo curto de cada faixa (badge do painel §9.4). */
export const FAIXA_LABEL: Readonly<Record<FaixaPerfil, string>> = {
  muito_baixo: 'Muito baixo',
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  muito_alto: 'Muito alto',
};

/**
 * Classifica um escore normalizado 0-100 na faixa canonica (§5.4.2):
 * 0-20 muito baixo, 21-40 baixo, 41-60 medio, 61-80 alto, 81-100 muito
 * alto. Entrada fora de 0-100 e clampada nas bordas.
 */
export function classificarFaixa(valor: number): FaixaPerfil {
  if (valor <= 20) {
    return 'muito_baixo';
  }
  if (valor <= 40) {
    return 'baixo';
  }
  if (valor <= 60) {
    return 'medio';
  }
  if (valor <= 80) {
    return 'alto';
  }
  return 'muito_alto';
}
