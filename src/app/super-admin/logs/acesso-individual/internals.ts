// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/app/super-admin/logs/acesso-individual/page.tsx` (ME-070, padrao
// S366 CC068).
//
// Origem canonica S366 (ME-069/ME-070, CC068): Next 15 App Router
// aceita em `page.tsx` apenas `export default` + Route Segment Config
// + `generateMetadata`/`generateStaticParams`/`generateViewport`/
// `metadata`. Qualquer outro export publico faz `next build` reprovar.
//
// Segregacao canonica: tipo publico consumido por client component /
// testes migra para modulo irmao `internals.ts`. Zero mudanca de
// comportamento, autorizacao (Bruno §10.6), SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `BrunoDALEmpresaOption` consumido por `./page.tsx` (assinatura de
//   `loadEmpresasListForBruno` local) e por
//   `tests/integration/me057b-logs.test.ts` (import tipo).

// -----------------------------------------------------------------------
// Tipo publico
// -----------------------------------------------------------------------

export interface BrunoDALEmpresaOption {
  readonly id: number;
  readonly nomeFantasia: string;
}
