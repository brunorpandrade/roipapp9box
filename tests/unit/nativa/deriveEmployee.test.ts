// ROIP APP 9BOX — testes unit das derivacoes de employee (ME-068).
//
// Cobrem invariantes canonicas bit-exact:
//   - dataNascimento derivada deterministicamente do id.
//   - dataNascimento rejeita string invalida (fix TS18048).
//   - Rota canonica isRH/isLider por cargo/nome.

import { describe, expect, it } from 'vitest';

import {
  deriveDataNascimento,
  deriveIsLider,
  deriveIsRH,
  deriveJobFamily,
  deriveNivelHierarquico,
  deriveSenioridade,
} from '../../../src/db/seed/nativa/deriveEmployee';

describe('deriveDataNascimento', () => {
  it('deriva canonicamente: idade = 26 + (id % 22)', () => {
    // id=1: idade = 27; admissao 2020-06-15 → nascimento 1993-06-15
    expect(deriveDataNascimento(1, '2020-06-15')).toBe('1993-06-15');
    // id=22: idade = 26 + 0 = 26; admissao 2015-01-10 → 1989-01-10
    expect(deriveDataNascimento(22, '2015-01-10')).toBe('1989-01-10');
    // id=23: idade = 26 + 1 = 27
    expect(deriveDataNascimento(23, '2015-01-10')).toBe('1988-01-10');
  });

  it('trata 29/02 → 28/02 em ano bissexto', () => {
    // id=1: idade 27; admissao 29/02/2024 → nasc 28/02/1997 (evita edge case)
    expect(deriveDataNascimento(1, '2024-02-29')).toBe('1997-02-28');
  });

  it('rejeita string invalida (fix TS18048)', () => {
    expect(() => deriveDataNascimento(1, 'abc')).toThrow(/dataAdmissao invalida/);
    expect(() => deriveDataNascimento(1, '2020-06')).toThrow(/dataAdmissao invalida/);
    expect(() => deriveDataNascimento(1, '')).toThrow(/dataAdmissao invalida/);
  });
});

describe('deriveIsLider / deriveIsRH', () => {
  it('lider_f6 → isLider=true; demais cargos → false', () => {
    expect(deriveIsLider('lider_f6')).toBe(true);
    expect(deriveIsLider('op_pleno')).toBe(false);
    expect(deriveIsLider('anl_fin_p')).toBe(false);
  });

  it('Renata Lima, Marina Lopes e Tatiane Freitas sao RH; demais → false', () => {
    expect(deriveIsRH('Renata Lima')).toBe(true);
    expect(deriveIsRH('Marina Lopes')).toBe(true);
    expect(deriveIsRH('Tatiane Freitas')).toBe(true);
    expect(deriveIsRH('Juliana Freitas')).toBe(false);
    expect(deriveIsRH('Carlos Silva')).toBe(false);
  });
});

describe('deriveJobFamily / deriveNivelHierarquico / deriveSenioridade', () => {
  it('lider_f6 → lideranca_gestao + tatico + pleno (default canonico)', () => {
    expect(deriveJobFamily('lider_f6')).toBe('lideranca_gestao');
    expect(deriveNivelHierarquico('lider_f6')).toBe('tatico');
    expect(deriveSenioridade('lider_f6')).toBe('pleno');
  });

  it('op_pleno → producao_operacoes + operacional + pleno', () => {
    expect(deriveJobFamily('op_pleno')).toBe('producao_operacoes');
    expect(deriveNivelHierarquico('op_pleno')).toBe('operacional');
    expect(deriveSenioridade('op_pleno')).toBe('pleno');
  });
});
