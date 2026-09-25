// ROIP APP 9BOX — régua única de acesso ao dashboard agregado da EMPRESA
// (ME §8.06 — dashboard da empresa na rota nativa RH/C-level).
//
// Origem canônica:
// - ESPEC_ORGANOGRAMAS_E_AGREGADOS §8 (matriz de acesso): o agregado da
//   empresa é de Bruno, RH e C-level de acesso total. C-level restrito e
//   líder ficam na própria cadeia (recortes) — sem o agregado da empresa.
// - CAMADA_AUTH (DOC 02) §10.4 linha 853: CU/CT têm "dashboards por
//   escopo" (inclui empresa); CF e líder têm "dashboards apenas na
//   cadeia" (não empresa); RH acesso completo.
// - CAMADA_AUTH (DOC 02) §3.3: cards financeiros do dashboard da empresa
//   liberados a RH e C-level total integralmente.
//
// A régua opera sobre o resultado de `resolveHierarchicalScope`
// (§11.9 PC1h): `null` = escopo total (sem restrição de cadeia) → tem o
// agregado da empresa; `Set` = escopo restrito (cadeia própria) → não
// tem. Régua única reusada pelo guard da rota nativa
// (`/dashboard-empresa`) e pela decisão de href do organograma nativo
// (RV-14, sem duas cópias).
//
// **RV-13.** Consumido por:
//   - `src/app/dashboard-empresa/page.tsx` (guard da rota).
//   - `src/app/organograma/page.tsx` (decide passar `empresaDashboardHref`).
//   - `scripts/verify/regua_dashboard_empresa_nativa.ts` + teste unit.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

/**
 * Href canônico da rota nativa do dashboard agregado da empresa
 * (RH / C-level total). A rota de Bruno usa a variante dedicada
 * `/super-admin/empresa/<id>/dashboard-empresa`.
 */
export const NATIVE_EMPRESA_DASHBOARD_HREF = '/dashboard-empresa' as const;

/**
 * Decide se o observador tem direito ao dashboard agregado da empresa, a
 * partir do escopo hierárquico resolvido (§11.9 PC1h).
 *
 * `null` (escopo total: RH, RH-Líder, C-level total ou único) → true.
 * `Set` (escopo restrito: líder puro, C-level restrito) → false.
 *
 * ESPEC §8 + DOC 02 §10.4 (linha 853): o agregado da empresa é só de
 * escopo total; perfis restritos ficam na própria cadeia.
 */
export function canViewCompanyAggregate(scope: ReadonlySet<string> | null): boolean {
  return scope === null;
}
