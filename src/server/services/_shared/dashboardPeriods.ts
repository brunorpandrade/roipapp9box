// ROIP APP 9BOX — helpers canonicos de periodo e media dos motores de
// agregacao do contexto de dashboard (ME-054).
//
// - `mesesDoTrimestre`: converte trimestre canonico `YYYY-QN` nos 3
//   meses canonicos `YYYY-MM` (fonte de leitura de
//   `performanceData.assiduidade` — DOC 03 §2 Passo 1).
// - `mediaDosPresentes`: media aritmetica canonica da ME-054 —
//   ignora `null`, retorna `null` quando nenhum valor presente.
//
// L91: `parseTrimestreCicloReferencia` retorna numero puro 1..4; a
// formatacao de mes usa padding explicito.

import { parseTrimestreCicloReferencia } from '../../../lib/cycleDates';

/**
 * Retorna os 3 meses canonicos `YYYY-MM` do trimestre `YYYY-QN`.
 * Array vazio quando o trimestre nao parseia.
 */
export function mesesDoTrimestre(trimestre: string): string[] {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return [];
  }
  const primeiroMes = (parsed.trimestre - 1) * 3 + 1;
  return [primeiroMes, primeiroMes + 1, primeiroMes + 2].map(
    (mes) => `${parsed.ano}-${String(mes).padStart(2, '0')}`,
  );
}

/**
 * Media aritmetica canonica dos valores presentes (ME-054). Ignora
 * `null`; retorna `null` quando a lista efetiva e vazia. Arredonda a
 * 2 casas decimais.
 */
export function mediaDosPresentes(valores: Array<number | null>): number | null {
  const presentes = valores.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (presentes.length === 0) {
    return null;
  }
  const soma = presentes.reduce((acc, v) => acc + v, 0);
  return Math.round((soma / presentes.length) * 100) / 100;
}
