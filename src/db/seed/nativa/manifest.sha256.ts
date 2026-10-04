// ROIP APP 9BOX — manifest canonico SHA-256 dos 20 JSONs de fixture Nativa (ME-068).
//
// Fonte de proveniencia: gerador Python S362 preservado no zip D077 (Cenario A
// canonizado bit-exact em ME-068 via E-068-2 aprovado).
//
// ME-B2-01c (01/10/2026) — atualizados os pins SHA-256 de
// `instrumento_a_respostas.json` e `instrumento_c_respostas.json` apos
// normalizacao canonica do `itemIndex` de linear 1..20 para 1..5 local por
// dimensao (grid 4x5 canonico §9.4). Conteudo preservado bit-a-bit nas demais
// chaves (nome, trimestre, dimensao, valor); so o `itemIndex` foi recalculado
// via `itemIndex -= (dimensao-1)*5`. Contagens inalteradas (8020 rows cada).
//
// ME-B9.12 + patch1 (04/10/2026) — fixture v1.2 -> v1.3: recalibracao canonica
// da curva de demanda por quadrante 9-Box dominante do colaborador (Opcao B).
// Patch1: reformatacao `performance_mensal.json` via `prettier --write` para
// alinhar bit-exact ao estilo canonico do repo (arrays internos em linha unica),
// SHA-256 atualizado de `116d8788...` para `7d719a05...`. Conteudo semantico
// bit-exact preservado — somente formatacao. Atualizados os pins SHA-256 de
// `performance_mensal.json` (demanda recalibrada + prettier) e de
// `performance_trimestral.json` (campo `capacidadeOciosa` recomputado via regra
// S056). Preservado bit-exact: `desempenho_i` em todas as 3976 variaveis
// afetadas, logo `indiceDesempenho`, `scoreDesempenho`, `faixaDesempenho` e
// 9-Box completo inalterados. F6 (lideranca_gestao) nao tocada por regra
// canonica (`capacidadeOciosa = NULL` por natureza). Contagens inalteradas
// (1210 e 415 rows). Distribuicao canonica medida pos-reseed: 94.9% verde
// (saudavel 10-25%), 2.1% vermelho (sobrecarga <10% — apenas RISCO DE
// ESGOTAMENTO + DESGASTE OCULTO), 3.0% amarelo (ociosidade cara >25% —
// POTENCIAL SUBUTILIZADO + DESEMPENHO REPRESADO). Documentacao canonica em
// EMPRESA_DEMO_NATIVA.md v1.3 §21.
//
// Regra canonica RV-02: qualquer divergencia SHA-256 no loader = ABORT (fixture
// corrompida ou editada). O loader `loadFixtures.ts` valida cada JSON antes de
// deserializar; SHA-256 mismatch dispara throw canonico bit-exact.
//
// RV-13: consumido por src/db/seed/nativa/loadJsonFixtures.ts e por
// tests/unit/nativa/manifest.test.ts.
//
// Estes valores foram medidos por `sha256sum` durante geracao em ME-068 e sao
// imutaveis para todo o escopo canonico Nativa 2026-2027. Extensoes anuais via
// reseed incremental (D079) geram entradas adicionais com sufixo do ano; entradas
// existentes NUNCA sao alteradas (append-only estrito — regra canonica),
// EXCETO em correcao canonica declarada de bug estrutural (como a ME-B2-01c).

export interface FixtureHashEntry {
  /** Nome do arquivo relativo a tests/fixtures/nativa/. */
  readonly filename: string;
  /** SHA-256 hex lowercase (64 chars). */
  readonly sha256: string;
  /** Contagem de registros esperada (medicao real, RV-15). */
  readonly recordCount: number;
  /** Tabela canonica de destino no schema. */
  readonly destinationTable: string;
}

/**
 * Manifest canonico bit-exact dos 20 JSONs. Cada entrada mapeia arquivo → hash →
 * contagem esperada → tabela de destino. Consumido pelo loader.
 *
 * Uso de `as const` (padrao canonico bit-exact enums.ts): preserva tuple
 * length em compile time — o guard `_AssertFixtureCount` abaixo depende
 * disso para reprovar em compile time se alguem adicionar/remover entrada
 * sem atualizar NATIVA_FIXTURE_COUNT.
 */
