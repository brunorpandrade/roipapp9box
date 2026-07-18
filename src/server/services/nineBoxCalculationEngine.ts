// ROIP APP 9BOX — motor canonico do 9-Box (ME-041, DOC 03 §7.1-7.8).
//
// Composicao deterministica do quadrante trimestral do colaborador a
// partir dos scores dos dois eixos canonicos (X = Desempenho, §3.11
// literal; Y = Plenitude, §6.4 literal). Acionado in-band pelo
// `plenitudeCalculationEngine.recalculatePlenitude` quando o motor de
// plenitude fecha o trimestre em caminho completo (S112 — DOC 03 §7.9
// literal "acionada pelo `calculatePlenitudeScore`").
//
// Decisoes canonicas desta ME (§7 do ROIP_OPERACAO_MANUS.md):
//
//   - S110 — motor sincrono in-band FORA da transacao do plenitude
//     (paralelo direto a S102 do plenitude vs. hooks A/C — dentro da
//     transacao forcaria tratar `MySql2Transaction x MySql2Database`,
//     padrao ja evitado na ME-038/039/040). Falha do motor 9-Box NAO
//     desfaz o upsert do plenitude (ja commitado); caller do plenitude
//     ve a excecao propagar (S117).
//
//   - S111 — persistencia dupla canonica:
//       caminho 'calculado': UPSERT em `nineBoxClassifications`
//         (UNIQUE `uq_nineBox(companyId, employeeId, trimestre)` — §8.4
//         literal do DOC 01) + INSERT append-only em
//         `nineBoxCalculationLog` com `status='calculado'`, ambos
//         DENTRO de uma unica transacao Drizzle tipada (L54).
//       caminhos ausentes ('eixo_x_ausente' / 'eixo_y_ausente' /
//         'ambos_ausentes'): apenas o INSERT no log — atomico por si
//         so, sem `db.transaction`. NAO grava em classifications.
//     Coluna canonica do log e `status` (DOC 01 §8.6 literal), nao
//     `motivo`; log NAO persiste snapshots numericos (§8.6 tem apenas
//     `status` + `observacao TEXT`; snapshots vivem so em
//     classifications — D-C da ME-041).
//
//   - S112 — hook do plenitude para 9-Box acionado UMA vez por
//     escrita completa, apenas quando `motivo === 'ambos_completos'`
//     (paralelo a S088/S104 — cobertura por caminho completo, sem
//     hook redundante em caminho incompleto). Overwrites de service e
//     caminhos incompletos NAO acionam 9-Box.
//
//   - S113 — `NineBoxEngineFacade` + `DEFAULT_NINE_BOX_ENGINE`
//     (paralelo a S105/S060). DI real por default; testes substituem
//     para isolar o motor 9-Box quando exercitando a chain via
//     `recalculatePlenitude` (dogfood).
//
//   - S116 — nomenclatura §7.3 preservada com acentos literais em
//     UTF-8 no `NINE_BOX_QUADRANTE_MAP` (uma linha por quadrante,
//     `max-len 100` atendido — RV-14 sem exceção). ENUMs Drizzle em
//     `nineBoxClassifications.quadrante` (§8.4 do DOC 01) refletem
//     bit-a-bit os 9 nomes canonicos (`EQUILÍBRIO FRÁGIL`,
//     `DESEMPENHO CRÍTICO`, `RISCO CRÍTICO`, `RISCO DE ESGOTAMENTO`,
//     `DESGASTE OCULTO`, `POTENCIAL SUBUTILIZADO`, `DESEMPENHO
//     REPRESADO`, `ALTO IMPACTO`, `ALTA ENTREGA`).
//
//   - S117 — propagacao de excecao do 9-Box ao caller do plenitude
//     (sem try/catch silencioso). Alinhado com S102 do proprio
//     plenitude; caller do plenitude (`instrumentC.saveInstrumentC
//     Assessment` / `POST /api/portal/save-instrument-a`) escolhe como
//     reagir.
//
//   - CC004 — DOC 03 §18.1 chama o arquivo de motor de
//     `nineBoxClassificationEngine.ts`. Correcao canonica aplicada:
//     arquivo canonizado como `nineBoxCalculationEngine.ts`
//     (paralelismo com `roiCalculationEngine.ts` e
//     `plenitudeCalculationEngine.ts` + coerencia com a tabela de log
//     `nineBoxCalculationLog`). §7.9 permanece intocado (nome do
//     metodo publico `calculateNineBoxClassification` inalterado).
//
// Convencoes reforcadas:
//   - `now` sempre parametro explicito (S044/L38). Determinismo total.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })`.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/nineBoxCalculationEngine.test.ts`. A Facade e
//     o DEFAULT sao consumidos pelo [EDIT] em
//     `plenitudeCalculationEngine.recalculatePlenitude`.
//   - Idempotencia canonica (§7.8 literal — "O motor pode ser
//     reexecutado quantas vezes for necessario"): reexecucao para o
//     mesmo (companyId, employeeId, trimestre) sobrescreve
//     `nineBoxClassifications` via UPSERT; `nineBoxCalculationLog`
//     cresce (append-only, S111).
//   - `nineBoxClassifications.quadranteAnterior` e VARCHAR(50) —
//     armazena o nome literal do quadrante do trimestre imediatamente
//     anterior (§8.4 do DOC 01), preservando os acentos §7.3.

