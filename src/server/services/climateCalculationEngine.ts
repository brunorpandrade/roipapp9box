// ROIP APP 9BOX — motor canonico `climateCalculationEngine` (ME-047).
//
// Consolida o hook canonico do DOC 03 §9 (Bloco Clima e Engajamento).
// Motor puro no sentido canonico (§18.2 e S106): zero resolver tRPC,
// chamado pelo router `climate` (via DI Facade — padrao S060/S105/S152
// herdado) e pelo `plenitudeCalculationEngine` (via DI opcional, hook
// in-band FORA da transacao apos o UPSERT em `plenitudeData` — padrao
// S104/S112 do 9-Box replicado sobre o Clima). Nome canonico
// `climateCalculationEngine.ts` — canonizado pela CC031 (D11 da regua
// modo docs). O nome antigo `climateAggregationEngine` esta superado
// e bloqueado pelo check-forbidden-terms.
//
// Fonte unica canonica (§9.1, S171): `plenitudeData.scoreA IS NOT
// NULL` dos colaboradores no escopo do trimestre. Instrumento C NAO
// entra (S160 canoniza a Opcao B) e Instrumento D NAO entra (a
// leitura de qualidade de lideranca segue integralmente representada
// pelo IQL da ME-046). Consulta a `instrumentA_responses` para a
// nota por questao (§9.4 — "media aritmetica do valor da questao
// nas respostas do Instrumento A / 4 x 10"); consulta a
// `plenitudeData` para o scoreA agregado e para os 4 scores por
// dimensao ja calculados pelo motor de plenitude (§6.4).
//
// Convencoes canonicas desta ME:
//   - `now` sempre parametro explicito. Determinismo total (S044/L38).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico via
//     `.onDuplicateKeyUpdate({ set: {...} })` — padrao ja consolidado
//     em `roiCalculationEngine`, `plenitudeCalculationEngine`,
//     `nineBoxCalculationEngine`, `iqlCalculationEngine`. UPSERT sem
//     delete de orfaos (S172): escopos historicos que deixam de
//     existir (departamento renomeado, lider inativado) permanecem
//     na tabela; a camada de leitura filtra por escopo vigente.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/climateCalculationEngine.test.ts` e
//     `tests/integration/climate-router.test.ts`. A Facade e o
//     DEFAULT sao consumidos pelo router `climate` e pelo
//     `plenitudeCalculationEngine` via DI opcional.
//   - Idempotencia canonica (§9.10 "reexecucao idempotente"): cada
//     chamada recalcula do zero e sobrescreve via UPSERT. Nenhum
//     estado interno persiste entre chamadas.
//   - Sincronismo canonico: motor chamado in-band, FORA da transacao
//     do plenitude (S170, precedente S102/S110/S157). Se o motor
//     falhar, a excecao propaga ao caller do plenitude (S117
//     replicado); o UPSERT em `plenitudeData` ja foi commitado.
//   - Piso 3 respondentes (§9.6): APLICADO NA LEITURA (S158, S177),
//     nunca na gravacao. Motor sempre grava a linha do escopo;
//     `countCobertura < 3` sinaliza para a camada de leitura decidir
//     entre exibir e badge canonica "Dados insuficientes".
//   - Snapshot canonico dia 16 (§9.5, S181): elegibilidade do
//     denominador `countTotal` verificada em tempo real via
//     `employees.dataAdmissao <= dia16`. Colaboradores admitidos
//     apos o dia 16 do ultimo mes do trimestre NAO entram no
//     denominador. Colaboradores inativados durante o trimestre com
//     `scoreA IS NOT NULL` entram normalmente (§9.5 literal). Reusa
//     `getInstrumentoABDataAbertura` compartilhado com A/C/D
//     (mesmo dia 16 canonico do IQL — S150).
//   - Cadeia descendente (§9.2 / DOC 01 §8.9): S173 canonizada como
//     loop Drizzle in-memory (BFS sobre `employeeLeaderHistory`
//     ativo). Sem CTE recursivo (RV-12: Drizzle 0.45 nao o expoe
//     tipado). Custo O(N) por empresa por chamada. Cadeia inclui
//     diretos e indiretos (DOC 01 §8.9 canonico).
//   - Escopo do recalculo (S169): uma chamada recalcula TODOS os
//     escopos da empresa no trimestre (empresa + N departamentos
//     ativos + M lideres com cadeia). Escolha canonica: idempotencia
//     absoluta e simplicidade do gatilho §9.10. Custo aceitavel para
//     PMEs (dezenas de escopos por empresa).
//
// Decisoes de autor RV-08 desta ME (indice §7):
//   - S168 — naming: `ClimateEngineFacade` + `DEFAULT_CLIMATE_ENGINE`
//     + metodo unico `recalculateAggregates`.
//   - S169 — assinatura `recalculateAggregates(db, companyId,
//     trimestre, now)` cobre TODOS os escopos vigentes.
//   - S170 — ponto de hook: dentro do `if (motivo ===
//     'ambos_completos')` do plenitude, APOS o hook do 9-Box.
//     Excecao propaga.
//   - S171 — filtro canonico: `plenitudeData.scoreA IS NOT NULL`
//     (leitura literal do §9.1).
//   - S172 — UPSERT sem delete de orfaos.
//   - S173 — cadeia descendente via loop Drizzle (BFS), sem CTE
//     recursivo.
//   - S176 — grid de escopo: DISTINCT `employees.departamento` de
//     empresa ativa + employees `isLider=true` ativos com >= 1
//     subordinado direto.
//   - S177 — mensagens §9.6-9.7 sao superficie de UI; motor apenas
//     grava contagens e notas.
//   - S180 — precisao numerica interna `round2`.
//   - S181 — snapshot dia 16 reusa `getInstrumentoABDataAbertura`
//     com timezone default `America/Sao_Paulo` (padrao S150 do IQL).
//
// Convencao interna de mapeamento questao -> coluna canonica:
//   `notaQuestaoNN` com NN = (dimensao - 1) * 5 + itemIndex, range
//   1..20. Assim: dimensao=1 -> notaQuestao01..05; dimensao=2 ->
//   notaQuestao06..10; dimensao=3 -> notaQuestao11..15; dimensao=4 ->
//   notaQuestao16..20. Convencao canonizada aqui — nao ha texto
//   literal no §9.4 que a fixe, mas e a unica que preserva ordem
//   canonica das dimensoes (Engajamento, Desenvolvimento,
//   Pertencimento, Realizacao) e itens crescentes.

