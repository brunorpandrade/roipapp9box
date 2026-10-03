// ROIP APP 9BOX — tipos e helpers internos canonicos da rota
// `/cycle-management` (ME-B9.1 §14.18).
//
// Contrato canonico das linhas (rows) consumidas pelo
// `CycleManagementClient.tsx` e produzidas pelas server actions
// `listCycleScheduleAction`, `listPendingUnlockRequestsAction`,
// `listHistoricoUnlockRequestsAction`, `listCalendarioAction`.
//
// Os tipos aqui NAO sao reexportados de outros modulos — sao a camada
// de view-model canonica da rota (DOC 05 §14.18).
//
// **RV-13.** Cada export consumido:
//   - `CycleScheduleRow` → `actions.ts`, `CycleManagementClient.tsx` e
//     testes.
//   - `CycleSchedulePage` → `actions.ts` e cliente.
//   - `UnlockRequestRow` → `actions.ts` e cliente.
//   - `CalendarioEvento` → `calendarioHelpers.ts`, `actions.ts` e cliente.
//   - `CycleActionResult<T>` → todas as actions e cliente.
//   - `okResult`/`errResult` → actions.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { AbaUnlock, TipoCiclo } from '../../db/schema/enums';

import type { StatusCiclo, StatusUnlock } from './mappings';

// -----------------------------------------------------------------------
// View-model: cycleSchedule row (Area 2 §14.18)
// -----------------------------------------------------------------------

/**
 * Linha canonica da tabela `cycleSchedule` para exibicao em `/cycle-management`
 * Area 2. Datas canonicas serializadas como ISO 8601 string (facilita
 * passagem server→client; cliente formata via `formatDateBR`).
 *
 * Colunas canonicas (DOC 05 §14.18): Instrumento, Ciclo (cicloReferencia),
 * Data abertura, Data corte, Data fechamento, Status (badge), Elegiveis,
 * Respondidos, Taxa de resposta (barra). Taxa calculada no cliente via
 * `calcTaxaResposta`.
 */
export interface CycleScheduleRow {
  readonly id: number;
  readonly tipoCiclo: TipoCiclo;
  readonly cicloReferencia: string;
  readonly dataAbertura: string | null;
  readonly dataCorte: string | null;
  readonly dataFechamento: string | null;
  readonly status: StatusCiclo;
  readonly totalElegiveis: number | null;
  readonly totalRespondidos: number | null;
}

/**
 * Pagina canonica retornada por `listCycleScheduleAction`. Contem rows
 * da pagina + total agregado para calculo de paginacao client-side.
 */
export interface CycleSchedulePage {
  readonly rows: readonly CycleScheduleRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// -----------------------------------------------------------------------
// View-model: cycleUnlockRequests row (Area 3 §14.18)
// -----------------------------------------------------------------------

/**
 * Linha canonica das listas Pendentes e Historico de solicitacoes de
 * desbloqueio. `solicitanteNome` e `liderNome` sao resolvidos no server
 * (JOIN com `employees` / `cLevelMembers`) para evitar N+1 no cliente.
 * `decididoPorNome` resolve o `superAdmins.displayName`.
 */
export interface UnlockRequestRow {
  readonly id: number;
  readonly companyId: number;
  readonly mes: string;
  readonly aba: AbaUnlock;
  readonly liderId: number | null;
  readonly liderTipo: 'employee' | 'clevel' | null;
  readonly liderNome: string | null;
  readonly solicitanteTipo: 'employee' | 'clevel';
  readonly solicitanteId: number;
  readonly solicitanteNome: string;
  readonly justificativa: string;
  readonly status: StatusUnlock;
  readonly decididoPor: number | null;
  readonly decididoPorNome: string | null;
  readonly decididoEm: string | null;
  readonly motivoRecusa: string | null;
  readonly comentarioAprovacao: string | null;
  readonly createdAt: string;
}

// -----------------------------------------------------------------------
// View-model: Calendario eventos (Area 1 §14.18)
// -----------------------------------------------------------------------

/**
 * Status visual canonico do card do calendario, bit-exact ao mockup
 * `cycle_management_v1.html`:
 *   - 'concluido' (verde)  — `status='fechado'` com adesao ≥ 80%.
 *   - 'atual'     (teal)   — `status='aberto'` dentro do prazo.
 *   - 'atrasado'  (amarelo)— `status='atrasado'`.
 *   - 'futuro'    (cinza)  — `dataAbertura > NOW()`.
 */
export type CalendarioStatus = 'concluido' | 'atual' | 'atrasado' | 'futuro';

/**
 * Evento canonico do calendario (Area 1). Cada evento corresponde a um
 * marco canonico de ciclo: abertura/corte/fechamento de instrumento, ou
 * mes de fechamento mensal.
 */
export interface CalendarioEvento {
  /** Rotulo "Q2 2026", "Q3 2026" etc. — base de agrupamento visual. */
  readonly trimestre: string;
  /** Data canonica no formato dd/mm/aaaa. */
  readonly data: string;
  /** Titulo do card (ex.: "Abertura Instrumento A"). */
  readonly titulo: string;
  /** Subtitulo (ex.: "Trimestral · Todos exceto C-level"). */
  readonly sub: string;
  /** Estado visual canonico. */
  readonly status: CalendarioStatus;
}

// -----------------------------------------------------------------------
// Contrato canonico de resultado de action (bit-exact ao padrao
// `/pendencias-portal`, `/dados-mensais` e `/central-relatorios`)
// -----------------------------------------------------------------------

export type CycleActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

export function okResult<T>(data: T): CycleActionResult<T> {
  return { ok: true, data };
}

export function errResult<T>(error: string): CycleActionResult<T> {
  return { ok: false, error };
}
