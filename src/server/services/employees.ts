// ROIP APP 9BOX — service `employees` (ME-011 + ME-076).
//
// Repositorio tipado da tabela canonica `employees` (DOC 01 §4.5). Toda
// persistencia via API tipada do Drizzle — nenhuma execucao crua (RV-12).
// Cada export tem chamador nos testes de integracao da propria ME-011
// (RV-13), e futuramente nos routers tRPC (Bloco B2/B3).
//
// A ME-011 nao implementa as regras de negocio da §4.5 (validacao de
// `isResponsavelFinanceiro` global entre employees + cLevelMembers,
// procedure `setResponsavelFinanceiro`, gates de inativacao/delecao). Essas
// regras vivem no Bloco B3, sobre estes primitivos.
//
// ME-076 canonica bit-exact acrescenta `listEmployeesPaginated` — SELECT
// tipado Drizzle com filtros dinamicos + paginacao server-side + ordenacao
// + LEFT JOIN em `employeeLeaderHistory` para nome do lider direto + LEFT
// JOIN em `individualProfileAssessments` para status do Perfil Individual
// mais recente. Consumida pela proc `employees.list` (roleProcedure super_
// admin/rh/rh_lider) do router, que por sua vez alimenta a rota Bruno
// `/super-admin/empresa/[id]/todos-os-colaboradores` (§14.10).

import { and, asc, countDistinct, desc, eq, gte, isNull, like, lte, max, or } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import type { RoipDatabase } from '../../db/client';
import {
  employeeLeaderHistory,
  employees,
  individualProfileAssessments,
  cLevelMembers,
} from '../../db/schema';
import type { Departamento, JobFamily, NivelHierarquico, OnboardingEstagio } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `employees`). */
export type NewEmployee = typeof employees.$inferInsert;

/**
 * Insere um novo colaborador. Retorna o `id` autogerado. Erros de FK
 * (`companyId` invalido) e de UNIQUE (`uq_employee_cpf`) sobem como
 * excecoes do mysql2.
 */
export async function createEmployee(db: RoipDatabase, data: NewEmployee): Promise<number> {
  const [result] = await db.insert(employees).values(data).$returningId();
  if (!result) {
    throw new Error('createEmployee: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um colaborador pelo id. Retorna `undefined` se nao existir. */
export async function getEmployeeById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um colaborador pelo par (companyId, cpf) — o UNIQUE canonico da
 * §4.5. Retorna `undefined` se nao existir.
 */
export async function getEmployeeByCpf(db: RoipDatabase, companyId: number, cpf: string) {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.cpf, cpf)))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os colaboradores de uma empresa em ordem crescente de `id`.
 * Consumida por rotas de listagem e por batches de calculo (B3).
 */
export async function listEmployeesByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, companyId))
    .orderBy(asc(employees.id));
}

/**
 * Atualiza apenas o campo `status` de um colaborador. Nao toca em outros
 * campos. Retorna o numero de linhas afetadas.
 */
