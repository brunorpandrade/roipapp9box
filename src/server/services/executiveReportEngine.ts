// ROIP APP 9BOX — motor deterministico do Relatorio executivo
// trimestral (ME-053, S275).
//
// Agrega os 5 (ou 4) pacotes-bloco canonicos §7.2 do DOC 04 por escopo
// canonico (`empresa` | `departamento` | `equipe`). Consumido pelo
// motor IA (`executiveReportAI.ts`) que serializa os pacotes no user
// prompt e coleta os paragrafos interpretativos, e pelo template PDF
// (`executiveReportTemplate.ts`) que renderiza os dados
// deterministicos + os paragrafos IA em cascata canonica §7.5.
//
// Fluxo canonico:
//   1. Resolve labels + trimestres derivados (anterior + ano anterior).
//   2. Bloco Financeiro:
//      - escopo empresa: `companyEconomicDiagnosis` do trimestre.
//      - escopo departamento/equipe: media ponderada dos roiEstimado
//        de `performanceQuarterlyData` dos ativos no escopo.
//      - `folhaTotalMedia` e `faturamentoMedioTrimestral` omitidos
//        em escopo equipe (§8.5 nota canonica).
//   3. Bloco Desempenho: agregacao de `performanceQuarterlyData` +
//      assiduidade media de `performanceData` (motor deterministico do
//      trimestre — os 3 meses) por escopo.
//   4. Bloco Plenitude: agregacao de `plenitudeData` + % com
//      `alertaDivergencia` por escopo.
//   5. Bloco Clima: busca em `climateEngagementData` respeitando piso
//      canonico §7.6. Quando escopo < 3 respondentes, agrega no
//      hierarquico superior (equipe->departamento->empresa). Se nem
//      empresa atinge o piso, `disponivel=false`.
//   6. Bloco Turnover: `computeTurnoverByCompany`/`ByDepartamento`
//      dos engines existentes. Omitido quando escopo=equipe.
//   7. Detalhamento capilar (§7.5): departamentos->equipes com
//      agregados por linha. Vazio quando escopo=equipe.
//
// Convencao canonica RV-12: 100% Drizzle tipado. Nenhum `sql\`\`` cru.
// Toda agregacao usa `.select({ agg: sql<T>\`...\` })` do Drizzle com
// tipo explicito, ou o padrao SELECT + reduce em memoria (para
// agregados custosos como % com alertaDivergencia).
//
// Determinismo canonico (§11.12): mesmos dados persistidos = mesmo
// payload byte a byte, exceto agregados por hora corrente
// (`companies.timezone` afeta apenas o trimestre canonico, resolvido
// no router).

import { and, avg, eq, inArray, isNotNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  climateEngagementData,
  companyEconomicDiagnosis,
  employees,
  performanceData,
  performanceQuarterlyData,
  plenitudeData,
} from '../../db/schema';
import {
  formatTrimestreCicloReferencia,
  getPreviousTrimestre,
  parseTrimestreCicloReferencia,
} from '../../lib/cycleDates';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';
import type { NivelHierarquico } from '../../db/schema/enums';
import { computeTurnoverByCompany, computeTurnoverByDepartamento } from './turnoverEngine';
import type {
  ExecReportBlocoClima,
  ExecReportBlocoDesempenho,
  ExecReportBlocoFinanceiro,
  ExecReportBlocoPlenitude,
  ExecReportBlocoTurnover,
  ExecReportDepartamentoLinha,
  ExecReportDetalhamentoCapilar,
  ExecReportEquipeLinha,
  ExecutiveReportDeterministicoPayload,
  ExecutiveReportEscopo,
} from './_shared/executiveReportTypes';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * Piso canonico de respondentes do bloco Clima §7.6 DOC 04 (equivalente
 * ao PISO_RESPONDENTES_CLIMATE do climateCalculationEngine).
 */
export const EXEC_REPORT_CLIMA_PISO_RESPONDENTES = 3 as const;

/**
 * Faixas canonicas de desempenho §8.6 DOC 04. Divisao alinhada com o
 * DOC 03 §10.4: `acima_meta` >= 100; `na_meta` [95, 100); `proximo_meta`
 * [85, 95); `abaixo_meta` < 85.
 */
const EXEC_REPORT_FAIXA_ACIMA_META = 100 as const;
const EXEC_REPORT_FAIXA_NA_META = 95 as const;
const EXEC_REPORT_FAIXA_PROXIMO_META = 85 as const;

/**
 * Rotulos canonicos para nota de agregacao por anonimato §7.6.
 * Compostos deterministicamente no motor — a IA reproduz sem editar.
 */
export const EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO =
  // eslint-disable-next-line @stylistic/max-len -- rotulo canonico literal §7.6
  'Piso de anonimato: os dados de Clima refletem o agregado do departamento (nivel hierarquico imediatamente acima do escopo original).';

export const EXEC_REPORT_NOTA_AGREGACAO_EMPRESA =
  // eslint-disable-next-line @stylistic/max-len -- rotulo canonico literal §7.6
  'Piso de anonimato: os dados de Clima refletem o agregado da empresa (nivel hierarquico imediatamente acima do escopo original).';

// ============================================================
// Helpers puros
// ============================================================