import { and, eq } from 'drizzle-orm';

import {
  companies,
  nineBoxCalculationLog,
  nineBoxClassifications,
  performanceQuarterlyData,
  plenitudeData,
} from '../../db/schema';
import type { RoipDatabase } from '../../db/client';
import {
  formatTrimestreCicloReferencia,
  getPreviousTrimestre,
  parseTrimestreCicloReferencia,
} from '../../lib/cycleDates';

// ============================================================
// Constantes canonicas (§7.2 literal, defaults da coluna companies)
// ============================================================

/**
 * Threshold canonico default do Eixo X (Desempenho) para a fronteira
 * `< baixo → 'baixo'` (§7.2 literal — "default 60"). Usado quando
 * `companies.thresholdDesempenhoBaixo` esta NULL. Bate com o default
 * da migration `int('thresholdDesempenhoBaixo').default(60)`.
 */
export const NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_BAIXO = 60;

/**
 * Threshold canonico default do Eixo X (Desempenho) para a fronteira
 * `> medio → 'alto'` (§7.2 literal — "default 85"). Usado quando
 * `companies.thresholdDesempenhoMedio` esta NULL.
 */
export const NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_MEDIO = 85;

/**
 * Threshold canonico default do Eixo Y (Plenitude) para a fronteira
 * `< baixa → 'baixa'` (§7.2 literal — "default 50"). Coincide
 * numericamente com `DEFAULT_THRESHOLD_PLENITUDE_BAIXO` do
 * `plenitudeCalculationEngine` — duplicacao intencional para evitar
 * dependencia ciclica de import (o plenitude ja importa a Facade
 * deste motor).
 */
export const NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_BAIXO = 50;

/**
 * Threshold canonico default do Eixo Y (Plenitude) para a fronteira
 * `> media → 'alta'` (§7.2 literal — "default 75"). Coincide
 * numericamente com `DEFAULT_THRESHOLD_PLENITUDE_MEDIO` do
 * `plenitudeCalculationEngine`.
 */
export const NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_MEDIO = 75;

// ============================================================
// Tipos publicos (S116 — acentos preservados literalmente)
// ============================================================

/** Posicao canonica no Eixo X do 9-Box (§7.2). */
export type NineBoxPosicaoX = 'baixo' | 'medio' | 'alto';

/** Posicao canonica no Eixo Y do 9-Box (§7.2). */
export type NineBoxPosicaoY = 'baixa' | 'media' | 'alta';

/**
 * Nome canonico do quadrante do 9-Box (§7.3 literal, com acentos).
 * Bate bit-a-bit com o ENUM `nineBoxClassifications.quadrante` (DOC 01
 * §8.4). O tipo VARCHAR(50) da coluna `quadranteAnterior` armazena o
 * mesmo conjunto de valores.
 */
