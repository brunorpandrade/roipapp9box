// ROIP APP 9BOX — helper canonico `formatHierarchyLevel` (ME-B11.1d,
// XLSX2).
//
// Fonte unica canonica da humanizacao dos 3 valores do enum
// `NIVEL_HIERARQUICO_VALUES` (DOC 01 §15.3) para exibicao em toda a
// plataforma — xlsx, PDFs, UI e exportaveis. Substitui o mapa
// pre-existente em `src/app/super-admin/empresa/[id]/`
// `todos-os-colaboradores/internals.ts` (`NIVEL_HIERARQUICO_LABELS`),
// que agora delega a este arquivo (L125 RV-14).
//
// Padrao bit-exact ao `src/lib/job-family/formatJobFamily.ts`
// (ME-B11.1c PATCH2) + `src/lib/seniority/formatSeniority.ts`
// (fonte unica canonica de helpers transversais).
//
// Especificacao canonica DOC 01 §15.3: nivel hierarquico armazenado
// no banco em snake_case tecnico. Exibicao canonica em pt-BR com
// acentos + capitalizacao canonica.
//
// Entrada defensiva: aceita `NivelHierarquico | string | null | undefined`.
// `null`/`undefined` → string vazia. Valor nao-canonico → retorna o
// input bit-exact (nao mascara dados corrompidos no banco).
//
// RV-13: consumidores canonicos nesta mesma ME:
//   - `src/server/routers/exports.ts` (xlsx Resumo dashboard + xlsx
//     Evolução trimestral — composer da coluna Nível hierárquico).
//   - `src/app/dashboard-individual/[id]/DashboardIndividualClient.tsx`
//     (chip de identidade da pessoa — linha "Nível hierárquico").
//   - `src/app/meus-dados/MeusDadosClient.tsx` (FieldRO
//     "Nível hierárquico" na seção vinculo).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao via re-export do mapa).

import type { NivelHierarquico } from '../../db/schema/enums';

/**
 * Mapa canonico `NivelHierarquico` → label human-readable pt-BR com
 * acentuacao canonica. Ordem canonica bit-exact preservada
 * (DOC 01 §15.3).
 */
export const NIVEL_HIERARQUICO_LABELS: Readonly<Record<NivelHierarquico, string>> = {
  operacional: 'Operacional',
  tatico: 'Tático',
  estrategico: 'Estratégico',
};

/**
 * Humaniza um valor do enum `NivelHierarquico` para exibicao em pt-BR.
 *
 * - `null`/`undefined` → `''`.
 * - Valor canonico do enum → label do mapa.
 * - Valor nao-canonico (fora do enum) → retorna o input bit-exact
 *   (defensivo — nao mascara dados corrompidos).
 *
 * @example
 *   formatHierarchyLevel('operacional') === 'Operacional'
 *   formatHierarchyLevel('tatico') === 'Tático'
 *   formatHierarchyLevel('estrategico') === 'Estratégico'
 *   formatHierarchyLevel(null) === ''
 *   formatHierarchyLevel('xxx_desconhecido') === 'xxx_desconhecido'
 */
export function formatHierarchyLevel(v: NivelHierarquico | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v in NIVEL_HIERARQUICO_LABELS) {
    return NIVEL_HIERARQUICO_LABELS[v as NivelHierarquico];
  }
  return v;
}
