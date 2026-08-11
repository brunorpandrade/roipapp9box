// ROIP APP 9BOX — service canônico bit-exact do organograma (§14.9 +
// §2.6 + PC1b §11.2 + CAMADA_NEGOCIO §15.7, ME-077). QUARTA rota de
// código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.9 (layout árvore + modo normal + comportamento clique
//   por tipo de nó) + §2.6 (cores dos nós).
// - CAMADA_AUTH §10.4 (organograma acessível a todos os perfis
//   autenticados) + §11.2 PC1b (RH vê C-level sem clique).
// - CAMADA_NEGOCIO §15.7 (regra visual e comportamental PC1b).
// - CAMADA_DADOS §4.4 (`cLevelMembers`) + §4.5 (`employees`) + §4.6
//   (`employeeLeaderHistory` — tabela-fonte da árvore).
// - Mockup canônico: `organograma_v2.html` (612 linhas).
// - MASTER_ESCOPO_B8.md §2 (pattern canônico comum) + §3.4 (ficha
//   canônica desta ME).
//
// Reuso canônico bit-exact da fundação ME-076:
// - Patch 2: LEFT JOIN em `cLevelMembers` via `elh.clevelId` (padrão
//   consolidado em `employees.ts:472`).
// - Patch 3: ordenação alfabética global unificada via
//   `.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'))` (padrão
//   consolidado em `listActiveLeadersAndClevelsByCompany`).
//
// Estrutura canônica bit-exact da árvore (§14.9 + mockup linhas 291-
// 307):
//   raiz: nó empresa (branco borda navy §2.6).
//   filhos da empresa: C-levels ativos (navy §2.6), ordem alfabética.
//   filhos de um C-level: colaboradores ativos com
//     `elh.clevelId = <clevelId>` e `elh.dataFim IS NULL`, ordem
//     alfabética.
//   filhos de um employee `isLider=true` (teal §2.6): colaboradores
//     ativos com `elh.liderId = <employeeId>` e `elh.dataFim IS NULL`,
//     ordem alfabética.
//   colaboradores `isLider=false`: folhas (branco borda cinza §2.6).
//
// Regra canônica bit-exact §4.6: exatamente um entre `liderId` e
// `clevelId` preenchido — nunca ambos, nunca nenhum. Este service
// materializa a árvore respeitando essa invariante em memória.
//
// **RV-13.** Todo export é consumido:
//   - `loadFullOrgTree` → router `orgTree.getFullTree`.
//   - `loadEmployeeSubtree` → router `orgTree.getEmployeeSubtree`.
//   - `OrgTreeNode` type → router + client component + testes.
//   - `OrgTreeNodeType` type → router + client + testes.
//
// **RV-12.** Zero SQL cru — 100% Drizzle tipado.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../db/schema';
import type { Departamento } from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Tipos canônicos bit-exact
// -----------------------------------------------------------------------

/**
 * Tipos canônicos bit-exact dos nós da árvore, alinhados 1-para-1 com
 * as classes CSS canônicas do mockup `organograma_v2.html` (linhas 108-
 * 111) e com as cores §2.6:
 *   - 'empresa'     → branco borda navy #1F3A5F.
 *   - 'clevel'      → navy #1F3A5F texto branco.
 *   - 'lider'       → teal #14B8A6 texto branco.
 *   - 'operacional' → branco borda cinza #E5E7EB.
 */
export type OrgTreeNodeType = 'empresa' | 'clevel' | 'lider' | 'operacional';

/**
 * Nó canônico bit-exact da árvore. Estrutura recursiva por `children`.
 *
 * `id` canônico bit-exact é um identificador estável para a UI:
 *   - 'empresa'         para a raiz.
 *   - 'clevel-<id>'     para C-levels (`cLevelMembers.id`).
 *   - 'employee-<id>'   para employees (`employees.id`).
 *
 * `entityId` é o inteiro cru do registro na tabela-fonte (útil para
 * navegação e para o payload de `orgTree.getEmployeeSubtree`). Para a
 * raiz `empresa`, `entityId` é o `companies.id`.
 *
 * `cargo` para a raiz é string vazia (nó da empresa não tem cargo). Para
 * C-levels é `cLevelMembers.cargo`. Para employees é `employees.descricaoCBO`.
 *
 * `departamento` para a raiz é string vazia. Para os demais é o valor
 * canônico do enum `Departamento`.
 *
 * `numLideradosDiretos` conta apenas filhos diretos (§14.9 painel lateral
 * literal *"N liderados diretos"* — não a cadeia descendente). Para a
 * raiz, conta os C-levels ativos da empresa.
 */
