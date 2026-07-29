// ROIP APP 9BOX — loader canonico do contexto do dashboard individual
// (ME-052, S268).
//
// Composicao do payload §8.3.1 do DOC 04, com aplicacao integral das
// regras §5.3 (extensao perfil_individual condicional), §5.5 (campos
// canonicos do nivel individual) e §5.6 (bloqueios de campo por
// permissao).
//
// Reuso canonico (§6.2 do DOC 04): o Diagnostico IA usa contexto
// IDENTICO ao Chat IA individual. Este loader e a fonte unica.
//
// Regras invioláveis desta ME:
// - RV-12: 100% Drizzle tipado; zero SQL cru.
// - RV-13: consumido por `aiChatService` (level=individual) e por
//   `diagnosticoIAService`. Testes unit em
//   `tests/unit/dashboardContext.test.ts`.
// - L87: schema `individualProfileScores` e snake_case; leitura via
//   service `individualProfileScores.getIndividualProfileScoreById`.
//   Schema `performanceQuarterlyData` e camelCase (verificado em
//   `tables.ts`).
// - §8.3.1 nota final: campos ausentes recebem `null` explicito.
// - D059 (FECHADO na ME-054): `detalhamento_variaveis` (join
//   performanceVariableData x employeeGoals do mes mais recente com
//   dados do trimestre), `historico_4_trimestres` enriquecido
//   (plenitude, quadrante, assiduidade, financeiro),
//   `dialogos_desenvolvimento_recentes` (developmentDialogs nao
//   arquivados), `dx`/`dy` (delta ordinal de posicao 9-Box vs
//   trimestre anterior — pre-canonizacao ME-054), `assiduidade`
//   (media de performanceData.assiduidade dos meses do trimestre —
//   DOC 03 §2 Passo 1) e dimensoes pertencimento/realizacao do
//   eixo Y.