export type NineBoxQuadrante =
  | 'ALTO IMPACTO'
  | 'DESEMPENHO REPRESADO'
  | 'POTENCIAL SUBUTILIZADO'
  | 'ALTA ENTREGA'
  | 'EQUILÍBRIO FRÁGIL'
  | 'DESEMPENHO CRÍTICO'
  | 'RISCO DE ESGOTAMENTO'
  | 'DESGASTE OCULTO'
  | 'RISCO CRÍTICO';

/**
 * Direcao canonica de movimento em relacao ao trimestre imediatamente
 * anterior (§7.5 literal). Regra de prioridade diagonal §7.5: quando
 * ambos os eixos mudam, a seta reflete o movimento do Eixo Y (a
 * mudanca no Eixo X e refletida pela mudanca de coluna do quadrante).
 */
export type NineBoxDirecaoMovimento = 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez';

/**
 * Motivo canonico do log quando o motor NAO calcula por ausencia de
 * pre-condicao (§7.1). Bate bit-a-bit com o subset nao-`calculado`
 * do ENUM `nineBoxCalculationLog.status` (DOC 01 §8.6).
 */
export type NineBoxMotivoAusencia = 'eixo_x_ausente' | 'eixo_y_ausente' | 'ambos_ausentes';

/**
 * Resultado canonico de `calculateNineBoxClassification`. Discriminado
 * por `calculated`:
 *   - `calculated: true` — UPSERT em `nineBoxClassifications` foi
 *     efetuado; log `status='calculado'` gravado (S111).
 *   - `calculated: false` — apenas linha em `nineBoxCalculationLog` foi
 *     gravada com `status = motivo`; NAO ha registro em classifications
 *     (§7.1 literal — "NAO criar registro em nineBoxClassifications").
 */
export type NineBoxCalculationResult =
  | {
      calculated: true;
      companyId: number;
      employeeId: number;
      trimestre: string;
      scoreDesempenho: number;
      plenitudeScore: number;
      posicaoX: NineBoxPosicaoX;
      posicaoY: NineBoxPosicaoY;
      quadrante: NineBoxQuadrante;
      quadranteAnterior: NineBoxQuadrante | null;
      direcaoMovimento: NineBoxDirecaoMovimento;
      calculadoEm: Date;
    }
  | {
      calculated: false;
      companyId: number;
      employeeId: number;
      trimestre: string;
      motivo: NineBoxMotivoAusencia;
      calculadoEm: Date;
    };

/**
 * Fachada canonica do motor de 9-Box (S113). Contrato minimo que o
 * `plenitudeCalculationEngine.recalculatePlenitude` consome via
 * `nineBoxEngine ?? DEFAULT_NINE_BOX_ENGINE`. Producao aponta para o
 * motor real desta ME. Teste substitui para verificar acionamento
 * (spy) ou para isolar o motor 9-Box quando exercitando a chain
 * end-to-end via plenitude.
 */
export interface NineBoxEngineFacade {
  calculateNineBoxClassification: (
    db: RoipDatabase,
    companyId: number,
    employeeId: number,
    trimestre: string,
    now: Date,
  ) => Promise<NineBoxCalculationResult>;
}

/**
 * DI default canonica (S113). Consumida pelo [EDIT] em
 * `plenitudeCalculationEngine.recalculatePlenitude` quando o caller do
 * plenitude nao passa `nineBoxEngine` explicito.
 */
export const DEFAULT_NINE_BOX_ENGINE: NineBoxEngineFacade = {
  calculateNineBoxClassification,
};

// ============================================================
// Mapa canonico dos 9 quadrantes (§7.3, S116 — acentos literais)
// ============================================================

/**
 * Mapa canonico `[posicaoX][posicaoY] -> NineBoxQuadrante` (§7.3
 * literal). Uma constante por combinacao; acentos UTF-8 preservados
 * bit-a-bit. `readonly` via `as const satisfies` — TS bloqueia
 * mutacoes e valida completude da matriz 3x3.
 */
