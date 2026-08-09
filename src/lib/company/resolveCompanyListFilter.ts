// ROIP APP 9BOX — derivador canonico bit-exact do filtro da lista de
// empresas do painel Super Admin `/super-admin` (§5.3 toggle 3 estados).
// ME-Rota-C-D075 — fundacao pre-ME-072.
//
// Origem canonica:
// - DOC 05 §5.3 (painel Super Admin — toggle segmentado 3 estados no
//   topo da lista de empresas).
//   - Estado padrao: apenas ativas.
//   - Estado 2: ativas + inativas (todas).
//   - Estado 3: apenas inativas.
//
// Papel canonico:
// - Deriva o filtro canonico bit-exact a partir do `searchParams.filter`
//   passado pelo Next 15 App Router ao server component `super-admin/page.tsx`.
//   Toggle nao usa client-state (Bloco A canonico bit-exact 100%
//   server-side) — cada botao do toggle e um `<Link href="?filter=...">`
//   que dispara um novo render server-side.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `resolveCompanyListFilter` → `src/app/super-admin/page.tsx`
//     (server component) + `tests/unit/resolveCompanyListFilter.test.ts`.
//   - `CompanyListFilter` (tipo) → consumido pelo mesmo page.tsx +
//     testes.

/**
 * Enum canonico bit-exact dos 3 estados do toggle §5.3. Nomes literais:
 * - `'active'`   — apenas ativas (padrao canonico).
 * - `'all'`      — ativas + inativas.
 * - `'inactive'` — apenas inativas.
 */
export type CompanyListFilter = 'active' | 'all' | 'inactive';

/**
 * Valor canonico padrao — quando `searchParams.filter` esta ausente ou
 * traz valor invalido, retorna `'active'` (§5.3 "Estado padrao: apenas
 * empresas ativas").
 */
export const DEFAULT_COMPANY_LIST_FILTER: CompanyListFilter = 'active';

/**
 * Deriva canonicamente bit-exact o filtro efetivo a partir do valor
 * bruto do `searchParams.filter` do Next 15 App Router. Aceita:
 * - `undefined` (parametro ausente) → `'active'` (padrao).
 * - `string` bruto (`'active' | 'all' | 'inactive'`) → mesmo valor.
 * - `string[]` (duplicado — canonico Next 15 concatena `?filter=a&filter=b`)
 *   → primeiro elemento; se invalido, `'active'`.
 * - qualquer outro valor → `'active'` (fallback canonico bit-exact seguro).
 */
export function resolveCompanyListFilter(raw: string | string[] | undefined): CompanyListFilter {
  if (raw === undefined) {
    return DEFAULT_COMPANY_LIST_FILTER;
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'active' || value === 'all' || value === 'inactive') {
    return value;
  }
  return DEFAULT_COMPANY_LIST_FILTER;
}