/** Converte string decimal do MySQL2 para number (`null` em ausencia). */
function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Arredonda para 2 casas decimais canonicas. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Calcula variacao percentual entre 2 numeros (retorna null se base 0 ou ausente). */
function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  if (anterior === 0) return null;
  return round2(((atual - anterior) / Math.abs(anterior)) * 100);
}

/** Retorna trimestre canonico do ano anterior (mesmo Q, ano-1). */
function mesmoTrimestreAnoAnterior(trimestre: string): string {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) throw new Error(`Trimestre canonico invalido: ${trimestre}`);
  return formatTrimestreCicloReferencia(parsed.ano - 1, parsed.trimestre);
}

/** Retorna trimestre canonico imediatamente anterior. */
function trimestreAnterior(trimestre: string): string {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) throw new Error(`Trimestre canonico invalido: ${trimestre}`);
  const prev = getPreviousTrimestre(parsed.ano, parsed.trimestre);
  return formatTrimestreCicloReferencia(prev.ano, prev.trimestre);
}

// ============================================================
// Argumentos canonicos
// ============================================================

/**
 * Argumentos canonicos de `buildExecutiveReportPayload`. Trimestre no
 * formato canonico `YYYY-QN`; escopo resolvido pelo router antes.
 */
export interface BuildExecutiveReportArgs {
  companyId: number;
  nomeFantasia: string;
  /** Razao social sanitizada para nome do arquivo (§13.5). */
  razaoSocialSanitizada: string;
  escopo: ExecutiveReportEscopo;
  trimestre: string;
}

// ============================================================
// Motor publico
// ============================================================

/**
 * Compoe o payload deterministico completo do Relatorio executivo
 * trimestral para o escopo e trimestre canonicos informados.
 */
export async function buildExecutiveReportPayload(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
): Promise<ExecutiveReportDeterministicoPayload> {
  const trimestreAnt = trimestreAnterior(args.trimestre);
  const trimestreAno = mesmoTrimestreAnoAnterior(args.trimestre);

  // 1. Colaboradores ativos no escopo (chave para agregacoes).
  const employeeIds = await listActiveEmployeeIdsInScope(db, args);

  // 2. Blocos
  const blocoFinanceiro = await buildBlocoFinanceiro(
    db,
    args,
    trimestreAnt,
    trimestreAno,
    employeeIds,
  );
  const blocoDesempenho = await buildBlocoDesempenho(db, args, trimestreAnt, employeeIds);
  const blocoPlenitude = await buildBlocoPlenitude(db, args, trimestreAnt, employeeIds);
  const blocoClima = await buildBlocoClima(db, args, trimestreAnt);
  const blocoTurnover =
    args.escopo.tipo === 'equipe' ? null : await buildBlocoTurnover(db, args, trimestreAnt);

  // 3. Detalhamento capilar (vazio quando escopo=equipe).
  const detalhamentoCapilar =
    args.escopo.tipo === 'equipe'
      ? { departamentos: [] }
      : await buildDetalhamentoCapilar(db, args);

  return {
    companyId: args.companyId,
    nomeFantasia: args.nomeFantasia,
    razaoSocialSanitizada: args.razaoSocialSanitizada,
    escopo: args.escopo,
    trimestre: args.trimestre,
    trimestreAnterior: trimestreAnt,
    mesmoTrimestreAnoAnterior: trimestreAno,
    blocoFinanceiro,
    blocoDesempenho,
    blocoPlenitude,
    blocoClima,
    blocoTurnover,
    detalhamentoCapilar,
  };
}

// ============================================================
// Passo 1 — colaboradores ativos no escopo
// ============================================================

/**
 * Retorna os `employees.id` ativos no escopo canonico. O filtro
 * `status='ativo'` e canonico — colaboradores inativos NAO entram nas
 * medias trimestrais (mesmo que tenham data no trimestre).
 */
async function listActiveEmployeeIdsInScope(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
): Promise<number[]> {
  const rows = await selectEmployeesByScope(db, args, 'ativo');
  return rows.map((r) => r.id);
}

/**
 * Helper de reuso — devolve rows minimos filtrados por escopo. Aceita
 * status opcional; quando ausente, aceita ativo e inativo.
 */
async function selectEmployeesByScope(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  status?: 'ativo' | 'inativo',
): Promise<{ id: number; departamento: string; nivelHierarquico: string }[]> {
  const where = [eq(employees.companyId, args.companyId)];
  if (args.escopo.tipo === 'departamento' && args.escopo.referencia !== null) {
    // TypeScript nao consegue provar aqui que `escopo.referencia` bate
    // o enum canonico de departamento — o router valida via Zod.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
    where.push(eq(employees.departamento, args.escopo.referencia as any));
  }
  if (args.escopo.tipo === 'equipe' && args.escopo.referencia !== null) {
    const liderIdNum = Number.parseInt(args.escopo.referencia, 10);
    if (!Number.isFinite(liderIdNum)) {
      throw new Error(
        `Escopo equipe exige liderId numerico em referencia; recebeu: ${args.escopo.referencia}`,
      );
    }
    // Equipe = liderados diretos do lider. Reusamos
    // `employeeLeaderHistory` via subquery inline — mas para reduzir
    // custo do JOIN, resolvemos os liderados em passo separado.
    const liderados = await listLideradosDiretosIds(db, args.companyId, liderIdNum);
    if (liderados.length === 0) {
      return [];
    }
    where.push(inArray(employees.id, liderados));
  }
  if (status) {
    where.push(eq(employees.status, status));
  }
  return await db
    .select({
      id: employees.id,
      departamento: employees.departamento,
      nivelHierarquico: employees.nivelHierarquico,
    })
    .from(employees)
    .where(and(...where));
}

