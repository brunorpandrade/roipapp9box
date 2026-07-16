// ROIP APP 9BOX — helpers canonicos de data para o motor de ciclos
// automaticos (ME-030). Puros — sem I/O, sem banco, sem dependencias
// externas. Consumidos pelo `cycleScheduleEngine` (DOC 03 §17 + DOC 06
// §14) e testaveis unitariamente com datas literais.
//
// Escopo canonico:
//   - parse/format de `cicloReferencia` para os 2 formatos canonicos
//     (`YYYY-QN` para instrumento A/C/D; `YYYY-MM` para fechamento
//     mensal).
//   - calculo canonico de `dataAbertura` e `dataCorte` de cada tipo,
//     respeitando o fuso local da empresa (DOC 06 §14.5 — `America/
//     Sao_Paulo` no default de `companies.timezone`; suporta demais
//     timezones IANA sem alteracao de codigo).
//   - iteradores canonicos `nextInstrumentoABCiclos`, `nextInstrumentoDCiclos`
//     e `nextFechamentoMensalCiclos` para o horizonte de 6 meses (DOC 06
//     §14.5).
//   - inspetores de calendario local (`getDayInTimezone`,
//     `getMonthInTimezone`, `getYearInTimezone`) para decidir dia-11 e
//     `cicloReferencia` do trim/mes anterior (DOC 06 §14.6).
//
// Convencao canonica de fuso: recebe `timeZone` IANA como string.
// Interno usa `Intl.DateTimeFormat` (nativo em Node 20+) para calcular o
// offset. Nunca usa `Date.getTimezoneOffset()` — esse metodo lê o fuso do
// runtime, incompativel com "fuso local da empresa".

/** Trimestre canonico. */
export type Trimestre = 1 | 2 | 3 | 4;

/**
 * Item canonico gerado pelos iteradores `nextInstrumentoABCiclos`,
 * `nextInstrumentoDCiclos` e `nextFechamentoMensalCiclos`.
 */
export interface CicloCandidato {
  cicloReferencia: string;
  dataAbertura: Date;
  dataCorte: Date;
}

// ============================================================
// Parse / format de `cicloReferencia`
// ============================================================

const RE_TRIMESTRE = /^(\d{4})-Q([1-4])$/;
const RE_MENSAL = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Faz parse do formato canonico `YYYY-QN` (instrumento A/C/D). Retorna
 * `null` se a string nao bate no padrao canonico.
 */
export function parseTrimestreCicloReferencia(
  ref: string,
): { ano: number; trimestre: Trimestre } | null {
  const m = RE_TRIMESTRE.exec(ref);
  if (!m) return null;
  return {
    ano: parseInt(m[1]!, 10),
    trimestre: parseInt(m[2]!, 10) as Trimestre,
  };
}

/** Serializa `{ano, trimestre}` no formato canonico `YYYY-QN`. */
export function formatTrimestreCicloReferencia(ano: number, trimestre: Trimestre): string {
  return `${ano}-Q${trimestre}`;
}

/**
 * Faz parse do formato canonico `YYYY-MM` (fechamento mensal). Retorna
 * `null` se a string nao bate no padrao canonico.
 */
export function parseMensalCicloReferencia(ref: string): { ano: number; mes: number } | null {
  const m = RE_MENSAL.exec(ref);
  if (!m) return null;
  return {
    ano: parseInt(m[1]!, 10),
    mes: parseInt(m[2]!, 10),
  };
}

/** Serializa `{ano, mes}` no formato canonico `YYYY-MM` (mes 1-12). */
export function formatMensalCicloReferencia(ano: number, mes: number): string {
  const mesStr = mes.toString().padStart(2, '0');
  return `${ano}-${mesStr}`;
}

// ============================================================
// Aritmetica canonica de trimestre / mes
// ============================================================

/**
 * Retorna o trimestre canonico ao qual o mes pertence.
 * Mes 1-3 → Q1; 4-6 → Q2; 7-9 → Q3; 10-12 → Q4.
 */
export function getTrimestreFromMonth(mes: number): Trimestre {
  return (Math.floor((mes - 1) / 3) + 1) as Trimestre;
}

/**
 * Retorna o ultimo mes canonico do trimestre. Q1→3, Q2→6, Q3→9, Q4→12.
 */
export function getLastMonthOfTrimestre(trimestre: Trimestre): number {
  return trimestre * 3;
}

/** Retorna o mes anterior. Se mes=1, retorna dezembro do ano anterior. */
export function getPreviousMonth(ano: number, mes: number): { ano: number; mes: number } {
  if (mes === 1) return { ano: ano - 1, mes: 12 };
  return { ano, mes: mes - 1 };
}

/** Retorna o trimestre anterior. Se trim=Q1, retorna Q4 do ano anterior. */
export function getPreviousTrimestre(
  ano: number,
  trimestre: Trimestre,
): { ano: number; trimestre: Trimestre } {
  if (trimestre === 1) return { ano: ano - 1, trimestre: 4 };
  return { ano, trimestre: (trimestre - 1) as Trimestre };
}