import { and, desc, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import {
  developmentDialogs,
  employeeGoals,
  employees,
  individualProfileAssessments,
  individualProfileScores,
  nineBoxClassifications,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
  plenitudeData,
} from '../../../db/schema';
import { getIqlDataByLiderQuarter } from '../iqlData';

import type {
  DashboardIndividualContextArgs,
  DashboardIndividualContextPayload,
  DashboardIndividualIdentificacao,
} from './dashboardContextTypes';
import { mediaDosPresentes, mesesDoTrimestre } from './dashboardPeriods';

// ============================================================
// Helpers de conversao numerica canonica
// ============================================================

/**
 * Converte string decimal do MySQL para `number | null`. Colunas
 * `decimal` no Drizzle mysql2 retornam string; ha uma conversao
 * canonica em toda a camada de dashboard.
 */
function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Deriva a faixa canonica de capacidade ociosa (§3.5 do DOC 03) a
 * partir do valor decimal 0-100. Faixas canonicas: `baixa` (< 40),
 * `adequada` (40-70), `elevada` (> 70).
 */
function deriveCapacidadeOciosaFaixa(
  valor: number | null,
): 'baixa' | 'adequada' | 'elevada' | null {
  if (valor === null || Number.isNaN(valor)) {
    return null;
  }
  if (valor < 40) return 'baixa';
  if (valor <= 70) return 'adequada';
  return 'elevada';
}

/**
 * Deriva o trimestre canonico YYYY-QN a partir de uma linha de
 * `performanceQuarterlyData`. Retorna `null` quando nao ha linha.
 */
function deriveTrimestreAtual(latestQuarterly: { trimestre: string } | null): string | null {
  if (latestQuarterly === null) {
    return null;
  }
  return latestQuarterly.trimestre;
}

// ============================================================
// Detectores canonicos de bloqueio (§5.6)
// ============================================================

/**
 * Detecta bloqueio canonico do bloco financeiro (§5.6): financeiro
 * omitido do contexto quando o usuario logado e lider da pessoa em
 * questao. Bruno, RH, RH-Lider e C-level nunca bloqueiam.
 *
 * Regra canonica minimalista nesta ME: `role === 'lider'` bloqueia.
 * Cadeia direta de liderado nao muda o bloqueio (o preambulo canonico
 * do DOC 04 §5.6 e "quando o usuario logado E LIDER" — nao "quando
 * lidera a pessoa em questao"). A subordinacao direta ja e checada
 * antes deste loader, na proc do router.
 */
function shouldBlockFinanceiro(viewerRole: DashboardIndividualContextArgs['viewerRole']): boolean {
  return viewerRole === 'lider';
}

/**
 * Detecta autovisualizacao canonica (§5.6): bloqueio absoluto de IQL
 * quando o usuario logado e o proprio colaborador visualizado. Somente
 * relevante quando `viewerUserType === 'employee'` (super_admin nao
 * tem employee id; C-level e outra tabela).
 */
function isAutoVisualizacao(args: DashboardIndividualContextArgs): boolean {
  if (args.viewerUserType !== 'employee') {
    return false;
  }
  return args.viewerUserId === args.employeeId;
}

// ============================================================
// Composicao canonica do bloco `perfil_individual` (§5.3)
// ============================================================

interface PerfilIndividualBlockInput {
  db: RoipDatabase;
  employeeId: number;
  companyId: number;
}

/**
 * Compoe o bloco `perfil_individual` do contexto §5.3, ou retorna
 * `null` quando qualquer uma das 3 condicoes canonicas nao e
 * atendida:
 *   1. Assessment com `status = 'enviado'` na tentativa mais recente.
 *   2. `individualProfileScores` com todos os campos preenchidos.
 *   3. Permissao canonica PC1e — resolvida na proc do router, nao
 *      aqui (este loader ja opera sob a assuncao de que a permissao
 *      foi verificada).
 *
 * L87 respeitado: campos snake_case (`post_assert`, `mot_maestria`,
 * etc.). Retorno em nomenclatura executiva canonica §5.3.
 */
async function composePerfilIndividualBlock(
  input: PerfilIndividualBlockInput,
): Promise<DashboardIndividualContextPayload['perfil_individual']> {
  // Assessment mais recente com status 'enviado' (§5.3 condicao 1).
  const [assessmentRow] = await input.db
    .select({
      id: individualProfileAssessments.id,
      confiabilidadeNivel: individualProfileAssessments.confiabilidadeNivel,
      status: individualProfileAssessments.status,
    })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, input.companyId),
        eq(individualProfileAssessments.userId, input.employeeId),
        eq(individualProfileAssessments.userType, 'employee'),
        eq(individualProfileAssessments.status, 'enviado'),
      ),
    )
    .orderBy(desc(individualProfileAssessments.tentativa))
    .limit(1);

  if (!assessmentRow) {
    return undefined;
  }

  // Confiabilidade `baixa` bloqueia canonicamente (§3.6). O loader
  // aceita apenas `alta` ou `moderada`.
  if (
    assessmentRow.confiabilidadeNivel !== 'alta' &&
    assessmentRow.confiabilidadeNivel !== 'moderada'
  ) {
    return undefined;
  }

  // Score correspondente ao assessment (§5.3 condicao 2). Se nao
  // existe linha em `individualProfileScores`, o pacote nao esta
  // materializado — omite silenciosamente.
  const [scoreRow] = await input.db
    .select()
    .from(individualProfileScores)
    .where(eq(individualProfileScores.assessmentId, assessmentRow.id))
    .limit(1);

  if (!scoreRow) {
    return undefined;
  }

  const flagsObj = (scoreRow.flags as Record<string, boolean> | null) ?? {};
  const flagsAtivas = Object.entries(flagsObj)
    .filter(([, value]) => value === true)
    .map(([key]) => key);

  const top3 = Array.isArray(scoreRow.top3Assinatura) ? (scoreRow.top3Assinatura as string[]) : [];

  return {
    disponivel: true,
    confiabilidade: assessmentRow.confiabilidadeNivel,
    dimensoes_afetadas_por_hedge: assessmentRow.confiabilidadeNivel === 'moderada' ? [] : null,
    escores: {
      postura: {
        assertividade_ritmo_decisao: num(scoreRow.post_assert),
        orientacao_tarefas: num(scoreRow.post_tarefas),
        orientacao_pessoas: num(scoreRow.post_pessoas),
        comportamento_sob_pressao: num(scoreRow.post_pressao),
      },
      estrutura: {
        abertura_experiencia: num(scoreRow.est_abert),
        disciplina_autogestao: num(scoreRow.est_disc),
        extroversao: num(scoreRow.est_ext),
        amabilidade: num(scoreRow.est_amab),
        estabilidade_emocional: num(scoreRow.est_estab),
      },
      motor: {
        maestria: num(scoreRow.mot_maestria),
        lideranca: num(scoreRow.mot_lideranca),
        autonomia: num(scoreRow.mot_autonomia),
        seguranca: num(scoreRow.mot_seguranca),
        proposito: num(scoreRow.mot_proposito),
      },
      equilibrio: {
        autoconsciencia: num(scoreRow.equ_autocons),
        autogestao: num(scoreRow.equ_autogest),
        leitura_do_outro: num(scoreRow.equ_leitura),
        influencia_conducao: num(scoreRow.equ_influencia),
        indice_geral: num(scoreRow.equ_indice),
      },
      assinatura: {
        sabedoria: num(scoreRow.ass_sabed),
        coragem: num(scoreRow.ass_coragem),
        humanidade: num(scoreRow.ass_humanid),
        justica: num(scoreRow.ass_justica),
        temperanca: num(scoreRow.ass_temper),
        transcendencia: num(scoreRow.ass_transc),
      },
    },
    perfil_comportamental: scoreRow.perfilComportamental,
    motor_hierarquia: {
      dominante: scoreRow.vetorDominante,
      sustentacao: scoreRow.vetorSustentacao,
      negligenciado: scoreRow.vetorNegligenciado,
    },
    top_3_assinatura: top3,
    flags_ativas: flagsAtivas,
  };
}

