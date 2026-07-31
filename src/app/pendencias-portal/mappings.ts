// ROIP APP 9BOX — mappings canonicos de `/pendencias-portal` (ME-058
// §14.23 S326).
//
// Origem canonica:
// - DOC 05 §14.23 (Rota `/pendencias-portal`) — 6 filtros + 11 colunas
//   + 3 cards resumo + textos canonicos literais de modais e toasts.
// - DOC 05 §5.8 (Card resumo Pendencias no portal) — cores canonicas
//   `#16A34A` (0 pendencias) vs `#D97706` (1+ pendencias).
// - DOC 05 linha 555 (Nota canonica de coexistencia): cooldown 72h do
//   card resumo (canonizado tambem em §14.23 modal individual).
// - `portalReminderLog.instrumentType` enum (DOC 01 §M004 / tables.ts
//   linha 1234): 'meuPerfil' | 'autoAvaliacao' | 'avaliacaoLiderancaDireta'
//   | 'radarNR1'.
// - Mockup canonico `painel_principal_fase7_v5.html` linhas 1192-1400
//   (mockup primario da rota; os 3 mockups do portal do colaborador sao
//   referencias laterais para Snapshot §14.24).
//
// **CC047 (nova ME-058)** — errata cirurgica do comando de abertura:
// mockup primario canonico e `painel_principal_fase7_v5.html`; refactor
// §5.8 restrito a `/painel-rh` (Bruno dentro-de-empresa §5.4 diferido —
// S329).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `INSTRUMENT_LABEL` → consumido por `PendenciasClient.tsx`,
//     `pendenciasEngine.ts` (formatacao dos rows) e
//     `pendencias-mappings.test.ts`.
//   - `STATUS_LABEL` → consumido por `PendenciasClient.tsx`,
//     `pendenciasEngine.ts` e `pendencias-mappings.test.ts`.
//   - `CARD_COLOR_PENDENCIAS` → consumido por `painel-rh/page.tsx`
//     (refactor S321) e `pendencias-mappings.test.ts`.
//   - `formatDiasAtraso` + `resolveDiasAtrasoColor` → consumidos por
//     `PendenciasClient.tsx` (coluna 9 da tabela §14.23) e
//     `pendencias-mappings.test.ts`.
//   - Tipos (`InstrumentType`, `PendenciaStatus`) → consumidos por
//     `pendenciasEngine.ts`, actions, cliente e testes.

import type { PortalInstrumentType } from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Tipo canonico do instrumento no portal. Espelha bit-exact o enum
 * `portalReminderLog.instrumentType` (4 valores canonicos §14.23 filtro
 * "Instrumento"). Import canonico do catalogo de enums (§15.3 DOC 01).
 */
export type InstrumentType = PortalInstrumentType;

/**
 * Status canonico da pendencia. Derivado de `cycleSchedule.status` do
 * ciclo do instrumento (aberto → 'Pendente'; atrasado → 'Atrasado').
 * Para `meuPerfil` (sem ciclo proprio), derivado do proxy S330
 * (threshold em dias sobre `individualProfilePlaceholders.createdAt`).
 */
export type PendenciaStatus = 'Pendente' | 'Atrasado';

// -----------------------------------------------------------------------
// Labels canonicos literais (§14.23 filtro "Instrumento")
// -----------------------------------------------------------------------

/**
 * Labels canonicos dos 4 instrumentos §14.23 filtro. Ordem canonica de
 * exibicao: Meu perfil, Autoavaliacao, Avaliacao da lideranca direta,
 * Radar NR-1 (mesma ordem do enum `portalReminderLog.instrumentType`).
 */
export const INSTRUMENT_LABEL: Readonly<Record<InstrumentType, string>> = Object.freeze({
  meuPerfil: 'Meu perfil',
  autoAvaliacao: 'Autoavaliação',
  avaliacaoLiderancaDireta: 'Avaliação da liderança direta',
  radarNR1: 'Radar NR-1',
});

/**
 * Ordem canonica de renderizacao no select de filtro §14.23 e nas
 * agregacoes do motor. Espelha ordem canonica do enum.
 */
export const INSTRUMENT_ORDER: readonly InstrumentType[] = Object.freeze([
  'meuPerfil',
  'autoAvaliacao',
  'avaliacaoLiderancaDireta',
  'radarNR1',
] as const);

/**
 * Labels canonicos dos 2 status §14.23 filtro. Ordem canonica: Pendente
 * primeiro, Atrasado segundo (mesma ordem do §5.8 semantica).
 */
export const STATUS_LABEL: Readonly<Record<PendenciaStatus, string>> = Object.freeze({
  Pendente: 'Pendente',
  Atrasado: 'Atrasado',
});

// -----------------------------------------------------------------------
// Cores canonicas §5.8 e §14.23
// -----------------------------------------------------------------------

/**
 * Cores canonicas literais do card resumo Pendencias no portal §5.8
 * (linhas 648-649 do DOC 05). Verde para 0 pendencias, laranja para 1+.
 * Refactor S321 canonizada em ME-057c consome estes literais bit-exact.
 */
