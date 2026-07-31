// ROIP APP 9BOX — testes unit dos mappings canonicos de
// `/pendencias-portal` (ME-058 §14.23).
//
// Cobertura canonica:
// - Labels bit-exact dos 4 instrumentos e 2 status.
// - Ordem canonica dos enums (INSTRUMENT_ORDER).
// - Cores canonicas §5.8 e §14.23 (literais bit-exact).
// - Formatadores: formatDiasAtraso, resolveDiasAtrasoColor,
//   formatPrazoOriginal, formatCooldownTimestamp.
// - Constantes canonicas literais (CARD_58_TITLE, CARD_58_SUB_*,
//   CARD_58_LINK, COOLDOWN_LEMBRETE_*).
//
// Zero I/O; puro TypeScript. RV-13 aceita test como chamador nao-motor.

import { describe, expect, it } from 'vitest';

import {
  CARD_58_LINK,
  CARD_58_SUB_POSITIVE,
  CARD_58_SUB_ZERO,
  CARD_58_TITLE,
  CARD_COLOR_PENDENCIAS,
  CARD_RESUMO_COLOR,
  COOLDOWN_LEMBRETE_HORAS,
  COOLDOWN_LEMBRETE_MS,
  DIAS_ATRASO_COLOR,
  INSTRUMENT_LABEL,
  INSTRUMENT_ORDER,
  STATUS_LABEL,
  formatCooldownTimestamp,
  formatDiasAtraso,
  formatPrazoOriginal,
  resolveDiasAtrasoColor,
} from '../../src/app/pendencias-portal/mappings';

describe('INSTRUMENT_LABEL — labels canonicos bit-exact §14.23 filtro Instrumento', () => {
  it('meuPerfil = "Meu perfil"', () => {
    expect(INSTRUMENT_LABEL.meuPerfil).toBe('Meu perfil');
  });

  it('autoAvaliacao = "Autoavaliação" (com til)', () => {
    expect(INSTRUMENT_LABEL.autoAvaliacao).toBe('Autoavaliação');
  });

  it('avaliacaoLiderancaDireta = "Avaliação da liderança direta" (com cedilha e til)', () => {
    expect(INSTRUMENT_LABEL.avaliacaoLiderancaDireta).toBe('Avaliação da liderança direta');
  });

  it('radarNR1 = "Radar NR-1" (com hifen)', () => {
    expect(INSTRUMENT_LABEL.radarNR1).toBe('Radar NR-1');
  });

  it('cobertura completa dos 4 valores canonicos do enum', () => {
    expect(Object.keys(INSTRUMENT_LABEL)).toHaveLength(4);
  });

  it('objeto e Object.freeze (imutabilidade canonica)', () => {
    expect(Object.isFrozen(INSTRUMENT_LABEL)).toBe(true);
  });
});

describe('INSTRUMENT_ORDER — ordem canonica dos 4 instrumentos', () => {
  it('espelha ordem canonica do enum portalReminderLog.instrumentType', () => {
    expect(INSTRUMENT_ORDER).toEqual([
      'meuPerfil',
      'autoAvaliacao',
      'avaliacaoLiderancaDireta',
      'radarNR1',
    ]);
  });

  it('array e Object.freeze (imutabilidade canonica)', () => {
    expect(Object.isFrozen(INSTRUMENT_ORDER)).toBe(true);
  });

  it('todo valor de INSTRUMENT_ORDER tem chave em INSTRUMENT_LABEL', () => {
    for (const instr of INSTRUMENT_ORDER) {
      expect(INSTRUMENT_LABEL[instr]).toBeDefined();
    }
  });
});

describe('STATUS_LABEL — 2 status canonicos §14.23 filtro Status', () => {
  it('Pendente = "Pendente"', () => {
    expect(STATUS_LABEL.Pendente).toBe('Pendente');
  });

  it('Atrasado = "Atrasado"', () => {
    expect(STATUS_LABEL.Atrasado).toBe('Atrasado');
  });

  it('cobertura completa dos 2 valores canonicos', () => {
    expect(Object.keys(STATUS_LABEL)).toHaveLength(2);
  });
});

describe('CARD_COLOR_PENDENCIAS — cores canonicas §5.8 bit-exact', () => {
  it('zero pendencias = verde #16A34A (DOC 05 §5.8 linha 648)', () => {
    expect(CARD_COLOR_PENDENCIAS.zero).toBe('#16A34A');
  });

  it('1+ pendencias = laranja #D97706 (DOC 05 §5.8 linha 649)', () => {
    expect(CARD_COLOR_PENDENCIAS.positive).toBe('#D97706');
  });

  it('objeto e Object.freeze', () => {
    expect(Object.isFrozen(CARD_COLOR_PENDENCIAS)).toBe(true);
  });
});

describe('DIAS_ATRASO_COLOR — cores canonicas coluna 9 §14.23 linha 2633', () => {
  it('danger = #DC2626 (vermelho para > 5 dias)', () => {
    expect(DIAS_ATRASO_COLOR.danger).toBe('#DC2626');
  });

  it('warn = #D97706 (laranja para 1 a 5 dias)', () => {
    expect(DIAS_ATRASO_COLOR.warn).toBe('#D97706');
  });

  it('neutral = #6B7280 (cinza para 0 dias)', () => {
    expect(DIAS_ATRASO_COLOR.neutral).toBe('#6B7280');
  });
});