// ============================================================
// Composicao canonica do bloco IQL (§5.6 IQL autovisualizacao)
// ============================================================

interface IqlBlockInput {
  db: RoipDatabase;
  companyId: number;
  employeeId: number;
  isLider: boolean;
  trimestre: string | null;
  autoVisualizacao: boolean;
}

/**
 * Compoe o bloco `iql` do contexto §5.5 individual + §5.6 bloqueios:
 *   - Colaborador nao e lider → `null`.
 *   - Autovisualizacao (usuario ve o proprio dashboard) → `null`.
 *   - Menos de 3 respondentes → `null` (piso canonico F3B §5).
 *   - Sem trimestre ou sem linha → `null`.
 */
async function composeIqlBlock(
  input: IqlBlockInput,
): Promise<DashboardIndividualContextPayload['iql']> {
  if (!input.isLider || input.autoVisualizacao || input.trimestre === null) {
    return null;
  }
  const row = await getIqlDataByLiderQuarter(
    input.db,
    input.companyId,
    input.employeeId,
    input.trimestre,
  );
  if (!row) {
    return null;
  }
  const respondentesRaw = (row as { countRespondentes?: number | null }).countRespondentes ?? null;
  const respondentes = typeof respondentesRaw === 'number' ? respondentesRaw : 0;
  if (respondentes < 3) {
    return null;
  }
  const iqlValor = num((row as { iql?: string | null }).iql ?? null);
  return {
    iql: iqlValor,
    count_respondentes: respondentes,
    por_dimensao: {
      direcionamento_clareza: num(
        (row as { scoreDirecionamentoClareza?: string | null }).scoreDirecionamentoClareza ?? null,
      ),
      desenvolvimento_apoio: num(
        (row as { scoreDesenvolvimentoApoio?: string | null }).scoreDesenvolvimentoApoio ?? null,
      ),
      relacionamento_confianca: num(
        (row as { scoreRelacionamentoConfianca?: string | null }).scoreRelacionamentoConfianca ??
          null,
      ),
      gestao_resultados: num(
        (row as { scoreGestaoResultados?: string | null }).scoreGestaoResultados ?? null,
      ),
    },
  };
}

// ============================================================
// Composicao canonica da identificacao (§8.3.1 identificacao)
// ============================================================

interface IdentificacaoInput {
  db: RoipDatabase;
  employeeId: number;
}

