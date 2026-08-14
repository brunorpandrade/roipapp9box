// ROIP APP 9BOX — teste unitario `lib/auth/prng` (ME-080b Dispatch 1).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Cobre determinismo (mesmo seed → mesma sequencia), amplitude
// (valores em [0, 1)) e independencia entre seeds diferentes.
//
// Regressao critica: qualquer mudanca em `createSeededPrng` que altere
// a sequencia gerada quebrara o bit-exact do reseed da Nativa (Dispatch
// 5). Este teste congelar valores literais gerados por seeds canonicos
// funciona como canario dessa mudanca.

import { describe, expect, it } from 'vitest';

import { createSeededPrng, randomInt } from '../../src/lib/auth/prng';

describe('lib/auth/prng — createSeededPrng (ME-080b)', () => {
  it('mesmo seed produz a mesma sequencia integral', () => {
    const a = createSeededPrng(42);
    const b = createSeededPrng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('seeds diferentes produzem sequencias diferentes', () => {
    const a = createSeededPrng(42);
    const b = createSeededPrng(43);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 20; i++) {
      seqA.push(a());
      seqB.push(b());
    }
    // Nao pode ser igual em nenhuma posicao das 20 (probabilidade
    // astronomica com Mulberry32 se seed muda).
    expect(seqA).not.toEqual(seqB);
  });

  it('valores gerados estao sempre em [0, 1)', () => {
    const prng = createSeededPrng(123456);
    for (let i = 0; i < 1000; i++) {
      const v = prng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seed 0 e valido e produz sequencia deterministica', () => {
    const a = createSeededPrng(0);
    const b = createSeededPrng(0);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('seed canonico congelado (regressao bit-exact) — primeiros 3 valores', () => {
    // Se este teste quebrar, o reseed da Nativa (Dispatch 5) mudou de
    // estado — TODAS as matriculas e senhas iniciais mudarao. Prova
    // canonica de bit-exactness do gerador.
    const prng = createSeededPrng(1);
    const first = prng();
    const second = prng();
    const third = prng();
    // Valores calculados literalmente pelo Mulberry32 com seed 1.
    // Se algum mudar, o algoritmo interno foi alterado.
    expect(first).toBeCloseTo(0.6270739405881613, 15);
    expect(second).toBeCloseTo(0.002735721180215478, 15);
    expect(third).toBeCloseTo(0.5274470399599522, 15);
  });
});

describe('lib/auth/prng — randomInt (ME-080b)', () => {
  it('retorna inteiro em [0, max)', () => {
    const prng = createSeededPrng(7);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(prng, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('max = 1 sempre retorna 0', () => {
    const prng = createSeededPrng(999);
    for (let i = 0; i < 100; i++) {
      expect(randomInt(prng, 1)).toBe(0);
    }
  });

  it('cobre toda a amplitude quando amostrado o suficiente', () => {
    const prng = createSeededPrng(2026);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      seen.add(randomInt(prng, 10));
    }
    // Com 5000 amostras em [0, 10), esperamos ver todos os 10 valores.
    expect(seen.size).toBe(10);
  });
});
