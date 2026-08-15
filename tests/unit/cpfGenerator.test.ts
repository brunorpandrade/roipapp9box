// ROIP APP 9BOX — teste unit do gerador canonico de CPF (ME-080b Dispatch 5).
//
// Cobre invariantes canonicas:
//   - Determinismo bit-exact por seed.
//   - Validade sintatica (11 digitos, digitos verificadores corretos).
//   - Faixa reservada "1xx" (primeiro digito = CPF_FIXTURE_PREFIX_DIGIT).
//   - Unicidade em lote (nenhuma colisao dentro do array retornado).
//   - Rejeicao de CPFs uniformes (regra Receita).
//   - Reprovacao esperada (RV-03) para casos ruins conhecidos.

import { describe, expect, it } from 'vitest';

import {
  CPF_FIXTURE_PREFIX_DIGIT,
  CPF_LENGTH,
  CPF_REGEX,
  computeCpfCheckDigits,
  createCpfPrng,
  generateCpf,
  generateUniqueCpfs,
  isValidCpf,
} from '../../src/lib/auth/cpfGenerator';

describe('computeCpfCheckDigits — algoritmo canonico Receita Federal', () => {
  it('caso canonico conhecido: base9=529982247 gera dv=25', () => {
    // Caso publico de teste (nao e CPF real): 529.982.247-25.
    expect(computeCpfCheckDigits('529982247')).toBe('25');
  });

  it('caso canonico conhecido: base9=111444777 gera dv=35', () => {
    expect(computeCpfCheckDigits('111444777')).toBe('35');
  });

  it('rejeita entrada com != 9 digitos', () => {
    expect(() => computeCpfCheckDigits('12345678')).toThrow();
    expect(() => computeCpfCheckDigits('1234567890')).toThrow();
    expect(() => computeCpfCheckDigits('12345678a')).toThrow();
  });
});

describe('isValidCpf — validacao canonica', () => {
  it('aceita CPF valido', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
  });

  it('rejeita CPF uniforme (regra Receita)', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('99999999999')).toBe(false);
  });

  it('rejeita CPF com formato invalido', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('529.982.247-25')).toBe(false);
    expect(isValidCpf('52998224726')).toBe(false); // dv errado
  });
});

describe('generateCpf — geracao unitaria', () => {
  it('produz CPF valido com 11 digitos', () => {
    const prng = createCpfPrng(20260818);
    const cpf = generateCpf(prng);
    expect(cpf.length).toBe(CPF_LENGTH);
    expect(CPF_REGEX.test(cpf)).toBe(true);
    expect(isValidCpf(cpf)).toBe(true);
  });

  it('primeiro digito canonicamente = CPF_FIXTURE_PREFIX_DIGIT (1)', () => {
    const prng = createCpfPrng(20260818);
    for (let i = 0; i < 50; i++) {
      const cpf = generateCpf(prng);
      expect(cpf.charAt(0)).toBe(String(CPF_FIXTURE_PREFIX_DIGIT));
    }
  });

  it('determinismo: mesma seed produz mesmo CPF na mesma posicao', () => {
    const prngA = createCpfPrng(20260818);
    const prngB = createCpfPrng(20260818);
    for (let i = 0; i < 20; i++) {
      expect(generateCpf(prngA)).toBe(generateCpf(prngB));
    }
  });

  it('seeds diferentes produzem sequencias diferentes', () => {
    const prngA = createCpfPrng(20260818);
    const prngB = createCpfPrng(20260819);
    // Pelo menos um dos primeiros 3 deve diferir (probabilidade de coincidir
    // todos os 3 e ~1e-24, praticamente zero).
    let diferentes = 0;
    for (let i = 0; i < 3; i++) {
      if (generateCpf(prngA) !== generateCpf(prngB)) diferentes++;
    }
    expect(diferentes).toBeGreaterThan(0);
  });
});

describe('generateUniqueCpfs — geracao em lote', () => {
  it('gera N CPFs unicos e validos', () => {
    const prng = createCpfPrng(20260818);
    const cpfs = generateUniqueCpfs(66, prng);
    expect(cpfs.length).toBe(66);
    const unicos = new Set(cpfs);
    expect(unicos.size).toBe(66);
    for (const cpf of cpfs) {
      expect(isValidCpf(cpf)).toBe(true);
      expect(cpf.charAt(0)).toBe('1');
    }
  });

  it('rejeita colisao contra existingCpfs', () => {
    // Gera 5 CPFs com seed A; usa esses como pool "existente" e pede 5 novos
    // com a MESMA seed B — os 5 gerados por B nao devem colidir com os de A
    // (garantia via retry interno).
    const prngA = createCpfPrng(20260900);
    const dezCpfsA = generateUniqueCpfs(10, prngA);
    const existentes = new Set(dezCpfsA);

    const prngB = createCpfPrng(20260900);
    const novos = generateUniqueCpfs(5, prngB, existentes);
    for (const c of novos) {
      expect(existentes.has(c)).toBe(false);
    }
    expect(new Set(novos).size).toBe(5);
  });

  it('caso limite: count=0 retorna array vazio', () => {
    const prng = createCpfPrng(20260818);
    expect(generateUniqueCpfs(0, prng)).toEqual([]);
  });
});

describe('RV-03 — Regua provada nos dois sentidos', () => {
  it('CASO BOM: CPF gerado passa em isValidCpf', () => {
    const prng = createCpfPrng(20260818);
    for (let i = 0; i < 100; i++) {
      expect(isValidCpf(generateCpf(prng))).toBe(true);
    }
  });

  it('CASO RUIM: CPF sinteticamente quebrado (dv trocado) reprova em isValidCpf', () => {
    const prng = createCpfPrng(20260818);
    const cpf = generateCpf(prng);
    // Injeta defeito: troca o ultimo digito por outro valor.
    const digitoAtual = cpf.charAt(10);
    const defeituoso = cpf.slice(0, 10) + (digitoAtual === '0' ? '1' : '0');
    expect(isValidCpf(defeituoso)).toBe(false);
  });
});