// ============================================================
// Conversao "hora local no fuso da empresa" ↔ UTC
// ============================================================

/**
 * Converte um instante local (`ano, mes, dia, hora, min, seg` interpretados
 * no `timeZone` fornecido) para o `Date` UTC equivalente. Padrao canonico
 * para gravar `dataAbertura`/`dataCorte`/`dataFechamento` no MySQL como
 * `TIMESTAMP` (armazenado em UTC).
 *
 * Nota canonica sobre DST: usa o offset do instante no proprio `timeZone`.
 * Para America/Sao_Paulo (sem DST desde 2019) o offset e -03:00 constante;
 * para timezones com DST, ajusta corretamente.
 */
export function localDateTimeToUTC(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  min: number,
  seg: number,
  timeZone: string,
): Date {
  // Constroi o instante "como se fosse UTC" e mede o offset do timeZone
  // nesse instante — a diferenca revela o offset a subtrair.
  const asUTCms = Date.UTC(ano, mes - 1, dia, hora, min, seg);
  const asUTCDate = new Date(asUTCms);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asUTCDate);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  }
  const asLocalUTCms = Date.UTC(
    map.year!,
    map.month! - 1,
    map.day!,
    map.hour!,
    map.minute!,
    map.second!,
  );
  const offsetMs = asLocalUTCms - asUTCms;
  return new Date(asUTCms - offsetMs);
}

// ============================================================
// Datas canonicas por tipo de ciclo
// ============================================================

/**
 * Instrumento A ou C — `dataAbertura` canonica: dia 16 do ultimo mes do
 * trimestre 00:00 no `timeZone` da empresa (DOC 06 §14.5).
 */
export function getInstrumentoABDataAbertura(
  ano: number,
  trimestre: Trimestre,
  timeZone: string,
): Date {
  const mes = getLastMonthOfTrimestre(trimestre);
  return localDateTimeToUTC(ano, mes, 16, 0, 0, 0, timeZone);
}

/**
 * Instrumento A ou C — `dataCorte` canonica: dia 10 do mes seguinte ao
 * trimestre 23:59:59 no `timeZone` da empresa (DOC 06 §14.5).
 */
export function getInstrumentoABDataCorte(
  ano: number,
  trimestre: Trimestre,
  timeZone: string,
): Date {
  const mesUltimo = getLastMonthOfTrimestre(trimestre);
  const anoSeguinte = mesUltimo === 12 ? ano + 1 : ano;
  const mesSeguinte = mesUltimo === 12 ? 1 : mesUltimo + 1;
  return localDateTimeToUTC(anoSeguinte, mesSeguinte, 10, 23, 59, 59, timeZone);
}

/**
 * Fechamento mensal — `dataAbertura` canonica: dia 1 do mes 00:00 no
 * `timeZone` da empresa (DOC 06 §14.5).
 */
export function getFechamentoMensalDataAbertura(ano: number, mes: number, timeZone: string): Date {
  return localDateTimeToUTC(ano, mes, 1, 0, 0, 0, timeZone);
}

/**
 * Fechamento mensal — `dataCorte` canonica: dia 10 do mes seguinte
 * 23:59:59 no `timeZone` da empresa (DOC 06 §14.5).
 */
export function getFechamentoMensalDataCorte(ano: number, mes: number, timeZone: string): Date {
  const anoSeguinte = mes === 12 ? ano + 1 : ano;
  const mesSeguinte = mes === 12 ? 1 : mes + 1;
  return localDateTimeToUTC(anoSeguinte, mesSeguinte, 10, 23, 59, 59, timeZone);
}

// ============================================================
// Iteradores canonicos de horizonte
// ============================================================

/**
 * Retorna a lista canonica de ciclos candidatos de Instrumento A/C a
 * partir do trimestre corrente (do `from` no `timeZone`) ate o proximo
 * cujo `dataAbertura` <= `from + horizonMonths`. Cobre §14.5 DOC 06.
 *
 * Ordem canonica: `cicloReferencia` crescente.
 */
export function nextInstrumentoABCiclos(
  from: Date,
  timeZone: string,
  horizonMonths: number,
): CicloCandidato[] {
  const anoAtual = getYearInTimezone(from, timeZone);
  const mesAtual = getMonthInTimezone(from, timeZone);
  const trimestreAtual = getTrimestreFromMonth(mesAtual);

  const horizonMs = horizonMonths * 30 * 24 * 60 * 60 * 1000;
  const horizonEnd = from.getTime() + horizonMs;

  const out: CicloCandidato[] = [];
  let ano = anoAtual;
  let trim = trimestreAtual;

  // Iteracao segura: no maximo `horizonMonths` + 4 iteracoes (cobre folga).
  const maxIters = Math.max(4, horizonMonths + 4);
  for (let i = 0; i < maxIters; i += 1) {
    const dataAbertura = getInstrumentoABDataAbertura(ano, trim, timeZone);
    if (dataAbertura.getTime() > horizonEnd) break;
    out.push({
      cicloReferencia: formatTrimestreCicloReferencia(ano, trim),
      dataAbertura,
      dataCorte: getInstrumentoABDataCorte(ano, trim, timeZone),
    });
    if (trim === 4) {
      ano += 1;
      trim = 1;
    } else {
      trim = (trim + 1) as Trimestre;
    }
  }
  return out;
}

