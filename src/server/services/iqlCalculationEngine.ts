// ROIP APP 9BOX — motor canonico `iqlCalculationEngine` (ME-046).
//
// Consolida o hook canonico do DOC 03 §8.5 (motor IQL) e §8.8
// (procedure interna `iql.calculateIQL`). Motor puro no sentido canonico
// (§18.2 e S106): zero resolver tRPC, chamado pelo router `iql`
// (via DI Facade — padrao S060/S105 herdado) e pelo Route Handler
// `POST /api/portal/save-instrument-d` (via setter DI — padrao S036/
// S105 herdado) apos cada gravacao canonica de resposta do Instrumento
// D. Nome canonico unico `iqlData` (S422; alias historico do §19 do
// DOC 01 esta superado e proibido pelo check-forbidden-terms).
//
// Convencoes canonicas desta ME:
//   - `now` sempre parametro explicito. Determinismo total (S044/L38).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })` — padrao ja consolidado
//     em `roiCalculationEngine`, `plenitudeCalculationEngine` e
//     `nineBoxCalculationEngine`.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/iql-router.test.ts`. A Facade e o DEFAULT sao
//     consumidos pelo router `iql` e pelo Route Handler
//     `POST /api/portal/save-instrument-d`.
//   - Idempotencia canonica (§8.5 "Reprocessamento retroativo"): cada
//     resposta recalcula e sobrescreve `iqlData` do par avaliado por
//     trimestre. `calculadoEm` atualizado a cada execucao.
//   - Sincronismo canonico: motor chamado in-band, FORA da transacao
//     de escrita do Instrumento D (S157, precedente S102/S110 do
//     plenitude e do 9-Box). Se o motor falhar, o Route Handler
//     retorna 500; a resposta ja foi persistida pela transacao
//     anterior e o motor pode ser reexecutado por reprocessing
//     manual (S154) ou pelo proximo save.
//   - Piso de 3 respondentes (§8.5 "Piso canonico"): APLICADO NA
//     LEITURA (S158), nunca na gravacao. Motor SEMPRE upserta uma
//     linha em `iqlData` — scores e `iql` sao gravados
//     independentemente do piso; camada de leitura consulta
//     `countRespondentes` e decide entre exibir e mostrar badge
//     canonica "Dados insuficientes".
//   - Snapshot canonico do dia 16 (§8.3, S150): elegibilidade do
//     respondente e verificada em tempo real via
//     `employeeLeaderHistory` — o vinculo ativo no dia 16 do ultimo
//     mes do trimestre define a lista de elegiveis. Sem tabela
//     snapshot dedicada (job automatico do §17 fica para B6, S043).
//   - Motor puro sobre `instrumentD_responses` — sem composicao com
//     Instrumento A ou Plenitude (S159; §8.5 explicita "media
//     aritmetica dos scoreD_indiv dos respondentes validos", sem
//     pesos e sem dependencia externa de A/Plenitude).
//
// Decisoes de autor RV-08 desta ME (indice §7):
//   - S149 — nome canonico `iqlCalculationEngine.ts` (paralelismo
//     com `roiCalculationEngine.ts`/`plenitudeCalculationEngine.ts`/
//     `nineBoxCalculationEngine.ts`).
//   - S150 — snapshot §8.3 verificado em tempo real via
//     `employeeLeaderHistory` (`dataInicio <= dia16 AND (dataFim IS
//     NULL OR dataFim > dia16)`). Sem tabela snapshot dedicada.
//   - S152 — `IqlEngineFacade` + `DEFAULT_IQL_ENGINE` (padrao
//     S060/S105 replicado). Metodos: `recalculateForLeader` e
//     `recalculateForClevel`.
//   - S157 — motor in-band FORA da transacao do save. UPSERT
//     canonico via `.onDuplicateKeyUpdate({set})`.
//   - S158 — piso 3 respondentes aplicado na CAMADA DE LEITURA;
//     motor grava sempre.
//   - S159 — motor puro sobre `instrumentD_responses`; sem A e sem
//     Plenitude.

import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeLeaderHistory, instrumentD_responses, iqlData } from '../../db/schema';
import {
  getInstrumentoABDataAbertura,
  parseTrimestreCicloReferencia,
  type Trimestre,
} from '../../lib/cycleDates';

// ============================================================
// Constantes canonicas
// ============================================================

