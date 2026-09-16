// ROIP APP 9BOX — helpers internos canonicos rota `/minha-equipe`
// (§14.11 + §5.5, ME-085; escopo ampliado na ME-B9-fechamento para
// cobrir Lider Cenario 1 e Lider Cenario 2 alem de RH-Lider). Rota
// herda ~90% da estrutura de §14.10 com 4 ajustes: (a) 4 botoes de
// acao ocultos; (b) filtro "Lider" omitido (sempre e o proprio usuario
// logado); (c) coluna "Lider direto" omitida por redundancia
// (D-ME085-2 B aprovada); (d) badge RF + opcao "Responsavel financeiro"
// no filtro "Papel funcional" nao aparecem (§14.10.1 + §20).
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta apenas o default;
// helpers, tipos e loaders vivem aqui em `internals.ts` irmao para
// permitir import por testes sem quebrar segregacao Next 15.
//
// Origem canonica:
// - CAMADA_UI §14.11 (ajustes vs §14.10) + §14.10 (base herdada) +
//   §14.10.1 (badges L/RH/RF — RF suprimido nesta rota) + §5.5 (empty
//   canonico "Voce nao tem liderados diretos ativos.") + §3.4/§3.5
//   (menu RH-Lider C1/C2) + §3.6/§3.7 (menu Lider C1/C2).
// - CAMADA_AUTH §10.4 (matriz — RH puro=deny; RH-Lider=allow;
//   Lider=allow; C-level=allow bloqueado por escopo de infra ate
//   D-CU-EMPIRICO). ME-B9-fechamento S230-B: guard passa a aceitar
//   `rh_lider` e `lider`; `clevel` (CU/CT/CF) fica deny ate primeira
//   empresa cliente com C-level unico ser onboarded (dependencia
//   estrutural: `liderIdTipo='clevel'` no scoper — canonizado em ME
//   dedicada quando validacao empirica for possivel).
// - CAMADA_NEGOCIO §13.2 (liderado direto ativo = employeeLeaderHistory
//   com `dataFim IS NULL`) + §16.2 (regra canonica de escopo dos badges
//   e do filtro "Papel funcional" nas rotas P20).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - MASTER_ESCOPO_B9 §3.4 (ficha ME-085 — corrigida em MASTER v3.0 pela
//   ME-B9-fechamento).
//
// Nota canonica sobre PC1a: `listEmployeesPaginated` do service ja
// opera APENAS sobre `employees` (nunca faz UNION com `cLevelMembers`).
// C-levels nao podem ser liderados de RH-Lider ou Lider por decisao
// canonica arquitetural — o filtro por `elh.liderId=session.userId` no
// service escopa exatamente os employees diretos.
//
// Escopo canonico do employee-leader (RH-Lider OU Lider — §14.11 +
// D-ME085-2 B + S230-B):
// - liderId = session.userId (forcado server-side via
//   `enforceEmployeeLeaderScope`; sobrescreve qualquer input do cliente).
// - liderIdTipo = 'employee' para RH-Lider e Lider; 'clevel' para C-level
//   (ME-fila6 D1 — DOC 02 §10.4 CU/CT/CF ✓; vinculo via
//   `employeeLeaderHistory.clevelId`).
// - papelFuncional: se cliente enviar 'respfin' via URL manipulada,
//   reseta para 'todos' (defense-in-depth §14.10.1 + §16.2 — opcao RF
//   nao existe nesta rota).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → `page.tsx` + `actions.ts`.
// - `enforceEmployeeLeaderScope` → `page.tsx` + `actions.ts` + testes.
// - `loadMinhaEquipePageForEmployeeLeader` → `page.tsx` + testes.
// - `MinhaEquipeEmployeeLeaderPageData` (tipo) → `page.tsx` + testes.
//
// **RV-12 canonica.** Zero SQL cru — reutiliza service tipado Drizzle.
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import type { RoipDatabase } from '../../db/client';
import type { Departamento } from '../../db/schema';
import {
  listActiveLeadersAndClevelsByCompany,
  listDistinctDepartamentosByCompany,
  listEmployeesPaginated,
  type ListEmployeesResult,
} from '../../server/services/employees';

