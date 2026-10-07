// ROIP APP 9BOX — helper canonico `formatTrimestreBR` (ME-B11.1c
// PATCH2, PDL9).
//
// Fonte unica canonica da humanizacao do identificador canonico de
// trimestre (`YYYY-QN`) para exibicao em pt-BR
// (`"Nº trimestre de YYYY"`), usada em PDFs e UI onde o
// identificador tecnico vazava cru.
//
// Especificacao canonica DOC 03 §11.2 + §6.1: trimestres sao
// representados no banco e no payload canonico como string curta
// `YYYY-QN` (ex.: `2027-Q4`). Para o Radar NR-1, o payload bruto do
// portabilidade carrega `cicloDbId` numerico (chave do
// `copsoqCycles`) — o service canonico resolve esse id em
// `cicloReferencia` para que a UI possa humanizar.
//
// Mapeamento canonico (DOC 03 §3.1 CC5):
//   Q1 → "1º trimestre de YYYY" (Jan-Mar).
//   Q2 → "2º trimestre de YYYY" (Abr-Jun).
//   Q3 → "3º trimestre de YYYY" (Jul-Set).
//   Q4 → "4º trimestre de YYYY" (Out-Dez).
//
// Entrada defensiva: aceita `string | null | undefined`.
// `null`/`undefined`/string vazia → `''`. String nao-conforme ao
// formato `YYYY-QN` → retorna o input bit-exact (defensivo — nao
// mascara dados corrompidos no banco).
//
// RV-13: consumidor canonico nesta mesma ME:
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (PDF LGPD
//     — campo `cicloReferencia` na secao Radar NR-1, PDL9).

/**
 * Humaniza um identificador canonico de trimestre (`YYYY-QN` ou
 * `YYYY-QN-<sufixo>`) para `"Nº trimestre de YYYY"` em pt-BR.
 *
 * O regex aceita sufixos canonicos opcionais (ex: `-CORRENTE`,
 * usado em seeds de empresas demo para marcar o ciclo em aberto —
 * ver `src/db/seed/nativa/deriveOpenNr1Cycle.ts`). O sufixo e
 * ignorado na humanizacao — o titular ve apenas o trimestre civil.
 *
 * @example
 *   formatTrimestreBR('2027-Q4') === '4º trimestre de 2027'
 *   formatTrimestreBR('2026-Q1') === '1º trimestre de 2026'
 *   formatTrimestreBR('2026-Q3-CORRENTE') === '3º trimestre de 2026'
 *   formatTrimestreBR(null) === ''
 *   formatTrimestreBR('xxx-invalido') === 'xxx-invalido'
 */
export function formatTrimestreBR(v: string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v.length === 0) return v;
  const match = /^(\d{4})-Q([1-4])(?:-[A-Za-z0-9]+)?$/.exec(v);
  if (match === null) return v;
  const ano = match[1];
  const q = match[2];
  if (ano === undefined || q === undefined) return v;
  return `${q}º trimestre de ${ano}`;
}
