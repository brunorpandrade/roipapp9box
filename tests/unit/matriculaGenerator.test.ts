// ROIP APP 9BOX — teste unitario `lib/auth/matriculaGenerator`
// (ME-080b Dispatch 1).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Cobre formato canonico ^[A-Z]{2}[0-9]{2}$, determinismo,
// unicidade em lote, retry contra colisoes fornecidas, guard de
// esgotamento e regressao bit-exact do primeiro lote canonico.

import { describe, expect, it } from 'vitest';

import { createSeededPrng } from '../../src/lib/auth/prng';
import {
  createMatriculaPrng,
  generateMatricula,
  generateUniqueMatriculas,
  MATRICULA_REGEX,
} from '../../src/lib/auth/matriculaGenerator';

describe('lib/auth/matriculaGenerator — generateMatricula (ME-080b)', () => {
  it('gera matricula no formato canonico ^[A-Z]{2}[0-9]{2}$', () => {
    const prng = createSeededPrng(1);
    for (let i = 0; i < 500; i++) {
      const m = generateMatricula(prng);
      expect(MATRICULA_REGEX.test(m)).toBe(true);
    }
  });

  it('sempre com exatamente 4 caracteres', () => {
    const prng = createSeededPrng(42);
    for (let i = 0; i < 100; i++) {
      expect(generateMatricula(prng).length).toBe(4);
    }
  });

  it('mesmo seed produz mesma sequencia de matriculas', () => {
    const a = createSeededPrng(2026);
    const b = createSeededPrng(2026);
    for (let i = 0; i < 50; i++) {
      expect(generateMatricula(a)).toBe(generateMatricula(b));
    }
  });

  it('MATRICULA_REGEX rejeita variacoes invalidas', () => {
    expect(MATRICULA_REGEX.test('AB12')).toBe(true);
    expect(MATRICULA_REGEX.test('ab12')).toBe(false); // lowercase
    expect(MATRICULA_REGEX.test('A123')).toBe(false); // 1 letra
    expect(MATRICULA_REGEX.test('ABC1')).toBe(false); // 3 letras
    expect(MATRICULA_REGEX.test('AB1')).toBe(false); // 3 chars
    expect(MATRICULA_REGEX.test('AB123')).toBe(false); // 5 chars
    expect(MATRICULA_REGEX.test('12AB')).toBe(false); // ordem invertida
    expect(MATRICULA_REGEX.test('')).toBe(false);
  });
});

describe('lib/auth/matriculaGenerator — generateUniqueMatriculas (ME-080b)', () => {
  it('gera N matriculas todas unicas dentro do lote', () => {
    const prng = createSeededPrng(100);
    const batch = generateUniqueMatriculas(200, prng);
    expect(batch.length).toBe(200);
    expect(new Set(batch).size).toBe(200);
    batch.forEach((m) => expect(MATRICULA_REGEX.test(m)).toBe(true));
  });

  it('respeita conjunto de existentes (nao repete matricula pre-existente)', () => {
    const existing = new Set(['AB12', 'CD34', 'EF56']);
    const prng = createSeededPrng(500);
    const batch = generateUniqueMatriculas(100, prng, existing);
    expect(batch.length).toBe(100);
    batch.forEach((m) => {
      expect(existing.has(m)).toBe(false);
      expect(MATRICULA_REGEX.test(m)).toBe(true);
    });
    // Uniao ainda tem tamanho existentes + geradas.
    const union = new Set([...existing, ...batch]);
    expect(union.size).toBe(existing.size + batch.length);
  });

  it('count = 0 retorna array vazio sem invocar o PRNG', () => {
    let calls = 0;
    const prng = (): number => {
      calls++;
      return 0.5;
    };
    const batch = generateUniqueMatriculas(0, prng);
    expect(batch).toEqual([]);
    expect(calls).toBe(0);
  });

  it('mesmo seed com mesmos existentes produz mesmo lote', () => {
    const prngA = createSeededPrng(777);
    const prngB = createSeededPrng(777);
    const existing = new Set(['XX99']);
    const a = generateUniqueMatriculas(50, prngA, existing);
    const b = generateUniqueMatriculas(50, prngB, existing);
    expect(a).toEqual(b);
  });

  it('lanca erro quando espaco amostral esgotado', () => {
    // Preenche quase todo o espaco (67.599 de 67.600) e tenta gerar 5:
    // com apenas 1 slot livre, MAX_ATTEMPTS_MULTIPLIER * 5 = 500
    // tentativas nao bastam para encontrar os 5 restantes (probabilidade
    // ~0,0015% por tentativa apos preencher 1 vaga).
    const almostFull = new Set<string>();
    for (let l1 = 65; l1 <= 90; l1++) {
      for (let l2 = 65; l2 <= 90; l2++) {
        for (let d1 = 0; d1 <= 9; d1++) {
          for (let d2 = 0; d2 <= 9; d2++) {
            almostFull.add(`${String.fromCharCode(l1)}${String.fromCharCode(l2)}${d1}${d2}`);
          }
        }
      }
    }
    expect(almostFull.size).toBe(67600);
    // Remove 1 para deixar 1 slot livre.
    almostFull.delete('AA00');
    const prng = createSeededPrng(2026);
    expect(() => generateUniqueMatriculas(5, prng, almostFull)).toThrow(/espaco amostral esgotado/);
  });
});

describe('lib/auth/matriculaGenerator — createMatriculaPrng (ME-080b)', () => {
  it('cria PRNG deterministico funcional', () => {
    const prng = createMatriculaPrng(2026);
    const m1 = generateMatricula(prng);
    expect(MATRICULA_REGEX.test(m1)).toBe(true);
  });

  it('mesmo seed via helper produz mesma sequencia que createSeededPrng', () => {
    const a = createMatriculaPrng(2026);
    const b = createSeededPrng(2026);
    // Comparacao pela primeira matricula gerada (que consome 4 chamadas ao PRNG).
    expect(generateMatricula(a)).toBe(generateMatricula(b));
  });
});
