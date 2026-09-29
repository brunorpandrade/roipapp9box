// ROIP APP 9BOX — teste unitario da religacao canonica dos 2 cards
// xlsx da Central de Relatorios (ME-PAINEL-PLANILHAS-OPERACIONAIS).
//
// Cobre §13.3 (Resumo dashboard) + §13.4 (Evolucao trimestral) do
// DOC 03 (CAMADA_NEGOCIO) e §12.4 do DOC 05 (CAMADA_UI): apos a
// religacao, os cards passam de `disabled: true` (subtitle "Em
// desenvolvimento" + buttonLabel "Em breve") para `disabled: false`
// com subtitle canonico e buttonLabel "Baixar planilha".
//
// Debito D-REL-RESUMO-EVOLUCAO (S502) canonicamente quitado por esta
// religacao — o comentario original do `internals.ts` foi substituido
// pela referencia canonica ao backend ja implementado
// (`exports.getResumoDashboard` + `exports.getEvolucaoTrimestral`),
// coberto pelos 45 testes de `spreadsheets-router.test.ts`.

import { describe, expect, it } from 'vitest';

import { CARD_DEFS } from '../../src/components/central-relatorios/internals';

describe('ME-PAINEL-PLANILHAS-OPERACIONAIS — religacao canonica dos cards xlsx', () => {
  const resumo = CARD_DEFS.find((c) => c.id === 'resumo_dashboard');
  const evolucao = CARD_DEFS.find((c) => c.id === 'evolucao_trimestral');

  it('resumo_dashboard existe em CARD_DEFS', () => {
    expect(resumo).toBeDefined();
  });

  it('resumo_dashboard tem subtitle canonico §12.4', () => {
    expect(resumo?.subtitle).toBe('Planilha xlsx · 1 trimestre');
  });

  it('resumo_dashboard tem buttonLabel canonico', () => {
    expect(resumo?.buttonLabel).toBe('Baixar planilha');
  });

  it('resumo_dashboard esta ativo (disabled=false)', () => {
    expect(resumo?.disabled).toBe(false);
  });

  it('resumo_dashboard preserva iconType xlsx + secao planilhas', () => {
    expect(resumo?.iconType).toBe('xlsx');
    expect(resumo?.section).toBe('planilhas');
  });

  it('resumo_dashboard suporta seletor em cascata + equipe (§12.5)', () => {
    expect(resumo?.hasCascade).toBe(true);
    expect(resumo?.hasEquipe).toBe(true);
  });

  it('evolucao_trimestral existe em CARD_DEFS', () => {
    expect(evolucao).toBeDefined();
  });

  it('evolucao_trimestral tem subtitle canonico §12.4', () => {
    expect(evolucao?.subtitle).toBe('Planilha xlsx · até 4 trimestres');
  });

  it('evolucao_trimestral tem buttonLabel canonico', () => {
    expect(evolucao?.buttonLabel).toBe('Baixar planilha');
  });

  it('evolucao_trimestral esta ativo (disabled=false)', () => {
    expect(evolucao?.disabled).toBe(false);
  });

  it('evolucao_trimestral preserva iconType xlsx + secao planilhas', () => {
    expect(evolucao?.iconType).toBe('xlsx');
    expect(evolucao?.section).toBe('planilhas');
  });

  it('evolucao_trimestral suporta seletor em cascata + equipe (§12.5)', () => {
    expect(evolucao?.hasCascade).toBe(true);
    expect(evolucao?.hasEquipe).toBe(true);
  });
});
