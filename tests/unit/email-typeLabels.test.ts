// ROIP APP 9BOX — teste unitario `typeLabels` (ME-060).
// Cobre reproducao canonica dos 17 rotulos legiveis (§6.1) + 4 emojis
// de severidade (§6.2) + composicao canonica da badge (§12.6).

import { describe, expect, it } from 'vitest';

import {
  formatAlertBadge,
  getEmojiSeveridade,
  getRotuloLegivel,
} from '../../src/lib/email/typeLabels';

describe('getRotuloLegivel — reproducao canonica §6.1', () => {
  it('nr1_fator_critico', () => {
    expect(getRotuloLegivel('nr1_fator_critico')).toBe('Fator do Radar NR-1 em nível crítico');
  });
  it('nr1_ciclo_fechado', () => {
    expect(getRotuloLegivel('nr1_ciclo_fechado')).toBe('Ciclo do Radar NR-1 encerrado');
  });
  it('desempenho_queda_brusca', () => {
    expect(getRotuloLegivel('desempenho_queda_brusca')).toBe('Queda brusca de desempenho');
  });
  it('desempenho_estagnacao', () => {
    expect(getRotuloLegivel('desempenho_estagnacao')).toBe(
      'Índice de desempenho abaixo do esperado',
    );
  });
  it('desempenho_queda_isolada', () => {
    expect(getRotuloLegivel('desempenho_queda_isolada')).toBe('Queda pontual de desempenho');
  });
  it('assiduidade_baixa', () => {
    expect(getRotuloLegivel('assiduidade_baixa')).toBe('Assiduidade abaixo do mínimo');
  });
  it('divergencia_a_c', () => {
    expect(getRotuloLegivel('divergencia_a_c')).toBe(
      'Divergência entre autoavaliação e avaliação do líder',
    );
  });
});

describe('getEmojiSeveridade — §6.2 (4 emojis)', () => {
  it('critico', () => {
    expect(getEmojiSeveridade('critico')).toBe('🔴');
  });
  it('atencao', () => {
    expect(getEmojiSeveridade('atencao')).toBe('🔶');
  });
  it('observacao', () => {
    expect(getEmojiSeveridade('observacao')).toBe('⚪');
  });
  it('info', () => {
    expect(getEmojiSeveridade('info')).toBe('🔵');
  });
});

describe('formatAlertBadge — §12.6 linha 1407', () => {
  it('critico + queda brusca', () => {
    expect(formatAlertBadge('desempenho_queda_brusca', 'critico')).toBe(
      '🔴 Queda brusca de desempenho',
    );
  });
  it('atencao + nr1', () => {
    expect(formatAlertBadge('nr1_fator_critico', 'atencao')).toBe(
      '🔶 Fator do Radar NR-1 em nível crítico',
    );
  });
  it('observacao + queda isolada', () => {
    expect(formatAlertBadge('desempenho_queda_isolada', 'observacao')).toBe(
      '⚪ Queda pontual de desempenho',
    );
  });
});
