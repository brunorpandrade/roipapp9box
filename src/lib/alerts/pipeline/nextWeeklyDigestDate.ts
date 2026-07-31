// ROIP APP 9BOX — utilitario canonico do calculo da proxima segunda 08h
// fuso local convertida a UTC (§8.9 M7 digest_semanal — ME-059).
//
// Origem canonica:
// - DOC 06 §8.9 (calculo canonico linha 891):
//     1. Obter fuso local via `companies.timezone` (fallback silencioso
//        `America/Sao_Paulo` se NULL).
//     2. Calcular data corrente no fuso local.
//     3. Se hoje e segunda antes das 08:00 fuso local: proxima segunda
//        = hoje.
//     4. Caso contrario: proxima segunda = proxima segunda-feira apos
//        hoje.
//     5. Combinar data com 08:00 fuso local.
//     6. Converter para UTC.
//
// Contrato canonico:
// - Funcao pura sem I/O. Entrada: `now` (data referencia) + `timezone`
//   (string IANA). Saida: `Date` UTC canonica.
// - O caller (M7) resolve `timezone` a partir de `companies.timezone`
//   antes de invocar. Fallback `'America/Sao_Paulo'` aplicado no proprio
//   caller quando o campo e NULL.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TIMEZONE_FALLBACK` (constante) → consumido por
//     `pipeline/m7-enqueue.ts` como default quando `companies.timezone`
//     e NULL + testes unitarios.
//   - `nextWeeklyDigestDate` → consumido por `pipeline/m7-enqueue.ts`
//     e testes unitarios.

/**
 * Fuso local canonico de fallback quando `companies.timezone` e NULL
 * (§8.9 passo 1). Preserva canonizacao Fase 6/8 (fuso operacional
 * padrao das PMEs brasileiras do ROIP).
 */
export const TIMEZONE_FALLBACK = 'America/Sao_Paulo' as const;

/**
 * Weekday canonico Monday na convencao ISO (1=Monday, 7=Sunday). Usado
 * apenas internamente pelo calculo.
 */
const MONDAY_ISO_INDEX = 1 as const;

/**
 * Extrai partes de data/hora de `now` no `timezone` alvo usando
 * `Intl.DateTimeFormat` canonico. Preserva bit-exact os componentes
 * `{year, month, day, hour, minute, second, weekday}`.
 */
interface ZonedParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
  readonly second: number; // 0-59
  readonly weekday: number; // 1-7 (Mon=1)
}

function getZonedParts(now: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
    second: Number(byType.get('second') ?? '00'),
    weekday: weekdayMap[weekdayShort] ?? 1,
  };
}

/**
 * Calcula o offset canonico entre UTC e `timezone` para o instante
 * `utcMs`. Retorno em milissegundos: `zonedTime - utcTime`.
 *
 * Implementacao canonica: le partes zonais de `utcMs` no `timezone`,
 * reconstroi como se fosse UTC, subtrai do `utcMs` original. Estavel
 * para todos os fusos IANA — incluindo DST transicoes onde o offset
 * muda.
 */
function timezoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = getZonedParts(new Date(utcMs), timezone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - utcMs;
}

/**
 * Calcula a proxima segunda-feira 08:00 no fuso `timezone`, convertida
 * a UTC. Aplica bit-exact os 6 passos do §8.9 linha 891.
 *
 * Comportamento canonico:
 * - Se hoje for segunda antes das 08:00 fuso local → resultado = hoje
 *   08:00 fuso local convertido a UTC.
 * - Caso contrario → resultado = proxima segunda 08:00 fuso local
 *   convertido a UTC.
 *
 * Nao normaliza `now` — se `now` chega em UTC (padrao Node), o calculo
 * usa `now` como-e para determinar o "hoje no fuso local".
 */
export function nextWeeklyDigestDate(now: Date, timezone: string): Date {
  const local = getZonedParts(now, timezone);

  // Passo 3-4: determinar quantos dias adicionar para chegar em segunda
  // 08:00 fuso local. Se hoje ja e segunda antes das 08h, addDays = 0.
  let addDays: number;
  if (local.weekday === MONDAY_ISO_INDEX && local.hour < 8) {
    addDays = 0;
  } else if (local.weekday === MONDAY_ISO_INDEX) {
    addDays = 7; // segunda-feira ja passou de 08h — proxima segunda
  } else {
    // Mon=1, Tue=2, ..., Sun=7 → dias ate proxima segunda
    // Se Tue (2) → 6 dias, Wed (3) → 5, ..., Sun (7) → 1.
    addDays = ((7 - local.weekday) % 7) + 1;
  }

  // Passo 5: construir o instante `year-month-day 08:00:00` no fuso
  // local. Fazemos primeiro em UTC para pegar o offset.
  const targetYear = local.year;
  const targetMonth = local.month; // 1-12
  const targetDay = local.day + addDays;

  // Cria "candidato UTC" com as componentes do fuso local — este NAO e
  // o instante final. Precisamos aplicar o offset do fuso.
  const candidateAsUtcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, 8, 0, 0);

  // Offset do fuso na data alvo (pode diferir de now devido a DST).
  const offsetMs = timezoneOffsetMs(candidateAsUtcMs, timezone);

  // Passo 6: UTC final = candidato interpretado como local - offset.
  return new Date(candidateAsUtcMs - offsetMs);
}