import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  climateEngagementData,
  employeeLeaderHistory,
  employees,
  instrumentA_responses,
  plenitudeData,
} from '../../db/schema';
import {
  getInstrumentoABDataAbertura,
  parseTrimestreCicloReferencia,
  type Trimestre,
} from '../../lib/cycleDates';

// ============================================================
// Constantes canonicas
// ============================================================

/** §9.4 — 4 dimensoes canonicas do Instrumento A (compartilhadas com C). */
export const NUM_DIMENSOES_CLIMATE = 4 as const;

/** §9.4 — 5 itens por dimensao (grid 4x5 canonico). */
export const NUM_ITENS_POR_DIMENSAO_CLIMATE = 5 as const;

/** §9.4 — total de 20 questoes por trimestre por escopo. */
export const NUM_QUESTOES_CLIMATE = 20 as const;

/** §6.2 / §9.4 — teto canonico da escala do Instrumento A (0..4). */
export const VALOR_MAX_INSTRUMENTO_A = 4 as const;

/**
 * §9.6 — piso canonico de respondentes para EXIBIR o Bloco Clima.
 * Aplicado na leitura (S158, S177), nunca na gravacao. Motor upserta
 * sempre; camada de leitura consulta `countCobertura` e decide entre
 * exibir e badge "Dados insuficientes".
 */
export const PISO_RESPONDENTES_CLIMATE = 3 as const;

/**
 * Timezone default canonico para o snapshot dia 16. Paralelo S150
 * do IQL: `America/Sao_Paulo` cobre 100% do MVP e nao tem DST desde
 * 2019. Callers com fuso especifico injetam via wrapper — o motor
 * mantem-se stateless quanto a metadata da empresa.
 */
export const DEFAULT_TIMEZONE_CLIMATE = 'America/Sao_Paulo';

// ============================================================
// Tipos publicos
// ============================================================

/**
 * §9.2 — enum canonico dos 3 escopos do Bloco Clima. Casa
 * exatamente com o enum `escopo` de `climateEngagementData` (DOC 01
 * §8.9) e com D10 da regua canonic-consistency.
 */
type ClimateEscopo = 'empresa' | 'departamento' | 'equipe';

/**
 * §9.4/§9.10 — agregado canonico gravado em `climateEngagementData`
 * para um escopo especifico. Mesma escala de saida das colunas
 * decimal(4,2) e int das persistencias — a UPSERT converte para
 * `String(number)` (padrao S###/plenitude).
 *
 * `notasQuestao` e um array de 20 posicoes (indices 0..19 mapeando
 * `notaQuestao01..20` — convencao (dimensao-1)*5+itemIndex).
 */
