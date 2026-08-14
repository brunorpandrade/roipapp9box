// ROIP APP 9BOX — PRNG deterministico (ME-080b Dispatch 1).
//
// Escopo canonico: fornecer gerador pseudo-aleatorio deterministico
// compartilhado por `matriculaGenerator` e `passwordGenerator`, para
// permitir reseed bit-exact da Nativa (Dispatch 5) e testes reprodutiveis.
//
// Algoritmo: Mulberry32 (32-bit state, uniform distribution em [0,1)).
// Escolhido por ser: (a) deterministico com seed inteiro; (b) sem
// dependencia externa; (c) qualidade estatistica adequada para o dominio
// (geracao de credenciais de demo, nao criptografia); (d) implementacao
// curta e auditavel.
//
// NAO USAR PARA CRIPTOGRAFIA. Este PRNG e para geracao deterministica
// de dados de demo. Senhas geradas por `passwordGenerator` usam este
// PRNG para escolha de caracteres, mas a seguranca final vem do bcrypt
// aplicado antes do armazenamento (`passwordHash`) e da politica de
// troca obrigatoria no primeiro acesso (`passwordSet=false` gate).
//
// RV-13: consumidores nesta ME-080b:
//   - `src/lib/auth/matriculaGenerator.ts`
//   - `src/lib/auth/passwordGenerator.ts`
//   - `tests/unit/prng.test.ts` (regressao de determinismo)

/**
 * Cria um PRNG deterministico Mulberry32 a partir de um seed inteiro.
 * Cada chamada ao PRNG retorna um numero em [0, 1) com distribuicao
 * uniforme. Mesmo seed sempre produz a mesma sequencia.
 *
 * @param seed inteiro 32-bit sem sinal usado como estado inicial.
 * @returns funcao PRNG que retorna float em [0, 1) a cada chamada.
 */
export function createSeededPrng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Retorna um inteiro pseudo-aleatorio em [0, max) usando o PRNG fornecido.
 * Helper para eliminar duplicacao de `Math.floor(prng() * n)` nos geradores.
 *
 * @param prng funcao PRNG que retorna float em [0, 1).
 * @param max limite superior exclusivo (deve ser inteiro positivo).
 * @returns inteiro em [0, max).
 */
export function randomInt(prng: () => number, max: number): number {
  return Math.floor(prng() * max);
}
