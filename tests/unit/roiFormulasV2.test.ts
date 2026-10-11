// ROIP APP 9BOX — testes unit dos helpers v2 do motor de ROI (ME-1.2 /
// emenda ME-1.1 do DOC 03 §3.5-§3.6).
//
// Cobertura isolada do delta v2 — nao duplica a cobertura dos helpers v1
// mantidos em `roiFormulas.test.ts`. Boundary conditions canonicas:
//   - computeFolhaProdutivaMedia: lista vazia, lista com valores.
//   - computeParticipacaoBase: faturamentoPotencial > 0, <= 0 -> null.
//   - computeScoreMedioPonderado: P_score vazio -> null; soma de
//     participacoes <= 0 -> null; media ponderada canonica.
//   - computeFatorModerador: scoreMedio > 0 (razao); scoreMedio = 0
//     (neutro fallback); score = 0 com scoreMedio > 0 (fator 0).
//   - computeParticipacaoAjustada: produto participacaoBase * fator.
//   - FATOR_MODERADOR_NEUTRO = 1.00.
//   - Alias deprecated computeParticipacao delega a computeParticipacaoBase.
//
// Prova canonica das duas identidades (§3.5 ME-1.1) em ambiente isolado
// (sem banco): monta populacao P sintetica, roda a cadeia Passo 5->10 e
// verifica as duas identidades com tolerancia de ponto flutuante.

import { describe, expect, it } from 'vitest';

import {
  computeFatorModerador,
  computeFolhaProdutivaMedia,
  computeMediaTrimestral,
  computeParticipacao,
  computeParticipacaoAjustada,
  computeParticipacaoBase,
  computePercMetaAtingida,
  computeRetornoEstimado,
  computeRetornoPotencial,
  computeRoiEmpresa,
  computeRoiEstimado,
  computeScoreMedioPonderado,
  FATOR_MODERADOR_NEUTRO,
  type ScoreParticipacaoPair,
} from '../../src/lib/roiFormulas';

// ============================================================
// Constante canonica
// ============================================================

describe('FATOR_MODERADOR_NEUTRO (ME-1.1 S531)', () => {
  it('canonicamente igual a 1.00', () => {
    expect(FATOR_MODERADOR_NEUTRO).toBe(1.0);
  });
});

// ============================================================
// computeFolhaProdutivaMedia (§3.5 Passo 1, S529)
// ============================================================

describe('computeFolhaProdutivaMedia (§3.5 Passo 1, S529)', () => {
  it('lista vazia -> 0', () => {
    expect(computeFolhaProdutivaMedia([])).toBe(0);
  });

  it('soma simples dos custos da populacao P', () => {
    expect(computeFolhaProdutivaMedia([1000, 2000, 3500])).toBe(6500);
  });

  it('canonicamente NAO inclui custos de C-levels (caller responsavel pelo filtro)', () => {
    // helper e puro: aceita o array ja filtrado pelo caller. A regra de
    // nao incluir C-levels e canonica no caller (motor.ts). Teste de
    // contrato: o resultado e literal da soma do que foi passado.
    const custosEmP = [1000, 2000, 3500];
    const custosCLevels = [10000, 20000]; // nunca passados aqui
    const resultado = computeFolhaProdutivaMedia(custosEmP);
    expect(resultado).toBe(6500);
    expect(resultado).not.toBe(6500 + custosCLevels.reduce((a, b) => a + b, 0));
  });

  it('aceita valores decimais sem perda', () => {
    const custos = [1000.5, 2000.25, 3500.75];
    expect(computeFolhaProdutivaMedia(custos)).toBeCloseTo(6501.5, 2);
  });
});

// ============================================================
// computeParticipacaoBase (§3.5 Passo 5)
// ============================================================

describe('computeParticipacaoBase (§3.5 Passo 5)', () => {
  it('caso canonico: retornoPotencial 300 / faturamentoPotencial 1000 = 0.30', () => {
    expect(computeParticipacaoBase(300, 1000)).toBe(0.3);
  });

  it('faturamentoPotencial = 0 -> null', () => {
    expect(computeParticipacaoBase(300, 0)).toBeNull();
  });

  it('faturamentoPotencial < 0 -> null', () => {
    expect(computeParticipacaoBase(300, -1)).toBeNull();
  });

  it('retornoPotencial = 0 -> participacaoBase = 0', () => {
    expect(computeParticipacaoBase(0, 1000)).toBe(0);
  });

  it('soma das participacoes de uma populacao canonica = 1', () => {
    const retornos = [300, 500, 200];
    const total = retornos.reduce((a, b) => a + b, 0);
    const participacoes = retornos.map((r) => computeParticipacaoBase(r, total));
    expect(participacoes.every((p) => p !== null)).toBe(true);
    const soma = (participacoes as number[]).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 10);
  });
});

