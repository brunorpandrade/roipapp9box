// ROIP APP 9BOX — motor canonico `plenitudeCalculationEngine` (ME-040).
//
// Consolida o hook canonico do DOC 03 §6.4: Eixo Y (plenitude). Motor
// puro no sentido canonico (§18.2): zero resolver tRPC, chamado pelo
// router `instrumentC` (via DI Facade — padrao S060 herdado do
// `roiCalculationEngine`) e pelo Route Handler
// `POST /api/portal/save-instrument-a` (via setter DI — padrao S036
// herdado da ME-023) apos cada gravacao canonica de A ou C.
//
// Convencoes canonicas desta ME:
//   - `now` sempre parametro explicito. Determinismo total (S044/L38).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })` — padrao ja consolidado
//     em `roiCalculationEngine` e `cycleScheduleEngine`.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/plenitudeCalculationEngine.test.ts`. A Facade
//     e o DEFAULT sao consumidos pelo router `instrumentC` e pelo
//     Route Handler `POST /api/portal/save-instrument-a`.
//   - Idempotencia canonica (§6.4 literal — "Reexecucao idempotente"):
//     reexecucao para o mesmo (companyId, employeeId, trimestre)
//     sobrescreve `plenitudeData` via UPSERT. `calculadoEm` atualizado
//     a cada execucao.
//   - Sincronismo canonico: motor chamado in-band, FORA da transacao
//     de escrita do instrumento (S102 — dentro da transacao forcaria
//     tratar `MySql2Transaction × MySql2Database`, padrao ja evitado
//     na ME-038 e ME-039). Se o motor falhar, a resposta do submit
//     falha; o instrumento ja foi persistido pela transacao anterior;
//     motor pode ser reexecutado no proximo submit ou por reprocessing
//     manual. §6.4 canoniza "reexecucao idempotente".
//   - Persistencia canonica (§6.4 literal): motor SEMPRE upserta uma
//     linha em `plenitudeData` para o trio canonico. Se A ou C esta
//     ausente ou incompleto, todos os campos de score ficam nulos
//     ("o registro em `plenitudeData` permanece com os campos de
//     score nulos, e nenhum calculo do 9-Box e executado" — §6.4). O
//     `motivo` do skip vive apenas no retorno tipado (S103, S054
//     estendido — enum de status pertence ao motor 9-Box em
//     `nineBoxCalculationLog`, nao a este motor).
//
// Decisoes de autor RV-08 desta ME (indice §7):
//   - S102 — sincrono in-band, fora da transacao.
//   - S103 — `plenitudeData` sempre upsertado; scores nulos quando
//     A ou C faltar.
//   - S104 — 2 pontos [EDIT] (router C + Route Handler A) cobrem os
//     4 caminhos canonicos (INSERT+OVERWRITE de A e de C). Overwrites
//     de service NAO recebem hook (sem chamador de producao).
//   - S105 — motor exposto como funcao pura + `PlenitudeEngineFacade`
//     + `DEFAULT_PLENITUDE_ENGINE` (padrao S060 do Eixo X).
//   - S106 — `src/server/services/plenitudeCalculationEngine.ts`
//     (nao `engines/`, que nao existe no repo).
//   - S107 — instrumento "presente" = 20 linhas exatas cobrindo grid
//     4x5 canonico. Qualquer contagem diferente = ausente/incompleto
//     (defesa de ultima linha — a transacao atomica dos submits ja
//     impede persistencia parcial em uso normal).
//   - S108 — placeholder ANTECIPADO em ME-041. O motor 9-Box (§7)
//     agora e acionado aqui, in-band, apenas quando `motivo ===
//     'ambos_completos'` (S112) — precondicao canonica §7.1 do 9-Box.
//   - S112 — hook UMA vez por escrita completa (paralelo a S088/S104):
//     overwrites de service e caminhos incompletos NAO acionam 9-Box.
//   - S113 — `nineBoxEngine?: NineBoxEngineFacade` opcional na
//     assinatura, com `DEFAULT_NINE_BOX_ENGINE` como fallback (padrao
//     S060/S105 replicado do proprio Eixo Y).
//   - S117 — excecao do motor 9-Box PROPAGA ao caller do plenitude,
//     sem try/catch silencioso. Como o UPSERT em `plenitudeData` ja
//     ocorreu antes da chamada ao 9-Box (S110, paralelo direto ao
//     S102 do proprio plenitude), o commit do plenitude nao e
//     desfeito por falha do 9-Box.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  companies,
  instrumentA_responses,
  instrumentC_assessments,
  plenitudeData,
} from '../../db/schema';
import { DEFAULT_CLIMATE_ENGINE, type ClimateEngineFacade } from './climateCalculationEngine';
import { DEFAULT_NINE_BOX_ENGINE, type NineBoxEngineFacade } from './nineBoxCalculationEngine';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * Thresholds default canonicos das colunas
 * `companies.thresholdPlenitudeBaixo`/`thresholdPlenitudeMedio` (DOC 01
 * + DOC 03 §6.4). Usados quando a empresa nao personalizou (colunas
 * NULL). Reusar aqui evita drift entre schema, motor e testes.
 */