import type { ColaboradoresFilters } from './filters';
import { colaboradoresFiltersToServiceInput } from './filters';

/**
 * §14.11 — resolve URL do banco canonica bit-exact. Reutiliza
 * `process.env.DATABASE_URL` sem fallback. Erro claro se ausente.
 * Padrao bit-exact ao `/todos-os-colaboradores/internals.ts` ME-084.
 */
/**
 * §14.11 + §16.2 — override canonico bit-exact de escopo do employee-
 * leader (RH-Lider OU Lider). Aplicado SEMPRE (server-side, tanto na
 * carga inicial quanto em cada refetch) para garantir defense-in-depth:
 * cliente nao pode escapar do escopo canonico via URL manipulada nem
 * via replay de payload de server action.
 *
 * Regras canonicas aplicadas:
 * (1) `liderId = leaderId` (session.userId do usuario autenticado).
 * (2) `liderIdTipo = leaderTipo` — `'employee'` (default, RH-Lider e
 *     Lider) ou `'clevel'` (C-level, ME-fila6 D1).
 * (3) `papelFuncional = 'respfin' → 'todos'` (§16.2 — opcao RF
 *     canonicamente ausente nesta rota).
 *
 * Todos os demais filtros (busca, departamento, nivel, status,
 * senioridade, jobFamily, datas, sortBy, sortOrder, page, pageSize)
 * passam bit-exact do input.
 */
export function enforceEmployeeLeaderScope(
  filters: ColaboradoresFilters,
  leaderId: number,
  leaderTipo: 'employee' | 'clevel' = 'employee',
): ColaboradoresFilters {
  return {
    ...filters,
    liderId: leaderId,
    liderIdTipo: leaderTipo,
    papelFuncional: filters.papelFuncional === 'respfin' ? 'todos' : filters.papelFuncional,
  };
}

/**
 * §14.11 — dados iniciais canonicos bit-exact carregados server-side
 * para `/minha-equipe` (variante RH-Lider ou Lider). Estrutura identica
 * a `TodosColaboradoresRHPageData` do ME-084 (preserva contrato do
 * `TodosColaboradoresClient` compartilhado — D-ME085-3 B aprovada).
 *
 * `departamentos` e `lideres` sao carregados por consistencia com o
 * contrato do Client, mesmo que `lideres` seja canonicamente inutilizado
 * na UI desta rota (`hideLiderFilter=true`). Custo minimo (2 SELECTs
 * pequenos) preserva simetria com o Client — evita bifurcacao de
 * contrato + serializa como array vazio-ou-nao sem penalidade.
 */
export interface MinhaEquipeEmployeeLeaderPageData {
  readonly listResult: ListEmployeesResult;
  readonly departamentos: readonly Departamento[];
  readonly lideres: readonly { id: number; name: string; tipo: 'employee' | 'clevel' }[];
}

/**
 * §14.11 — loader canonico bit-exact da rota `/minha-equipe` (variante
 * RH-Lider ou Lider). Escopa por `companyId` derivado da
 * `session.companyId` + `leaderId` derivado da `session.userId`.
 * Aplica `enforceEmployeeLeaderScope` antes de chamar o service para
 * blindar contra qualquer entrada manipulada do cliente.
 *
 * Tres queries paralelas: listagem paginada + departamentos (dropdown
 * canonico) + lideres (carregado por simetria contratual com o Client
 * — nao renderizado quando `hideLiderFilter=true`).
 */
export async function loadMinhaEquipePageForEmployeeLeader(
  db: RoipDatabase,
  companyId: number,
  leaderId: number,
  filters: ColaboradoresFilters,
  leaderTipo: 'employee' | 'clevel' = 'employee',
): Promise<MinhaEquipeEmployeeLeaderPageData> {
  const scopedFilters = enforceEmployeeLeaderScope(filters, leaderId, leaderTipo);
  const serviceInput = colaboradoresFiltersToServiceInput(scopedFilters);
  const [listResult, departamentos, lideres] = await Promise.all([
    listEmployeesPaginated(db, companyId, serviceInput),
    listDistinctDepartamentosByCompany(db, companyId),
    listActiveLeadersAndClevelsByCompany(db, companyId),
  ]);
  return { listResult, departamentos, lideres };
}
