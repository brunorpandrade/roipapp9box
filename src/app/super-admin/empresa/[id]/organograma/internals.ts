// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/organograma` (§14.9, ME-077; ME §8.06.6c).
//
// Padrão S366 CC068 desde ME-070: `page.tsx` do App Router Next 15 exporta
// APENAS o default. Todo helper, tipo, função auxiliar e loader vive neste
// `internals.ts` irmão — permite import por testes e por
// `OrganogramaClient.tsx` sem quebrar a segregação Next 15.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + comportamento clique
//   por tipo de nó) + §2.6 (cores dos nós).
// - ESPEC_ORGANOGRAMAS §3 (contiguidade do departamento), §5 (crossover do
//   C-level), §6 (organograma analítico), §8 (matriz de acesso).
// - CAMADA_AUTH §10.3/§10.4/§11.2 (PC1b).
// - CAMADA_DADOS §4.4/§4.5/§4.6.
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam` / `loadOrganogramaPage` → `page.tsx`.
//   - `NODE_TYPE_LABELS` / `DASHBOARD_UNAVAILABLE_TOOLTIP` / `PC1B_TOOLTIP`
//     / `PC1H_TOOLTIP` / `PC1I_TOOLTIP` / `getIniciaisFromName` /
//     `resolveDrawerDashboardAction` / `DrawerDashboardAction` /
//     `OrganogramaPageData` → `OrganogramaClient.tsx` + `page.tsx` + testes.
//   - ME §8.06.6c (analítico): `RECORTE_BASE_PATH_NATIVA`,
//     `buildRecorteDepartamentoHref`, `buildRecorteLeaderHref`,
//     `buildAnalyticForest`, `analyticInternalChildren`, `analyticNodeKind`,
//     `analyticHasSubLeaders`, `isDepartamentoAcessivel`,
//     `countChainDepartments`, `resolveCLevelCrossover`, `CROSSOVER_LABEL`,
//     `AnalyticDepartment`, `AnalyticNodeKind`, `CLevelCrossoverAction` →
//     `OrganogramaClient.tsx` + testes `me-8-06-6c`.
//
// **RV-12.** Zero SQL cru. **RV-14.** Um statement por linha, 100 colunas.

import type { RoipDatabase } from '../../../../../db/client';
import { everyEmployeeInScope } from '../../../../../lib/scope/recorteScopeRule';
import { loadFullOrgTree, type OrgTreeNode } from '../../../../../server/services/orgTree';

// -----------------------------------------------------------------------
// Labels e tooltips canônicos
// -----------------------------------------------------------------------

/**
 * Labels dos tipos de nó (§2.6 + §14.9 painel resumido *"Cargo/família de
 * função"*). Consumidos pelo `OrganogramaClient.tsx` e por testes.
 */
export const NODE_TYPE_LABELS = {
  empresa: 'Nó da empresa',
  clevel: 'C-level',
  lider: 'Líder',
  operacional: 'Colaborador',
} as const;

/** Tooltip §15.7 — nós de C-level para RH/RH-Líder (PC1b). */
export const PC1B_TOOLTIP = 'Detalhes restritos ao Super Admin.' as const;

/** §11.9 PC1h — nós fora da cadeia hierárquica do usuário logado. */
export const PC1H_TOOLTIP = 'Detalhes restritos à sua cadeia hierárquica.' as const;

/** §11.10 PC1i — próprio nó do usuário logado (auto-referência). */
export const PC1I_TOOLTIP = 'Acesso ao próprio perfil não permitido.' as const;

/** Botão de dashboard diferido (nó da empresa sem href habilitado). */
export const DASHBOARD_UNAVAILABLE_TOOLTIP = 'Disponível a partir da Fase 4.' as const;

/** ESPEC §5 — ação do drawer do nó de C-level (crossover para o analítico). */
export const CROSSOVER_LABEL = 'Ver agregado da cadeia' as const;

// -----------------------------------------------------------------------
// Helpers de string canônicos
// -----------------------------------------------------------------------

/**
 * §14.9 — iniciais (primeira letra do primeiro nome + primeira do último)
 * em maiúsculas para placeholder de avatar. Bit-exact ao mockup
 * `organograma_v2.html:385-388`.
 */
export function getIniciaisFromName(name: string): string {
  const partes = name.trim().split(/\s+/);
  const primeiraParte = partes[0];
  if (primeiraParte === undefined || primeiraParte.length === 0) {
    return '';
  }
  const ultimaParte = partes[partes.length - 1] ?? primeiraParte;
  const primeira = primeiraParte[0] ?? '';
  const ultima = ultimaParte[0] ?? '';
  return (primeira + ultima).toUpperCase();
}

// -----------------------------------------------------------------------
// Ação de dashboard do drawer estrutural (§14.9 S518 / ESPEC §5)
// -----------------------------------------------------------------------

/**
 * Ação primária do drawer do organograma estrutural por nó (§14.9 /
 * ESPEC §5). `individual` para pessoa com dashboard individual — nó
 * `operacional` e nó `lider` (S518, usando `entityId`); `perfil-clevel`
 * para C-level quando o observador é o Super Admin (D-ENTRY-2);
 * `unavailable` para o nó da empresa e para C-level sem acesso ao Perfil.
 * Bloqueios de auto-visão e de cadeia (D-SELF, PC1b, PC1h/PC1i) são
 * aplicados a montante — nós bloqueados nem abrem o drawer.
 */
export type DrawerDashboardAction =
  | { readonly kind: 'individual'; readonly employeeId: number }
  | { readonly kind: 'perfil-clevel'; readonly cLevelId: number }
  | { readonly kind: 'empresa-dashboard'; readonly href: string }
  | { readonly kind: 'unavailable' };

export function resolveDrawerDashboardAction(
  node: OrgTreeNode,
  canViewClevelProfile: boolean,
  empresaDashboardHref: string | null = null,
): DrawerDashboardAction {
  if (node.type === 'operacional' || node.type === 'lider') {
    return { kind: 'individual', employeeId: node.entityId };
  }
  if (node.type === 'clevel' && canViewClevelProfile) {
    return { kind: 'perfil-clevel', cLevelId: node.entityId };
  }
  if (node.type === 'empresa' && empresaDashboardHref !== null) {
    return { kind: 'empresa-dashboard', href: empresaDashboardHref };
  }
  return { kind: 'unavailable' };
}

// -----------------------------------------------------------------------
// Hrefs de recorte por contexto de rota (ME §8.06.6c, D3)
// -----------------------------------------------------------------------

/**
 * Base dos hrefs de recorte na rota multipersona nativa
 * (`/dashboard-recorte`). A rota de Bruno passa a base dedicada
 * `/super-admin/empresa/<id>/dashboard-recorte`. Generaliza o padrão de
 * `empresaDashboardHref` (§8.06.4) para os cinco recortes.
 */
export const RECORTE_BASE_PATH_NATIVA = '/dashboard-recorte' as const;

/** Href do dashboard agregado de um departamento (nome no path, encodado). */
export function buildRecorteDepartamentoHref(basePath: string, departamento: string): string {
  return `${basePath}/departamento/${encodeURIComponent(departamento)}`;
}

/**
 * Href do dashboard de equipe direta ou cadeia total de um líder. O
 * `leaderNodeId` já vem no formato de nó (`employee-N` ou `clevel-N`),
 * aceito por `resolveRecorteAlvo`.
 */
export function buildRecorteLeaderHref(
  basePath: string,
  tipo: 'equipe' | 'cadeia',
  leaderNodeId: string,
): string {
  return `${basePath}/${tipo}/${leaderNodeId}`;
}

// -----------------------------------------------------------------------
// Escopo de departamento no analítico (ME §8.06.6c, D5)
// -----------------------------------------------------------------------

/**
 * Espelha, no cliente, o branch de departamento de `canAccessRecorte`
 * (§8.06.6b) via a régua única `everyEmployeeInScope`. `restrictedNodeIds
 * === null` (Bruno, RH, RH-Líder, CU, CT) libera qualquer departamento.
 * Perfil restrito (CF, líder): departamento acessível só quando TODOS os
 * seus membros estão na cadeia; departamento vazio é inacessível.
 */
export function isDepartamentoAcessivel(
  memberEmployeeIds: readonly number[],
  restrictedNodeIds: ReadonlySet<string> | null,
): boolean {
  if (restrictedNodeIds === null) {
    return true;
  }
  if (memberEmployeeIds.length === 0) {
    return false;
  }
  return everyEmployeeInScope(memberEmployeeIds, restrictedNodeIds);
}

// -----------------------------------------------------------------------
// Derivação da floresta analítica (ME §8.06.6c, D1 — ESPEC §6)
// -----------------------------------------------------------------------

/**
 * Tipo dinâmico de um nó-pessoa dentro de um departamento no analítico
 * (§4 — recalculado pela estrutura): `lider` quando tem ao menos um filho
 * interno ao departamento; `folha` caso contrário.
 */
export type AnalyticNodeKind = 'lider' | 'folha';

/**
 * Um departamento no topo do analítico (ESPEC §6.1). `localTops` são os
 * nós estruturais da primeira camada do departamento (membros do
 * departamento cujo pai é de fora dele — §3 contiguidade). `memberEmployee
 * Ids` são todos os employees do departamento (recursivo), base do
 * esmaecimento por escopo (D5).
 */
export interface AnalyticDepartment {
  readonly departamento: string;
  readonly localTops: readonly OrgTreeNode[];
  readonly memberEmployeeIds: readonly number[];
}

function isMemberNode(node: OrgTreeNode): boolean {
  return node.type === 'lider' || node.type === 'operacional';
}

/**
 * ESPEC §6.1 — topo do analítico: bolhas dos departamentos (só
 * departamentos; C-levels e empresa fora). Cada departamento é calculado
 * pela etiqueta, não pela posição na árvore (§6.1). Ordena departamentos e
 * topos locais por nome pt-BR.
 */
export function buildAnalyticForest(root: OrgTreeNode): readonly AnalyticDepartment[] {
  const localTopsByDept = new Map<string, OrgTreeNode[]>();
  const memberIdsByDept = new Map<string, number[]>();
  function visit(node: OrgTreeNode, parentDept: string): void {
    const membro = isMemberNode(node);
    if (membro && node.departamento.length > 0) {
      const dept = node.departamento;
      const ids = memberIdsByDept.get(dept) ?? [];
      ids.push(node.entityId);
      memberIdsByDept.set(dept, ids);
      if (parentDept !== dept) {
        const tops = localTopsByDept.get(dept) ?? [];
        tops.push(node);
        localTopsByDept.set(dept, tops);
      }
    }
    const childParentDept = membro ? node.departamento : '';
    for (const child of node.children) {
      visit(child, childParentDept);
    }
  }
  visit(root, '');
  const depts = [...localTopsByDept.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return depts.map((dept) => ({
    departamento: dept,
    localTops: [...(localTopsByDept.get(dept) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    ),
    memberEmployeeIds: [...new Set(memberIdsByDept.get(dept) ?? [])].sort((a, b) => a - b),
  }));
}

/**
 * ESPEC §3/§6.3 — filhos internos ao departamento de um nó. Filho de outro
 * departamento é ponte (topo local de outro recorte) e fica de fora da
 * descida pela cadeia interna.
 */
export function analyticInternalChildren(
  node: OrgTreeNode,
  departamento: string,
): readonly OrgTreeNode[] {
  return node.children.filter((c) => c.departamento === departamento);
}

/** §4/§6.3 — `lider` se há filhos internos ao departamento; senão `folha`. */
export function analyticNodeKind(node: OrgTreeNode, departamento: string): AnalyticNodeKind {
  return analyticInternalChildren(node, departamento).length > 0 ? 'lider' : 'folha';
}

/**
 * §6.4/§6.5 — distingue líder de líderes (tem sub-líderes internos, logo
 * cadeia total ≠ equipe direta) de líder folha (só folhas na primeira
 * camada interna). Base para exibir o botão de cadeia total na aba lateral.
 */
export function analyticHasSubLeaders(node: OrgTreeNode, departamento: string): boolean {
  return analyticInternalChildren(node, departamento).some(
    (c) => analyticInternalChildren(c, departamento).length > 0,
  );
}

// -----------------------------------------------------------------------
// Crossover do C-level (ME §8.06.6c / §8.06.6d — ESPEC §5, §9)
// -----------------------------------------------------------------------

/**
 * ESPEC §5 — nº de departamentos distintos comandados por um C-level
 * (etiquetas dos membros da cadeia total dele). A ação "ver agregado da
 * cadeia" só é informativa com dois ou mais (com um, coincide com o
 * dashboard daquele departamento).
 */
export function countChainDepartments(cLevelNode: OrgTreeNode): number {
  const depts = new Set<string>();
  function visit(node: OrgTreeNode): void {
    if (isMemberNode(node) && node.departamento.length > 0) {
      depts.add(node.departamento);
    }
    for (const child of node.children) {
      visit(child);
    }
  }
  for (const child of cLevelNode.children) {
    visit(child);
  }
  return depts.size;
}

/**
 * ESPEC §5/§9 — ação "ver agregado da cadeia" no drawer estrutural do nó de
 * C-level. Presente só quando o observador tem visibilidade total
 * (`viewerHasFullScope`: Bruno, RH, CU, CT — escopo PC1h nulo) e o C-level
 * comanda dois ou mais departamentos. Cruza para o recorte da cadeia total
 * do C-level (`/…/cadeia/clevel-<id>`), respeitando a base de rota.
 *
 * Nota de reconciliação (§8.06.6d): PC1b mantém o nó de C-level não
 * clicável para RH/RH-Líder; para esses perfis o drawer não abre e a ação
 * não é alcançada aqui. A porta do RH ao agregado da cadeia do C-level
 * pelo organograma fica para a reconciliação de texto do DOC 02 (§5 × §11.2);
 * o direito de acesso do RH permanece via a rota nativa de recorte.
 */
export type CLevelCrossoverAction =
  { readonly kind: 'crossover'; readonly href: string } | { readonly kind: 'none' };

export function resolveCLevelCrossover(
  node: OrgTreeNode,
  viewerHasFullScope: boolean,
  recorteBasePath: string,
): CLevelCrossoverAction {
  if (node.type !== 'clevel') {
    return { kind: 'none' };
  }
  if (!viewerHasFullScope) {
    return { kind: 'none' };
  }
  if (countChainDepartments(node) < 2) {
    return { kind: 'none' };
  }
  return {
    kind: 'crossover',
    href: buildRecorteLeaderHref(recorteBasePath, 'cadeia', node.id),
  };
}

// -----------------------------------------------------------------------
// Parse de params + loader (inalterados)
// -----------------------------------------------------------------------

/**
 * Parse de `params.id` — aceita apenas inteiros positivos. Retorna `null`
 * para inputs inválidos (consumido por `page.tsx` para `notFound()`).
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Dados carregados no server e passados ao client. `root` é a árvore
 * completa; `applyPC1b` para Bruno é sempre `false`.
 */
export interface OrganogramaPageData {
  readonly root: OrgTreeNode;
  readonly applyPC1b: boolean;
}

/**
 * §14.9 — carga inicial da árvore para renderização server-side. Chama
 * `loadFullOrgTree`; retorna `null` se a empresa não existir. `applyPC1b`
 * do Super Admin é sempre `false` (§11.2/§11.7).
 */
export async function loadOrganogramaPage(
  db: RoipDatabase,
  companyId: number,
): Promise<OrganogramaPageData | null> {
  const root = await loadFullOrgTree(db, companyId);
  if (root === null) {
    return null;
  }
  return { root, applyPC1b: false };
}