export const DEFAULT_THRESHOLD_PLENITUDE_BAIXO = 50;
export const DEFAULT_THRESHOLD_PLENITUDE_MEDIO = 75;

/**
 * Peso canonico do `scoreA` na composicao do `plenitudeScore` (§6.4
 * literal — "0.40"). Fixo, nao configuravel.
 */
export const PESO_SCORE_A = 0.4;

/**
 * Peso canonico do `scoreC` na composicao do `plenitudeScore` (§6.4
 * literal — "0.60"). Fixo, nao configuravel.
 */
export const PESO_SCORE_C = 0.6;

/**
 * Limiar canonico de divergencia para `alertaDivergencia = true`
 * (§6.4 literal — "Se divergencia > 25"). Fixo, nao configuravel.
 * A comparacao e ESTRITAMENTE maior (`> 25`, nao `>=`); exatamente 25
 * NAO dispara alerta.
 */
export const DIVERGENCIA_ALERTA = 25;

/** Numero canonico de dimensoes do grid do Instrumento A/C (§6.2/§6.3). */
export const NUM_DIMENSOES_PLENITUDE = 4;

/** Numero canonico de itens por dimensao do grid (§6.2/§6.3). */
export const NUM_ITENS_POR_DIMENSAO_PLENITUDE = 5;

/** Numero canonico total de itens do Instrumento A ou C (§6.2/§6.3). */
export const NUM_ITENS_TOTAL_PLENITUDE = 20;

/**
 * Soma maxima canonica dos 20 valores (todos 4) — usada no
 * denominador da formula do `score` (§6.4 literal — "/ 80 × 100"). Uma
 * dimensao completa (5 itens) tem soma maxima de 20.
 */
const SOMA_MAX_INSTRUMENTO = 80;
const SOMA_MAX_DIMENSAO = 20;

// ============================================================
// Tipos publicos
// ============================================================

/**
 * Motivo canonico do resultado do motor. Devolvido tipado como parte
 * do `PlenitudeCalculationResult` (S103, S054 estendido) — NAO
 * persistido em `plenitudeData` (§6.4 literal — nulos nos campos de
 * score sao a marcacao canonica). Enum de status persistido pertence
 * ao motor 9-Box (`nineBoxCalculationLog` — §7.7), nao a este motor.
 *
 * Cases canonicos:
 *   - `ambos_completos` — A e C ambos com 20 itens cobrindo grid 4x5.
 *     `plenitudeData` upsertado com todos os scores calculados.
 *   - `instrumento_a_ausente` — apenas C completo. Scores nulos.
 *   - `instrumento_c_ausente` — apenas A completo. Scores nulos.
 *   - `ambos_ausentes` — nem A nem C completos (caso teorico — motor
 *     e canonicamente chamado apos gravacao de um dos dois; existe
 *     como defesa em cenarios de reprocessing manual). Scores nulos.
 */
export type PlenitudeCalculationMotivo =
  'ambos_completos' | 'instrumento_a_ausente' | 'instrumento_c_ausente' | 'ambos_ausentes';

