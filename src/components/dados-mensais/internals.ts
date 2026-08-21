// ROIP APP 9BOX — helpers canonicos do componente compartilhado
// `DadosMensaisClient` (ME-086b). Extracao canonica bit-exact do
// helpers-antigo `src/app/super-admin/empresa/[id]/dados-mensais/
// internals.ts` — mesmas constantes puras + tipos + helpers de mes.
//
// Origem canonica:
// - CAMADA_UI §14.13 (dados mensais RH — abas + navegacao por mes +
//   comportamento por status).
// - CAMADA_AUTH §10.4 (matriz de perfis).
// - CAMADA_NEGOCIO §11 (motor de dados mensais).
// - MASTER_ESCOPO_B9.md §3.5 (ficha ME-086 — canoniza extracao para
//   `src/components/dados-mensais/`).
//
// D-086b-2 B aprovada bit-exact: extracao canonica para
// `src/components/dados-mensais/` seguindo precedente L125 da
// ME-B9-CR (RelatoriosClient compartilhado). Rota super-admin +
// rota RH consomem via import.
//
// IMPORTANTE (CC071 canonica): este modulo e importado por
// `DadosMensaisClient.tsx` (client component — `'use client'`).
// Portanto, NAO pode importar VALUE-LEVEL de routers, services,
// db/client ou qualquer modulo que transite por `mysql2`,
// `node:crypto` ou `node:buffer`. Apenas constantes puras, tipos
// (`import type`) e funcoes sem side-effects.
//
// **RV-13.** Todo export tem consumidor real:
//   - `DADOS_MENSAIS_TABS`, `DadosMensaisTab`,
//     `DADOS_MENSAIS_TAB_DEFAULT` → `DadosMensaisClient.tsx` + testes.
//   - `parseTabParam` → `page.tsx` (super-admin + RH).
//   - `formatMesLabel`, `prevMes`, `nextMes`, `currentMes` →
//     `DadosMensaisClient.tsx` + testes.
//   - `STATUS_LABELS`, `STATUS_COLORS`, `TAB_LABELS`, `StatusMes` →
//     `DadosMensaisClient.tsx`.
//   - Types `DadosMensaisVariant`, `DadosMensaisClientActions`,
//     `DadosMensaisClientProps` → consumidos pelas 2 rotas + testes.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type {
  LeaderStatusRow,
  MonthlyInputFormResult,
  SaveMonthlyDataResult,
} from '../../server/routers/monthlyData';
import type {
  StatusMesClosure,
  UltimoDesbloqueioResumo,
} from '../../server/routers/monthlyClosure';

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact
// -----------------------------------------------------------------------

/** §14.13 — 2 abas horizontais da rota `/dados-mensais`. */
export const DADOS_MENSAIS_TABS = ['rh', 'lider'] as const;

/** Tipo canonico das abas. */
export type DadosMensaisTab = (typeof DADOS_MENSAIS_TABS)[number];

/** Aba default canonica — sempre RH na chegada (§14.13). */
export const DADOS_MENSAIS_TAB_DEFAULT: DadosMensaisTab = 'rh';

// ME-080a — parser de `?tab=` na URL. Padrao identico ao super-admin
// original bit-exact. Aceita apenas valores canonicos; qualquer outro
// devolve o default `rh`. Consumido por `page.tsx` (super-admin + RH)
// para calcular `initialTab` passado ao Client.
export function parseTabParam(raw: string | undefined): DadosMensaisTab {
  if (raw === 'lider') {
    return 'lider';
  }
  return DADOS_MENSAIS_TAB_DEFAULT;
}

/** §14.13 rotulos canonicos das abas. */
export const TAB_LABELS: Record<DadosMensaisTab, string> = {
  rh: 'Dados do RH',
  lider: 'Dados dos líderes',
};

/** §14.13 rotulos canonicos de status do mes. */
export const STATUS_LABELS = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  desbloqueado: 'Desbloqueado',
} as const;

/** §14.13 cores canonicas de status do mes. */
export const STATUS_COLORS = {
  aberto: { bg: '#DCFCE7', text: '#166534' },
  fechado: { bg: '#F3F4F6', text: '#374151' },
  desbloqueado: { bg: '#FEF3C7', text: '#92400E' },
} as const;

/** Status possiveis do mes. */
export type StatusMes = 'aberto' | 'fechado' | 'desbloqueado';

// -----------------------------------------------------------------------
// Variant canonica + contrato canonico de actions injetadas
// -----------------------------------------------------------------------

/**
 * D-086b-2 B canonica. Duas variantes canonicas do componente
 * compartilhado:
 *   - `super_admin`: Bruno navegando em `/super-admin/empresa/[id]/
 *     dados-mensais`. Mostra botao `[Desbloquear mes]` §14.17;
 *     nao mostra `[Solicitar desbloqueio]`. Injeta `unlockMonth` e
 *     `saveMonthlyLeaderData` nas actions.
 *   - `rh`: RH (puro/Lider) navegando em `/dados-mensais`. Nao mostra
 *     `[Desbloquear mes]`; mostra `[Solicitar desbloqueio]` §14.13
 *     conforme comportamento canonico D051/D052/D053. Aba Lideres
 *     read-only (D-086b-5 A). Injeta `createUnlockRequest` +
 *     `hasPendingRequest` + `listMesesFechados` + `listCompanyLeaders`.
 */
