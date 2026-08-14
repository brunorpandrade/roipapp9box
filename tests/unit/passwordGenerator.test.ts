// ROIP APP 9BOX — teste unitario `lib/auth/passwordGenerator`
// (ME-080b Dispatch 1).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Cobre conformidade canonica a MSG_PASSWORD_POLICY (min 8,
// >=1 letra, >=1 numero), alfabeto restrito a [A-Za-z0-9] (S516: RH
// transmite manualmente — sem caracteres que confundem transcricao),
// determinismo, lote e helper createPasswordPrng.

import { describe, expect, it } from 'vitest';

import { createSeededPrng } from '../../src/lib/auth/prng';
import {
  createPasswordPrng,
  generateInitialPassword,
  generateInitialPasswords,
  INITIAL_PASSWORD_LENGTH,
} from '../../src/lib/auth/passwordGenerator';

const ALPHANUMERIC_REGEX = /^[A-Za-z0-9]+$/;
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /[0-9]/;

describe('lib/auth/passwordGenerator — generateInitialPassword (ME-080b)', () => {
  it('sempre tem exatamente 8 caracteres', () => {
    const prng = createSeededPrng(1);
    for (let i = 0; i < 500; i++) {
      expect(generateInitialPassword(prng).length).toBe(INITIAL_PASSWORD_LENGTH);
    }
  });

  it('alfabeto restrito a [A-Za-z0-9]', () => {
    const prng = createSeededPrng(42);
    for (let i = 0; i < 500; i++) {
      const p = generateInitialPassword(prng);
      expect(ALPHANUMERIC_REGEX.test(p)).toBe(true);
    }
  });

  it('conformidade canonica com MSG_PASSWORD_POLICY: >=1 letra e >=1 numero', () => {
    // Bateria grande para catch estatistico de regressao (a garantia
    // interna e por construcao, mas cobrimos com amostragem para
    // proteger contra refactor que remova o slot fixo).
    const prng = createSeededPrng(2026);
    for (let i = 0; i < 1000; i++) {
      const p = generateInitialPassword(prng);
      expect(HAS_LETTER.test(p)).toBe(true);
      expect(HAS_DIGIT.test(p)).toBe(true);
    }
  });

  it('mesmo seed produz mesma sequencia de senhas', () => {
    const a = createSeededPrng(999);
    const b = createSeededPrng(999);
    for (let i = 0; i < 50; i++) {
      expect(generateInitialPassword(a)).toBe(generateInitialPassword(b));
    }
  });

  it('seeds diferentes produzem senhas iniciais diferentes', () => {
    const a = createSeededPrng(1);
    const b = createSeededPrng(2);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 20; i++) {
      seqA.push(generateInitialPassword(a));
      seqB.push(generateInitialPassword(b));
    }
    // Ao menos uma diferenca em 20 senhas de 8 chars — cobertura suficiente.
    expect(seqA).not.toEqual(seqB);
  });

  it('nao retorna senhas duplicadas em lote pequeno (baixa probabilidade)', () => {
    const prng = createSeededPrng(2027);
    const batch = new Set<string>();
    for (let i = 0; i < 100; i++) {
      batch.add(generateInitialPassword(prng));
    }
    // Espaco: 62^8 = ~2.18e14. Colisao em 100 amostras: probabilidade
    // ~2.3e-11. Se colidir, algo esta muito errado no PRNG.
    expect(batch.size).toBe(100);
  });
});

describe('lib/auth/passwordGenerator — generateInitialPasswords (ME-080b)', () => {
  it('gera N senhas com formato canonico', () => {
    const prng = createSeededPrng(500);
    const batch = generateInitialPasswords(50, prng);
    expect(batch.length).toBe(50);
    batch.forEach((p) => {
      expect(p.length).toBe(INITIAL_PASSWORD_LENGTH);
      expect(ALPHANUMERIC_REGEX.test(p)).toBe(true);
      expect(HAS_LETTER.test(p)).toBe(true);
      expect(HAS_DIGIT.test(p)).toBe(true);
    });
  });

  it('count = 0 retorna array vazio sem invocar o PRNG', () => {
    let calls = 0;
    const prng = (): number => {
      calls++;
      return 0.5;
    };
    const batch = generateInitialPasswords(0, prng);
    expect(batch).toEqual([]);
    expect(calls).toBe(0);
  });

  it('mesmo seed produz mesmo lote', () => {
    const a = createSeededPrng(3000);
    const b = createSeededPrng(3000);
    expect(generateInitialPasswords(30, a)).toEqual(generateInitialPasswords(30, b));
  });
});

describe('lib/auth/passwordGenerator — createPasswordPrng (ME-080b)', () => {
  it('cria PRNG deterministico funcional', () => {
    const prng = createPasswordPrng(2026);
    const p = generateInitialPassword(prng);
    expect(p.length).toBe(INITIAL_PASSWORD_LENGTH);
    expect(ALPHANUMERIC_REGEX.test(p)).toBe(true);
  });

  it('mesmo seed via helper produz mesma sequencia que createSeededPrng', () => {
    const a = createPasswordPrng(2026);
    const b = createSeededPrng(2026);
    expect(generateInitialPassword(a)).toBe(generateInitialPassword(b));
  });
});
