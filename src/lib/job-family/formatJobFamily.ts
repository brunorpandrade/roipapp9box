// ROIP APP 9BOX — helper canonico `formatJobFamily` (ME-B11.1c
// PATCH2, PDL4/MD1/CL6; estendido em ME-1.17).
//
// Fonte unica canonica da humanizacao dos valores do enum
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
// ME-1.17 (Conversa 5) — expansao canonica para 26 valores (6
// canonicas + 20 slots `custom1..custom20`) + novo resolver
// `getJobFamilyLabel(familyKey, settings)` que prioriza
// `settings.nomeCustomizado` quando preenchido (familias
// renomeaveis). Backward-compat: `formatJobFamily(v)` sem settings
// retorna o label canonico das 6 canonicas e um placeholder
// `"Família customizada N"` para slots custom nao hidratados.
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
// RV-13: consumidores canonicos:
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (PDF LGPD
//     — campo `jobFamily`, PDL4).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao via re-export do mapa).
//   - `src/app/meus-dados/MeusDadosClient.tsx` (campo
//     `familiaCargo`, MD1).
//   - `src/server/routers/myData.ts` (campo `familiaFuncao`).
//   - Despacho 1.b da ME-1.17 (callsites migrados para
//     `getJobFamilyLabel` com settings propagados do page scope).

import type { JobFamily } from '../../db/schema/enums';
import { JOB_FAMILY_CANONICAL_VALUES, JOB_FAMILY_CUSTOM_VALUES } from '../../db/schema/enums';

/**
 * Setting canonico minimo necessario para o resolver — subset do
 * tipo `CompanyRoleFamilySettings` do service. Mantem o helper puro
 * (sem dependencia da camada de persistencia) e serializavel para
 * passar entre server → client components do Next 15.
 */
export interface FamilyLabelSettings {
  readonly jobFamily: JobFamily;
  readonly nomeCustomizado: string | null;
}

/**
 * Mapa canonico `JobFamily` → label human-readable pt-BR. Ordem
 * canonica bit-exact preservada (DOC 01 §15.3).
 *
 * Para as 6 canonicas, labels sao os textos pt-BR usados em toda a
 * plataforma. Para os 20 slots custom, labels sao placeholders
 * `"Família customizada N"` consumidos apenas quando o caller nao
 * tem settings e precisa de uma string legivel (ex: dump defensivo,
 * fallback em UI tecnica). Em superficie de produto, o caller
 * SEMPRE usa `getJobFamilyLabel(familyKey, settings)` que resolve
 * via `settings.nomeCustomizado` quando preenchido.
 */
export const JOB_FAMILY_LABELS: Readonly<Record<JobFamily, string>> = {
  vendas_comercial: 'Vendas e comercial',
  producao_operacoes: 'Produção e operações',
  tecnico_especialista: 'Técnico especialista',
  administrativo_suporte: 'Administrativo e suporte',
  atendimento_relacionamento: 'Atendimento e relacionamento',
  lideranca_gestao: 'Liderança e gestão',
  custom1: 'Família customizada 1',
  custom2: 'Família customizada 2',
  custom3: 'Família customizada 3',
  custom4: 'Família customizada 4',
  custom5: 'Família customizada 5',
  custom6: 'Família customizada 6',
  custom7: 'Família customizada 7',
  custom8: 'Família customizada 8',
  custom9: 'Família customizada 9',
  custom10: 'Família customizada 10',
  custom11: 'Família customizada 11',
  custom12: 'Família customizada 12',
  custom13: 'Família customizada 13',
  custom14: 'Família customizada 14',
  custom15: 'Família customizada 15',
  custom16: 'Família customizada 16',
  custom17: 'Família customizada 17',
  custom18: 'Família customizada 18',
  custom19: 'Família customizada 19',
  custom20: 'Família customizada 20',
};

/**
 * Guard interno de completude: forca o TypeScript a falhar se um
 * valor novo for adicionado a `JOB_FAMILY_VALUES` sem entrar aqui.
 * Checa que a lista de chaves cobre a uniao canonica (6 canonicas +
 * 20 custom).
 */
const _ALL_FAMILIES: readonly JobFamily[] = [
  ...JOB_FAMILY_CANONICAL_VALUES,
  ...JOB_FAMILY_CUSTOM_VALUES,
];
for (const key of _ALL_FAMILIES) {
  if (!(key in JOB_FAMILY_LABELS)) {
    throw new Error(`JOB_FAMILY_LABELS incompleto: falta chave canonica \`${key}\`.`);
  }
}

/**
 * Resolver canonico ME-1.17: prioriza `settings.nomeCustomizado`
 * quando preenchido (renomeacao da empresa), senao cai no label
 * canonico de `JOB_FAMILY_LABELS[familyKey]`.
 *
 * Para `settings === null` (empresa sem settings ou setting nao
 * encontrada), retorna o label canonico direto — comportamento
 * bit-exact ao `formatJobFamily(v)` sem settings.
 *
 * Para `settings.jobFamily !== familyKey` (uso incorreto do caller),
 * ignora o setting e cai no label canonico (defensivo — nao mascara
 * bug do caller).
 *
 * Para `familyKey` nao-canonico (valor fora do enum, defensivo —
 * dados corrompidos), retorna o proprio `familyKey` (comportamento
 * bit-exact ao `formatJobFamily(v)` legado).
 */
export function getJobFamilyLabel(
  familyKey: JobFamily | string | null | undefined,
  settings: FamilyLabelSettings | null | undefined,
): string {
  if (familyKey === null || familyKey === undefined) return '';
  if (settings && settings.jobFamily === familyKey && settings.nomeCustomizado !== null) {
    const trimmed = settings.nomeCustomizado.trim();
    if (trimmed.length > 0) return settings.nomeCustomizado;
  }
  if (familyKey in JOB_FAMILY_LABELS) {
    return JOB_FAMILY_LABELS[familyKey as JobFamily];
  }
  return familyKey;
}

/**
 * Humaniza um valor do enum `JobFamily` para exibicao em pt-BR.
 *
 * Overload canonico ME-1.17:
 *   - `formatJobFamily(v)` — comportamento legado bit-exact
 *     (JOB_FAMILY_LABELS direto, placeholder para custom).
 *   - `formatJobFamily(v, settings)` — delega para
 *     `getJobFamilyLabel(v, settings)` (prioriza nome customizado
 *     da empresa).
 *
 * - `null`/`undefined` → `''`.
 * - Valor canonico do enum + sem settings → label canonico direto.
 * - Valor nao-canonico (fora do enum) → retorna o input bit-exact
 *   (defensivo — nao mascara dados corrompidos).
 *
 * @example
 *   formatJobFamily('vendas_comercial') === 'Vendas e comercial'
 *   formatJobFamily('producao_operacoes') === 'Produção e operações'
 *   formatJobFamily(null) === ''
 *   formatJobFamily('xxx_desconhecido') === 'xxx_desconhecido'
 *   formatJobFamily('custom1', { jobFamily: 'custom1',
 *     nomeCustomizado: 'Projetista' }) === 'Projetista'
 *   formatJobFamily('custom1', null) === 'Família customizada 1'
 *   formatJobFamily('vendas_comercial', { jobFamily:
 *     'vendas_comercial', nomeCustomizado: 'Hunter B2B' }) ===
 *     'Hunter B2B'
 */
export function formatJobFamily(
  v: JobFamily | string | null | undefined,
  settings?: FamilyLabelSettings | null,
): string {
  if (settings !== undefined) {
    return getJobFamilyLabel(v, settings);
  }
  if (v === null || v === undefined) return '';
  if (v in JOB_FAMILY_LABELS) {
    return JOB_FAMILY_LABELS[v as JobFamily];
  }
  return v;
}