/**
 * Resultado canonico de `recalculatePlenitude`. Reflete o estado
 * final apos o upsert canonico em `plenitudeData`.
 *
 * Quando `motivo === 'ambos_completos'`: todos os scores estao
 * preenchidos e refletem o calculo determinístico do §6.4. Quando
 * qualquer outro motivo: todos os scores sao `null` (§6.4 literal —
 * "campos de score nulos") e `alertaDivergencia = false`. A linha em
 * `plenitudeData` existe em qualquer caso (garantia canonica do
 * upsert).
 */
export interface PlenitudeCalculationResult {
  companyId: number;
  employeeId: number;
  trimestre: string;
  motivo: PlenitudeCalculationMotivo;
  /** Verdadeiro se `motivo === 'ambos_completos'` (facilita consumo). */
  calculado: boolean;
  scoreA: number | null;
  scoreC: number | null;
  plenitudeScore: number | null;
  faixaPlenitude: 'baixa' | 'media' | 'alta' | null;
  divergencia: number | null;
  alertaDivergencia: boolean;
  /** Scores por dimensao do Instrumento A (informativos, §6.4 literal). */
  engajamentoA: number | null;
  desenvolvimentoA: number | null;
  pertencimentoA: number | null;
  realizacaoA: number | null;
  /** Scores por dimensao do Instrumento C (informativos, §6.4 literal). */
  engajamentoC: number | null;
  desenvolvimentoC: number | null;
  pertencimentoC: number | null;
  realizacaoC: number | null;
  /** `calculadoEm` gravado em `plenitudeData` (== `now` do input). */
  calculadoEm: Date;
}

/**
 * Fachada canonica do motor de plenitude. Contrato minimo que o
 * router `instrumentC` e o Route Handler `POST /api/portal/save-
 * instrument-a` consomem. Producao aponta para
 * `plenitudeCalculationEngine.recalculatePlenitude` desta ME. Teste
 * injeta mock que apenas conta chamadas / valida input.
 */
export interface PlenitudeEngineFacade {
  recalculatePlenitude: (
    db: RoipDatabase,
    companyId: number,
    employeeId: number,
    trimestre: string,
    now: Date,
  ) => Promise<PlenitudeCalculationResult>;
}

/**
 * DI default canonica: aponta para o motor real desta ME. O router
 * `instrumentC` e o Route Handler `POST /api/portal/save-instrument-a`
 * usam este default; testes que injetam mock passam `plenitudeEngine`
 * explicito (via factory no router, via `__set...PlenitudeEngine` no
 * handler).
 */
export const DEFAULT_PLENITUDE_ENGINE: PlenitudeEngineFacade = {
  recalculatePlenitude,
};

// ============================================================
// Formulas canonicas puras (§6.4 literal)
// ============================================================

/**
 * Arredonda para 2 casas decimais deterministicamente. As colunas
 * `plenitudeData.*` sao `decimal(5,2)`; explicitar aqui a precisao
 * garante que o valor comparado em JS e o mesmo persistido em MySQL.
 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Formula canonica do `score` de um instrumento (§6.4 literal):
 * `(soma dos 20 valores) / 80 × 100`. Range: 0 a 100.
 */
export function computeScoreInstrumento(soma20: number): number {
  return round2((soma20 / SOMA_MAX_INSTRUMENTO) * 100);
}

/**
 * Formula canonica do `score` de uma dimensao (§6.4 literal):
 * `(soma dos 5 valores) / 20 × 100`. Range: 0 a 100. Informativo —
 * NAO entra na composicao do `plenitudeScore`.
 */
export function computeScoreDimensao(soma5: number): number {
  return round2((soma5 / SOMA_MAX_DIMENSAO) * 100);
}

/**
 * Formula canonica do `plenitudeScore` (§6.4 literal):
 * `0.40 × scoreA + 0.60 × scoreC`. Pesos fixos, nao configuraveis.
 * Range: 0 a 100.
 */
export function computePlenitudeScore(scoreA: number, scoreC: number): number {
  return round2(PESO_SCORE_A * scoreA + PESO_SCORE_C * scoreC);
}

/**
 * Formula canonica da divergencia (§6.4 literal):
 * `|scoreA - scoreC|`. Range: 0 a 100.
 */
export function computeDivergencia(scoreA: number, scoreC: number): number {
  return round2(Math.abs(scoreA - scoreC));
}