export interface ClimateEscopoAggregado {
  escopo: ClimateEscopo;
  /** Preenchido apenas quando `escopo === 'departamento'`. */
  departamento: string | null;
  /** Preenchido apenas quando `escopo === 'equipe'`. */
  liderId: number | null;
  /** Nota geral 0..10. Null quando nenhum respondente valido. */
  notaClima: number | null;
  /** Percentual 0..100. Null quando `countTotal === 0`. */
  adesao: number | null;
  /** Colaboradores no escopo com `plenitudeData.scoreA IS NOT NULL`. */
  countCobertura: number;
  /**
   * Colaboradores elegiveis no escopo (denominador da adesao):
   * `dataAdmissao <= dia16` E (`status = 'ativo'` OU `scoreA IS NOT
   * NULL`). C-levels excluidos por construcao (nao estao em
   * `employees`).
   */
  countTotal: number;
  /** Nota da dimensao 1 (Engajamento). 0..10. Null quando cobertura 0. */
  notaEngajamento: number | null;
  /** Nota da dimensao 2 (Desenvolvimento). 0..10. */
  notaDesenvolvimento: number | null;
  /** Nota da dimensao 3 (Pertencimento). 0..10. */
  notaPertencimento: number | null;
  /** Nota da dimensao 4 (Realizacao). 0..10. */
  notaRealizacao: number | null;
  /**
   * Notas por questao — 20 posicoes, indice = questaoIndex-1. Cada
   * posicao carrega o valor 0..10 ou null quando aquela questao nao
   * teve resposta no escopo (grade parcial).
   */
  notasQuestao: readonly (number | null)[];
}

/**
 * Resultado canonico de `recalculateAggregates`. Espelha a operacao:
 * quais escopos foram recalculados no (companyId, trimestre) e o
 * `calculadoEm` gravado em todas as linhas.
 */
export interface ClimateCalculationResult {
  companyId: number;
  trimestre: string;
  escopos: readonly ClimateEscopoAggregado[];
  calculadoEm: Date;
}

/**
 * Facade canonica do motor Clima. Contrato minimo que o router
 * `climate` e o hook do `plenitudeCalculationEngine` consomem.
 * Producao aponta para `recalculateAggregates` desta ME. Teste
 * injeta mock que apenas conta chamadas / valida input (padrao
 * S105/S152 replicado).
 */
export interface ClimateEngineFacade {
  recalculateAggregates: (
    db: RoipDatabase,
    companyId: number,
    trimestre: string,
    now: Date,
  ) => Promise<ClimateCalculationResult>;
}

/**
 * DI default canonica: aponta para o motor real desta ME. O router
 * `climate` e o `plenitudeCalculationEngine` usam este default;
 * testes que injetam mock passam `climateEngine` explicito.
 */
export const DEFAULT_CLIMATE_ENGINE: ClimateEngineFacade = {
  recalculateAggregates,
};

// ============================================================
// Formulas canonicas puras (§9.4 literal)
// ============================================================

/**
 * Arredonda para 2 casas decimais deterministicamente (S180). As
 * colunas `climateEngagementData.*` sao `decimal(4,2)` para notas
 * (0..10) e `decimal(5,2)` para adesao (0..100). Round consistente
 * lado-cliente evita drift com o rounding server-side.
 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * §9.4 canonica — `notaClima = media aritmetica(scoreA) / 10`.
 * `scoreA` esta em escala 0..100 (§6.4); `notaClima` em 0..10.
 * Retorna `null` quando a lista esta vazia (semantica canonica —
 * sem respondente valido, sem nota).
 */
export function computeNotaClima(scoresA: readonly number[]): number | null {
  if (scoresA.length === 0) {
    return null;
  }
  let soma = 0;
  for (const s of scoresA) {
    soma += s;
  }
  return round2(soma / scoresA.length / 10);
}

/**
 * §9.4 canonica — `adesao = (cobertura / total) x 100`. Retorna
 * `null` quando `total === 0` (evita divisao por zero e sinaliza
 * a leitura de que o denominador e vazio — escopo sem elegiveis).
 * Range 0..100.
 */
export function computeAdesao(cobertura: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return round2((cobertura / total) * 100);
}

/**
 * §9.4 canonica — `notaDimensao = media aritmetica(scoreDimensaoA)
 * / 10`. Consumida com os valores de `plenitudeData.engajamentoA`,
 * `desenvolvimentoA`, `pertencimentoA` ou `realizacaoA` (escala
 * 0..100). Retorna `null` para lista vazia.
 */
export function computeNotaDimensao(scoresDimensaoA: readonly number[]): number | null {
  if (scoresDimensaoA.length === 0) {
    return null;
  }
  let soma = 0;
  for (const s of scoresDimensaoA) {
    soma += s;
  }
  return round2(soma / scoresDimensaoA.length / 10);
}

/**
 * §9.4 canonica — `notaQuestao = media(valor) / 4 x 10`. `valor`
 * vem de `instrumentA_responses.valor` em escala 0..4 (§6.2);
 * `notaQuestao` em 0..10. Retorna `null` para lista vazia (a
 * questao nao teve resposta no escopo).
 */
export function computeNotaQuestao(valores: readonly number[]): number | null {
  if (valores.length === 0) {
    return null;
  }
  let soma = 0;
  for (const v of valores) {
    soma += v;
  }
  return round2((soma / valores.length / VALOR_MAX_INSTRUMENTO_A) * 10);
}

/**
 * Convencao canonica de mapeamento questao -> indice linear:
 * `questaoIndex = (dimensao - 1) * 5 + itemIndex`, range 1..20.
 * Reusado pelo motor e pelos testes.
 */
export function questaoIndex(dimensao: number, itemIndex: number): number {
  return (dimensao - 1) * NUM_ITENS_POR_DIMENSAO_CLIMATE + itemIndex;
}

