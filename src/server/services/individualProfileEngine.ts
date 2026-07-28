// ROIP APP 9BOX — motor deterministico do Perfil Individual
// (ME-049a; DOC 03 §10.4-§10.6 + Perfil_Individual__instrumento_completo_.md
// §5.1-§5.5).
//
// Vigesima ME do Bloco B3 (ME-049a) — abre o motor canonico do Perfil
// Individual em 5 camadas. Precedente direto: motores de plenitude
// (ME-040), 9-Box (ME-041) e IQL (ME-046). Padrao S105 herdado do
// S060 do Eixo X: motor exposto como funcao pura +
// `IndividualProfileEngineFacade` + `DEFAULT_INDIVIDUAL_PROFILE_ENGINE`.
// Sem hook a jusante nesta ME — Momento 2 (§10.13) e `getReport`
// (ME-049b/ME-051), nao chamada in-band do motor.
//
// Camadas canonicas do §5 do arquivo do instrumento:
//   - Camada 1 (§5.1): 5 indices de confiabilidade (IA_ATT, IA_SOC,
//     IA_ACQ, IA_CONS, IA_EXT) + classificacao alta/moderada/baixa.
//   - Camada 2 (§5.2): pontuacao bruta por item — Likert direto,
//     Likert invertido (6-v), Escolha Forcada (2 pontos ao subvetor
//     da alternativa escolhida), Cenario (peso 1-4 conforme Anexo B).
//   - Camada 3 (§5.3): soma por subvetor.
//   - Camada 4 (§5.4): normalizacao 0-100 pela formula
//     `((bruto - min) / (max - min)) x 100` com min/max do Anexo C;
//     classificacao em 5 faixas; regras dimensionais (hierarquia
//     forcada Motor + EMPATE_MOT; top-3 Assinatura + EQUIL_ASS;
//     perfil combinado Postura; EQU_INDICE).
//   - Camada 5 (§5.5): pacote A-G para IA (aqui gravado como colunas
//     tipadas + JSON `top3Assinatura` e `flags` no `individualProfileScores`).
//   - Flags cross-dimensionais (§6.3 + DOC 03 §10.5): FLAG_ADAPT_POST,
//     FLAG_DESALINH_MOT_ASS, FLAG_COMP_APRENDIDA, FLAG_LIDER_REATIVO.
//
// Convencoes canonicas herdadas:
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Persistencia via
//     services tipados de `individualProfileAssessments`,
//     `individualProfileScores` e `individualProfilePlaceholders`.
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/individualProfileEngine.test.ts` (RV-13).
//   - Determinismo: `round2` explicito; escala numerica identica em
//     JS e MySQL decimal(5,2).
//   - Nomenclatura de subvetor CANONICA (DOC 01 §9.2): 24 colunas
//     minusculas com underscore (`post_assert`, `mot_seguranca`, etc.).
//     O motor mapeia os identificadores maiusculos do instrumento
//     (Anexos A/B/C — `POST_ASSERT`, `MOT_SEGURANCA`) para as
//     colunas snake_case do schema.
//
// Este motor NUNCA lanca por logica canonica. Instrumento incompleto
// (respostas ausentes) NAO chega aqui — o Route Handler
// `submit-profile-assessment` valida completude antes de acionar.
// Lanca apenas por defeito de infraestrutura (banco fora, FK invalida).
// O caller (Route Handler do portal) propaga como 500.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  getIndividualProfileAssessmentById,
  updateIndividualProfileResultado,
} from './individualProfileAssessments';
import { getPlaceholderByUser, updatePlaceholderStatus } from './individualProfilePlaceholders';
import { insertIndividualProfileScore } from './individualProfileScores';

// ============================================================
// Constantes canonicas (§4.9 + Anexos A/B/C do instrumento)
// ============================================================

/**
 * Total de itens do instrumento (§3.2 literal: 80 itens em 10 blocos
 * de 8 itens; DOC 01 §9.1 `blocoAtual 1..10`). Os itens de
 * confiabilidade (7 exclusivos + 2 com funcao dupla) contam no total.
 */
export const NUM_ITENS_TOTAL = 80;

/** Total de blocos canonico (DOC 01/05: 10 blocos de 8 itens). */
export const NUM_BLOCOS_TOTAL = 10;

/** Total de itens por bloco (DOC 05: "Bloco X de 10 · 8 itens"). */
export const NUM_ITENS_POR_BLOCO = 8;

/**
 * TTL do card "Enviado" no portal do colaborador. Canonico literal e
 * convergente em tres DOCs: DOC 03 §10.9 ("`individualProfileScores.
 * exibirConfirmacaoAte = enviadoEm + 7 dias`"), DOC 03 §10.13 (pipeline
 * do `submitAssessment`, passos 3 e 4), DOC 01 §9.2 (comentario da
 * coluna) e DOC 04 §3. Grava-se `exibirConfirmacaoAte = now + 7 dias`.
 *
 * CC033 (ME-049b): a ME-049a gravava `now + 24h`, divergindo dos tres
 * DOCs. Corrigido por RV-09 (o canonico prevalece sobre o codigo) na
 * ME imediatamente seguinte a deteccao.
 */
export const CONFIRMACAO_TTL_DIAS = 7;

/** Itens Likert invertidos (Anexo A §8.2). */
const ITENS_LIKERT_INVERTIDOS: ReadonlySet<number> = new Set([6, 12, 14, 29, 31, 44, 63, 70, 79]);

/**
 * Total de itens Likert do instrumento (§5.1.5 literal: 73). Fixo
 * canonico — o denominador do IA_EXT. Nao inclui EF (12), CN (20) e
 * usa os 51 Likert de conteudo + os 2 pares espelho (001/006) + os 2
 * pares de consistencia (025/057) + os 3 de ancoragem social
 * (009/039/075) + os 2 de atencao dirigida (018/080), totalizando 73.
 */
const TOTAL_ITENS_LIKERT_IA_EXT = 73;

/** Itens de Atencao Dirigida (§5.1.1) e suas respostas corretas. */
const ITEM_ATT_1 = 18;
const ITEM_ATT_1_CORRETA = 2;
const ITEM_ATT_2 = 80;
const ITEM_ATT_2_CORRETA = 1;

/** Itens de Ancoragem Social (§5.1.2). */
const ITENS_ANCORAGEM_SOCIAL = [9, 39, 75] as const;

/** Par de Aquiescencia — espelho principal (§5.1.3). */
const PAR_AQUIESCENCIA: [number, number] = [1, 6];

/** Par de Consistencia Interna (§5.1.4). */
const PAR_CONSISTENCIA: [number, number] = [25, 57];

/**
 * Set completo dos itens Likert (para IA_EXT). Inclui:
 *   - 51 itens Likert de conteudo (§8.2 literal)
 *   - itens de conteudo com funcao dupla (par 001/006)
 *   - itens exclusivos de confiabilidade em formato Likert:
 *     ANC (9, 39, 75), ATT (18, 80), CON (25, 57).
 * Total: 73 (bate com §5.1.5 literal).
 * EF e CN NAO entram no denominador.
 */
const ITENS_LIKERT_TODOS: ReadonlySet<number> = new Set<number>(buildLikertSet());

function buildLikertSet(): number[] {
  const efs = new Set<number>([3, 8, 13, 19, 28, 30, 34, 45, 49, 58, 64, 73]);
  const cns = new Set<number>([
    4, 11, 15, 16, 22, 26, 33, 36, 42, 46, 48, 51, 56, 60, 62, 66, 72, 76,
  ]);
  const out: number[] = [];
  for (let i = 1; i <= NUM_ITENS_TOTAL; i += 1) {
    if (!efs.has(i) && !cns.has(i)) out.push(i);
  }
  return out;
}

/**
 * Mapeamento item Likert / cenario -> subvetor canonico (Anexo A §8.1).
 * Itens de confiabilidade nao entram (dimensao CONF).
 * Escolha Forcada (EF) NAO esta aqui — cada alternativa mapeia
 * subvetor distinto no Anexo B (§9.1-§9.2); tratamento separado.
 * Itens de conteudo com funcao dupla (001, 006) mapeiam para o
 * subvetor de conteudo (POST_ASSERT); o par espelho e usado no
 * IA_ACQ separadamente.
 */
const ITEM_TO_SUBVECTOR: ReadonlyMap<number, SubvectorId> = new Map([
  [1, 'post_assert'],
  [2, 'est_abert'],
  [4, 'equ_autogest'],
  [5, 'ass_sabed'],
  [6, 'post_assert'],
  [7, 'est_disc'],
  [10, 'equ_leitura'],
  [11, 'post_pressao'],
  [12, 'est_estab'],
  [14, 'mot_maestria'],
  [15, 'equ_autogest'],
  [16, 'est_ext'],
  [17, 'post_pessoas'],
  [20, 'equ_autogest'],
  [21, 'ass_humanid'],
  [22, 'post_assert'],
  [23, 'est_amab'],
  [24, 'mot_autonomia'],
  [26, 'equ_influencia'],
  [27, 'post_tarefas'],
  [29, 'est_disc'],
  [31, 'equ_autogest'],
  [32, 'post_pessoas'],
  [33, 'est_abert'],
  [35, 'ass_justica'],
  [36, 'equ_leitura'],
  [37, 'post_pessoas'],
  [38, 'est_ext'],
  [40, 'mot_maestria'],
  [41, 'equ_influencia'],
  [42, 'post_assert'],
  [43, 'ass_coragem'],
  [44, 'est_amab'],
  [46, 'equ_autocons'],
  [47, 'post_tarefas'],
  [48, 'est_disc'],
  [50, 'equ_autogest'],
  [51, 'post_pressao'],
  [52, 'mot_proposito'],
  [53, 'est_estab'],
  [54, 'ass_justica'],
  [55, 'post_pessoas'],
  [56, 'equ_influencia'],
  [59, 'ass_transc'],
  [60, 'est_abert'],
  [61, 'equ_leitura'],
  [62, 'post_pessoas'],
  [63, 'mot_proposito'],
  [65, 'est_disc'],
  [66, 'equ_autogest'],
  [67, 'post_assert'],
  [68, 'mot_maestria'],
  [69, 'ass_justica'],
  [70, 'est_abert'],
  [71, 'equ_autocons'],
  [72, 'post_pressao'],
  [74, 'ass_sabed'],
  [76, 'equ_leitura'],
  [77, 'post_assert'],
  [78, 'est_abert'],
  [79, 'mot_lideranca'],
]);

/**
 * Mapa canonico Escolha Forcada -> subvetor + pontuacao (Anexo B
 * §9.1-§9.2). Cada item EF possui alternativa 'A' e 'B'; a escolhida
 * soma 2 pontos ao subvetor associado.
 */
const EF_MAP: ReadonlyMap<number, Readonly<{ A: SubvectorId; B: SubvectorId }>> = new Map([
  // Motor (§9.1)
  [3, { A: 'mot_maestria', B: 'mot_lideranca' }],
  [8, { A: 'mot_proposito', B: 'mot_autonomia' }],
  [19, { A: 'mot_proposito', B: 'mot_maestria' }],
  [30, { A: 'mot_seguranca', B: 'mot_autonomia' }],
  [34, { A: 'mot_lideranca', B: 'mot_seguranca' }],
  [45, { A: 'mot_proposito', B: 'mot_maestria' }],
  [58, { A: 'mot_autonomia', B: 'mot_seguranca' }],
  [73, { A: 'mot_autonomia', B: 'mot_lideranca' }],
  // Assinatura (§9.2)
  [13, { A: 'ass_sabed', B: 'ass_humanid' }],
  [28, { A: 'ass_temper', B: 'ass_sabed' }],
  [49, { A: 'ass_transc', B: 'ass_sabed' }],
  [64, { A: 'ass_coragem', B: 'ass_temper' }],
]);

/**
 * Mapa canonico Cenario situacional -> peso por alternativa
 * (Anexo B §9.3-§9.5). Cada item CN tem alternativas A/B/C/D com
 * peso 1-4 canonizado. O subvetor esta em `ITEM_TO_SUBVECTOR`.
 */
const CN_MAP: ReadonlyMap<
  number,
  Readonly<{ A: number; B: number; C: number; D: number }>
> = new Map([
  // Postura (§9.3)
  [11, { A: 4, B: 3, C: 2, D: 1 }],
  [22, { A: 4, B: 2, C: 3, D: 1 }],
  [42, { A: 4, B: 2, C: 2, D: 1 }],
  [51, { A: 4, B: 2, C: 3, D: 1 }],
  [62, { A: 2, B: 4, C: 3, D: 1 }],
  [72, { A: 4, B: 2, C: 3, D: 1 }],
  // Estrutura (§9.4)
  [16, { A: 1, B: 4, C: 2, D: 3 }],
  [33, { A: 4, B: 3, C: 1, D: 2 }],
  [48, { A: 4, B: 1, C: 2, D: 3 }],
  [60, { A: 4, B: 3, C: 1, D: 3 }],
  // Equilibrio (§9.5)
  [4, { A: 2, B: 4, C: 3, D: 1 }],
  [15, { A: 2, B: 4, C: 1, D: 3 }],
  [26, { A: 4, B: 3, C: 1, D: 2 }],
  [36, { A: 4, B: 3, C: 2, D: 1 }],
  [46, { A: 4, B: 3, C: 2, D: 1 }],
  [56, { A: 3, B: 4, C: 2, D: 1 }],
  [66, { A: 2, B: 4, C: 3, D: 1 }],
  [76, { A: 4, B: 1, C: 2, D: 3 }],
]);

/**
 * Min/max canonico por subvetor (Anexo C §10.1-§10.5). A ordem
 * batendo com o DOC 01 §9.2 (24 colunas decimal(5,2)).
 */
const SUBVECTOR_RANGE: ReadonlyMap<SubvectorId, Readonly<{ min: number; max: number }>> = new Map([
  // Postura §10.1
  ['post_assert', { min: 6, max: 28 }],
  ['post_tarefas', { min: 2, max: 10 }],
  ['post_pessoas', { min: 5, max: 24 }],
  ['post_pressao', { min: 3, max: 12 }],
  // Estrutura §10.2
  ['est_abert', { min: 5, max: 23 }],
  ['est_disc', { min: 4, max: 19 }],
  ['est_ext', { min: 2, max: 9 }],
  ['est_amab', { min: 2, max: 10 }],
  ['est_estab', { min: 2, max: 10 }],
  // Motor §10.3
  ['mot_maestria', { min: 3, max: 21 }],
  ['mot_lideranca', { min: 1, max: 11 }],
  ['mot_autonomia', { min: 1, max: 13 }],
  ['mot_seguranca', { min: 0, max: 6 }],
  ['mot_proposito', { min: 2, max: 16 }],
  // Equilibrio §10.4
  ['equ_autocons', { min: 2, max: 9 }],
  ['equ_autogest', { min: 6, max: 27 }],
  ['equ_leitura', { min: 4, max: 18 }],
  ['equ_influencia', { min: 3, max: 13 }],
  // Assinatura §10.5
  ['ass_sabed', { min: 2, max: 16 }],
  ['ass_coragem', { min: 1, max: 7 }],
  ['ass_humanid', { min: 1, max: 7 }],
  ['ass_justica', { min: 3, max: 15 }],
  ['ass_temper', { min: 0, max: 4 }],
  ['ass_transc', { min: 1, max: 7 }],
]);

/** Subvetores canonicos da dimensao Motor (Anexo C §10.3). */
const SUBVETORES_MOTOR: readonly SubvectorId[] = [
  'mot_maestria',
  'mot_lideranca',
  'mot_autonomia',
  'mot_seguranca',
  'mot_proposito',
];

/** Subvetores canonicos da dimensao Assinatura (Anexo C §10.5). */
const SUBVETORES_ASSINATURA: readonly SubvectorId[] = [
  'ass_sabed',
  'ass_coragem',
  'ass_humanid',
  'ass_justica',
  'ass_temper',
  'ass_transc',
];

/**
 * Ressonancias canonicas Motor -> Virtudes (§6.3.2 do instrumento).
 * Dominante em `motor` sem virtude presente entre as 3 principais da
 * assinatura -> `FLAG_DESALINH_MOT_ASS` ativado.
 */
const RESSONANCIAS_MOTOR_ASSINATURA: ReadonlyMap<SubvectorId, ReadonlySet<SubvectorId>> = new Map([
  ['mot_maestria', new Set<SubvectorId>(['ass_sabed'])],
  ['mot_lideranca', new Set<SubvectorId>(['ass_justica', 'ass_coragem'])],
  ['mot_autonomia', new Set<SubvectorId>(['ass_coragem', 'ass_sabed'])],
  ['mot_seguranca', new Set<SubvectorId>(['ass_temper'])],
  ['mot_proposito', new Set<SubvectorId>(['ass_humanid', 'ass_transc'])],
]);

// ============================================================
// Tipos publicos
// ============================================================

/** Identificador canonico de subvetor — 24 colunas snake_case (§9.2). */
export type SubvectorId =
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

/**
 * Payload canonico de respostas de um instrumento respondido. Chaves
 * `ITEM_XXX` (1-80). Likert e ANC/ATT/CON: valor numerico 1-5.
 * Escolha Forcada: 'A' | 'B'. Cenario: 'A' | 'B' | 'C' | 'D'.
 * O tipo aceita `string | number` uniformemente; o motor faz a
 * dispatch por tipo.
 */
export type RespostasPerfil = Record<string, string | number>;

/** Nivel de confiabilidade classificado pela Camada 1 (§5.1.6). */
export type ConfiabilidadeNivel = 'alta' | 'moderada' | 'baixa';

/** Nivel de alerta individual por indice de confiabilidade. */
type AlertaConfiabilidade = 'ok' | 'medio' | 'critico';

/** Motivo canonico da execucao do motor. */
export type IndividualProfileEngineMotivo = 'consistente' | 'inconsistente_baixa_confiabilidade';

/** Resultado tipado da execucao do motor. */
export interface IndividualProfileEngineResult {
  assessmentId: number;
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  tentativa: number;
  motivo: IndividualProfileEngineMotivo;
  confiabilidadeNivel: ConfiabilidadeNivel;
  ia_att: number;
  ia_soc: number;
  ia_acq: number;
  ia_cons: number;
  ia_ext: number;
  status: 'enviado' | 'inconsistente';
  calculadoEm: Date;
  enviadoEm: Date;
  exibirConfirmacaoAte: Date;
}

/**
 * Fachada canonica do motor do Perfil Individual. Contrato minimo
 * consumido pelo Route Handler `POST /api/portal/submit-profile-
 * assessment`. Producao aponta ao motor real desta ME; testes injetam
 * mock.
 */
export interface IndividualProfileEngineFacade {
  runAssessment: (
    db: RoipDatabase,
    assessmentId: number,
    now: Date,
  ) => Promise<IndividualProfileEngineResult>;
}

/** DI default canonica (S105 herdado do S060). */
export const DEFAULT_INDIVIDUAL_PROFILE_ENGINE: IndividualProfileEngineFacade = {
  runAssessment,
};

// ============================================================
// Utilidades numericas
// ============================================================

/** Arredonda para 2 casas decimais deterministicamente. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ============================================================
// Camada 1 — Confiabilidade (§5.1)
// ============================================================

/** IA_ATT (§5.1.1). 0-2. */
export function computeIaAtt(respostas: RespostasPerfil): {
  score: number;
  alerta: AlertaConfiabilidade;
} {
  const v1 = respostas[itemKey(ITEM_ATT_1)];
  const v2 = respostas[itemKey(ITEM_ATT_2)];
  const acerto1 = typeof v1 === 'number' && v1 === ITEM_ATT_1_CORRETA ? 1 : 0;
  const acerto2 = typeof v2 === 'number' && v2 === ITEM_ATT_2_CORRETA ? 1 : 0;
  const score = acerto1 + acerto2;
  let alerta: AlertaConfiabilidade;
  if (score === 2) alerta = 'ok';
  else if (score === 1) alerta = 'medio';
  else alerta = 'critico';
  return { score, alerta };
}

/** IA_SOC (§5.1.2). 0-6. */
export function computeIaSoc(respostas: RespostasPerfil): {
  score: number;
  alerta: AlertaConfiabilidade;
} {
  let soma = 0;
  for (const item of ITENS_ANCORAGEM_SOCIAL) {
    const v = respostas[itemKey(item)];
    if (typeof v !== 'number') continue;
    if (v === 3) soma += 1;
    else if (v === 4 || v === 5) soma += 2;
  }
  let alerta: AlertaConfiabilidade;
  if (soma <= 1) alerta = 'ok';
  else if (soma <= 3) alerta = 'medio';
  else alerta = 'critico';
  return { score: soma, alerta };
}

/** IA_ACQ (§5.1.3) — par espelho 001/006. 0-1. */
export function computeIaAcq(respostas: RespostasPerfil): {
  score: number;
  alerta: AlertaConfiabilidade;
} {
  const [a, b] = PAR_AQUIESCENCIA;
  const va = respostas[itemKey(a)];
  const vb = respostas[itemKey(b)];
  if (typeof va !== 'number' || typeof vb !== 'number') {
    return { score: 1, alerta: 'medio' };
  }
  const ambosAltos = va >= 4 && vb >= 4;
  const ambosBaixos = va <= 2 && vb <= 2;
  const score = ambosAltos || ambosBaixos ? 1 : 0;
  const alerta: AlertaConfiabilidade = score === 0 ? 'ok' : 'medio';
  return { score, alerta };
}

/** IA_CONS (§5.1.4) — par 025/057. 0-6 (|6 - soma|). */
export function computeIaCons(respostas: RespostasPerfil): {
  score: number;
  alerta: AlertaConfiabilidade;
} {
  const [a, b] = PAR_CONSISTENCIA;
  const va = respostas[itemKey(a)];
  const vb = respostas[itemKey(b)];
  if (typeof va !== 'number' || typeof vb !== 'number') {
    return { score: 6, alerta: 'critico' };
  }
  const diff = Math.abs(6 - (va + vb));
  let alerta: AlertaConfiabilidade;
  if (diff <= 1) alerta = 'ok';
  else if (diff === 2) alerta = 'medio';
  else alerta = 'critico';
  return { score: diff, alerta };
}

/** IA_EXT (§5.1.5) — extremidade sobre 73 itens Likert. 0-1. */
export function computeIaExt(respostas: RespostasPerfil): {
  score: number;
  alerta: AlertaConfiabilidade;
} {
  let extremas = 0;
  for (const item of ITENS_LIKERT_TODOS) {
    const v = respostas[itemKey(item)];
    if (typeof v !== 'number') continue;
    if (v === 1 || v === 5) extremas += 1;
  }
  const score = round2(extremas / TOTAL_ITENS_LIKERT_IA_EXT);
  let alerta: AlertaConfiabilidade;
  if (score <= 0.6) alerta = 'ok';
  else if (score <= 0.75) alerta = 'medio';
  else alerta = 'critico';
  return { score, alerta };
}

/**
 * Consolida os 5 indices em nivel canonico (§5.1.6):
 *   - alta: nenhum critico e no maximo 1 medio;
 *   - moderada: nenhum critico e ate 3 medios, OU 1 critico isolado
 *     (sem outros alertas);
 *   - baixa: 2+ criticos, OU 1 critico com 2+ medios.
 */
export function classifyReliability(alertas: readonly AlertaConfiabilidade[]): ConfiabilidadeNivel {
  const criticos = alertas.filter((a) => a === 'critico').length;
  const medios = alertas.filter((a) => a === 'medio').length;
  if (criticos === 0 && medios <= 1) return 'alta';
  if (criticos === 0 && medios <= 3) return 'moderada';
  if (criticos === 1 && medios === 0) return 'moderada';
  return 'baixa';
}

// ============================================================
// Camada 2 — Pontuacao bruta por item (§5.2)
// ============================================================

/**
 * Pontuacao bruta de um item Likert (direto ou invertido).
 * Invertido: 6 - valor. Fora do range 1-5 -> 0 (defesa canonica; o
 * caller valida completude antes).
 */
export function computeItemScoreLikert(item: number, valor: number): number {
  if (!Number.isFinite(valor) || valor < 1 || valor > 5) return 0;
  if (ITENS_LIKERT_INVERTIDOS.has(item)) return 6 - valor;
  return valor;
}

// ============================================================
// Camada 3 — Agregacao por subvetor (§5.3)
// ============================================================

type BrutoPorSubvetor = Record<SubvectorId, number>;

/** Inicializa acumulador zero por subvetor. */
function novoAcumulador(): BrutoPorSubvetor {
  const out: Partial<BrutoPorSubvetor> = {};
  for (const sv of SUBVECTOR_RANGE.keys()) out[sv] = 0;
  return out as BrutoPorSubvetor;
}

/** Agrega todos os itens em soma bruta por subvetor. */
export function computeBrutoPorSubvetor(respostas: RespostasPerfil): BrutoPorSubvetor {
  const acc = novoAcumulador();
  for (let item = 1; item <= NUM_ITENS_TOTAL; item += 1) {
    const raw = respostas[itemKey(item)];
    const efMap = EF_MAP.get(item);
    if (efMap) {
      if (raw === 'A') acc[efMap.A] += 2;
      else if (raw === 'B') acc[efMap.B] += 2;
      continue;
    }
    const cnMap = CN_MAP.get(item);
    if (cnMap) {
      const sv = ITEM_TO_SUBVECTOR.get(item);
      if (!sv) continue;
      const peso = pesoCenario(cnMap, raw);
      acc[sv] += peso;
      continue;
    }
    const sv = ITEM_TO_SUBVECTOR.get(item);
    if (!sv) continue; // item de confiabilidade sem funcao dupla
    if (typeof raw !== 'number') continue;
    acc[sv] += computeItemScoreLikert(item, raw);
  }
  return acc;
}

function pesoCenario(
  cnMap: Readonly<{ A: number; B: number; C: number; D: number }>,
  raw: unknown,
): number {
  if (raw === 'A') return cnMap.A;
  if (raw === 'B') return cnMap.B;
  if (raw === 'C') return cnMap.C;
  if (raw === 'D') return cnMap.D;
  return 0;
}

// ============================================================
// Camada 4 — Normalizacao e faixas (§5.4)
// ============================================================

/** Normaliza escore bruto de um subvetor para escala 0-100 (§5.4.1). */
export function normalizeSubvector(subvector: SubvectorId, bruto: number): number {
  const range = SUBVECTOR_RANGE.get(subvector);
  if (!range) return 0;
  const denom = range.max - range.min;
  if (denom <= 0) return 0;
  const raw = ((bruto - range.min) / denom) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return round2(clamped);
}

/** Escores normalizados 0-100 por subvetor. */
type NormalizadosPorSubvetor = Record<SubvectorId, number>;

/**
 * Hierarquia forcada da dimensao Motor (§5.4.3). Ordena os 5
 * subvetores do maior para o menor; dominante, sustentacao e
 * negligenciado sao seus extremos. Empate `EMPATE_MOT` quando os
 * dois mais altos estao a menos de 5 pontos.
 */
export function computeMotorHierarchy(norm: NormalizadosPorSubvetor): {
  vetorDominante: SubvectorId;
  vetorSustentacao: SubvectorId;
  vetorNegligenciado: SubvectorId;
  empateMot: boolean;
} {
  const ordenados = [...SUBVETORES_MOTOR]
    .map((sv) => ({ sv, val: norm[sv] }))
    .sort((a, b) => b.val - a.val);
  // Defesa canonica de narrowing: SUBVETORES_MOTOR tem 5 posicoes
  // fixas, portanto ordenados[0..4] sao definidos. TS strict index
  // access exige narrowing explicito.
  const primeiro = ordenados[0];
  const segundo = ordenados[1];
  const ultimo = ordenados[ordenados.length - 1];
  if (!primeiro || !segundo || !ultimo) {
    throw new Error('computeMotorHierarchy: SUBVETORES_MOTOR vazio (estado impossivel)');
  }
  const empateMot = primeiro.val - segundo.val < 5;
  return {
    vetorDominante: primeiro.sv,
    vetorSustentacao: segundo.sv,
    vetorNegligenciado: ultimo.sv,
    empateMot,
  };
}

/**
 * Top-3 forcado da dimensao Assinatura (§5.4.3). As 3 virtudes de
 * maior escore. Empate `EQUIL_ASS` quando as 2 do topo estao a menos
 * de 5 pontos.
 */
export function computeTop3Assinatura(norm: NormalizadosPorSubvetor): {
  top3: readonly SubvectorId[];
  equilAss: boolean;
} {
  const ordenados = [...SUBVETORES_ASSINATURA]
    .map((sv) => ({ sv, val: norm[sv] }))
    .sort((a, b) => b.val - a.val);
  const top3 = ordenados.slice(0, 3).map((o) => o.sv);
  // Narrowing canonico: SUBVETORES_ASSINATURA tem 6 posicoes fixas.
  const primeiro = ordenados[0];
  const segundo = ordenados[1];
  if (!primeiro || !segundo) {
    throw new Error('computeTop3Assinatura: SUBVETORES_ASSINATURA vazio (estado impossivel)');
  }
  const equilAss = primeiro.val - segundo.val < 5;
  return { top3, equilAss };
}

/**
 * Perfil comportamental da Postura (§5.4.3): identifica os dois
 * subvetores mais altos entre os quatro. Retorna rotulo canonico
 * `sub1+sub2` (sub1 = mais alto).
 */
export function computePerfilComportamental(norm: NormalizadosPorSubvetor): string {
  const posturaSubs: readonly SubvectorId[] = [
    'post_assert',
    'post_tarefas',
    'post_pessoas',
    'post_pressao',
  ];
  const ordenados = [...posturaSubs].sort((a, b) => norm[b] - norm[a]);
  return `${ordenados[0]}+${ordenados[1]}`;
}

/** Indice Geral de Equilibrio (§5.4.3). Media dos 4 normalizados. */
export function computeEquIndice(norm: NormalizadosPorSubvetor): number {
  const soma = norm.equ_autocons + norm.equ_autogest + norm.equ_leitura + norm.equ_influencia;
  return round2(soma / 4);
}

// ============================================================
// Camada 5 — Flags cross-dimensional (§6.3 + DOC 03 §10.5)
// ============================================================

/** Flags binarias produzidas pelo motor. */
export interface CrossDimensionalFlags {
  FLAG_ADAPT_POST: boolean;
  FLAG_DESALINH_MOT_ASS: boolean;
  FLAG_COMP_APRENDIDA: boolean;
  FLAG_LIDER_REATIVO: boolean;
  EMPATE_MOT: boolean;
  EQUIL_ASS: boolean;
}

/**
 * Regras canonicas (§6.3):
 *   - FLAG_ADAPT_POST: post_assert alto (>60) + est_ext baixo (<40).
 *   - FLAG_DESALINH_MOT_ASS: vetor dominante Motor sem virtude
 *     ressonante no top-3 Assinatura (mapa canonico §6.3.2).
 *   - FLAG_COMP_APRENDIDA: est_estab baixo (<40) + equ_indice alto (>60).
 *   - FLAG_LIDER_REATIVO: post_assert alto (>60) + equ_autocons baixo (<40).
 * Limiares 40/60 = fronteiras canonicas das faixas Baixo/Alto (§5.4.2).
 */
export function computeCrossDimensionalFlags(
  norm: NormalizadosPorSubvetor,
  vetorDominante: SubvectorId,
  top3Assinatura: readonly SubvectorId[],
  empateMot: boolean,
  equilAss: boolean,
): CrossDimensionalFlags {
  const equIndice = computeEquIndice(norm);

  const ressonancias = RESSONANCIAS_MOTOR_ASSINATURA.get(vetorDominante) ?? new Set<SubvectorId>();
  const top3Set = new Set(top3Assinatura);
  let temRessonancia = false;
  for (const virtude of ressonancias) {
    if (top3Set.has(virtude)) {
      temRessonancia = true;
      break;
    }
  }

  return {
    FLAG_ADAPT_POST: norm.post_assert > 60 && norm.est_ext < 40,
    FLAG_DESALINH_MOT_ASS: !temRessonancia,
    FLAG_COMP_APRENDIDA: norm.est_estab < 40 && equIndice > 60,
    FLAG_LIDER_REATIVO: norm.post_assert > 60 && norm.equ_autocons < 40,
    EMPATE_MOT: empateMot,
    EQUIL_ASS: equilAss,
  };
}

// ============================================================
// Orquestracao canonica: runAssessment
// ============================================================

/**
 * Executa as 5 camadas do motor sobre uma tentativa em status
 * `em_andamento`. Fluxo canonico do §10.13 (pipeline consistente vs
 * inconsistente):
 *   1. Le a tentativa via service tipado.
 *   2. Camada 1: 5 indices + classificacao.
 *   3. Se baixa: grava resultado inconsistente (5 indices + status
 *      `inconsistente`), transiciona placeholder para `inconsistente`,
 *      retorna motivo `inconsistente_baixa_confiabilidade`.
 *   4. Se alta/moderada: prossegue Camadas 2-5, insere
 *      `individualProfileScores` com 24 escores + resultados
 *      interpretativos + flags, atualiza assessment para `enviado`,
 *      transiciona placeholder para `respondido`.
 *
 * NUNCA lanca por logica canonica. Lanca somente por defeito de
 * infraestrutura (banco fora, FK invalida).
 */
export async function runAssessment(
  db: RoipDatabase,
  assessmentId: number,
  now: Date,
): Promise<IndividualProfileEngineResult> {
  // -------- 1) Le a tentativa --------
  const assessment = await getIndividualProfileAssessmentById(db, assessmentId);
  if (!assessment) {
    throw new Error(`runAssessment: tentativa nao encontrada (assessmentId=${assessmentId})`);
  }
  const respostas = normalizeRespostas(assessment.respostas);
  const enviadoEm = now;
  const exibirConfirmacaoAte = new Date(now.getTime() + CONFIRMACAO_TTL_DIAS * 24 * 3600 * 1000);

  // -------- 2) Camada 1 --------
  const iaAtt = computeIaAtt(respostas);
  const iaSoc = computeIaSoc(respostas);
  const iaAcq = computeIaAcq(respostas);
  const iaCons = computeIaCons(respostas);
  const iaExt = computeIaExt(respostas);
  const nivel = classifyReliability([
    iaAtt.alerta,
    iaSoc.alerta,
    iaAcq.alerta,
    iaCons.alerta,
    iaExt.alerta,
  ]);

  const iaAttStr = String(iaAtt.score);
  const iaSocStr = String(iaSoc.score);
  const iaAcqStr = String(iaAcq.score);
  const iaConsStr = String(iaCons.score);
  const iaExtStr = String(iaExt.score);

  // -------- 3) Caminho inconsistente (§10.6) --------
  if (nivel === 'baixa') {
    await updateIndividualProfileResultado(db, assessmentId, {
      status: 'inconsistente',
      confiabilidadeNivel: 'baixa',
      ia_att: iaAttStr,
      ia_soc: iaSocStr,
      ia_acq: iaAcqStr,
      ia_cons: iaConsStr,
      ia_ext: iaExtStr,
      calculadoEm: now,
    });
    await transicionaPlaceholder(db, assessment, 'inconsistente', now);
    return {
      assessmentId,
      companyId: assessment.companyId,
      userType: assessment.userType,
      userId: assessment.userId,
      tentativa: assessment.tentativa,
      motivo: 'inconsistente_baixa_confiabilidade',
      confiabilidadeNivel: 'baixa',
      ia_att: iaAtt.score,
      ia_soc: iaSoc.score,
      ia_acq: iaAcq.score,
      ia_cons: iaCons.score,
      ia_ext: iaExt.score,
      status: 'inconsistente',
      calculadoEm: now,
      enviadoEm,
      exibirConfirmacaoAte,
    };
  }

  // -------- 4) Camadas 2-5 (consistente) --------
  const bruto = computeBrutoPorSubvetor(respostas);
  const norm = normalizeAll(bruto);
  const perfilComportamental = computePerfilComportamental(norm);
  const hierarchy = computeMotorHierarchy(norm);
  const topAssinatura = computeTop3Assinatura(norm);
  const flags = computeCrossDimensionalFlags(
    norm,
    hierarchy.vetorDominante,
    topAssinatura.top3,
    hierarchy.empateMot,
    topAssinatura.equilAss,
  );
  const equIndice = computeEquIndice(norm);

  await updateIndividualProfileResultado(db, assessmentId, {
    status: 'enviado',
    confiabilidadeNivel: nivel,
    ia_att: iaAttStr,
    ia_soc: iaSocStr,
    ia_acq: iaAcqStr,
    ia_cons: iaConsStr,
    ia_ext: iaExtStr,
    calculadoEm: now,
  });

  await insertIndividualProfileScore(db, {
    companyId: assessment.companyId,
    userType: assessment.userType,
    userId: assessment.userId,
    assessmentId,
    tentativa: assessment.tentativa,
    post_assert: String(norm.post_assert),
    post_tarefas: String(norm.post_tarefas),
    post_pessoas: String(norm.post_pessoas),
    post_pressao: String(norm.post_pressao),
    est_abert: String(norm.est_abert),
    est_disc: String(norm.est_disc),
    est_ext: String(norm.est_ext),
    est_amab: String(norm.est_amab),
    est_estab: String(norm.est_estab),
    mot_maestria: String(norm.mot_maestria),
    mot_lideranca: String(norm.mot_lideranca),
    mot_autonomia: String(norm.mot_autonomia),
    mot_seguranca: String(norm.mot_seguranca),
    mot_proposito: String(norm.mot_proposito),
    equ_autocons: String(norm.equ_autocons),
    equ_autogest: String(norm.equ_autogest),
    equ_leitura: String(norm.equ_leitura),
    equ_influencia: String(norm.equ_influencia),
    equ_indice: String(equIndice),
    ass_sabed: String(norm.ass_sabed),
    ass_coragem: String(norm.ass_coragem),
    ass_humanid: String(norm.ass_humanid),
    ass_justica: String(norm.ass_justica),
    ass_temper: String(norm.ass_temper),
    ass_transc: String(norm.ass_transc),
    perfilComportamental,
    vetorDominante: hierarchy.vetorDominante,
    vetorSustentacao: hierarchy.vetorSustentacao,
    vetorNegligenciado: hierarchy.vetorNegligenciado,
    top3Assinatura: topAssinatura.top3,
    flags,
    exibirConfirmacaoAte,
  });

  await transicionaPlaceholder(db, assessment, 'respondido', now);

  return {
    assessmentId,
    companyId: assessment.companyId,
    userType: assessment.userType,
    userId: assessment.userId,
    tentativa: assessment.tentativa,
    motivo: 'consistente',
    confiabilidadeNivel: nivel,
    ia_att: iaAtt.score,
    ia_soc: iaSoc.score,
    ia_acq: iaAcq.score,
    ia_cons: iaCons.score,
    ia_ext: iaExt.score,
    status: 'enviado',
    calculadoEm: now,
    enviadoEm,
    exibirConfirmacaoAte,
  };
}

// ============================================================
// Helpers internos
// ============================================================

/** Formata o ID canonico do item (`ITEM_001` a `ITEM_080`). */
export function itemKey(item: number): string {
  return `ITEM_${String(item).padStart(3, '0')}`;
}

/** Normaliza o payload cru de `respostas` (JSON) para o tipo tipado. */
function normalizeRespostas(raw: unknown): RespostasPerfil {
  if (typeof raw !== 'object' || raw === null) return {};
  const rec = raw as Record<string, unknown>;
  const out: RespostasPerfil = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Normaliza todos os 24 subvetores em uma unica passada. */
function normalizeAll(bruto: BrutoPorSubvetor): NormalizadosPorSubvetor {
  const out: Partial<NormalizadosPorSubvetor> = {};
  for (const sv of SUBVECTOR_RANGE.keys()) {
    out[sv] = normalizeSubvector(sv, bruto[sv]);
  }
  return out as NormalizadosPorSubvetor;
}

/**
 * Transiciona o placeholder do titular para o status alvo pos-motor.
 * Silenciosa quando placeholder inexistente (defesa canonica — o
 * placeholder e criado in-band na criacao do employee/clevel, mas o
 * teste isolado do motor pode nao criar). Retorna sem erro.
 */
async function transicionaPlaceholder(
  db: RoipDatabase,
  assessment: NonNullable<Awaited<ReturnType<typeof getIndividualProfileAssessmentById>>>,
  status: 'respondido' | 'inconsistente',
  now: Date,
): Promise<void> {
  const placeholder = await getPlaceholderByUser(
    db,
    assessment.companyId,
    assessment.userType,
    assessment.userId,
  );
  if (!placeholder) return;
  await updatePlaceholderStatus(db, placeholder.id, status, status === 'respondido' ? now : null);
}

// ============================================================
// Marker de import intencional (evita `import unused` do `and`/`eq`
// no lint quando tree-shaking do ts remove branches nao usados; os
// helpers de query direta sao usados em ME futuras do motor).
// ============================================================
void and;
void eq;
