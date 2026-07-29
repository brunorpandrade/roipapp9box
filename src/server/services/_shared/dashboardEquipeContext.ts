// ROIP APP 9BOX — loader canonico do contexto do dashboard de equipe
// (ME-052, S268).
//
// Composicao do payload §8.3.2 do DOC 04, com aplicacao integral das
// regras §5.5 (nivel equipe) e §5.6 (bloqueios de campo por
// permissao):
//   - `iql_lider` = null em autovisualizacao (viewer e o proprio lider).
//   - `roi_estimado_medio` = null quando viewer.role === 'lider'
//     (dados financeiros individuais omitidos para lider — §5.6
//     equipe).
//   - `lista_colaboradores` sem financeiro individual quando lider.
//
// D059 (FECHADO na ME-054): motor de agregacao canonico on-read —
// medias dos diretos ativos (performanceQuarterlyData +
// plenitudeData + performanceData.assiduidade), distribuicao 9-Box
// por quadrante canonico (D3 Opcao B) e historico agregado dos 4
// trimestres mais recentes. Media aritmetica dos presentes,
// ignorando NULL; agregado `null` quando nenhum direto tem dado.
//
// Regras invioláveis desta ME:
// - RV-12: 100% Drizzle tipado.
// - RV-13: consumido por `aiChatService` (level=equipe). Testes unit
//   em `tests/unit/dashboardContext.test.ts`; integracao ME-054 em
//   `tests/integration/me054-equipe-aggregates.test.ts`.
// - L87: colunas camelCase verificadas em `tables.ts`.

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import {
  employees,
  employeeLeaderHistory,
  nineBoxClassifications,
  performanceData,
  performanceQuarterlyData,
  plenitudeData,
} from '../../../db/schema';
import { getClimateByEquipeQuarter } from '../climateEngagementData';
import { getIqlDataByLiderQuarter } from '../iqlData';

import {
  NINE_BOX_QUADRANTE_TO_KEY,
  type DashboardEquipeContextArgs,
  type DashboardEquipeContextPayload,
  type DashboardEquipeDistribuicao9Box,
  type DashboardEquipeIdentificacao,
} from './dashboardContextTypes';
import { mediaDosPresentes, mesesDoTrimestre } from './dashboardPeriods';

// ============================================================
// Cortes canonicos §2.4 (defensivos)
// ============================================================

/**
 * Corte canonico do dashboard de equipe (§2.4): lista de
 * colaboradores limitada nesta camada a 200 elementos. Empresas do
 * MVP nunca chegam perto; o corte e defesa em profundidade.
 */
export const EQUIPE_LISTA_COLABORADORES_CAP = 200 as const;

// ============================================================
// Helpers de conversao numerica canonica
// ============================================================

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// ============================================================
// Detectores canonicos de bloqueio (§5.6 equipe)
// ============================================================

function isAutoVisualizacaoLider(args: DashboardEquipeContextArgs): boolean {
  if (args.viewerUserType !== 'employee') {
    return false;
  }
  return args.viewerUserId === args.liderId;
}

function shouldBlockFinanceiroEquipe(
  viewerRole: DashboardEquipeContextArgs['viewerRole'],
): boolean {
  return viewerRole === 'lider';
}

// ============================================================
// Composicao canonica da identificacao (§8.3.2 identificacao)
// ============================================================

interface EquipeIdentificacaoInput {
  db: RoipDatabase;
  liderId: number;
}