/**
 * Regra canonica do alerta de divergencia (§6.4 literal):
 * `divergencia > 25 → true`. Comparacao estritamente maior; exatamente
 * 25 NAO dispara alerta.
 */
export function computeAlertaDivergencia(divergencia: number): boolean {
  return divergencia > DIVERGENCIA_ALERTA;
}

/**
 * Regra canonica da faixa de plenitude (§6.4 literal):
 *   - `< thresholdBaixo` → `baixa`
 *   - `thresholdBaixo ≤ score ≤ thresholdMedio` → `media`
 *   - `> thresholdMedio` → `alta`
 *
 * Fronteiras canonicas INCLUSIVAS na faixa `media`: exatamente
 * `thresholdBaixo` e exatamente `thresholdMedio` classificam como
 * `media`.
 */
export function computeFaixaPlenitude(
  score: number,
  thresholdBaixo: number,
  thresholdMedio: number,
): 'baixa' | 'media' | 'alta' {
  if (score < thresholdBaixo) {
    return 'baixa';
  }
  if (score > thresholdMedio) {
    return 'alta';
  }
  return 'media';
}

// ============================================================
// Helpers privados
// ============================================================

/**
 * Verifica que a lista de itens persistidos cobre exatamente as 20
 * combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem
 * duplicatas e sem lacunas. Retorna `true` se cobre; `false` caso
 * contrario. Defesa canonica S107: a transacao atomica dos submits
 * ja impede persistencia parcial em uso normal, mas em cenarios de
 * reprocessing manual pode existir historico parcial — o motor trata
 * qualquer cobertura diferente como ausente (scores nulos).
 */
function itensCobremGrid(itens: readonly { dimensao: number; itemIndex: number }[]): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_PLENITUDE) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL_PLENITUDE) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Soma os valores agrupados por `dimensao`. Retorna um mapa
 * `dimensao → soma`. Assume que a lista cobre o grid canonico
 * (garantido pelo caller via `itensCobremGrid`).
 */
function somaPorDimensao(
  itens: readonly { dimensao: number; valor: number }[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const item of itens) {
    out.set(item.dimensao, (out.get(item.dimensao) ?? 0) + item.valor);
  }
  return out;
}

/**
 * Soma todos os valores da lista. Assume que a lista cobre o grid
 * canonico (garantido pelo caller via `itensCobremGrid`).
 */
function somaTotal(itens: readonly { valor: number }[]): number {
  let out = 0;
  for (const item of itens) {
    out += item.valor;
  }
  return out;
}

/**
 * Resolve os thresholds canonicos da empresa. Colunas
 * `thresholdPlenitudeBaixo`/`thresholdPlenitudeMedio` em `companies`
 * sao nullable no schema; NULL == default canonico
 * (`DEFAULT_THRESHOLD_PLENITUDE_BAIXO`/`_MEDIO`).
 */
function resolveThresholds(
  thresholdBaixoDb: number | null,
  thresholdMedioDb: number | null,
): { baixo: number; medio: number } {
  return {
    baixo: thresholdBaixoDb ?? DEFAULT_THRESHOLD_PLENITUDE_BAIXO,
    medio: thresholdMedioDb ?? DEFAULT_THRESHOLD_PLENITUDE_MEDIO,
  };
}

/**
 * Resultado canonico do calculo por dimensao. Retornado por
 * `calculaScoresInstrumento` — os quatro scores por dimensao mais o
 * `scoreInstrumento` agregado.
 */
interface ScoresInstrumento {
  scoreInstrumento: number;
  dimensao1: number;
  dimensao2: number;
  dimensao3: number;
  dimensao4: number;
}

/**
 * Calcula os quatro scores por dimensao e o score agregado do
 * instrumento a partir da lista canonica de 20 itens (assume grid
 * completo).
 */