async function composeIdentificacao(
  input: IdentificacaoInput,
): Promise<DashboardIndividualIdentificacao | null> {
  const [row] = await input.db
    .select({
      name: employees.name,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      jobFamily: employees.jobFamily,
      nivelHierarquico: employees.nivelHierarquico,
      senioridade: employees.senioridade,
      dataAdmissao: employees.dataAdmissao,
    })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!row) {
    return null;
  }
  const tempoEmpresa = row.dataAdmissao
    ? (() => {
        const admissao = new Date(row.dataAdmissao);
        const meses = (Date.now() - admissao.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return `${Math.max(0, Math.floor(meses))} meses`;
      })()
    : 'nao_disponivel';
  return {
    nome: row.name,
    cargo: row.descricaoCBO ?? '',
    departamento: row.departamento ?? '',
    familia_funcao: row.jobFamily ?? '',
    nivel_hierarquico:
      (row.nivelHierarquico as 'operacional' | 'tatico' | 'estrategico') ?? 'operacional',
    senioridade: row.senioridade ?? '',
    tempo_empresa: tempoEmpresa,
    // Lider direto real exige JOIN com `employeeLeaderHistory`
    // (D### aberto na ME-050/51). Nesta ME, string vazia canonica.
    lider_direto: '',
  };
}

// ============================================================
// Motores de enriquecimento canonico (ME-054 — fecha D059)
// ============================================================

/**
 * Posicao ordinal canonica dos eixos 9-Box (pre-canonizacao ME-054):
 * baixo/baixa = 0, medio/media = 1, alto/alta = 2.
 */
const POSICAO_X_ORDINAL: Record<'baixo' | 'medio' | 'alto', number> = {
  baixo: 0,
  medio: 1,
  alto: 2,
};
const POSICAO_Y_ORDINAL: Record<'baixa' | 'media' | 'alta', number> = {
  baixa: 0,
  media: 1,
  alta: 2,
};

/**
 * Deriva `dx`/`dy` canonicos: delta ordinal da posicao atual vs a do
 * trimestre imediatamente anterior na serie de classificacoes do
 * colaborador. `null` sem registro anterior.
 */
function deriveDxDy(
  atual: { posicaoX: 'baixo' | 'medio' | 'alto'; posicaoY: 'baixa' | 'media' | 'alta' } | null,
  anterior: { posicaoX: 'baixo' | 'medio' | 'alto'; posicaoY: 'baixa' | 'media' | 'alta' } | null,
): { dx: number | null; dy: number | null } {
  if (atual === null || anterior === null) {
    return { dx: null, dy: null };
  }
  return {
    dx: POSICAO_X_ORDINAL[atual.posicaoX] - POSICAO_X_ORDINAL[anterior.posicaoX],
    dy: POSICAO_Y_ORDINAL[atual.posicaoY] - POSICAO_Y_ORDINAL[anterior.posicaoY],
  };
}

/**
 * Detalhamento canonico por variavel (§8.3.1 eixo_x): join de
 * `performanceVariableData` (mes mais recente com dados do trimestre
 * atual) com `employeeGoals` (nome e meta por `variableIndex`).
 * `percentual` = razao do motor Eixo X (0-1.5) convertida a 0-100.
 */
async function composeDetalhamentoVariaveis(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string | null,
): Promise<DashboardIndividualContextPayload['eixo_x']['detalhamento_variaveis']> {
  if (trimestre === null) {
    return [];
  }
  const meses = mesesDoTrimestre(trimestre);
  if (meses.length === 0) {
    return [];
  }
  const [ultimoMesComDados] = await db
    .select({ id: performanceData.id })
    .from(performanceData)
    .where(and(eq(performanceData.employeeId, employeeId), inArray(performanceData.mes, meses)))
    .orderBy(desc(performanceData.mes))
    .limit(1);
  if (!ultimoMesComDados) {
    return [];
  }
  const variaveis = await db
    .select({
      variableIndex: performanceVariableData.variableIndex,
      demanda: performanceVariableData.demanda,
      executado: performanceVariableData.executado,
      desempenho: performanceVariableData.desempenho,
      peso: performanceVariableData.peso,
    })
    .from(performanceVariableData)
    .where(eq(performanceVariableData.performanceDataId, ultimoMesComDados.id))
    .orderBy(performanceVariableData.variableIndex);
  if (variaveis.length === 0) {
    return [];
  }
  const goals = await db
    .select({
      variableIndex: employeeGoals.variableIndex,
      variableName: employeeGoals.variableName,
      goal: employeeGoals.goal,
    })
    .from(employeeGoals)
    .where(eq(employeeGoals.employeeId, employeeId));
  const goalByIndex = new Map(goals.map((g) => [g.variableIndex, g]));
  return variaveis.map((v) => {
    const goal = goalByIndex.get(v.variableIndex);
    const razao = num(v.desempenho);
    return {
      nome: goal?.variableName ?? `Variável ${v.variableIndex}`,
      meta: num(goal?.goal ?? null),
      demanda: num(v.demanda),
      executado: num(v.executado),
      percentual: razao === null ? null : Math.round(razao * 100 * 100) / 100,
      peso: num(v.peso),
    };
  });
}