// ============================================================
// Helpers privados de estrutura
// ============================================================

/**
 * §9.5 (S181) — resolve o dia 16 canonico do trimestre no fuso
 * default do Clima. Paralelismo S150 do IQL. Retorna `null` quando
 * o trimestre nao pode ser parseado (input invalido do caller).
 */
export function getClimateDia16(trimestre: string, timeZone: string): Date | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return null;
  }
  return getInstrumentoABDataAbertura(parsed.ano, parsed.trimestre as Trimestre, timeZone);
}

/**
 * S173 — constroi o mapa `liderId -> Set(subordinadoIds)` a partir
 * do snapshot ATIVO no dia 16 de `employeeLeaderHistory`. Vinculo
 * ativo: `dataInicio <= dia16` E (`dataFim IS NULL` OU `dataFim >
 * dia16`). Reusa o padrao S150 do IQL. Ignora vinculos com
 * `clevelId` (Clima nao considera lideranca de C-level por §9.9 —
 * escopo equipe e sempre chefiada por employee-lider; C-level
 * aparece como visualizador, nao como lider avaliado).
 */
export async function buildLiderSubordinadosMapClimate(
  db: RoipDatabase,
  companyId: number,
  dia16: Date | null,
): Promise<Map<number, Set<number>>> {
  const map = new Map<number, Set<number>>();
  const rows =
    dia16 === null
      ? await db
          .select({
            liderId: employeeLeaderHistory.liderId,
            employeeId: employeeLeaderHistory.employeeId,
          })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
          .where(
            and(
              eq(employees.companyId, companyId),
              isNotNull(employeeLeaderHistory.liderId),
              isNull(employeeLeaderHistory.dataFim),
            ),
          )
      : await db
          .select({
            liderId: employeeLeaderHistory.liderId,
            employeeId: employeeLeaderHistory.employeeId,
          })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
          .where(
            and(
              eq(employees.companyId, companyId),
              isNotNull(employeeLeaderHistory.liderId),
              lte(employeeLeaderHistory.dataInicio, dia16),
              or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
            ),
          );
  for (const row of rows) {
    if (row.liderId === null) {
      continue;
    }
    const set = map.get(row.liderId);
    if (set === undefined) {
      map.set(row.liderId, new Set<number>([row.employeeId]));
    } else {
      set.add(row.employeeId);
    }
  }
  return map;
}

/**
 * S173 — expande a cadeia descendente completa de um lider (diretos
 * + indiretos) via BFS in-memory sobre o mapa de subordinados.
 * Retorna Set de `employeeId` da cadeia (nao inclui o proprio
 * lider). Aplica DEFESA contra ciclos: cada no e visitado uma unica
 * vez. DOC 01 §8.9 canoniza cadeia como "diretos e indiretos".
 */
export function expandirCadeiaDescendenteClimate(
  liderId: number,
  liderSubordinadosMap: Map<number, Set<number>>,
): Set<number> {
  const cadeia = new Set<number>();
  const fila: number[] = [liderId];
  while (fila.length > 0) {
    const atual = fila.shift() as number;
    const diretos = liderSubordinadosMap.get(atual);
    if (diretos === undefined) {
      continue;
    }
    for (const subordinadoId of diretos) {
      if (!cadeia.has(subordinadoId)) {
        cadeia.add(subordinadoId);
        fila.push(subordinadoId);
      }
    }
  }
  return cadeia;
}

// ============================================================
// Estruturas internas do motor
// ============================================================

/**
 * Registro interno do motor: employee da empresa no trimestre com
 * todos os atributos necessarios para os agregados.
 */
interface EmployeeCanonico {
  id: number;
  departamento: string;
  status: 'ativo' | 'inativo';
  dataAdmissao: Date;
  isLider: boolean;
  scoreA: number | null;
  engajamentoA: number | null;
  desenvolvimentoA: number | null;
  pertencimentoA: number | null;
  realizacaoA: number | null;
}

/**
 * Registro interno: resposta canonica de uma questao (dimensao,
 * itemIndex, valor) — pertence a algum employee.
 */
interface RespostaQuestao {
  employeeId: number;
  dimensao: number;
  itemIndex: number;
  valor: number;
}

/**
 * Agrega os employees do escopo em um `ClimateEscopoAggregado`.
 * Espera:
 *   - `employeesEscopo`: employees canonicos do escopo (ja filtrados).
 *   - `respostasPorEmployee`: mapa employeeId -> respostas do
 *      Instrumento A (para o calculo das notas por questao).
 */
