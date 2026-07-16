// ROIP APP 9BOX — testes unit das formulas puras do Eixo X (ME-033).
//
// Cobrem as formulas canonicas §3.4 (Eixo X), §3.5 (bloco financeiro
// trimestral) e §3.6 (diagnostico economico) do DOC 03. Cada teste roda
// contra `src/lib/roiFormulas.ts` sem tocar o banco — funcoes puras,
// determinismo total. Boundary conditions: cap 150% (2 camadas), demanda=0
// com redistribuicao de pesos, Familia 6 (capacidade ociosa NULL),
// denominadores zero (null defensivo), thresholds de faixa.

import { describe, expect, it } from 'vitest';

import {
  computeAssiduidade,
  computeCapacidadeOciosa,
  computeDesempenhoVariavel,
  computeFaixaDesempenho,
  computeFaturamentoIdeal,
  computeFolhaPorcentagem,
  computeFolhaTotalMedia,
  computeIndiceDesempenhoMes,
  computeIndiceDesempenhoTrimestral,
  computeMediaTrimestral,
  computeParticipacao,
  computePercMetaAtingida,
  computeRetornoEstimado,
  computeRetornoPotencial,
  computeRoiEmpresa,
  computeRoiEstimado,
  computeRoiMuitoBom,
  computeScoreDesempenho,
  computeStatusDiagnostico,
  DESEMPENHO_CAP_FRACAO,
  SCORE_DESEMPENHO_CAP_PERCENTUAL,
} from '../../src/lib/roiFormulas';

// ============================================================
// §3.4 — Passo 1 — Assiduidade mensal
// ============================================================

describe('computeAssiduidade (§3.4 Passo 1)', () => {
  it('caso canonico: 22 dias uteis, 2 faltas -> 90.909...%', () => {
    const result = computeAssiduidade(22, 2);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(90.9091, 3);
  });

  it('faltas=0 -> 100%', () => {
    expect(computeAssiduidade(22, 0)).toBe(100);
  });

  it('faltas=diasUteis -> 0%', () => {
    expect(computeAssiduidade(22, 22)).toBe(0);
  });

  it('diasUteis=0 -> null (defensivo)', () => {
    expect(computeAssiduidade(0, 0)).toBeNull();
  });

  it('diasUteis negativo -> null (defensivo)', () => {
    expect(computeAssiduidade(-1, 0)).toBeNull();
  });
});

// ============================================================
// §3.4 — Passo 2 — Desempenho por variavel (cap 150% individual)
// ============================================================

describe('computeDesempenhoVariavel (§3.4 Passo 2)', () => {
  it('caso canonico: executado=demanda -> 1.0', () => {
    expect(computeDesempenhoVariavel(100, 100)).toBe(1.0);
  });

  it('caso canonico: executado=metade da demanda -> 0.5', () => {
    expect(computeDesempenhoVariavel(100, 50)).toBe(0.5);
  });

  it('caso canonico: executado=zero -> 0.0', () => {
    expect(computeDesempenhoVariavel(100, 0)).toBe(0.0);
  });

  it('cap 150%: executado=2x demanda -> 1.5 (nao 2.0)', () => {
    expect(computeDesempenhoVariavel(100, 200)).toBe(DESEMPENHO_CAP_FRACAO);
  });

  it('cap 150%: executado=1.5x demanda -> 1.5 exato no cap', () => {
    expect(computeDesempenhoVariavel(100, 150)).toBe(DESEMPENHO_CAP_FRACAO);
  });

  it('cap 150%: executado=1.49x demanda -> 1.49 (nao cap)', () => {
    expect(computeDesempenhoVariavel(100, 149)).toBeCloseTo(1.49, 6);
  });

  it('demanda=0 -> throw (precondicao violada)', () => {
    expect(() => computeDesempenhoVariavel(0, 100)).toThrow(/demanda deve ser > 0/);
  });

  it('demanda negativa -> throw (precondicao violada)', () => {
    expect(() => computeDesempenhoVariavel(-1, 100)).toThrow(/demanda deve ser > 0/);
  });
});

