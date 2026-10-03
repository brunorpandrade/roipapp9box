// ROIP APP 9BOX — testes unit dos mappings canonicos de
// `/cycle-management` (ME-B9.1 §14.18).
//
// Zero I/O; puro TypeScript. Cobre:
// - Labels bit-exact dos 5 tipos de ciclo, 3 status de ciclo, 3 abas,
//   4 status de unlock.
// - Classes CSS canonicas por tipo/status.
// - Formatadores: formatMesLabel, formatDateBR, formatDateTimeBR.
// - calcTaxaResposta e TAXA_RESPOSTA_FAIXA.

import { describe, expect, it } from 'vitest';

import {
  ABA_UNLOCK_LABEL,
  STATUS_CICLO_BADGE_CLASS,
  STATUS_CICLO_LABEL,
  STATUS_UNLOCK_BADGE_CLASS,
  STATUS_UNLOCK_LABEL,
  TAXA_RESPOSTA_FAIXA,
  TIPO_CICLO_BADGE_CLASS,
  TIPO_CICLO_LABEL,
  calcTaxaResposta,
  formatDateBR,
  formatDateTimeBR,
  formatMesLabel,
} from '../../src/app/cycle-management/mappings';

describe('TIPO_CICLO_LABEL — labels canonicos bit-exact §14.18', () => {
  it('instrumento_a = "Autoavaliação"', () => {
    expect(TIPO_CICLO_LABEL.instrumento_a).toBe('Autoavaliação');
  });
  it('instrumento_c = "Avaliação do colaborador direto/seu líder"', () => {
    expect(TIPO_CICLO_LABEL.instrumento_c).toBe('Avaliação do colaborador direto/seu líder');
  });
  it('instrumento_d = "Avaliação da liderança direta"', () => {
    expect(TIPO_CICLO_LABEL.instrumento_d).toBe('Avaliação da liderança direta');
  });
  it('radar_nr1 = "Radar NR-1"', () => {
    expect(TIPO_CICLO_LABEL.radar_nr1).toBe('Radar NR-1');
  });
  it('fechamento_mensal = "Fechamento mensal"', () => {
    expect(TIPO_CICLO_LABEL.fechamento_mensal).toBe('Fechamento mensal');
  });
});

describe('TIPO_CICLO_BADGE_CLASS — classes CSS bit-exact ao mockup', () => {
  it('instrumento_a → badge-instrA', () => {
    expect(TIPO_CICLO_BADGE_CLASS.instrumento_a).toBe('badge-instrA');
  });
  it('instrumento_c → badge-instrC', () => {
    expect(TIPO_CICLO_BADGE_CLASS.instrumento_c).toBe('badge-instrC');
  });
  it('instrumento_d → badge-instrD', () => {
    expect(TIPO_CICLO_BADGE_CLASS.instrumento_d).toBe('badge-instrD');
  });
  it('radar_nr1 → badge-radar', () => {
    expect(TIPO_CICLO_BADGE_CLASS.radar_nr1).toBe('badge-radar');
  });
  it('fechamento_mensal → badge-mensal', () => {
    expect(TIPO_CICLO_BADGE_CLASS.fechamento_mensal).toBe('badge-mensal');
  });
});

describe('STATUS_CICLO_LABEL + STATUS_CICLO_BADGE_CLASS', () => {
  it('labels canonicos', () => {
    expect(STATUS_CICLO_LABEL.aberto).toBe('Aberto');
    expect(STATUS_CICLO_LABEL.atrasado).toBe('Atrasado');
    expect(STATUS_CICLO_LABEL.fechado).toBe('Fechado');
  });
  it('classes CSS canonicas', () => {
    expect(STATUS_CICLO_BADGE_CLASS.aberto).toBe('badge-aberto');
    expect(STATUS_CICLO_BADGE_CLASS.atrasado).toBe('badge-atrasado');
    expect(STATUS_CICLO_BADGE_CLASS.fechado).toBe('badge-fechado');
  });
});

