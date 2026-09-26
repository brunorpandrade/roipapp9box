// ROIP APP 9BOX — normalizacao canonica de texto para busca client-side.
//
// Fonte unica (RV-14) do normalizador de busca com autocomplete. Extraido
// da definicao local de `OrganogramaClient.tsx` para ser reusado pelo
// `ColaboradorSearchBox` da tabela `/todos-os-colaboradores` sem duplicar
// a funcao (RV-14 — nunca duas copias). O callsite original do organograma
// passa a importar daqui (L125 — refactor do callsite original).
//
// Origem canonica: CAMADA_UI §14.10 (busca "case-insensitive, sem acento")
// + §11.2 / §11.9 (busca do organograma).
//
// **RV-13.** Consumido por:
// - `src/app/super-admin/empresa/[id]/organograma/OrganogramaClient.tsx`.
// - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//   `ColaboradorSearchBox.tsx`.
// - `tests/unit/normalizeForSearch.test.ts`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Normaliza uma string para comparacao de busca: minusculas + remocao de
 * diacriticos (NFD + strip de marcas combinantes). Deterministico e puro.
 * "José" e "JOSE" normalizam para "jose".
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