function calculaScoresInstrumento(
  itens: readonly { dimensao: number; valor: number }[],
): ScoresInstrumento {
  const somasPorDim = somaPorDimensao(itens);
  return {
    scoreInstrumento: computeScoreInstrumento(somaTotal(itens)),
    dimensao1: computeScoreDimensao(somasPorDim.get(1) ?? 0),
    dimensao2: computeScoreDimensao(somasPorDim.get(2) ?? 0),
    dimensao3: computeScoreDimensao(somasPorDim.get(3) ?? 0),
    dimensao4: computeScoreDimensao(somasPorDim.get(4) ?? 0),
  };
}

// ============================================================
// Motor canonico
// ============================================================

/**
 * Motor canonico do Eixo Y (`plenitudeScore`). Consumido pelo router
 * `instrumentC.saveInstrumentCAssessment` e pelo Route Handler
 * `POST /api/portal/save-instrument-a` apos cada gravacao canonica
 * de A ou C (padrao S060/S036 estendido — DI Facade / setter).
 *
 * Fluxo canonico:
 *   1. Le as respostas do Instrumento A do (employeeId, trimestre).
 *   2. Le as avaliacoes do Instrumento C do (employeeId, trimestre).
 *   3. Determina completude canonica (S107: exatamente 20 itens
 *      cobrindo grid 4x5).
 *   4. Se ambos completos: calcula scores, `plenitudeScore`,
 *      `divergencia`, `alertaDivergencia`, faixa (usando thresholds
 *      da empresa) e os 8 scores por dimensao.
 *   5. Se falta A ou C (ou ambos): todos os campos de score ficam
 *      nulos (§6.4 literal).
 *   6. UPSERT em `plenitudeData` para o trio canonico. O UNIQUE
 *      `uq_plenitude(companyId, employeeId, trimestre)` garante
 *      uma unica linha.
 *   7. Retorna `PlenitudeCalculationResult` tipado.
 *
 * Este motor NUNCA lanca por logica canonica (falta de instrumento
 * NAO e erro — e o caminho canonico do §6.4). Lanca apenas por
 * defeito de infraestrutura (banco fora, FK invalida). O caller
 * canonico (router / Route Handler) propaga o erro para o cliente.
 */
