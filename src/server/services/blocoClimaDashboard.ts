// ROIP APP 9BOX — loader canonico do Bloco Clima para dashboards
// agregados (ME-B2-01b Fase 2 — UI).
//
// Encapsula a composicao canonica necessaria para o `BlocoClimaCard`
// no painel da empresa: payload atual (via cascata silenciosa Q4=A1)
// mais historico canonico dos ultimos N trimestres (para a timeline
// barras + linha do modelo Pulses adaptado — 4 dimensoes ROIP).
//
// Fonte unica: motor puro `computeClimateBlock` da ME-B2-01b Fase 1
// (sob demanda, sem cache). Zero drift permanente.
//
// ME-B2-01d (01/10/2026) — `listDepartamentosAtivosClimate` passa a
// retornar contagem de respondentes e total elegiveis do ultimo
// trimestre canonico, por departamento, para a UI do filtro de escopo
// (pills com "(N)" + bloqueio por piso canonico §9.6).
//
// ME-B2-01f (01/10/2026) — navegacao temporal canonica. O loader
// aceita um `trimestreSelecionado?` opcional e retorna a lista
// canonica completa de trimestres canonicos para a UI resolver as
// setas prev/next. A timeline canonica passa a ser uma janela
// deslizante de 4 trimestres com o selecionado como ponto mais
// recente (visao "evolucao ate esse ponto"). As contagens dos pills
// do filtro refletem o trimestre selecionado — nao mais sempre o
// mais recente.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees } from '../../db/schema';
import {
  type ClimateBlockCascataResult,
  type ClimateBlockPayload,
  type ClimateLiderTipo,
  computeClimateBlock,
  listClimateTrimestres,
  resolveClimateBlockComCascata,
} from './climateCalculationEngine';

/**
 * Numero canonico de trimestres exibidos na timeline canonica do
 * BlocoClimaCard. 4 trimestres = 1 ano (cadencia TRIMESTRAL §9.7).
 */
const BLOCO_CLIMA_HISTORICO_MAX_TRIMESTRES = 4 as const;

/**
 * Ponto canonico da timeline — um trimestre canonico com a nota geral
 * do Clima naquele trimestre (sem cascata; `null` quando nem o escopo
 * requisitado atende ao piso canonico naquele trimestre).
 */
interface BlocoClimaTimelinePoint {
  trimestre: string;
  notaClima: number | null;
}

/**
 * Payload canonico consumido pelo `BlocoClimaCard`. Inclui o payload
 * do trimestre selecionado (cascata canonica resolvida), o historico
 * canonico da janela deslizante de 4 trimestres, e a lista canonica
 * completa de trimestres disponiveis + o trimestre selecionado
 * resolvido — ME-B2-01f para navegacao temporal.
 */
export interface BlocoClimaDashboardData {
  escopoRequisitado: ClimateBlockCascataResult['escopoRequisitado'];
  cascata: ClimateBlockCascataResult;
  historico: readonly BlocoClimaTimelinePoint[];
  trimestreSelecionado: string;
  trimestresDisponiveis: readonly string[];
}

/**
 * Parametros canonicos do loader. Espelha os parametros do motor
 * puro (`ComputeClimateBlockParams`) mas sem `trimestre` obrigatorio
 * — o loader resolve o trimestre canonico mais recente via
 * `listClimateTrimestres` quando `trimestreSelecionado` nao e passado,
 * ou valida o trimestre pedido contra a lista canonica (fallback para
 * o mais recente quando o pedido nao existe canonicamente).
 */
interface LoadBlocoClimaDashboardArgs {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: ClimateLiderTipo | null;
  trimestreSelecionado?: string | null;
}

/**
 * Resolve o trimestre canonico efetivo a partir do pedido do caller
 * (ME-B2-01f). Fallback canonico para o mais recente quando o pedido
 * esta ausente ou nao existe na lista canonica (sanitiza input de URL
 * `?tri=` externo).
 */
function resolveTrimestreCanonic(
  pedido: string | null | undefined,
  disponiveis: readonly string[],
): string | null {
  const atual = disponiveis[0];
  if (atual === undefined) {
    return null;
  }
  if (pedido === null || pedido === undefined || pedido === '') {
    return atual;
  }
  return disponiveis.includes(pedido) ? pedido : atual;
}

/**
 * Resolve a janela canonica de 4 trimestres para a timeline, com o
 * selecionado como o mais recente da janela (visao "evolucao ate
 * esse ponto"). `disponiveis` e desc (mais recente primeiro). Retorna
 * desc; o caller inverte para asc antes de exibir.
 */
