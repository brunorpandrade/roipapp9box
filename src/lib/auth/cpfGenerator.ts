// ROIP APP 9BOX — gerador canonico de CPF valido (ME-080b Dispatch 5).
//
// Escopo canonico: gerar CPFs no formato de 11 digitos (sem pontuacao), com
// digitos verificadores corretos pelo algoritmo oficial da Receita Federal
// (modulo 11), unicos por sequencia deterministica. Consumido por:
//   - Reseed da Nativa Bebidas Ubatuba (companies.id=2, Dispatch 5): geracao
//     deterministica de 66 employees + 3 C-levels via PRNG canonico, produzindo
//     CPFs bit-exact reprodutiveis a cada rodada.
//
// Faixa canonica reservada: base "1xx.xxx.xxx" (primeiro digito 1). Escolhida
// para separar CPFs de fixture de CPFs reais brasileiros (que comecam com
// qualquer digito 0-9 no mundo real, mas com validacao Receita) e da faixa
// "0xx.xxx.xxx" ja usada pela fixture Nativa Alimentos (10000000108, etc).
// Isso garante zero colisao de CPF entre Nativa Alimentos e Bebidas Ubatuba
// mesmo que o unique index seja por companyId (defesa em profundidade caso
// futuras validacoes cross-company sejam adicionadas).
//
// Determinismo: mesmo seed produz mesma sequencia. Permite reseed bit-exact e
// regressao em teste. Os digitos verificadores sao DETERMINISTICOS (funcao dos
// 9 primeiros digitos), entao dois CPFs so colidem se os 9 primeiros baterem
// exatamente — o retry por unicidade e trivialmente barato.
//
// NAO USAR PARA CENARIOS REAIS COM PESSOAS FISICAS BRASILEIRAS. Este gerador
// e para fixture de demo. CPFs gerados sao sintaticamente validos mas nao
// correspondem a titulares reais.
//
// RV-13: consumidores desta ME-080b Dispatch 5:
//   - `src/db/seed/ubatuba/deriveUbatubaEmployees.ts`
//   - `src/db/seed/ubatuba/deriveUbatubaCLevels.ts`
//   - `tests/unit/cpfGenerator.test.ts` (regressao de determinismo)

import { createSeededPrng, randomInt } from './prng';

/** Comprimento canonico do CPF apos remocao de pontuacao (11 digitos). */
export const CPF_LENGTH = 11;

/** Formato canonico armazenado no banco (11 digitos, sem pontuacao). */
export const CPF_REGEX = /^[0-9]{11}$/;

/**
 * Primeiro digito da faixa reservada para CPFs de fixture. Deve ser 1 para
 * separar da faixa "0xx" ja usada pela fixture Nativa Alimentos. Se essa
 * decisao mudar canonicamente, este valor e o unico ponto de alteracao.
 */
export const CPF_FIXTURE_PREFIX_DIGIT = 1;

/**
 * Multiplicador de tentativas para retry em caso de colisao. Espaco amostral
 * da faixa "1xx" e 100 milhoes; colisao em lotes de dezenas e extremamente
 * improvavel, mas o guard existe para nunca travar.
 */
const MAX_ATTEMPTS_MULTIPLIER = 100;

/**
 * Calcula os 2 digitos verificadores canonicos de um CPF a partir dos 9
 * primeiros digitos. Algoritmo oficial (modulo 11) da Receita Federal.
 *
 * @param base9 string com exatamente 9 digitos (0-9).
 * @returns string com 2 digitos verificadores (0-9).
 */
export function computeCpfCheckDigits(base9: string): string {
  if (base9.length !== 9 || !/^[0-9]{9}$/.test(base9)) {
    throw new Error(`computeCpfCheckDigits: entrada '${base9}' deve ter 9 digitos.`);
  }
  const digits = base9.split('').map((d) => Number(d));

  // Digito verificador 1: peso 10 a 2 sobre os 9 digitos.
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += digits[i]! * (10 - i);
  }
  let dv1 = (sum1 * 10) % 11;
  if (dv1 === 10) {
    dv1 = 0;
  }

  // Digito verificador 2: peso 11 a 2 sobre os 9 digitos + dv1.
  let sum2 = 0;
  for (let i = 0; i < 9; i++) {
    sum2 += digits[i]! * (11 - i);
  }
  sum2 += dv1 * 2;
  let dv2 = (sum2 * 10) % 11;
  if (dv2 === 10) {
    dv2 = 0;
  }

  return `${dv1}${dv2}`;
}