export const CARD_COLOR_PENDENCIAS: Readonly<{
  readonly zero: string;
  readonly positive: string;
}> = Object.freeze({
  zero: '#16A34A',
  positive: '#D97706',
});

/**
 * Cores canonicas da coluna 9 (Dias em atraso) da tabela §14.23:
 * `> 5` vermelho, `1 a 5` laranja, `= 0` cinza. Literais canonicos
 * bit-exact do DOC 05 §14.23 linha 2633.
 */
export const DIAS_ATRASO_COLOR: Readonly<{
  readonly danger: string;
  readonly warn: string;
  readonly neutral: string;
}> = Object.freeze({
  danger: '#DC2626',
  warn: '#D97706',
  neutral: '#6B7280',
});

/**
 * Cores canonicas dos 3 cards resumo §14.23 (linhas 2610-2612):
 * Atrasadas vermelho `#DC2626`, Pendentes azul `#1E40AF`, Colaboradores
 * impactados cinza `#6B7280`. Bordas 4px canonicas.
 */
export const CARD_RESUMO_COLOR: Readonly<{
  readonly atrasadas: string;
  readonly pendentes: string;
  readonly colaboradores: string;
}> = Object.freeze({
  atrasadas: '#DC2626',
  pendentes: '#1E40AF',
  colaboradores: '#6B7280',
});

// -----------------------------------------------------------------------
// Formatadores canonicos
// -----------------------------------------------------------------------

/**
 * Resolve cor canonica do texto de dias em atraso §14.23 linha 2633.
 * Contrato canonico:
 * - `dias > 5` → `DIAS_ATRASO_COLOR.danger`.
 * - `dias >= 1 && dias <= 5` → `DIAS_ATRASO_COLOR.warn`.
 * - `dias === 0` → `DIAS_ATRASO_COLOR.neutral`.
 * - `dias < 0` (nao atrasado, antecipado) → `DIAS_ATRASO_COLOR.neutral`
 *   (canonicamente equivalente a 0 dias — nao ha estado "adiantado").
 */
export function resolveDiasAtrasoColor(dias: number): string {
  if (dias > 5) {
    return DIAS_ATRASO_COLOR.danger;
  }
  if (dias >= 1) {
    return DIAS_ATRASO_COLOR.warn;
  }
  return DIAS_ATRASO_COLOR.neutral;
}

/**
 * Formata texto canonico de "Dias em atraso" para exibicao. Nao exibe
 * unidade (a coluna da tabela ja tem cabecalho "Dias em atraso"). Retorna
 * o numero absoluto (canonicamente sempre >= 0 na visao renderizada).
 */
export function formatDiasAtraso(dias: number): string {
  if (dias <= 0) {
    return '0';
  }
  return String(dias);
}

/**
 * Formata prazo original canonicamente §14.23 coluna 8. Formato canonico
 * pt-BR `dd/mm/aaaa` sem hora (prazos sao granularidade dia). Retorna
 * string vazia quando `data === null` — canonicamente representa "sem
 * prazo definido" (raro; heuristica S330 para meuPerfil pode nao ter
 * prazo derivado).
 */
export function formatPrazoOriginal(data: Date | null): string {
  if (data === null) {
    return '';
  }
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(data.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formata cooldown canonicamente §14.23 modal + tooltip. Formato
 * canonico pt-BR `dd/mm/aaaa hh:mm` (com minutos). Consumido pelos
 * textos literais do modal individual (linha 2657) e do toast de sucesso
 * (linha 2655).
 */
export function formatCooldownTimestamp(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(data.getUTCFullYear());
  const hh = String(data.getUTCHours()).padStart(2, '0');
  const mi = String(data.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/**
 * Formata contador canonico do sub do card resumo §5.8 linha 644:
 * *"pendencias totais na empresa"* — literal invariavel. Retornado como
 * constante para eliminar risco de digitacao divergente no cliente.
 */
export const CARD_58_SUB_POSITIVE = 'pendências totais na empresa';

/**
 * Sub canonico do card resumo §5.8 linha 648 quando `total === 0`:
 * *"Empresa em dia com o portal ✓"* — literal invariavel bit-exact.
 */
export const CARD_58_SUB_ZERO = 'Empresa em dia com o portal ✓';

/**
 * Titulo canonico do card resumo §5.8 linha 642 (uppercase, letter-
 * spacing padrao do card).
 */
export const CARD_58_TITLE = 'Pendências no portal';

/**
 * Link canonico do card resumo §5.8 linha 645 quando `total > 0`.
 */
export const CARD_58_LINK = 'Ver detalhamento →';

/**
 * Cooldown canonico do envio individual §14.23 linha 2652: 72 horas.
 * Referenciado em milissegundos para uso direto em comparacoes de
 * Date.getTime(). Consumido pelo action `enviarLembreteAction` e pelo
 * modal massivo (skip automatico).
 */
export const COOLDOWN_LEMBRETE_MS = 72 * 60 * 60 * 1000;

/**
 * Cooldown canonico em horas para exibicao textual (literal do modal
 * individual §14.23 linha 2652: "Cooldown de 72h aplicado apos o envio").
 */
export const COOLDOWN_LEMBRETE_HORAS = 72;