export const NINE_BOX_QUADRANTE_MAP = {
  baixo: {
    alta: 'POTENCIAL SUBUTILIZADO',
    media: 'DESEMPENHO CRÍTICO',
    baixa: 'RISCO CRÍTICO',
  },
  medio: {
    alta: 'DESEMPENHO REPRESADO',
    media: 'EQUILÍBRIO FRÁGIL',
    baixa: 'DESGASTE OCULTO',
  },
  alto: {
    alta: 'ALTO IMPACTO',
    media: 'ALTA ENTREGA',
    baixa: 'RISCO DE ESGOTAMENTO',
  },
} as const satisfies Record<NineBoxPosicaoX, Record<NineBoxPosicaoY, NineBoxQuadrante>>;

/**
 * Lista canonica dos 9 nomes de quadrante (§7.3), na ordem literal do
 * ENUM `nineBoxClassifications.quadrante` do DOC 01 §8.4. Exportada
 * para consumo em auditorias e testes (ordem canonica documentada).
 */
export const NINE_BOX_QUADRANTES: readonly NineBoxQuadrante[] = [
  'ALTO IMPACTO',
  'DESEMPENHO REPRESADO',
  'POTENCIAL SUBUTILIZADO',
  'ALTA ENTREGA',
  'EQUILÍBRIO FRÁGIL',
  'DESEMPENHO CRÍTICO',
  'RISCO DE ESGOTAMENTO',
  'DESGASTE OCULTO',
  'RISCO CRÍTICO',
] as const;

// ============================================================
// Formulas canonicas puras (§7.2, §7.3, §7.5)
// ============================================================

/**
 * Formula canonica §7.2 (Eixo X):
 *   - `score < thresholdBaixo` → `'baixo'`.
 *   - `score > thresholdMedio` → `'alto'`.
 *   - caso contrario           → `'medio'`.
 *
 * Comparacoes ESTRITAS (`<`, `>`). Score exatamente igual ao
 * threshold cai em `'medio'` (fronteira canonica inclusiva no meio).
 */
export function computePosicaoX(
  score: number,
  thresholdBaixo: number,
  thresholdMedio: number,
): NineBoxPosicaoX {
  if (score < thresholdBaixo) {
    return 'baixo';
  }
  if (score > thresholdMedio) {
    return 'alto';
  }
  return 'medio';
}

/**
 * Formula canonica §7.2 (Eixo Y):
 *   - `score < thresholdBaixo` → `'baixa'`.
 *   - `score > thresholdMedio` → `'alta'`.
 *   - caso contrario           → `'media'`.
 *
 * Comparacoes ESTRITAS. Coerente com `computeFaixaPlenitude` do
 * `plenitudeCalculationEngine` (mesma regra do §6.4, aplicada aqui a
 * partir do `plenitudeScore` ja persistido em `plenitudeData`).
 */
export function computePosicaoY(
  score: number,
  thresholdBaixo: number,
  thresholdMedio: number,
): NineBoxPosicaoY {
  if (score < thresholdBaixo) {
    return 'baixa';
  }
  if (score > thresholdMedio) {
    return 'alta';
  }
  return 'media';
}

/**
 * Compoe o nome canonico do quadrante a partir das posicoes X e Y
 * (§7.3 literal). Aplicacao direta de `NINE_BOX_QUADRANTE_MAP`.
 */
export function computeQuadrante(
  posicaoX: NineBoxPosicaoX,
  posicaoY: NineBoxPosicaoY,
): NineBoxQuadrante {
  return NINE_BOX_QUADRANTE_MAP[posicaoX][posicaoY];
}

/**
 * Ordem canonica do Eixo Y para prioridade diagonal (§7.5): baixa < media < alta.
 */
const ORDEM_POSICAO_Y: Readonly<Record<NineBoxPosicaoY, number>> = {
  baixa: 0,
  media: 1,
  alta: 2,
};

/**
 * Estado do trimestre imediatamente anterior — passado para
 * `computeDirecaoMovimento`. `null` quando nao ha classificacao
 * anterior no banco (primeira vez do colaborador no 9-Box).
 */