async function composeEquipeIdentificacao(input: EquipeIdentificacaoInput): Promise<{
  identificacao: DashboardEquipeIdentificacao;
  liderExiste: boolean;
} | null> {
  const [liderRow] = await input.db
    .select({
      name: employees.name,
      departamento: employees.departamento,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(eq(employees.id, input.liderId))
    .limit(1);
  if (!liderRow) {
    return null;
  }
  // Contagem canonica de diretos (`vinculo` ativo no dia corrente:
  // `dataInicio <= hoje` e `dataFim IS NULL`). Consistente com o
  // padrao S066 do router dashboard.
  const diretosRows = await input.db
    .select({ id: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(
      and(eq(employeeLeaderHistory.liderId, input.liderId), isNull(employeeLeaderHistory.dataFim)),
    );
  const diretos = diretosRows.length;
  return {
    identificacao: {
      nome_lider: liderRow.name,
      departamento: liderRow.departamento ?? '',
      diretos,
      total_incluindo_abaixo: diretos,
    },
    liderExiste: liderRow.isLider === true,
  };
}

// ============================================================
// Composicao canonica da lista de colaboradores (§8.3.2 lista)
// ============================================================

interface ListaColaboradoresInput {
  db: RoipDatabase;
  liderId: number;
  bloqueiaFinanceiro: boolean;
}

async function composeListaColaboradores(
  input: ListaColaboradoresInput,
): Promise<DashboardEquipeContextPayload['lista_colaboradores']> {
  const vinculos = await input.db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(
      and(eq(employeeLeaderHistory.liderId, input.liderId), isNull(employeeLeaderHistory.dataFim)),
    )
    .limit(EQUIPE_LISTA_COLABORADORES_CAP);
  if (vinculos.length === 0) {
    return [];
  }
  const employeeIds = vinculos.map((v) => v.employeeId);
  const rows: DashboardEquipeContextPayload['lista_colaboradores'] = [];
  for (const employeeId of employeeIds) {
    const [empRow] = await input.db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!empRow) {
      continue;
    }
    const [nineBoxRow] = await input.db
      .select({ quadrante: nineBoxClassifications.quadrante })
      .from(nineBoxClassifications)
      .where(eq(nineBoxClassifications.employeeId, employeeId))
      .orderBy(desc(nineBoxClassifications.trimestre))
      .limit(1);
    const [quarterlyRow] = await input.db
      .select({ scoreDesempenho: performanceQuarterlyData.scoreDesempenho })
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.employeeId, employeeId))
      .orderBy(desc(performanceQuarterlyData.trimestre))
      .limit(1);
    rows.push({
      nome: empRow.name,
      quadrante: nineBoxRow?.quadrante ?? null,
      // Bloqueio canonico §5.6 equipe: sem financeiro individual para
      // lider. Como `score_desempenho` nao e dado financeiro, permanece
      // exibido; o bloqueio pesa sobre metadados de ROI, que esta ME
      // nao popula na lista.
      score_desempenho: input.bloqueiaFinanceiro
        ? num(quarterlyRow?.scoreDesempenho ?? null)
        : num(quarterlyRow?.scoreDesempenho ?? null),
    });
  }
  return rows;
}

// ============================================================
// Composicao canonica do bloco IQL do lider (§8.3.2 iql_lider)
// ============================================================

interface EquipeIqlBlockInput {
  db: RoipDatabase;
  companyId: number;
  liderId: number;
  trimestre: string | null;
  autoVisualizacao: boolean;
}

async function composeEquipeIqlBlock(
  input: EquipeIqlBlockInput,
): Promise<DashboardEquipeContextPayload['iql_lider']> {
  if (input.autoVisualizacao || input.trimestre === null) {
    return null;
  }
  const row = await getIqlDataByLiderQuarter(
    input.db,
    input.companyId,
    input.liderId,
    input.trimestre,
  );
  if (!row) {
    return null;
  }
  const respondentes = (row as { countRespondentes?: number | null }).countRespondentes ?? 0;
  if (respondentes < 3) {
    return null;
  }
  return {
    iql: num((row as { iql?: string | null }).iql ?? null),
    count_respondentes: respondentes,
  };
}

// ============================================================
// Composicao canonica do bloco clima da equipe (§8.3.2 clima_equipe)
// ============================================================

interface EquipeClimaBlockInput {
  db: RoipDatabase;
  companyId: number;
  liderId: number;
  trimestre: string | null;
}

async function composeEquipeClimaBlock(
  input: EquipeClimaBlockInput,
): Promise<DashboardEquipeContextPayload['clima_equipe']> {
  if (input.trimestre === null) {
    return { nota_clima: null, adesao: null };
  }
  const row = await getClimateByEquipeQuarter(
    input.db,
    input.companyId,
    input.liderId,
    input.trimestre,
  );
  if (!row) {
    return { nota_clima: null, adesao: null };
  }
  return {
    nota_clima: num((row as { notaClima?: string | null }).notaClima ?? null),
    adesao: num((row as { adesao?: string | null }).adesao ?? null),
  };
}

// ============================================================
// Motor de agregacao canonico da equipe (ME-054 — fecha D059)
// ============================================================

/** Ids dos diretos ativos do lider (vinculo `dataFim IS NULL`). */
async function listDiretosAtivos(db: RoipDatabase, liderId: number): Promise<number[]> {
  const vinculos = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(and(eq(employeeLeaderHistory.liderId, liderId), isNull(employeeLeaderHistory.dataFim)))
    .limit(EQUIPE_LISTA_COLABORADORES_CAP);
  return vinculos.map((v) => v.employeeId);
}

interface AgregadosEquipeInput {
  db: RoipDatabase;
  employeeIds: number[];
  trimestre: string | null;
  bloqueiaFinanceiro: boolean;
}

/**
 * Medias canonicas §8.3.2 sobre os diretos ativos no trimestre atual.
 * Fontes: `performanceQuarterlyData` (desempenho, capacidade ociosa,
 * ROI, % meta), `plenitudeData` (plenitude, score A) e
 * `performanceData.assiduidade` (meses do trimestre — DOC 03 §2
 * Passo 1). Media dos presentes; `null` sem dados.
 */
async function composeAgregadosEquipe(
  input: AgregadosEquipeInput,
): Promise<DashboardEquipeContextPayload['agregados']> {
  const vazio: DashboardEquipeContextPayload['agregados'] = {
    score_desempenho_medio: null,
    plenitude_score_medio: null,
    score_a_medio: null,
    capacidade_ociosa_media: null,
    roi_estimado_medio: null,
    perc_meta_atingida_media: null,
    assiduidade_media: null,
  };
  if (input.employeeIds.length === 0 || input.trimestre === null) {
    return vazio;
  }
  const quarterlyRows = await input.db
    .select({
      scoreDesempenho: performanceQuarterlyData.scoreDesempenho,
      capacidadeOciosa: performanceQuarterlyData.capacidadeOciosa,
      roiEstimado: performanceQuarterlyData.roiEstimado,
      percMetaAtingida: performanceQuarterlyData.percMetaAtingida,
    })
    .from(performanceQuarterlyData)
    .where(
      and(
        eq(performanceQuarterlyData.trimestre, input.trimestre),
        inArray(performanceQuarterlyData.employeeId, input.employeeIds),
      ),
    );
  const plenitudeRows = await input.db
    .select({
      plenitudeScore: plenitudeData.plenitudeScore,
      scoreA: plenitudeData.scoreA,
    })
    .from(plenitudeData)
    .where(
      and(
        eq(plenitudeData.trimestre, input.trimestre),
        inArray(plenitudeData.employeeId, input.employeeIds),
      ),
    );
  const meses = mesesDoTrimestre(input.trimestre);
  const assiduidadeRows =
    meses.length === 0
      ? []
      : await input.db
          .select({ assiduidade: performanceData.assiduidade })
          .from(performanceData)
          .where(
            and(
              inArray(performanceData.employeeId, input.employeeIds),
              inArray(performanceData.mes, meses),
            ),
          );
  return {
    score_desempenho_medio: mediaDosPresentes(quarterlyRows.map((r) => num(r.scoreDesempenho))),
    plenitude_score_medio: mediaDosPresentes(plenitudeRows.map((r) => num(r.plenitudeScore))),
    score_a_medio: mediaDosPresentes(plenitudeRows.map((r) => num(r.scoreA))),
    capacidade_ociosa_media: mediaDosPresentes(quarterlyRows.map((r) => num(r.capacidadeOciosa))),
    // Bloqueio canonico §5.6 equipe: sem financeiro para lider.
    roi_estimado_medio: input.bloqueiaFinanceiro
      ? null
      : mediaDosPresentes(quarterlyRows.map((r) => num(r.roiEstimado))),
    perc_meta_atingida_media: mediaDosPresentes(quarterlyRows.map((r) => num(r.percMetaAtingida))),
    assiduidade_media: mediaDosPresentes(assiduidadeRows.map((r) => num(r.assiduidade))),
  };
}

/**
 * Distribuicao canonica por quadrante (D3 Opcao B): contagem das
 * classificacoes 9-Box dos diretos no trimestre atual, chaveada
 * pelos nomes canonicos do produto.
 */
async function composeDistribuicao9Box(
  db: RoipDatabase,
  employeeIds: number[],
  trimestre: string | null,
): Promise<DashboardEquipeDistribuicao9Box> {
  const distribuicao = Object.fromEntries(
    Object.values(NINE_BOX_QUADRANTE_TO_KEY).map((key) => [key, 0]),
  ) as DashboardEquipeDistribuicao9Box;
  if (employeeIds.length === 0 || trimestre === null) {
    return distribuicao;
  }
  const rows = await db
    .select({ quadrante: nineBoxClassifications.quadrante })
    .from(nineBoxClassifications)
    .where(
      and(
        eq(nineBoxClassifications.trimestre, trimestre),
        inArray(nineBoxClassifications.employeeId, employeeIds),
      ),
    );
  for (const row of rows) {
    const key = NINE_BOX_QUADRANTE_TO_KEY[row.quadrante];
    distribuicao[key] += 1;
  }
  return distribuicao;
}

interface HistoricoEquipeInput {
  db: RoipDatabase;
  companyId: number;
  liderId: number;
  employeeIds: number[];
  bloqueiaFinanceiro: boolean;
}

/**
 * Historico canonico §8.3.2: ate 4 trimestres distintos mais
 * recentes com medias da equipe (desempenho, plenitude, ROI) e
 * `nota_clima` da equipe (`climateEngagementData`). Ordem
 * decrescente de trimestre.
 */
async function composeHistoricoEquipe(
  input: HistoricoEquipeInput,
): Promise<DashboardEquipeContextPayload['historico_4_trimestres']> {
  if (input.employeeIds.length === 0) {
    return [];
  }
  const trimestreRows = await input.db
    .selectDistinct({ trimestre: performanceQuarterlyData.trimestre })
    .from(performanceQuarterlyData)
    .where(inArray(performanceQuarterlyData.employeeId, input.employeeIds))
    .orderBy(desc(performanceQuarterlyData.trimestre))
    .limit(4);
  const historico: DashboardEquipeContextPayload['historico_4_trimestres'] = [];
  for (const { trimestre } of trimestreRows) {
    const quarterlyRows = await input.db
      .select({
        scoreDesempenho: performanceQuarterlyData.scoreDesempenho,
        roiEstimado: performanceQuarterlyData.roiEstimado,
      })
      .from(performanceQuarterlyData)
      .where(
        and(
          eq(performanceQuarterlyData.trimestre, trimestre),
          inArray(performanceQuarterlyData.employeeId, input.employeeIds),
        ),
      );
    const plenitudeRows = await input.db
      .select({ plenitudeScore: plenitudeData.plenitudeScore })
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.trimestre, trimestre),
          inArray(plenitudeData.employeeId, input.employeeIds),
        ),
      );
    const climaRow = await getClimateByEquipeQuarter(
      input.db,
      input.companyId,
      input.liderId,
      trimestre,
    );
    historico.push({
      trimestre,
      score_desempenho_medio: mediaDosPresentes(quarterlyRows.map((r) => num(r.scoreDesempenho))),
      plenitude_score_medio: mediaDosPresentes(plenitudeRows.map((r) => num(r.plenitudeScore))),
      roi_medio: input.bloqueiaFinanceiro
        ? null
        : mediaDosPresentes(quarterlyRows.map((r) => num(r.roiEstimado))),
      nota_clima: num((climaRow as { notaClima?: string | null } | null)?.notaClima ?? null),
    });
  }
  return historico;
}