describe('ABA_UNLOCK_LABEL — labels canonicos', () => {
  it('rh = "Dados do RH"', () => {
    expect(ABA_UNLOCK_LABEL.rh).toBe('Dados do RH');
  });
  it('lider = "Dados do líder"', () => {
    expect(ABA_UNLOCK_LABEL.lider).toBe('Dados do líder');
  });
  it('faturamento = "Dados de faturamento"', () => {
    expect(ABA_UNLOCK_LABEL.faturamento).toBe('Dados de faturamento');
  });
});

describe('STATUS_UNLOCK_LABEL + STATUS_UNLOCK_BADGE_CLASS', () => {
  it('labels dos 4 status', () => {
    expect(STATUS_UNLOCK_LABEL.pendente).toBe('Pendente');
    expect(STATUS_UNLOCK_LABEL.aprovada).toBe('Aprovada');
    expect(STATUS_UNLOCK_LABEL.recusada).toBe('Recusada');
    expect(STATUS_UNLOCK_LABEL.cancelada).toBe('Cancelada');
  });
  it('classes CSS canonicas', () => {
    expect(STATUS_UNLOCK_BADGE_CLASS.pendente).toBe('badge-pendente');
    expect(STATUS_UNLOCK_BADGE_CLASS.aprovada).toBe('badge-aprovada');
    expect(STATUS_UNLOCK_BADGE_CLASS.recusada).toBe('badge-recusada');
    expect(STATUS_UNLOCK_BADGE_CLASS.cancelada).toBe('badge-cancelada');
  });
});

describe('formatMesLabel — nome do mes em portugues', () => {
  it('2026-05 → "Maio de 2026"', () => {
    expect(formatMesLabel('2026-05')).toBe('Maio de 2026');
  });
  it('2026-01 → "Janeiro de 2026"', () => {
    expect(formatMesLabel('2026-01')).toBe('Janeiro de 2026');
  });
  it('2026-12 → "Dezembro de 2026"', () => {
    expect(formatMesLabel('2026-12')).toBe('Dezembro de 2026');
  });
  it('formato invalido retorna a propria entrada', () => {
    expect(formatMesLabel('invalido')).toBe('invalido');
    expect(formatMesLabel('2026-13')).toBe('2026-13');
  });
});

describe('formatDateBR — dd/mm/aaaa', () => {
  it('Date → dd/mm/aaaa', () => {
    expect(formatDateBR(new Date(Date.UTC(2026, 4, 5)))).toBe('05/05/2026');
  });
  it('string ISO → dd/mm/aaaa', () => {
    expect(formatDateBR('2026-07-11T00:00:00Z')).toBe('11/07/2026');
  });
  it('null/undefined → "—"', () => {
    expect(formatDateBR(null)).toBe('—');
    expect(formatDateBR(undefined)).toBe('—');
  });
  it('data invalida → "—"', () => {
    expect(formatDateBR('invalid-date')).toBe('—');
  });
});

describe('formatDateTimeBR — dd/mm/aaaa HH:MM', () => {
  it('Date → dd/mm/aaaa HH:MM', () => {
    const d = new Date(Date.UTC(2026, 6, 2, 14, 23));
    expect(formatDateTimeBR(d)).toBe('02/07/2026 14:23');
  });
  it('null → "—"', () => {
    expect(formatDateTimeBR(null)).toBe('—');
  });
});

describe('calcTaxaResposta + TAXA_RESPOSTA_FAIXA', () => {
  it('zero elegiveis = 0%', () => {
    expect(calcTaxaResposta(10, 0)).toBe(0);
    expect(calcTaxaResposta(10, null)).toBe(0);
  });
  it('arredonda', () => {
    expect(calcTaxaResposta(34, 142)).toBe(24);
    expect(calcTaxaResposta(142, 142)).toBe(100);
  });
  it('faixa baixa (<50)', () => {
    expect(TAXA_RESPOSTA_FAIXA(10)).toBe('baixa');
    expect(TAXA_RESPOSTA_FAIXA(49)).toBe('baixa');
  });
  it('faixa media (50-84)', () => {
    expect(TAXA_RESPOSTA_FAIXA(50)).toBe('media');
    expect(TAXA_RESPOSTA_FAIXA(84)).toBe('media');
  });
  it('faixa alta (>=85)', () => {
    expect(TAXA_RESPOSTA_FAIXA(85)).toBe('alta');
    expect(TAXA_RESPOSTA_FAIXA(100)).toBe('alta');
  });
});