function agregaEscopo(
  escopo: ClimateEscopo,
  departamento: string | null,
  liderId: number | null,
  employeesEscopo: readonly EmployeeCanonico[],
  respostasPorEmployee: Map<number, RespostaQuestao[]>,
  dia16: Date | null,
): ClimateEscopoAggregado {
  const notasQuestaoNull: (number | null)[] = new Array(NUM_QUESTOES_CLIMATE).fill(null);

  // Elegiveis (denominador da adesao — S181):
  //   dataAdmissao <= dia16 E (status = 'ativo' OU scoreA IS NOT NULL).
  //   dia16 = null (input invalido): fallback conservador — usa
  //   apenas o filtro de status/scoreA.
  const elegiveis = employeesEscopo.filter((e) => {
    const admitidoAntesOuNoDia16 = dia16 === null || e.dataAdmissao.getTime() <= dia16.getTime();
    const ativoOuComScoreA = e.status === 'ativo' || e.scoreA !== null;
    return admitidoAntesOuNoDia16 && ativoOuComScoreA;
  });

  // Cobertura (numerador da nota geral e da adesao):
  //   subset dos elegiveis com plenitudeData.scoreA IS NOT NULL (S171).
  const cobertura = elegiveis.filter((e) => e.scoreA !== null);

  const countTotal = elegiveis.length;
  const countCobertura = cobertura.length;

  if (countCobertura === 0) {
    return {
      escopo,
      departamento,
      liderId,
      notaClima: null,
      adesao: computeAdesao(countCobertura, countTotal),
      countCobertura,
      countTotal,
      notaEngajamento: null,
      notaDesenvolvimento: null,
      notaPertencimento: null,
      notaRealizacao: null,
      notasQuestao: notasQuestaoNull,
    };
  }

  // Nota geral do Clima (§9.4).
  const scoresA = cobertura.map((e) => e.scoreA as number);
  const notaClima = computeNotaClima(scoresA);
  const adesao = computeAdesao(countCobertura, countTotal);

  // Notas por dimensao (§9.4). scoreDimensaoA vem de plenitudeData
  // ja calculado pelo motor de plenitude (§6.4 canonica — quando
  // scoreA e gravado, os 4 scores por dimensao tambem sao).
  const engajamentoValues: number[] = [];
  const desenvolvimentoValues: number[] = [];
  const pertencimentoValues: number[] = [];
  const realizacaoValues: number[] = [];
  for (const e of cobertura) {
    if (e.engajamentoA !== null) engajamentoValues.push(e.engajamentoA);
    if (e.desenvolvimentoA !== null) desenvolvimentoValues.push(e.desenvolvimentoA);
    if (e.pertencimentoA !== null) pertencimentoValues.push(e.pertencimentoA);
    if (e.realizacaoA !== null) realizacaoValues.push(e.realizacaoA);
  }
  const notaEngajamento = computeNotaDimensao(engajamentoValues);
  const notaDesenvolvimento = computeNotaDimensao(desenvolvimentoValues);
  const notaPertencimento = computeNotaDimensao(pertencimentoValues);
  const notaRealizacao = computeNotaDimensao(realizacaoValues);

  // Notas por questao (§9.4): media aritmetica dos `valor` do
  // Instrumento A por (dimensao, itemIndex) restrita aos employees
  // da cobertura. Consumo do mapa `respostasPorEmployee`.
  const bucketsPorQuestao: number[][] = Array.from({ length: NUM_QUESTOES_CLIMATE }, () => []);
  const coberturaIds = new Set<number>(cobertura.map((e) => e.id));
  for (const e of cobertura) {
    const respostas = respostasPorEmployee.get(e.id);
    if (respostas === undefined) {
      continue;
    }
    for (const r of respostas) {
      // Defesa canonica: a query ja filtra por employees do escopo;
      // este check preserva o invariante quando o mapa e reusado
      // entre escopos (S169 — recalcula todos os escopos em uma
      // chamada). Sem coberturaIds seria O(N) inseguro por questao.
      if (!coberturaIds.has(r.employeeId)) {
        continue;
      }
      if (r.dimensao < 1 || r.dimensao > NUM_DIMENSOES_CLIMATE) {
        continue;
      }
      if (r.itemIndex < 1 || r.itemIndex > NUM_ITENS_POR_DIMENSAO_CLIMATE) {
        continue;
      }
      const idx = questaoIndex(r.dimensao, r.itemIndex) - 1;
      const bucket = bucketsPorQuestao[idx];
      if (bucket !== undefined) {
        bucket.push(r.valor);
      }
    }
  }
  const notasQuestao: (number | null)[] = Array.from({ length: NUM_QUESTOES_CLIMATE }, (_, i) => {
    const bucket = bucketsPorQuestao[i];
    return bucket === undefined ? null : computeNotaQuestao(bucket);
  });

  return {
    escopo,
    departamento,
    liderId,
    notaClima,
    adesao,
    countCobertura,
    countTotal,
    notaEngajamento,
    notaDesenvolvimento,
    notaPertencimento,
    notaRealizacao,
    notasQuestao,
  };
}

/**
 * Constroi o `.values(...)` canonico para UPSERT de uma linha de
 * `climateEngagementData`. Converte number -> String (padrao S###
 * decimal Drizzle -> MySQL) e distribui as 20 notas por questao
 * nas colunas `notaQuestao01..20`.
 */
