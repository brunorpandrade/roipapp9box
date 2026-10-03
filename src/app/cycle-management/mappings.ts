// ROIP APP 9BOX — mappings canonicos da rota `/cycle-management`
// (ME-B9.1 §14.18).
//
// Origem canonica:
// - DOC 05 §14.18 (Rota `/cycle-management` — Gestao de ciclos).
// - DOC 05 §14.16 (ModalSolicitarDesbloqueio — reutilizado via L125).
// - `TIPO_CICLO_VALUES` (DOC 01 §12.6 / enums.ts linha 88) — 5 valores
//   canonicos: 'instrumento_a', 'instrumento_c', 'instrumento_d',
//   'radar_nr1', 'fechamento_mensal'.
// - `ABA_UNLOCK_VALUES` (enums.ts linha 67) — 3 valores: 'rh', 'lider',
//   'faturamento'.
// - Mockup canonico `cycle_management_v1.html` (data corrente
//   05/07/2026, Q3 iniciando — bit-exact ao mockup).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TIPO_CICLO_LABEL` → `CycleManagementClient.tsx` (badge + filtro),
//     `calendarioHelpers.ts` (titulo de card) e teste de mappings.
//   - `TIPO_CICLO_BADGE_CLASS` → `CycleManagementClient.tsx` (classe
//     visual canonica do mockup).
//   - `STATUS_CICLO_LABEL` → `CycleManagementClient.tsx` (badge coluna
//     Status) e teste.
//   - `STATUS_CICLO_BADGE_CLASS` → `CycleManagementClient.tsx` (badge
//     visual) e teste.
//   - `ABA_UNLOCK_LABEL` → `CycleManagementClient.tsx` (coluna Aba) e
//     teste.
//   - `STATUS_UNLOCK_LABEL` → `CycleManagementClient.tsx` (badge
//     Historico) e teste.
//   - `STATUS_UNLOCK_BADGE_CLASS` → `CycleManagementClient.tsx` e teste.
//   - `formatMesLabel` → `CycleManagementClient.tsx` (nome do mes em
//     portugues) e teste.
//   - `formatDateBR` → `CycleManagementClient.tsx` (datas canonicas
//     dd/mm/aaaa) e teste.
//   - `TAXA_RESPOSTA_FAIXA` → `CycleManagementClient.tsx` (cor da barra
//     de progresso) e teste.
//   - `calcTaxaResposta` → `CycleManagementClient.tsx` + teste.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { AbaUnlock, TipoCiclo } from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Tipo canonico de status de ciclo (`cycleSchedule.status`)
// -----------------------------------------------------------------------

export type StatusCiclo = 'aberto' | 'atrasado' | 'fechado';

// -----------------------------------------------------------------------
// Tipo canonico de status de solicitacao (`cycleUnlockRequests.status`)
// -----------------------------------------------------------------------

export type StatusUnlock = 'pendente' | 'aprovada' | 'recusada' | 'cancelada';

// -----------------------------------------------------------------------
// Labels canonicos literais DOC 05 §14.18 — tabela cycleSchedule
// -----------------------------------------------------------------------

/**
 * Label canonico literal §14.18 para a coluna "Instrumento" do dropdown
 * de filtro e do badge da tabela. Preserva literal bit-exact.
 */
export const TIPO_CICLO_LABEL: Readonly<Record<TipoCiclo, string>> = {
  instrumento_a: 'Autoavaliação',
  instrumento_c: 'Avaliação do colaborador direto/seu líder',
  instrumento_d: 'Avaliação da liderança direta',
  radar_nr1: 'Radar NR-1',
  fechamento_mensal: 'Fechamento mensal',
};

/**
 * Classe CSS canonica do badge por tipo de ciclo. Bit-exact ao mockup
 * `cycle_management_v1.html` (classes `.badge-instrA`, `.badge-instrC`,
 * `.badge-instrD`, `.badge-radar`, `.badge-mensal`).
 */
export const TIPO_CICLO_BADGE_CLASS: Readonly<Record<TipoCiclo, string>> = {
  instrumento_a: 'badge-instrA',
  instrumento_c: 'badge-instrC',
  instrumento_d: 'badge-instrD',
  radar_nr1: 'badge-radar',
  fechamento_mensal: 'badge-mensal',
};

/**
 * Label canonico literal do dropdown de filtro Status §14.18.
 */
export const STATUS_CICLO_LABEL: Readonly<Record<StatusCiclo, string>> = {
  aberto: 'Aberto',
  atrasado: 'Atrasado',
  fechado: 'Fechado',
};

/**
 * Classe CSS canonica do badge por status de ciclo. Bit-exact ao mockup.
 */
export const STATUS_CICLO_BADGE_CLASS: Readonly<Record<StatusCiclo, string>> = {
  aberto: 'badge-aberto',
  atrasado: 'badge-atrasado',
  fechado: 'badge-fechado',
};

