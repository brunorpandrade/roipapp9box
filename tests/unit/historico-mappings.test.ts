// ROIP APP 9BOX — testes unit dos mappings canonicos do historico da
// empresa (ME-057c Bloco A — §14.21).
//
// Cobre bit-exact:
//   - Labels canonicos dos 4 tipos de evento (CC045 mockup > texto).
//   - Estilos canonicos das 4 badges (cores literais do mockup).
//   - Formatadores canonicos (batch ID short, mes label, aba label,
//     status de solicitacao).
//   - Ator canonico literal S322 para transferencia.
//   - Estados vazios canonicos.

import { describe, expect, it } from 'vitest';

import {
  HISTORY_EMPTY_FILTRO,
  HISTORY_EMPTY_INICIAL,
  HISTORY_EVENT_BADGE_STYLE,
  HISTORY_EVENT_TYPE_LABEL,
  HISTORY_EVENT_TYPE_LABEL_TODOS,
  HISTORY_EVENT_TYPE_VALUES,
  SYSTEM_ACTOR_TRANSFERENCIA,
  formatAbaLabel,
  formatBatchIdShort,
  formatMesReferencia,
  formatSolicitacaoStatusLabel,
  resolveHistoryEventBadgeStyle,
  resolveHistoryEventTypeLabel,
} from '../../src/app/super-admin/empresa/[id]/historico/mappings';

describe('historico-mappings — enum HISTORY_EVENT_TYPE_VALUES', () => {
  it('canonical 4 valores em ordem fixa (mockup TIPO_LABEL linhas 250-254)', () => {
    expect(HISTORY_EVENT_TYPE_VALUES).toEqual([
      'respfin',
      'desbloqueio',
      'transferencia',
      'solicitacao',
    ]);
  });

  it('nao inclui performanceMultiplierLog (placeholder canonico §14.21)', () => {
    expect((HISTORY_EVENT_TYPE_VALUES as readonly string[]).includes('multiplier')).toBe(false);
  });
});

describe('historico-mappings — HISTORY_EVENT_TYPE_LABEL (CC045)', () => {
  it('respfin bit-exact (mockup linha 251)', () => {
    expect(HISTORY_EVENT_TYPE_LABEL.respfin).toBe('Responsável financeiro');
  });

  it('desbloqueio bit-exact (mockup linha 252)', () => {
    expect(HISTORY_EVENT_TYPE_LABEL.desbloqueio).toBe('Desbloqueio de mês fechado');
  });

  it('transferencia bit-exact (mockup linha 253)', () => {
    expect(HISTORY_EVENT_TYPE_LABEL.transferencia).toBe('Transferência de liderados');
  });

  it('solicitacao bit-exact (mockup linha 254)', () => {
    expect(HISTORY_EVENT_TYPE_LABEL.solicitacao).toBe('Solicitação de desbloqueio');
  });

  it('cobre todos os 4 valores do enum sem sobras', () => {
    const keys = Object.keys(HISTORY_EVENT_TYPE_LABEL).sort();
    expect(keys).toEqual([...HISTORY_EVENT_TYPE_VALUES].sort());
  });

  it('resolveHistoryEventTypeLabel casa com o objeto direto', () => {
    for (const t of HISTORY_EVENT_TYPE_VALUES) {
      expect(resolveHistoryEventTypeLabel(t)).toBe(HISTORY_EVENT_TYPE_LABEL[t]);
    }
  });
});

describe('historico-mappings — HISTORY_EVENT_BADGE_STYLE (mockup CSS 74-78)', () => {
  it('respfin — info (azul bit-exact)', () => {
    expect(HISTORY_EVENT_BADGE_STYLE.respfin).toEqual({
      background: '#E6F1FB',
      color: '#0C447C',
    });
  });

  it('desbloqueio — success (verde bit-exact)', () => {
    expect(HISTORY_EVENT_BADGE_STYLE.desbloqueio).toEqual({
      background: '#DCFCE7',
      color: '#166534',
    });
  });

  it('transferencia — warning (amarelo bit-exact)', () => {
    expect(HISTORY_EVENT_BADGE_STYLE.transferencia).toEqual({
      background: '#FEF3C7',
      color: '#92400E',
    });
  });

  it('solicitacao — roxo canonico (§14.21 explicito)', () => {
    expect(HISTORY_EVENT_BADGE_STYLE.solicitacao).toEqual({
      background: '#F3E8FF',
      color: '#6B21A8',
    });
  });

  it('resolveHistoryEventBadgeStyle casa com o objeto direto', () => {
    for (const t of HISTORY_EVENT_TYPE_VALUES) {
      expect(resolveHistoryEventBadgeStyle(t)).toEqual(HISTORY_EVENT_BADGE_STYLE[t]);
    }
  });
});

