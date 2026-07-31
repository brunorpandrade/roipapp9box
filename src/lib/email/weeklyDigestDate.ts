// ROIP APP 9BOX — utilitario canonico de weekStart/weekEnd do digest
// semanal (ME-060).
//
// Origem canonica:
// - DOC 06 §11.5 passo 1 ("Calcula `weekStart` (segunda 08:00 fuso local)
//   e `weekEnd` (segunda seguinte 08:00 fuso local)").
// - DOC 06 §11.4 passo 1-2 ("Calcula hora local usando `companies.timezone`
//   (fallback silencioso `America/Sao_Paulo` se NULL). Se hora local nao
//   e segunda-feira 08:00, pula empresa").
// - DOC 06 §12.7 (Template B — assunto usa `weekStart_DD/MM/YYYY` a
//   `weekEnd_DD/MM/YYYY`; corpo usa `weekStart_DD/MM` a `weekEnd_DD/MM`).
//
// Contrato canonico:
// - Funcao pura sem I/O. Complementa `nextWeeklyDigestDate` do motor
//   ME-059 (que calcula a proxima segunda 08h para *enfileiramento* de
//   linhas em `emailQueue`); este utilitario calcula a semana ATUAL para
//   *leitura* das linhas ja enfileiradas + composicao do template B.
// - `weekStart` e `weekEnd` retornam Date UTC canonica, ambos apontando
//   para segunda-feira 08:00 no fuso local. `weekEnd - weekStart = 7 dias`.
// - `formatWeekRangeDDMM` e `formatWeekRangeDDMMYYYY` formatam para o
//   template B (§12.7 variaveis canonicas). Formato canonico
//   `DD/MM/YYYY` e `DD/MM` — sempre com zero-padding (U7).
// - Reutiliza `TIMEZONE_FALLBACK` do motor para consistencia canonica.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `getWeekBounds` → `jobs/weeklyDigestJob.ts` + testes.
//   - `isMondayEightAmLocal` → `jobs/weeklyDigestJob.ts` + testes.
//   - `formatWeekRangeDDMM` → `jobs/weeklyDigestJob.ts` + testes.
//   - `formatWeekRangeDDMMYYYY` → `jobs/weeklyDigestJob.ts` + testes.

import { TIMEZONE_FALLBACK } from '../alerts/pipeline/nextWeeklyDigestDate';

const MONDAY_ISO_INDEX = 1 as const;
const DIGEST_HOUR_LOCAL = 8 as const;
const DAYS_PER_WEEK = 7 as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number;
}

function getZonedParts(now: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const weekdayShort = byType.get('weekday') ?? 'Mon';
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(byType.get('year') ?? '1970'),
    month: Number(byType.get('month') ?? '01'),
    day: Number(byType.get('day') ?? '01'),
    hour: Number(byType.get('hour') ?? '00'),
    minute: Number(byType.get('minute') ?? '00'),
    weekday: weekdayMap[weekdayShort] ?? 1,
  };
}

function timezoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = getZonedParts(new Date(utcMs), timezone);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return asIfUtc - utcMs;
}

/**
 * Testa canonicamente se o instante `now` cai exatamente na hora canonica
 * do digest (segunda-feira 08:00, minuto 00) no `timezone`. Consumido pelo
 * `runWeeklyDigestJob` (§11.4 passo 2) como filtro de empresa.
 *
 * O worker roda em cron horario UTC — este helper transforma "hora local"
 * em decisao boolean sem ambiguidade. Aceita como segunda-feira 08:00 o
 * intervalo canonico `[08:00, 08:59]` no fuso local: o worker executa a
 * cada hora UTC e uma unica invocacao por semana precisa disparar quando
 * o fuso local esta na segunda 08.
 */
export function isMondayEightAmLocal(now: Date, timezone: string): boolean {
  const local = getZonedParts(now, timezone);
  return local.weekday === MONDAY_ISO_INDEX && local.hour === DIGEST_HOUR_LOCAL;
}