export interface OrgTreeNode {
  readonly id: string;
  readonly type: OrgTreeNodeType;
  readonly entityId: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly photoUrl: string | null;
  readonly numLideradosDiretos: number;
  readonly children: readonly OrgTreeNode[];
}

// -----------------------------------------------------------------------
// Loaders canônicos bit-exact
// -----------------------------------------------------------------------

/**
 * §14.9 — carrega a árvore completa canônica bit-exact da empresa. Ordem
 * de execução:
 *   1. SELECT em `companies` para resolver o nó raiz (nomeFantasia).
 *      Retorna `null` quando a empresa não existe (Chamado consome
 *      isso para responder NOT_FOUND canônico).
 *   2. SELECT em `cLevelMembers` (status='ativo'), ordenado por nome.
 *   3. SELECT em `employees` (status='ativo'), ordenado por nome.
 *   4. SELECT em `employeeLeaderHistory` (dataFim IS NULL) via
 *      INNER JOIN com `employees` filtrado pela empresa. Padrão canônico
 *      bit-exact do Patch 2 ME-076 (`employees.ts:472`).
 *   5. Montagem em memória: indexa vínculos ativos por `employeeId`;
 *      atribui cada employee ao pai canônico (C-level ou líder) via
 *      `elh.clevelId` ou `elh.liderId`; ordena irmãos por nome pt-BR
 *      (padrão canônico bit-exact do Patch 3 ME-076).
 *
 * §4.6 invariante canônica: exatamente um entre `liderId` e `clevelId`
 * preenchido. Se um employee não tem vínculo ativo (caso degenerado —
 * schema não bloqueia), ele fica órfão e não aparece na árvore. Isso é
 * comportamento canônico defensivo — nenhum colaborador ativo canônico
 * deveria ficar sem líder.
 */
export async function loadFullOrgTree(
  db: RoipDatabase,
  companyId: number,
): Promise<OrgTreeNode | null> {
  // Passo 1 — resolve a empresa.
  const companyRows = await db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
      logoUrl: companies.logoUrl,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (company === undefined) {
    return null;
  }

  // Passo 2 — C-levels ativos.
  const clevelRows = await db
    .select({
      id: cLevelMembers.id,
      name: cLevelMembers.name,
      cargo: cLevelMembers.cargo,
      departamento: cLevelMembers.departamento,
      photoUrl: cLevelMembers.photoUrl,
    })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')))
    .orderBy(asc(cLevelMembers.name));

  // Passo 3 — employees ativos.
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      photoUrl: employees.photoUrl,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .orderBy(asc(employees.name));

  // Passo 4 — vínculos ativos via INNER JOIN canônico bit-exact
  // (padrão Patch 2 ME-076: JOIN em `employees` para filtrar por
  // empresa; `dataFim IS NULL` isola o vínculo vigente).
  const elhRows = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));

  // Passo 5 — indexação e montagem em memória.
  return assembleTree(company, clevelRows, empRows, elhRows);
}

/**
 * §14.9 — carrega a sub-árvore canônica bit-exact enraizada em um
 * employee específico. Consumido pelo `OrganogramaClient.tsx` para
 * expansão sob demanda de nós inicialmente colapsados (evita renderizar
 * 66 colaboradores da Nativa de uma só vez — D6 aprovada).
 *
 * Retorna `null` quando o employee não existe, é inativo ou não pertence
 * à empresa. Semântica canônica bit-exact ao `loadFullOrgTree` para o
 * subset descendente.
 *
 * Nota canônica: colaboradores comuns (`isLider=false`) retornam nó
 * folha sem filhos. C-levels não são raiz aqui — sub-árvores partem
 * sempre de employees (o organograma completo já entrega C-levels no
 * primeiro nível).
 */
export async function loadEmployeeSubtree(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
): Promise<OrgTreeNode | null> {
  // Confirma que o employee raiz existe, está ativo e pertence à empresa.
  const rootRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      photoUrl: employees.photoUrl,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);
  const root = rootRows[0];
  if (root === undefined) {
    return null;
  }

  // Carrega TODOS os employees ativos + vínculos ativos da empresa
  // (mesmo custo do `loadFullOrgTree` para essa camada; a árvore
  // completa é pequena em PMEs canônicas do MVP). Filtra descendentes
  // do raiz em memória.
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      photoUrl: employees.photoUrl,
      isLider: employees.isLider,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .orderBy(asc(employees.name));

  const elhRows = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));

  return assembleEmployeeSubtree(root, empRows, elhRows);
}

// -----------------------------------------------------------------------
// Helpers puros de montagem (não exportados — RV-13 exige chamador
// interno somente para funções internas)
// -----------------------------------------------------------------------

interface CLevelRow {
  readonly id: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: Departamento;
  readonly photoUrl: string | null;
}

