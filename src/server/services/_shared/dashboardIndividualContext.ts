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
// - D059: `detalhamento_variaveis`, `historico_4_trimestres`,
//   `dialogos_desenvolvimento_recentes` populados nesta ME com o
//   minimo canonico; refinamento em MEs futuras.

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import {
  employees,
  individualProfileAssessments,
  individualProfileScores,
  nineBoxClassifications,
  performanceQuarterlyData,
  plenitudeData,
} from '../../../db/schema';
import { getIqlDataByLiderQuarter } from '../iqlData';

import type {
  DashboardIndividualContextArgs,
  DashboardIndividualContextPayload,
  DashboardIndividualIdentificacao,
} from './dashboardContextTypes';

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
 * D059: `detalhamento_variaveis` array vazio; `historico_4_trimestres`
 * populado com os 4 registros mais recentes de
 * `performanceQuarterlyData` (leitura direta, sem enriquecimento);
 * `dialogos_desenvolvimento_recentes` array vazio (motor de
 * developmentDialogs por employee em ME futura).
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

  // 4. 9-Box — leitura direta do trimestre atual.
  const [latestNineBox] = latestQuarterly
    ? await db
        .select()
        .from(nineBoxClassifications)
        .where(
          and(
            eq(nineBoxClassifications.employeeId, args.employeeId),
            eq(nineBoxClassifications.trimestre, latestQuarterly.trimestre),
          ),
        )
        .limit(1)
    : [null];

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

  // 9. Composicao final canonica. Campos ausentes = null explicito
  //    (§8.3.1 nota final).
  const payload: DashboardIndividualContextPayload = {
    identificacao,
    trimestre_atual: deriveTrimestreAtual(latestQuarterly),
    eixo_x: {
      score_desempenho: num(latestQuarterly?.scoreDesempenho ?? null),
      indice_desempenho: num(latestQuarterly?.indiceDesempenho ?? null),
      detalhamento_variaveis: [],
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
        pertencimento: { a: null, c: null },
        realizacao: { a: null, c: null },
      },
    },
    capacidade_ociosa: {
      valor: num(latestQuarterly?.capacidadeOciosa ?? null),
      faixa: deriveCapacidadeOciosaFaixa(num(latestQuarterly?.capacidadeOciosa ?? null)),
    },
    assiduidade: null,
    financeiro: bloqueiaFinanceiro
      ? null
      : {
          roi_estimado: num(latestQuarterly?.roiEstimado ?? null),
          meta_roi: num(latestQuarterly?.metaROI ?? null),
          retorno_estimado: num(latestQuarterly?.retornoEstimado ?? null),
          perc_meta_atingida: num(latestQuarterly?.percMetaAtingida ?? null),
        },
    '9box': {
      quadrante: (latestNineBox as { quadrante?: string | null } | null)?.quadrante ?? null,
      // D059: `dx`/`dy` numericos do movimento (§5.5) exigem motor de
      // classificacao de movimento nao presente no MVP. `direcaoMovimento`
      // e enum ('subiu', 'desceu', 'lateral', ...); a conversao canonica
      // para (dx, dy) numericos e materia de ME futura.
      dx: null,
      dy: null,
    },
    iql: iqlBlock,
    historico_4_trimestres: quarterlyRows.map((row) => ({
      trimestre: row.trimestre,
      score_desempenho: num(row.scoreDesempenho),
      capacidade_ociosa: num(row.capacidadeOciosa),
      perc_meta_atingida: num(row.percMetaAtingida),
    })),
    dialogos_desenvolvimento_recentes: [],
  };

  if (perfilBlock !== undefined) {
    payload.perfil_individual = perfilBlock;
  }

  return payload;
}
