// ROIP APP 9BOX — motor canonico puro `climateCalculationEngine`
// (reescrito na ME-B2-01b — aposenta cache `climateEngagementData`).
//
// Refactor canonico de 30/09/2026 (Q1=D — aposentar cache): a tabela
// derivada `climateEngagementData` foi aposentada; o motor computa
// os agregados SOB DEMANDA a cada leitura, direto das fontes
// primarias (`plenitudeData`, `instrumentA_responses`,
// `employeeLeaderHistory`, `employees`, `cLevelMembers`). Zero cache,
// zero drift entre codigo e dados, zero hook §9.10, zero proc admin
// de reprocessamento — todos permanentemente eliminados por
// construcao.
//
// Consequencias canonicas:
//   - Bug de escala 0-4 → 0-10 e todos os bugs futuros de escala
//     ficam eliminados por construcao (nao ha mais dados persistidos
//     que possam divergir do codigo).
//   - Nao ha mais migration de dados quando a formula muda.
//   - Nao ha mais botao admin, script one-shot ou reset canonico
//     para regravar agregados.
//   - Custo canonico: cada leitura executa ~4 queries agregadas
//     (employees + LEFT JOIN plenitudeData + instrumentA_responses
//     + employeeLeaderHistory + cLevelMembers). Payload PME
//     (dezenas de employees, dezenas de escopos) → milissegundos.
//
// Funcoes canonicas publicas:
//   - `computeClimateBlock(db, params)` — computa o payload canonico
//     para UM escopo especifico (empresa | departamento | equipe).
//     Retorna `null` quando o escopo nao produz dados canonicos
//     (departamento inexistente, lider sem cadeia, etc.).
//   - `resolveClimateBlockComCascata(db, params)` — aplica cascata
//     silenciosa canonica (§9.6, Q4=A1): tenta o escopo requisitado;
//     se `countCobertura < 3`, sobe para o proximo nivel canonico
//     (equipe -> departamento do lider -> empresa). Sempre retorna
//     um payload (ate mesmo com `dadosDisponiveis=false` quando nem
//     empresa atende ao piso).
//   - `listClimateTrimestres(db, companyId)` — lista os trimestres
//     canonicos que tem `plenitudeData.scoreA IS NOT NULL` para a
//     empresa. Substitui o SELECT DISTINCT trimestre que antes vinha
//     da tabela derivada.
//
// Convencoes canonicas preservadas:
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Piso 3 respondentes (§9.6): APLICADO NA LEITURA. O motor devolve
//     `countCobertura` bruto; a cascata canonica em
//     `resolveClimateBlockComCascata` aplica o piso.
//   - Snapshot canonico dia 16 (§9.5, S181): elegibilidade do
//     denominador `countTotal` verificada em tempo real via
//     `employees.dataAdmissao <= dia16`. Reusa
//     `getInstrumentoABDataAbertura` compartilhado com A/C/D.
//   - Cadeia descendente (§9.2 / DOC 01 §8.9): loop Drizzle in-memory
//     (BFS sobre `employeeLeaderHistory`). Sem CTE recursivo.
//   - Escala canonica §9.4: notaClima = media(scoreA)/10, notaDimensao
//     = media(scoreDimensaoA)/10, notaQuestao = media(valor)/4 * 10.
//     Todas em 0-10.
//   - Polimorfia liderId XOR clevelId em escopo='equipe' (padrao
//     XOR-no-caller ME-B2-01a.1.1 preservado).
//
// Convencao interna de mapeamento questao -> coluna canonica:
//   `questaoIndex = (dimensao - 1) * 5 + itemIndex`, range 1..20.
//   Dimensao 1 = Engajamento (questoes 1..5); 2 = Desenvolvimento
//   (6..10); 3 = Pertencimento (11..15); 4 = Realizacao (16..20).