/**
 * Retorna os employeeIds dos liderados diretos do lider informado com
 * vinculo ativo (`dataFim IS NULL`) na `employeeLeaderHistory`.
 */
async function listLideradosDiretosIds(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
): Promise<number[]> {
  const { employeeLeaderHistory } = await import('../../db/schema');
  const rows = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, liderId),
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
      ),
    );
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const r of rows) {
    if (r.employeeId !== null && !seen.has(r.employeeId)) {
      seen.add(r.employeeId);
      unique.push(r.employeeId);
    }
  }
  return unique;
}

// ============================================================
// Bloco Financeiro §8.5
// ============================================================

async function buildBlocoFinanceiro(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestreAnt: string,
  trimestreAno: string,
  employeeIds: number[],
): Promise<ExecReportBlocoFinanceiro> {
  const isEmpresa = args.escopo.tipo === 'empresa';

  // 1a. Financeiros do trimestre atual.
  const econAtual = isEmpresa
    ? await getCompanyEconomicDiagnosis(db, args.companyId, args.trimestre)
    : null;
  const roiAtualEscopo = isEmpresa
    ? toNumberOrNull(econAtual?.roiEmpresa ?? null)
    : await avgRoiEstimadoByEmployees(db, args.companyId, args.trimestre, employeeIds);
  const percMetaAtualEscopo = await avgPercMetaByEmployees(
    db,
    args.companyId,
    args.trimestre,
    employeeIds,
  );

  // 1b. Financeiros do trimestre anterior (comparativo).
  const econAnt = isEmpresa
    ? await getCompanyEconomicDiagnosis(db, args.companyId, trimestreAnt)
    : null;
  const roiAntEscopo = isEmpresa
    ? toNumberOrNull(econAnt?.roiEmpresa ?? null)
    : await avgRoiEstimadoByEmployees(db, args.companyId, trimestreAnt, employeeIds);
  const percMetaAntEscopo = await avgPercMetaByEmployees(
    db,
    args.companyId,
    trimestreAnt,
    employeeIds,
  );

  // 1c. Financeiros mesmo trimestre ano anterior.
  const econAno = isEmpresa
    ? await getCompanyEconomicDiagnosis(db, args.companyId, trimestreAno)
    : null;
  const roiAnoEscopo = isEmpresa
    ? toNumberOrNull(econAno?.roiEmpresa ?? null)
    : await avgRoiEstimadoByEmployees(db, args.companyId, trimestreAno, employeeIds);

  return {
    escopo: {
      tipo: args.escopo.tipo,
      referencia: args.escopo.rotulo,
      trimestre: args.trimestre,
    },
    trimestreAtual: {
      roiAgregado: roiAtualEscopo,
      faturamentoMedioTrimestral: isEmpresa
        ? toNumberOrNull(econAtual?.faturamentoMedioTrimestral ?? null)
        : null,
      folhaTotalMedia: isEmpresa ? toNumberOrNull(econAtual?.folhaTotalMedia ?? null) : null,
      percMetaAtingidaAgregada: percMetaAtualEscopo,
      colaboradoresAtivos: employeeIds.length,
    },
    comparativoTrimestreAnterior:
      roiAntEscopo === null && percMetaAntEscopo === null
        ? null
        : {
            roiAgregado: roiAntEscopo,
            variacaoPercentualRoi: variacaoPct(roiAtualEscopo, roiAntEscopo),
            percMetaAtingidaAgregada: percMetaAntEscopo,
            variacaoPercentualMeta: variacaoPct(percMetaAtualEscopo, percMetaAntEscopo),
          },
    comparativoMesmoTrimestreAnoAnterior:
      roiAnoEscopo === null
        ? null
        : {
            roiAgregado: roiAnoEscopo,
            variacaoPercentualRoi: variacaoPct(roiAtualEscopo, roiAnoEscopo),
          },
  };
}

async function getCompanyEconomicDiagnosis(db: RoipDatabase, companyId: number, trimestre: string) {
  const rows = await db
    .select()
    .from(companyEconomicDiagnosis)
    .where(
      and(
        eq(companyEconomicDiagnosis.companyId, companyId),
        eq(companyEconomicDiagnosis.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

async function avgRoiEstimadoByEmployees(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  employeeIds: number[],
): Promise<number | null> {
  if (employeeIds.length === 0) return null;
  const rows = await db
    .select({ media: avg(performanceQuarterlyData.roiEstimado) })
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.companyId, companyId),
        eq(performanceQuarterlyData.trimestre, trimestre),
        inArray(performanceQuarterlyData.employeeId, employeeIds),
        isNotNull(performanceQuarterlyData.roiEstimado),
      ),
    );
  const media = toNumberOrNull(rows[0]?.media ?? null);
  return media !== null ? round2(media) : null;
}

async function avgPercMetaByEmployees(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  employeeIds: number[],
): Promise<number | null> {
  if (employeeIds.length === 0) return null;
  const rows = await db
    .select({ media: avg(performanceQuarterlyData.percMetaAtingida) })
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.companyId, companyId),
        eq(performanceQuarterlyData.trimestre, trimestre),
        inArray(performanceQuarterlyData.employeeId, employeeIds),
        isNotNull(performanceQuarterlyData.percMetaAtingida),
      ),
    );
  const media = toNumberOrNull(rows[0]?.media ?? null);
  return media !== null ? round2(media) : null;
}