// ============================================================
// computeParticipacao (alias deprecated — compatibilidade v1)
// ============================================================

describe('computeParticipacao (alias deprecated)', () => {
  it('resultado identico ao computeParticipacaoBase', () => {
    expect(computeParticipacao(300, 1000)).toBe(computeParticipacaoBase(300, 1000));
  });

  it('null em caso de borda (faturamentoPotencial = 0)', () => {
    expect(computeParticipacao(300, 0)).toBeNull();
    expect(computeParticipacaoBase(300, 0)).toBeNull();
  });
});

// ============================================================
// computeScoreMedioPonderado (§3.5 Passo 6)
// ============================================================

describe('computeScoreMedioPonderado (§3.5 Passo 6, S530)', () => {
  it('P_score vazio -> null (caller aplica fallback neutro)', () => {
    expect(computeScoreMedioPonderado([])).toBeNull();
  });

  it('P_score com uma pessoa: media ponderada = score daquela pessoa', () => {
    const pairs: ScoreParticipacaoPair[] = [{ participacaoBase: 0.5, scoreDesempenho: 80 }];
    expect(computeScoreMedioPonderado(pairs)).toBe(80);
  });

  it('tres colaboradores com participacoes iguais: media simples dos scores', () => {
    const pairs: ScoreParticipacaoPair[] = [
      { participacaoBase: 0.3333, scoreDesempenho: 60 },
      { participacaoBase: 0.3333, scoreDesempenho: 80 },
      { participacaoBase: 0.3333, scoreDesempenho: 100 },
    ];
    // (0.3333*60 + 0.3333*80 + 0.3333*100) / (0.3333+0.3333+0.3333)
    // = (0.3333 * (60+80+100)) / (0.3333 * 3) = (60+80+100)/3 = 80
    const resultado = computeScoreMedioPonderado(pairs);
    expect(resultado).not.toBeNull();
    expect(resultado as number).toBeCloseTo(80, 4);
  });

  it('ponderada canonica: colaborador de maior participacao puxa a media', () => {
    const pairs: ScoreParticipacaoPair[] = [
      { participacaoBase: 0.1, scoreDesempenho: 50 },
      { participacaoBase: 0.9, scoreDesempenho: 100 },
    ];
    // (0.1*50 + 0.9*100) / (0.1+0.9) = (5+90)/1.0 = 95
    expect(computeScoreMedioPonderado(pairs) as number).toBeCloseTo(95, 4);
  });

  it('todos os scores iguais a 0 -> media 0 (nao null; caller trata fallback)', () => {
    const pairs: ScoreParticipacaoPair[] = [
      { participacaoBase: 0.5, scoreDesempenho: 0 },
      { participacaoBase: 0.5, scoreDesempenho: 0 },
    ];
    expect(computeScoreMedioPonderado(pairs)).toBe(0);
  });

  it('soma de participacoes <= 0 (defensivo) -> null', () => {
    const pairs: ScoreParticipacaoPair[] = [
      { participacaoBase: 0, scoreDesempenho: 50 },
      { participacaoBase: 0, scoreDesempenho: 100 },
    ];
    expect(computeScoreMedioPonderado(pairs)).toBeNull();
  });
});

// ============================================================
// computeFatorModerador (§3.5 Passo 6, S530+S531)
// ============================================================

describe('computeFatorModerador (§3.5 Passo 6, S530)', () => {
  it('P_score canonico: score 100, media 80 -> fator 1.25', () => {
    expect(computeFatorModerador(100, 80)).toBeCloseTo(1.25, 6);
  });

  it('P_score canonico: score 60, media 80 -> fator 0.75', () => {
    expect(computeFatorModerador(60, 80)).toBeCloseTo(0.75, 6);
  });

  it('score igual a media -> fator 1.00 (sem ajuste)', () => {
    expect(computeFatorModerador(80, 80)).toBe(1);
  });

  it('score = 0 com media > 0 -> fator 0 (leitura honesta de nao-entrega)', () => {
    expect(computeFatorModerador(0, 80)).toBe(0);
  });

  it('scoreMedioPonderado = 0 -> fallback neutro 1.00 (cenario degenerado)', () => {
    expect(computeFatorModerador(50, 0)).toBe(FATOR_MODERADOR_NEUTRO);
  });

  it('scoreMedioPonderado < 0 (defensivo) -> fallback neutro 1.00', () => {
    expect(computeFatorModerador(50, -1)).toBe(FATOR_MODERADOR_NEUTRO);
  });
});

