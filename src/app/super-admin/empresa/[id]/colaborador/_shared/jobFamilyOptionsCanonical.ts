// ROIP APP 9BOX — fonte canonica unica de `JOB_FAMILY_OPTIONS`
// extraida de `ColaboradorForm.tsx` em CC079-1b-2 (ME-1.17.b).
//
// Motivacao canonica: `ColaboradorForm.tsx` tem diretiva `'use client'`
// no topo. Server components (ex: `novo/page.tsx` e `[employeeId]/
// editar/page.tsx` do super-admin) nao podem importar valores
// (constantes incluidas) de modulos client via Next.js 15 — o
// bundler aplica Server Reference proxy e o objeto que chega ao
// server component NAO expoe metodos como `.find()`. Isso quebrou
// as rotas `/super-admin/empresa/[id]/colaborador/novo` e
// `/editar/[employeeId]` em producao com `TypeError:
// JOB_FAMILY_OPTIONS.find is not a function` (digests 3653058121 +
// 980829730, 25/10/2026 10:19-10:33 BRT).
//
// Solucao canonica L125 integral: extrair as 3 constantes/tipos
// consumidos tanto por server components quanto pelo ColaboradorForm
// client para arquivo neutro (SEM `'use client'`). ColaboradorForm.tsx
// re-exporta de ca preservando backward-compat bit-exact (callers
// que importam `JOB_FAMILY_OPTIONS` / `JobFamilyId` / `FamilyOption`
// de `../ColaboradorForm` continuam funcionando sem alteracao).
//
// Padrao canonico herdado: fonte unica + re-export via barrel
// (consistente com `src/lib/job-family/formatJobFamily.ts` que
// serve como fonte unica canonica de `JOB_FAMILY_LABELS` consumido
// por `todos-os-colaboradores/internals.ts` via re-export).
//
// RV-13: callers canonicos:
//   - `../ColaboradorForm.tsx` (re-export para backward-compat).
//   - `../novo/page.tsx` (import direto — server component).
//   - `../[employeeId]/editar/page.tsx` (import direto — server
//     component).

/**
 * ME-1.17.b (`CC079-1b-2` extracao canonica) — opcao canonica de
 * familia carregada por empresa do server scope ou estatica em
 * fallback de rotas RH-facing.
 */
export interface FamilyOption {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
}

/**
 * §4.5 canonico documental — 6 familias canonicas pre-populadas
 * como seed universal em toda empresa (ME-1.17.a). Backward-compat
 * bit-exact pre-ME-1.17.b: pages antigas que nao propagam
 * `familyOptions` dinamico caem neste array estatico canonico.
 *
 * Ordem canonica preservada bit-exact ao estado pre-ME-1.17.b.
 */
export const JOB_FAMILY_OPTIONS = [
  {
    id: 'vendas_comercial',
    titulo: 'Vendas e comercial',
    descricao:
      'Cargos de vendas, prospecção, negociação, gestão de carteira e resultados comerciais.',
  },
  {
    id: 'producao_operacoes',
    titulo: 'Produção e operações',
    descricao: 'Cargos de execução operacional, produção, logística, manutenção e processos.',
  },
  {
    id: 'tecnico_especialista',
    titulo: 'Técnico especialista',
    descricao: 'Cargos com conhecimento técnico especializado, engenharia, TI e P&D.',
  },
  {
    id: 'administrativo_suporte',
    titulo: 'Administrativo e suporte',
    descricao: 'Cargos de apoio administrativo, financeiro, contábil, jurídico e RH.',
  },
  {
    id: 'atendimento_relacionamento',
    titulo: 'Atendimento e relacionamento',
    descricao: 'Cargos de atendimento ao cliente, pós-venda, suporte e experiência do cliente.',
  },
  {
    id: 'lideranca_gestao',
    titulo: 'Liderança e gestão',
    descricao: 'Cargos com pessoas subordinadas — coordenadores, gerentes e diretores.',
  },
] as const;

/**
 * Narrow do tipo canonico dos IDs das 6 familias pre-populadas.
 * Preservado bit-exact pre-ME-1.17.b (pos-ME-1.17.a o enum real
 * `JobFamily` tem 26 valores — 6 canonicas + 20 slots custom —
 * mas o tipo narrow aqui mantem 6 para compatibilidade dos callers
 * antigos; novos callers usam `JobFamily` do schema diretamente).
 */
export type JobFamilyId = (typeof JOB_FAMILY_OPTIONS)[number]['id'];