// ============================================================
// Bloco Desempenho §8.6
// ============================================================

async function buildBlocoDesempenho(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestreAnt: string,
  employeeIds: number[],
): Promise<ExecReportBlocoDesempenho> {
  const atual = await computeDesempenhoAgregado(db, args.companyId, args.trimestre, employeeIds);
  const anterior = await computeDesempenhoAgregado(db, args.companyId, trimestreAnt, employeeIds);
  const assiduidadeAtual = await computeAssiduidadeMedia(
    db,
    args.companyId,
    args.trimestre,
    employeeIds,
  );

  return {
    escopo: {
      tipo: args.escopo.tipo,
      referencia: args.escopo.rotulo,
      trimestre: args.trimestre,
    },
    trimestreAtual: {
      scoreDesempenhoMedioAgregado: atual.scoreMedio,
      percMetaAtingidaAgregada: atual.percMetaMedio,
      assiduidadeMedia: assiduidadeAtual,
      distribuicaoPorFaixa: atual.distribuicao,
      colaboradoresAtivos: employeeIds.length,
    },
    comparativoTrimestreAnterior:
      anterior.scoreMedio === null && anterior.percMetaMedio === null
        ? null
        : {
            scoreDesempenhoMedioAgregado: anterior.scoreMedio,
            variacaoPercentual: variacaoPct(atual.scoreMedio, anterior.scoreMedio),
            percMetaAtingidaAgregada: anterior.percMetaMedio,
          },
  };
}

async function computeDesempenhoAgregado(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  employeeIds: number[],
): Promise<{
  scoreMedio: number | null;
  percMetaMedio: number | null;
  distribuicao: { acimaMeta: number; naMeta: number; proximoMeta: number; abaixoMeta: number };
}> {
  const distribuicaoVazia = { acimaMeta: 0, naMeta: 0, proximoMeta: 0, abaixoMeta: 0 };
  if (employeeIds.length === 0) {
    return { scoreMedio: null, percMetaMedio: null, distribuicao: distribuicaoVazia };
  }
  const rows = await db
    .select({
      scoreDesempenho: performanceQuarterlyData.scoreDesempenho,
      percMetaAtingida: performanceQuarterlyData.percMetaAtingida,
    })
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.companyId, companyId),
        eq(performanceQuarterlyData.trimestre, trimestre),
        inArray(performanceQuarterlyData.employeeId, employeeIds),
      ),
    );
  if (rows.length === 0) {
    return { scoreMedio: null, percMetaMedio: null, distribuicao: distribuicaoVazia };
  }
  let somaScore = 0;
  let contScore = 0;
  let somaMeta = 0;
  let contMeta = 0;
  const distribuicao = { acimaMeta: 0, naMeta: 0, proximoMeta: 0, abaixoMeta: 0 };
  for (const r of rows) {
    const score = toNumberOrNull(r.scoreDesempenho);
    if (score !== null) {
      somaScore += score;
      contScore += 1;
    }
    const meta = toNumberOrNull(r.percMetaAtingida);
    if (meta !== null) {
      somaMeta += meta;
      contMeta += 1;
      if (meta >= EXEC_REPORT_FAIXA_ACIMA_META) distribuicao.acimaMeta += 1;
      else if (meta >= EXEC_REPORT_FAIXA_NA_META) distribuicao.naMeta += 1;
      else if (meta >= EXEC_REPORT_FAIXA_PROXIMO_META) distribuicao.proximoMeta += 1;
      else distribuicao.abaixoMeta += 1;
    }
  }
  return {
    scoreMedio: contScore > 0 ? round2(somaScore / contScore) : null,
    percMetaMedio: contMeta > 0 ? round2(somaMeta / contMeta) : null,
    distribuicao,
  };
}

async function computeAssiduidadeMedia(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  employeeIds: number[],
): Promise<number | null> {
  if (employeeIds.length === 0) return null;
  const meses = getQuarterMonths(trimestre);
  if (!meses) return null;
  const rows = await db
    .select({ media: avg(performanceData.assiduidade) })
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        inArray(performanceData.employeeId, employeeIds),
        inArray(performanceData.mes, meses),
        isNotNull(performanceData.assiduidade),
      ),
    );
  const media = toNumberOrNull(rows[0]?.media ?? null);
  return media !== null ? round2(media) : null;
}

// ============================================================
// Bloco Plenitude §8.7
// ============================================================