// ============================================================
// Entry point canonico do loader
// ============================================================

/**
 * Compoe o payload canonico §8.3.2 do dashboard de equipe do lider
 * identificado por `liderId`. Aplica bloqueios §5.6 conforme
 * argumentos. Retorna `null` se o lider nao existe ou nao e lider.
 *
 * ME-054 (fecha D059): agregados, distribuicao 9-Box e historico
 * agregado populados pelo motor de agregacao on-read desta ME.
 */
export async function loadDashboardEquipeContext(
  db: RoipDatabase,
  args: DashboardEquipeContextArgs,
): Promise<DashboardEquipeContextPayload | null> {
  // 1. Identificacao do lider (bloco obrigatorio).
  const idResult = await composeEquipeIdentificacao({
    db,
    liderId: args.liderId,
  });
  if (idResult === null) {
    return null;
  }
  if (!idResult.liderExiste) {
    return null;
  }

  // 2. Trimestre atual — derivado do performanceQuarterlyData mais
  //    recente de qualquer colaborador direto do lider. Sem diretos,
  //    trimestre_atual = null.
  const [primeiroDireto] = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(
      and(eq(employeeLeaderHistory.liderId, args.liderId), isNull(employeeLeaderHistory.dataFim)),
    )
    .limit(1);
  let trimestreAtual: string | null = null;
  if (primeiroDireto) {
    const [latestQuarterly] = await db
      .select({ trimestre: performanceQuarterlyData.trimestre })
      .from(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.employeeId, primeiroDireto.employeeId))
      .orderBy(desc(performanceQuarterlyData.trimestre))
      .limit(1);
    trimestreAtual = latestQuarterly?.trimestre ?? null;
  }

  // 3. Detectores canonicos §5.6.
  const bloqueiaFinanceiro = shouldBlockFinanceiroEquipe(args.viewerRole);
  const autoVisualizacao = isAutoVisualizacaoLider(args);

  // 4. Blocos condicionais.
  const iqlBlock = await composeEquipeIqlBlock({
    db,
    companyId: args.companyId,
    liderId: args.liderId,
    trimestre: trimestreAtual,
    autoVisualizacao,
  });
  const climaBlock = await composeEquipeClimaBlock({
    db,
    companyId: args.companyId,
    liderId: args.liderId,
    trimestre: trimestreAtual,
  });
  const listaColaboradores = await composeListaColaboradores({
    db,
    liderId: args.liderId,
    bloqueiaFinanceiro,
  });

  // 5. Motor de agregacao canonico (ME-054 — fecha D059).
  const employeeIds = await listDiretosAtivos(db, args.liderId);
  const agregados = await composeAgregadosEquipe({
    db,
    employeeIds,
    trimestre: trimestreAtual,
    bloqueiaFinanceiro,
  });
  const distribuicao9Box = await composeDistribuicao9Box(db, employeeIds, trimestreAtual);
  const historico = await composeHistoricoEquipe({
    db,
    companyId: args.companyId,
    liderId: args.liderId,
    employeeIds,
    bloqueiaFinanceiro,
  });

  // 6. Composicao final canonica.
  return {
    identificacao: idResult.identificacao,
    trimestre_atual: trimestreAtual,
    agregados,
    distribuicao_9box: distribuicao9Box,
    iql_lider: iqlBlock,
    clima_equipe: climaBlock,
    historico_4_trimestres: historico,
    lista_colaboradores: listaColaboradores,
  };
}