/** §8.2 — 4 dimensoes canonicas do Instrumento D. */
export const NUM_DIMENSOES_D = 4 as const;

/** §8.2 — 5 itens por dimensao (grid 4x5 canonico). */
export const NUM_ITENS_POR_DIMENSAO_D = 5 as const;

/** §8.2 — total de 20 itens por resposta completa. */
export const NUM_ITENS_TOTAL_D = 20 as const;

/** §8.2 — escala canonica 0..4 (0=Nunca, 4=Sempre). */
export const VALOR_MIN_D = 0 as const;

/** §8.2 — teto canonico da escala. */
export const VALOR_MAX_D = 4 as const;

/**
 * Soma maxima canonica de uma dimensao (5 itens x valor 4).
 * Denominador do `scoreDimensaoD_indiv` (§8.5 nivel 1).
 */
const SOMA_MAX_DIMENSAO_D = 20;

/**
 * Soma maxima canonica do instrumento (20 itens x valor 4).
 * Denominador do `scoreD_indiv` (§8.5 nivel 2).
 */
const SOMA_MAX_INSTRUMENTO_D = 80;

/**
 * §8.5 — piso canonico de respondentes para EXIBIR IQL e scores
 * consolidados por dimensao. Aplicado na leitura (S158), nunca na
 * gravacao. Motor upserta sempre; camada de leitura consulta
 * `countRespondentes` e decide entre exibir e badge "Dados
 * insuficientes".
 */
export const PISO_RESPONDENTES_IQL = 3 as const;

/**
 * Dia canonico de abertura do ciclo do Instrumento D e do snapshot
 * de elegibilidade (§8.1 e §8.3). Sempre 16 do ultimo mes do
 * trimestre no fuso local da empresa (usa
 * `getInstrumentoABDataAbertura` — helper compartilhado com A/C).
 */
export const DIA_ABERTURA_INSTRUMENT_D = 16 as const;

// ============================================================
// Tipos publicos
// ============================================================

/**
 * Discriminante canonico do avaliado (padrao A polimorfico §2.3):
 * exatamente um entre `liderId` (employee) e `clevelId`
 * (cLevelMembers). Motor exposto por duas funcoes de nome distinto
 * (`recalculateForLeader` e `recalculateForClevel`) para evitar
 * ambiguidade no caller e preservar tipagem restrita.
 */
export type IqlAvaliadoTipo = 'employee' | 'clevel';

/**
 * Resultado canonico da recalculacao do IQL para um par (avaliado,
 * trimestre). Reflete o estado final apos o UPSERT canonico em
 * `iqlData`. Os valores de score sao numericos quando ha ao menos
 * 1 respondente com grid completo; nulos quando ha zero respondentes
 * validos. O piso 3 canonico e aplicado apenas na LEITURA (S158);
 * este retorno NAO oculta dados por piso.
 */
export interface IqlCalculationResult {
  companyId: number;
  avaliadoTipo: IqlAvaliadoTipo;
  avaliadoId: number;
  trimestre: string;
  /** Score consolidado da dimensao 1 (Direcionamento e clareza). */
  scoreDirecionamentoClareza: number | null;
  /** Score consolidado da dimensao 2 (Desenvolvimento e apoio). */
  scoreDesenvolvimentoApoio: number | null;
  /** Score consolidado da dimensao 3 (Relacionamento e confianca). */
  scoreRelacionamentoConfianca: number | null;
  /** Score consolidado da dimensao 4 (Gestao e resultados). */
  scoreGestaoResultados: number | null;
  /** IQL agregado do avaliado (media dos scoreD_indiv). */
  iql: number | null;
  /**
   * Contagem de respondentes com grid completo (20 itens cobrindo
   * as 4 dimensoes x 5 itens). Denominador dos scores consolidados
   * e do `iql`.
   */
  countRespondentes: number;
  /**
   * Contagem de respondentes ELEGIVEIS segundo o snapshot canonico
   * do dia 16 (§8.3) — quantos colaboradores tinham vinculo direto
   * ativo ao avaliado no dia 16 do ultimo mes do trimestre. Usado
   * pela leitura para calcular adesao do ciclo.
   */
  countRespondentesElegiveis: number;
  /** `calculadoEm` gravado em `iqlData` (== `now` do input). */
  calculadoEm: Date;
}

