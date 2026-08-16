// ROIP APP 9BOX — teste de integração ME-080d Onda 1d.
//
// Cobre bit-exact D11=B — rotular "Resumo dashboard" e "Evolução
// trimestral" como cards "Em desenvolvimento" com botão desabilitado.
//
// Contexto canonico: descoberta pos-S502 desta ME. Os dois cards
// nao possuem rota de download PDF dedicada — usavam a rota do
// `snapshot_9box` com parametro `type=` que o backend ignora,
// baixando snapshot 9-Box no lugar. Bug funcional grave. Sem
// template PDF dedicado (escopo B2/B3), esconder botao e a decisao
// honesta. Debito nomeado D-REL-RESUMO-EVOLUCAO registrado.
//
// Estrategia canonica: assercao sobre `CARD_DEFS` (funcao pura).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @stylistic/max-len -- path longo por App Router
import { CARD_DEFS } from '../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/internals';

describe('ME-080d Onda 1d — CARD_DEFS D11=B (Resumo + Evolucao "Em desenvolvimento")', () => {
  it('resumo_dashboard tem disabled=true', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card).toBeDefined();
    expect(card?.disabled).toBe(true);
  });

  it('resumo_dashboard tem buttonLabel "Em breve"', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card?.buttonLabel).toBe('Em breve');
  });

  it('resumo_dashboard subtitle atualizado (sem "Planilha xlsx" mentiroso)', () => {
    const card = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
    expect(card?.subtitle).not.toContain('Planilha xlsx');
    expect(card?.subtitle).toContain('Em desenvolvimento');
  });

  it('evolucao_trimestral tem disabled=true', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card).toBeDefined();
    expect(card?.disabled).toBe(true);
  });

  it('evolucao_trimestral tem buttonLabel "Em breve"', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card?.buttonLabel).toBe('Em breve');
  });

  it('evolucao_trimestral subtitle atualizado', () => {
    const card = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');
    expect(card?.subtitle).not.toContain('Planilha xlsx');
    expect(card?.subtitle).toContain('Em desenvolvimento');
  });

  it('os 4 cards restantes NAO estao disabled (permanecem funcionais)', () => {
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

  it('buttonLabels dos cards funcionais preservados bit-exact', () => {
    expect(CARD_DEFS.find((c) => c.id === 'relatorio_executivo')?.buttonLabel).toBe(
      'Gerar relatório',
    );
    expect(CARD_DEFS.find((c) => c.id === 'snapshot_9box')?.buttonLabel).toBe('Baixar PDF');
    expect(CARD_DEFS.find((c) => c.id === 'board_deck')?.buttonLabel).toBe('Baixar PDF');
    expect(CARD_DEFS.find((c) => c.id === 'clima_engajamento')?.buttonLabel).toBe('Baixar PDF');
  });
});
