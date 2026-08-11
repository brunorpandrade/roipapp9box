// ROIP APP 9BOX — teste unitario ME-075 internals `familias` (D086).
//
// Cobre canonicamente bit-exact os helpers puros do
// `familias/internals.ts`:
//   1. Contagem canonica bit-exact das 6 familias hard-coded.
//   2. Familia 6 (`lideranca_gestao`) marcada como `estrutural: true`.
//   3. Nomes e unidades hard-coded canonicos bit-exact §13.1 Aba 2
//      mockup linha 352.
//   4. `buildInitialFamiliesState` merge de persisted + defaults.
//   5. `sumWeights` e `isFamiliaSavable` — logica canonica bit-exact.

import { describe, expect, it } from 'vitest';

import {
  buildInitialFamiliesState,
  FAMILIAS_HARDCODED,
  isFamiliaSavable,
  LIDERANCA_GESTAO_INDEX,
  sumWeights,
} from '../../src/app/super-admin/empresa/[id]/familias/internals';

describe('FAMILIAS_HARDCODED (§13.1 Aba 2)', () => {
  it('contem exatamente 6 familias canonicas bit-exact', () => {
    expect(FAMILIAS_HARDCODED).toHaveLength(6);
  });

  it('cada familia tem exatamente 4 variaveis defaults', () => {
    for (const f of FAMILIAS_HARDCODED) {
      expect(f.defaults).toHaveLength(4);
      // Indices canonicos bit-exact {0,1,2,3}.
      expect(f.defaults.map((d) => d.variableIndex).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('familia 6 lideranca_gestao e estrutural (LIDERANCA_GESTAO_INDEX = 5)', () => {
    const lg = FAMILIAS_HARDCODED[LIDERANCA_GESTAO_INDEX];
    expect(lg).toBeDefined();
    expect(lg?.jobFamily).toBe('lideranca_gestao');
    expect(lg?.estrutural).toBe(true);
  });

  it('demais familias sao nao-estruturais', () => {
    for (let i = 0; i < FAMILIAS_HARDCODED.length; i += 1) {
      if (i === LIDERANCA_GESTAO_INDEX) {
        continue;
      }
      expect(FAMILIAS_HARDCODED[i]?.estrutural).toBe(false);
    }
  });

  it('nomes canonicos bit-exact familia 6 (mockup linha 352)', () => {
    const lg = FAMILIAS_HARDCODED[LIDERANCA_GESTAO_INDEX];
    const names = lg?.defaults.map((d) => d.name) ?? [];
    expect(names).toEqual([
      'Organização e produtividade',
      'Responsabilização pelos resultados',
      'Gestão da equipe',
      'Motivação e engajamento',
    ]);
    const units = lg?.defaults.map((d) => d.unit) ?? [];
    expect(units).toEqual(['pontos (1-5)', 'pontos (1-5)', 'pontos (1-5)', 'pontos (1-5)']);
  });

  it('soma dos pesos default de cada familia = 100', () => {
    for (const f of FAMILIAS_HARDCODED) {
      const total = f.defaults.reduce((acc, d) => acc + d.weight, 0);
      expect(total).toBe(100);
    }
  });

  it('cobre bit-exact os 6 valores canonicos do enum jobFamily', () => {
    const values = FAMILIAS_HARDCODED.map((f) => f.jobFamily).sort();
    expect(values).toEqual([
      'administrativo_suporte',
      'atendimento_relacionamento',
      'lideranca_gestao',
      'producao_operacoes',
      'tecnico_especialista',
      'vendas_comercial',
    ]);
  });
});

describe('buildInitialFamiliesState', () => {
  it('usa defaults hard-coded quando nada persistido', () => {
    const state = buildInitialFamiliesState([]);
    expect(state).toHaveLength(6);
    expect(state[0]?.variables).toHaveLength(4);
    // Peso default canonico 25.
    expect(state[0]?.variables[0]?.weight).toBe(25);
  });

  it('usa persistido quando existe (familia nao-estrutural)', () => {
    const state = buildInitialFamiliesState([
      {
        jobFamily: 'vendas_comercial',
        variableIndex: 0,
        variableName: 'Custom Receita',
        unit: 'USD',
        weight: '40.00',
      },
    ]);
    const v0 = state[0]?.variables[0];
    expect(v0?.variableName).toBe('Custom Receita');
    expect(v0?.unit).toBe('USD');
    expect(v0?.weight).toBe(40);
    // As demais variaveis da mesma familia continuam com default.
    expect(state[0]?.variables[1]?.weight).toBe(25);
  });

  it('familia 6 estrutural preserva nomes/unidades hard-coded mesmo se persistido', () => {
    const state = buildInitialFamiliesState([
      {
        jobFamily: 'lideranca_gestao',
        variableIndex: 0,
        variableName: 'NOME MALICIOSO',
        unit: 'UNIDADE MALICIOSA',
        weight: '35.00',
      },
    ]);
    const lg = state[LIDERANCA_GESTAO_INDEX];
    const v0 = lg?.variables[0];
    // Nome/unidade hard-coded canonicos bit-exact preservados.
    expect(v0?.variableName).toBe('Organização e produtividade');
    expect(v0?.unit).toBe('pontos (1-5)');
    // Peso persistido reflete.
    expect(v0?.weight).toBe(35);
  });
});

describe('sumWeights + isFamiliaSavable', () => {
  it('soma exata dos pesos', () => {
    expect(sumWeights([{ weight: 25 }, { weight: 25 }, { weight: 25 }, { weight: 25 }])).toBe(100);
    expect(sumWeights([{ weight: 10 }, { weight: 20 }, { weight: 30 }, { weight: 40 }])).toBe(100);
  });

  it('savable quando soma exata 100', () => {
    expect(isFamiliaSavable([{ weight: 25 }, { weight: 25 }, { weight: 25 }, { weight: 25 }])).toBe(
      true,
    );
  });

  it('savable com tolerancia 0.01', () => {
    expect(
      isFamiliaSavable([{ weight: 25.003 }, { weight: 25 }, { weight: 25 }, { weight: 24.997 }]),
    ).toBe(true);
  });

  it('nao-savable quando soma != 100 alem da tolerancia', () => {
    expect(isFamiliaSavable([{ weight: 20 }, { weight: 20 }, { weight: 20 }, { weight: 20 }])).toBe(
      false,
    );
    expect(isFamiliaSavable([{ weight: 30 }, { weight: 30 }, { weight: 30 }, { weight: 30 }])).toBe(
      false,
    );
  });
});
