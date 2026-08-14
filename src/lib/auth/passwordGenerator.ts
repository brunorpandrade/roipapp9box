// ROIP APP 9BOX — gerador canonico de senhas iniciais (ME-080b Dispatch 1).
//
// Escopo canonico: gerar senhas iniciais temporarias de 8 caracteres
// alfanumericos com garantia de conformidade a politica canonica
// `MSG_PASSWORD_POLICY` (min 8 chars, >=1 letra, >=1 numero — §13.3 e
// `src/server/routers/auth.ts` linha 131). Consumido por:
//   - Cadastro individual (Dispatch 2): geracao automatica ao criar
//     employee com isLider/isRH/isRF=true ou C-level, exibida em plain
//     text pos-cadastro para o RH copiar/transmitir manualmente (S516:
//     zero envio automatico por e-mail).
//   - Cadastro em massa via planilha (Dispatch 4): geracao para linhas
//     Ativar como Lider/RH = Sim, coletadas no arquivo
//     `credenciais_iniciais.xlsx` para download.
//   - Reseed da Nativa (Dispatch 5): geracao deterministica para todos
//     os lideres/RH/RF/C-levels via seed fixo.
//
// Fluxo canonico apos geracao (todos os consumidores):
//   1. Gera plain text via este modulo.
//   2. Aplica bcrypt (`bcrypt.hash(plain, 10)`) e grava em
//      `employees.passwordHash` ou `cLevelMembers.passwordHash`.
//   3. Mantem `passwordSet = false`.
//   4. Devolve o plain text ao ponto de exibicao (tela pos-cadastro ou
//      arquivo XLSX). Plain text NUNCA e persistido.
//   5. No primeiro login (Dispatch 3), o gate `passwordSet=false`
//      obriga troca antes de qualquer navegacao no painel.
//
// Determinismo: mesmo seed produz mesma sequencia. Permite reseed
// bit-exact e regressao em teste. O bcrypt DEPOIS da geracao introduz
// nao-determinismo no hash armazenado (salt aleatorio) — o determinismo
// vale para o plain text gerado, nao para o hash.
//
// Alfabeto canonico: [A-Za-z0-9] (62 caracteres). Excluidos caracteres
// especiais para reduzir erro de transcricao humana (RH digita no
// WhatsApp/telefone para o colaborador).
//
// RV-13: consumidores nesta ME-080b:
//   - Dispatch 2: `src/server/services/employees.ts`
//     `src/server/services/cLevelMembers.ts`
//   - Dispatch 4: `src/server/routers/employees.ts` (upload em massa)
//   - Dispatch 5: `src/db/seed/nativa/deriveSenhasIniciais.ts`
//   - Testes: `tests/unit/passwordGenerator.test.ts`

import { createSeededPrng, randomInt } from './prng';

const LETTERS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LETTERS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTERS = LETTERS_LOWER + LETTERS_UPPER;
const DIGITS = '0123456789';
const ALPHABET = LETTERS + DIGITS;

const LETTER_COUNT = LETTERS.length;
const DIGIT_COUNT = DIGITS.length;
const ALPHABET_COUNT = ALPHABET.length;

/** Comprimento canonico da senha inicial (§13.3 exige min 8). */
export const INITIAL_PASSWORD_LENGTH = 8;

/**
 * Gera uma senha inicial pseudo-aleatoria de 8 caracteres alfanumericos
 * garantindo pelo menos 1 letra e pelo menos 1 digito (conformidade
 * canonica com MSG_PASSWORD_POLICY).
 *
 * Estrategia:
 *   1. Reserva a posicao 0 para uma letra e a posicao 1 para um digito
 *      (garante a politica sem depender de sorte).
 *   2. Preenche as demais posicoes com qualquer caractere do alfabeto.
 *   3. Embaralha via Fisher-Yates usando o mesmo PRNG (evita padrao
 *      previsivel "letra na posicao 0, digito na 1").
 *
 * @param prng funcao PRNG deterministica (ver `./prng`).
 * @returns string de 8 caracteres alfanumericos.
 */
export function generateInitialPassword(prng: () => number): string {
  const chars: string[] = new Array(INITIAL_PASSWORD_LENGTH);
  // 1. Garantia canonica de conformidade a MSG_PASSWORD_POLICY.
  chars[0] = LETTERS.charAt(randomInt(prng, LETTER_COUNT));
  chars[1] = DIGITS.charAt(randomInt(prng, DIGIT_COUNT));
  // 2. Preenche as demais posicoes com qualquer caractere.
  for (let i = 2; i < INITIAL_PASSWORD_LENGTH; i++) {
    chars[i] = ALPHABET.charAt(randomInt(prng, ALPHABET_COUNT));
  }
  // 3. Fisher-Yates para eliminar padrao posicional previsivel.
  for (let i = INITIAL_PASSWORD_LENGTH - 1; i > 0; i--) {
    const j = randomInt(prng, i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join('');
}

/**
 * Gera um lote de N senhas iniciais independentes. Ordem preservada.
 *
 * @param count numero de senhas desejadas (deve ser > 0).
 * @param prng funcao PRNG deterministica.
 * @returns array de `count` senhas de 8 chars alfanumericos.
 */
export function generateInitialPasswords(count: number, prng: () => number): string[] {
  if (count <= 0) {
    return [];
  }
  const result: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = generateInitialPassword(prng);
  }
  return result;
}

/**
 * Cria um PRNG dedicado para geracao deterministica de senhas iniciais
 * na ME-080b. Seed canonico separado do de matriculas (ver
 * `matriculaGenerator.createMatriculaPrng`) para independencia.
 *
 * @param seed inteiro 32-bit sem sinal (canonico Nativa: ver Dispatch 5).
 * @returns PRNG deterministico pronto para consumo pelo gerador.
 */
export function createPasswordPrng(seed: number): () => number {
  return createSeededPrng(seed);
}