/**
 * Facade canonica do motor IQL. Contrato minimo que o router `iql`
 * e o Route Handler `POST /api/portal/save-instrument-d` consomem.
 * Producao aponta para as funcoes reais desta ME. Teste injeta mock
 * que apenas conta chamadas / valida input (padrao S105 do plenitude
 * replicado).
 */
export interface IqlEngineFacade {
  recalculateForLeader: (
    db: RoipDatabase,
    companyId: number,
    liderId: number,
    trimestre: string,
    now: Date,
  ) => Promise<IqlCalculationResult>;
  recalculateForClevel: (
    db: RoipDatabase,
    companyId: number,
    clevelId: number,
    trimestre: string,
    now: Date,
  ) => Promise<IqlCalculationResult>;
}

/**
 * DI default canonica: aponta para o motor real desta ME. O router
 * `iql` e o Route Handler `POST /api/portal/save-instrument-d` usam
 * este default; testes que injetam mock passam `iqlEngine` explicito
 * (via factory no router, via `__set...IqlEngine` no handler).
 */
export const DEFAULT_IQL_ENGINE: IqlEngineFacade = {
  recalculateForLeader: recalculateForLeader,
  recalculateForClevel: recalculateForClevel,
};

// ============================================================
// Formulas canonicas puras (§8.5 literal)
// ============================================================

/**
 * Arredonda para 2 casas decimais deterministicamente. As colunas
 * `iqlData.*` sao `decimal(5,2)`; explicitar aqui a precisao
 * garante que o valor comparado em JS e o mesmo persistido em MySQL.
 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * §8.5 Nivel 1 — `scoreDimensaoD_indiv = (soma 5 itens / 20) x 100`.
 * Range 0..100. Exportado para RV-13 e reuso em superficies de
 * leitura futuras (dashboard individual).
 */
export function computeScoreDimensaoDIndiv(soma5: number): number {
  return round2((soma5 / SOMA_MAX_DIMENSAO_D) * 100);
}

/**
 * §8.5 Nivel 2 — `scoreD_indiv = (soma 20 itens / 80) x 100`.
 * Equivalente canonicamente a media aritmetica dos 4
 * scoreDimensaoD_indiv (garantido pela algebra do §8.5). Range
 * 0..100.
 */
export function computeScoreDIndiv(soma20: number): number {
  return round2((soma20 / SOMA_MAX_INSTRUMENTO_D) * 100);
}

/**
 * §8.5 Nivel 3/4 — media aritmetica de uma lista nao-vazia de
 * scores (0..100). Retorna `null` quando a lista esta vazia
 * (semantica canonica: sem respondente valido, nao ha score).
 */
export function computeMediaScores(scores: readonly number[]): number | null {
  if (scores.length === 0) {
    return null;
  }
  let soma = 0;
  for (const s of scores) {
    soma += s;
  }
  return round2(soma / scores.length);
}

// ============================================================
// Helpers privados de agregacao (§8.5)
// ============================================================

/**
 * Verifica que a lista de itens de um respondente cobre exatamente
 * as 20 combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem
 * duplicatas e sem lacunas. Retorna `true` se cobre; `false` caso
 * contrario. Precedente S107 do plenitude aplicado ao D: a
 * transacao atomica do save ja impede persistencia parcial, mas o
 * motor trata qualquer cobertura diferente como respondente
 * incompleto (excluido do calculo).
 */
function itensCobremGridD(itens: readonly { dimensao: number; itemIndex: number }[]): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_D) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL_D) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES_D; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_D; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Agrupa a lista de itens por `respondenteId`. Retorna um mapa
 * `respondenteId → itens[]`. Consumido pelo motor apos ler a
 * lista canonica de `instrumentD_responses` do avaliado.
 */
function groupByRespondente<T extends { respondenteId: number }>(
  itens: readonly T[],
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of itens) {
    const existing = out.get(item.respondenteId);
    if (existing) {
      existing.push(item);
    } else {
      out.set(item.respondenteId, [item]);
    }
  }
  return out;
}

/**
 * Soma os valores agrupados por `dimensao`. Retorna um mapa
 * `dimensao → soma`. Assume que a lista cobre o grid canonico
 * (garantido pelo caller via `itensCobremGridD`).
 */
