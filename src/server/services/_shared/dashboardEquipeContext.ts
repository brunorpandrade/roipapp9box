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
// D059: agregados (score_desempenho_medio, plenitude_score_medio,
// distribuicao_9box, historico_4_trimestres agregado) declarados
// como `null` / arrays vazios nesta ME. Motor de agregacao canonico
// em ME futura.
//
// Regras invioláveis desta ME:
// - RV-12: 100% Drizzle tipado.
// - RV-13: consumido por `aiChatService` (level=equipe). Testes unit
//   em `tests/unit/dashboardContext.test.ts`.

import { and, desc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import {
  employees,
  employeeLeaderHistory,
  nineBoxClassifications,
  performanceQuarterlyData,
} from '../../../db/schema';
import { getClimateByEquipeQuarter } from '../climateEngagementData';
import { getIqlDataByLiderQuarter } from '../iqlData';

import type {
  DashboardEquipeContextArgs,
  DashboardEquipeContextPayload,
  DashboardEquipeIdentificacao,
} from './dashboardContextTypes';

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
// Entry point canonico do loader
// ============================================================

/**
 * Compoe o payload canonico §8.3.2 do dashboard de equipe do lider
 * identificado por `liderId`. Aplica bloqueios §5.6 conforme
 * argumentos. Retorna `null` se o lider nao existe ou nao e lider.
 *
 * D059: agregados (media desempenho, media plenitude, distribuicao
 * 9-Box, historico agregado) declarados como `null` / arrays vazios.
 * Motor de agregacao canonico em ME futura.
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

  // 5. Composicao final canonica.
  return {
    identificacao: idResult.identificacao,
    trimestre_atual: trimestreAtual,
    agregados: {
      score_desempenho_medio: null,
      plenitude_score_medio: null,
      score_a_medio: null,
      capacidade_ociosa_media: null,
      roi_estimado_medio: bloqueiaFinanceiro ? null : null,
      perc_meta_atingida_media: null,
      assiduidade_media: null,
    },
    distribuicao_9box: {
      estrela: 0,
      alto_desempenho: 0,
      solido: 0,
      desenvolvimento: 0,
      consistente: 0,
      manutencao: 0,
      duvida: 0,
      abaixo_esperado: 0,
      critico: 0,
    },
    iql_lider: iqlBlock,
    clima_equipe: climaBlock,
    historico_4_trimestres: [],
    lista_colaboradores: listaColaboradores,
  };
}
