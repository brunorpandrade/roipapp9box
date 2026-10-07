// ROIP APP 9BOX — helper canonico `formatDateBR` (ME-B11.1c PATCH2,
// PDL3).
//
// Fonte unica canonica da formatacao de data civil para exibicao em
// toda a plataforma — PDFs, UI e exportaveis. Substitui as 3
// implementacoes locais duplicadas pre-existentes (todas rigorosamente
// equivalentes):
//   - `src/app/meus-dados/internals.ts` (`formatarDataBR` — aceita
//     string ISO "YYYY-MM-DD").
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (`formatDateBR` — aceita `Date`).
//   - `src/app/super-admin/empresa/[id]/nr1/internals.ts`
//     (`formatDateBR` — aceita `string | null`).
//
// Convencao canonica L125 (RV-14): componente reutilizado e extraido
// na mesma ME, com refactor dos callsites originais. Padrao bit-exact
// ao `src/lib/cpf/formatCpf.ts` + `src/lib/date/toIsoDateUtc.ts`
// (fonte unica canonica de helpers transversais).
//
// Especificacao canonica DOC 05 §14.5: datas armazenadas no banco em
// UTC (coluna `date()` MySQL via driver mysql2). Exibicao canonica
// no formato civil brasileiro `DD/MM/YYYY`.
//
// Entrada defensiva: aceita `Date | string | null | undefined`.
// `null`/`undefined`/string vazia → string vazia (nao quebra o render).
// String nao-ISO → string vazia. `Date` invalido → string vazia.
//
// L115 preservado bit-exact: `Date` chega do server em UTC; usamos
// getters UTC para evitar drift de timezone.
//
// RV-13: consumidores canonicos nesta mesma ME e nos callsites
// refatorados:
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (PDF LGPD
//     — campos `dataNascimento`, `dataAdmissao`).
//   - `src/app/meus-dados/internals.ts` (delegacao via re-export).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao via re-export).

/**
 * Formata uma data (`Date | string | null | undefined`) para o
 * formato civil brasileiro `DD/MM/YYYY`.
 *
 * - `null`/`undefined`/string vazia → `''` (defensivo canonico).
 * - String ISO `YYYY-MM-DD[T...]` → extrai parte civil, retorna
 *   `DD/MM/YYYY`.
 * - `Date` → usa `getUTC*` (sem shift de timezone).
 *
 * @example
 *   formatDateBR('2017-01-02') === '02/01/2017'
 *   formatDateBR(new Date('1990-04-27T00:00:00Z')) === '27/04/1990'
 *   formatDateBR(null) === ''
 */
export function formatDateBR(v: Date | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  let d: Date;
  if (typeof v === 'string') {
    if (v.length === 0) return '';
    const parts = v.slice(0, 10).split('-');
    if (parts.length !== 3) return '';
    const y = parts[0];
    const m = parts[1];
    const dStr = parts[2];
    if (y === undefined || m === undefined || dStr === undefined) {
      return '';
    }
    if (y.length !== 4) return '';
    const ano = Number.parseInt(y, 10);
    const mes = Number.parseInt(m, 10);
    const dia = Number.parseInt(dStr, 10);
    if (Number.isNaN(ano) || Number.isNaN(mes) || Number.isNaN(dia)) {
      return '';
    }
    d = new Date(Date.UTC(ano, mes - 1, dia));
  } else {
    d = v;
  }
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}