export async function updateEmployeeStatus(
  db: RoipDatabase,
  id: number,
  status: 'ativo' | 'inativo',
): Promise<number> {
  const [result] = await db.update(employees).set({ status }).where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Atualiza o estagio de onboarding de lider (§4.5 — relevante apenas quando
 * `isLider = true`). Retorna o numero de linhas afetadas.
 */
export async function updateOnboardingEstagio(
  db: RoipDatabase,
  id: number,
  estagio: OnboardingEstagio,
): Promise<number> {
  const [result] = await db
    .update(employees)
    .set({ onboardingEstagio: estagio })
    .where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Setter simples do papel funcional `isResponsavelFinanceiro`. A garantia de
 * cardinalidade global (max 1 `true` por empresa considerando a uniao com
 * `cLevelMembers`, §4.5) e responsabilidade da procedure
 * `setResponsavelFinanceiro` do Bloco B3 — nao imposta aqui. Retorna o
 * numero de linhas afetadas.
 */
export async function setEmployeeIsResponsavelFinanceiro(
  db: RoipDatabase,
  id: number,
  value: boolean,
): Promise<number> {
  const [result] = await db
    .update(employees)
    .set({ isResponsavelFinanceiro: value })
    .where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Remove um colaborador pelo id. Somente para teardown de testes — em
 * producao a inativacao e via `updateEmployeeStatus` e o gate estrutural de
 * ON DELETE RESTRICT bloqueia excluir colaborador com historico analitico
 * (§17.3). Retorna o numero de linhas afetadas.
 */
export async function deleteEmployeeById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(employees).where(eq(employees.id, id));
  return result.affectedRows;
}

/**
 * Atualiza a credencial (`passwordHash` e opcionalmente `passwordSet`) de
 * um colaborador. Consumidores canonicos (DOC 02 §4.5, §4.7):
 *
 *   - `auth.resetPassword` (ME-022b): passa `passwordSet` omitido (nao
 *     altera o marcador; um reset assume `passwordSet=true` ja verdadeiro).
 *   - `auth.firstAccess` (ME-022b): passa `passwordSet: true` (primeira
 *     definicao de senha — libera o login §5.5).
 *   - `auth.changePassword` (ME-022c): passa `passwordSet` omitido.
 *
 * A troca de `passwordHash` invalida naturalmente todas as sessoes JWT
 * anteriores (§5.7 via S011: o `pwv` derivado do hash muda; tokens em
 * circulacao caem no middleware `authed`).
 *
 * Retorna o numero de linhas afetadas.
 */
export async function updateEmployeeCredential(
  db: RoipDatabase,
  id: number,
  data: { passwordHash: string; passwordSet?: boolean },
): Promise<number> {
  const patch: { passwordHash: string; passwordSet?: boolean } = {
    passwordHash: data.passwordHash,
  };
  if (data.passwordSet !== undefined) {
    patch.passwordSet = data.passwordSet;
  }
  const [result] = await db.update(employees).set(patch).where(eq(employees.id, id));
  return result.affectedRows;
}

// =======================================================================
// ME-076 canonica bit-exact — listagem paginada de colaboradores
// (rota Bruno `/super-admin/empresa/[id]/todos-os-colaboradores`, §14.10).
// =======================================================================

/** Escopo canonico bit-exact do filtro `Papel funcional` (§14.10 + §20). */
export const PAPEL_FUNCIONAL_VALUES = ['todos', 'lider', 'rh', 'respfin', 'sem_papel'] as const;
export type PapelFuncional = (typeof PAPEL_FUNCIONAL_VALUES)[number];

/** Ordenacao canonica bit-exact — 10 campos ordenaveis (§14.10). */
export const LIST_EMPLOYEES_SORT_FIELDS = [
  'name',
  'cpf',
  'descricaoCBO',
  'senioridade',
  'jobFamily',
  'nivelHierarquico',
  'departamento',
  'liderName',
  'dataAdmissao',
  'createdAt',
] as const;
export type ListEmployeesSortField = (typeof LIST_EMPLOYEES_SORT_FIELDS)[number];
export const LIST_EMPLOYEES_SORT_ORDERS = ['asc', 'desc'] as const;
export type ListEmployeesSortOrder = (typeof LIST_EMPLOYEES_SORT_ORDERS)[number];

/** Tamanhos canonicos bit-exact de pagina §14.10. */
export const LIST_EMPLOYEES_PAGE_SIZES = [25, 50, 100] as const;
export type ListEmployeesPageSize = (typeof LIST_EMPLOYEES_PAGE_SIZES)[number];

/** Filtros canonicos bit-exact §14.10 + §20 + §14.10.1. */
export interface ListEmployeesFilters {
  readonly busca: string;
  readonly departamento: Departamento | null;
  readonly liderId: number | null;
  readonly liderIdTipo: 'employee' | 'clevel' | null;
  readonly nivelHierarquico: NivelHierarquico | null;
  readonly status: 'ativo' | 'inativo' | 'todos';
  readonly senioridade: 'junior' | 'pleno' | 'senior' | null;
  readonly jobFamily: JobFamily | null;
  readonly dataAdmissaoInicio: Date | null;
  readonly dataAdmissaoFim: Date | null;
  readonly dataCadastroInicio: Date | null;
  readonly dataCadastroFim: Date | null;
  readonly papelFuncional: PapelFuncional;
  readonly sortBy: ListEmployeesSortField;
  readonly sortOrder: ListEmployeesSortOrder;
  readonly page: number;
  readonly pageSize: ListEmployeesPageSize;
}

/** Status canonico bit-exact do Perfil Individual mais recente §9.1 + §14.10. */
export type ProfileIndividualStatus =
  'nao_respondido' | 'em_andamento' | 'enviado' | 'inconsistente';

/**
 * Linha canonica bit-exact devolvida por `listEmployeesPaginated`. Contem
 * todas as 14 colunas §14.10 + os 3 flags para os badges §14.10.1 +
 * campos derivados (`liderName`, `profileIndividualStatus`).
 */
export interface EmployeeListRow {
  readonly id: number;
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly email: string | null;
  readonly photoUrl: string | null;
  readonly cargo: string;
  readonly senioridade: 'junior' | 'pleno' | 'senior';
  readonly jobFamily: JobFamily;
  readonly nivelHierarquico: NivelHierarquico;
  readonly departamento: Departamento;
  readonly status: 'ativo' | 'inativo';
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly dataAdmissao: Date;
  readonly createdAt: Date;
  readonly liderName: string | null;
  readonly liderTipo: 'employee' | 'clevel' | null;
  readonly profileIndividualStatus: ProfileIndividualStatus;
}

/** Resultado canonico bit-exact da listagem paginada. */
export interface ListEmployeesResult {
  readonly rows: readonly EmployeeListRow[];
  readonly totalCount: number;
  readonly filtersApplied: ListEmployeesFilters;
}

/**
 * §14.10.1 — resolve status canonico bit-exact do Perfil Individual do
 * colaborador mais recente. Ausencia de registro em
 * `individualProfileAssessments` = "nao_respondido"; enum canonico bit-
 * exact §9.1 (`em_andamento`, `enviado`, `inconsistente`) mapeado sem
 * traducao.
 */
function resolveProfileIndividualStatus(raw: string | null): ProfileIndividualStatus {
  if (raw === null) return 'nao_respondido';
  if (raw === 'em_andamento') return 'em_andamento';
  if (raw === 'enviado') return 'enviado';
  if (raw === 'inconsistente') return 'inconsistente';
  return 'nao_respondido';
}

/**
 * §14.10 — resolve a coluna de ordenacao canonica bit-exact. `liderName`
 * ordena pelo nome do lider direto (LEFT JOIN alias); demais campos
 * ordenam por colunas do proprio `employees`.
 */
function resolveOrderByColumn(
  sortBy: ListEmployeesSortField,
  liderAliasNameCol: AnyColumn,
): AnyColumn {
  if (sortBy === 'liderName') return liderAliasNameCol;
  if (sortBy === 'name') return employees.name;
  if (sortBy === 'cpf') return employees.cpf;
  if (sortBy === 'descricaoCBO') return employees.descricaoCBO;
  if (sortBy === 'senioridade') return employees.senioridade;
  if (sortBy === 'jobFamily') return employees.jobFamily;
  if (sortBy === 'nivelHierarquico') return employees.nivelHierarquico;
  if (sortBy === 'departamento') return employees.departamento;
  if (sortBy === 'dataAdmissao') return employees.dataAdmissao;
  return employees.createdAt;
}

/**
 * §14.10 — monta o predicado canonico bit-exact do filtro `Papel funcional`
 * §20. Opcao `todos` = sem filtro (retorna `undefined`).
 */
function resolvePapelFuncionalCondition(papel: PapelFuncional): SQL | undefined {
  if (papel === 'todos') return undefined;
  if (papel === 'lider') return eq(employees.isLider, true);
  if (papel === 'rh') return eq(employees.isRH, true);
  if (papel === 'respfin') return eq(employees.isResponsavelFinanceiro, true);
  return and(
    eq(employees.isLider, false),
    eq(employees.isRH, false),
    eq(employees.isResponsavelFinanceiro, false),
  );
}

/**
 * §14.10 — monta o predicado canonico bit-exact do filtro `Status`. Opcao
 * `todos` = sem filtro (retorna `undefined`).
 */
function resolveStatusCondition(status: 'ativo' | 'inativo' | 'todos'): SQL | undefined {
  if (status === 'todos') return undefined;
  return eq(employees.status, status);
}

/**
 * §14.10 — busca global canonica bit-exact (name/cpf/cargo). Case-
 * insensitive via collation padrao MySQL 8 (`utf8mb4_0900_ai_ci`) — o
 * `LIKE` do MySQL ja e case-insensitive por default sob esta collation,
 * consistente bit-exact com a producao Railway (MySQL 8.4 LTS).
 */
function resolveBuscaCondition(busca: string): SQL | undefined {
  if (busca === '') return undefined;
  const pattern = `%${busca}%`;
  return or(
    like(employees.name, pattern),
    like(employees.cpf, pattern),
    like(employees.descricaoCBO, pattern),
  );
}

/**
 * §14.10 canonica bit-exact — listagem paginada de colaboradores. Retorna
 * `{ rows, totalCount, filtersApplied }`. Cross-tenant safe: filtra por
 * `companyId` antes de qualquer JOIN.
 *
 * JOIN canonicos bit-exact:
 *
 * - `employeeLeaderHistory` LEFT JOIN via alias `elh` com `dataFim IS NULL`
 *   AND `liderId IS NOT NULL` para vinculo ativo com lider `employee`
 *   (C-level nao aparece nesta v1). LEFT JOIN em `employees` para pegar
 *   `liderName` (alias `liderEmp`).
 * - `individualProfileAssessments` LEFT JOIN via alias `ipa` com `userType
 *   = 'employee'` AND `userId = employees.id`. Sub-SELECT para pegar o
 *   registro de maior `tentativa` por employee (mais recente).
 *
 * Ordenacao canonica bit-exact: coluna solicitada em `sortBy` + `sortOrder`
 * + desempate deterministico por `employees.id ASC`. Paginacao server-side
 * via `LIMIT` + `OFFSET` — mesma consulta com `COUNT(*)` para totalCount.
 *
 * Bruno vs RH: quando `includeCLevelInList = false` (default e unica opcao
 * na v1), C-levels da tabela `cLevelMembers` NAO sao incluidos — seguindo
 * padrao RH-nativo e ficha §3.3 do MASTER_ESCOPO_B8. PC1a (§11.1 CAMADA_
 * AUTH) e responsabilidade do consumidor (proc router aplica filtro se
 * role RH/RH-Lider). Bruno chama sempre com PC1a=false.
 */
export async function listEmployeesPaginated(
  db: RoipDatabase,
  companyId: number,
  filters: ListEmployeesFilters,
): Promise<ListEmployeesResult> {
  const liderEmp = alias(employees, 'liderEmp');
  const elh = alias(employeeLeaderHistory, 'elh');

  // Sub-SELECT canonico bit-exact: id do registro `individualProfile
  // Assessments` de maior `tentativa` por employee da empresa alvo.
  // Preserva RV-12 (Drizzle tipado — sem template raw do drizzle).
  const ipaLatestSub = db
    .select({
      userId: individualProfileAssessments.userId,
      maxTentativa: max(individualProfileAssessments.tentativa).as('maxTentativa'),
    })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, 'employee'),
      ),
    )
    .groupBy(individualProfileAssessments.userId)
    .as('ipa_latest');

  const buscaCond = resolveBuscaCondition(filters.busca);
  const statusCond = resolveStatusCondition(filters.status);
  const papelCond = resolvePapelFuncionalCondition(filters.papelFuncional);

  const whereConds: (SQL | undefined)[] = [
    eq(employees.companyId, companyId),
    buscaCond,
    filters.departamento === null ? undefined : eq(employees.departamento, filters.departamento),
    filters.nivelHierarquico === null
      ? undefined
      : eq(employees.nivelHierarquico, filters.nivelHierarquico),
    statusCond,
    filters.senioridade === null ? undefined : eq(employees.senioridade, filters.senioridade),
    filters.jobFamily === null ? undefined : eq(employees.jobFamily, filters.jobFamily),
    filters.dataAdmissaoInicio === null
      ? undefined
      : gte(employees.dataAdmissao, filters.dataAdmissaoInicio),
    filters.dataAdmissaoFim === null
      ? undefined
      : lte(employees.dataAdmissao, filters.dataAdmissaoFim),
    filters.dataCadastroInicio === null
      ? undefined
      : gte(employees.createdAt, filters.dataCadastroInicio),
    filters.dataCadastroFim === null
      ? undefined
      : lte(employees.createdAt, filters.dataCadastroFim),
    papelCond,
  ];

  // Filtro `liderId` canonica bit-exact — precisa correlacao com o vinculo
  // ativo (elh). Aplica-se via clausula sobre `elh.liderId`; se ausente,
  // sem filtro.
  const definedWhereConds = whereConds.filter((c): c is SQL => c !== undefined);

  /**
   * §14.10 + Patch 3 canônico bit-exact — resolve o predicado canônico
   * bit-exact do filtro "Líder". Quando `liderId=null`, sem filtro. Quando
   * `liderIdTipo='employee'`, filtra bit-exact por `elh.liderId`. Quando
   * `liderIdTipo='clevel'`, filtra bit-exact por `elh.clevelId`.
   */
  const resolveLiderIdCondition = (): SQL | undefined => {
    if (filters.liderId === null) return undefined;
    if (filters.liderIdTipo === 'clevel') {
      return eq(elh.clevelId, filters.liderId);
    }
    return eq(elh.liderId, filters.liderId);
  };
  const liderIdCond = resolveLiderIdCondition();

  const orderCol = resolveOrderByColumn(filters.sortBy, liderEmp.name);
  const orderExpr = filters.sortOrder === 'asc' ? asc(orderCol) : desc(orderCol);

  const offset = (filters.page - 1) * filters.pageSize;

  // SELECT paginado tipado canonica bit-exact.
  const rowsRaw = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      name: employees.name,
      cpf: employees.cpf,
      email: employees.email,
      photoUrl: employees.photoUrl,
      cargo: employees.descricaoCBO,
      senioridade: employees.senioridade,
      jobFamily: employees.jobFamily,
      nivelHierarquico: employees.nivelHierarquico,
      departamento: employees.departamento,
      status: employees.status,
      isRH: employees.isRH,
      isLider: employees.isLider,
      isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
      dataAdmissao: employees.dataAdmissao,
      createdAt: employees.createdAt,
      liderName: liderEmp.name,
      elhLiderId: elh.liderId,
      clevelName: cLevelMembers.name,
      elhClevelId: elh.clevelId,
      profileIndividualStatusRaw: individualProfileAssessments.status,
    })
    .from(employees)
    .leftJoin(elh, and(eq(elh.employeeId, employees.id), isNull(elh.dataFim)))
    .leftJoin(liderEmp, eq(liderEmp.id, elh.liderId))
    .leftJoin(cLevelMembers, eq(cLevelMembers.id, elh.clevelId))
    .leftJoin(ipaLatestSub, eq(ipaLatestSub.userId, employees.id))
    .leftJoin(
      individualProfileAssessments,
      and(
        eq(individualProfileAssessments.userId, employees.id),
        eq(individualProfileAssessments.userType, 'employee'),
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.tentativa, ipaLatestSub.maxTentativa),
      ),
    )
    .where(
      liderIdCond === undefined
        ? and(...definedWhereConds)
        : and(...definedWhereConds, liderIdCond),
    )
    .orderBy(orderExpr, asc(employees.id))
    .limit(filters.pageSize)
    .offset(offset);

  // Total canonico bit-exact — mesma clausula WHERE, sem paginacao.
  const totalRaw = await db
    .select({ n: countDistinct(employees.id) })
    .from(employees)
    .leftJoin(elh, and(eq(elh.employeeId, employees.id), isNull(elh.dataFim)))
    .where(
      liderIdCond === undefined
        ? and(...definedWhereConds)
        : and(...definedWhereConds, liderIdCond),
    );

  const totalCount = Number(totalRaw[0]?.n ?? 0);

  const resolveLiderInfo = (
    liderNameRaw: string | null,
    clevelNameRaw: string | null,
  ): { liderName: string | null; liderTipo: 'employee' | 'clevel' | null } => {
    if (liderNameRaw !== null) {
      return { liderName: liderNameRaw, liderTipo: 'employee' };
    }
    if (clevelNameRaw !== null) {
      return { liderName: clevelNameRaw, liderTipo: 'clevel' };
    }
    return { liderName: null, liderTipo: null };
  };

  const rows: readonly EmployeeListRow[] = rowsRaw.map((r) => {
    const liderInfo = resolveLiderInfo(r.liderName, r.clevelName);
    return {
      id: r.id,
      companyId: r.companyId,
      name: r.name,
      cpf: r.cpf,
      email: r.email,
      photoUrl: r.photoUrl,
      cargo: r.cargo,
      senioridade: r.senioridade as 'junior' | 'pleno' | 'senior',
      jobFamily: r.jobFamily,
      nivelHierarquico: r.nivelHierarquico,
      departamento: r.departamento,
      status: (r.status ?? 'ativo') as 'ativo' | 'inativo',
      isRH: r.isRH === true,
      isLider: r.isLider === true,
      isResponsavelFinanceiro: r.isResponsavelFinanceiro === true,
      dataAdmissao: r.dataAdmissao instanceof Date ? r.dataAdmissao : new Date(r.dataAdmissao),
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt ?? Date.now()),
      liderName: liderInfo.liderName,
      liderTipo: liderInfo.liderTipo,
      profileIndividualStatus: resolveProfileIndividualStatus(r.profileIndividualStatusRaw),
    };
  });

  return { rows, totalCount, filtersApplied: filters };
}