// ============================================================
// computeParticipacaoAjustada (§3.5 Passo 7)
// ============================================================

describe('computeParticipacaoAjustada (§3.5 Passo 7)', () => {
  it('produto participacaoBase * fatorModerador', () => {
    expect(computeParticipacaoAjustada(0.3, 1.25)).toBeCloseTo(0.375, 6);
  });

  it('P_neutro (fator 1.00): participacaoAjustada = participacaoBase', () => {
    expect(computeParticipacaoAjustada(0.25, FATOR_MODERADOR_NEUTRO)).toBe(0.25);
  });

  it('fator 0 (score=0 com media>0): participacaoAjustada = 0', () => {
    expect(computeParticipacaoAjustada(0.3, 0)).toBe(0);
  });
});

// ============================================================
// Prova canonica integrada das duas identidades (§3.5 ME-1.1)
// ============================================================

describe('Identidades canonicas v2 (§3.5 ME-1.1) — prova integrada em memoria', () => {
  // Populacao P sintetica: 4 colaboradores canonicos com perfis
  // contrastantes. Trimestre: faturamento constante R$ 1.000.000/mes
  // (media = R$ 1.000.000). MetaROI = 2.5 para operacional, 3.0 para
  // tatico. Scores variam para exercitar o moderador.
  const faturamentoPorMes = [1_000_000, 1_000_000, 1_000_000];
  const faturamentoMedio = computeMediaTrimestral(
    faturamentoPorMes[0] as number,
    faturamentoPorMes[1] as number,
    faturamentoPorMes[2] as number,
  );

  interface Colab {
    id: string;
    custoMedio: number;
    metaROI: number;
    scoreDesempenho: number | null; // null = P_neutro
  }

  const populacao: Colab[] = [
    { id: 'A-high', custoMedio: 10_000, metaROI: 2.5, scoreDesempenho: 110 },
    { id: 'B-mid', custoMedio: 15_000, metaROI: 2.5, scoreDesempenho: 80 },
    { id: 'C-low', custoMedio: 20_000, metaROI: 3.0, scoreDesempenho: 55 },
    { id: 'D-neutro', custoMedio: 25_000, metaROI: 3.0, scoreDesempenho: null },
  ];

  // Passo 1: folhaProdutivaMedia (so colaboradores em P).
  const folhaProdutivaMedia = computeFolhaProdutivaMedia(populacao.map((c) => c.custoMedio));

  // Passo 3: retornoPotencial individual.
  const retornosPotenciais = populacao.map((c) => computeRetornoPotencial(c.custoMedio, c.metaROI));

  // Passo 4: faturamentoPotencial.
  const faturamentoPotencial = retornosPotenciais.reduce((a, b) => a + b, 0);

  // Passo 5: participacaoBase (soma canonica = 1).
  const participacoesBase = retornosPotenciais.map(
    (r) => computeParticipacaoBase(r, faturamentoPotencial) as number,
  );

  // Passo 6: scoreMedioPonderado sobre P_score.
  const pScorePairs: ScoreParticipacaoPair[] = populacao
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.scoreDesempenho !== null)
    .map((x) => ({
      participacaoBase: participacoesBase[x.i] as number,
      scoreDesempenho: x.c.scoreDesempenho as number,
    }));
  const scoreMedio = computeScoreMedioPonderado(pScorePairs);

  // Passo 7: fatorModerador + participacao ajustada por colaborador.
  const fatores = populacao.map((c) => {
    if (c.scoreDesempenho === null) {
      return FATOR_MODERADOR_NEUTRO;
    }
    return computeFatorModerador(c.scoreDesempenho, scoreMedio as number);
  });
  const participacoes = participacoesBase.map((pb, i) =>
    computeParticipacaoAjustada(pb, fatores[i] as number),
  );

  // Passo 8: retornoEstimado individual.
  const retornosEstimados = participacoes.map((p) => computeRetornoEstimado(faturamentoMedio, p));

  // Passo 9: roiEstimado individual.
  const roisEstimados = populacao.map(
    (c, i) => computeRoiEstimado(retornosEstimados[i] as number, c.custoMedio) as number,
  );

  // Passo 11: roiEmpresa pela identidade do motor.
  const roiEmpresa = computeRoiEmpresa(faturamentoMedio, folhaProdutivaMedia) as number;

  it('scoreMedioPonderado foi calculado sobre P_score (3 colaboradores)', () => {
    expect(pScorePairs.length).toBe(3);
    expect(scoreMedio).not.toBeNull();
  });

  it('Σ participacaoBase = 1 (propriedade canonica do Passo 5)', () => {
    const soma = participacoesBase.reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it('Σ participacao (ajustada) = 1 (propriedade estrutural canonica do Passo 7)', () => {
    const soma = participacoes.reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it('Prova 1 canonica: Σ retornoEstimado_i = faturamentoMedioTrimestral', () => {
    const somaRetornos = retornosEstimados.reduce((a, b) => a + b, 0);
    expect(somaRetornos).toBeCloseTo(faturamentoMedio, 4);
  });

  it('Prova 2 canonica: custoMedio_i × roiEstimado_i = retornoEstimado_i por colaborador', () => {
    for (let i = 0; i < populacao.length; i++) {
      const colab = populacao[i] as Colab;
      const prod = colab.custoMedio * (roisEstimados[i] as number);
      expect(prod).toBeCloseTo(retornosEstimados[i] as number, 4);
    }
  });

  it('Identidade do motor: roiEmpresa = Σ retornoEstimado / Σ custoMedio sobre P', () => {
    const somaRetornos = retornosEstimados.reduce((a, b) => a + b, 0);
    const somaCustos = populacao.reduce((acc, c) => acc + c.custoMedio, 0);
    const roiPorMediaPonderada = somaRetornos / somaCustos;
    expect(roiEmpresa).toBeCloseTo(roiPorMediaPonderada, 10);
  });

  it('P_neutro (colaborador D) tem fator 1.00 e participacao = participacaoBase', () => {
    const idxD = 3;
    expect(fatores[idxD]).toBe(FATOR_MODERADOR_NEUTRO);
    expect(participacoes[idxD]).toBeCloseTo(participacoesBase[idxD] as number, 10);
  });

  it('P_score alto (A, score 110 > media): fatorModerador > 1 (puxa participacao pra cima)', () => {
    const idxA = 0;
    expect(fatores[idxA] as number).toBeGreaterThan(1);
    expect(participacoes[idxA] as number).toBeGreaterThan(participacoesBase[idxA] as number);
  });

  it('P_score baixo (C, score 55 < media): fatorModerador < 1 (reduz participacao)', () => {
    const idxC = 2;
    expect(fatores[idxC] as number).toBeLessThan(1);
    expect(participacoes[idxC] as number).toBeLessThan(participacoesBase[idxC] as number);
  });

  it('percMetaAtingida_i = (roiEstimado_i / metaROI_i) * 100 por colaborador', () => {
    for (let i = 0; i < populacao.length; i++) {
      const colab = populacao[i] as Colab;
      const esperado = ((roisEstimados[i] as number) / colab.metaROI) * 100;
      const calculado = computePercMetaAtingida(roisEstimados[i] as number, colab.metaROI);
      expect(calculado).toBeCloseTo(esperado, 10);
    }
  });
});

// ============================================================
// Fallback geral canonico (scoreMedioPonderado <= 0)
// ============================================================

describe('Fallback neutro geral canonico (scoreMedioPonderado = 0)', () => {
  it('todos os scores de P_score iguais a 0 -> todos os fatores sao 1.00', () => {
    const pairs: ScoreParticipacaoPair[] = [
      { participacaoBase: 0.4, scoreDesempenho: 0 },
      { participacaoBase: 0.6, scoreDesempenho: 0 },
    ];
    const scoreMedio = computeScoreMedioPonderado(pairs);
    expect(scoreMedio).toBe(0);
    // Cada colaborador: fator = computeFatorModerador(0, 0) -> neutro.
    const fator = computeFatorModerador(0, scoreMedio as number);
    expect(fator).toBe(FATOR_MODERADOR_NEUTRO);
  });

  it('P_score vazio (todos neutro) -> motor deve aplicar fator 1.00 a todos', () => {
    // Caso canonico: nenhum colaborador tem scoreDesempenho.
    // computeScoreMedioPonderado([]) retorna null; o motor interpreta
    // como fallback geral e aplica fator 1.00 a todo P.
    expect(computeScoreMedioPonderado([])).toBeNull();
    // Teste cobre o helper; o motor (`applyRoiV2Pass`) e testado por
    // integration test com banco real.
  });
});