interface EmployeeRow {
  readonly id: number;
  readonly name: string;
  readonly descricaoCBO: string;
  readonly departamento: Departamento;
  readonly photoUrl: string | null;
  readonly isLider: boolean | null;
}

interface ElhRow {
  readonly employeeId: number;
  readonly liderId: number | null;
  readonly clevelId: number | null;
}

interface CompanyRow {
  readonly id: number;
  readonly nomeFantasia: string;
  readonly logoUrl: string | null;
}

function assembleTree(
  company: CompanyRow,
  clevels: readonly CLevelRow[],
  emps: readonly EmployeeRow[],
  elh: readonly ElhRow[],
): OrgTreeNode {
  // Índice canônico bit-exact: employeeId → vínculo ativo.
  const linkByEmployee = new Map<number, ElhRow>();
  for (const row of elh) {
    linkByEmployee.set(row.employeeId, row);
  }

  // Agrupa employees por pai canônico.
  const empsByClevel = new Map<number, EmployeeRow[]>();
  const empsByLider = new Map<number, EmployeeRow[]>();
  for (const emp of emps) {
    const link = linkByEmployee.get(emp.id);
    if (link === undefined) {
      // Órfão canônico defensivo — não aparece na árvore.
      continue;
    }
    if (link.clevelId !== null) {
      const list = empsByClevel.get(link.clevelId) ?? [];
      list.push(emp);
      empsByClevel.set(link.clevelId, list);
    } else if (link.liderId !== null) {
      const list = empsByLider.get(link.liderId) ?? [];
      list.push(emp);
      empsByLider.set(link.liderId, list);
    }
  }

  // Ordena listas de irmãos por nome pt-BR (Patch 3 ME-076).
  for (const list of empsByClevel.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  for (const list of empsByLider.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  // Constrói recursivamente descendentes de um employee.
  function buildEmployeeNode(emp: EmployeeRow): OrgTreeNode {
    const isLider = emp.isLider === true;
    const directChildren = isLider ? (empsByLider.get(emp.id) ?? []) : [];
    const children = directChildren.map(buildEmployeeNode);
    return {
      id: `employee-${emp.id}`,
      type: isLider ? 'lider' : 'operacional',
      entityId: emp.id,
      name: emp.name,
      cargo: emp.descricaoCBO,
      departamento: emp.departamento,
      photoUrl: emp.photoUrl,
      numLideradosDiretos: directChildren.length,
      children,
    };
  }

  // Constrói cada C-level com seus filhos diretos.
  const clevelNodes: OrgTreeNode[] = clevels.map((cl) => {
    const directChildren = empsByClevel.get(cl.id) ?? [];
    const children = directChildren.map(buildEmployeeNode);
    return {
      id: `clevel-${cl.id}`,
      type: 'clevel',
      entityId: cl.id,
      name: cl.name,
      cargo: cl.cargo,
      departamento: cl.departamento,
      photoUrl: cl.photoUrl,
      numLideradosDiretos: directChildren.length,
      children,
    };
  });

  // Raiz canônica bit-exact — empresa.
  return {
    id: 'empresa',
    type: 'empresa',
    entityId: company.id,
    name: company.nomeFantasia,
    cargo: '',
    departamento: '',
    photoUrl: company.logoUrl,
    numLideradosDiretos: clevelNodes.length,
    children: clevelNodes,
  };
}

function assembleEmployeeSubtree(
  root: EmployeeRow,
  emps: readonly EmployeeRow[],
  elh: readonly ElhRow[],
): OrgTreeNode {
  const linkByEmployee = new Map<number, ElhRow>();
  for (const row of elh) {
    linkByEmployee.set(row.employeeId, row);
  }
  const empsByLider = new Map<number, EmployeeRow[]>();
  for (const emp of emps) {
    const link = linkByEmployee.get(emp.id);
    if (link === undefined || link.liderId === null) {
      continue;
    }
    const list = empsByLider.get(link.liderId) ?? [];
    list.push(emp);
    empsByLider.set(link.liderId, list);
  }
  for (const list of empsByLider.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  function buildEmployeeNode(emp: EmployeeRow): OrgTreeNode {
    const isLider = emp.isLider === true;
    const directChildren = isLider ? (empsByLider.get(emp.id) ?? []) : [];
    const children = directChildren.map(buildEmployeeNode);
    return {
      id: `employee-${emp.id}`,
      type: isLider ? 'lider' : 'operacional',
      entityId: emp.id,
      name: emp.name,
      cargo: emp.descricaoCBO,
      departamento: emp.departamento,
      photoUrl: emp.photoUrl,
      numLideradosDiretos: directChildren.length,
      children,
    };
  }
  return buildEmployeeNode(root);
}