export interface NineBoxAnteriorEstado {
  quadrante: NineBoxQuadrante;
  posicaoY: NineBoxPosicaoY;
}

/**
 * Formula canonica §7.5 (direcao de movimento vs. trimestre anterior):
 *   1. Sem anterior                                 → `'primeira_vez'`.
 *   2. Quadrante atual == quadrante anterior        → `'estavel'`.
 *   3. `posicaoY` mudou (subiu ou desceu)           → `'subiu'` ou `'desceu'`
 *      (regra canonica de prioridade em diagonais §7.5 — a seta
 *      reflete o Eixo Y, mesmo quando o Eixo X tambem mudou).
 *   4. Apenas `posicaoX` mudou (`posicaoY` igual)   → `'lateral'`.
 *
 * A regra do passo 3 tem precedencia sobre a do passo 4 — em diagonais
 * puras (X e Y mudam simultaneamente), o resultado e `'subiu'` ou
 * `'desceu'`, NUNCA `'lateral'`.
 */
export function computeDirecaoMovimento(
  atualQuadrante: NineBoxQuadrante,
  atualPosicaoY: NineBoxPosicaoY,
  anterior: NineBoxAnteriorEstado | null,
): NineBoxDirecaoMovimento {
  if (anterior === null) {
    return 'primeira_vez';
  }
  if (atualQuadrante === anterior.quadrante) {
    return 'estavel';
  }
  if (atualPosicaoY !== anterior.posicaoY) {
    return ORDEM_POSICAO_Y[atualPosicaoY] > ORDEM_POSICAO_Y[anterior.posicaoY] ? 'subiu' : 'desceu';
  }
  // Y igual, quadrante diferente → so X mudou.
  return 'lateral';
}

// ============================================================
// Helpers privados
// ============================================================

/**
 * Deriva o `cicloReferencia` trimestral imediatamente anterior no
 * formato canonico `YYYY-QN` (`getPreviousTrimestre` + `format`).
 * Retorna `null` se `trimestre` nao bate no padrao canonico (defesa;
 * o motor e chamado com `trimestre` ja validado pelo caller).
 */
function trimestreAnterior(trimestre: string): string | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) return null;
  const prev = getPreviousTrimestre(parsed.ano, parsed.trimestre);
  return formatTrimestreCicloReferencia(prev.ano, prev.trimestre);
}

/**
 * Le a classificacao 9-Box do trimestre imediatamente anterior (se
 * existir) para (companyId, employeeId). Retorna `null` se nao houver
 * registro ou se `trimestre` for invalido. Usa a UNIQUE
 * `uq_nineBox(companyId, employeeId, trimestre)` — apenas 0 ou 1 linha.
 */
async function readAnteriorEstado(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
): Promise<NineBoxAnteriorEstado | null> {
  const trimAnt = trimestreAnterior(trimestre);
  if (trimAnt === null) return null;
  const [row] = await db
    .select({
      quadrante: nineBoxClassifications.quadrante,
      posicaoY: nineBoxClassifications.posicaoY,
    })
    .from(nineBoxClassifications)
    .where(
      and(
        eq(nineBoxClassifications.companyId, companyId),
        eq(nineBoxClassifications.employeeId, employeeId),
        eq(nineBoxClassifications.trimestre, trimAnt),
      ),
    );
  if (!row) return null;
  return {
    quadrante: row.quadrante as NineBoxQuadrante,
    posicaoY: row.posicaoY as NineBoxPosicaoY,
  };
}

/**
 * Le os thresholds canonicos da empresa. Substitui NULLs pelos
 * defaults canonicos §7.2 (`NINE_BOX_DEFAULT_THRESHOLD_*`). Uma
 * chamada de banco por invocacao.
 */
