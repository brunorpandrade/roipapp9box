// ROIP APP 9BOX — helpers internos canonicos da rota base RH
// `/todos-os-colaboradores` (§14.10, ME-084). Rota variante do padrao
// dual-route L123 (super-admin em `/super-admin/empresa/[id]/todos-os-
// colaboradores` + RH aqui).
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta apenas o default;
// helpers, tipos e loaders vivem aqui em `internals.ts` irmao para
// permitir import por testes sem quebrar segregacao Next 15.
//
// Origem canonica:
// - CAMADA_UI §14.10 (tabela integral) + §14.10.1 (badges) + §20
//   (dropdown sincronizado).
// - CAMADA_AUTH §10.4 linha 816 (RH puro/RHL1/RHL2 acessam) + §11.1
//   (PC1a canonica — RH nao ve C-levels em listagem nominal).
// - CAMADA_NEGOCIO §15 (listagem + filtros + paginacao).
// - CAMADA_DADOS §4.5 (`employees`).
// - MASTER_ESCOPO_B9 §3.3 (ficha canonica ME-084).
//
// Nota canonica sobre PC1a: `listEmployeesPaginated` do service ja opera
// APENAS sobre `employees` (nunca faz UNION com `cLevelMembers`). PC1a
// esta canonicamente aplicada pela propria arquitetura do service —
// mesmo para Bruno. Comentario de origem preservado bit-exact em
// `src/server/services/employees.ts` linhas 357-361.
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → `page.tsx` desta rota, `actions.ts`.
// - `loadTodosColaboradoresPageForRH` → `page.tsx` desta rota.
// - `TodosColaboradoresRHPageData` (tipo) → `page.tsx` + testes.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import type { RoipDatabase } from '../../db/client';
import type { Departamento } from '../../db/schema';
import {
  listActiveLeadersAndClevelsByCompany,
  listDistinctDepartamentosByCompany,
  listEmployeesPaginated,
  type ListEmployeesFilters,
  type ListEmployeesResult,
} from '../../server/services/employees';

/**
 * §14.10 — resolve URL do banco canonica bit-exact. Reutiliza
 * `process.env.DATABASE_URL` sem fallback. Erro claro se ausente.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * §14.10 — dados iniciais canonicos bit-exact carregados server-side
 * pela variante RH. Estrutura identica a `TodosColaboradoresPageData`
 * do super-admin (bit-exact para preservar contrato do
 * `TodosColaboradoresClient` compartilhado).
 */
export interface TodosColaboradoresRHPageData {
  readonly listResult: ListEmployeesResult;
  readonly departamentos: readonly Departamento[];
  readonly lideres: readonly { id: number; name: string; tipo: 'employee' | 'clevel' }[];
}

/**
 * §14.10 — loader canonico bit-exact da variante RH. Escopa por
 * `companyId` derivado da `session.companyId` (nao de `params.id` como
 * no super-admin). Tres queries paralelas: listagem + departamentos +
 * lideres. Reutiliza services canonicos bit-exact da rota super-admin.
 */
export async function loadTodosColaboradoresPageForRH(
  db: RoipDatabase,
  companyId: number,
  filters: ListEmployeesFilters,
): Promise<TodosColaboradoresRHPageData> {
  const [listResult, departamentos, lideres] = await Promise.all([
    listEmployeesPaginated(db, companyId, filters),
    listDistinctDepartamentosByCompany(db, companyId),
    listActiveLeadersAndClevelsByCompany(db, companyId),
  ]);
  return { listResult, departamentos, lideres };
}