describe('historico-mappings — HISTORY_EVENT_TYPE_LABEL_TODOS', () => {
  it('mockup linha 176 bit-exact', () => {
    expect(HISTORY_EVENT_TYPE_LABEL_TODOS).toBe('Tipo de evento: Todos');
  });
});

describe('historico-mappings — estados vazios (mockup 324-326)', () => {
  it('HISTORY_EMPTY_INICIAL bit-exact', () => {
    expect(HISTORY_EMPTY_INICIAL).toBe('Nenhum evento registrado para esta empresa até o momento.');
  });

  it('HISTORY_EMPTY_FILTRO bit-exact', () => {
    expect(HISTORY_EMPTY_FILTRO).toBe('Nenhum registro encontrado com os filtros aplicados.');
  });
});

describe('historico-mappings — SYSTEM_ACTOR_TRANSFERENCIA (S322)', () => {
  it('literal canonico bit-exact', () => {
    expect(SYSTEM_ACTOR_TRANSFERENCIA).toBe('Sistema (transferência de líderados)');
  });

  it('acentuacao explicita (nao substituir por "lideradoS")', () => {
    expect(SYSTEM_ACTOR_TRANSFERENCIA.includes('líderados')).toBe(true);
  });
});

describe('historico-mappings — formatBatchIdShort', () => {
  it('UUID canonico 36 chars → primeiros 8 + "..."', () => {
    expect(formatBatchIdShort('a1f4e9c2-1234-5678-9abc-def012345678')).toBe('a1f4e9c2...');
  });

  it('input com menos de 8 chars retorna literal (fallback)', () => {
    expect(formatBatchIdShort('a1f')).toBe('a1f');
    expect(formatBatchIdShort('')).toBe('');
  });

  it('input com exatamente 8 chars → 8 + "..."', () => {
    expect(formatBatchIdShort('abcdefgh')).toBe('abcdefgh...');
  });
});

describe('historico-mappings — formatMesReferencia', () => {
  it('YYYY-MM canonico → Mes/Ano (mockup: "Junho/2026")', () => {
    expect(formatMesReferencia('2026-06')).toBe('Junho/2026');
  });

  it('abril → Abril/2026', () => {
    expect(formatMesReferencia('2026-04')).toBe('Abril/2026');
  });

  it('janeiro → Janeiro/2025', () => {
    expect(formatMesReferencia('2025-01')).toBe('Janeiro/2025');
  });

  it('dezembro → Dezembro/2024', () => {
    expect(formatMesReferencia('2024-12')).toBe('Dezembro/2024');
  });

  it('input malformado → devolve literal', () => {
    expect(formatMesReferencia('foo')).toBe('foo');
    expect(formatMesReferencia('2026-13')).toBe('2026-13');
    expect(formatMesReferencia('2026-00')).toBe('2026-00');
    expect(formatMesReferencia('')).toBe('');
  });
});

describe('historico-mappings — formatAbaLabel', () => {
  it('rh → "Dados mensais — RH" (mockup linha 272)', () => {
    expect(formatAbaLabel('rh')).toBe('Dados mensais — RH');
  });

  it('lider → "Dados mensais — Líder" (mockup linha 296)', () => {
    expect(formatAbaLabel('lider')).toBe('Dados mensais — Líder');
  });

  it('faturamento → "Faturamento mensal" (canonico §14.15 DOC 05)', () => {
    expect(formatAbaLabel('faturamento')).toBe('Faturamento mensal');
  });
});

describe('historico-mappings — formatSolicitacaoStatusLabel', () => {
  it('pendente → "Pendente"', () => {
    expect(formatSolicitacaoStatusLabel('pendente')).toBe('Pendente');
  });

  it('aprovada → "Aprovada" (mockup linha 272)', () => {
    expect(formatSolicitacaoStatusLabel('aprovada')).toBe('Aprovada');
  });

  it('recusada → "Recusada" (mockup linha 296)', () => {
    expect(formatSolicitacaoStatusLabel('recusada')).toBe('Recusada');
  });

  it('cancelada → "Cancelada"', () => {
    expect(formatSolicitacaoStatusLabel('cancelada')).toBe('Cancelada');
  });
});