/**
 * Calcula os limites canonicos da semana corrente do digest: `weekStart`
 * = segunda-feira 08:00 fuso local do instante `now` (assumido no dia da
 * execucao, coerente com o filtro `isMondayEightAmLocal`); `weekEnd` =
 * segunda-feira seguinte 08:00 fuso local (i.e., `weekStart + 7 dias`).
 * Ambos convertidos a UTC.
 *
 * Racional canonico §11.5:
 * - As linhas de `emailQueue` com `tipoEnvio='digest_semanal'`
 *   enfileiradas nesta semana tem `scheduledFor = weekStart` (calculo
 *   canonico do M7 via `nextWeeklyDigestDate`).
 * - `weekEnd` cobre canonicamente ate a proxima segunda 08:00 (janela
 *   `BETWEEN weekStart AND weekEnd` do §11.5 passo 2 e canonicamente
 *   fechada em ambos os lados; linhas com `scheduledFor === weekEnd`
 *   pertencem a proxima semana, mas neste ciclo canonico o segundo par
 *   nunca ocorre porque `runWeeklyDigestJob` roda uma vez por semana).
 */
export function getWeekBounds(
  now: Date,
  timezone: string,
): { readonly weekStart: Date; readonly weekEnd: Date } {
  const local = getZonedParts(now, timezone);
  if (local.weekday !== MONDAY_ISO_INDEX) {
    throw new Error(
      'getWeekBounds: chamado fora do gatilho canonico (segunda-feira). ' +
        'Use isMondayEightAmLocal como guarda antes de invocar.',
    );
  }

  // Constroi segunda 08:00 fuso local (mesmo dia local de `now`) em UTC.
  const candidateAsUtcMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    DIGEST_HOUR_LOCAL,
    0,
    0,
  );
  const offsetMs = timezoneOffsetMs(candidateAsUtcMs, timezone);
  const weekStart = new Date(candidateAsUtcMs - offsetMs);

  // weekEnd = weekStart + 7 dias (mesmo horario local; DST resolvido
  // pelo somatorio direto porque o offset da proxima segunda pode diferir
  // do offset da segunda atual — aplicamos correcao delta).
  const naiveEndMs = weekStart.getTime() + DAYS_PER_WEEK * MS_PER_DAY;
  const startOffset = timezoneOffsetMs(weekStart.getTime(), timezone);
  const endOffset = timezoneOffsetMs(naiveEndMs, timezone);
  const dstCorrection = endOffset - startOffset;
  const weekEnd = new Date(naiveEndMs - dstCorrection);

  return { weekStart, weekEnd };
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formata a data no formato canonico `DD/MM` (U7 — sem ano, sem hora)
 * usando as componentes do fuso alvo. Consumido pelo corpo do template B
 * (§12.7): "resumo dos alertas acumulados na semana de {weekStart_DD/MM}
 * a {weekEnd_DD/MM}".
 */
export function formatWeekRangeDDMM(
  weekStart: Date,
  weekEnd: Date,
  timezone: string = TIMEZONE_FALLBACK,
): { readonly startDDMM: string; readonly endDDMM: string } {
  const startParts = getZonedParts(weekStart, timezone);
  const endParts = getZonedParts(weekEnd, timezone);
  return {
    startDDMM: `${padTwo(startParts.day)}/${padTwo(startParts.month)}`,
    endDDMM: `${padTwo(endParts.day)}/${padTwo(endParts.month)}`,
  };
}

/**
 * Formata a data no formato canonico `DD/MM/YYYY` (U7 — sem hora) usando
 * as componentes do fuso alvo. Consumido pelo assunto do template B
 * (§12.7): "Resumo semanal de alertas ({weekStart_DD/MM/YYYY} a
 * {weekEnd_DD/MM/YYYY})".
 */
export function formatWeekRangeDDMMYYYY(
  weekStart: Date,
  weekEnd: Date,
  timezone: string = TIMEZONE_FALLBACK,
): { readonly startFull: string; readonly endFull: string } {
  const startParts = getZonedParts(weekStart, timezone);
  const endParts = getZonedParts(weekEnd, timezone);
  return {
    startFull: `${padTwo(startParts.day)}/${padTwo(startParts.month)}/${startParts.year}`,
    endFull: `${padTwo(endParts.day)}/${padTwo(endParts.month)}/${endParts.year}`,
  };
}
