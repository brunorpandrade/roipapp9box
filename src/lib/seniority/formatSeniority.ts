// ROIP APP 9BOX — helper canonico `formatSeniority` (ME-B11.1d,
// XLSX2).
//
// Fonte unica canonica da humanizacao dos 3 valores do enum
// `employees.senioridade` (DOC 01 §4.5) para exibicao em toda a
// plataforma — xlsx, PDFs, UI e exportaveis. Substitui o mapa
// pre-existente em `src/app/super-admin/empresa/[id]/`
// `todos-os-colaboradores/internals.ts` (`SENIORIDADE_LABELS`), que
// agora delega a este arquivo (L125 RV-14).
//
// Padrao bit-exact ao `src/lib/job-family/formatJobFamily.ts`
// (ME-B11.1c PATCH2) + `src/lib/cpf/formatCpf.ts` +
// `src/lib/date/formatDateBR.ts` (fonte unica canonica de helpers
// transversais).
//
// Especificacao canonica DOC 01 §4.5: senioridade armazenada no banco
// em snake_case tecnico. Exibicao canonica em pt-BR com acentos +
// capitalizacao canonica.
//
// Entrada defensiva: aceita `Seniority | string | null | undefined`.
// `null`/`undefined` → string vazia. Valor nao-canonico → retorna o
// input bit-exact (nao mascara dados corrompidos no banco).
//
// RV-13: consumidores canonicos nesta mesma ME:
//   - `src/server/routers/exports.ts` (xlsx Resumo dashboard + xlsx
//     Evolução trimestral — composer da coluna Senioridade, XLSX2).
//   - `src/app/dashboard-individual/[id]/DashboardIndividualClient.tsx`
//     (chip de identidade da pessoa — linha "Senioridade").
//   - `src/app/meus-dados/MeusDadosClient.tsx` (FieldRO
//     "Senioridade" na seção vinculo).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao via re-export do mapa).

/**
 * Valores canonicos do enum `employees.senioridade` (DOC 01 §4.5).
 * Ordem canonica bit-exact preservada (do mais junior ao mais
 * senior).
 */
export const SENIORITY_VALUES = ['junior', 'pleno', 'senior'] as const;
export type Seniority = (typeof SENIORITY_VALUES)[number];

/**
 * Mapa canonico `Seniority` → label human-readable pt-BR com
 * acentuacao canonica. Ordem canonica bit-exact preservada
 * (DOC 01 §4.5).
 */
export const SENIORIDADE_LABELS: Readonly<Record<Seniority, string>> = {
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
};

/**
 * Humaniza um valor do enum `Seniority` para exibicao em pt-BR.
 *
 * - `null`/`undefined` → `''`.
 * - Valor canonico do enum → label do mapa.
 * - Valor nao-canonico (fora do enum) → retorna o input bit-exact
 *   (defensivo — nao mascara dados corrompidos).
 *
 * @example
 *   formatSeniority('junior') === 'Júnior'
 *   formatSeniority('pleno') === 'Pleno'
 *   formatSeniority('senior') === 'Sênior'
 *   formatSeniority(null) === ''
 *   formatSeniority('xxx_desconhecido') === 'xxx_desconhecido'
 */
export function formatSeniority(v: Seniority | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v in SENIORIDADE_LABELS) {
    return SENIORIDADE_LABELS[v as Seniority];
  }
  return v;
}
