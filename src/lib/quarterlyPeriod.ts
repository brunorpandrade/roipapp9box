// ROIP APP 9BOX — helpers canonicos de calendario trimestral (ME-031).
//
// Puros — sem I/O, sem banco, sem dependencias externas. Consumidos pelo
// `monthlyClosureOrchestrator` (DOC 03 §18 + §4) e reusaveis por motores
// futuros do Bloco B3 (`roiCalculationEngine`, IQL, 9-Box, exportacoes
// trimestrais). Reusa parse/format de `src/lib/cycleDates.ts`.
//
// Semantica canonica:
//   - Trimestres seguem o calendario civil brasileiro (DOC 03 §3.1):
//     Q1=Jan-Fev-Mar; Q2=Abr-Mai-Jun; Q3=Jul-Ago-Set; Q4=Out-Nov-Dez.
//   - `mesToTrimestre('YYYY-MM')` deriva o trimestre canonico do mes.
//   - `getQuarterMonths('YYYY-QN')` retorna os 3 meses do trimestre em
//     ordem crescente.
//   - `isThirdMonthOfQuarter('YYYY-MM')` responde se o mes fecha o
//     trimestre (Mar/Jun/Set/Dez) — gatilho canonico do calculo
//     trimestral do Eixo X (DOC 03 §3.11 `triggerQuarterlyCalculation`).

import {
  formatMensalCicloReferencia,
  formatTrimestreCicloReferencia,
  getLastMonthOfTrimestre,
  getTrimestreFromMonth,
  parseMensalCicloReferencia,
  parseTrimestreCicloReferencia,
  type Trimestre,
} from './cycleDates';

// ============================================================
// Conversao mes → trimestre e trimestre → meses
// ============================================================

/**
 * Converte um `cicloReferencia` mensal (`YYYY-MM`) no `cicloReferencia`
 * trimestral canonico (`YYYY-QN`) que o contem. Retorna `null` se a
 * entrada nao bate no formato canonico mensal.
 *
 * Exemplos canonicos:
 *   - `2026-01` → `2026-Q1`.
 *   - `2026-03` → `2026-Q1`.
 *   - `2026-04` → `2026-Q2`.
 *   - `2026-12` → `2026-Q4`.
 */
export function mesToTrimestre(mes: string): string | null {
  const parsed = parseMensalCicloReferencia(mes);
  if (!parsed) return null;
  const trimestre = getTrimestreFromMonth(parsed.mes);
  return formatTrimestreCicloReferencia(parsed.ano, trimestre);
}

/**
 * Retorna os 3 meses canonicos de um trimestre em ordem crescente, no
 * formato `YYYY-MM`. Retorna `null` se a entrada nao bate no formato
 * canonico trimestral.
 *
 * Exemplos canonicos:
 *   - `2026-Q1` → `['2026-01', '2026-02', '2026-03']`.
 *   - `2026-Q3` → `['2026-07', '2026-08', '2026-09']`.
 *   - `2026-Q4` → `['2026-10', '2026-11', '2026-12']`.
 */
export function getQuarterMonths(trimestre: string): string[] | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) return null;
  const ultimoMes = getLastMonthOfTrimestre(parsed.trimestre);
  const primeiroMes = ultimoMes - 2;
  return [
    formatMensalCicloReferencia(parsed.ano, primeiroMes),
    formatMensalCicloReferencia(parsed.ano, primeiroMes + 1),
    formatMensalCicloReferencia(parsed.ano, ultimoMes),
  ];
}

// ============================================================
// Inspetores canonicos
// ============================================================

/**
 * Retorna `true` se `mes` (`YYYY-MM`) e o terceiro mes de um trimestre
 * canonico — ou seja, Mar/Jun/Set/Dez. Gatilho canonico do calculo
 * trimestral do Eixo X (DOC 03 §3.11 `triggerQuarterlyCalculation`
 * "acionada por `triggerMonthlyProcessing` quando o terceiro mes do
 * trimestre e fechado"). Retorna `false` se a entrada nao bate no
 * formato canonico mensal.
 */
export function isThirdMonthOfQuarter(mes: string): boolean {
  const parsed = parseMensalCicloReferencia(mes);
  if (!parsed) return false;
  return parsed.mes === getLastMonthOfTrimestre(getTrimestreFromMonth(parsed.mes));
}

/**
 * Deriva o trimestre canonico do `Date` no fuso local da empresa.
 * Retorna `{ano, trimestre}` estruturado — util para o motor consumir
 * sem re-parse. Aceita datas literais deterministicas (nao le
 * `Date.now()`).
 */
export function getTrimestreFromDateInTimezone(
  now: Date,
  timeZone: string,
): { ano: number; trimestre: Trimestre } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const ano = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const mes = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
  return { ano, trimestre: getTrimestreFromMonth(mes) };
}