function buildClimateInsertValues(
  companyId: number,
  agg: ClimateEscopoAggregado,
  trimestre: string,
  now: Date,
): typeof climateEngagementData.$inferInsert {
  const notaClimaStr = agg.notaClima === null ? null : String(agg.notaClima);
  const adesaoStr = agg.adesao === null ? null : String(agg.adesao);
  const notaEngStr = agg.notaEngajamento === null ? null : String(agg.notaEngajamento);
  const notaDesStr = agg.notaDesenvolvimento === null ? null : String(agg.notaDesenvolvimento);
  const notaPerStr = agg.notaPertencimento === null ? null : String(agg.notaPertencimento);
  const notaRealStr = agg.notaRealizacao === null ? null : String(agg.notaRealizacao);
  const q = (idx: number): string | null => {
    const value = agg.notasQuestao[idx];
    return value === null || value === undefined ? null : String(value);
  };
  return {
    companyId,
    escopo: agg.escopo,
    departamento: agg.departamento,
    liderId: agg.liderId,
    trimestre,
    notaClima: notaClimaStr,
    adesao: adesaoStr,
    countCobertura: agg.countCobertura,
    countTotal: agg.countTotal,
    notaEngajamento: notaEngStr,
    notaDesenvolvimento: notaDesStr,
    notaPertencimento: notaPerStr,
    notaRealizacao: notaRealStr,
    notaQuestao01: q(0),
    notaQuestao02: q(1),
    notaQuestao03: q(2),
    notaQuestao04: q(3),
    notaQuestao05: q(4),
    notaQuestao06: q(5),
    notaQuestao07: q(6),
    notaQuestao08: q(7),
    notaQuestao09: q(8),
    notaQuestao10: q(9),
    notaQuestao11: q(10),
    notaQuestao12: q(11),
    notaQuestao13: q(12),
    notaQuestao14: q(13),
    notaQuestao15: q(14),
    notaQuestao16: q(15),
    notaQuestao17: q(16),
    notaQuestao18: q(17),
    notaQuestao19: q(18),
    notaQuestao20: q(19),
    calculadoEm: now,
  };
}

/**
 * Constroi o `.onDuplicateKeyUpdate({ set })` canonico para uma
 * linha de `climateEngagementData` — reusa as colunas atualizaveis
 * do INSERT (menos as identificadoras da UNIQUE, que ficam fora do
 * SET por definicao).
 */
function buildClimateUpdateSet(
  agg: ClimateEscopoAggregado,
  now: Date,
): Parameters<
  ReturnType<ReturnType<RoipDatabase['insert']>['values']>['onDuplicateKeyUpdate']
>[0]['set'] {
  const notaClimaStr = agg.notaClima === null ? null : String(agg.notaClima);
  const adesaoStr = agg.adesao === null ? null : String(agg.adesao);
  const notaEngStr = agg.notaEngajamento === null ? null : String(agg.notaEngajamento);
  const notaDesStr = agg.notaDesenvolvimento === null ? null : String(agg.notaDesenvolvimento);
  const notaPerStr = agg.notaPertencimento === null ? null : String(agg.notaPertencimento);
  const notaRealStr = agg.notaRealizacao === null ? null : String(agg.notaRealizacao);
  const q = (idx: number): string | null => {
    const value = agg.notasQuestao[idx];
    return value === null || value === undefined ? null : String(value);
  };
  return {
    notaClima: notaClimaStr,
    adesao: adesaoStr,
    countCobertura: agg.countCobertura,
    countTotal: agg.countTotal,
    notaEngajamento: notaEngStr,
    notaDesenvolvimento: notaDesStr,
    notaPertencimento: notaPerStr,
    notaRealizacao: notaRealStr,
    notaQuestao01: q(0),
    notaQuestao02: q(1),
    notaQuestao03: q(2),
    notaQuestao04: q(3),
    notaQuestao05: q(4),
    notaQuestao06: q(5),
    notaQuestao07: q(6),
    notaQuestao08: q(7),
    notaQuestao09: q(8),
    notaQuestao10: q(9),
    notaQuestao11: q(10),
    notaQuestao12: q(11),
    notaQuestao13: q(12),
    notaQuestao14: q(13),
    notaQuestao15: q(14),
    notaQuestao16: q(15),
    notaQuestao17: q(16),
    notaQuestao18: q(17),
    notaQuestao19: q(18),
    notaQuestao20: q(19),
    calculadoEm: now,
  };
}

// ============================================================
// Motor canonico
// ============================================================