async function readThresholds(
  db: RoipDatabase,
  companyId: number,
): Promise<{
  desempenhoBaixo: number;
  desempenhoMedio: number;
  plenitudeBaixo: number;
  plenitudeMedio: number;
}> {
  const [row] = await db
    .select({
      thresholdDesempenhoBaixo: companies.thresholdDesempenhoBaixo,
      thresholdDesempenhoMedio: companies.thresholdDesempenhoMedio,
      thresholdPlenitudeBaixo: companies.thresholdPlenitudeBaixo,
      thresholdPlenitudeMedio: companies.thresholdPlenitudeMedio,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  return {
    desempenhoBaixo: row?.thresholdDesempenhoBaixo ?? NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_BAIXO,
    desempenhoMedio: row?.thresholdDesempenhoMedio ?? NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_MEDIO,
    plenitudeBaixo: row?.thresholdPlenitudeBaixo ?? NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_BAIXO,
    plenitudeMedio: row?.thresholdPlenitudeMedio ?? NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_MEDIO,
  };
}

/**
 * Le o `scoreDesempenho` canonico (Eixo X, §3.11) do trimestre em
 * `performanceQuarterlyData`. Retorna `null` se nao houver linha para
 * o trio ou se a coluna estiver NULL (§7.1 — trata coluna nula como
 * `eixo_x_ausente`).
 */
async function readScoreDesempenho(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
): Promise<number | null> {
  const [row] = await db
    .select({ scoreDesempenho: performanceQuarterlyData.scoreDesempenho })
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.employeeId, employeeId),
        eq(performanceQuarterlyData.trimestre, trimestre),
      ),
    );
  if (!row || row.scoreDesempenho === null) return null;
  return Number(row.scoreDesempenho);
}

/**
 * Le o `plenitudeScore` canonico (Eixo Y, §6.4) do trimestre em
 * `plenitudeData`. Retorna `null` se nao houver linha OU se a coluna
 * estiver NULL (o plenitude upserta linha mesmo em caminho incompleto
 * — S103 — mas com scores nulos; §7.1 trata isso como `eixo_y_ausente`).
 */
async function readPlenitudeScore(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
): Promise<number | null> {
  const [row] = await db
    .select({ plenitudeScore: plenitudeData.plenitudeScore })
    .from(plenitudeData)
    .where(and(eq(plenitudeData.employeeId, employeeId), eq(plenitudeData.trimestre, trimestre)));
  if (!row || row.plenitudeScore === null) return null;
  return Number(row.plenitudeScore);
}

// ============================================================
// Motor canonico
// ============================================================

/**
 * Motor canonico do 9-Box (§7.1-7.8). Consumido pelo
 * `plenitudeCalculationEngine.recalculatePlenitude` apos cada upsert
 * canonico em caminho completo (S112).
 *
 * Fluxo canonico:
 *   1. Pre-condicao §7.1: le `scoreDesempenho` (Eixo X) e
 *      `plenitudeScore` (Eixo Y) do trio `(employeeId, trimestre)`.
 *      Ausente algum → INSERT em `nineBoxCalculationLog` com `status`
 *      canonico ('eixo_x_ausente' / 'eixo_y_ausente' / 'ambos_ausentes');
 *      NAO grava em `nineBoxClassifications`; retorna
 *      `{ calculated: false, motivo, ... }` (S111 caminho ausente).
 *   2. Posicionamento §7.2: aplica thresholds da `companies` (com
 *      defaults canonicos quando NULL) via `computePosicaoX` e
 *      `computePosicaoY`.
 *   3. Nomenclatura §7.3: `computeQuadrante` (mapa 3x3, acentos S116).
 *   4. Direcao §7.5: le o registro do trimestre imediatamente anterior
 *      em `nineBoxClassifications`; aplica `computeDirecaoMovimento`
 *      (regra de prioridade diagonal §7.5). Se nao houver anterior →
 *      `'primeira_vez'` e `quadranteAnterior = null`.
 *   5. Persistencia §7.7 (S111 caminho calculado): UPSERT em
 *      `nineBoxClassifications` + INSERT em `nineBoxCalculationLog`
 *      com `status='calculado'`, DENTRO de UMA transacao Drizzle
 *      tipada (L54).
 *   6. Retorna `NineBoxCalculationResult` tipado.
 *
 * Este motor NUNCA lanca por logica canonica (ausencia de score NAO e
 * erro — e o caminho `calculated: false` do §7.1). Lanca apenas por
 * defeito de infraestrutura (banco fora, FK invalida, transacao
 * abortada). O caller canonico (`plenitudeCalculationEngine`) propaga
 * o erro para o caller do plenitude (S117).
 */
