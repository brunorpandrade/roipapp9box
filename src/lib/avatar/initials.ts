// ROIP APP 9BOX — helper canonico de iniciais (ME-055c).
//
// Origem canonica: DOC 05 §2.10 (Avatares).
//
// Regra canonica §2.10:
// - Primeira letra do primeiro nome + primeira letra do ultimo sobrenome.
// - Fallback nome unico: primeiras duas letras.
//
// Extraido do `Header.tsx` (ME-055b) para consumo compartilhado com o
// `Avatar.tsx` desta ME (§2.10 — mesma funcao canonica em multiplas
// superficies). O `Header.tsx` desta ME passa a importar deste modulo em
// vez de manter a copia local, preservando bit-exact o comportamento
// canonico documentado na ME-055b.
//
// Modulo puro sem estado. Sem dependencias externas alem de string
// nativa. Testado por `tests/unit/uiComponents.test.ts`.

/**
 * Extrai as duas letras canonicas §2.10 de um nome completo. Nunca lanca:
 * entrada vazia ou so espacos retorna `'??'` (marcador canonico interno de
 * fallback para uso em fallback do Avatar quando o consumidor nao tem
 * nome disponivel — placeholder distinguivel para debug).
 *
 * Casos canonicos:
 * - Nome unico ('Bruno') → duas primeiras letras em maiusculo ('BR').
 * - Nome + sobrenome ('Bruno Andrade') → primeira do primeiro + primeira
 *   do ultimo ('BA').
 * - Nome + varios sobrenomes ('Bruno Ribeiro Andrade') → primeira do
 *   primeiro + primeira do ultimo ('BA').
 * - Nome com espacos extras → `split(/\s+/)` normaliza.
 * - Entrada vazia ou so espacos → '??'.
 */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === undefined || parts[0] === '') {
    return '??';
  }
  const first = parts[0].charAt(0).toUpperCase();
  if (parts.length === 1) {
    // Fallback nome unico §2.10: primeiras duas letras.
    return (parts[0].slice(0, 2).toUpperCase() || first).padEnd(2, first);
  }
  const last = parts[parts.length - 1];
  if (last === undefined || last === '') {
    return first.padEnd(2, first);
  }
  return `${first}${last.charAt(0).toUpperCase()}`;
}
