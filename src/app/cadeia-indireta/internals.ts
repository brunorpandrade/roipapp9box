// ROIP APP 9BOX — helpers da rota `/cadeia-indireta` (DOC 05 §14.12,
// ME-fila6 D1).
//
// Substitui o stub §5.2 da ME-083 ("Coleta de dados em andamento") pela
// tabela §14.12: cadeia descendente do usuario logado EXCLUINDO os
// liderados diretos (esses ficam em `/minha-equipe`). Filtros e colunas
// iguais aos de `/minha-equipe`.
//
// Acesso (DOC 02 §10.4): RHL2 ✓, L2 ✓, CF ✓; RHp, RHL1, L1, CU, CT ✗.
// O middleware permite `rh_lider`, `lider` e `clevel`; o refinamento por
// cenario acontece aqui a partir do contexto de menu:
// - `rh_lider_c2`, `lider_c2` (existe liderado direto ativo que e lider);
// - `clevel_restricted` (C-level multiplo com `acessoTotal=false`).
//
// **RV-13.** Exports consumidos por `page.tsx`, `actions.ts` e testes.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import type { ProfileKey } from '../../lib/menu/menuConfig';
import {
  loadPlatformMenuContext,
  type PlatformMenuContext,
  type PlatformSession,
} from '../../lib/session/platformMenuContext';
import {
  listDistinctDepartamentosByCompany,
  listEmployeesPaginated,
  type ListEmployeesResult,
} from '../../server/services/employees';
import { listIndirectChainEmployeeIds } from '../../server/services/hierarchicalScope';

import {
  colaboradoresFiltersToServiceInput,
  type ColaboradoresFilters,
} from '../minha-equipe/filters';

const PROFILES_COM_CADEIA_INDIRETA: readonly ProfileKey[] = [
  'rh_lider_c2',
  'lider_c2',
  'clevel_restricted',
];

/** Acesso resolvido para a rota. `null` = perfil sem direito (§10.4). */
export interface CadeiaIndiretaAccess {
  readonly menu: PlatformMenuContext;
  readonly scopeEmployeeIds: readonly number[];
}

/**
 * Resolve menu + escopo da cadeia indireta. Retorna `null` quando a sessao
 * e invalida ou o perfil nao tem direito a rota.
 */
export async function resolveCadeiaIndiretaAccess(
  db: RoipDatabase,
  session: PlatformSession,
): Promise<CadeiaIndiretaAccess | null> {
  const menu = await loadPlatformMenuContext(db, session);
  if (menu === null) {
    return null;
  }
  if (!PROFILES_COM_CADEIA_INDIRETA.includes(menu.profileKey)) {
    return null;
  }
  const scopeEmployeeIds = await listIndirectChainEmployeeIds(db, session.companyId, {
    tipo: session.role === 'clevel' ? 'clevel' : 'employee',
    id: session.userId,
  });
  return { menu, scopeEmployeeIds };
}

/**
 * Override de filtros da rota: filtro "Lider" nao existe (§14.12 herda
 * §14.11) e a opcao "Responsavel financeiro" nao aparece (§14.10.1).
 */
export function enforceCadeiaIndiretaFilters(filters: ColaboradoresFilters): ColaboradoresFilters {
  return {
    ...filters,
    liderId: null,
    liderIdTipo: null,
    papelFuncional: filters.papelFuncional === 'respfin' ? 'todos' : filters.papelFuncional,
  };
}

/** Dados iniciais da tabela (contrato do `TodosColaboradoresClient`). */
export interface CadeiaIndiretaPageData {
  readonly listResult: ListEmployeesResult;
  readonly departamentos: Awaited<ReturnType<typeof listDistinctDepartamentosByCompany>>;
}

/** Lista a pagina corrente da cadeia indireta com os filtros ja aplicados. */
export async function listCadeiaIndireta(
  db: RoipDatabase,
  companyId: number,
  scopeEmployeeIds: readonly number[],
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  const serviceInput = colaboradoresFiltersToServiceInput(enforceCadeiaIndiretaFilters(filters));
  return await listEmployeesPaginated(db, companyId, serviceInput, scopeEmployeeIds);
}

/** Carga inicial: listagem + departamentos do dropdown. */
export async function loadCadeiaIndiretaPage(
  db: RoipDatabase,
  companyId: number,
  scopeEmployeeIds: readonly number[],
  filters: ColaboradoresFilters,
): Promise<CadeiaIndiretaPageData> {
  const [listResult, departamentos] = await Promise.all([
    listCadeiaIndireta(db, companyId, scopeEmployeeIds, filters),
    listDistinctDepartamentosByCompany(db, companyId),
  ]);
  return { listResult, departamentos };
}