export async function calculateNineBoxClassification(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  trimestre: string,
  now: Date,
): Promise<NineBoxCalculationResult> {
  // -------- 1) Pre-condicao §7.1: le os dois scores --------
  const scoreDesempenho = await readScoreDesempenho(db, employeeId, trimestre);
  const plenitudeScore = await readPlenitudeScore(db, employeeId, trimestre);

  const eixoXAusente = scoreDesempenho === null;
  const eixoYAusente = plenitudeScore === null;

  if (eixoXAusente || eixoYAusente) {
    const motivo: NineBoxMotivoAusencia =
      eixoXAusente && eixoYAusente
        ? 'ambos_ausentes'
        : eixoXAusente
          ? 'eixo_x_ausente'
          : 'eixo_y_ausente';

    // S111 caminho ausente: apenas INSERT no log. Sem `db.transaction`
    // (INSERT unico e atomico por si so). Sem grava em classifications.
    await db.insert(nineBoxCalculationLog).values({
      companyId,
      employeeId,
      trimestre,
      status: motivo,
      registradoEm: now,
    });

    return {
      calculated: false,
      companyId,
      employeeId,
      trimestre,
      motivo,
      calculadoEm: now,
    };
  }

  // TS narrowing: neste ponto ambos os scores sao `number` (nao null).
  const scoreX = scoreDesempenho;
  const scoreY = plenitudeScore;

  // -------- 2) Thresholds da empresa (defaults §7.2 quando NULL) --------
  const thresholds = await readThresholds(db, companyId);

  // -------- 3) Posicionamento §7.2 e quadrante §7.3 --------
  const posicaoX = computePosicaoX(scoreX, thresholds.desempenhoBaixo, thresholds.desempenhoMedio);
  const posicaoY = computePosicaoY(scoreY, thresholds.plenitudeBaixo, thresholds.plenitudeMedio);
  const quadrante = computeQuadrante(posicaoX, posicaoY);

  // -------- 4) Direcao de movimento §7.5 --------
  const anterior = await readAnteriorEstado(db, companyId, employeeId, trimestre);
  const direcaoMovimento = computeDirecaoMovimento(quadrante, posicaoY, anterior);
  const quadranteAnterior: NineBoxQuadrante | null = anterior?.quadrante ?? null;

  // -------- 5) Persistencia §7.7 (S111 caminho calculado, L54) --------
  //
  // Conversao decimal canonica: colunas `scoreDesempenho decimal(6,2)`
  // e `plenitudeScore decimal(5,2)` recebem `string` no driver mysql2 —
  // padrao ja consolidado em `roiCalculationEngine` e `plenitudeCalculationEngine`.
  const scoreXStr = String(scoreX);
  const scoreYStr = String(scoreY);

  await db.transaction(async (tx) => {
    await tx
      .insert(nineBoxClassifications)
      .values({
        companyId,
        employeeId,
        trimestre,
        scoreDesempenho: scoreXStr,
        plenitudeScore: scoreYStr,
        posicaoX,
        posicaoY,
        quadrante,
        quadranteAnterior,
        direcaoMovimento,
        calculadoEm: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          scoreDesempenho: scoreXStr,
          plenitudeScore: scoreYStr,
          posicaoX,
          posicaoY,
          quadrante,
          quadranteAnterior,
          direcaoMovimento,
          calculadoEm: now,
        },
      });

    await tx.insert(nineBoxCalculationLog).values({
      companyId,
      employeeId,
      trimestre,
      status: 'calculado',
      registradoEm: now,
    });
  });

  // -------- 6) Retorno canonico tipado --------
  return {
    calculated: true,
    companyId,
    employeeId,
    trimestre,
    scoreDesempenho: scoreX,
    plenitudeScore: scoreY,
    posicaoX,
    posicaoY,
    quadrante,
    quadranteAnterior,
    direcaoMovimento,
    calculadoEm: now,
  };
}
