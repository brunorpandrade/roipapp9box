// ROIP APP 9BOX — mappings canonicos /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A).
//
// Origem canonica:
// - DOC 05 §14.20 (Rota) + mockup canonico `logs_responsavel_financeiro_
//   v1.html` linhas 65-67 (badges de tipo de evento) e 186-189 (labels
//   do dropdown).
// - CC043 (aprovada em ME-057b): labels canonicos em substantivo
//   `Atribuicao / Transferencia / Remocao` (mockup) — o texto §14.20
//   usava adjetivos, mockup prevalece.
// - Cores do mockup mapeadas em `src/lib/design-tokens/colors.ts`
//   (§2.1 badges info/warning/danger + §2.3 hover).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `EVENT_TYPE_LABEL` (const) → `RFLogsClient.tsx` (badges + modal),
//     `rf-logs-mappings.test.ts`.
//   - `EVENT_TYPE_BADGE_STYLE` → `RFLogsClient.tsx`,
//     `rf-logs-mappings.test.ts`.
//   - `resolveEventTypeLabel`, `resolveEventTypeBadgeStyle` (funcoes)
//     → `RFLogsClient.tsx`, `rf-logs-mappings.test.ts`.

import type { RfEventType } from '../../../../db/schema/enums';
import { COLORS } from '../../../../lib/design-tokens/colors';

/**
 * Labels canonicos §14.20 (CC043: mockup prevalece). Aplicavel a badges
 * da tabela, valor selecionado no dropdown e linha "Tipo de evento" do
 * modal `[Ver detalhes]`.
 */
export const EVENT_TYPE_LABEL: Readonly<Record<RfEventType, string>> = {
  atribuido: 'Atribuição',
  transferido: 'Transferência',
  removido: 'Remoção',
};

export function resolveEventTypeLabel(t: RfEventType): string {
  return EVENT_TYPE_LABEL[t];
}

/**
 * Estilos canonicos das badges por tipo de evento (mockup linhas 65-67):
 *   - `atribuido` → info (azul).
 *   - `transferido` → warning (amarelo/laranja escurecido).
 *   - `removido` → danger (vermelho).
 */
export interface BadgeStyle {
  readonly background: string;
  readonly color: string;
}

export const EVENT_TYPE_BADGE_STYLE: Readonly<Record<RfEventType, BadgeStyle>> = {
  atribuido: {
    background: COLORS.badge.infoBg,
    color: COLORS.badge.infoText,
  },
  transferido: {
    background: COLORS.badge.warningBg,
    color: COLORS.badge.warningText,
  },
  removido: {
    background: COLORS.badge.dangerBg,
    color: COLORS.badge.dangerText,
  },
};

export function resolveEventTypeBadgeStyle(t: RfEventType): BadgeStyle {
  return EVENT_TYPE_BADGE_STYLE[t];
}

/** Label canonico do default do dropdown de tipo de evento (mockup). */
export const EVENT_TYPE_LABEL_TODOS = 'Tipo de evento: Todos';

/**
 * Resolve nome de holder polimorfico (De / Para) para renderizacao na
 * tabela. `null` → em dash (mockup usa `<span class="holder-none">—</span>`
 * quando `de` esta ausente, ex: eventType `atribuido`).
 */
export function formatHolderCell(nome: string | null): string {
  if (nome === null || nome.trim().length === 0) return '—';
  return nome.trim();
}
