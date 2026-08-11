// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/todos-os-colaboradores` (§14.10, ME-076).
//
// Padrao S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, funcao auxiliar
// e loader vive neste `internals.ts` irmao — permite import por testes
// e por `TodosColaboradoresClient.tsx` sem quebrar a segregacao Next 15.
//
// Origem canonica:
// - CAMADA_UI §14.10 (Tabela 14 colunas + 8 filtros + acoes) + §14.10.1
//   (badges L/RH/RF inline canonicos) + §20 (dropdown sincronizado).
// - CAMADA_AUTH §10.3 linha 807 (Bruno atravessa `/super-admin/
//   empresa/[id]/todos-os-colaboradores`) + §12 (Bruno tem todas as
//   acoes administrativas de listagem).
// - CAMADA_NEGOCIO §15 (listagem + filtros + paginacao + ordenacao).
// - CAMADA_DADOS §4.5 (`employees` schema canonico bit-exact).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canonico bit-exact) + §3.3
//   (ficha canonica desta ME).
//
// Mockups canonicos consumidos:
// - `painel_principal_fase7_v5.html` (base — 14 colunas + funcao
//   `renderTabelaColaboradores`).
// - `delta_todos_colaboradores_v2.html` (delta canonico bit-exact — 3
//   badges L/RH/RF inline no Nome + 8o filtro "Papel funcional").
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `parseCompanyIdParam` → `page.tsx`.
// - `resolveDatabaseUrl` → `page.tsx`.
// - `loadTodosColaboradoresPage` → `page.tsx`.
// - `DEPARTAMENTO_LABELS`, `JOB_FAMILY_LABELS`, `NIVEL_HIERARQUICO_LABELS`,
//   `SENIORIDADE_LABELS`, `STATUS_LABELS`, `PROFILE_INDIVIDUAL_STATUS_LABELS`
//   → `TodosColaboradoresClient.tsx` + testes.
// - `formatCpfMasked`, `formatDateBR`, `getIniciaisFromName`,
//   `hashNameToColor`, `getPapelFuncionalLabel` →
//   `TodosColaboradoresClient.tsx` + testes.
// - Tipos exportados (`TodosColaboradoresPageData`) consumidos por
//   `page.tsx` + `TodosColaboradoresClient.tsx`.
//
// **RV-12 canonica.** Zero SQL cru — toda persistencia via API tipada
// Drizzle nos services.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import type { RoipDatabase } from '../../../../../db/client';
import { type Departamento, type JobFamily, type NivelHierarquico } from '../../../../../db/schema';
import {
  listActiveLeadersAndClevelsByCompany,
  listDistinctDepartamentosByCompany,
  listEmployeesPaginated,
  type ListEmployeesFilters,
  type ListEmployeesResult,
} from '../../../../../server/services/employees';

// -----------------------------------------------------------------------
// Labels canonicos bit-exact
// -----------------------------------------------------------------------

/**
 * §DOC 01 §15.1 — 19 departamentos canonicos bit-exact do enum
 * `employees.departamento`. Label = valor (nomes ja sao human-readable
 * no enum canonico). Mantido como Record para acesso O(1) e para
 * simetria com os demais labels.
 */
export const DEPARTAMENTO_LABELS: Readonly<Record<Departamento, string>> = {
  Comercial: 'Comercial',
  Marketing: 'Marketing',
  Operações: 'Operações',
  Produção: 'Produção',
  Logística: 'Logística',
  Compras: 'Compras',
  Financeiro: 'Financeiro',
  Contabilidade: 'Contabilidade',
  'Recursos Humanos': 'Recursos Humanos',
  'Tecnologia da Informação': 'Tecnologia da Informação',
  Jurídico: 'Jurídico',
  Qualidade: 'Qualidade',
  Manutenção: 'Manutenção',
  Projetos: 'Projetos',
  'Atendimento ao Cliente': 'Atendimento ao Cliente',
  'Pós-venda': 'Pós-venda',
  Administrativo: 'Administrativo',
  Diretoria: 'Diretoria',
  Outros: 'Outros',
};

/**
 * §DOC 01 §15.3 — 6 familias de funcao canonicas bit-exact. Labels
 * human-readable mapeados a partir do enum tecnico. Ordem canonica bit-
 * exact preservada.
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
 * §DOC 01 §15.3 — 3 niveis hierarquicos canonicos bit-exact. Labels
 * human-readable com capitalizacao canonica.
 */
export const NIVEL_HIERARQUICO_LABELS: Readonly<Record<NivelHierarquico, string>> = {
  operacional: 'Operacional',
  tatico: 'Tático',
  estrategico: 'Estratégico',
};

/**
 * §DOC 01 §4.5 — 3 senioridades canonicas bit-exact do enum
 * `employees.senioridade`.
 */
export const SENIORIDADE_LABELS: Readonly<Record<'junior' | 'pleno' | 'senior', string>> = {
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
};

/**
 * §DOC 01 §4.5 — enum `employees.status` (`ativo` / `inativo`). Label
 * canonico bit-exact para o badge da coluna 13 (§14.10).
 */
export const STATUS_LABELS: Readonly<Record<'ativo' | 'inativo', string>> = {
  ativo: 'Ativo',
  inativo: 'Inativa',
};