/**
 * §9.10 (S168/S169) — recalcula os agregados do Bloco Clima e
 * Engajamento para (companyId, trimestre) em TODOS os escopos
 * vigentes:
 *
 *   1. Empresa inteira: 1 linha (escopo = 'empresa').
 *   2. Cada departamento com >= 1 employee ativo: 1 linha por
 *      departamento (escopo = 'departamento').
 *   3. Cada lider ativo com cadeia descendente >= 1 subordinado:
 *      1 linha por lider (escopo = 'equipe').
 *
 * Fluxo canonico:
 *
 *   1. Resolve dia16 canonico (S181) via `getClimateDia16` no fuso
 *      default `America/Sao_Paulo`. Consumido pelo filtro de
 *      elegibilidade `dataAdmissao <= dia16` e pelo snapshot da
 *      cadeia via `employeeLeaderHistory`.
 *   2. Carrega os employees canonicos da empresa (union tipada com
 *      `plenitudeData` para trazer scoreA e os 4 scores por dimensao
 *      pre-calculados). Exclui admitidos apos dia16 (defesa em
 *      profundidade — o filtro de elegibilidade em `agregaEscopo`
 *      ja aplica, mas restringir aqui reduz payload).
 *   3. Carrega as respostas do Instrumento A do trimestre para a
 *      empresa (JOIN com employees para filtrar por companyId).
 *      Agrupa por employeeId em Map.
 *   4. Constroi o mapa `liderId -> subordinados diretos` no dia16
 *      via `employeeLeaderHistory` (S173).
 *   5. Grid canonico de escopos (S176):
 *      - Empresa: 1.
 *      - Departamentos: DISTINCT `departamento` dos employees ativos.
 *      - Lideres: employees `isLider=true` ativos com >= 1
 *        subordinado direto no mapa.
 *   6. Para cada escopo, filtra os employees pertinentes:
 *      - empresa: todos.
 *      - departamento: employees com `departamento === X`.
 *      - equipe: cadeia descendente expandida do lider (BFS via
 *        `expandirCadeiaDescendenteClimate` — S173).
 *   7. Calcula o agregado via `agregaEscopo` (aplica S171 e S181).
 *   8. UPSERT canonico em `climateEngagementData` (S172): sem
 *      delete de orfaos, `.onDuplicateKeyUpdate({ set })` na
 *      UNIQUE canonica `uq_climate_escopo`.
 *   9. Retorna `ClimateCalculationResult` tipado.
 *
 * Motor NUNCA lanca por logica canonica. Lanca apenas por defeito
 * de infraestrutura (banco fora, FK invalida). Caller propaga
 * (S117 replicado — no plenitude, o UPSERT em `plenitudeData` ja
 * foi commitado antes do hook do Clima, assim a excecao nao
 * desfaz o plenitude ja gravado).
 */