// ============================================================
// §3.4 — Passos 3+4 — Indice de desempenho mensal
// ============================================================

describe('computeIndiceDesempenhoMes (§3.4 Passos 3+4)', () => {
  it('caso canonico 4 variaveis com pesos 25/25/25/25 e desempenho 1.0 cada -> 1.0', () => {
    const vars = [
      { weight: 25, demanda: 100, executado: 100 },
      { weight: 25, demanda: 200, executado: 200 },
      { weight: 25, demanda: 300, executado: 300 },
      { weight: 25, demanda: 400, executado: 400 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBe(1.0);
  });

  it('caso canonico com pesos desiguais 40/30/20/10 e desempenhos variados', () => {
    // desempenho1=1.0, d2=0.5, d3=1.5(cap), d4=0.0
    // indice = 0.4*1.0 + 0.3*0.5 + 0.2*1.5 + 0.1*0.0 = 0.4 + 0.15 + 0.3 + 0 = 0.85
    const vars = [
      { weight: 40, demanda: 100, executado: 100 },
      { weight: 30, demanda: 100, executado: 50 },
      { weight: 20, demanda: 100, executado: 200 },
      { weight: 10, demanda: 100, executado: 0 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeCloseTo(0.85, 6);
  });

  it('variavel com weight=0 e ignorada (nao redistribui, nao conta)', () => {
    // vars ativas: 50/50 -> pesoEfetivo 0.5/0.5
    // indice = 0.5*1.0 + 0.5*0.5 = 0.75
    const vars = [
      { weight: 50, demanda: 100, executado: 100 },
      { weight: 50, demanda: 100, executado: 50 },
      { weight: 0, demanda: 100, executado: 999 }, // ignorada
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeCloseTo(0.75, 6);
  });

  it('variavel com demanda=0 tem peso redistribuido entre as ativas (Passo 3)', () => {
    // originais 50/50: uma demanda=0, uma demanda>0
    // redistribuido: 100% para a ativa -> pesoEfetivo=1.0
    // indice = 1.0 * 0.5 = 0.5
    const vars = [
      { weight: 50, demanda: 0, executado: 999 }, // redistribuida
      { weight: 50, demanda: 100, executado: 50 }, // desempenho=0.5
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeCloseTo(0.5, 6);
  });

  it('todas as variaveis com weight=0 -> null', () => {
    const vars = [
      { weight: 0, demanda: 100, executado: 100 },
      { weight: 0, demanda: 100, executado: 100 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeNull();
  });

  it('todas com demanda=0 -> null (motor propaga sem_demanda)', () => {
    const vars = [
      { weight: 50, demanda: 0, executado: 100 },
      { weight: 50, demanda: 0, executado: 100 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeNull();
  });

  it('todas com demanda=null -> null', () => {
    const vars = [
      { weight: 50, demanda: null, executado: 100 },
      { weight: 50, demanda: null, executado: 100 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeNull();
  });

  it('todas com executado=null -> null', () => {
    const vars = [
      { weight: 50, demanda: 100, executado: null },
      { weight: 50, demanda: 100, executado: null },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBeNull();
  });

  it('lista vazia -> null', () => {
    expect(computeIndiceDesempenhoMes([])).toBeNull();
  });

  it('cap 150% aplicado por variavel antes da media ponderada', () => {
    // uma variavel com executado=3x demanda: 3.0 clampeada a 1.5
    // uma variavel com executado=demanda: 1.0
    // pesos 50/50 -> indice = 0.5*1.5 + 0.5*1.0 = 1.25 (nao 2.0)
    const vars = [
      { weight: 50, demanda: 100, executado: 300 },
      { weight: 50, demanda: 100, executado: 100 },
    ];
    expect(computeIndiceDesempenhoMes(vars)).toBe(1.25);
  });
});

// ============================================================
// §3.4 — Passo 5 — Indice trimestral (media simples)
// ============================================================

describe('computeIndiceDesempenhoTrimestral (§3.4 Passo 5)', () => {
  it('caso canonico: 1.0 / 0.5 / 0.75 -> 0.75', () => {
    expect(computeIndiceDesempenhoTrimestral(1.0, 0.5, 0.75)).toBeCloseTo(0.75, 6);
  });

  it('mes1=null -> null', () => {
    expect(computeIndiceDesempenhoTrimestral(null, 0.5, 0.75)).toBeNull();
  });

  it('mes2=null -> null', () => {
    expect(computeIndiceDesempenhoTrimestral(1.0, null, 0.75)).toBeNull();
  });

  it('mes3=null -> null', () => {
    expect(computeIndiceDesempenhoTrimestral(1.0, 0.5, null)).toBeNull();
  });

  it('todos null -> null', () => {
    expect(computeIndiceDesempenhoTrimestral(null, null, null)).toBeNull();
  });
});

// ============================================================
// §3.4 — Passo 6 — scoreDesempenho (cap 150% final)
// ============================================================

describe('computeScoreDesempenho (§3.4 Passo 6)', () => {
  it('caso canonico: indice=1.0 -> 100.0', () => {
    expect(computeScoreDesempenho(1.0)).toBe(100.0);
  });

  it('caso canonico: indice=0.75 -> 75.0', () => {
    expect(computeScoreDesempenho(0.75)).toBe(75.0);
  });

  it('cap 150%: indice=1.5 exato -> 150.0', () => {
    expect(computeScoreDesempenho(1.5)).toBe(SCORE_DESEMPENHO_CAP_PERCENTUAL);
  });

  it('cap 150%: indice=2.0 -> 150.0 (clampeado)', () => {
    expect(computeScoreDesempenho(2.0)).toBe(SCORE_DESEMPENHO_CAP_PERCENTUAL);
  });

  it('indice=0 -> 0', () => {
    expect(computeScoreDesempenho(0)).toBe(0);
  });
});

// ============================================================
// §3.4 — Faixa de desempenho (thresholds default 60/85)
// ============================================================

describe('computeFaixaDesempenho (§3.4)', () => {
  const th_baixo = 60;
  const th_medio = 85;

  it('score < thresholdBaixo -> baixo', () => {
    expect(computeFaixaDesempenho(59.99, th_baixo, th_medio)).toBe('baixo');
    expect(computeFaixaDesempenho(0, th_baixo, th_medio)).toBe('baixo');
  });

  it('score = thresholdBaixo -> medio (borda inferior canonica)', () => {
    expect(computeFaixaDesempenho(60, th_baixo, th_medio)).toBe('medio');
  });

  it('score entre thresholdBaixo e thresholdMedio -> medio', () => {
    expect(computeFaixaDesempenho(72.5, th_baixo, th_medio)).toBe('medio');
  });

  it('score = thresholdMedio -> medio (borda superior canonica)', () => {
    expect(computeFaixaDesempenho(85, th_baixo, th_medio)).toBe('medio');
  });

  it('score > thresholdMedio -> alto', () => {
    expect(computeFaixaDesempenho(85.01, th_baixo, th_medio)).toBe('alto');
    expect(computeFaixaDesempenho(150, th_baixo, th_medio)).toBe('alto');
  });
});

// ============================================================
// §3.4 — Passo 7 — Capacidade ociosa
// ============================================================

describe('computeCapacidadeOciosa (§3.4 Passo 7)', () => {
  it('caso canonico: 4 variaveis com demanda variada', () => {
    // v1: goal=100, demanda=50 -> ociosa=0.5
    // v2: goal=100, demanda=100 -> ociosa=0 (demanda>=goal)
    // v3: goal=100, demanda=200 -> ociosa=0 (demanda>=goal)
    // v4: goal=100, demanda=75 -> ociosa=0.25
    // media = (0.5 + 0 + 0 + 0.25) / 4 = 0.1875 (18.75%)
    const vars = [
      { weight: 25, demanda: 50, goal: 100 },
      { weight: 25, demanda: 100, goal: 100 },
      { weight: 25, demanda: 200, goal: 100 },
      { weight: 25, demanda: 75, goal: 100 },
    ];
    expect(computeCapacidadeOciosa(vars, false)).toBeCloseTo(0.1875, 6);
  });

  it('Familia 6 -> null (nao calcula)', () => {
    const vars = [{ weight: 100, demanda: 5, goal: 5 }];
    expect(computeCapacidadeOciosa(vars, true)).toBeNull();
  });

  it('todas variaveis com weight=0 -> null', () => {
    const vars = [
      { weight: 0, demanda: 50, goal: 100 },
      { weight: 0, demanda: 50, goal: 100 },
    ];
    expect(computeCapacidadeOciosa(vars, false)).toBeNull();
  });

  it('variavel com weight=0 e ignorada na media', () => {
    // ativas: 2 (a de weight=0 e ignorada)
    // v1: goal=100, demanda=50 -> 0.5
    // v2: goal=100, demanda=100 -> 0
    // media = 0.5 / 2 = 0.25
    const vars = [
      { weight: 50, demanda: 50, goal: 100 },
      { weight: 50, demanda: 100, goal: 100 },
      { weight: 0, demanda: 0, goal: 100 }, // ignorada
    ];
    expect(computeCapacidadeOciosa(vars, false)).toBeCloseTo(0.25, 6);
  });

  it('demanda=null tratada como 0 (ociosa=100%)', () => {
    // demanda=null -> 0 -> ociosa = (100-0)/100 = 1.0
    const vars = [{ weight: 100, demanda: null, goal: 100 }];
    expect(computeCapacidadeOciosa(vars, false)).toBe(1.0);
  });
});

// ============================================================
// §3.5 — Bloco financeiro trimestral
// ============================================================

describe('computeMediaTrimestral (§3.5 Passo 1)', () => {
  it('caso canonico: 3000, 4000, 5000 -> 4000', () => {
    expect(computeMediaTrimestral(3000, 4000, 5000)).toBe(4000);
  });
});

describe('computeFolhaTotalMedia (§3.5 Passo 1)', () => {
  it('caso canonico: 3 employees + 2 C-levels', () => {
    // (2000+3000+4000) + (10000+8000) = 27000
    expect(computeFolhaTotalMedia([2000, 3000, 4000], [10000, 8000])).toBe(27000);
  });

  it('sem C-levels: soma so employees', () => {
    expect(computeFolhaTotalMedia([2000, 3000], [])).toBe(5000);
  });

  it('sem employees: soma so C-levels', () => {
    expect(computeFolhaTotalMedia([], [10000])).toBe(10000);
  });

  it('lista vazia -> 0', () => {
    expect(computeFolhaTotalMedia([], [])).toBe(0);
  });
});

describe('computeRetornoPotencial (§3.5 Passo 3)', () => {
  it('caso canonico: custo=5000, metaROI=3.5 -> 17500', () => {
    expect(computeRetornoPotencial(5000, 3.5)).toBe(17500);
  });
});

describe('computeParticipacao (§3.5 Passo 5)', () => {
  it('caso canonico: 17500 / 100000 -> 0.175', () => {
    expect(computeParticipacao(17500, 100000)).toBeCloseTo(0.175, 6);
  });

  it('faturamentoPotencial=0 -> null', () => {
    expect(computeParticipacao(17500, 0)).toBeNull();
  });

  it('faturamentoPotencial negativo -> null (defensivo)', () => {
    expect(computeParticipacao(17500, -1)).toBeNull();
  });
});

describe('computeRetornoEstimado (§3.5 Passo 6)', () => {
  it('caso canonico: fat=80000, participacao=0.175 -> 14000', () => {
    expect(computeRetornoEstimado(80000, 0.175)).toBe(14000);
  });
});

describe('computeRoiEstimado (§3.5 Passo 7)', () => {
  it('caso canonico: retorno=14000, custo=5000 -> 2.8', () => {
    expect(computeRoiEstimado(14000, 5000)).toBeCloseTo(2.8, 6);
  });

  it('custo=0 -> null', () => {
    expect(computeRoiEstimado(14000, 0)).toBeNull();
  });
});

describe('computePercMetaAtingida (§3.5 Passo 8)', () => {
  it('caso canonico: roi=2.8, meta=3.5 -> 80%', () => {
    expect(computePercMetaAtingida(2.8, 3.5)).toBeCloseTo(80, 6);
  });

  it('caso canonico: roi=4.0, meta=3.5 -> ~114.28%', () => {
    expect(computePercMetaAtingida(4.0, 3.5)).toBeCloseTo(114.2857, 3);
  });

  it('metaROI=0 -> null', () => {
    expect(computePercMetaAtingida(2.8, 0)).toBeNull();
  });
});

describe('computeRoiEmpresa (§3.5 Passo 9)', () => {
  it('caso canonico: fat=80000, folha=27000 -> ~2.963', () => {
    expect(computeRoiEmpresa(80000, 27000)).toBeCloseTo(2.963, 3);
  });

  it('folhaTotalMedia=0 -> null', () => {
    expect(computeRoiEmpresa(80000, 0)).toBeNull();
  });
});

// ============================================================
// §3.6 — Diagnostico economico
// ============================================================

describe('computeRoiMuitoBom (§3.6)', () => {
  it('caso canonico: min=2.0, max=4.0 -> 3.0', () => {
    expect(computeRoiMuitoBom(2.0, 4.0)).toBe(3.0);
  });
});

describe('computeFolhaPorcentagem (§3.6)', () => {
  it('caso canonico: folha=27000, fat=80000 -> 33.75%', () => {
    expect(computeFolhaPorcentagem(27000, 80000)).toBeCloseTo(33.75, 6);
  });

  it('faturamento=0 -> null', () => {
    expect(computeFolhaPorcentagem(27000, 0)).toBeNull();
  });
});

describe('computeStatusDiagnostico (§3.6 cascata canonica)', () => {
  const roiMin = 2.0;
  const roiMax = 4.0;
  // roiMuitoBom implicito = 3.0

  it('roiEmpresa >= roiSegmentoMaximo -> excelente', () => {
    expect(computeStatusDiagnostico(4.0, roiMin, roiMax)).toBe('excelente');
    expect(computeStatusDiagnostico(5.0, roiMin, roiMax)).toBe('excelente');
  });

  it('roiEmpresa >= roiMuitoBom e < roiSegmentoMaximo -> muito_bom', () => {
    expect(computeStatusDiagnostico(3.5, roiMin, roiMax)).toBe('muito_bom');
    expect(computeStatusDiagnostico(3.0, roiMin, roiMax)).toBe('muito_bom');
  });

  it('roiEmpresa >= roiSegmentoMinimo e < roiMuitoBom -> aceitavel', () => {
    expect(computeStatusDiagnostico(2.5, roiMin, roiMax)).toBe('aceitavel');
    expect(computeStatusDiagnostico(2.0, roiMin, roiMax)).toBe('aceitavel');
  });

  it('roiEmpresa < roiSegmentoMinimo -> critico', () => {
    expect(computeStatusDiagnostico(1.99, roiMin, roiMax)).toBe('critico');
    expect(computeStatusDiagnostico(0, roiMin, roiMax)).toBe('critico');
  });

  it('roiSegmentoMinimo=null -> sem_referencia', () => {
    expect(computeStatusDiagnostico(3.0, null, roiMax)).toBe('sem_referencia');
  });

  it('roiSegmentoMaximo=null -> sem_referencia', () => {
    expect(computeStatusDiagnostico(3.0, roiMin, null)).toBe('sem_referencia');
  });

  it('ambos null -> sem_referencia', () => {
    expect(computeStatusDiagnostico(3.0, null, null)).toBe('sem_referencia');
  });
});

describe('computeFaturamentoIdeal (§3.6)', () => {
  it('caso canonico: folha=27000, roiMuitoBom=3.0 -> 81000', () => {
    expect(computeFaturamentoIdeal(27000, 3.0)).toBe(81000);
  });
});
