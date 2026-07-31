// ROIP APP 9BOX — mappings canonicos /super-admin/empresa/[id]/historico
// (ME-057c Bloco A — Historico da empresa §14.21, S476).
//
// Origem canonica:
// - DOC 05 §14.21 (Rota `/super-admin/empresa/[id]/historico`) — 4
//   badges canonicos de tipo de evento + labels do dropdown de filtro.
// - Mockup canonico `historico_empresa_v1.html` linhas 74-78 (CSS das
//   badges) e 175-182 (labels do dropdown). CC045 canonizada nesta ME:
//   mockup prevalece sobre texto §14.21 em divergencia (subtitulo
//   estendido).
// - S322 canonizada nesta ME: ator canonico da transferencia de
//   liderados = literal "Sistema (transferencia de liderados)".
// - S323 canonizada nesta ME: agrupamento canonico batch de
//   transferencia = 1 linha visual por (transferBatchId, novoLiderId).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HISTORY_EVENT_TYPE_VALUES`, `HistoryEventType` → `filters.ts`
//     (parse), `companyHistoryLog.ts` (UNION), `HistoricoClient.tsx`
//     (dropdown + badges), `historico-mappings.test.ts`.
//   - `HISTORY_EVENT_TYPE_LABEL` → `HistoricoClient.tsx` (badges +
//     dropdown), `historico-mappings.test.ts`.
//   - `HISTORY_EVENT_BADGE_STYLE` → `HistoricoClient.tsx`,
//     `historico-mappings.test.ts`.
//   - `resolveHistoryEventTypeLabel`, `resolveHistoryEventBadgeStyle`,
//     `formatBatchIdShort`, `formatMesReferencia`, `formatAbaLabel`,
//     `formatSolicitacaoStatusLabel`, `SYSTEM_ACTOR_TRANSFERENCIA` →
//     `companyHistoryLog.ts` (composicao das linhas UNION),
//     `HistoricoClient.tsx`, `historico-mappings.test.ts`.
//   - `HISTORY_EVENT_TYPE_LABEL_TODOS`, `HISTORY_EMPTY_INICIAL`,
//     `HISTORY_EMPTY_FILTRO` → `HistoricoClient.tsx`,
//     `historico-mappings.test.ts`.

import type { AbaUnlock } from '../../../../../db/schema/enums';

// -----------------------------------------------------------------------
// Enum canonico dos 4 tipos de evento §14.21 (badges + dropdown filtro).
// -----------------------------------------------------------------------

/**
 * 4 tipos canonicos de evento no historico consolidado §14.21 (mockup
 * linhas 175-181). Valores literais escolhidos para casar bit-exact com
 * o mockup (evita renaming em CSS). Fonte de derivacao por linha da UNION
 * definida em `companyHistoryLog.ts`.
 *
 * `performanceMultiplierLog` (5a fonte canonica §14.21) esta como
 * placeholder canonico (nao retorna linhas nesta fase — decisao
 * documental do §14.21 "placeholder — nao retorna linhas nesta fase") e
 * portanto nao possui `HistoryEventType` dedicado.
 */
export const HISTORY_EVENT_TYPE_VALUES = [
  'respfin',
  'desbloqueio',
  'transferencia',
  'solicitacao',
] as const;
export type HistoryEventType = (typeof HISTORY_EVENT_TYPE_VALUES)[number];

// -----------------------------------------------------------------------
// Labels canonicos dos tipos de evento (badges + dropdown)
// -----------------------------------------------------------------------

/**
 * Labels canonicos §14.21 (mockup TIPO_LABEL linhas 250-254). Aplicavel a
 * badges da tabela e ao dropdown de filtro "Tipo de evento". CC045
 * canonizada nesta ME: mockup prevalece bit-exact.
 */
export const HISTORY_EVENT_TYPE_LABEL: Readonly<Record<HistoryEventType, string>> = {
  respfin: 'Responsável financeiro',
  desbloqueio: 'Desbloqueio de mês fechado',
  transferencia: 'Transferência de liderados',
  solicitacao: 'Solicitação de desbloqueio',
};

export function resolveHistoryEventTypeLabel(t: HistoryEventType): string {
  return HISTORY_EVENT_TYPE_LABEL[t];
}

// -----------------------------------------------------------------------
// Estilos canonicos das badges por tipo (mockup CSS linhas 74-78)
// -----------------------------------------------------------------------

export interface HistoryBadgeStyle {
  readonly background: string;
  readonly color: string;
}

/**
 * Estilos canonicos das 4 badges §14.21 (mockup linhas 75-78, casadas
 * com --info-bg/--success-bg/--warning-bg do design system + roxo
 * dedicado para `solicitacao`). Cores da paleta do mockup preservadas
 * bit-exact — o design system canonico do repo ja carrega as tokens
 * `--info`, `--success`, `--warning`, e o roxo canonico `#F3E8FF`/
 * `#6B21A8` e literal (nao ha token dedicado no design system porque
 * apenas esta tela consome — S302).
 */
