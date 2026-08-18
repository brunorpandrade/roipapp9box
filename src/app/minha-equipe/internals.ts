// ROIP APP 9BOX — helpers internos canonicos rota RH-Lider
// `/minha-equipe` (§14.11 + §5.5, ME-085). Rota RH-Lider-only (Cenario
// 1 + Cenario 2) que herda ~90% da estrutura de §14.10 com 4 ajustes:
// (a) 4 botoes de acao ocultos; (b) filtro "Lider" omitido (sempre e o
// proprio usuario logado); (c) coluna "Lider direto" omitida por
// redundancia (D-ME085-2 B aprovada); (d) badge RF + opcao "Responsavel
// financeiro" no filtro "Papel funcional" nao aparecem (§14.10.1 + §20).
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta apenas o default;
// helpers, tipos e loaders vivem aqui em `internals.ts` irmao para
// permitir import por testes sem quebrar segregacao Next 15.
//
// Origem canonica:
// - CAMADA_UI §14.11 (ajustes vs §14.10) + §14.10 (base herdada) +
//   §14.10.1 (badges L/RH/RF — RF suprimido nesta rota) + §5.5 (empty
//   canonico "Voce nao tem liderados diretos ativos.") + §3.4/§3.5
//   (menu RH-Lider C1/C2).
// - CAMADA_AUTH §10.4 linha 817 (matriz — RH puro=deny; RH-Lider=allow;
//   escopo ME-085 canonico apenas RH-Lider — D-ME085-1 A aprovada;
//   demais roles autorizados na matriz caem em access-denied ate
//   canonizacao futura).
// - CAMADA_NEGOCIO §13.2 (liderado direto ativo = employeeLeaderHistory
//   com `dataFim IS NULL`) + §16.2 (regra canonica de escopo dos badges
//   e do filtro "Papel funcional" nas rotas P20).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - MASTER_ESCOPO_B9 §3.4 (ficha canonica ME-085 — referencia a
//   corrigir em ME-B9-fechamento via D-MASTER-B9-FICHA085).
//
// Nota canonica sobre PC1a: `listEmployeesPaginated` do service ja
// opera APENAS sobre `employees` (nunca faz UNION com `cLevelMembers`).
// C-levels nao podem ser liderados de RH-Lider por decisao canonica
// arquitetural — o filtro por `elh.liderId=session.userId` no service
// escopa exatamente os employees diretos. Comentario bit-exact
// preservado.
//
// Escopo canonico bit-exact do RH-Lider (§14.11 + D-ME085-2 B):
// - liderId = session.userId (forcado server-side via
//   `enforceRHLiderScope`; sobrescreve qualquer input do cliente).
// - liderIdTipo = 'employee' (RH-Lider e sempre employee, nunca
//   clevel).
// - papelFuncional: se cliente enviar 'respfin' via URL manipulada,
//   reseta para 'todos' (defense-in-depth §14.10.1 + §16.2 — opcao RF
//   nao existe nesta rota).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → `page.tsx` + `actions.ts`.
// - `enforceRHLiderScope` → `page.tsx` + `actions.ts` + testes.
// - `loadMinhaEquipePageForRHLider` → `page.tsx` + testes.
// - `MinhaEquipeRHLiderPageData` (tipo) → `page.tsx` + testes.
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
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * §14.11 + §16.2 — override canonico bit-exact de escopo RH-Lider.
 * Aplicado SEMPRE (server-side, tanto na carga inicial quanto em cada
 * refetch) para garantir defense-in-depth: cliente nao pode escapar
 * do escopo canonico via URL manipulada nem via replay de payload de
 * server action.
 *
 * Regras canonicas aplicadas:
 * (1) `liderId = leaderId` (session.userId do RH-Lider autenticado).
 * (2) `liderIdTipo = 'employee'` (RH-Lider e sempre employee, nunca
 *     clevel).
 * (3) `papelFuncional = 'respfin' → 'todos'` (§16.2 — opcao RF
 *     canonicamente ausente nesta rota).
 *
 * Todos os demais filtros (busca, departamento, nivel, status,
 * senioridade, jobFamily, datas, sortBy, sortOrder, page, pageSize)
 * passam bit-exact do input.
 */
export function enforceRHLiderScope(
  filters: ColaboradoresFilters,
  leaderId: number,
): ColaboradoresFilters {
  return {
    ...filters,
    liderId: leaderId,
    liderIdTipo: 'employee',
    papelFuncional: filters.papelFuncional === 'respfin' ? 'todos' : filters.papelFuncional,
  };
}

/**
 * §14.11 — dados iniciais canonicos bit-exact carregados server-side
 * para a variante RH-Lider `/minha-equipe`. Estrutura identica a
 * `TodosColaboradoresRHPageData` do ME-084 (preserva contrato do
 * `TodosColaboradoresClient` compartilhado — D-ME085-3 B aprovada).
 *
 * `departamentos` e `lideres` sao carregados por consistencia com o
 * contrato do Client, mesmo que `lideres` seja canonicamente inutilizado
 * na UI desta rota (`hideLiderFilter=true`). Custo minimo (2 SELECTs
 * pequenos) preserva simetria com o Client — evita bifurcacao de
 * contrato + serializa como array vazio-ou-nao sem penalidade.
 */
export interface MinhaEquipeRHLiderPageData {
  readonly listResult: ListEmployeesResult;
  readonly departamentos: readonly Departamento[];
  readonly lideres: readonly { id: number; name: string; tipo: 'employee' | 'clevel' }[];
}

/**
 * §14.11 — loader canonico bit-exact da rota RH-Lider `/minha-equipe`.
 * Escopa por `companyId` derivado da `session.companyId` + `leaderId`
 * derivado da `session.userId`. Aplica `enforceRHLiderScope` antes de
 * chamar o service para blindar contra qualquer entrada manipulada do
 * cliente.
 *
 * Tres queries paralelas: listagem paginada + departamentos (dropdown
 * canonico) + lideres (carregado por simetria contratual com o Client
 * — nao renderizado quando `hideLiderFilter=true`).
 */
export async function loadMinhaEquipePageForRHLider(
  db: RoipDatabase,
  companyId: number,
  leaderId: number,
  filters: ColaboradoresFilters,
): Promise<MinhaEquipeRHLiderPageData> {
  const scopedFilters = enforceRHLiderScope(filters, leaderId);
  const serviceInput = colaboradoresFiltersToServiceInput(scopedFilters);
  const [listResult, departamentos, lideres] = await Promise.all([
    listEmployeesPaginated(db, companyId, serviceInput),
    listDistinctDepartamentosByCompany(db, companyId),
    listActiveLeadersAndClevelsByCompany(db, companyId),
  ]);
  return { listResult, departamentos, lideres };
}
