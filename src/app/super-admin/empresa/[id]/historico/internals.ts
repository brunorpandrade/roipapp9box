// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/app/super-admin/empresa/[id]/historico/page.tsx` (ME-070, padrao
// S366 CC068).
//
// Origem canonica S366 (ME-069/ME-070, CC068): Next 15 App Router
// aceita em `page.tsx` apenas `export default` + Route Segment Config
// + `generateMetadata`/`generateStaticParams`/`generateViewport`/
// `metadata`. Qualquer outro export publico faz `next build` reprovar.
//
// Segregacao canonica: helper de fallback publico consumido por
// testes migra para modulo irmao `internals.ts`. Zero mudanca de
// comportamento, autorizacao (Bruno §10.3), SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `getHistoricoCanonicalDefaultFilters` consumida por `./page.tsx`
//   (fallback quando Next 15 chama sem searchParams em contexto de
//   teste unit isolado) e teste da ME-057c.

import { CANONICAL_HISTORICO_DEFAULT_FILTERS, type HistoricoFilters } from './filters';

// -----------------------------------------------------------------------
// Fallback canonico (Next 15 chama sem searchParams em contexto de
// teste unit isolado)
// -----------------------------------------------------------------------

export function getHistoricoCanonicalDefaultFilters(): HistoricoFilters {
  return CANONICAL_HISTORICO_DEFAULT_FILTERS;
}
