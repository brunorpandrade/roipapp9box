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
 * atual (cascata canonica resolvida) e o historico canonico dos
 * ultimos N trimestres.
 */
export interface BlocoClimaDashboardData {
  escopoRequisitado: ClimateBlockCascataResult['escopoRequisitado'];
  cascata: ClimateBlockCascataResult;
  historico: readonly BlocoClimaTimelinePoint[];
}

/**
 * Parametros canonicos do loader. Espelha os parametros do motor
 * puro (`ComputeClimateBlockParams`) mas sem `trimestre` — o loader
 * resolve o trimestre canonico mais recente via `listClimateTrimestres`.
 */
interface LoadBlocoClimaDashboardArgs {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: ClimateLiderTipo | null;
}

/**
 * Carrega canonicamente o payload do Bloco Clima para o escopo
 * requisitado. Resolve:
 *   1. Lista canonica de trimestres com `scoreA IS NOT NULL`
 *      (`listClimateTrimestres`, desc).
 *   2. Trimestre atual = mais recente; se nao houver, retorna `null`
 *      (ausencia canonica — a UI exibe estado vazio).
 *   3. Cascata silenciosa canonica (§9.6 Q4=A1) para o trimestre
 *      atual via `resolveClimateBlockComCascata`.
 *   4. Historico canonico dos ultimos N trimestres: para cada
 *      trimestre historico, computa SEM cascata (nota do escopo
 *      requisitado puro — `null` quando abaixo do piso). Isso
 *      preserva a semantica canonica da timeline (series temporais
 *      do MESMO escopo).
 *
 * Retorno `null` canonico quando nao ha trimestres canonicos para a
 * empresa — a UI do card trata o estado vazio.
 */
export async function loadBlocoClimaDashboardData(
  db: RoipDatabase,
  args: LoadBlocoClimaDashboardArgs,
): Promise<BlocoClimaDashboardData | null> {
  const trimestres = await listClimateTrimestres(db, args.companyId, 'desc');
  const trimestreAtual = trimestres[0];
  if (trimestreAtual === undefined) {
    return null;
  }

  const cascata = await resolveClimateBlockComCascata(db, {
    companyId: args.companyId,
    escopo: args.escopo,
    escopoReferencia: args.escopoReferencia,
    liderId: args.liderId,
    liderTipo: args.liderTipo,
    trimestre: trimestreAtual,
  });

  // Historico canonico: ultimos N trimestres canonicos (asc para a
  // timeline fluir da esquerda para a direita).
  // Slice + sort separados para respeitar max-len 100 canonico (RV-14).
  const trimestresHistorico = trimestres.slice(0, BLOCO_CLIMA_HISTORICO_MAX_TRIMESTRES).sort();
  const historico: BlocoClimaTimelinePoint[] = [];
  for (const tri of trimestresHistorico) {
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
 * recente. Retorna `null` quando nao ha trimestre canonico com
 * `scoreA` gravado.
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
 * canonico §9.4) no ultimo trimestre fechado. A UI usa `respondentes`
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
 * escopo: contagens agregadas da empresa inteira no ultimo trimestre
 * fechado. Permite rotular o pill com "Empresa toda (N)" sem precisar
 * aguardar o payload do escopo requisitado.
 */
export interface EmpresaScopeClimateEntry {
  respondentes: number;
  total: number;
}

/**
 * ME-B2-01d — lista canonica dos departamentos ativos da empresa
 * (employees com `status='ativo'`) acompanhada das contagens canonicas
 * de respondentes e elegiveis do ultimo trimestre fechado. Consumido
 * pelo filtro de escopo da tela de detalhamento (pills "Nome (N)" +
 * bloqueio por piso canonico §9.6).
 *
 * Mecanica canonica: delega ao motor puro `computeClimateBlock` para
 * cada departamento no trimestre atual, extraindo apenas
 * `countCobertura` e `countTotal`. Preserva a origem canonica unica
 * da contagem (motor §9.4) — zero duplicacao de regra. Quando nao ha
 * trimestre canonico, retorna lista com `respondentes=0` e `total=0`
 * para cada departamento.
 */
export async function listDepartamentosAtivosClimate(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly DepartamentoAtivoClimateEntry[]> {
  const rows = await db
    .selectDistinct({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')));
  const nomes = rows.map((r) => r.departamento).sort();
  const trimestres = await listClimateTrimestres(db, companyId, 'desc');
  const trimestreAtual = trimestres[0];
  if (trimestreAtual === undefined) {
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
      trimestre: trimestreAtual,
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
 * empresa inteira no ultimo trimestre fechado. Consumido pelo pill
 * "Empresa toda" do filtro de escopo e pelas chamadas de UI que
 * precisam da contagem agregada sem resolver o payload inteiro.
 * Retorna `null` canonico quando nao ha trimestre com `scoreA` gravado.
 */
export async function loadEmpresaScopeClimateCounts(
  db: RoipDatabase,
  companyId: number,
): Promise<EmpresaScopeClimateEntry | null> {
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
  if (payload === null) {
    return null;
  }
  return {
    respondentes: payload.countCobertura,
    total: payload.countTotal,
  };
}