export async function recalculateAggregates(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  now: Date,
): Promise<ClimateCalculationResult> {
  // -------- 1) dia16 canonico (S181) --------
  const dia16 = getClimateDia16(trimestre, DEFAULT_TIMEZONE_CLIMATE);

  // -------- 2) employees canonicos (LEFT JOIN plenitudeData) --------
  //
  // Uma unica query traz tudo o que os agregados por escopo precisam:
  // atributos identificadores + scoreA e 4 scores de dimensao ja
  // calculados. `left join` porque nem todo employee tem `plenitudeData`
  // (colaborador sem A/C completos ainda esta ausente do plenitude).
  const rowsEmployees = await db
    .select({
      id: employees.id,
      departamento: employees.departamento,
      status: employees.status,
      dataAdmissao: employees.dataAdmissao,
      isLider: employees.isLider,
      plenTrimestre: plenitudeData.trimestre,
      scoreA: plenitudeData.scoreA,
      engajamentoA: plenitudeData.engajamentoA,
      desenvolvimentoA: plenitudeData.desenvolvimentoA,
      pertencimentoA: plenitudeData.pertencimentoA,
      realizacaoA: plenitudeData.realizacaoA,
    })
    .from(employees)
    .leftJoin(
      plenitudeData,
      and(eq(plenitudeData.employeeId, employees.id), eq(plenitudeData.trimestre, trimestre)),
    )
    .where(eq(employees.companyId, companyId));

  const employeesCanon: EmployeeCanonico[] = rowsEmployees.map((r) => ({
    id: r.id,
    departamento: r.departamento,
    status: (r.status as 'ativo' | 'inativo' | null) ?? 'ativo',
    dataAdmissao: r.dataAdmissao instanceof Date ? r.dataAdmissao : new Date(r.dataAdmissao),
    isLider: r.isLider === true,
    scoreA: r.scoreA === null ? null : Number(r.scoreA),
    engajamentoA: r.engajamentoA === null ? null : Number(r.engajamentoA),
    desenvolvimentoA: r.desenvolvimentoA === null ? null : Number(r.desenvolvimentoA),
    pertencimentoA: r.pertencimentoA === null ? null : Number(r.pertencimentoA),
    realizacaoA: r.realizacaoA === null ? null : Number(r.realizacaoA),
  }));

  // -------- 3) respostas canonicas do Instrumento A --------
  //
  // Reusa o filtro por `instrumentA_responses.companyId` (FK ja
  // canoniza cross-company via DOC 01 §8.1 — coluna companyId
  // esta na tabela). Zero SQL cru (RV-12).
  const rowsRespostas = await db
    .select({
      employeeId: instrumentA_responses.employeeId,
      dimensao: instrumentA_responses.dimensao,
      itemIndex: instrumentA_responses.itemIndex,
      valor: instrumentA_responses.valor,
    })
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.companyId, companyId),
        eq(instrumentA_responses.trimestre, trimestre),
      ),
    );

  const respostasPorEmployee = new Map<number, RespostaQuestao[]>();
  for (const r of rowsRespostas) {
    const item: RespostaQuestao = {
      employeeId: r.employeeId,
      dimensao: r.dimensao,
      itemIndex: r.itemIndex,
      valor: r.valor,
    };
    const list = respostasPorEmployee.get(r.employeeId);
    if (list === undefined) {
      respostasPorEmployee.set(r.employeeId, [item]);
    } else {
      list.push(item);
    }
  }

  // -------- 4) mapa lider -> subordinados diretos (snapshot dia16) --------
  const liderSubordinadosMap = await buildLiderSubordinadosMapClimate(db, companyId, dia16);

  // -------- 5) grid canonico de escopos (S176) --------
  //
  // Empresa: constante 1 escopo. Departamentos: DISTINCT
  // `departamento` dos employees canonicos ATIVOS. Lideres:
  // employees `isLider=true` ATIVOS com pelo menos 1 subordinado
  // direto no mapa (escopo 'equipe' faz sentido apenas quando ha
  // ao menos 1 subordinado — cadeia vazia nao produz agregado
  // canonico e polui a tabela com linhas sempre-zero).
  const departamentosSet = new Set<string>();
  const lideresElegiveis: number[] = [];
  for (const e of employeesCanon) {
    if (e.status === 'ativo') {
      departamentosSet.add(e.departamento);
    }
    if (e.status === 'ativo' && e.isLider) {
      const subordinados = liderSubordinadosMap.get(e.id);
      if (subordinados !== undefined && subordinados.size > 0) {
        lideresElegiveis.push(e.id);
      }
    }
  }
  const departamentosList = Array.from(departamentosSet).sort();
  lideresElegiveis.sort((a, b) => a - b);

  // -------- 6/7) calcula agregados por escopo --------
  const escoposAggs: ClimateEscopoAggregado[] = [];

  // 6a) empresa
  escoposAggs.push(
    agregaEscopo('empresa', null, null, employeesCanon, respostasPorEmployee, dia16),
  );

  // 6b) departamentos
  for (const dep of departamentosList) {
    const employeesDep = employeesCanon.filter((e) => e.departamento === dep);
    escoposAggs.push(
      agregaEscopo('departamento', dep, null, employeesDep, respostasPorEmployee, dia16),
    );
  }

  // 6c) equipes (lideres com cadeia)
  for (const liderId of lideresElegiveis) {
    const cadeia = expandirCadeiaDescendenteClimate(liderId, liderSubordinadosMap);
    const employeesEq = employeesCanon.filter((e) => cadeia.has(e.id));
    escoposAggs.push(
      agregaEscopo('equipe', null, liderId, employeesEq, respostasPorEmployee, dia16),
    );
  }

  // -------- 8) UPSERT canonico NULL-safe em climateEngagementData --------
  //
  // Padrao S172b (correcao S172 aprovada): MySQL trata NULL como
  // distinto em UNIQUE constraint — duas linhas com `departamento
  // IS NULL` ou `liderId IS NULL` NAO colidem em `uq_climate_escopo`.
  // Isso quebraria a idempotencia canonica do §9.10. Solucao:
  // SELECT canonico por chave completa (usando `isNull` para os
  // discriminadores nullable) seguido de UPDATE ou INSERT, dentro
  // do fluxo determinístico do motor. Sem race relevante: motor
  // Clima e chamado in-band do plenitude (unico caller sincrono
  // per-employee); reprocessamento manual via `climate.
  // recalculateAggregates` e Bruno exclusivo (S175). RV-12 preservado.
  // Padrao S157 herdado — sem delete de orfaos.
  for (const agg of escoposAggs) {
    const existingRows = await db
      .select({ id: climateEngagementData.id })
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, agg.escopo),
          agg.departamento === null
            ? isNull(climateEngagementData.departamento)
            : eq(climateEngagementData.departamento, agg.departamento),
          agg.liderId === null
            ? isNull(climateEngagementData.liderId)
            : eq(climateEngagementData.liderId, agg.liderId),
          eq(climateEngagementData.trimestre, trimestre),
        ),
      )
      .limit(1);
    if (existingRows.length > 0) {
      await db
        .update(climateEngagementData)
        .set(buildClimateUpdateSet(agg, now))
        .where(eq(climateEngagementData.id, existingRows[0]!.id));
    } else {
      await db
        .insert(climateEngagementData)
        .values(buildClimateInsertValues(companyId, agg, trimestre, now));
    }
  }

  // -------- 9) retorno canonico tipado --------
  return {
    companyId,
    trimestre,
    escopos: escoposAggs,
    calculadoEm: now,
  };
}