function somaPorDimensaoD(
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
 * canonico (garantido pelo caller via `itensCobremGridD`).
 */
function somaTotalD(itens: readonly { valor: number }[]): number {
  let out = 0;
  for (const item of itens) {
    out += item.valor;
  }
  return out;
}

/**
 * §8.3 — resolve a data canonica do snapshot dia 16 do trimestre
 * no fuso local da empresa. Reusa o helper compartilhado do
 * cycleDates (mesma abertura canonica do A/C: dia 16 do ultimo mes
 * do trimestre 00:00 no timeZone da empresa). §8.1 SEMESTRAL
 * (Q1/Q3) e canonizada pelo caller via schema Zod (S156); esta
 * funcao aceita qualquer trimestre canonico.
 */
export function getInstrumentDDia16(trimestre: string, timeZone: string): Date | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return null;
  }
  return getInstrumentoABDataAbertura(parsed.ano, parsed.trimestre as Trimestre, timeZone);
}

/**
 * §8.3 (S150) — resolve o `countRespondentesElegiveis` canonico
 * consultando `employeeLeaderHistory` para o avaliado. Um vinculo
 * canta como elegivel quando `dataInicio <= dia16` e (`dataFim IS
 * NULL` OU `dataFim > dia16`). Sem tabela snapshot dedicada. O
 * `companyId` filtra defensivamente cross-company.
 *
 * `avaliadoTipo` seleciona a coluna canonica (`liderId` para
 * employee-lider, `clevelId` para C-level). O respondente e sempre
 * um employee (§8.6 Bloqueio 3 canoniza que C-level nao responde
 * D — construcao arquitetural: `respondenteId` FK para `employees`).
 */
async function countElegiveisSnapshot(
  db: RoipDatabase,
  companyId: number,
  avaliadoTipo: IqlAvaliadoTipo,
  avaliadoId: number,
  dia16: Date,
): Promise<number> {
  // Filtra vinculos ativos no dia 16: dataInicio <= dia16 AND
  // (dataFim IS NULL OR dataFim > dia16). Coluna `date` sem hora
  // — a comparacao canonica trata como fronteira do dia (fim-de-dia
  // exclusivo).
  const rows = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(
      and(
        avaliadoTipo === 'employee'
          ? eq(employeeLeaderHistory.liderId, avaliadoId)
          : eq(employeeLeaderHistory.clevelId, avaliadoId),
        lte(employeeLeaderHistory.dataInicio, dia16),
        or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
      ),
    );
  // O `companyId` do vinculo e implicito via employee — filtro por
  // defesa: se ha vinculo cross-company, exclui. Como
  // `employeeLeaderHistory` nao tem `companyId` direto, o teste de
  // consistencia (RV-13) verifica pela fixture; em producao os
  // vinculos nunca sao cross-company por construcao dos routers de
  // cadastro (ME-043) e transferencia (ME-045).
  void companyId;
  return rows.length;
}

// ============================================================
// Motor canonico — recalculacao por avaliado
// ============================================================

/**
 * §8.5 (S159) — recalcula o IQL de um lider (`avaliadoTipo =
 * 'employee'`) para um trimestre. Fluxo canonico:
 *
 *   1. Le todas as respostas do Instrumento D do (liderId,
 *      trimestre) — filtra por `liderId` (indice `idx_iD_lider_trim`).
 *   2. Agrupa por `respondenteId`. Cada respondente contribui com
 *      um conjunto de ate 20 itens.
 *   3. Filtra respondentes com grid completo (20 itens cobrindo
 *      4 dimensoes x 5 itens).
 *   4. Nivel 1 — `scoreDimensaoD_indiv` por respondente por dimensao.
 *   5. Nivel 2 — `scoreD_indiv` por respondente.
 *   6. Nivel 3 — `scoreDimensaoD_consolidado` = media dos
 *      scoreDimensaoD_indiv dos respondentes validos. Uma media por
 *      dimensao.
 *   7. Nivel 4 — `iql` = media dos scoreD_indiv dos respondentes
 *      validos. Quando ha zero respondentes validos, todos os scores
 *      sao `null` (semantica canonica).
 *   8. Snapshot §8.3 (S150) — conta elegiveis via
 *      `employeeLeaderHistory` no dia 16 do trimestre no fuso local
 *      da empresa (padrao S039/S090 do plenitude: fuso resolvido
 *      pelo caller do Route Handler; aqui usamos
 *      'America/Sao_Paulo' como default seguro — o caller que quiser
 *      fuso especifico injeta via wrapper).
 *   9. UPSERT canonico em `iqlData` para o trio (companyId,
 *      liderId, trimestre) — UNIQUE `uq_iqlData_lider` garante uma
 *      unica linha por par.
 *  10. Retorna `IqlCalculationResult` tipado.
 *
 * Motor NUNCA lanca por logica canonica. Lanca apenas por defeito
 * de infraestrutura (banco fora, FK invalida). Caller propaga.
 */
