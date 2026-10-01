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
 * ME-B2-01b Fase 2 hotfix2 — lista canonica dos departamentos ativos
 * da empresa (employees com `status='ativo'`). Consumido pelo filtro
 * de escopo da tela de detalhamento. Ordenacao alfabetica canonica.
 */
export async function listDepartamentosAtivosClimate(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly string[]> {
  const rows = await db
    .selectDistinct({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')));
  return rows.map((r) => r.departamento).sort();
}