// -----------------------------------------------------------------------
// Labels canonicos literais DOC 05 §14.18 — tabela cycleUnlockRequests
// -----------------------------------------------------------------------

/**
 * Label canonico literal da coluna "Aba" na tabela de solicitacoes.
 * Bit-exact ao mockup `cycle_management_v1.html` (abaLabel).
 */
export const ABA_UNLOCK_LABEL: Readonly<Record<AbaUnlock, string>> = {
  rh: 'Dados do RH',
  lider: 'Dados do líder',
  faturamento: 'Dados de faturamento',
};

/**
 * Label canonico literal do badge de status de solicitacao.
 */
export const STATUS_UNLOCK_LABEL: Readonly<Record<StatusUnlock, string>> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

/**
 * Classe CSS canonica do badge por status de solicitacao. Bit-exact ao
 * mockup (`.badge-pendente`, `.badge-aprovada`, `.badge-recusada`,
 * `.badge-cancelada`).
 */
export const STATUS_UNLOCK_BADGE_CLASS: Readonly<Record<StatusUnlock, string>> = {
  pendente: 'badge-pendente',
  aprovada: 'badge-aprovada',
  recusada: 'badge-recusada',
  cancelada: 'badge-cancelada',
};

// -----------------------------------------------------------------------
// Formatacao de datas e meses canonica
// -----------------------------------------------------------------------

/**
 * Nome canonico do mes em portugues (long form). Usado no mockup como
 * "Maio de 2026", "Junho de 2026" etc. Formato canonico bit-exact ao
 * modal `ModalSolicitarDesbloqueio` (ja canonico ME-086b).
 */
const NOMES_MESES_PT: readonly string[] = [
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

/**
 * Converte uma string canonica `YYYY-MM` em label human-readable em
 * portugues: "2026-05" → "Maio de 2026". String fora do formato
 * retorna a propria entrada (fail-safe para evitar crash em dados
 * historicos corrompidos).
 */
export function formatMesLabel(mes: string): string {
  const match = mes.match(/^(\d{4})-(\d{2})$/);
  if (match === null) {
    return mes;
  }
  const ano = match[1];
  const mesStr = match[2];
  if (ano === undefined || mesStr === undefined) {
    return mes;
  }
  const mesIndex = Number.parseInt(mesStr, 10) - 1;
  if (mesIndex < 0 || mesIndex > 11) {
    return mes;
  }
  const nome = NOMES_MESES_PT[mesIndex];
  if (nome === undefined) {
    return mes;
  }
  return `${nome} de ${ano}`;
}

/**
 * Formata uma Date (ou string ISO) para dd/mm/aaaa canonico. Null ou
 * undefined viram "—" bit-exact ao mockup (dataCorte do Radar NR-1 e
 * dataFechamento de ciclo aberto).
 */
export function formatDateBR(d: Date | string | null | undefined): string {
  if (d === null || d === undefined) {
    return '—';
  }
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const dia = String(date.getUTCDate()).padStart(2, '0');
  const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
  const ano = date.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata uma Date para dd/mm/aaaa HH:MM canonico (ex.: "02/07/2026
 * 14:23"). Usado na coluna "Criada em" da tabela de solicitacoes.
 */
export function formatDateTimeBR(d: Date | string | null | undefined): string {
  if (d === null || d === undefined) {
    return '—';
  }
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const dia = String(date.getUTCDate()).padStart(2, '0');
  const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
  const ano = date.getUTCFullYear();
  const hora = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

// -----------------------------------------------------------------------
// Taxa de resposta canonica — barra de progresso §14.18 (coluna Adesao)
// -----------------------------------------------------------------------

/**
 * Faixa canonica da barra de progresso, bit-exact ao mockup:
 *   - 'baixa'  (< 50%)  → `#DC2626` (danger).
 *   - 'media'  (50-84%) → `#D97706` (warning).
 *   - 'alta'   (≥ 85%)  → `#16A34A` (success).
 */
export type FaixaTaxaResposta = 'baixa' | 'media' | 'alta';

export function TAXA_RESPOSTA_FAIXA(pct: number): FaixaTaxaResposta {
  if (pct < 50) {
    return 'baixa';
  }
  if (pct < 85) {
    return 'media';
  }
  return 'alta';
}

/**
 * Calcula a taxa de resposta percentual arredondada canonica
 * (respondidos/elegiveis). Zero elegiveis retorna 0 (evita divisao por
 * zero — padrao canonico do mockup).
 */
export function calcTaxaResposta(respondidos: number | null, elegiveis: number | null): number {
  if (elegiveis === null || elegiveis === 0) {
    return 0;
  }
  const resp = respondidos ?? 0;
  return Math.round((resp / elegiveis) * 100);
}
