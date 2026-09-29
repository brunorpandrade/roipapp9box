// ROIP APP 9BOX — teste ME-080d Onda 1d reconvertido pela retomada
// canonica ME-PAINEL-PLANILHAS-OPERACIONAIS.
//
// Historia canonica preservada: pos-S502 a ME-080d Onda 1d recolheu
// os cards "Resumo dashboard" e "Evolucao trimestral" como "Em
// desenvolvimento" (D11=B), com botao desabilitado, porque os
// handlers apontavam para a rota errada (baixavam snapshot 9-Box no
// lugar do xlsx esperado). O debito D-REL-RESUMO-EVOLUCAO foi
// nomeado para um bloco B2/B3 futuro.
//
// Bloco atual (ME-PAINEL-PLANILHAS-OPERACIONAIS): backend canonico
// (`exports.getResumoDashboard` §13.3 + `exports.getEvolucaoTrimestral`
// §13.4) ja existente e coberto por `spreadsheets-router.test.ts`. O
// client foi religado com um branch dedicado no `handleDownload` que
// invoca as novas actions `generateResumoDashboardXlsx` e
// `generateEvolucaoTrimestralXlsx` — extrai base64 → blob →
// download local com o filename canonico. Debito D-REL-RESUMO-EVOLUCAO
// canonicamente quitado.
//
// Este teste, originalmente cobrindo o recolhimento D11=B, foi
// reconvertido para cobrir a religacao canonica: assercao de que os
// 2 cards estao ativos com subtitle §12.4 e buttonLabel canonico, e
// que os 4 demais cards da §12.3 nao foram tocados pela retomada.
// Estrategia canonica preservada: assercao sobre `CARD_DEFS` (funcao
// pura).

import { describe, expect, it } from 'vitest';

// ME-B9-CR (L125): CARD_DEFS migrado para o local compartilhado.
import { CARD_DEFS } from '../../src/components/central-relatorios/internals';

describe('ME-080d Onda 1d reconvertido — retomada ME-PAINEL-PLANILHAS-OPERACIONAIS', () => {
  it('resumo_dashboard tem disabled=false (religado)', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card).toBeDefined();
    expect(card?.disabled).toBe(false);
  });

  it('resumo_dashboard tem buttonLabel "Baixar planilha"', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card?.buttonLabel).toBe('Baixar planilha');
  });

  it('resumo_dashboard subtitle canonico §12.4 (sem mencao a "Em desenvolvimento")', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card?.subtitle).toBe('Planilha xlsx · 1 trimestre');
    expect(card?.subtitle).not.toContain('Em desenvolvimento');
  });

  it('evolucao_trimestral tem disabled=false (religado)', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card).toBeDefined();
    expect(card?.disabled).toBe(false);
  });

  it('evolucao_trimestral tem buttonLabel "Baixar planilha"', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card?.buttonLabel).toBe('Baixar planilha');
  });

  it('evolucao_trimestral subtitle canonico §12.4 (sem mencao a "Em desenvolvimento")', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card?.subtitle).toBe('Planilha xlsx · até 4 trimestres');
    expect(card?.subtitle).not.toContain('Em desenvolvimento');
  });

  it('os 4 cards restantes NAO foram tocados pela retomada', () => {
    const funcionais = ['relatorio_executivo', 'snapshot_9box', 'board_deck', 'clima_engajamento'];
    for (const id of funcionais) {
      const card = CARD_DEFS.find((c) => c.id === id);
      expect(card).toBeDefined();
      expect(card?.disabled).toBe(false);
    }
  });

  it('CARD_DEFS mantem exatamente 6 cards canonicos (§12.3)', () => {
    expect(CARD_DEFS).toHaveLength(6);
  });

  it('buttonLabels dos cards nao-tocados preservados bit-exact', () => {
    expect(CARD_DEFS.find((c) => c.id === 'relatorio_executivo')?.buttonLabel).toBe(
      'Gerar relatório',
    );
    expect(CARD_DEFS.find((c) => c.id === 'snapshot_9box')?.buttonLabel).toBe('Baixar PDF');
    expect(CARD_DEFS.find((c) => c.id === 'board_deck')?.buttonLabel).toBe('Baixar PDF');
    expect(CARD_DEFS.find((c) => c.id === 'clima_engajamento')?.buttonLabel).toBe('Baixar PDF');
  });
});