export async function recalculatePlenitude(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
  now: Date,
  nineBoxEngine?: NineBoxEngineFacade,
  climateEngine?: ClimateEngineFacade,
): Promise<PlenitudeCalculationResult> {
  // -------- 1) Le A e C (query direta — sem SQL cru, sem service) --------
  const itensA = await db
    .select({
      dimensao: instrumentA_responses.dimensao,
      itemIndex: instrumentA_responses.itemIndex,
      valor: instrumentA_responses.valor,
    })
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.employeeId, employeeId),
        eq(instrumentA_responses.trimestre, trimestre),
      ),
    );

  const itensC = await db
    .select({
      dimensao: instrumentC_assessments.dimensao,
      itemIndex: instrumentC_assessments.itemIndex,
      valor: instrumentC_assessments.valor,
    })
    .from(instrumentC_assessments)
    .where(
      and(
        eq(instrumentC_assessments.employeeId, employeeId),
        eq(instrumentC_assessments.trimestre, trimestre),
      ),
    );

  const aCompleto = itensCobremGrid(itensA);
  const cCompleto = itensCobremGrid(itensC);

  // -------- 2) Determina motivo canonico --------
  let motivo: PlenitudeCalculationMotivo;
  if (aCompleto && cCompleto) {
    motivo = 'ambos_completos';
  } else if (aCompleto && !cCompleto) {
    motivo = 'instrumento_c_ausente';
  } else if (!aCompleto && cCompleto) {
    motivo = 'instrumento_a_ausente';
  } else {
    motivo = 'ambos_ausentes';
  }

  // -------- 3) Calcula scores quando ambos completos --------
  let scoreA: number | null = null;
  let scoreC: number | null = null;
  let plenitudeScoreValue: number | null = null;
  let faixa: 'baixa' | 'media' | 'alta' | null = null;
  let divergencia: number | null = null;
  let alertaDivergencia = false;
  let engajamentoA: number | null = null;
  let desenvolvimentoA: number | null = null;
  let pertencimentoA: number | null = null;
  let realizacaoA: number | null = null;
  let engajamentoC: number | null = null;
  let desenvolvimentoC: number | null = null;
  let pertencimentoC: number | null = null;
  let realizacaoC: number | null = null;

  if (motivo === 'ambos_completos') {
    // Le thresholds canonicos da empresa (§6.4 literal — colunas
    // customizaveis; NULL == default). Consulta minima tipada
    // (RV-12 — Drizzle puro).
    const [comp] = await db
      .select({
        thresholdBaixo: companies.thresholdPlenitudeBaixo,
        thresholdMedio: companies.thresholdPlenitudeMedio,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    // Defesa canonica: companyId invalido == erro de infraestrutura
    // (o caller ja validou vinculo canonico do employee → company).
    if (!comp) {
      throw new Error(
        `recalculatePlenitude: empresa nao encontrada ` +
          `(companyId=${companyId}, employeeId=${employeeId}, trimestre=${trimestre})`,
      );
    }

    const thresholds = resolveThresholds(comp.thresholdBaixo, comp.thresholdMedio);

    const scoresA = calculaScoresInstrumento(itensA);
    const scoresC = calculaScoresInstrumento(itensC);

    scoreA = scoresA.scoreInstrumento;
    scoreC = scoresC.scoreInstrumento;
    plenitudeScoreValue = computePlenitudeScore(scoreA, scoreC);
    divergencia = computeDivergencia(scoreA, scoreC);
    alertaDivergencia = computeAlertaDivergencia(divergencia);
    faixa = computeFaixaPlenitude(plenitudeScoreValue, thresholds.baixo, thresholds.medio);

    engajamentoA = scoresA.dimensao1;
    desenvolvimentoA = scoresA.dimensao2;
    pertencimentoA = scoresA.dimensao3;
    realizacaoA = scoresA.dimensao4;
    engajamentoC = scoresC.dimensao1;
    desenvolvimentoC = scoresC.dimensao2;
    pertencimentoC = scoresC.dimensao3;
    realizacaoC = scoresC.dimensao4;
  }

  // -------- 4) UPSERT canonico em plenitudeData --------
  // Padrao S060 herdado do roiCalculationEngine: `.insert(...)
  // .onDuplicateKeyUpdate({ set: {...} })`. O UNIQUE
  // `uq_plenitude(companyId, employeeId, trimestre)` garante uma
  // unica linha por trio; a segunda chamada com o mesmo trio
  // atualiza sem duplicar.
  //
  // Conversao decimal canonica: `String(number)` — MySQL
  // decimal(5,2) faz o rounding server-side; JS `round2` acima
  // ja garante consistencia lado-cliente. Nulo → null explicito.
  const scoreAStr = scoreA === null ? null : String(scoreA);
  const scoreCStr = scoreC === null ? null : String(scoreC);
  const plenitudeScoreStr = plenitudeScoreValue === null ? null : String(plenitudeScoreValue);
  const divergenciaStr = divergencia === null ? null : String(divergencia);
  const engajamentoAStr = engajamentoA === null ? null : String(engajamentoA);
  const desenvolvimentoAStr = desenvolvimentoA === null ? null : String(desenvolvimentoA);
  const pertencimentoAStr = pertencimentoA === null ? null : String(pertencimentoA);
  const realizacaoAStr = realizacaoA === null ? null : String(realizacaoA);
  const engajamentoCStr = engajamentoC === null ? null : String(engajamentoC);
  const desenvolvimentoCStr = desenvolvimentoC === null ? null : String(desenvolvimentoC);
  const pertencimentoCStr = pertencimentoC === null ? null : String(pertencimentoC);
  const realizacaoCStr = realizacaoC === null ? null : String(realizacaoC);

  await db
    .insert(plenitudeData)
    .values({
      companyId,
      employeeId,
      trimestre,
      scoreA: scoreAStr,
      scoreC: scoreCStr,
      plenitudeScore: plenitudeScoreStr,
      faixaPlenitude: faixa,
      divergencia: divergenciaStr,
      alertaDivergencia,
      engajamentoA: engajamentoAStr,
      engajamentoC: engajamentoCStr,
      desenvolvimentoA: desenvolvimentoAStr,
      desenvolvimentoC: desenvolvimentoCStr,
      pertencimentoA: pertencimentoAStr,
      pertencimentoC: pertencimentoCStr,
      realizacaoA: realizacaoAStr,
      realizacaoC: realizacaoCStr,
      calculadoEm: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        scoreA: scoreAStr,
        scoreC: scoreCStr,
        plenitudeScore: plenitudeScoreStr,
        faixaPlenitude: faixa,
        divergencia: divergenciaStr,
        alertaDivergencia,
        engajamentoA: engajamentoAStr,
        engajamentoC: engajamentoCStr,
        desenvolvimentoA: desenvolvimentoAStr,
        desenvolvimentoC: desenvolvimentoCStr,
        pertencimentoA: pertencimentoAStr,
        pertencimentoC: pertencimentoCStr,
        realizacaoA: realizacaoAStr,
        realizacaoC: realizacaoCStr,
        calculadoEm: now,
      },
    });

  // -------- 5) Hook canonico para o motor 9-Box (S112/S113/S117) --------
  //
  // Aciona `calculateNineBoxClassification` UMA vez por escrita
  // canonica completa do plenitude. S112 canoniza a cobertura por
  // caminho completo (paralelo direto a S088/S104 — sem hook em
  // caminho incompleto e sem hook redundante em overwrites de service).
  //
  // S110/S117: motor 9-Box roda in-band, FORA da transacao do plenitude
  // (o UPSERT em `plenitudeData` acima ja foi commitado); excecao
  // propaga ao caller do plenitude sem try/catch silencioso — o
  // commit do plenitude nao e desfeito por falha do 9-Box.
  //
  // S113: `nineBoxEngine` opcional injetavel; producao usa o
  // `DEFAULT_NINE_BOX_ENGINE`. Testes de dogfood da chain (ME-041)
  // substituem para spy/isolamento.
  if (motivo === 'ambos_completos') {
    const engine = nineBoxEngine ?? DEFAULT_NINE_BOX_ENGINE;
    await engine.calculateNineBoxClassification(db, companyId, employeeId, trimestre, now);
  }

  // -------- 6) Hook canonico para o motor Clima (S170) --------
  //
  // Aciona `recalculateAggregates` UMA vez por escrita canonica
  // completa do plenitude, APOS o hook do 9-Box. Paralelo direto de
  // S104/S112 (9-Box hook): scoreA e gravado em `plenitudeData`
  // apenas em `ambos_completos`; recalcular o Clima em outro motivo
  // seria trabalho perdido. §9.10 canoniza "sempre que
  // calculatePlenitudeScore e executado para qualquer colaborador"
  // — a leitura literal do §9.1 restringe a fonte a `scoreA IS NOT
  // NULL`, o que implica motivo `ambos_completos` na semantica
  // vigente do §6.4.
  //
  // S110/S117 replicados: motor Clima roda in-band, FORA da
  // transacao do plenitude (o UPSERT em `plenitudeData` acima ja
  // foi commitado); excecao propaga ao caller do plenitude sem
  // try/catch silencioso — o commit do plenitude nao e desfeito
  // por falha do Clima.
  //
  // S168: `climateEngine` opcional injetavel; producao usa o
  // `DEFAULT_CLIMATE_ENGINE`. Testes de dogfood da chain (ME-047)
  // substituem para spy/isolamento.
  //
  // S169: motor recalcula TODOS os escopos vigentes da empresa
  // no trimestre — assinatura `(db, companyId, trimestre, now)`
  // sem `employeeId` (paralelo aos jobs canonicos §17 do DOC 06).
  if (motivo === 'ambos_completos') {
    const engineClimate = climateEngine ?? DEFAULT_CLIMATE_ENGINE;
    await engineClimate.recalculateAggregates(db, companyId, trimestre, now);
  }

  // -------- 7) Retorno canonico tipado --------
  return {
    companyId,
    employeeId,
    trimestre,
    motivo,
    calculado: motivo === 'ambos_completos',
    scoreA,
    scoreC,
    plenitudeScore: plenitudeScoreValue,
    faixaPlenitude: faixa,
    divergencia,
    alertaDivergencia,
    engajamentoA,
    desenvolvimentoA,
    pertencimentoA,
    realizacaoA,
    engajamentoC,
    desenvolvimentoC,
    pertencimentoC,
    realizacaoC,
    calculadoEm: now,
  };
}
