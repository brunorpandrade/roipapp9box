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

import { and, avg, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  companyEconomicDiagnosis,
  employeeLeaderHistory,
  employees,
  performanceData,
  performanceQuarterlyData,
  plenitudeData,
} from '../../db/schema';
import {
  type ClimateLiderTipo,
  NUM_QUESTOES_CLIMATE,
  resolveClimateBlockComCascata,
} from './climateCalculationEngine';
import {
  formatTrimestreCicloReferencia,
  getPreviousTrimestre,
  parseTrimestreCicloReferencia,
} from '../../lib/cycleDates';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';
import type { NivelHierarquico } from '../../db/schema/enums';
import {
  computeTurnoverByCompany,
  computeTurnoverByDepartamento,
  computeTurnoverRate,
  computeTurnoverUltimos12Meses,
} from './turnoverEngine';
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
  'Piso de anonimato: os dados de Clima refletem o agregado do departamento (nível hierárquico imediatamente acima do escopo original).';

export const EXEC_REPORT_NOTA_AGREGACAO_EMPRESA =
  // eslint-disable-next-line @stylistic/max-len -- rotulo canonico literal §7.6
  'Piso de anonimato: os dados de Clima refletem o agregado da empresa (nível hierárquico imediatamente acima do escopo original).';

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
  if (!parsed) throw new Error(`Trimestre canônico inválido: ${trimestre}`);
  return formatTrimestreCicloReferencia(parsed.ano - 1, parsed.trimestre);
}

/** Retorna trimestre canonico imediatamente anterior. */
function trimestreAnterior(trimestre: string): string {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) throw new Error(`Trimestre canônico inválido: ${trimestre}`);
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
  /**
   * ME-1.3d-REV DIS-C CC079-1: URL canonica da logo da empresa
   * (`companies.logoUrl`). `null` quando a empresa nao tem logo.
   * Opcional para compatibilidade com callers legados; o engine
   * repassa `null` quando ausente.
   */
  logoUrl?: string | null;
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
/**
 * ME-1.3d-REV DIS-A: deriva 3 destaques canonicos determiniscamente dos
 * blocos do payload. Zero chamada IA — preserva determinismo bit-exact
 * canonico do payload. Convencao canonica de prioridade (do mais forte
 * ao mais fraco):
 *   1. Maior variacao POSITIVA vs trimestre anterior (ROI, desempenho,
 *      plenitude, clima — exclui turnover).
 *   2. Maior variacao NEGATIVA (sinal de alerta) vs trimestre anterior.
 *   3. Maior alerta transversal (turnover trimestral, % alerta divergencia,
 *      ou % folha fora da faixa ideal).
 * Fallback canonico quando nao ha dados comparativos: 3 destaques
 * descritivos simples (ROI, desempenho, respondentes clima).
 */
