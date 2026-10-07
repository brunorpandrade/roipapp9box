// ROIP APP 9BOX — helper canonico `toIsoDateUtc` (ME-B11.1b, NR1·6).
//
// Serializa deterministicamente uma coluna MySQL `date` (recebida como
// `Date` em UTC via driver mysql2) para o formato civil `YYYY-MM-DD`.
//
// Motivacao canonica: `String(dateObj)` chama `Date.prototype.toString()`
// e produz "Tue Oct 20 2026 00:00:00 GMT+0000 (Coordinated Universal
// Time)" — formato localizado por runtime, que estava vazando cru na UI
// (/nr1 aba "Alertas e histórico" columns ABERTURA e FECHAMENTO).
//
// Equivalente canonico a `dataCivilDeColunaNr1` em
// `src/server/services/nr1CalculationEngine.ts`, mas disponibilizado em
// `src/lib/date` como helper transversal.
//
// Aceita `Date | string | null`. Para string, extrai a parte civil
// (`YYYY-MM-DD`) sem shift de timezone. Para `Date`, usa
// `getUTCFullYear`/`getUTCMonth`/`getUTCDate` (nunca local time).
//
// **RV-14.** Um statement por linha, 100 colunas, imports multi-
// especificador quando necessario.

/**
 * Serializa `Date | string | null` para `YYYY-MM-DD` deterministico.
 *
 * Comportamento canonico:
 * - `null`/`undefined` → `null`.
 * - `string` com formato ISO (`YYYY-MM-DD...`) → corta nos 10 primeiros
 *   caracteres. Se string nao parece ISO, devolve ela mesma.
 * - `Date` → usa getUTC* para extrair ano/mes/dia e formata
 *   `YYYY-MM-DD` com padStart.
 */
export function toIsoDateUtc(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === 'string') {
    if (v.length === 0) {
      return null;
    }
    const prefix = v.slice(0, 10);
    const parts = prefix.split('-');
    const ano = parts[0];
    if (parts.length === 3 && ano !== undefined && ano.length === 4) {
      return prefix;
    }
    return v;
  }
  const ano = v.getUTCFullYear();
  const mes = v.getUTCMonth() + 1;
  const dia = v.getUTCDate();
  const mesStr = String(mes).padStart(2, '0');
  const diaStr = String(dia).padStart(2, '0');
  return `${ano}-${mesStr}-${diaStr}`;
}

/**
 * Serializa um timestamp (`Date | string | null`) para o formato
 * civil BR `DD/MM/YYYY às HH:mm (BRT)`.
 *
 * Usado em superficies de PDF e UI onde timestamps completos precisam
 * ser exibidos em pt-BR com indicacao explicita do fuso.
 *
 * Comportamento canonico:
 * - `null`/`undefined`/string vazia → `null`.
 * - Qualquer entrada valida → converte para `Date` e usa `getUTC*`
 *   (fuso canonico UTC-3 America/Sao_Paulo exibido como "BRT").
 *   O deslocamento canonico aplicado e UTC-3 fixo (sem horario de
 *   verao — Brasil nao adota HV desde 2019); formato de saida:
 *   `DD/MM/YYYY as HH:mm (BRT)`.
 */
export function toTimestampBrt(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
  const dBrt = new Date(d.getTime() - BRT_OFFSET_MS);
  const ano = dBrt.getUTCFullYear();
  const mes = String(dBrt.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(dBrt.getUTCDate()).padStart(2, '0');
  const hh = String(dBrt.getUTCHours()).padStart(2, '0');
  const mm = String(dBrt.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} as ${hh}:${mm} (BRT)`;
}
