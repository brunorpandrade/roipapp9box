// ROIP APP 9BOX — helpers canonicos da Area 1 do /cycle-management
// (ME-B9.1 §14.18 — Calendario do trimestre corrente/proximo).
//
// Origem canonica:
// - DOC 05 §14.18 Area 1 — cards horizontais compactos; um card por
//   ciclo de instrumento (A, C, D) e um card por mes de fechamento
//   mensal do trimestre; 4 estados visuais canonicos (concluido/atual/
//   atrasado/futuro) determinados por `status` + `dataAbertura` +
//   `respondidos/elegiveis ≥ 80%`.
// - Mockup canonico `cycle_management_v1.html` — define os marcos
//   bit-exact:
//   * abertura de instrumento (A/C/D) — dia 16 do ultimo mes do
//     trimestre.
//   * corte de instrumentos — dia 10 do mes seguinte ao fim do
//     trimestre.
//   * fechamento de instrumento C — dia 11 do mes seguinte.
//   * fechamento mensal — dia 11 do mes subsequente a cada mes do
//     trimestre.
//   * abertura mensal — dia 1 de cada mes.
//
// Funcao pura `resolveCalendarioEventos` — recebe snapshot de
// `cycleSchedule` + `now` + status mensal (opcional) e produz lista
// ordenada de eventos canonicos cobrindo trimestre corrente + proximo.
// Sem acesso a banco — testavel sem I/O.
//
// **RV-13.** Cada export consumido:
//   - `resolveCalendarioEventos` → `actions.ts` e teste unit.
//   - `resolveTrimestre` → `actions.ts` (filtro de `cycleSchedule`
//     pela faixa de trimestres) e teste unit.
//   - `TRIMESTRE_LABELS` → `resolveCalendarioEventos` interno + teste.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { TipoCiclo } from '../../db/schema/enums';

import type { CalendarioEvento, CalendarioStatus, CycleScheduleRow } from './internals';
import { formatDateBR } from './mappings';

// -----------------------------------------------------------------------
// Trimestre canonico — resolucao e navegacao
// -----------------------------------------------------------------------

/**
 * Representacao canonica de um trimestre: `{ ano, numero }` com `numero
 * ∈ {1,2,3,4}`.
 */
export interface Trimestre {
  readonly ano: number;
  readonly numero: 1 | 2 | 3 | 4;
}

/**
 * Resolve o trimestre canonico que contem a data `d`. Trimestre 1 =
 * jan-mar, 2 = abr-jun, 3 = jul-set, 4 = out-dez.
 */
export function resolveTrimestre(d: Date): Trimestre {
  const mes = d.getUTCMonth(); // 0-11
  const ano = d.getUTCFullYear();
  if (mes <= 2) {
    return { ano, numero: 1 };
  }
  if (mes <= 5) {
    return { ano, numero: 2 };
  }
  if (mes <= 8) {
    return { ano, numero: 3 };
  }
  return { ano, numero: 4 };
}

/**
 * Retorna o trimestre canonico imediatamente apos `t`. Avanca de ano
 * quando `t.numero === 4`.
 */
export function nextTrimestre(t: Trimestre): Trimestre {
  if (t.numero === 4) {
    return { ano: t.ano + 1, numero: 1 };
  }
  const num = (t.numero + 1) as 1 | 2 | 3 | 4;
  return { ano: t.ano, numero: num };
}

/**
 * Converte um Trimestre em string canonica "Q2 2026" (formato bit-exact
 * ao mockup).
 */
export function trimestreLabel(t: Trimestre): string {
  return `Q${t.numero} ${t.ano}`;
}

/**
 * Converte um Trimestre em string de referencia canonica
 * `cycleSchedule.cicloReferencia` para instrumentos: "2026-Q2".
 */
export function cicloRefTrimestral(t: Trimestre): string {
  return `${t.ano}-Q${t.numero}`;
}