/* eslint-disable @stylistic/max-len -- textos canonicos em pt-BR superam 100 colunas */
export function derivarTopDestaquesDeterministicos(
  payload: ExecutiveReportDeterministicoPayload,
): readonly [string, string, string] {
  const fmt = (v: number | null, d = 2): string =>
    v === null || !Number.isFinite(v)
      ? '—'
      : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPct = (v: number | null): string => (v === null ? '—' : `${fmt(v)}%`);

  const candidatos: Array<{ prioridade: number; texto: string }> = [];

  // 1. Variacoes positivas canonicas
  const varRoi =
    payload.blocoFinanceiro.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null;
  if (varRoi !== null && varRoi > 0) {
    candidatos.push({
      prioridade: 100 + varRoi,
      texto: `ROI subiu ${fmtPct(varRoi)} vs trimestre anterior, alcançando ${fmt(payload.blocoFinanceiro.trimestreAtual.roiAgregado)}.`,
    });
  }
  const varDes = payload.blocoDesempenho.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  if (varDes !== null && varDes > 0) {
    candidatos.push({
      prioridade: 90 + varDes,
      texto: `Desempenho médio subiu ${fmtPct(varDes)} vs trimestre anterior, alcançando ${fmt(payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado)}.`,
    });
  }
  const varPlen = payload.blocoPlenitude.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const plen = payload.blocoPlenitude.trimestreAtual.plenitudeScoreMedioAgregado;
  if (varPlen !== null && varPlen > 0) {
    candidatos.push({
      prioridade: 80 + varPlen,
      texto: `Plenitude média subiu ${fmtPct(varPlen)} vs trimestre anterior, alcançando ${fmt(plen)}.`,
    });
  }

  // 2. Variacoes negativas (sinal de alerta)
  const roi = payload.blocoFinanceiro.trimestreAtual.roiAgregado;
  const des = payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado;
  if (varRoi !== null && varRoi < 0) {
    candidatos.push({
      prioridade: 70 + Math.abs(varRoi),
      texto: `ROI recuou ${fmtPct(Math.abs(varRoi))} vs trimestre anterior, caindo para ${fmt(roi)}.`,
    });
  }
  if (varDes !== null && varDes < 0) {
    candidatos.push({
      prioridade: 60 + Math.abs(varDes),
      texto: `Desempenho médio recuou ${fmtPct(Math.abs(varDes))} vs trimestre anterior, caindo para ${fmt(des)}.`,
    });
  }
  if (varPlen !== null && varPlen < 0) {
    candidatos.push({
      prioridade: 55 + Math.abs(varPlen),
      texto: `Plenitude média recuou ${fmtPct(Math.abs(varPlen))} vs trimestre anterior, caindo para ${fmt(plen)}.`,
    });
  }

  // 3. Alertas transversais canonicos
  const alertaDiv = payload.blocoPlenitude.trimestreAtual.percColaboradoresComAlertaDivergencia;
  if (alertaDiv !== null && alertaDiv >= 20) {
    candidatos.push({
      prioridade: 50 + alertaDiv,
      texto: `${fmtPct(alertaDiv)} dos colaboradores com alerta de divergência jornada vs expectativa.`,
    });
  }
  if (payload.blocoTurnover !== null) {
    const t = payload.blocoTurnover.trimestreAtual.turnoverTrimestralPercentual;
    if (t >= 10) {
      candidatos.push({
        prioridade: 40 + t,
        texto: `Turnover trimestral de ${fmtPct(t)} supera o limiar de atenção (10%).`,
      });
    }
  }
  const fin = payload.blocoFinanceiro.trimestreAtual;
  if (
    fin.percFolhaFaturamento !== null &&
    fin.folhaPercMaximaIdeal !== null &&
    fin.percFolhaFaturamento > fin.folhaPercMaximaIdeal
  ) {
    const dist = fin.percFolhaFaturamento - fin.folhaPercMaximaIdeal;
    candidatos.push({
      prioridade: 45 + dist,
      texto: `Folha é ${fmtPct(fin.percFolhaFaturamento)} do faturamento, ${fmt(dist)} p.p. acima do ideal.`,
    });
  }

  // Ordena por prioridade decrescente + pega top 3; completa com fallback.
  candidatos.sort((a, b) => b.prioridade - a.prioridade);
  const topTres = candidatos.slice(0, 3).map((c) => c.texto);
  while (topTres.length < 3) {
    if (topTres.length === 0) {
      topTres.push(`ROI do trimestre: ${fmt(roi)}.`);
    } else if (topTres.length === 1) {
      topTres.push(`Desempenho médio: ${fmt(des)}.`);
    } else {
      const notaClima = payload.blocoClima.trimestreAtual?.notaClima ?? null;
      topTres.push(`Nota de clima: ${fmt(notaClima)}.`);
    }
  }
  return [topTres[0]!, topTres[1]!, topTres[2]!] as const;
}
/* eslint-enable @stylistic/max-len */

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
    logoUrl: args.logoUrl ?? null,
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
        `Escopo equipe exige liderId numérico em referência; recebeu: ${args.escopo.referencia}`,
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

  // 1d. ME-1.3d-REV DIS-A: faixa canonica ideal da folha vs faturamento
  //     carregada da configuracao da empresa. Ambas podem ser `null` (empresa
  //     sem config); nesse caso o template omite a comparacao.
  let folhaPercMinimaIdeal: number | null = null;
  let folhaPercMaximaIdeal: number | null = null;
  if (isEmpresa) {
    const rows = await db
      .select({
        folhaPercMinima: companies.folhaPercMinima,
        folhaPercMaxima: companies.folhaPercMaxima,
      })
      .from(companies)
      .where(eq(companies.id, args.companyId))
      .limit(1);
    const row = rows[0] ?? null;
    if (row !== null) {
      folhaPercMinimaIdeal = toNumberOrNull(row.folhaPercMinima ?? null);
      folhaPercMaximaIdeal = toNumberOrNull(row.folhaPercMaxima ?? null);
    }
  }

  // 1e. ME-1.3d-REV DIS-A: percentual canonico `folha / faturamento * 100`.
  const faturamentoAtual = isEmpresa
    ? toNumberOrNull(econAtual?.faturamentoMedioTrimestral ?? null)
    : null;
  const folhaAtual = isEmpresa ? toNumberOrNull(econAtual?.folhaTotalMedia ?? null) : null;
  const percFolhaFaturamento =
    faturamentoAtual !== null && folhaAtual !== null && faturamentoAtual > 0
      ? Math.round((folhaAtual / faturamentoAtual) * 10000) / 100
      : null;
  // ME-1.3d-REV DIS-C CC079-1: faturamento ideal (R$) do diagnostico
  // economico — consumido como "Meta" financeira no PDF executivo.
  const faturamentoIdeal = isEmpresa ? toNumberOrNull(econAtual?.faturamentoIdeal ?? null) : null;

  return {
    escopo: {
      tipo: args.escopo.tipo,
      referencia: args.escopo.rotulo,
      trimestre: args.trimestre,
    },
    trimestreAtual: {
      roiAgregado: roiAtualEscopo,
      faturamentoMedioTrimestral: faturamentoAtual,
      folhaTotalMedia: folhaAtual,
      percMetaAtingidaAgregada: percMetaAtualEscopo,
      colaboradoresAtivos: employeeIds.length,
      percFolhaFaturamento,
      folhaPercMinimaIdeal,
      folhaPercMaximaIdeal,
      faturamentoIdeal,
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

  // Cascata canonica §7.6 (motor puro sob demanda — ME-B2-01b Q1=D):
  // equipe -> departamento -> empresa. `resolveClimateBlockComCascata`
  // encapsula toda a logica canonica de piso + fallback.
  const cascata = await resolveClimateBlockComCascataForEscopo(
    db,
    args.companyId,
    args.escopo,
    args.trimestre,
  );

  const escopoBloco = {
    tipo: args.escopo.tipo,
    referencia: escopoRotulo,
    trimestre: args.trimestre,
  };

  if (!cascata.dadosDisponiveis) {
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
  // agregacao efetivo do trimestre atual (bit-a-bit canonico).
  const anterior = await resolveClimateBlockComCascataForEscopo(
    db,
    args.companyId,
    args.escopo,
    trimestreAnt,
  );

  const notaAgregacaoAnonimato =
    cascata.notaAgregacao === 'agregado_departamento'
      ? EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO
      : cascata.notaAgregacao === 'agregado_empresa'
        ? EXEC_REPORT_NOTA_AGREGACAO_EMPRESA
        : null;

  // ME-1.3d-REV DIS-A: notas canonicas por aspecto (20 posicoes,
  // convencao `(dim-1)*5+(item-1)`). O template PDF da DIS-B consome
  // apenas no bloco agregado da empresa; dept e equipe ignoram, mas o
  // payload sempre carrega para consistencia de schema.
  const notasPorAspecto: readonly (number | null)[] =
    cascata.payload.notasQuestao.length === NUM_QUESTOES_CLIMATE
      ? [...cascata.payload.notasQuestao]
      : Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null);

  return {
    escopo: escopoBloco,
    trimestreReferencia: args.trimestre,
    disponivel: true,
    trimestreAtual: {
      notaClima: cascata.payload.notaClima,
      adesao: cascata.payload.adesao,
      porDimensaoAgregada: {
        engajamento: cascata.payload.notaEngajamento,
        desenvolvimento: cascata.payload.notaDesenvolvimento,
        pertencimento: cascata.payload.notaPertencimento,
        realizacao: cascata.payload.notaRealizacao,
      },
      respondentes: cascata.payload.countCobertura,
      notasPorAspecto,
    },
    comparativoTrimestreAnterior: !anterior.dadosDisponiveis
      ? null
      : {
          notaClima: anterior.payload.notaClima,
          variacaoPercentual: variacaoPct(cascata.payload.notaClima, anterior.payload.notaClima),
        },
    notaAgregacaoAnonimato,
  };
}

/**
 * Adaptador canonico: converte o tipo interno de escopo do exec
 * report para o params canonico do motor Clima e delega a
 * `resolveClimateBlockComCascata`. Encapsula o parse de `referencia`
 * quando o escopo e `'equipe'` (que carrega o liderId serializado).
 */
async function resolveClimateBlockComCascataForEscopo(
  db: RoipDatabase,
  companyId: number,
  escopo: BuildExecutiveReportArgs['escopo'],
  trimestre: string,
): ReturnType<typeof resolveClimateBlockComCascata> {
  if (escopo.tipo === 'equipe' && escopo.referencia !== null) {
    const liderId = Number.parseInt(escopo.referencia, 10);
    if (Number.isFinite(liderId)) {
      // Assumimos liderTipo='employee' aqui (padrao canonico do
      // exec report vigente; ME-B2-01a.1.2 estende para C-level nas
      // superficies especificas). Consumidores C-level do exec
      // report ainda nao existem — quando existirem, o adaptador
      // recebe liderTipo por parametro.
      return await resolveClimateBlockComCascata(db, {
        companyId,
        escopo: 'equipe',
        escopoReferencia: null,
        liderId,
        liderTipo: 'employee' satisfies ClimateLiderTipo,
        trimestre,
      });
    }
  }
  if (escopo.tipo === 'departamento' && escopo.referencia !== null) {
    return await resolveClimateBlockComCascata(db, {
      companyId,
      escopo: 'departamento',
      escopoReferencia: escopo.referencia,
      liderId: null,
      liderTipo: null,
      trimestre,
    });
  }
  return await resolveClimateBlockComCascata(db, {
    companyId,
    escopo: 'empresa',
    escopoReferencia: null,
    liderId: null,
    liderTipo: null,
    trimestre,
  });
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
    const ultimos12 = await computeTurnoverUltimos12Meses(db, args.companyId, args.trimestre);
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
        turnoverVoluntarioPercentual: computeTurnoverRate(
          atual.aberturaPorMotivo.voluntario,
          atual.totalHeadcountInicioTrimestre,
        ),
        turnoverInvoluntarioPercentual: computeTurnoverRate(
          atual.aberturaPorMotivo.involuntario,
          atual.totalHeadcountInicioTrimestre,
        ),
      },
      ultimos12Meses: {
        turnoverPercentual: ultimos12.taxaUltimos12Meses,
        saidasTotais: ultimos12.totalSaidas12Meses,
        headcountInicio: ultimos12.headcountInicio12Meses,
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
    throw new Error('Escopo departamento exige referência canônica');
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
  const ultimos12 = await computeTurnoverUltimos12Meses(db, args.companyId, args.trimestre);
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
      turnoverVoluntarioPercentual: computeTurnoverRate(
        atual.aberturaPorMotivo.voluntario,
        atual.totalHeadcountInicioTrimestre,
      ),
      turnoverInvoluntarioPercentual: computeTurnoverRate(
        atual.aberturaPorMotivo.involuntario,
        atual.totalHeadcountInicioTrimestre,
      ),
    },
    ultimos12Meses: {
      turnoverPercentual: ultimos12.taxaUltimos12Meses,
      saidasTotais: ultimos12.totalSaidas12Meses,
      headcountInicio: ultimos12.headcountInicio12Meses,
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
    // ME-B2-01b Q1=D — nota_clima do departamento via motor puro sob
    // demanda. Substitui o antigo `getClimaRowByLevel` (que lia da
    // tabela aposentada `climateEngagementData`).
    const climaCascata = await resolveClimateBlockComCascata(db, {
      companyId: args.companyId,
      escopo: 'departamento',
      escopoReferencia: dept,
      liderId: null,
      liderTipo: null,
      trimestre: args.trimestre,
    });
    // Apenas notas do proprio departamento contam aqui — cascata para
    // empresa nao entra na linha por departamento (semantica canonica
    // de "nota do departamento na tabela §7.4").
    const climaAcima = climaCascata.dadosDisponiveis && climaCascata.notaAgregacao === null;
    const notaClima = climaAcima ? climaCascata.payload.notaClima : null;
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
  // ME-1.3d-REV DIS-A — Opcao B canonica: lideres que lideram
  // colaboradores do departamento, independente do departamento do
  // proprio lider. Inclui C-levels (via `clevelId` em
  // `employeeLeaderHistory`). Carrega metainformacao canonica
  // (`tipoLider`, `departamentoDoLider`) para o template PDF renderizar
  // entre parenteses quando o lider for externo ao bloco.

  // 1. Colaboradores ativos do departamento no trimestre.
  const colaboradoresDoDepto = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, args.companyId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado no router
        eq(employees.departamento, departamento as any),
        eq(employees.status, 'ativo'),
      ),
    );
  const colaboradoresIds = colaboradoresDoDepto.map((r) => r.id);
  if (colaboradoresIds.length === 0) {
    return [];
  }

  // 2. Vinculos ativos de lideranca (dataFim IS NULL) desses colaboradores.
  //    Note: `employeeLeaderHistory` nao tem companyId direto; o filtro
  //    por companyId e feito via `colaboradoresIds` acima (ja restritos
  //    ao companyId da empresa). FK canonica: employeeId → employees.id.
  const vinculos = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .where(
      and(
        inArray(employeeLeaderHistory.employeeId, colaboradoresIds),
        isNull(employeeLeaderHistory.dataFim),
      ),
    );

  // 3. Agrupa liderados por lider (chave canonica: 'lider:<id>' ou 'clevel:<id>').
  const liderados = new Map<string, number[]>();
  for (const v of vinculos) {
    const key =
      v.liderId !== null
        ? `lider:${v.liderId}`
        : v.clevelId !== null
          ? `clevel:${v.clevelId}`
          : null;
    if (key === null) continue;
    const arr = liderados.get(key);
    if (arr === undefined) {
      liderados.set(key, [v.employeeId]);
    } else {
      arr.push(v.employeeId);
    }
  }
  if (liderados.size === 0) {
    return [];
  }

  // 4. Resolve nome + departamento canonico para cada lider.
  const liderIds: number[] = [];
  const clevelIds: number[] = [];
  for (const key of liderados.keys()) {
    const [tipo, idStr] = key.split(':');
    const id = Number.parseInt(idStr ?? '', 10);
    if (!Number.isFinite(id)) continue;
    if (tipo === 'lider') liderIds.push(id);
    else if (tipo === 'clevel') clevelIds.push(id);
  }

  const liderMeta = new Map<string, { nome: string; departamento: string | null }>();
  if (liderIds.length > 0) {
    const rows = await db
      .select({
        id: employees.id,
        name: employees.name,
        departamento: employees.departamento,
      })
      .from(employees)
      .where(and(eq(employees.companyId, args.companyId), inArray(employees.id, liderIds)));
    for (const r of rows) {
      liderMeta.set(`lider:${r.id}`, { nome: r.name, departamento: r.departamento });
    }
  }
  if (clevelIds.length > 0) {
    const rows = await db
      .select({ id: cLevelMembers.id, name: cLevelMembers.name })
      .from(cLevelMembers)
      .where(
        and(eq(cLevelMembers.companyId, args.companyId), inArray(cLevelMembers.id, clevelIds)),
      );
    for (const r of rows) {
      liderMeta.set(`clevel:${r.id}`, { nome: r.name, departamento: null });
    }
  }

  // 5. Monta as linhas canonicas de equipe com metainformacao Opcao B.
  const out: ExecReportEquipeLinha[] = [];
  for (const [key, lideradosIds] of liderados.entries()) {
    if (lideradosIds.length === 0) continue;
    const meta = liderMeta.get(key);
    if (meta === undefined) continue;
    const [tipo, idStr] = key.split(':');
    const id = Number.parseInt(idStr ?? '', 10);
    if (!Number.isFinite(id)) continue;
    const tipoLider: 'colaborador' | 'clevel' = tipo === 'clevel' ? 'clevel' : 'colaborador';
    const departamentoDoLider =
      tipoLider === 'clevel'
        ? 'C-level'
        : meta.departamento !== null && meta.departamento !== departamento
          ? meta.departamento
          : null;
    const desemp = await computeDesempenhoAgregado(
      db,
      args.companyId,
      args.trimestre,
      lideradosIds,
    );
    const plen = await computePlenitudeAgregado(db, args.companyId, args.trimestre, lideradosIds);
    out.push({
      liderId: id,
      liderNome: meta.nome,
      colaboradoresAtivos: lideradosIds.length,
      scoreDesempenhoMedio: desemp.scoreMedio,
      plenitudeScoreMedio: plen.plenitudeMedio,
      tipoLider,
      departamentoDoLider,
    });
  }
  return out;
}
