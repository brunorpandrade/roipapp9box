// ME-1.4a (RV-14 L125): fonte unica canonica para normalizacao de chaves do
// bloco `scores` do fixture `individual_profile_scores.json` da Nativa.
//
// Causa raiz do defeito corrigido aqui: o fixture canonico bit-exact traz
// chaves em UPPERCASE (POST_ASSERT, EST_ABERT, MOT_LIDERANCA, ...) seguindo
// a convencao do gerador Python original, enquanto o mapper `mapScoreToRow`
// em loadFixtures.ts le as chaves em lowercase (post_assert, est_abert, ...)
// alinhadas ao schema MySQL. JavaScript e case-sensitive, portanto `scores[k]`
// retornava `undefined` e todas as 25 colunas decimais caiam no fallback
// '50.00' para os 59 colaboradores sem override canonico em
// `perfilIndividualOverrides.ts`.
//
// Correcao: normalizacao idempotente das chaves para lowercase antes do
// acesso. Nao altera nenhum fixture, nenhum SHA-256 e nenhum valor; so
// permite que o mapper acesse os valores que ja estavam la.
//
// Enquadramento canonico: §5.1 de REGRA_GERAL_RESEED_INCREMENTAL_APPEND_ONLY
// (correcao de defeito de carga por re-abertura restrita). Fonte imutavel.

export function normalizeScoresKeys(
  raw: Record<string, unknown> | undefined | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw === null || raw === undefined) {
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key.toLowerCase()] = value;
    }
  }
  return out;
}