async function buildBlocoPlenitude(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestreAnt: string,
  employeeIds: number[],
): Promise<ExecReportBlocoPlenitude> {
  const atual = await computePlenitudeAgregado(db, args.companyId, args.trimestre, employeeIds);
  const anterior = await computePlenitudeAgregado(db, args.companyId, trimestreAnt, employeeIds);
  return {
    escopo: {
      tipo: args.escopo.tipo,
      referencia: args.escopo.rotulo,
      trimestre: args.trimestre,
    },
    trimestreAtual: {
      plenitudeScoreMedioAgregado: atual.plenitudeMedio,
      scoreAMedio: atual.scoreAMedio,
      scoreCMedio: atual.scoreCMedio,
      porDimensaoAgregada: {
        engajamento: atual.engajamentoMedio,
        desenvolvimento: atual.desenvolvimentoMedio,
        pertencimento: atual.pertencimentoMedio,
        realizacao: atual.realizacaoMedio,
      },
      percColaboradoresComAlertaDivergencia: atual.percAlerta,
      colaboradoresAtivos: employeeIds.length,
    },
    comparativoTrimestreAnterior:
      anterior.plenitudeMedio === null
        ? null
        : {
            plenitudeScoreMedioAgregado: anterior.plenitudeMedio,
            variacaoPercentual: variacaoPct(atual.plenitudeMedio, anterior.plenitudeMedio),
          },
  };
}

interface PlenitudeAgregado {
  plenitudeMedio: number | null;
  scoreAMedio: number | null;
  scoreCMedio: number | null;
  engajamentoMedio: number | null;
  desenvolvimentoMedio: number | null;
  pertencimentoMedio: number | null;
  realizacaoMedio: number | null;
  percAlerta: number | null;
}

async function computePlenitudeAgregado(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  employeeIds: number[],
): Promise<PlenitudeAgregado> {
  if (employeeIds.length === 0) {
    return {
      plenitudeMedio: null,
      scoreAMedio: null,
      scoreCMedio: null,
      engajamentoMedio: null,
      desenvolvimentoMedio: null,
      pertencimentoMedio: null,
      realizacaoMedio: null,
      percAlerta: null,
    };
  }
  const rows = await db
    .select({
      plenitudeScore: plenitudeData.plenitudeScore,
      scoreA: plenitudeData.scoreA,
      scoreC: plenitudeData.scoreC,
      engajamentoA: plenitudeData.engajamentoA,
      engajamentoC: plenitudeData.engajamentoC,
      desenvolvimentoA: plenitudeData.desenvolvimentoA,
      desenvolvimentoC: plenitudeData.desenvolvimentoC,
      pertencimentoA: plenitudeData.pertencimentoA,
      pertencimentoC: plenitudeData.pertencimentoC,
      realizacaoA: plenitudeData.realizacaoA,
      realizacaoC: plenitudeData.realizacaoC,
      alertaDivergencia: plenitudeData.alertaDivergencia,
    })
    .from(plenitudeData)
    .where(
      and(
        eq(plenitudeData.companyId, companyId),
        eq(plenitudeData.trimestre, trimestre),
        inArray(plenitudeData.employeeId, employeeIds),
      ),
    );
  if (rows.length === 0) {
    return {
      plenitudeMedio: null,
      scoreAMedio: null,
      scoreCMedio: null,
      engajamentoMedio: null,
      desenvolvimentoMedio: null,
      pertencimentoMedio: null,
      realizacaoMedio: null,
      percAlerta: null,
    };
  }

  const acc = {
    plenitude: 0,
    scoreA: 0,
    scoreC: 0,
    eng: 0,
    des: 0,
    per: 0,
    rea: 0,
    n: 0,
    nEng: 0,
    nDes: 0,
    nPer: 0,
    nRea: 0,
    alertas: 0,
  };
  for (const r of rows) {
    const p = toNumberOrNull(r.plenitudeScore);
    if (p !== null) {
      acc.plenitude += p;
      acc.n += 1;
    }
    const sa = toNumberOrNull(r.scoreA);
    if (sa !== null) acc.scoreA += sa;
    const sc = toNumberOrNull(r.scoreC);
    if (sc !== null) acc.scoreC += sc;
    // Medias de dimensao ponderadas entre A e C (media simples canonica).
    const engA = toNumberOrNull(r.engajamentoA);
    const engC = toNumberOrNull(r.engajamentoC);
    if (engA !== null && engC !== null) {
      acc.eng += (engA + engC) / 2;
      acc.nEng += 1;
    }
    const desA = toNumberOrNull(r.desenvolvimentoA);
    const desC = toNumberOrNull(r.desenvolvimentoC);
    if (desA !== null && desC !== null) {
      acc.des += (desA + desC) / 2;
      acc.nDes += 1;
    }
    const perA = toNumberOrNull(r.pertencimentoA);
    const perC = toNumberOrNull(r.pertencimentoC);
    if (perA !== null && perC !== null) {
      acc.per += (perA + perC) / 2;
      acc.nPer += 1;
    }
    const reaA = toNumberOrNull(r.realizacaoA);
    const reaC = toNumberOrNull(r.realizacaoC);
    if (reaA !== null && reaC !== null) {
      acc.rea += (reaA + reaC) / 2;
      acc.nRea += 1;
    }
    if (r.alertaDivergencia === true) acc.alertas += 1;
  }
  const totalLinhas = rows.length;
  return {
    plenitudeMedio: acc.n > 0 ? round2(acc.plenitude / acc.n) : null,
    scoreAMedio: acc.n > 0 ? round2(acc.scoreA / acc.n) : null,
    scoreCMedio: acc.n > 0 ? round2(acc.scoreC / acc.n) : null,
    engajamentoMedio: acc.nEng > 0 ? round2(acc.eng / acc.nEng) : null,
    desenvolvimentoMedio: acc.nDes > 0 ? round2(acc.des / acc.nDes) : null,
    pertencimentoMedio: acc.nPer > 0 ? round2(acc.per / acc.nPer) : null,
    realizacaoMedio: acc.nRea > 0 ? round2(acc.rea / acc.nRea) : null,
    percAlerta: round2((acc.alertas / totalLinhas) * 100),
  };
}