/**
 * Valida se uma string e um CPF sintaticamente valido: 11 digitos, digitos
 * verificadores corretos, nao trivialmente uniforme (rejeita '00000000000',
 * '11111111111', etc. — a Receita rejeita esses casos degenerados).
 *
 * @param cpf string candidata (11 digitos sem pontuacao).
 * @returns true se valido; false caso contrario.
 */
export function isValidCpf(cpf: string): boolean {
  if (!CPF_REGEX.test(cpf)) {
    return false;
  }
  // Rejeita CPFs trivialmente uniformes (regra canonica Receita).
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  const base9 = cpf.slice(0, 9);
  const expectedDv = computeCpfCheckDigits(base9);
  return cpf.slice(9, 11) === expectedDv;
}

/**
 * Gera um unico CPF sintaticamente valido dentro da faixa canonica reservada.
 * Nao verifica unicidade — o consumidor e responsavel por checar contra o
 * conjunto de existentes. Ver `generateUniqueCpfs` para geracao em lote com
 * retry.
 *
 * @param prng funcao PRNG deterministica (ver `./prng`).
 * @returns string de 11 digitos, sintaticamente valida por modulo 11, com
 *          primeiro digito = CPF_FIXTURE_PREFIX_DIGIT.
 */
export function generateCpf(prng: () => number): string {
  // Constroi os 9 primeiros digitos com o primeiro fixado na faixa reservada.
  const digits: string[] = [String(CPF_FIXTURE_PREFIX_DIGIT)];
  for (let i = 1; i < 9; i++) {
    digits.push(String(randomInt(prng, 10)));
  }

  // Rejeicao canonica de sequencias trivialmente uniformes: se os 9 digitos
  // forem todos iguais ao primeiro (ex: '111111111'), o CPF resultante seria
  // '11111111111' (falha em isValidCpf). Reamostra 1 digito ate quebrar
  // uniformidade — probabilisticamente ~1e-8, mas o guard e barato.
  const isUniform = digits.every((d) => d === digits[0]);
  if (isUniform) {
    // Substitui o digito da posicao 1 por algo diferente do primeiro digito.
    let alt = randomInt(prng, 10);
    while (alt === CPF_FIXTURE_PREFIX_DIGIT) {
      alt = randomInt(prng, 10);
    }
    digits[1] = String(alt);
  }

  const finalBase9 = digits.join('');
  const dv = computeCpfCheckDigits(finalBase9);
  return `${finalBase9}${dv}`;
}

/**
 * Gera um lote de CPFs unicos dentro de um universo compartilhado. Rejeita
 * colisoes contra `existingCpfs` e contra os ja gerados no proprio lote.
 * Ordem de retorno preservada com a ordem de geracao.
 *
 * @param count numero de CPFs desejados (deve ser > 0).
 * @param prng funcao PRNG deterministica.
 * @param existingCpfs conjunto de CPFs ja em uso.
 * @returns array de `count` CPFs unicos, sintaticamente validos.
 * @throws se nao for possivel gerar todos apos MAX_ATTEMPTS * count tentativas.
 */
export function generateUniqueCpfs(
  count: number,
  prng: () => number,
  existingCpfs: ReadonlySet<string> = new Set(),
): string[] {
  if (count <= 0) {
    return [];
  }
  const used = new Set<string>(existingCpfs);
  const result: string[] = [];
  const maxAttempts = count * MAX_ATTEMPTS_MULTIPLIER;
  let attempts = 0;
  while (result.length < count && attempts < maxAttempts) {
    const candidate = generateCpf(prng);
    if (!used.has(candidate) && isValidCpf(candidate)) {
      used.add(candidate);
      result.push(candidate);
    }
    attempts++;
  }
  if (result.length < count) {
    throw new Error(
      `generateUniqueCpfs: espaco amostral esgotado (pediu ${count}, ` +
        `gerou ${result.length} apos ${attempts} tentativas). Improvavel na ` +
        `faixa reservada '1xx' (100M CPFs disponiveis).`,
    );
  }
  return result;
}

/**
 * Cria um PRNG dedicado para geracao deterministica de CPFs na fixture
 * Ubatuba (Dispatch 5). Seed canonico separado dos de matricula e senha para
 * que as tres sequencias sejam independentes (mudar formato de uma nao
 * desloca as outras em regressoes).
 *
 * @param seed inteiro 32-bit sem sinal (canonico Ubatuba: 20260815 + 3).
 * @returns PRNG deterministico pronto para consumo pelo gerador.
 */
export function createCpfPrng(seed: number): () => number {
  return createSeededPrng(seed);
}