/**
 * §DOC 01 §9.1 + §14.10 — status canonico bit-exact do Perfil Individual
 * mais recente. Labels human-readable para o badge da coluna 11.
 * `nao_respondido` = ausencia de registro em
 * `individualProfileAssessments`; os 3 valores restantes sao o enum
 * canonico bit-exact `individualProfileAssessments.status`.
 */
export const PROFILE_INDIVIDUAL_STATUS_LABELS: Readonly<
  Record<'nao_respondido' | 'em_andamento' | 'enviado' | 'inconsistente', string>
> = {
  nao_respondido: 'Não respondido',
  em_andamento: 'Em andamento',
  enviado: 'Enviado',
  inconsistente: 'Inconsistente',
};

/**
 * §20 CAMADA_UI + §14.10 — labels canonicos bit-exact do 8o filtro
 * "Papel funcional".
 */
export function getPapelFuncionalLabel(
  papel: 'todos' | 'lider' | 'rh' | 'respfin' | 'sem_papel',
): string {
  if (papel === 'lider') return 'Líder';
  if (papel === 'rh') return 'RH';
  if (papel === 'respfin') return 'Responsável financeiro';
  if (papel === 'sem_papel') return 'Sem papel';
  return 'Todos';
}

// -----------------------------------------------------------------------
// Formatters canonicos bit-exact
// -----------------------------------------------------------------------

/**
 * §14.10 coluna 3 (CPF) — formata CPF de 11 digitos com mascara canonica
 * bit-exact `XXX.XXX.XXX-XX`. Input com menos de 11 digitos e retornado
 * como esta (defensivo — dados de teste podem chegar assim).
 */
export function formatCpfMasked(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  return `${p1}.${p2}.${p3}-${p4}`;
}

/**
 * §14.10 colunas 12 e 14 (datas) — formata `Date` como `dd/MM/yyyy`
 * canonica bit-exact BRT. L115 garante que o `Date` chega do server em
 * UTC; convertemos usando getters UTC para evitar drift TZ.
 */
export function formatDateBR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * §14.10 coluna 1 (Foto) — extrai as iniciais canonicas bit-exact do nome
 * para o avatar em circulo. Pega as duas primeiras palavras nao-vazias.
 * Nome de uma palavra so → 1 inicial. Nome vazio → "?".
 */
export function getIniciaisFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const first = parts[0];
    if (first === undefined || first.length === 0) return '?';
    return first.charAt(0).toUpperCase();
  }
  const p1 = parts[0];
  const p2 = parts[parts.length - 1];
  if (p1 === undefined || p2 === undefined) return '?';
  return (p1.charAt(0) + p2.charAt(0)).toUpperCase();
}

/**
 * §14.10 coluna 1 (Foto) — hash deterministico do nome para escolher uma
 * das 8 cores canonicas bit-exact do avatar. `photoUrl` ausente em v1;
 * iniciais coloridas garantem legibilidade sem upload.
 *
 * Paleta canonica bit-exact §2.1 CAMADA_UI + tokens de badge. Cada cor
 * combinada com `#FFFFFF` no texto para atender contraste minimo
 * WCAG AA em fonte 14px.
 */
export function hashNameToColor(name: string): string {
  const palette = [
    '#1F3A5F',
    '#14B8A6',
    '#0F766E',
    '#1E40AF',
    '#7C3AED',
    '#B45309',
    '#166534',
    '#991B1B',
  ] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % palette.length;
  const color = palette[idx];
  if (color === undefined) return palette[0];
  return color;
}

// -----------------------------------------------------------------------
// Helpers canonicos bit-exact do page.tsx
// -----------------------------------------------------------------------

/**
 * §14.10 — parse defensivo canonico bit-exact do route param `[id]`.
 * Aceita apenas inteiro positivo sem prefixo zero, sem sinal, sem
 * decimal. Retorna `null` para input invalido (page.tsx emite
 * `notFound()`).
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || String(parsed) !== raw) {
    return null;
  }
  return parsed;
}

/**
 * §14.10 — resolve URL do banco a partir de `process.env.DATABASE_URL`.
 * Erro claro se ausente — evita cair em `undefined` no mysql2.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Tipos canonicos bit-exact do carregamento da pagina
// -----------------------------------------------------------------------

/**
 * §14.10 — dados iniciais canonicos bit-exact carregados server-side por
 * `page.tsx` e passados ao client component. Inclui a primeira pagina da
 * listagem + total + dropdowns pre-populados (departamentos + lideres
 * ativos).
 */
export interface TodosColaboradoresPageData {
  readonly listResult: ListEmployeesResult;
  readonly departamentos: readonly Departamento[];
  readonly lideres: readonly { id: number; name: string; tipo: 'employee' | 'clevel' }[];
}

/**
 * §14.10 — carrega dados iniciais canonicos bit-exact da pagina. Tres
 * queries paralelas (Promise.all): listagem paginada + departamentos
 * distintos + lideres ativos. `filters` chega ja parseado do `filters.ts`
 * (via `page.tsx`).
 */
export async function loadTodosColaboradoresPage(
  db: RoipDatabase,
  companyId: number,
  filters: ListEmployeesFilters,
): Promise<TodosColaboradoresPageData> {
  const [listResult, departamentos, lideres] = await Promise.all([
    listEmployeesPaginated(db, companyId, filters),
    listDistinctDepartamentosByCompany(db, companyId),
    listActiveLeadersAndClevelsByCompany(db, companyId),
  ]);
  return { listResult, departamentos, lideres };
}