export type DadosMensaisVariant = 'super_admin' | 'rh';

/** Contrato canonico bit-exact do retorno das actions. */
export type DadosMensaisActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

/** Retorno canonico da closure status. */
export interface DadosMensaisClosureStatus {
  readonly status: StatusMesClosure;
  readonly ultimoDesbloqueio: UltimoDesbloqueioResumo | null;
}

/** Retorno canonico da listagem de meses fechados (para select modal). */
export interface DadosMensaisMesFechado {
  readonly mes: string;
  readonly label: string;
}

/** Retorno canonico da listagem de lideres para modal aba='lider'. */
export interface DadosMensaisLeaderOption {
  readonly id: number;
  readonly tipo: 'employee' | 'clevel';
  readonly name: string;
}

/**
 * D-086b-2 B canonica. Contrato de actions injetadas via prop.
 * Actions comuns (todas as variantes):
 *   - `loadMonthlyForm`, `saveMonthlyRHData`, `getClosureStatus`,
 *     `getLeadersStatus`.
 * Actions especificas de variant='super_admin':
 *   - `unlockMonth` (§14.17), `saveMonthlyLeaderData` (edicao aba lider).
 * Actions especificas de variant='rh':
 *   - `createUnlockRequest` (§14.16), `hasPendingRequest` (§14.13
 *     comportamento canonico D051/D052/D053), `listMesesFechados`
 *     (opcoes do select `mes` no modal), `listCompanyLeaders`
 *     (opcoes do select `liderId` no modal quando aba='Lider').
 *
 * Padrao canonico bit-exact ao `RelatoriosClientActions` (ME-B9-CR).
 */
export interface DadosMensaisClientActions {
  readonly loadMonthlyForm: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider';
  }) => Promise<DadosMensaisActionResult<MonthlyInputFormResult>>;
  readonly saveMonthlyRHData: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly diasUteis: number;
    readonly colaboradores: ReadonlyArray<{
      readonly employeeId: number;
      readonly custoTotalMes: string;
      readonly faltas: number;
    }>;
  }) => Promise<DadosMensaisActionResult<SaveMonthlyDataResult>>;
  readonly getClosureStatus: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<DadosMensaisActionResult<DadosMensaisClosureStatus>>;
  readonly getLeadersStatus: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<DadosMensaisActionResult<LeaderStatusRow[]>>;
  // Especifica canonica de variant='super_admin' (opcional na variant='rh')
  readonly unlockMonth?: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider' | 'faturamento';
    readonly justificativa: string;
  }) => Promise<DadosMensaisActionResult>;
  // Especificas canonicas de variant='rh' (opcionais na variant='super_admin')
  readonly createUnlockRequest?: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider' | 'faturamento';
    readonly liderId?: number;
    readonly liderTipo?: 'employee' | 'clevel';
    readonly justificativa: string;
  }) => Promise<DadosMensaisActionResult<{ readonly id: number }>>;
  readonly hasPendingRequest?: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider' | 'faturamento';
    readonly liderId?: number;
  }) => Promise<
    DadosMensaisActionResult<{
      readonly hasPending: boolean;
      readonly requestedAt: string | null;
    }>
  >;
  readonly listMesesFechados?: (input: {
    readonly companyId: number;
  }) => Promise<DadosMensaisActionResult<DadosMensaisMesFechado[]>>;
  readonly listCompanyLeaders?: (input: {
    readonly companyId: number;
  }) => Promise<DadosMensaisActionResult<DadosMensaisLeaderOption[]>>;
}

/** Props canonicas do componente compartilhado. */
export interface DadosMensaisClientProps {
  readonly companyId: number;
  readonly companyName: string;
  readonly initialMes: string;
  readonly initialStatus: string;
  readonly initialTab: DadosMensaisTab;
  readonly variant: DadosMensaisVariant;
  readonly actions: DadosMensaisClientActions;
}

// -----------------------------------------------------------------------
// Helpers de mes (puras, sem side-effects)
// -----------------------------------------------------------------------

const MESES_PT = [
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
] as const;

/**
 * Retorna o mes atual no formato canonico `YYYY-MM`.
 */
export function currentMes(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Formata `YYYY-MM` para rotulo em portugues (ex: "Junho 2026").
 */
export function formatMesLabel(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) {
    return mes;
  }
  return `${MESES_PT[monthIdx]} ${year}`;
}

/**
 * Navega para o mes anterior de `YYYY-MM`.
 */
export function prevMes(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  let y = Number(yearStr);
  let m = Number(monthStr);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Navega para o mes seguinte de `YYYY-MM`.
 */
export function nextMes(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  let y = Number(yearStr);
  let m = Number(monthStr);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}