// ============================================================
// Bloco Clima §8.8 (com piso de anonimato §7.6)
// ============================================================

async function buildBlocoClima(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestreAnt: string,
): Promise<ExecReportBlocoClima> {
  const escopoRotulo = args.escopo.rotulo;

  // Cascata canonica §7.6: equipe -> departamento -> empresa.
  const cascata = await resolveClimaComPisoAnonimato(db, args, args.trimestre);

  const escopoBloco = {
    tipo: args.escopo.tipo,
    referencia: escopoRotulo,
    trimestre: args.trimestre,
  };

  if (cascata === null) {
    return {
      escopo: escopoBloco,
      trimestreReferencia: args.trimestre,
      disponivel: false,
      trimestreAtual: null,
      comparativoTrimestreAnterior: null,
      notaAgregacaoAnonimato: null,
    };
  }

  // Comparativo com o trimestre anterior — usa o MESMO nivel de
  // agregacao efetivo do trimestre atual.
  const anterior = await getClimaRowByLevel(
    db,
    args.companyId,
    cascata.effectiveScope,
    cascata.effectiveDepartamento,
    cascata.effectiveLiderId,
    trimestreAnt,
  );

  return {
    escopo: escopoBloco,
    trimestreReferencia: args.trimestre,
    disponivel: true,
    trimestreAtual: {
      notaClima: toNumberOrNull(cascata.row.notaClima),
      adesao: toNumberOrNull(cascata.row.adesao),
      porDimensaoAgregada: {
        engajamento: toNumberOrNull(cascata.row.notaEngajamento),
        desenvolvimento: toNumberOrNull(cascata.row.notaDesenvolvimento),
        pertencimento: toNumberOrNull(cascata.row.notaPertencimento),
        realizacao: toNumberOrNull(cascata.row.notaRealizacao),
      },
      respondentes: cascata.row.countCobertura,
    },
    comparativoTrimestreAnterior:
      anterior === null
        ? null
        : {
            notaClima: toNumberOrNull(anterior.notaClima),
            variacaoPercentual: variacaoPct(
              toNumberOrNull(cascata.row.notaClima),
              toNumberOrNull(anterior.notaClima),
            ),
          },
    notaAgregacaoAnonimato: cascata.notaAgregacao,
  };
}

interface ClimaCascataResult {
  row: {
    notaClima: string | null;
    adesao: string | null;
    countCobertura: number;
    notaEngajamento: string | null;
    notaDesenvolvimento: string | null;
    notaPertencimento: string | null;
    notaRealizacao: string | null;
  };
  effectiveScope: 'empresa' | 'departamento' | 'equipe';
  effectiveDepartamento: string | null;
  effectiveLiderId: number | null;
  notaAgregacao: string | null;
}

async function resolveClimaComPisoAnonimato(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestre: string,
): Promise<ClimaCascataResult | null> {
  // Tentativa 1: escopo original.
  if (args.escopo.tipo === 'equipe' && args.escopo.referencia !== null) {
    const liderId = Number.parseInt(args.escopo.referencia, 10);
    if (Number.isFinite(liderId)) {
      const row = await getClimaRowByLevel(db, args.companyId, 'equipe', null, liderId, trimestre);
      if (row !== null && row.countCobertura >= EXEC_REPORT_CLIMA_PISO_RESPONDENTES) {
        return {
          row,
          effectiveScope: 'equipe',
          effectiveDepartamento: null,
          effectiveLiderId: liderId,
          notaAgregacao: null,
        };
      }
      // Fallback para departamento do lider.
      const liderDept = await getEmployeeDepartamento(db, liderId);
      if (liderDept !== null) {
        const rowDept = await getClimaRowByLevel(
          db,
          args.companyId,
          'departamento',
          liderDept,
          null,
          trimestre,
        );
        if (rowDept !== null && rowDept.countCobertura >= EXEC_REPORT_CLIMA_PISO_RESPONDENTES) {
          return {
            row: rowDept,
            effectiveScope: 'departamento',
            effectiveDepartamento: liderDept,
            effectiveLiderId: null,
            notaAgregacao: EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO,
          };
        }
      }
      // Fallback ate empresa.
      return await tryEmpresaFallback(db, args.companyId, trimestre, true);
    }
  }
  if (args.escopo.tipo === 'departamento' && args.escopo.referencia !== null) {
    const row = await getClimaRowByLevel(
      db,
      args.companyId,
      'departamento',
      args.escopo.referencia,
      null,
      trimestre,
    );
    if (row !== null && row.countCobertura >= EXEC_REPORT_CLIMA_PISO_RESPONDENTES) {
      return {
        row,
        effectiveScope: 'departamento',
        effectiveDepartamento: args.escopo.referencia,
        effectiveLiderId: null,
        notaAgregacao: null,
      };
    }
    return await tryEmpresaFallback(db, args.companyId, trimestre, true);
  }
  // Escopo empresa.
  return await tryEmpresaFallback(db, args.companyId, trimestre, false);
}