/**
 * Instrumento D — igual ao Instrumento A/C, mas filtra somente Q1 e Q3
 * (semestral — DOC 03 §17.1 e DOC 06 §14.1).
 */
export function nextInstrumentoDCiclos(
  from: Date,
  timeZone: string,
  horizonMonths: number,
): CicloCandidato[] {
  return nextInstrumentoABCiclos(from, timeZone, horizonMonths).filter((c) => {
    const parsed = parseTrimestreCicloReferencia(c.cicloReferencia);
    if (!parsed) return false;
    return parsed.trimestre === 1 || parsed.trimestre === 3;
  });
}

/**
 * Fechamento mensal — retorna a lista canonica dos meses candidatos a
 * partir do mes corrente (do `from` no `timeZone`) ate o proximo cujo
 * `dataAbertura` <= `from + horizonMonths`. Cobre §14.5 DOC 06.
 */
export function nextFechamentoMensalCiclos(
  from: Date,
  timeZone: string,
  horizonMonths: number,
): CicloCandidato[] {
  const anoAtual = getYearInTimezone(from, timeZone);
  const mesAtual = getMonthInTimezone(from, timeZone);

  const horizonMs = horizonMonths * 31 * 24 * 60 * 60 * 1000;
  const horizonEnd = from.getTime() + horizonMs;

  const out: CicloCandidato[] = [];
  let ano = anoAtual;
  let mes = mesAtual;

  const maxIters = Math.max(2, horizonMonths + 2);
  for (let i = 0; i < maxIters; i += 1) {
    const dataAbertura = getFechamentoMensalDataAbertura(ano, mes, timeZone);
    if (dataAbertura.getTime() > horizonEnd) break;
    out.push({
      cicloReferencia: formatMensalCicloReferencia(ano, mes),
      dataAbertura,
      dataCorte: getFechamentoMensalDataCorte(ano, mes, timeZone),
    });
    if (mes === 12) {
      ano += 1;
      mes = 1;
    } else {
      mes += 1;
    }
  }
  return out;
}

// ============================================================
// Inspetores de calendario local
// ============================================================

function getFieldInTimezone(now: Date, timeZone: string, field: 'day' | 'month' | 'year'): number {
  const opts: Intl.DateTimeFormatOptions = { timeZone };
  if (field === 'day') opts.day = '2-digit';
  if (field === 'month') opts.month = '2-digit';
  if (field === 'year') opts.year = 'numeric';
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(now);
  const raw = parts.find((p) => p.type === field)?.value;
  return raw ? parseInt(raw, 10) : NaN;
}

/** Dia do mes (1-31) do instante `now` no `timeZone`. */
export function getDayInTimezone(now: Date, timeZone: string): number {
  return getFieldInTimezone(now, timeZone, 'day');
}

/** Mes (1-12) do instante `now` no `timeZone`. */
export function getMonthInTimezone(now: Date, timeZone: string): number {
  return getFieldInTimezone(now, timeZone, 'month');
}

/** Ano de 4 digitos do instante `now` no `timeZone`. */
export function getYearInTimezone(now: Date, timeZone: string): number {
  return getFieldInTimezone(now, timeZone, 'year');
}

/**
 * Verifica se `cicloReferencia` (formato `YYYY-QN` ou `YYYY-MM`) refere ao
 * trimestre/mes imediatamente anterior a `now` no `timeZone`. Usado por
 * `updateCycleScheduleStatuses` para decidir a transicao `→ fechado` no
 * dia 11 (DOC 06 §14.6).
 */
export function isCicloReferenciaImediatamenteAnterior(
  cicloReferencia: string,
  tipoPeriodo: 'trimestre' | 'mensal',
  now: Date,
  timeZone: string,
): boolean {
  const anoNow = getYearInTimezone(now, timeZone);
  const mesNow = getMonthInTimezone(now, timeZone);
  if (tipoPeriodo === 'mensal') {
    const parsed = parseMensalCicloReferencia(cicloReferencia);
    if (!parsed) return false;
    const anterior = getPreviousMonth(anoNow, mesNow);
    return parsed.ano === anterior.ano && parsed.mes === anterior.mes;
  }
  const parsed = parseTrimestreCicloReferencia(cicloReferencia);
  if (!parsed) return false;
  const trimestreNow = getTrimestreFromMonth(mesNow);
  const anterior = getPreviousTrimestre(anoNow, trimestreNow);
  return parsed.ano === anterior.ano && parsed.trimestre === anterior.trimestre;
}