import { and, asc, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
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

/** §9.4 — 4 dimensoes canonicas do Instrumento A. */
const NUM_DIMENSOES_CLIMATE = 4 as const;

/** §9.4 — 5 itens por dimensao (grid 4x5). */
const NUM_ITENS_POR_DIMENSAO_CLIMATE = 5 as const;

/** §9.4 — total de 20 questoes canonicas. */
export const NUM_QUESTOES_CLIMATE = 20 as const;

/** §6.2 / §9.4 — teto canonico da escala do Instrumento A (0..4). */
const VALOR_MAX_INSTRUMENTO_A = 4 as const;

/**
 * §9.6 — piso canonico de respondentes para EXIBIR o Bloco Clima.
 * Aplicado em `resolveClimateBlockComCascata` (cascata silenciosa
 * canonica). Escopos com `countCobertura < 3` cascatam para o nivel
 * imediatamente superior.
 */
export const PISO_RESPONDENTES_CLIMATE = 3 as const;

/**
 * Timezone default canonico para o snapshot dia 16 (§9.5).
 * `America/Sao_Paulo` cobre 100% do MVP e nao tem DST desde 2019.
 */
const DEFAULT_TIMEZONE_CLIMATE = 'America/Sao_Paulo';

// ============================================================
// Tipos publicos
// ============================================================

/** §9.2 — enum canonico dos 3 escopos do Bloco Clima. */
type ClimateEscopo = 'empresa' | 'departamento' | 'equipe';

/** ME-B2-01a.1.1 — enum canonico do tipo de lider para escopo='equipe'. */
export type ClimateLiderTipo = 'employee' | 'clevel';

/**
 * Parametros canonicos de `computeClimateBlock` — identificam um
 * escopo unico dentro de (companyId, trimestre). Regras:
 *   - `escopo = 'empresa'`: `escopoReferencia`, `liderId`, `liderTipo`
 *     ignorados.
 *   - `escopo = 'departamento'`: `escopoReferencia` obrigatorio (nome
 *     canonico do departamento); `liderId`, `liderTipo` ignorados.
 *   - `escopo = 'equipe'`: `liderId` + `liderTipo` obrigatorios (padrao
 *     XOR-no-caller ME-B2-01a.1.1); `escopoReferencia` ignorado.
 */
interface ComputeClimateBlockParams {
  companyId: number;
  escopo: ClimateEscopo;
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: ClimateLiderTipo | null;
  trimestre: string;
}

/**
 * Payload canonico do agregado por escopo (§9.4/§9.10). Escala
 * canonica em todas as notas:
 *   - notaClima, notaEngajamento, notaDesenvolvimento,
 *     notaPertencimento, notaRealizacao, notasQuestao[0..19]: 0-10.
 *   - adesao: 0-100.
 *   - countCobertura, countTotal: contagens inteiras.
 *
 * `notasQuestao` sempre com 20 posicoes (convencao (dim-1)*5+item).
 */
export interface ClimateBlockPayload {
  escopo: ClimateEscopo;
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: ClimateLiderTipo | null;
  trimestre: string;
  notaClima: number | null;
  adesao: number | null;
  countCobertura: number;
  countTotal: number;
  notaEngajamento: number | null;
  notaDesenvolvimento: number | null;
  notaPertencimento: number | null;
  notaRealizacao: number | null;
  notasQuestao: readonly (number | null)[];
}

/**
 * Resultado canonico de `resolveClimateBlockComCascata`. O payload
 * canonico do escopo EFETIVO (onde os dados foram achados) mais
 * metadados canonicos da cascata:
 *   - `escopoRequisitado` — parametros originais passados pelo caller.
 *   - `escopoEfetivo` — nivel onde os dados foram achados (pode
 *     divergir quando houve cascata).
 *   - `notaAgregacao` — rotulo canonico da agregacao aplicada:
 *     `null` quando escopo efetivo == requisitado,
 *     `'agregado_departamento'` para cascata equipe -> departamento,
 *     `'agregado_empresa'` para cascata para empresa.
 *   - `dadosDisponiveis` — `true` quando algum nivel da cascata tem
 *     `countCobertura >= PISO_RESPONDENTES_CLIMATE`; `false` quando
 *     nem empresa atende ao piso.
 */
export interface ClimateBlockCascataResult {
  escopoRequisitado: {
    escopo: ClimateEscopo;
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: ClimateLiderTipo | null;
  };
  escopoEfetivo: {
    escopo: ClimateEscopo;
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: ClimateLiderTipo | null;
  };
  notaAgregacao: 'agregado_departamento' | 'agregado_empresa' | null;
  dadosDisponiveis: boolean;
  payload: ClimateBlockPayload;
}

// ============================================================
// Formulas canonicas puras (§9.4 literal)
// ============================================================

/**
 * Arredonda para 2 casas decimais deterministicamente. As colunas
 * de nota foram `decimal(4,2)` (0..10) e adesao foi `decimal(5,2)`
 * (0..100). Round consistente cliente-side preserva coerencia com
 * qualquer camada de exibicao.
 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * §9.4 canonica — `notaClima = media aritmetica(scoreA) / 10`.
 * `scoreA` em escala 0..100 (§6.4); `notaClima` em 0..10.
 */
function computeNotaClima(scoresA: readonly number[]): number | null {
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
 * `null` quando `total === 0` (evita divisao por zero).
 */
function computeAdesao(cobertura: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return round2((cobertura / total) * 100);
}

/**
 * §9.4 canonica — `notaDimensao = media aritmetica(scoreDimensaoA)
 * / 10`. Consumida com `plenitudeData.engajamentoA`,
 * `desenvolvimentoA`, `pertencimentoA` ou `realizacaoA` (0..100).
 */
function computeNotaDimensao(scoresDimensaoA: readonly number[]): number | null {
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
 * vem de `instrumentA_responses.valor` em 0..4 (§6.2); `notaQuestao`
 * em 0..10.
 */
function computeNotaQuestao(valores: readonly number[]): number | null {
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
 * Convencao canonica de mapeamento questao -> indice linear.
 * `questaoIndex = (dimensao - 1) * 5 + itemIndex`, range 1..20.
 */
function questaoIndex(dimensao: number, itemIndex: number): number {
  return (dimensao - 1) * NUM_ITENS_POR_DIMENSAO_CLIMATE + itemIndex;
}

// ============================================================
// Helpers de estrutura (snapshot dia 16, cadeia canonica)
// ============================================================

/**
 * §9.5 (S181) — resolve o dia 16 canonico do trimestre no fuso
 * canonico do Clima. Retorna `null` quando o trimestre nao pode
 * ser parseado.
 */
function getClimateDia16(trimestre: string, timeZone: string): Date | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return null;
  }
  return getInstrumentoABDataAbertura(parsed.ano, parsed.trimestre as Trimestre, timeZone);
}

/**
 * Constroi o mapa `liderId -> Set(subordinadoIds)` a partir do
 * snapshot ATIVO no dia 16 de `employeeLeaderHistory` (S173).
 * Vinculo ativo: `dataInicio <= dia16` E (`dataFim IS NULL` OU
 * `dataFim > dia16`). Ignora vinculos com `clevelId`.
 */
async function buildLiderSubordinadosMapClimate(
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
 * Expande a cadeia descendente completa de um lider employee (diretos
 * + indiretos) via BFS in-memory. Aplica defesa contra ciclos (cada
 * no visitado uma unica vez). DOC 01 §8.9 canoniza cadeia como
 * "diretos e indiretos".
 */
function expandirCadeiaDescendenteClimate(
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

/**
 * Constroi o mapa `clevelId -> Set(subordinadoIds)` a partir do
 * snapshot ATIVO no dia 16 de `employeeLeaderHistory`. Filtra por
 * `clevelId IS NOT NULL` (padrao XOR-no-caller ME-B2-01a.1.1).
 */
async function buildCLevelSubordinadosMapClimate(
  db: RoipDatabase,
  companyId: number,
  dia16: Date | null,
): Promise<Map<number, Set<number>>> {
  const map = new Map<number, Set<number>>();
  const rows =
    dia16 === null
      ? await db
          .select({
            clevelId: employeeLeaderHistory.clevelId,
            employeeId: employeeLeaderHistory.employeeId,
          })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
          .where(
            and(
              eq(employees.companyId, companyId),
              isNotNull(employeeLeaderHistory.clevelId),
              isNull(employeeLeaderHistory.dataFim),
            ),
          )
      : await db
          .select({
            clevelId: employeeLeaderHistory.clevelId,
            employeeId: employeeLeaderHistory.employeeId,
          })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
          .where(
            and(
              eq(employees.companyId, companyId),
              isNotNull(employeeLeaderHistory.clevelId),
              lte(employeeLeaderHistory.dataInicio, dia16),
              or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
            ),
          );
  for (const row of rows) {
    if (row.clevelId === null) {
      continue;
    }
    const set = map.get(row.clevelId);
    if (set === undefined) {
      map.set(row.clevelId, new Set<number>([row.employeeId]));
    } else {
      set.add(row.employeeId);
    }
  }
  return map;
}

/**
 * Expande a cadeia descendente MISTA de um C-level (diretos +
 * indiretos via employee-lideres) via BFS in-memory. Nivel 1:
 * subordinados diretos do C-level. Niveis 2+: cascata employee-lider.
 */
function expandirCadeiaDescendenteClimateCLevel(
  clevelId: number,
  clevelSubordinadosMap: Map<number, Set<number>>,
  liderSubordinadosMap: Map<number, Set<number>>,
): Set<number> {
  const cadeia = new Set<number>();
  const fila: number[] = [];

  const diretosClevel = clevelSubordinadosMap.get(clevelId);
  if (diretosClevel === undefined) {
    return cadeia;
  }
  for (const subordinadoId of diretosClevel) {
    if (!cadeia.has(subordinadoId)) {
      cadeia.add(subordinadoId);
      fila.push(subordinadoId);
    }
  }

  while (fila.length > 0) {
    const atual = fila.shift() as number;
    const diretosLider = liderSubordinadosMap.get(atual);
    if (diretosLider === undefined) {
      continue;
    }
    for (const subordinadoId of diretosLider) {
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

interface RespostaQuestao {
  employeeId: number;
  dimensao: number;
  itemIndex: number;
  valor: number;
}

// ============================================================
// Agregacao pura (in-memory, sem I/O)
// ============================================================

/**
 * Agrega os employees do escopo em um payload canonico. Funcao pura:
 * recebe dados ja carregados, nao faz I/O. Reusada por
 * `computeClimateBlock` para os 3 escopos canonicos.
 */
function agregaEscopoPuro(
  escopo: ClimateEscopo,
  escopoReferencia: string | null,
  liderId: number | null,
  liderTipo: ClimateLiderTipo | null,
  trimestre: string,
  employeesEscopo: readonly EmployeeCanonico[],
  respostasPorEmployee: Map<number, RespostaQuestao[]>,
  dia16: Date | null,
): ClimateBlockPayload {
  const notasQuestaoNull: (number | null)[] = new Array(NUM_QUESTOES_CLIMATE).fill(null);

  // Elegiveis (denominador da adesao — S181):
  //   dataAdmissao <= dia16 E (status = 'ativo' OU scoreA IS NOT NULL).
  const elegiveis = employeesEscopo.filter((e) => {
    const admitidoAntesOuNoDia16 = dia16 === null || e.dataAdmissao.getTime() <= dia16.getTime();
    const ativoOuComScoreA = e.status === 'ativo' || e.scoreA !== null;
    return admitidoAntesOuNoDia16 && ativoOuComScoreA;
  });

  // Cobertura (numerador da nota geral e da adesao):
  //   subset dos elegiveis com plenitudeData.scoreA IS NOT NULL (§9.1).
  const cobertura = elegiveis.filter((e) => e.scoreA !== null);

  const countTotal = elegiveis.length;
  const countCobertura = cobertura.length;

  if (countCobertura === 0) {
    return {
      escopo,
      escopoReferencia,
      liderId,
      liderTipo,
      trimestre,
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

  const scoresA = cobertura.map((e) => e.scoreA as number);
  const notaClima = computeNotaClima(scoresA);
  const adesao = computeAdesao(countCobertura, countTotal);

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

  const bucketsPorQuestao: number[][] = Array.from({ length: NUM_QUESTOES_CLIMATE }, () => []);
  const coberturaIds = new Set<number>(cobertura.map((e) => e.id));
  for (const e of cobertura) {
    const respostas = respostasPorEmployee.get(e.id);
    if (respostas === undefined) {
      continue;
    }
    for (const r of respostas) {
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
    escopoReferencia,
    liderId,
    liderTipo,
    trimestre,
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

// ============================================================
// Carregadores canonicos (I/O direto contra fontes primarias)
// ============================================================

/**
 * Carrega os employees canonicos da empresa com LEFT JOIN em
 * `plenitudeData` do trimestre. Union canonica dos atributos
 * necessarios para todos os escopos.
 */
async function loadEmployeesCanonicos(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<EmployeeCanonico[]> {
  const rows = await db
    .select({
      id: employees.id,
      departamento: employees.departamento,
      status: employees.status,
      dataAdmissao: employees.dataAdmissao,
      isLider: employees.isLider,
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

  return rows.map((r) => ({
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
}

/**
 * Carrega as respostas canonicas do Instrumento A da empresa no
 * trimestre. Agrupa por `employeeId` em Map para consumo canonico
 * do agregador puro.
 */
async function loadRespostasPorEmployee(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<Map<number, RespostaQuestao[]>> {
  const rows = await db
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

  const map = new Map<number, RespostaQuestao[]>();
  for (const r of rows) {
    const item: RespostaQuestao = {
      employeeId: r.employeeId,
      dimensao: r.dimensao,
      itemIndex: r.itemIndex,
      valor: r.valor,
    };
    const list = map.get(r.employeeId);
    if (list === undefined) {
      map.set(r.employeeId, [item]);
    } else {
      list.push(item);
    }
  }
  return map;
}

// ============================================================
// Motor canonico publico — computa UM escopo sob demanda
// ============================================================

/**
 * Computa o payload canonico do Bloco Clima para UM escopo
 * especifico. Sob demanda, sem cache. Retorna `null` quando o
 * escopo requisitado nao pode ser resolvido canonicamente:
 *   - `escopo='departamento'` sem `escopoReferencia`.
 *   - `escopo='equipe'` sem `liderId` OU sem `liderTipo`.
 *   - `escopo='equipe'` cujo `liderId` nao existe canonicamente.
 *
 * Escopos VALIDOS com `countCobertura === 0` retornam payload valido
 * com notas null e adesao canonica (a cascata em
 * `resolveClimateBlockComCascata` decide se sobe de nivel).
 */
export async function computeClimateBlock(
  db: RoipDatabase,
  params: ComputeClimateBlockParams,
): Promise<ClimateBlockPayload | null> {
  // Validacao canonica dos params por escopo.
  if (params.escopo === 'departamento' && params.escopoReferencia === null) {
    return null;
  }
  if (params.escopo === 'equipe') {
    if (params.liderId === null || params.liderTipo === null) {
      return null;
    }
  }

  const dia16 = getClimateDia16(params.trimestre, DEFAULT_TIMEZONE_CLIMATE);
  const employeesCanon = await loadEmployeesCanonicos(db, params.companyId, params.trimestre);
  const respostasPorEmployee = await loadRespostasPorEmployee(
    db,
    params.companyId,
    params.trimestre,
  );

  // Filtro canonico por escopo:
  //   - empresa: todos os employees canonicos.
  //   - departamento: employees com `departamento === X`.
  //   - equipe: cadeia descendente (BFS) do lider.
  let employeesEscopo: EmployeeCanonico[];
  if (params.escopo === 'empresa') {
    employeesEscopo = employeesCanon;
  } else if (params.escopo === 'departamento') {
    employeesEscopo = employeesCanon.filter((e) => e.departamento === params.escopoReferencia);
  } else {
    // equipe — polimorfia liderId XOR clevelId.
    if (params.liderTipo === 'employee') {
      const liderMap = await buildLiderSubordinadosMapClimate(db, params.companyId, dia16);
      const cadeia = expandirCadeiaDescendenteClimate(params.liderId as number, liderMap);
      if (cadeia.size === 0) {
        // Cadeia vazia — lider inexistente OU sem subordinados no dia16.
        return null;
      }
      employeesEscopo = employeesCanon.filter((e) => cadeia.has(e.id));
    } else {
      // clevel.
      const liderMap = await buildLiderSubordinadosMapClimate(db, params.companyId, dia16);
      const clevelMap = await buildCLevelSubordinadosMapClimate(db, params.companyId, dia16);
      const cadeia = expandirCadeiaDescendenteClimateCLevel(
        params.liderId as number,
        clevelMap,
        liderMap,
      );
      if (cadeia.size === 0) {
        return null;
      }
      employeesEscopo = employeesCanon.filter((e) => cadeia.has(e.id));
    }
  }

  return agregaEscopoPuro(
    params.escopo,
    params.escopoReferencia,
    params.liderId,
    params.liderTipo,
    params.trimestre,
    employeesEscopo,
    respostasPorEmployee,
    dia16,
  );
}

// ============================================================
// Cascata silenciosa canonica (Q4=A1)
// ============================================================

/**
 * Resolve o departamento canonico do lider da equipe. Consulta
 * `employees.departamento` para lider employee ou
 * `cLevelMembers.departamento` para C-level. Retorna `null` quando
 * o lider nao existe canonicamente.
 */
async function resolveLiderDepartamento(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  liderTipo: ClimateLiderTipo,
): Promise<string | null> {
  if (liderTipo === 'employee') {
    const [row] = await db
      .select({ departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.id, liderId), eq(employees.companyId, companyId)))
      .limit(1);
    return row?.departamento ?? null;
  }
  const [row] = await db
    .select({ departamento: cLevelMembers.departamento })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, liderId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  return row?.departamento ?? null;
}

/**
 * Cascata silenciosa canonica (§9.6, Q4=A1):
 *   1. Tenta escopo requisitado. Se `countCobertura >= PISO`,
 *      retorna esse nivel (`notaAgregacao=null`, `dadosDisponiveis=
 *      true`).
 *   2. Se abaixo do piso e escopo='equipe', sobe para departamento
 *      do lider (`notaAgregacao='agregado_departamento'`).
 *   3. Se abaixo do piso e escopo='departamento' (ou apos cascata
 *      da equipe), sobe para empresa (`notaAgregacao=
 *      'agregado_empresa'`).
 *   4. Se nem empresa atende ao piso, retorna o payload da empresa
 *      com `dadosDisponiveis=false`.
 *
 * Sempre retorna um resultado canonico (mesmo com dados
 * indisponiveis) — a UI decide a superficie de mensagem canonica.
 */
export async function resolveClimateBlockComCascata(
  db: RoipDatabase,
  params: ComputeClimateBlockParams,
): Promise<ClimateBlockCascataResult> {
  const escopoRequisitado = {
    escopo: params.escopo,
    escopoReferencia: params.escopoReferencia,
    liderId: params.liderId,
    liderTipo: params.liderTipo,
  } as const;

  // Tentativa 1: escopo requisitado.
  const tentativa1 = await computeClimateBlock(db, params);
  if (tentativa1 !== null && tentativa1.countCobertura >= PISO_RESPONDENTES_CLIMATE) {
    return {
      escopoRequisitado,
      escopoEfetivo: { ...escopoRequisitado },
      notaAgregacao: null,
      dadosDisponiveis: true,
      payload: tentativa1,
    };
  }

  // Tentativa 2: se escopo='equipe', sobe para departamento do lider.
  if (params.escopo === 'equipe' && params.liderId !== null && params.liderTipo !== null) {
    const dept = await resolveLiderDepartamento(
      db,
      params.companyId,
      params.liderId,
      params.liderTipo,
    );
    if (dept !== null) {
      const tentativa2 = await computeClimateBlock(db, {
        companyId: params.companyId,
        escopo: 'departamento',
        escopoReferencia: dept,
        liderId: null,
        liderTipo: null,
        trimestre: params.trimestre,
      });
      if (tentativa2 !== null && tentativa2.countCobertura >= PISO_RESPONDENTES_CLIMATE) {
        return {
          escopoRequisitado,
          escopoEfetivo: {
            escopo: 'departamento',
            escopoReferencia: dept,
            liderId: null,
            liderTipo: null,
          },
          notaAgregacao: 'agregado_departamento',
          dadosDisponiveis: true,
          payload: tentativa2,
        };
      }
    }
  }

  // Tentativa 3: sobe para empresa.
  const tentativa3 = await computeClimateBlock(db, {
    companyId: params.companyId,
    escopo: 'empresa',
    escopoReferencia: null,
    liderId: null,
    liderTipo: null,
    trimestre: params.trimestre,
  });
  if (tentativa3 !== null && tentativa3.countCobertura >= PISO_RESPONDENTES_CLIMATE) {
    return {
      escopoRequisitado,
      escopoEfetivo: {
        escopo: 'empresa',
        escopoReferencia: null,
        liderId: null,
        liderTipo: null,
      },
      notaAgregacao: params.escopo === 'empresa' ? null : 'agregado_empresa',
      dadosDisponiveis: true,
      payload: tentativa3,
    };
  }

  // Ultimo recurso: empresa mesmo sem piso (dadosDisponiveis=false).
  const payloadFinal =
    tentativa3 ??
    ({
      escopo: 'empresa',
      escopoReferencia: null,
      liderId: null,
      liderTipo: null,
      trimestre: params.trimestre,
      notaClima: null,
      adesao: null,
      countCobertura: 0,
      countTotal: 0,
      notaEngajamento: null,
      notaDesenvolvimento: null,
      notaPertencimento: null,
      notaRealizacao: null,
      notasQuestao: Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null),
    } satisfies ClimateBlockPayload);

  return {
    escopoRequisitado,
    escopoEfetivo: {
      escopo: 'empresa',
      escopoReferencia: null,
      liderId: null,
      liderTipo: null,
    },
    notaAgregacao: params.escopo === 'empresa' ? null : 'agregado_empresa',
    dadosDisponiveis: false,
    payload: payloadFinal,
  };
}

// ============================================================
// Descoberta canonica de trimestres (substitui SELECT da tabela)
// ============================================================

/**
 * Lista os trimestres canonicos que tem pelo menos 1 `scoreA IS NOT
 * NULL` gravado em `plenitudeData` para a empresa. Ordena
 * canonicamente asc (mais antigo primeiro) por default; passe
 * `order='desc'` para inverter (mais recente primeiro). Consumido
 * pela UI do card (linha do tempo) e pelo endpoint de download do
 * PDF do Bloco Clima.
 */
export async function listClimateTrimestres(
  db: RoipDatabase,
  companyId: number,
  order: 'asc' | 'desc' = 'asc',
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ trimestre: plenitudeData.trimestre })
    .from(plenitudeData)
    .where(and(eq(plenitudeData.companyId, companyId), isNotNull(plenitudeData.scoreA)))
    .orderBy(order === 'asc' ? asc(plenitudeData.trimestre) : desc(plenitudeData.trimestre));
  return rows.map((r) => r.trimestre);
}