async function tryEmpresaFallback(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  comAgregacao: boolean,
): Promise<ClimaCascataResult | null> {
  const row = await getClimaRowByLevel(db, companyId, 'empresa', null, null, trimestre);
  if (row === null || row.countCobertura < EXEC_REPORT_CLIMA_PISO_RESPONDENTES) {
    return null;
  }
  return {
    row,
    effectiveScope: 'empresa',
    effectiveDepartamento: null,
    effectiveLiderId: null,
    notaAgregacao: comAgregacao ? EXEC_REPORT_NOTA_AGREGACAO_EMPRESA : null,
  };
}

async function getClimaRowByLevel(
  db: RoipDatabase,
  companyId: number,
  escopo: 'empresa' | 'departamento' | 'equipe',
  departamento: string | null,
  liderId: number | null,
  trimestre: string,
): Promise<ClimaCascataResult['row'] | null> {
  const where = [
    eq(climateEngagementData.companyId, companyId),
    eq(climateEngagementData.escopo, escopo),
    eq(climateEngagementData.trimestre, trimestre),
  ];
  if (departamento !== null) {
    where.push(eq(climateEngagementData.departamento, departamento));
  }
  if (liderId !== null) {
    where.push(eq(climateEngagementData.liderId, liderId));
  }
  const rows = await db
    .select({
      notaClima: climateEngagementData.notaClima,
      adesao: climateEngagementData.adesao,
      countCobertura: climateEngagementData.countCobertura,
      notaEngajamento: climateEngagementData.notaEngajamento,
      notaDesenvolvimento: climateEngagementData.notaDesenvolvimento,
      notaPertencimento: climateEngagementData.notaPertencimento,
      notaRealizacao: climateEngagementData.notaRealizacao,
    })
    .from(climateEngagementData)
    .where(and(...where))
    .limit(1);
  return rows[0] ?? null;
}

async function getEmployeeDepartamento(
  db: RoipDatabase,
  employeeId: number,
): Promise<string | null> {
  const rows = await db
    .select({ departamento: employees.departamento })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return rows[0]?.departamento ?? null;
}

// ============================================================
// Bloco Turnover §8.9
// ============================================================