/**
 * Assiduidade canonica do trimestre (DOC 03 §2 Passo 1): media de
 * `performanceData.assiduidade` dos meses do trimestre com dado
 * presente. `null` sem dados.
 */
async function composeAssiduidadeTrimestre(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string | null,
): Promise<number | null> {
  if (trimestre === null) {
    return null;
  }
  const meses = mesesDoTrimestre(trimestre);
  if (meses.length === 0) {
    return null;
  }
  const rows = await db
    .select({ assiduidade: performanceData.assiduidade })
    .from(performanceData)
    .where(and(eq(performanceData.employeeId, employeeId), inArray(performanceData.mes, meses)));
  return mediaDosPresentes(rows.map((r) => num(r.assiduidade)));
}

/** Corte canonico de dialogos recentes no contexto (ME-054). */
const DIALOGOS_RECENTES_CAP = 10;

/**
 * Dialogos de Desenvolvimento recentes (§8.3.1): nao arquivados do
 * colaborador, mais recentes primeiro, cap defensivo de 10.
 */
async function composeDialogosRecentes(
  db: RoipDatabase,
  employeeId: number,
): Promise<DashboardIndividualContextPayload['dialogos_desenvolvimento_recentes']> {
  const rows = await db
    .select({
      titulo: developmentDialogs.titulo,
      status: developmentDialogs.status,
      pendencia: developmentDialogs.pendencia,
      createdAt: developmentDialogs.createdAt,
    })
    .from(developmentDialogs)
    .where(
      and(eq(developmentDialogs.employeeId, employeeId), eq(developmentDialogs.arquivado, false)),
    )
    .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id))
    .limit(DIALOGOS_RECENTES_CAP);
  return rows.map((row) => ({
    titulo: row.titulo ?? '',
    created_at: row.createdAt.toISOString().slice(0, 10),
    status: row.status,
    pendencia: row.pendencia,
  }));
}

// ============================================================
// Entry point canonico do loader
// ============================================================

/**
 * Compoe o payload canonico §8.3.1 do dashboard individual do
 * colaborador identificado por `employeeId`. Aplica bloqueios §5.6
 * e extensao §5.3 conforme argumentos. Retorna `null` se o
 * colaborador nao existe.
 *
 * Bloqueios canonicos aplicados:
 *   - `financeiro` = null quando `viewerRole === 'lider'`.
 *   - `iql` = null em autovisualizacao ou nao-lider ou < 3
 *     respondentes.
 *   - `perfil_individual` omitido (undefined) se §5.3 nao atende.
 *
 * ME-054 (fecha D059): `detalhamento_variaveis`, historico
 * enriquecido, dialogos recentes, dx/dy, assiduidade e dimensoes
 * pertencimento/realizacao populados pelos motores desta ME.
 */
