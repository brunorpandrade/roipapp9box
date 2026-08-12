// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/nr1` (§14.28, ME-079b).
//
// Padrão S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, função auxiliar
// e loader vive neste `internals.ts` irmão.
//
// IMPORTANTE (CC071): este módulo é importado por `Nr1Client.tsx`
// (client component — `'use client'`). Portanto, NÃO pode importar
// VALUE-LEVEL de routers, services, db/client ou qualquer módulo que
// transite por `mysql2`, `node:crypto` ou `node:buffer`. Apenas
// constantes puras, tipos (import type) e funções sem side-effects.
//
// Origem canônica:
// - CAMADA_UI §14.28 (Módulo Radar NR-1 — 6 estados canônicos).
// - CAMADA_AUTH §10.4 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §11.17 (7 procs tRPC NR-1).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.6.2 (ficha).
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam`, `resolveDatabaseUrl` → `page.tsx` +
//     `actions.ts`.
//   - `FATORES_NR1`, `FatorNr1`, `FAIXAS_SCORE`, `ABAS_NR1`,
//     `AbaNr1`, `BANNER_TEXT_NR1`, `formatDateBR`,
//     `classForScore` → `Nr1Client.tsx`.
//   - Tipos `CycleDetailsPayload`, `HistoricalCycleRow`,
//     `AlertRow` → `Nr1Client.tsx` + `actions.ts`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canônicas bit-exact
// -----------------------------------------------------------------------

/** §14.28 — texto canônico literal do banner amarelo permanente. */
export const BANNER_TEXT_NR1 =
  'Este módulo entrega um radar diagnóstico preliminar dos ' +
  '8 fatores psicossociais canônicos. Não substitui os ' +
  'instrumentos e processos formais exigidos pela NR-1, que ' +
  'requerem instrumento validado cientificamente e responsável ' +
  'técnico habilitado. Use os resultados como ponto de partida ' +
  'para investigação aprofundada quando necessário.';

/** §14.28 — 2 abas do módulo Radar NR-1. */
export const ABAS_NR1 = ['visao_geral', 'alertas_historico'] as const;

/** Tipo canônico das abas. */
export type AbaNr1 = (typeof ABAS_NR1)[number];

/** Aba default canônica — sempre Visão geral na chegada. */
export const ABA_NR1_DEFAULT: AbaNr1 = 'visao_geral';

/** §14.28 — rótulos canônicos das abas. */
export const ABA_LABELS: Record<AbaNr1, string> = {
  visao_geral: 'Visão geral',
  alertas_historico: 'Alertas e histórico',
};

/** §14.28 + DOC 03 §11.2 — 8 fatores canônicos do Radar NR-1. */
export const FATORES_NR1 = [
  { id: 1, nome: 'Exigências quantitativas', abrev: 'Exig. quant.', tipo: 'risco' },
  { id: 2, nome: 'Ritmo de trabalho', abrev: 'Ritmo', tipo: 'risco' },
  { id: 3, nome: 'Conflitos de papel', abrev: 'Confl. papel', tipo: 'risco' },
  { id: 4, nome: 'Autonomia', abrev: 'Autonomia', tipo: 'recurso' },
  { id: 5, nome: 'Suporte social do líder', abrev: 'Sup. líder', tipo: 'recurso' },
  { id: 6, nome: 'Suporte social de colegas', abrev: 'Sup. colegas', tipo: 'recurso' },
  { id: 7, nome: 'Insegurança no trabalho', abrev: 'Insegurança', tipo: 'risco' },
  { id: 8, nome: 'Saúde geral autopercebida', abrev: 'Saúde', tipo: 'recurso' },
] as const;

/** Tipo canônico de um fator NR-1. */
export type FatorNr1 = (typeof FATORES_NR1)[number];

/**
 * §14.28 — faixas canônicas de score (cores).
 * Verde: 66-100 · Amarelo: 50-65 · Vermelho: 0-49.
 */
export const FAIXAS_SCORE = {
  verde: { min: 66, max: 100, label: 'Satisfatório' },
  amarelo: { min: 50, max: 65, label: 'Atenção' },
  vermelho: { min: 0, max: 49, label: 'Crítico' },
} as const;

/** Status do ciclo → badge. */
export const STATUS_BADGE = {
  agendado: { label: 'Agendado', bg: '#FEF3C7', color: '#92400E' },
  aberto: { label: 'Aberto', bg: '#D1FAE5', color: '#065F46' },
  fechado: { label: 'Fechado', bg: '#E0E7FF', color: '#3730A3' },
} as const;

/** §11.11 — faixas canônicas do gauge de adesão. */
export const FAIXAS_ADESAO = {
  vermelho: { label: 'Adesão baixa', color: '#991B1B' },
  amarelo: { label: 'Adesão moderada', color: '#78350F' },
  verde: { label: 'Adesão satisfatória', color: '#065F46' },
} as const;

/** Descrições canônicas dos 8 fatores (modal detalhe §14.28). */
export const FATOR_DESCRICOES: Record<number, string> = {
  1:
    'Mede a percepção do respondente sobre volume de trabalho ' +
    'e prazo disponível. Escores altos indicam demandas ' +
    'dimensionadas de forma saudável.',
  2:
    'Mede a intensidade e velocidade exigidas ao longo da ' +
    'jornada. Escores altos indicam ritmo sustentável.',
  3:
    'Mede clareza sobre o próprio papel e coerência entre ' +
    'demandas recebidas. Escores altos indicam papel bem ' +
    'definido e demandas alinhadas.',
  4:
    'Mede o grau de liberdade e influência sobre o próprio ' +
    'trabalho. Escores altos indicam autonomia adequada.',
  5:
    'Mede a percepção de apoio, disponibilidade e ' +
    'reconhecimento da liderança imediata. Escores altos ' +
    'indicam suporte adequado.',
  6:
    'Mede a percepção de apoio, colaboração e parceria entre ' +
    'pares. Escores altos indicam ambiente colaborativo.',
  7:
    'Mede a percepção de estabilidade e previsibilidade sobre ' +
    'o vínculo e as condições de trabalho. Escores altos ' +
    'indicam sensação de segurança.',
  8:
    'Mede a percepção do próprio estado de saúde física e ' +
    'mental no contexto do trabalho. Escores altos indicam ' +
    'saúde percebida como boa.',
};

// -----------------------------------------------------------------------
// Tipos para payloads (client-safe — derivados dos tipos do router)
// -----------------------------------------------------------------------

/** Escopo de score devolvido por getCycleDetails. */
export interface EscopoPayload {
  readonly escopo: 'empresa' | 'departamento' | 'agregacao';
  readonly escopoDepartamentoId: number | null;
  readonly escopoNome: string | null;
  readonly countRespondentes: number;
  readonly fatores: ReadonlyArray<{
    readonly fator: number;
    readonly score: number;
  }>;
}

/** Divergência por departamento. */
export interface DivergenciaPayload {
  readonly escopo: 'departamento' | 'agregacao';
  readonly escopoDepartamentoId: number | null;
  readonly escopoNome: string | null;
  readonly classificacao: 'convergente' | 'divergencia_critica' | 'divergencia_positiva';
  readonly fatoresDivergentesCriticos: unknown;
  readonly fatoresDivergentesPositivos: unknown;
}

/** Payload consolidado do ciclo (getCycleDetails). */
export interface CycleDetailsPayload {
  readonly presente: boolean;
  readonly cicloDbId: number | null;
  readonly companyId: number;
  readonly ciclo: string | null;
  readonly status: 'agendado' | 'aberto' | 'fechado' | null;
  readonly dataAbertura: string | null;
  readonly dataFechamento: string | null;
  readonly dataFechamentoOriginal: string | null;
  readonly marcaEdicaoPermanente: boolean;
  readonly ultimaEdicaoEm: string | null;
  readonly ultimaEdicaoJustificativa: string | null;
  readonly elegiveis: number;
  readonly respondentesEfetivos: number;
  readonly adesaoPercentual: number;
  readonly faixaAdesao: 'vermelho' | 'amarelo' | 'verde';
  readonly textoAdesao: string;
  readonly escopos: readonly EscopoPayload[];
  readonly divergencias: readonly DivergenciaPayload[];
  readonly departamentoCriticoDepartamentoId: number | null;
  readonly departamentoCriticoDepartamentoNome: string | null;
  readonly mensagemDepartamentoCritico: string | null;
  readonly departamentosAmostraInsuficiente: readonly number[];
  readonly fatorDestacado: number | null;
  readonly avisoCicloSemElegiveis: string | null;
  readonly pisoAmostra: number;
}

/** Linha de ciclo histórico (para aba Alertas e histórico). */
export interface HistoricalCycleRow {
  readonly id: number;
  readonly ciclo: string;
  readonly dataAbertura: string;
  readonly dataFechamento: string;
  readonly status: 'agendado' | 'aberto' | 'fechado';
}

/** Alerta NR-1 (para aba Alertas e histórico). */
export interface AlertRow {
  readonly id: number;
  readonly tipo: string;
  readonly severidade: string | null;
  readonly escopo: string | null;
  readonly escopoDepartamentoId: number | null;
  readonly departamentoNome: string | null;
  readonly cicloDbId: number | null;
  readonly fatorId: number | null;
  readonly scoreValor: string | null;
  readonly createdAt: string | null;
}

/** Resultado de collection status. */
export interface CollectionStatusPayload {
  readonly cicloDbId: number;
  readonly totalElegiveis: number;
  readonly totalRespondidos: number;
  readonly totalRespondentesEfetivos: number;
  readonly totalPendentes: number;
  readonly adesaoPercentual: number;
}

// -----------------------------------------------------------------------
// Helpers puros (sem side-effects)
// -----------------------------------------------------------------------

/**
 * Retorna a classe de cor canônica para um score 0-100.
 */
export function classForScore(score: number): 'verde' | 'amarelo' | 'vermelho' {
  if (score >= 66) return 'verde';
  if (score >= 50) return 'amarelo';
  return 'vermelho';
}

/** Hex de cor para cada faixa. */
export const SCORE_COLORS = {
  verde: '#16A34A',
  amarelo: '#D97706',
  vermelho: '#DC2626',
} as const;

/** Hex de cor de fundo para cada faixa (dots). */
export const SCORE_BG_COLORS = {
  verde: '#16A34A',
  amarelo: '#D97706',
  vermelho: '#DC2626',
} as const;

/**
 * Formata data ISO `YYYY-MM-DD` para `DD/MM/AAAA`.
 */
export function formatDateBR(iso: string | null): string {
  if (iso === null || iso.length === 0) return '—';
  const parts = iso.split('T')[0]?.split('-');
  if (!parts || parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Formata timestamp ISO para `DD/MM/AAAA HH:mm`.
 */
export function formatTimestampBR(iso: string | null): string {
  if (iso === null || iso.length === 0) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/**
 * Calcula dias entre duas datas ISO `YYYY-MM-DD`.
 */
export function daysBetween(from: string | null, to: string | null): number {
  if (from === null || to === null) return 0;
  const a = new Date(from);
  const b = new Date(to);
  const diff = b.getTime() - a.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calcula dias restantes a partir de hoje até uma data ISO.
 */
export function daysUntil(iso: string | null): number {
  if (iso === null) return 0;
  const target = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

// -----------------------------------------------------------------------
// Parse canônico de params (mesmo padrão ME-074 a ME-079a)
// -----------------------------------------------------------------------

/**
 * Parse canônico de `params.id` — aceita apenas inteiros positivos.
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve DATABASE_URL do ambiente. Padrão consolidado ME-074+.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