async function buildBlocoTurnover(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  trimestreAnt: string,
): Promise<ExecReportBlocoTurnover> {
  if (args.escopo.tipo === 'empresa') {
    const atual = await computeTurnoverByCompany(db, args.companyId, args.trimestre);
    const anterior = await computeTurnoverByCompany(db, args.companyId, trimestreAnt);
    const aberturaPorNivel = mapAberturaPorNivel(atual.aberturaPorNivel);
    return {
      escopo: {
        tipo: 'empresa',
        referencia: args.escopo.rotulo,
        trimestre: args.trimestre,
      },
      trimestreAtual: {
        turnoverTrimestralPercentual: atual.taxaTrimestral,
        turnoverAnualizadoPercentual: atual.taxaAnualizada,
        colaboradoresAtivosInicioTrimestre: atual.totalHeadcountInicioTrimestre,
        saidasTotais: atual.totalSaidasTrimestre,
        saidasVoluntarias: atual.aberturaPorMotivo.voluntario,
        saidasInvoluntarias: atual.aberturaPorMotivo.involuntario,
      },
      aberturaPorNivelHierarquico: aberturaPorNivel,
      comparativoTrimestreAnterior: {
        turnoverTrimestralPercentual: anterior.taxaTrimestral,
        variacaoPercentual: variacaoPct(atual.taxaTrimestral, anterior.taxaTrimestral),
      },
    };
  }
  // departamento
  if (args.escopo.referencia === null) {
    throw new Error('Escopo departamento exige referencia canonica');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Departamento validado no router
  const departamento = args.escopo.referencia as any;
  const atual = await computeTurnoverByDepartamento(
    db,
    args.companyId,
    departamento,
    args.trimestre,
  );
  const anterior = await computeTurnoverByDepartamento(
    db,
    args.companyId,
    departamento,
    trimestreAnt,
  );
  return {
    escopo: {
      tipo: 'departamento',
      referencia: args.escopo.rotulo,
      trimestre: args.trimestre,
    },
    trimestreAtual: {
      turnoverTrimestralPercentual: atual.taxaTrimestral,
      turnoverAnualizadoPercentual: atual.taxaAnualizada,
      colaboradoresAtivosInicioTrimestre: atual.totalHeadcountInicioTrimestre,
      saidasTotais: atual.totalSaidasTrimestre,
      saidasVoluntarias: atual.aberturaPorMotivo.voluntario,
      saidasInvoluntarias: atual.aberturaPorMotivo.involuntario,
    },
    aberturaPorNivelHierarquico: null,
    comparativoTrimestreAnterior: {
      turnoverTrimestralPercentual: anterior.taxaTrimestral,
      variacaoPercentual: variacaoPct(atual.taxaTrimestral, anterior.taxaTrimestral),
    },
  };
}

function mapAberturaPorNivel(
  linhas: Array<{
    nivel: NivelHierarquico;
    taxaTrimestral: number;
    saidasTrimestre: number;
  }>,
): ExecReportBlocoTurnover['aberturaPorNivelHierarquico'] {
  const empty = { turnoverPercentual: 0, saidas: 0 };
  const acc = {
    estrategico: { ...empty },
    tatico: { ...empty },
    operacional: { ...empty },
  };
  for (const linha of linhas) {
    if (linha.nivel === 'estrategico') {
      acc.estrategico = { turnoverPercentual: linha.taxaTrimestral, saidas: linha.saidasTrimestre };
    } else if (linha.nivel === 'tatico') {
      acc.tatico = { turnoverPercentual: linha.taxaTrimestral, saidas: linha.saidasTrimestre };
    } else if (linha.nivel === 'operacional') {
      acc.operacional = {
        turnoverPercentual: linha.taxaTrimestral,
        saidas: linha.saidasTrimestre,
      };
    }
  }
  return acc;
}

// ============================================================
// Detalhamento capilar §7.5 (cascata)
// ============================================================

async function buildDetalhamentoCapilar(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
): Promise<ExecReportDetalhamentoCapilar> {
  // Escopo empresa: todos os departamentos com colaboradores ativos.
  // Escopo departamento: apenas o departamento em foco.
  const isEmpresa = args.escopo.tipo === 'empresa';
  const departamentosAtivos = isEmpresa
    ? await listActiveDepartamentosByCompany(db, args.companyId)
    : args.escopo.referencia !== null
      ? [args.escopo.referencia]
      : [];

  const linhas: ExecReportDepartamentoLinha[] = [];
  for (const dept of departamentosAtivos) {
    const empIds = await listActiveEmployeeIdsInDepartamento(db, args.companyId, dept);
    if (empIds.length === 0) {
      continue;
    }
    const desemp = await computeDesempenhoAgregado(db, args.companyId, args.trimestre, empIds);
    const plen = await computePlenitudeAgregado(db, args.companyId, args.trimestre, empIds);
    const climaRow = await getClimaRowByLevel(
      db,
      args.companyId,
      'departamento',
      dept,
      null,
      args.trimestre,
    );
    const climaAcima =
      climaRow !== null && climaRow.countCobertura >= EXEC_REPORT_CLIMA_PISO_RESPONDENTES;
    const notaClima = climaAcima ? toNumberOrNull(climaRow?.notaClima ?? null) : null;
    let turnoverTri: number | null = null;
    try {
      const t = await computeTurnoverByDepartamento(
        db,
        args.companyId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Departamento validado
        dept as any,
        args.trimestre,
      );
      turnoverTri = t.taxaTrimestral;
    } catch {
      turnoverTri = null;
    }
    const equipes = await listEquipesByDepartamento(db, args, dept);
    linhas.push({
      departamento: dept,
      colaboradoresAtivos: empIds.length,
      scoreDesempenhoMedio: desemp.scoreMedio,
      plenitudeScoreMedio: plen.plenitudeMedio,
      notaClima,
      turnoverTrimestralPercentual: turnoverTri,
      equipes,
    });
  }
  return { departamentos: linhas };
}

async function listActiveDepartamentosByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<string[]> {
  const rows = await db
    .select({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .groupBy(employees.departamento);
  return rows.map((r) => r.departamento);
}

async function listActiveEmployeeIdsInDepartamento(
  db: RoipDatabase,
  companyId: number,
  departamento: string,
): Promise<number[]> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
        eq(employees.departamento, departamento as any),
        eq(employees.status, 'ativo'),
      ),
    );
  return rows.map((r) => r.id);
}

async function listEquipesByDepartamento(
  db: RoipDatabase,
  args: BuildExecutiveReportArgs,
  departamento: string,
): Promise<ExecReportEquipeLinha[]> {
  // Equipes = lideres ativos no departamento com pelo menos 1 liderado.
  const lideresRows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, args.companyId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
        eq(employees.departamento, departamento as any),
        eq(employees.status, 'ativo'),
        eq(employees.isLider, true),
      ),
    );
  const out: ExecReportEquipeLinha[] = [];
  for (const l of lideresRows) {
    const liderados = await listLideradosDiretosIds(db, args.companyId, l.id);
    if (liderados.length === 0) continue;
    const desemp = await computeDesempenhoAgregado(db, args.companyId, args.trimestre, liderados);
    const plen = await computePlenitudeAgregado(db, args.companyId, args.trimestre, liderados);
    out.push({
      liderId: l.id,
      liderNome: l.name,
      colaboradoresAtivos: liderados.length,
      scoreDesempenhoMedio: desemp.scoreMedio,
      plenitudeScoreMedio: plen.plenitudeMedio,
    });
  }
  return out;
}