/**
 * Lista dos 3 meses canonicos de um trimestre no formato `YYYY-MM`.
 * Trimestre 1 = ["YYYY-01","YYYY-02","YYYY-03"] etc.
 */
export function mesesDoTrimestre(t: Trimestre): readonly string[] {
  const inicio = (t.numero - 1) * 3 + 1;
  const mm = (n: number): string => String(n).padStart(2, '0');
  return [`${t.ano}-${mm(inicio)}`, `${t.ano}-${mm(inicio + 1)}`, `${t.ano}-${mm(inicio + 2)}`];
}

/**
 * Ultimo mes canonico (3o mes) do trimestre no formato `YYYY-MM`.
 */
function ultimoMesTrimestre(t: Trimestre): string {
  const meses = mesesDoTrimestre(t);
  return meses[meses.length - 1] ?? `${t.ano}-12`;
}

/**
 * Primeiro mes canonico (1o mes) do trimestre no formato `YYYY-MM`.
 */
function primeiroMesTrimestre(t: Trimestre): string {
  return mesesDoTrimestre(t)[0] ?? `${t.ano}-01`;
}

/**
 * Converte string canonica `YYYY-MM` em Date (dia 1, UTC).
 */
function mesToDate(mes: string, dia: number): Date {
  const parts = mes.split('-').map((s) => Number.parseInt(s, 10));
  const ano = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  return new Date(Date.UTC(ano, m - 1, dia));
}

/**
 * Converte Date em `YYYY-MM`.
 */
