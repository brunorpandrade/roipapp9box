// ROIP APP 9BOX — testes canonicos ME-B9.9b
// Recalibracao canonica dos cutoffs de assiduidade apos validacao
// empirica: 99/97/95 (ME-B9.9) -> 97/94/87 (ME-B9.9b). Adjetivos no
// feminino. 17 testes cobrindo boundaries de cada uma das 4 faixas
// (otima / boa / regular / ruim), limites exatos, null e NaN
// defensivos, e constantes canonicas literais.

import { describe, expect, it } from 'vitest';

import { ASSIDUIDADE_CUTOFFS, classifyAssiduidade } from '../../src/lib/roiFormulas';

describe('classifyAssiduidade — defensivos', () => {
  it('retorna null para null', () => {
    expect(classifyAssiduidade(null)).toBeNull();
  });

  it('retorna null para NaN', () => {
    expect(classifyAssiduidade(Number.NaN)).toBeNull();
  });
});

describe('classifyAssiduidade — faixa Otima (presenca >= 97)', () => {
  it('presenca 100 e otima', () => {
    expect(classifyAssiduidade(100)).toBe('otima');
  });

  it('presenca exatamente 97 e otima (boundary inferior)', () => {
    expect(classifyAssiduidade(97)).toBe('otima');
  });

  it('presenca 98.5 e otima', () => {
    expect(classifyAssiduidade(98.5)).toBe('otima');
  });
});

describe('classifyAssiduidade — faixa Boa (94 <= presenca < 97)', () => {
  it('presenca 96.99 e boa (boundary superior)', () => {
    expect(classifyAssiduidade(96.99)).toBe('boa');
  });

  it('presenca exatamente 94 e boa (boundary inferior)', () => {
    expect(classifyAssiduidade(94)).toBe('boa');
  });

  it('presenca 95 e boa', () => {
    expect(classifyAssiduidade(95)).toBe('boa');
  });
});

describe('classifyAssiduidade — faixa Regular (87 <= presenca < 94)', () => {
  it('presenca 93.99 e regular (boundary superior)', () => {
    expect(classifyAssiduidade(93.99)).toBe('regular');
  });

  it('presenca exatamente 87 e regular (boundary inferior)', () => {
    expect(classifyAssiduidade(87)).toBe('regular');
  });

  it('presenca 90 e regular', () => {
    expect(classifyAssiduidade(90)).toBe('regular');
  });
});

describe('classifyAssiduidade — faixa Ruim (presenca < 87)', () => {
  it('presenca 86.99 e ruim (boundary superior)', () => {
    expect(classifyAssiduidade(86.99)).toBe('ruim');
  });

  it('presenca 80 e ruim', () => {
    expect(classifyAssiduidade(80)).toBe('ruim');
  });

  it('presenca 0 e ruim', () => {
    expect(classifyAssiduidade(0)).toBe('ruim');
  });
});

describe('ASSIDUIDADE_CUTOFFS — constantes canonicas literais', () => {
  it('cutoff otima e 97.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.otima).toBe(97.0);
  });

  it('cutoff boa e 94.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.boa).toBe(94.0);
  });

  it('cutoff regular e 87.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.regular).toBe(87.0);
  });
});