export const NATIVA_FIXTURE_MANIFEST = [
  {
    filename: 'nr1_factor_scores.json',
    sha256: '8c0a035061243be2fd116281725435034bc3422abfd664b33970fd18a48567f0',
    recordCount: 56,
    destinationTable: 'copsoqFactorScores',
  },
  {
    filename: 'nr1_turnover_events.json',
    sha256: '20a5ec3c1e469fa018d95ef5cd62206b6ae4e5ba3b28bc6ecb6ca44082392f47',
    recordCount: 13,
    destinationTable: 'employeeTerminationEvents',
  },
  {
    filename: 'iql_data.json',
    sha256: '623960dd1bef8eb1d2c89d427ed26f898454df78b6277382a306d87557c26628',
    recordCount: 45,
    destinationTable: 'iqlData',
  },
  {
    filename: 'individual_profile_responses.json',
    sha256: '55b244ff4f4bbfa6c38f3b99b2a499e6671c2bfe30aece8166eae08f841e7eb9',
    recordCount: 5280,
    destinationTable: 'individualProfileAssessments.respostas',
  },
  {
    filename: 'nr1_respostas.json',
    sha256: '62651de827d944ed6716e21d18ce9ea13647744ba16e8393294bd7c5b9358fac',
    recordCount: 1344,
    destinationTable: 'copsoq_responses',
  },
  {
    filename: 'nr1_turnover_metrics.json',
    sha256: '0b08a549b8552df42d26bc3055d3307a4763d9041d6c572d180783d1f86f217b',
    recordCount: 40,
    destinationTable: '__runtime__ (turnover.getByCompany)',
  },
  {
    filename: 'performance_trimestral.json',
    sha256: 'c0b4e1c7509a6ad83b664b6d15bdcffe0112ec557b27b980bf7dd215ca8f5d52',
    recordCount: 415,
    destinationTable: 'performanceQuarterlyData',
  },
  {
    filename: 'plenitude_completa.json',
    sha256: '7b834d1984f7ead178986641b8e771f8acf7207aca926668cb0eeae6d41e5279',
    recordCount: 401,
    destinationTable: 'plenitudeData',
  },
  {
    filename: 'nr1_snapshots.json',
    sha256: 'dabda91313e53f6501f5631acee3cb1a425d1dc6669a163b68ec8d9ad8370a06',
    recordCount: 54,
    destinationTable: 'copsoqCycleSnapshot',
  },
  {
    filename: 'individual_profile_placeholders.json',
    sha256: 'b66a7791b399abcd108315a636e4f80a62085362b4d4970afa3d8a5b978165cc',
    recordCount: 69,
    destinationTable: 'individualProfilePlaceholders',
  },
  {
    filename: 'individual_profile_scores.json',
    sha256: '2a558bb40c1be29599c4557e9b484b9d784299a2a5eab4a6b0d694e65b49c869',
    recordCount: 66,
    destinationTable: 'individualProfileScores',
  },
  {
    filename: 'nr1_ciclo.json',
    sha256: '4e5708d8db9d8016439affc5d4830a95f7edf0e0146be5ca9c7810124eae2fea',
    recordCount: 1,
    destinationTable: 'copsoqCycles',
  },
  {
    filename: 'plenitude_a.json',
    sha256: 'bc4c37bc0851b7241de9305b25ffcee07a6ef5fdf2aa5cfbb429f921ea038b1a',
    recordCount: 401,
    destinationTable: '__reference__ (Instrumento A only score)',
  },
  {
    filename: 'instrumento_d_respostas.json',
    sha256: 'f874505fe8597cfdf806b42b92304cafdf2e590b8d1f0317250fd3d802ce273d',
    recordCount: 4000,
    destinationTable: 'instrumentD_responses',
  },
  {
    filename: 'nine_box.json',
    sha256: '3c2c977caa00ec9cfe514ec84019d8d069335ebbbf441f5f9bb190ab69be78a8',
    recordCount: 387,
    destinationTable: 'nineBoxClassifications',
  },
  {
    filename: 'individual_profile_assessments.json',
    sha256: 'db1383fba4dcaee1556e6e7a616f25756a195cb6a7d6c9056b922e36116589ec',
    recordCount: 66,
    destinationTable: 'individualProfileAssessments',
  },
  {
    filename: 'instrumento_c_respostas.json',
    sha256: 'ad15371b2762e1275565807630749ca9791cf763a4a6fbc3985589e5fa5216c2',
    recordCount: 8020,
    destinationTable: 'instrumentC_assessments',
  },
  {
    filename: 'nr1_divergencias.json',
    sha256: 'd1dc39dec431f2fd562db8b17d7fa36ced47faa129394b638a42d7d4721aec84',
    recordCount: 6,
    destinationTable: 'nr1AreaDivergenceAnalysis',
  },
  {
    filename: 'performance_mensal.json',
    sha256: '7d719a052d0194d59a481bae064b88a2dd4abeec080507428bc28a688ffa2640',
    recordCount: 1210,
    destinationTable: 'performanceData',
  },
  {
    filename: 'instrumento_a_respostas.json',
    sha256: '001ccb7fdac16057878296cf728505dda98550e8cf337ad6211aac0c21b5956d',
    recordCount: 8020,
    destinationTable: 'instrumentA_responses',
  },
] as const satisfies readonly FixtureHashEntry[];

export const NATIVA_FIXTURE_COUNT = 20 as const;

// Guard canonica: caso alguem adicione/remova arquivo sem atualizar o array, o
// TypeScript falha em compile time.
type _AssertFixtureCount = (typeof NATIVA_FIXTURE_MANIFEST)['length'] extends 20 ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_FIXTURE_COUNT: _AssertFixtureCount = true;