export async function loadDashboardIndividualContext(
  db: RoipDatabase,
  args: DashboardIndividualContextArgs,
): Promise<DashboardIndividualContextPayload | null> {
  // 1. Identificacao (bloco obrigatorio; ausencia = colaborador nao
  //    existe → retorno null propagado ao caller).
  const identificacao = await composeIdentificacao({
    db,
    employeeId: args.employeeId,
  });
  if (identificacao === null) {
    return null;
  }

  // 2. Ultima linha de `performanceQuarterlyData` para o trimestre
  //    atual + eixo X + capacidade ociosa + financeiro. Todos os
  //    campos em camelCase (verificado em `tables.ts`).
  const historicoLimit = 4;
  const quarterlyRows = await db
    .select()
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.employeeId, args.employeeId))
    .orderBy(desc(performanceQuarterlyData.trimestre))
    .limit(historicoLimit);
  const latestQuarterly = quarterlyRows[0] ?? null;

  // 3. Eixo Y (plenitude) — leitura direta do trimestre atual.
  const [latestPlenitude] = latestQuarterly
    ? await db
        .select()
        .from(plenitudeData)
        .where(
          and(
            eq(plenitudeData.employeeId, args.employeeId),
            eq(plenitudeData.trimestre, latestQuarterly.trimestre),
          ),
        )
        .limit(1)
    : [null];

  // 4. 9-Box — atual + trimestre imediatamente anterior na serie
  //    (ME-054: fonte do dx/dy ordinal).
  const nineBoxSerie = await db
    .select({
      trimestre: nineBoxClassifications.trimestre,
      quadrante: nineBoxClassifications.quadrante,
      posicaoX: nineBoxClassifications.posicaoX,
      posicaoY: nineBoxClassifications.posicaoY,
    })
    .from(nineBoxClassifications)
    .where(eq(nineBoxClassifications.employeeId, args.employeeId))
    .orderBy(desc(nineBoxClassifications.trimestre))
    .limit(2);
  const latestNineBox =
    latestQuarterly && nineBoxSerie[0]?.trimestre === latestQuarterly.trimestre
      ? nineBoxSerie[0]
      : null;
  const previousNineBox = latestNineBox ? (nineBoxSerie[1] ?? null) : null;
  const dxDy = deriveDxDy(latestNineBox, previousNineBox);

  // 5. Detectores canonicos (§5.6).
  const bloqueiaFinanceiro = shouldBlockFinanceiro(args.viewerRole);
  const autoVisualizacao = isAutoVisualizacao(args);

  // 6. Checagem canonica de "is_lider" para o bloco IQL.
  const [empIsLider] = await db
    .select({ isLider: employees.isLider })
    .from(employees)
    .where(eq(employees.id, args.employeeId))
    .limit(1);
  const isLider = empIsLider?.isLider === true;

  // 7. Bloco IQL condicional.
  const iqlBlock = await composeIqlBlock({
    db,
    companyId: args.companyId,
    employeeId: args.employeeId,
    isLider,
    trimestre: latestQuarterly?.trimestre ?? null,
    autoVisualizacao,
  });

  // 8. Bloco perfil_individual condicional (§5.3).
  const perfilBlock = await composePerfilIndividualBlock({
    db,
    employeeId: args.employeeId,
    companyId: args.companyId,
  });

  // 8b. Motores de enriquecimento ME-054 (fecha D059).
  const trimestreAtualStr = deriveTrimestreAtual(latestQuarterly);
  const detalhamentoVariaveis = await composeDetalhamentoVariaveis(
    db,
    args.employeeId,
    trimestreAtualStr,
  );
  const assiduidadeAtual = await composeAssiduidadeTrimestre(
    db,
    args.employeeId,
    trimestreAtualStr,
  );
  const dialogosRecentes = await composeDialogosRecentes(db, args.employeeId);

  // 8c. Historico enriquecido (§8.3.1): plenitude, quadrante,
  //     assiduidade e financeiro por trimestre da serie.
  const trimestresHistorico = quarterlyRows.map((row) => row.trimestre);
  const plenitudeHistorico =
    trimestresHistorico.length === 0
      ? []
      : await db
          .select({
            trimestre: plenitudeData.trimestre,
            plenitudeScore: plenitudeData.plenitudeScore,
          })
          .from(plenitudeData)
          .where(
            and(
              eq(plenitudeData.employeeId, args.employeeId),
              inArray(plenitudeData.trimestre, trimestresHistorico),
            ),
          );
  const plenitudePorTrimestre = new Map(
    plenitudeHistorico.map((row) => [row.trimestre, num(row.plenitudeScore)]),
  );
  const nineBoxHistorico =
    trimestresHistorico.length === 0
      ? []
      : await db
          .select({
            trimestre: nineBoxClassifications.trimestre,
            quadrante: nineBoxClassifications.quadrante,
          })
          .from(nineBoxClassifications)
          .where(
            and(
              eq(nineBoxClassifications.employeeId, args.employeeId),
              inArray(nineBoxClassifications.trimestre, trimestresHistorico),
            ),
          );
  const quadrantePorTrimestre = new Map(
    nineBoxHistorico.map((row) => [row.trimestre, row.quadrante as string]),
  );
  const assiduidadePorTrimestre = new Map<string, number | null>();
  for (const trimestre of trimestresHistorico) {
    assiduidadePorTrimestre.set(
      trimestre,
      await composeAssiduidadeTrimestre(db, args.employeeId, trimestre),
    );
  }

  // 9. Composicao final canonica. Campos ausentes = null explicito
  //    (§8.3.1 nota final).
  const payload: DashboardIndividualContextPayload = {
    identificacao,
    trimestre_atual: deriveTrimestreAtual(latestQuarterly),
    eixo_x: {
      score_desempenho: num(latestQuarterly?.scoreDesempenho ?? null),
      indice_desempenho: num(latestQuarterly?.indiceDesempenho ?? null),
      detalhamento_variaveis: detalhamentoVariaveis,
    },
    eixo_y: {
      plenitude_score: num(
        (latestPlenitude as { plenitudeScore?: string | null } | null)?.plenitudeScore ?? null,
      ),
      score_a: num((latestPlenitude as { scoreA?: string | null } | null)?.scoreA ?? null),
      score_c: num((latestPlenitude as { scoreC?: string | null } | null)?.scoreC ?? null),
      alerta_divergencia:
        (latestPlenitude as { alertaDivergencia?: boolean } | null)?.alertaDivergencia === true,
      magnitude_divergencia: num(
        (latestPlenitude as { divergencia?: string | null } | null)?.divergencia ?? null,
      ),
      por_dimensao: {
        engajamento: {
          a: num(
            (latestPlenitude as { engajamentoA?: string | null } | null)?.engajamentoA ?? null,
          ),
          c: num(
            (latestPlenitude as { engajamentoC?: string | null } | null)?.engajamentoC ?? null,
          ),
        },
        desenvolvimento: {
          a: num(
            (
              latestPlenitude as {
                desenvolvimentoA?: string | null;
              } | null
            )?.desenvolvimentoA ?? null,
          ),
          c: num(
            (
              latestPlenitude as {
                desenvolvimentoC?: string | null;
              } | null
            )?.desenvolvimentoC ?? null,
          ),
        },
        pertencimento: {
          a: num(
            (latestPlenitude as { pertencimentoA?: string | null } | null)?.pertencimentoA ?? null,
          ),
          c: num(
            (latestPlenitude as { pertencimentoC?: string | null } | null)?.pertencimentoC ?? null,
          ),
        },
        realizacao: {
          a: num((latestPlenitude as { realizacaoA?: string | null } | null)?.realizacaoA ?? null),
          c: num((latestPlenitude as { realizacaoC?: string | null } | null)?.realizacaoC ?? null),
        },
      },
    },
    capacidade_ociosa: {
      valor: num(latestQuarterly?.capacidadeOciosa ?? null),
      faixa: deriveCapacidadeOciosaFaixa(num(latestQuarterly?.capacidadeOciosa ?? null)),
    },
    assiduidade: assiduidadeAtual,
    financeiro: bloqueiaFinanceiro
      ? null
      : {
          roi_estimado: num(latestQuarterly?.roiEstimado ?? null),
          meta_roi: num(latestQuarterly?.metaROI ?? null),
          retorno_estimado: num(latestQuarterly?.retornoEstimado ?? null),
          perc_meta_atingida: num(latestQuarterly?.percMetaAtingida ?? null),
        },
    '9box': {
      quadrante: latestNineBox?.quadrante ?? null,
      // ME-054 (fecha D059): delta ordinal de posicao vs trimestre
      // anterior (pre-canonizacao — baixo/baixa=0, medio/media=1,
      // alto/alta=2). `null` sem registro anterior.
      dx: dxDy.dx,
      dy: dxDy.dy,
    },
    iql: iqlBlock,
    historico_4_trimestres: quarterlyRows.map((row) => ({
      trimestre: row.trimestre,
      score_desempenho: num(row.scoreDesempenho),
      plenitude_score: plenitudePorTrimestre.get(row.trimestre) ?? null,
      quadrante: quadrantePorTrimestre.get(row.trimestre) ?? null,
      perc_meta_atingida: num(row.percMetaAtingida),
      capacidade_ociosa: num(row.capacidadeOciosa),
      assiduidade: assiduidadePorTrimestre.get(row.trimestre) ?? null,
      // Bloqueio canonico §5.6: sem financeiro por linha para lider.
      financeiro: bloqueiaFinanceiro ? null : { roi_estimado: num(row.roiEstimado) },
    })),
    dialogos_desenvolvimento_recentes: dialogosRecentes,
  };

  if (perfilBlock !== undefined) {
    payload.perfil_individual = perfilBlock;
  }

  return payload;
}