export const HISTORY_EVENT_BADGE_STYLE: Readonly<Record<HistoryEventType, HistoryBadgeStyle>> = {
  respfin: {
    background: '#E6F1FB',
    color: '#0C447C',
  },
  desbloqueio: {
    background: '#DCFCE7',
    color: '#166534',
  },
  transferencia: {
    background: '#FEF3C7',
    color: '#92400E',
  },
  solicitacao: {
    background: '#F3E8FF',
    color: '#6B21A8',
  },
};

export function resolveHistoryEventBadgeStyle(t: HistoryEventType): HistoryBadgeStyle {
  return HISTORY_EVENT_BADGE_STYLE[t];
}

// -----------------------------------------------------------------------
// Labels canonicos secundarios (dropdown default + estados vazios)
// -----------------------------------------------------------------------

/**
 * Label canonico do default do dropdown "Tipo de evento" §14.21 (mockup
 * linha 176 — `option value="todos" selected` com texto exato "Tipo de
 * evento: Todos"). Prefixado com o nome do filtro (padrao do mockup).
 */
export const HISTORY_EVENT_TYPE_LABEL_TODOS = 'Tipo de evento: Todos';

/**
 * Estados vazios canonicos §14.21 (mockup linhas 324-326). Literais
 * bit-exact.
 */
export const HISTORY_EMPTY_INICIAL = 'Nenhum evento registrado para esta empresa até o momento.';
export const HISTORY_EMPTY_FILTRO = 'Nenhum registro encontrado com os filtros aplicados.';

// -----------------------------------------------------------------------
// Formatadores canonicos (composicao dos detalhes expandidos)
// -----------------------------------------------------------------------

/**
 * S322 canonizada nesta ME: ator canonico da transferencia de liderados.
 * O schema `employeeLeaderHistory` nao registra `actorSuperAdminId`, logo
 * o executor real nao pode ser recuperado. Literal canonico honesto,
 * decisao reversivel quando D065 for FECHADO (adicao de
 * `actorSuperAdminId` em B5.4 junto com a rota `/transferencia-liderados`).
 */
export const SYSTEM_ACTOR_TRANSFERENCIA = 'Sistema (transferência de líderados)';

/**
 * Formata `transferBatchId` UUID (36 chars) em short-form para exibicao
 * canonica no detalhe expandido §14.21 (mockup: "a1f4e9c2-..."). Regra:
 * primeiros 8 chars + "...". Fallback para string vazia se input for
 * vazio/malformado.
 */
export function formatBatchIdShort(batchId: string): string {
  if (batchId.length < 8) return batchId;
  return `${batchId.slice(0, 8)}...`;
}

/**
 * Formata `mes` do enum canonico (formato `YYYY-MM`) em label brasileiro
 * canonico §14.21 (mockup: "Junho/2026", "Abril/2026"). Mes com inicial
 * maiuscula seguido de barra e ano completo.
 */
const MES_LABEL: readonly string[] = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function formatMesReferencia(mes: string): string {
  const parts = mes.split('-');
  if (parts.length !== 2) return mes;
  const year = parts[0];
  const monthStr = parts[1];
  if (year === undefined || monthStr === undefined) return mes;
  const monthNum = Number.parseInt(monthStr, 10);
  if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) return mes;
  const label = MES_LABEL[monthNum - 1];
  if (label === undefined) return mes;
  return `${label}/${year}`;
}

/**
 * Mapeia `aba` do enum canonico (`rh | lider | faturamento`) em label
 * canonico do detalhe expandido §14.21 (mockup: "Dados mensais — RH",
 * "Dados mensais — Líder"). `faturamento` mapeia para "Faturamento
 * mensal" (canonico §14.15 do DOC 05).
 */
export function formatAbaLabel(aba: AbaUnlock): string {
  if (aba === 'rh') return 'Dados mensais — RH';
  if (aba === 'lider') return 'Dados mensais — Líder';
  return 'Faturamento mensal';
}

/**
 * Labels canonicos do enum `cycleUnlockRequests.status` para exibicao no
 * detalhe expandido §14.21 (mockup: "Aprovada", "Recusada"). Substantivo
 * feminino com inicial maiuscula (padrao PT-BR).
 */
export function formatSolicitacaoStatusLabel(
  status: 'pendente' | 'aprovada' | 'recusada' | 'cancelada',
): string {
  if (status === 'pendente') return 'Pendente';
  if (status === 'aprovada') return 'Aprovada';
  if (status === 'recusada') return 'Recusada';
  return 'Cancelada';
}
