// ROIP APP 9BOX — helper canonico `formatJobFamily` (ME-B11.1c
// PATCH2, PDL4/MD1/CL6).
//
// Fonte unica canonica da humanizacao dos 6 valores do enum
// `JOB_FAMILY_VALUES` (DOC 01 §15.3) para exibicao em toda a
// plataforma — PDFs, UI e exportaveis. Substitui o mapa duplicado
// pre-existente em `src/app/super-admin/empresa/[id]/`
// `todos-os-colaboradores/internals.ts` (`JOB_FAMILY_LABELS`), que
// agora delega a este arquivo (L125 RV-14).
//
// Padrao bit-exact ao `src/lib/cpf/formatCpf.ts` +
// `src/lib/date/formatDateBR.ts` (fonte unica canonica de helpers
// transversais).
//
// Especificacao canonica DOC 01 §15.3: familias armazenadas no banco
// em snake_case tecnico. Exibicao canonica em pt-BR com acentos +
// capitalizacao canonica — alinhada 1-para-1 com os cards do grid de
// famílias (DOC 05 §13.1 Aba 2 — cadastro de colaborador / C-level).
//
// Entrada defensiva: aceita `JobFamily | string | null | undefined`.
// `null`/`undefined` ou valor nao-canonico → retorna o input como
// esta (ou string vazia se null/undefined), para nao mascarar dados
// corrompidos no banco.
//
// RV-13: consumidores canonicos nesta mesma ME e nos callsites
// refatorados:
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (PDF LGPD
//     — campo `jobFamily`, PDL4).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao via re-export do mapa).
//   - `src/app/meus-dados/MeusDadosClient.tsx` (campo
//     `familiaCargo`, MD1).

import type { JobFamily } from '../../db/schema/enums';

/**
 * Mapa canonico `JobFamily` → label human-readable pt-BR. Ordem
 * canonica bit-exact preservada (DOC 01 §15.3).
 */
export const JOB_FAMILY_LABELS: Readonly<Record<JobFamily, string>> = {
  vendas_comercial: 'Vendas e comercial',
  producao_operacoes: 'Produção e operações',
  tecnico_especialista: 'Técnico especialista',
  administrativo_suporte: 'Administrativo e suporte',
  atendimento_relacionamento: 'Atendimento e relacionamento',
  lideranca_gestao: 'Liderança e gestão',
};

/**
 * Humaniza um valor do enum `JobFamily` para exibicao em pt-BR.
 *
 * - `null`/`undefined` → `''`.
 * - Valor canonico do enum → label do mapa.
 * - Valor nao-canonico (fora do enum) → retorna o input bit-exact
 *   (defensivo — nao mascara dados corrompidos).
 *
 * @example
 *   formatJobFamily('vendas_comercial') === 'Vendas e comercial'
 *   formatJobFamily('producao_operacoes') === 'Produção e operações'
 *   formatJobFamily(null) === ''
 *   formatJobFamily('xxx_desconhecido') === 'xxx_desconhecido'
 */
export function formatJobFamily(v: JobFamily | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v in JOB_FAMILY_LABELS) {
    return JOB_FAMILY_LABELS[v as JobFamily];
  }
  return v;
}
