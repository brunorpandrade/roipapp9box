// ROIP APP 9BOX — gerador canonico de matriculas (ME-080b Dispatch 1).
//
// Escopo canonico: gerar matriculas no formato ^[A-Z]{2}[0-9]{2}$ (2
// letras uppercase seguidas de 2 digitos), unicas por empresa. Consumido
// por:
//   - Cadastro individual de employee/C-level (Dispatch 2): geracao sob
//     demanda via botao "Gerar"/"Regenerar" na UI, verificando unicidade
//     no banco.
//   - Cadastro em massa via planilha (Dispatch 4): geracao em lote com
//     retry deterministico se colidir.
//   - Reseed da Nativa (Dispatch 5): geracao deterministica dos 66
//     employees + 3 C-levels via seed fixo, produzindo estado bit-exact
//     reprodutivel.
//
// Espaco amostral: 26^2 * 10^2 = 67.600 matriculas possiveis por empresa.
// Suficiente para PMEs (< 500 colaboradores por empresa em cenarios
// realistas). Politica canonica de colisao: retry com limite explicito
// (MAX_ATTEMPTS_MULTIPLIER * count) para nunca cair em loop infinito.
//
// Case-insensitivity canonica: armazenamos e geramos sempre uppercase.
// A normalizacao para uppercase acontece no login (`/api/portal/login`)
// e em qualquer input externo — este gerador SO produz uppercase.
//
// RV-13: consumidores nesta ME-080b:
//   - Dispatch 2: `src/server/services/employees.ts`
//     `src/server/services/cLevelMembers.ts`
//   - Dispatch 4: `src/server/routers/employees.ts` (upload em massa)
//   - Dispatch 5: `src/db/seed/nativa/deriveMatriculas.ts`
//   - Testes: `tests/unit/matriculaGenerator.test.ts`

import { createSeededPrng, randomInt } from './prng';

/** Formato canonico da matricula. Exportado para uso em validacoes. */
export const MATRICULA_REGEX = /^[A-Z]{2}[0-9]{2}$/;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const LETTER_COUNT = LETTERS.length;
const DIGIT_COUNT = DIGITS.length;

/**
 * Multiplicador de tentativas para retry em caso de colisao. Com 200
 * empregados numa empresa (~0,3% do espaco), o esperado de tentativas
 * ate encontrar uma matricula livre e ~1,003 — multiplicador 100 e
 * defesa em profundidade contra o pior caso.
 */
const MAX_ATTEMPTS_MULTIPLIER = 100;

/**
 * Gera uma unica matricula pseudo-aleatoria no formato canonico.
 * Nao verifica unicidade — o consumidor e responsavel por checar
 * contra o conjunto de existentes. Ver `generateUniqueMatriculas`
 * para geracao em lote com retry.
 *
 * @param prng funcao PRNG deterministica (ver `./prng`).
 * @returns string uppercase no formato AA00.
 */
export function generateMatricula(prng: () => number): string {
  const l1 = LETTERS.charAt(randomInt(prng, LETTER_COUNT));
  const l2 = LETTERS.charAt(randomInt(prng, LETTER_COUNT));
  const d1 = DIGITS.charAt(randomInt(prng, DIGIT_COUNT));
  const d2 = DIGITS.charAt(randomInt(prng, DIGIT_COUNT));
  return `${l1}${l2}${d1}${d2}`;
}

/**
 * Gera um lote de matriculas unicas dentro de um universo compartilhado.
 * Rejeita colisoes contra `existingMatriculas` e contra as ja geradas
 * no proprio lote. Ordem de retorno preservada com a ordem de geracao.
 *
 * @param count numero de matriculas desejadas (deve ser > 0).
 * @param prng funcao PRNG deterministica.
 * @param existingMatriculas conjunto de matriculas ja em uso na empresa.
 * @returns array de `count` matriculas unicas no formato canonico.
 * @throws se nao for possivel gerar todas apos MAX_ATTEMPTS * count
 *         tentativas (indicador de espaco amostral esgotado — improvavel
 *         em PMEs, mas o guard existe para nunca travar).
 */
export function generateUniqueMatriculas(
  count: number,
  prng: () => number,
  existingMatriculas: ReadonlySet<string> = new Set(),
): string[] {
  if (count <= 0) {
    return [];
  }
  const used = new Set<string>(existingMatriculas);
  const result: string[] = [];
  const maxAttempts = count * MAX_ATTEMPTS_MULTIPLIER;
  let attempts = 0;
  while (result.length < count && attempts < maxAttempts) {
    const candidate = generateMatricula(prng);
    if (!used.has(candidate)) {
      used.add(candidate);
      result.push(candidate);
    }
    attempts++;
  }
  if (result.length < count) {
    throw new Error(
      `generateUniqueMatriculas: espaco amostral esgotado (pediu ${count}, ` +
        `gerou ${result.length} apos ${attempts} tentativas). Empresa pode ` +
        `estar proxima do limite de 67.600 matriculas por companyId.`,
    );
  }
  return result;
}

/**
 * Cria um PRNG dedicado para geracao deterministica de matriculas na
 * ME-080b. Seed canonico separado do de senhas para que as duas
 * sequencias sejam independentes (mudar formato de uma nao muda a
 * outra em regressoes).
 *
 * @param seed inteiro 32-bit sem sinal (canonico Nativa: ver Dispatch 5).
 * @returns PRNG deterministico pronto para consumo pelo gerador.
 */
export function createMatriculaPrng(seed: number): () => number {
  return createSeededPrng(seed);
}