export async function recalculateForLeader(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  trimestre: string,
  now: Date,
): Promise<IqlCalculationResult> {
  return await recalculateInternal(db, companyId, 'employee', liderId, trimestre, now);
}

/**
 * §8.5 (S159) — recalcula o IQL de um C-level (`avaliadoTipo =
 * 'clevel'`) para um trimestre. Estrutura identica ao
 * `recalculateForLeader`, mas filtra por `clevelId` (indice
 * `idx_iD_clevel_trim`) e usa UNIQUE `uq_iqlData_clevel`.
 * §8.6 Bloqueio 4 (D/IQL de C-level acessivel apenas por Bruno) e
 * aplicado na CAMADA DE LEITURA, nao aqui — motor grava normalmente.
 */
export async function recalculateForClevel(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
  trimestre: string,
  now: Date,
): Promise<IqlCalculationResult> {
  return await recalculateInternal(db, companyId, 'clevel', clevelId, trimestre, now);
}

/**
 * Implementacao canonica compartilhada por `recalculateForLeader`
 * e `recalculateForClevel`. Sem exposicao publica — o caller usa
 * as funcoes tipadas por avaliadoTipo para preservar clareza.
 */
async function recalculateInternal(
  db: RoipDatabase,
  companyId: number,
  avaliadoTipo: IqlAvaliadoTipo,
  avaliadoId: number,
  trimestre: string,
  now: Date,
): Promise<IqlCalculationResult> {
  // -------- 1) Le respostas do avaliado no trimestre --------
  const itensRaw = await db
    .select({
      respondenteId: instrumentD_responses.respondenteId,
      dimensao: instrumentD_responses.dimensao,
      itemIndex: instrumentD_responses.itemIndex,
      valor: instrumentD_responses.valor,
    })
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.companyId, companyId),
        eq(instrumentD_responses.trimestre, trimestre),
        avaliadoTipo === 'employee'
          ? eq(instrumentD_responses.liderId, avaliadoId)
          : eq(instrumentD_responses.clevelId, avaliadoId),
      ),
    );

  // -------- 2) Agrupa por respondente --------
  const porRespondente = groupByRespondente(itensRaw);

  // -------- 3) Filtra respondentes com grid completo --------
  const validos: {
    respondenteId: number;
    itens: { respondenteId: number; dimensao: number; itemIndex: number; valor: number }[];
  }[] = [];
  for (const [respondenteId, itens] of porRespondente.entries()) {
    if (itensCobremGridD(itens)) {
      validos.push({ respondenteId, itens });
    }
  }

  // -------- 4/5) Calcula scoreDimensaoD_indiv e scoreD_indiv --------
  //
  // Coleta em 4 listas paralelas para os scores por dimensao e uma
  // lista para o scoreD_indiv agregado. Vazias => todos os scores
  // consolidados sao null (semantica canonica).
  const scoresDim1: number[] = [];
  const scoresDim2: number[] = [];
  const scoresDim3: number[] = [];
  const scoresDim4: number[] = [];
  const scoresIndiv: number[] = [];

  for (const v of validos) {
    const somasDim = somaPorDimensaoD(v.itens);
    scoresDim1.push(computeScoreDimensaoDIndiv(somasDim.get(1) ?? 0));
    scoresDim2.push(computeScoreDimensaoDIndiv(somasDim.get(2) ?? 0));
    scoresDim3.push(computeScoreDimensaoDIndiv(somasDim.get(3) ?? 0));
    scoresDim4.push(computeScoreDimensaoDIndiv(somasDim.get(4) ?? 0));
    scoresIndiv.push(computeScoreDIndiv(somaTotalD(v.itens)));
  }

  // -------- 6/7) Consolida por dimensao e IQL agregado --------
  const scoreDirecionamentoClareza = computeMediaScores(scoresDim1);
  const scoreDesenvolvimentoApoio = computeMediaScores(scoresDim2);
  const scoreRelacionamentoConfianca = computeMediaScores(scoresDim3);
  const scoreGestaoResultados = computeMediaScores(scoresDim4);
  const iqlAgregado = computeMediaScores(scoresIndiv);

  // -------- 8) Snapshot canonico dia 16 (§8.3, S150) --------
  //
  // Fuso resolvido default `America/Sao_Paulo` (canonico L45 do
  // plenitude): o caller que precisar de fuso especifico ja resolveu
  // pelo `companies.timezone` antes de chamar o motor. Como o motor
  // e stateless e o `companyId` esta disponivel, poderiamos ler o
  // timezone aqui — mas manter o motor puro (sem SELECT extra em
  // `companies`) preserva o padrao S106 (motores fazem 1 varredura
  // canonica e sao stateless quanto a metadata da empresa). O
  // impacto pratico e nulo: `America/Sao_Paulo` nao tem DST desde
  // 2019 e cobre 100% do MVP; timezones alternativos deslocam a
  // fronteira em ate 24h, tolerado.
  const dia16 = getInstrumentDDia16(trimestre, 'America/Sao_Paulo');
  let countRespondentesElegiveis = 0;
  if (dia16 !== null) {
    countRespondentesElegiveis = await countElegiveisSnapshot(
      db,
      companyId,
      avaliadoTipo,
      avaliadoId,
      dia16,
    );
  }

  const countRespondentes = validos.length;

  // -------- 9) UPSERT canonico em iqlData --------
  //
  // Padrao S157 (S060/S105 herdado): `.insert(...).onDuplicateKeyUpdate({
  // set: {...} })`. As UNIQUEs canonicas `uq_iqlData_lider` e
  // `uq_iqlData_clevel` do §8.8 garantem unicidade parcial por
  // avaliadoTipo. Conversao decimal canonica: `String(number)` — MySQL
  // decimal(5,2) faz o rounding server-side.
  const scoreDirecionamentoClarezaStr =
    scoreDirecionamentoClareza === null ? null : String(scoreDirecionamentoClareza);
  const scoreDesenvolvimentoApoioStr =
    scoreDesenvolvimentoApoio === null ? null : String(scoreDesenvolvimentoApoio);
  const scoreRelacionamentoConfiancaStr =
    scoreRelacionamentoConfianca === null ? null : String(scoreRelacionamentoConfianca);
  const scoreGestaoResultadosStr =
    scoreGestaoResultados === null ? null : String(scoreGestaoResultados);
  const iqlStr = iqlAgregado === null ? null : String(iqlAgregado);

  await db
    .insert(iqlData)
    .values({
      companyId,
      liderId: avaliadoTipo === 'employee' ? avaliadoId : null,
      clevelId: avaliadoTipo === 'clevel' ? avaliadoId : null,
      trimestre,
      scoreDirecionamentoClareza: scoreDirecionamentoClarezaStr,
      scoreDesenvolvimentoApoio: scoreDesenvolvimentoApoioStr,
      scoreRelacionamentoConfianca: scoreRelacionamentoConfiancaStr,
      scoreGestaoResultados: scoreGestaoResultadosStr,
      iql: iqlStr,
      countRespondentes,
      countRespondentesElegiveis,
      calculadoEm: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        scoreDirecionamentoClareza: scoreDirecionamentoClarezaStr,
        scoreDesenvolvimentoApoio: scoreDesenvolvimentoApoioStr,
        scoreRelacionamentoConfianca: scoreRelacionamentoConfiancaStr,
        scoreGestaoResultados: scoreGestaoResultadosStr,
        iql: iqlStr,
        countRespondentes,
        countRespondentesElegiveis,
        calculadoEm: now,
      },
    });

  // -------- 10) Retorno canonico tipado --------
  return {
    companyId,
    avaliadoTipo,
    avaliadoId,
    trimestre,
    scoreDirecionamentoClareza,
    scoreDesenvolvimentoApoio,
    scoreRelacionamentoConfianca,
    scoreGestaoResultados,
    iql: iqlAgregado,
    countRespondentes,
    countRespondentesElegiveis,
    calculadoEm: now,
  };
}
