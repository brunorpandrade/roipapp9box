// ROIP APP 9BOX — filters canonicos rota base RH `/todos-os-colaboradores`
// (§14.10 + §20, ME-084).
//
// Re-export puro canonico bit-exact dos filtros da rota super-admin
// (`/super-admin/empresa/[id]/todos-os-colaboradores`) — pattern L123
// dual-route + D-ME084-1/2 aprovadas. Preserva DRY canonico: filtros
// sao regra de negocio da tabela §14.10, invariante entre variantes
// Bruno e RH.
//
// **RV-13.** Cada re-export tem chamador na propria ME:
// - `ColaboradoresFilters` (tipo) → `page.tsx`, `actions.ts` desta rota,
//   testes.
// - `parseColaboradoresFiltersFromSearchParams` → `page.tsx`.
// - `colaboradoresFiltersToServiceInput` → `page.tsx`, `actions.ts`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export {
  BUSCA_MAX_LEN,
  SENIORIDADE_FILTER_VALUES,
  STATUS_FILTER_VALUES,
  CANONICAL_COLABORADORES_DEFAULT_FILTERS,
  colaboradoresFiltersToServiceInput,
  parseColaboradoresFiltersFromSearchParams,
  type ColaboradoresFilters,
  type SenioridadeFilterValue,
  type StatusFilterValue,
} from '../super-admin/empresa/[id]/todos-os-colaboradores/filters';