describe('CARD_RESUMO_COLOR — cores canonicas 3 cards §14.23 linhas 2610-2612', () => {
  it('atrasadas = #DC2626 (vermelho)', () => {
    expect(CARD_RESUMO_COLOR.atrasadas).toBe('#DC2626');
  });

  it('pendentes = #1E40AF (azul)', () => {
    expect(CARD_RESUMO_COLOR.pendentes).toBe('#1E40AF');
  });

  it('colaboradores = #6B7280 (cinza)', () => {
    expect(CARD_RESUMO_COLOR.colaboradores).toBe('#6B7280');
  });
});

describe('resolveDiasAtrasoColor — contrato canonico §14.23 coluna 9', () => {
  it('dias > 5 → danger (vermelho)', () => {
    expect(resolveDiasAtrasoColor(6)).toBe(DIAS_ATRASO_COLOR.danger);
    expect(resolveDiasAtrasoColor(100)).toBe(DIAS_ATRASO_COLOR.danger);
  });

  it('dias = 5 → warn (laranja — limite inclusivo superior de warn)', () => {
    expect(resolveDiasAtrasoColor(5)).toBe(DIAS_ATRASO_COLOR.warn);
  });

  it('dias = 1..5 → warn (laranja)', () => {
    expect(resolveDiasAtrasoColor(1)).toBe(DIAS_ATRASO_COLOR.warn);
    expect(resolveDiasAtrasoColor(3)).toBe(DIAS_ATRASO_COLOR.warn);
    expect(resolveDiasAtrasoColor(4)).toBe(DIAS_ATRASO_COLOR.warn);
  });

  it('dias = 0 → neutral (cinza)', () => {
    expect(resolveDiasAtrasoColor(0)).toBe(DIAS_ATRASO_COLOR.neutral);
  });

  it('dias < 0 → neutral (canonicamente equivalente a 0)', () => {
    expect(resolveDiasAtrasoColor(-1)).toBe(DIAS_ATRASO_COLOR.neutral);
    expect(resolveDiasAtrasoColor(-100)).toBe(DIAS_ATRASO_COLOR.neutral);
  });
});

describe('formatDiasAtraso — string sem unidade (cabecalho ja indica)', () => {
  it('dias positivo → string numerica', () => {
    expect(formatDiasAtraso(1)).toBe('1');
    expect(formatDiasAtraso(42)).toBe('42');
  });

  it('dias = 0 → "0"', () => {
    expect(formatDiasAtraso(0)).toBe('0');
  });

  it('dias negativo → "0" (canonicamente adiantado = 0)', () => {
    expect(formatDiasAtraso(-5)).toBe('0');
  });
});

describe('formatPrazoOriginal — formato canonico pt-BR dd/mm/aaaa', () => {
  it('data valida → dd/mm/aaaa', () => {
    const data = new Date(Date.UTC(2026, 5, 15));
    expect(formatPrazoOriginal(data)).toBe('15/06/2026');
  });

  it('data com dia/mes < 10 → padding zero', () => {
    const data = new Date(Date.UTC(2026, 0, 3));
    expect(formatPrazoOriginal(data)).toBe('03/01/2026');
  });

  it('data null → string vazia (canonicamente "sem prazo definido")', () => {
    expect(formatPrazoOriginal(null)).toBe('');
  });
});

describe('formatCooldownTimestamp — formato canonico pt-BR dd/mm/aaaa hh:mm', () => {
  it('data valida com hora → dd/mm/aaaa hh:mm', () => {
    const data = new Date(Date.UTC(2026, 5, 15, 14, 30));
    expect(formatCooldownTimestamp(data)).toBe('15/06/2026 14:30');
  });

  it('data com meia-noite → 00:00', () => {
    const data = new Date(Date.UTC(2026, 5, 15, 0, 0));
    expect(formatCooldownTimestamp(data)).toBe('15/06/2026 00:00');
  });

  it('data com padding em hora e minuto', () => {
    const data = new Date(Date.UTC(2026, 5, 15, 5, 7));
    expect(formatCooldownTimestamp(data)).toBe('15/06/2026 05:07');
  });
});

describe('Textos canonicos literais bit-exact §5.8', () => {
  it('CARD_58_TITLE = "Pendencias no portal" (canonico com til e cedilha)', () => {
    expect(CARD_58_TITLE).toBe('Pendências no portal');
  });

  it('CARD_58_SUB_POSITIVE = "pendencias totais na empresa" (§5.8 linha 644)', () => {
    expect(CARD_58_SUB_POSITIVE).toBe('pendências totais na empresa');
  });

  it('CARD_58_SUB_ZERO = "Empresa em dia com o portal ✓" (§5.8 linha 648)', () => {
    expect(CARD_58_SUB_ZERO).toBe('Empresa em dia com o portal ✓');
  });

  it('CARD_58_LINK = "Ver detalhamento →" (§5.8 linha 645)', () => {
    expect(CARD_58_LINK).toBe('Ver detalhamento →');
  });
});

describe('COOLDOWN — canonico §14.23 linha 2652', () => {
  it('COOLDOWN_LEMBRETE_HORAS = 72', () => {
    expect(COOLDOWN_LEMBRETE_HORAS).toBe(72);
  });

  it('COOLDOWN_LEMBRETE_MS = 72h em ms', () => {
    expect(COOLDOWN_LEMBRETE_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('COOLDOWN_LEMBRETE_MS = 259200000 (bit-exact)', () => {
    expect(COOLDOWN_LEMBRETE_MS).toBe(259200000);
  });
});