function dateToMes(d: Date): string {
  const ano = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mm}`;
}

// -----------------------------------------------------------------------
// Labels canonicos literais bit-exact ao mockup `cycle_management_v1.html`
// -----------------------------------------------------------------------

/**
 * Titulo canonico do card de abertura de instrumento (bit-exact ao
 * mockup).
 */
const TITULO_ABERTURA: Readonly<Record<TipoCiclo, string>> = {
  instrumento_a: 'Abertura Instrumento A',
  instrumento_c: 'Abertura Instrumento C',
  instrumento_d: 'Abertura Instrumento D',
  radar_nr1: 'Abertura Radar NR-1',
  fechamento_mensal: 'Abertura mensal',
};

/**
 * Subtitulo canonico do card de abertura (bit-exact ao mockup).
 */
const SUB_ABERTURA: Readonly<Record<TipoCiclo, string>> = {
  instrumento_a: 'Trimestral · Todos exceto C-level',
  instrumento_c: 'Trimestral · Avaliação do líder',
  instrumento_d: 'Semestral · Avaliação do líder pelos liderados',
  radar_nr1: 'Cadência da empresa · Radar NR-1',
  fechamento_mensal: 'Mensal · lançamentos disponíveis',
};

/**
 * Exportado para teste unit — labels canonicos de trimestre.
 */
export const TRIMESTRE_LABELS = {
  format: trimestreLabel,
  cicloRef: cicloRefTrimestral,
} as const;

// -----------------------------------------------------------------------
// Decisao canonica do status visual
// -----------------------------------------------------------------------

/**
 * Decide o `CalendarioStatus` canonico de uma linha de `cycleSchedule`
 * em relacao ao instante `now`. Regra canonica DOC 05 §14.18:
 *   - 'futuro'   → `dataAbertura > now`.
 *   - 'concluido'→ `status='fechado'` E taxa de resposta ≥ 80%.
 *   - 'atual'    → `status='aberto'` dentro do prazo.
 *   - 'atrasado' → `status='atrasado'`, OU `status='fechado'` com adesao
 *                   < 80% (visualmente degradado como "atrasado").
 */
function decideStatusVisual(row: CycleScheduleRow, now: Date): CalendarioStatus {
  if (row.dataAbertura !== null) {
    const abertura = new Date(row.dataAbertura);
    if (!Number.isNaN(abertura.getTime()) && abertura.getTime() > now.getTime()) {
      return 'futuro';
    }
  }
  if (row.status === 'aberto') {
    return 'atual';
  }
  if (row.status === 'atrasado') {
    return 'atrasado';
  }
  // row.status === 'fechado'
  const elegiveis = row.totalElegiveis ?? 0;
  const respondidos = row.totalRespondidos ?? 0;
  if (elegiveis === 0) {
    return 'concluido';
  }
  const pct = (respondidos / elegiveis) * 100;
  return pct >= 80 ? 'concluido' : 'atrasado';
}

// -----------------------------------------------------------------------
// Resolve eventos canonicos
// -----------------------------------------------------------------------

/**
 * Produz a lista canonica de eventos do calendario a partir de uma
 * snapshot de `cycleSchedule` filtrada pelo trimestre corrente + proximo.
 *
 * Para cada row:
 *   - instrumento (A/C/D/NR-1): emite 1 evento "Abertura ..." em
 *     `dataAbertura`.
 *   - fechamento_mensal: emite 1 evento "Fechamento MM/AAAA" em
 *     `dataFechamento` (ou dataCorte se dataFechamento for null — ciclo
 *     ainda aberto).
 *
 * Ordenacao canonica final: por `trimestre.ano, trimestre.numero`
 * ascendente e, dentro do mesmo trimestre, por data ascendente.
 */
export function resolveCalendarioEventos(
  rows: readonly CycleScheduleRow[],
  now: Date,
): readonly CalendarioEvento[] {
  const trimestreAtual = resolveTrimestre(now);
  const trimestreProximo = nextTrimestre(trimestreAtual);

  const eventosRaw: Array<CalendarioEvento & { readonly ordem: number }> = [];

  for (const row of rows) {
    const evento = resolveEventoFromRow(row, now, trimestreAtual, trimestreProximo);
    if (evento !== null) {
      eventosRaw.push(evento);
    }
  }

  eventosRaw.sort((a, b) => {
    if (a.trimestre !== b.trimestre) {
      return a.trimestre.localeCompare(b.trimestre);
    }
    return a.ordem - b.ordem;
  });

  return eventosRaw.map((e) => ({
    trimestre: e.trimestre,
    data: e.data,
    titulo: e.titulo,
    sub: e.sub,
    status: e.status,
  }));
}

/**
 * Converte 1 row de cycleSchedule em 1 evento de calendario, ou null se
 * a row nao se encaixa no trimestre corrente/proximo.
 */
function resolveEventoFromRow(
  row: CycleScheduleRow,
  now: Date,
  tAtual: Trimestre,
  tProximo: Trimestre,
): (CalendarioEvento & { readonly ordem: number }) | null {
  const trimestreDaRow = classificarTrimestreDaRow(row);
  if (trimestreDaRow === null) {
    return null;
  }

  const dentroAtual = trimestreDaRow.ano === tAtual.ano && trimestreDaRow.numero === tAtual.numero;
  const dentroProximo =
    trimestreDaRow.ano === tProximo.ano && trimestreDaRow.numero === tProximo.numero;

  if (!dentroAtual && !dentroProximo) {
    return null;
  }

  if (row.tipoCiclo === 'fechamento_mensal') {
    return eventoFechamentoMensal(row, now, trimestreDaRow);
  }

  return eventoInstrumento(row, now, trimestreDaRow);
}

/**
 * Classifica o trimestre canonico de uma row:
 *   - instrumentos (A/C/D): `cicloReferencia` no formato "YYYY-QN"
 *     identifica o trimestre direto.
 *   - fechamento_mensal: `cicloReferencia` no formato "YYYY-MM" cai no
 *     trimestre do mes.
 *   - radar_nr1: `cicloReferencia` no formato "YYYY-NN" (sequencial da
 *     empresa) nao mapeia 1:1 a trimestre; usamos `dataAbertura` para
 *     classificar.
 */
function classificarTrimestreDaRow(row: CycleScheduleRow): Trimestre | null {
  const ref = row.cicloReferencia;
  const matchQ = ref.match(/^(\d{4})-Q([1-4])$/);
  if (matchQ !== null) {
    const anoStr = matchQ[1];
    const numStr = matchQ[2];
    if (anoStr !== undefined && numStr !== undefined) {
      const ano = Number.parseInt(anoStr, 10);
      const numero = Number.parseInt(numStr, 10) as 1 | 2 | 3 | 4;
      return { ano, numero };
    }
  }
  const matchM = ref.match(/^(\d{4})-(\d{2})$/);
  if (matchM !== null) {
    const anoStr = matchM[1];
    const mesStr = matchM[2];
    if (anoStr !== undefined && mesStr !== undefined) {
      const ano = Number.parseInt(anoStr, 10);
      const mes = Number.parseInt(mesStr, 10);
      const data = new Date(Date.UTC(ano, mes - 1, 15));
      return resolveTrimestre(data);
    }
  }
  if (row.dataAbertura !== null) {
    const d = new Date(row.dataAbertura);
    if (!Number.isNaN(d.getTime())) {
      return resolveTrimestre(d);
    }
  }
  return null;
}

function eventoInstrumento(
  row: CycleScheduleRow,
  now: Date,
  t: Trimestre,
): (CalendarioEvento & { readonly ordem: number }) | null {
  if (row.dataAbertura === null) {
    return null;
  }
  const abertura = new Date(row.dataAbertura);
  if (Number.isNaN(abertura.getTime())) {
    return null;
  }
  return {
    trimestre: trimestreLabel(t),
    data: formatDateBR(abertura),
    titulo: TITULO_ABERTURA[row.tipoCiclo],
    sub: SUB_ABERTURA[row.tipoCiclo],
    status: decideStatusVisual(row, now),
    ordem: abertura.getTime(),
  };
}

function eventoFechamentoMensal(
  row: CycleScheduleRow,
  now: Date,
  t: Trimestre,
): (CalendarioEvento & { readonly ordem: number }) | null {
  const dataRef = row.dataFechamento ?? row.dataCorte ?? row.dataAbertura;
  if (dataRef === null) {
    return null;
  }
  const data = new Date(dataRef);
  if (Number.isNaN(data.getTime())) {
    return null;
  }
  const mes = row.cicloReferencia;
  const mesLabelMap: Readonly<Record<string, string>> = {
    '01': 'janeiro',
    '02': 'fevereiro',
    '03': 'março',
    '04': 'abril',
    '05': 'maio',
    '06': 'junho',
    '07': 'julho',
    '08': 'agosto',
    '09': 'setembro',
    '10': 'outubro',
    '11': 'novembro',
    '12': 'dezembro',
  };
  const mMatch = mes.match(/^(\d{4})-(\d{2})$/);
  let titulo = `Fechamento ${mes}`;
  if (mMatch !== null) {
    const anoStr = mMatch[1];
    const mesKey = mMatch[2];
    if (anoStr !== undefined && mesKey !== undefined) {
      const nomeMes = mesLabelMap[mesKey] ?? mesKey;
      titulo = `Fechamento ${nomeMes}/${anoStr}`;
    }
  }
  return {
    trimestre: trimestreLabel(t),
    data: formatDateBR(data),
    titulo,
    sub: 'Mensal · fechamento automático',
    status: decideStatusVisual(row, now),
    ordem: data.getTime(),
  };
}

// -----------------------------------------------------------------------
// Helpers reexportados (consumidos externamente — RV-13)
// -----------------------------------------------------------------------

export { mesToDate as _mesToDate, dateToMes as _dateToMes };
export { ultimoMesTrimestre as _ultimoMesTrimestre, primeiroMesTrimestre as _primeiroMesTrimestre };