/**
 * §14.10 — resolve a lista canonica bit-exact de lideres ativos da empresa
 * para popular o dropdown de filtro "Lider" (§14.10 linha 2 dos filtros).
 * Retorna `{ id, name }` em ordem alfabetica. Consumida pelo `page.tsx`
 * na carga inicial para injetar `initialLideres` ao client component.
 */
/**
 * §14.10 + Patch 3 canônica bit-exact — lista canônica bit-exact de
 * líderes ativos da empresa para popular o dropdown de filtro "Líder"
 * (§14.10 linha 2 dos filtros). Retorna employees com `isLider=true`
 * + todos os C-levels ativos, em ordem alfabética global unificada. O
 * campo `tipo` (`'employee' | 'clevel'`) permite ao client aplicar filtro
 * na coluna canônica correta de `employeeLeaderHistory` (liderId vs
 * clevelId).
 */
export async function listActiveLeadersAndClevelsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly { id: number; name: string; tipo: 'employee' | 'clevel' }[]> {
  const empRows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .orderBy(asc(employees.name));
  const clevelRows = await db
    .select({ id: cLevelMembers.id, name: cLevelMembers.name })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')))
    .orderBy(asc(cLevelMembers.name));
  const combined: { id: number; name: string; tipo: 'employee' | 'clevel' }[] = [
    ...empRows.map((r) => ({ id: r.id, name: r.name, tipo: 'employee' as const })),
    ...clevelRows.map((r) => ({ id: r.id, name: r.name, tipo: 'clevel' as const })),
  ];
  combined.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return combined;
}

/**
 * §14.10 — resolve a lista canonica bit-exact de departamentos com
 * colaboradores ativos na empresa. Retorna nomes em ordem alfabetica.
 * Consumida pelo `page.tsx` na carga inicial para popular o dropdown de
 * filtro "Departamento".
 */
export async function listDistinctDepartamentosByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly Departamento[]> {
  const rows = await db
    .selectDistinct({ departamento: employees.departamento })
    .from(employees)
    .where(eq(employees.companyId, companyId))
    .orderBy(asc(employees.departamento));
  return rows.map((r) => r.departamento);
}