function resolveJanelaTimeline(
  selecionado: string,
  disponiveis: readonly string[],
): readonly string[] {
  const idx = disponiveis.indexOf(selecionado);
  if (idx < 0) {
    return disponiveis.slice(0, BLOCO_CLIMA_HISTORICO_MAX_TRIMESTRES);
  }
  return disponiveis.slice(idx, idx + BLOCO_CLIMA_HISTORICO_MAX_TRIMESTRES);
}

/**
 * Carrega canonicamente o payload do Bloco Clima para o escopo
 * requisitado. Resolve:
 *   1. Lista canonica de trimestres com `scoreA IS NOT NULL`
 *      (`listClimateTrimestres`, desc).
 *   2. Trimestre efetivo = `trimestreSelecionado` quando canonico, ou
 *      mais recente como fallback (ME-B2-01f).
 *   3. Cascata silenciosa canonica (§9.6 Q4=A1) para o trimestre
 *      efetivo via `resolveClimateBlockComCascata`.
 *   4. Janela deslizante da timeline — 4 trimestres com o selecionado
 *      como mais recente da janela (ME-B2-01f).
 *
 * Retorno `null` canonico quando nao ha trimestres canonicos para a
 * empresa — a UI do card trata o estado vazio.
 */
export async function loadBlocoClimaDashboardData(
  db: RoipDatabase,
  args: LoadBlocoClimaDashboardArgs,
): Promise<BlocoClimaDashboardData | null> {
  const trimestres = await listClimateTrimestres(db, args.companyId, 'desc');
  const trimestreEfetivo = resolveTrimestreCanonic(args.trimestreSelecionado, trimestres);
  if (trimestreEfetivo === null) {
    return null;
  }

  const cascata = await resolveClimateBlockComCascata(db, {
    companyId: args.companyId,
    escopo: args.escopo,
    escopoReferencia: args.escopoReferencia,
    liderId: args.liderId,
    liderTipo: args.liderTipo,
    trimestre: trimestreEfetivo,
  });

  // Historico canonico — janela deslizante com selecionado como mais
  // recente. desc internamente; asc na saida para fluxo esquerda->direita.
  const trimestresJanela = resolveJanelaTimeline(trimestreEfetivo, trimestres);
  const trimestresHistoricoAsc = [...trimestresJanela].sort();
  const historico: BlocoClimaTimelinePoint[] = [];
  for (const tri of trimestresHistoricoAsc) {
    const payload = await computeClimateBlockForTimeline(db, {
      companyId: args.companyId,
      escopo: args.escopo,
      escopoReferencia: args.escopoReferencia,
      liderId: args.liderId,
      liderTipo: args.liderTipo,
      trimestre: tri,
    });
    historico.push({
      trimestre: tri,
      notaClima: payload?.notaClima ?? null,
    });
  }

  return {
    escopoRequisitado: cascata.escopoRequisitado,
    cascata,
    historico,
    trimestreSelecionado: trimestreEfetivo,
    trimestresDisponiveis: trimestres,
  };
}

/**
 * Wrapper canonico que chama o motor puro para o escopo requisitado
 * em um trimestre especifico, retornando `null` quando o escopo nao
 * puder ser resolvido canonicamente (cadeia vazia, departamento
 * inexistente). Nao aplica cascata — a timeline canonica mostra a
 * nota do escopo puro para preservar comparabilidade historica.
 */
async function computeClimateBlockForTimeline(
  db: RoipDatabase,
  args: LoadBlocoClimaDashboardArgs & { trimestre: string },
): Promise<ClimateBlockPayload | null> {
  return await computeClimateBlock(db, {
    companyId: args.companyId,
    escopo: args.escopo,
    escopoReferencia: args.escopoReferencia,
    liderId: args.liderId,
    liderTipo: args.liderTipo,
    trimestre: args.trimestre,
  });
}

/**
 * ME-B2-01b Fase 2 hotfix2 — payload canonico MINIMO para o card
 * indicador do painel: so a nota geral do ultimo trimestre fechado +
 * o rotulo do trimestre. Sem historico, sem dimensoes — a tela de
 * detalhamento (`/super-admin/empresa/[id]/bloco-clima`) carrega o
 * resto sob demanda.
 */
export interface BlocoClimaIndicatorData {
  notaGeral: number | null;
  trimestre: string;
}

/**
 * ME-B2-01b Fase 2 hotfix2 — loader rapido do indicador. Chama o
 * motor puro para o escopo 'empresa' no trimestre canonico mais
 * recente. Retorna `null` canonico quando nao ha trimestre canonico
 * com `scoreA` gravado.
 */
