// ROIP APP 9BOX — filters canonicos rota RH-Lider `/minha-equipe`
// (§14.11 herda ~90% de §14.10 + §20, ME-085).
//
// Re-export puro canonico bit-exact dos filtros da rota super-admin
// (`/super-admin/empresa/[id]/todos-os-colaboradores`) — pattern L123
// dual-route + D-ME085-3 aprovada (props explicitas de comportamento).
// Preserva DRY canonico: filtros sao regra de negocio da tabela §14.10,
// invariante entre variantes Bruno / RH puro / RH-Lider (a rota
// `/minha-equipe` apenas oculta 1 dos 8 filtros na UI — via prop
// `hideLiderFilter` — e force `liderId=session.userId` no server para
// escopar liderados diretos ativos §14.11).
//
// **RV-13.** Cada re-export tem chamador na propria ME:
// - `ColaboradoresFilters` (tipo) → `page.tsx`, `actions.ts` desta rota,
//   `internals.ts`, testes.
// - `parseColaboradoresFiltersFromSearchParams` → `page.tsx`.
// - `colaboradoresFiltersToServiceInput` → `page.tsx`, `actions.ts`.
// - `CANONICAL_COLABORADORES_DEFAULT_FILTERS` → `internals.ts` (base
//   do override canonico de escopo — enforceRHLiderScope).
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
