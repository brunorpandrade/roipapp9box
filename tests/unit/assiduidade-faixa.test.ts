// ROIP APP 9BOX — testes canonicos ME-B9.9
// Classificacao canonica de assiduidade: `classifyAssiduidade` +
// constantes `ASSIDUIDADE_CUTOFFS`. 16 testes cobrindo boundaries de
// cada uma das 4 faixas (otimo / bom / regular / ruim), limites exatos,
// null e NaN defensivos, e constantes canonicas literais.

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

describe('classifyAssiduidade — faixa Otimo (presenca >= 99)', () => {
  it('presenca 100 e otimo', () => {
    expect(classifyAssiduidade(100)).toBe('otimo');
  });

  it('presenca exatamente 99 e otimo (boundary inferior)', () => {
    expect(classifyAssiduidade(99)).toBe('otimo');
  });

  it('presenca 99.5 e otimo', () => {
    expect(classifyAssiduidade(99.5)).toBe('otimo');
  });
});

describe('classifyAssiduidade — faixa Bom (97 <= presenca < 99)', () => {
  it('presenca 98.99 e bom (boundary superior)', () => {
    expect(classifyAssiduidade(98.99)).toBe('bom');
  });

  it('presenca exatamente 97 e bom (boundary inferior)', () => {
    expect(classifyAssiduidade(97)).toBe('bom');
  });

  it('presenca 98 e bom', () => {
    expect(classifyAssiduidade(98)).toBe('bom');
  });
});

describe('classifyAssiduidade — faixa Regular (95 <= presenca < 97)', () => {
  it('presenca 96.99 e regular (boundary superior)', () => {
    expect(classifyAssiduidade(96.99)).toBe('regular');
  });

  it('presenca exatamente 95 e regular (boundary inferior)', () => {
    expect(classifyAssiduidade(95)).toBe('regular');
  });

  it('presenca 96 e regular', () => {
    expect(classifyAssiduidade(96)).toBe('regular');
  });
});

describe('classifyAssiduidade — faixa Ruim (presenca < 95)', () => {
  it('presenca 94.99 e ruim (boundary superior)', () => {
    expect(classifyAssiduidade(94.99)).toBe('ruim');
  });

  it('presenca 90 e ruim', () => {
    expect(classifyAssiduidade(90)).toBe('ruim');
  });

  it('presenca 0 e ruim', () => {
    expect(classifyAssiduidade(0)).toBe('ruim');
  });
});

describe('ASSIDUIDADE_CUTOFFS — constantes canonicas literais', () => {
  it('cutoff otimo e 99.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.otimo).toBe(99.0);
  });

  it('cutoff bom e 97.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.bom).toBe(97.0);
  });

  it('cutoff regular e 95.0', () => {
    expect(ASSIDUIDADE_CUTOFFS.regular).toBe(95.0);
  });
});