export async function loadBlocoClimaIndicatorData(
  db: RoipDatabase,
  companyId: number,
): Promise<BlocoClimaIndicatorData | null> {
  const trimestres = await listClimateTrimestres(db, companyId, 'desc');
  const trimestreAtual = trimestres[0];
  if (trimestreAtual === undefined) {
    return null;
  }
  const payload = await computeClimateBlock(db, {
    companyId,
    escopo: 'empresa',
    escopoReferencia: null,
    liderId: null,
    liderTipo: null,
    trimestre: trimestreAtual,
  });
  return {
    notaGeral: payload?.notaClima ?? null,
    trimestre: trimestreAtual,
  };
}

/**
 * ME-B2-01d — entrada canonica do filtro de escopo da tela
 * `/bloco-clima`: nome do departamento + contagem de respondentes
 * (countCobertura canonico §9.4) + total de elegiveis (countTotal
 * canonico §9.4) no trimestre contextual. A UI usa `respondentes`
 * para rotular o pill ("Nome (N)") e para decidir o bloqueio por
 * piso canonico §9.6 (quando `respondentes < 3` o pill continua
 * visivel mas o clique abre tela de insuficiencia).
 */
export interface DepartamentoAtivoClimateEntry {
  nome: string;
  respondentes: number;
  total: number;
}

/**
 * ME-B2-01d — payload canonico do pill "Empresa toda" do filtro de
 * escopo: contagens agregadas da empresa inteira no trimestre
 * contextual.
 */
export interface EmpresaScopeClimateEntry {
  respondentes: number;
  total: number;
}

/**
 * ME-B2-01d — lista canonica dos departamentos ativos da empresa
 * (employees com `status='ativo'`) acompanhada das contagens canonicas
 * de respondentes e elegiveis no trimestre contextual. Consumido pelo
 * filtro de escopo da tela de detalhamento (pills "Nome (N)" +
 * bloqueio por piso canonico §9.6).
 *
 * ME-B2-01f (01/10/2026) — passa a aceitar `trimestreSelecionado?`
 * opcional para refletir as contagens no trimestre em visualizacao
 * (consistencia canonica com a navegacao temporal). Default: ultimo
 * trimestre canonico. Mecanica canonica: delega ao motor puro
 * `computeClimateBlock` para cada departamento no trimestre
 * contextual, extraindo apenas `countCobertura` e `countTotal`.
 * Preserva a origem canonica unica da contagem (motor §9.4) — zero
 * duplicacao de regra. Quando nao ha trimestre canonico, retorna
 * lista com `respondentes=0` e `total=0` para cada departamento.
 */
export async function listDepartamentosAtivosClimate(
  db: RoipDatabase,
  companyId: number,
  trimestreSelecionado?: string | null,
): Promise<readonly DepartamentoAtivoClimateEntry[]> {
  const rows = await db
    .selectDistinct({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')));
  const nomes = rows.map((r) => r.departamento).sort();
  const trimestres = await listClimateTrimestres(db, companyId, 'desc');
  const trimestreContextual = resolveTrimestreCanonic(trimestreSelecionado, trimestres);
  if (trimestreContextual === null) {
    return nomes.map((nome) => ({ nome, respondentes: 0, total: 0 }));
  }
  const entries: DepartamentoAtivoClimateEntry[] = [];
  for (const nome of nomes) {
    const payload = await computeClimateBlock(db, {
      companyId,
      escopo: 'departamento',
      escopoReferencia: nome,
      liderId: null,
      liderTipo: null,
      trimestre: trimestreContextual,
    });
    entries.push({
      nome,
      respondentes: payload?.countCobertura ?? 0,
      total: payload?.countTotal ?? 0,
    });
  }
  return entries;
}

/**
 * ME-B2-01d — contagens canonicas de respondentes e elegiveis da
 * empresa inteira no trimestre contextual. Consumido pelo pill
 * "Empresa toda" do filtro de escopo e pelas chamadas de UI que
 * precisam da contagem agregada sem resolver o payload inteiro.
 * Retorna `null` canonico quando nao ha trimestre com `scoreA` gravado.
 *
 * ME-B2-01f (01/10/2026) — passa a aceitar `trimestreSelecionado?`
 * opcional para refletir as contagens no trimestre em visualizacao.
 */
export async function loadEmpresaScopeClimateCounts(
  db: RoipDatabase,
  companyId: number,
  trimestreSelecionado?: string | null,
): Promise<EmpresaScopeClimateEntry | null> {
  const trimestres = await listClimateTrimestres(db, companyId, 'desc');
  const trimestreContextual = resolveTrimestreCanonic(trimestreSelecionado, trimestres);
  if (trimestreContextual === null) {
    return null;
  }
  const payload = await computeClimateBlock(db, {
    companyId,
    escopo: 'empresa',
    escopoReferencia: null,
    liderId: null,
    liderTipo: null,
    trimestre: trimestreContextual,
  });
  if (payload === null) {
    return null;
  }
  return {
    respondentes: payload.countCobertura,
    total: payload.countTotal,
  };
}
