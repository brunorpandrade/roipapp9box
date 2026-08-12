// ROIP APP 9BOX — teste de integração ME-079a helpers + smoke test
// das actions da rota `/super-admin/empresa/[id]/dados-mensais`.
//
// Cobre:
//   1. Helpers puros de `internals.ts` (formatMesLabel, prevMes,
//      nextMes, currentMes, parseCompanyIdParam).
//   2. Constantes canônicas (STATUS_LABELS, STATUS_COLORS, TAB_LABELS).
//   3. Smoke: actions existem e exportam os tipos corretos.
//
// Faixa CNPJ canônica ME-079a: 79100000000000..79199999999999.

import { describe, expect, it } from 'vitest';

import {
  currentMes,
  DADOS_MENSAIS_TAB_DEFAULT,
  DADOS_MENSAIS_TABS,
  formatMesLabel,
  nextMes,
  parseCompanyIdParam,
  prevMes,
  STATUS_COLORS,
  STATUS_LABELS,
  TAB_LABELS,
} from '../../src/app/super-admin/empresa/[id]/dados-mensais/internals';

// -----------------------------------------------------------------------
// 1. Helpers puros
// -----------------------------------------------------------------------

describe('dados-mensais internals', () => {
  describe('formatMesLabel', () => {
    it('formata 2026-06 corretamente', () => {
      expect(formatMesLabel('2026-06')).toBe('Junho 2026');
    });

    it('formata 2025-12 corretamente', () => {
      expect(formatMesLabel('2025-12')).toBe('Dezembro 2025');
    });

    it('formata 2026-01 corretamente', () => {
      expect(formatMesLabel('2026-01')).toBe('Janeiro 2026');
    });

    it('retorna input para formato inválido', () => {
      expect(formatMesLabel('abc')).toBe('abc');
    });
  });

  describe('prevMes', () => {
    it('navega de 2026-06 para 2026-05', () => {
      expect(prevMes('2026-06')).toBe('2026-05');
    });

    it('navega de 2026-01 para 2025-12 (virada de ano)', () => {
      expect(prevMes('2026-01')).toBe('2025-12');
    });
  });

  describe('nextMes', () => {
    it('navega de 2026-06 para 2026-07', () => {
      expect(nextMes('2026-06')).toBe('2026-07');
    });

    it('navega de 2025-12 para 2026-01 (virada de ano)', () => {
      expect(nextMes('2025-12')).toBe('2026-01');
    });
  });

  describe('currentMes', () => {
    it('retorna formato YYYY-MM', () => {
      const result = currentMes();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('parseCompanyIdParam', () => {
    it('aceita inteiro positivo', () => {
      expect(parseCompanyIdParam('1')).toBe(1);
      expect(parseCompanyIdParam('42')).toBe(42);
    });

    it('rejeita string vazia', () => {
      expect(parseCompanyIdParam('')).toBeNull();
    });

    it('rejeita não-numérico', () => {
      expect(parseCompanyIdParam('abc')).toBeNull();
    });

    it('rejeita zero', () => {
      expect(parseCompanyIdParam('0')).toBeNull();
    });

    it('rejeita negativo', () => {
      expect(parseCompanyIdParam('-1')).toBeNull();
    });
  });
});

// -----------------------------------------------------------------------
// 2. Constantes canônicas
// -----------------------------------------------------------------------

describe('dados-mensais constantes canonicas', () => {
  it('STATUS_LABELS cobre os 3 estados', () => {
    expect(STATUS_LABELS.aberto).toBe('Aberto');
    expect(STATUS_LABELS.fechado).toBe('Fechado');
    expect(STATUS_LABELS.desbloqueado).toBe('Desbloqueado');
  });

  it('STATUS_COLORS cobre os 3 estados', () => {
    expect(STATUS_COLORS.aberto).toBeDefined();
    expect(STATUS_COLORS.fechado).toBeDefined();
    expect(STATUS_COLORS.desbloqueado).toBeDefined();
  });

  it('TAB_LABELS cobre as 2 abas', () => {
    expect(TAB_LABELS.rh).toBe('Dados do RH');
    expect(TAB_LABELS.lider).toBe('Dados dos líderes');
  });

  it('DADOS_MENSAIS_TABS tem 2 entradas', () => {
    expect(DADOS_MENSAIS_TABS).toHaveLength(2);
    expect(DADOS_MENSAIS_TABS[0]).toBe('rh');
    expect(DADOS_MENSAIS_TABS[1]).toBe('lider');
  });

  it('default tab é rh', () => {
    expect(DADOS_MENSAIS_TAB_DEFAULT).toBe('rh');
  });
});

// -----------------------------------------------------------------------
// 3. Smoke: actions exportam tipos corretos
// -----------------------------------------------------------------------

describe('dados-mensais actions smoke', () => {
  it('loadMonthlyFormAction é função', async () => {
    const { loadMonthlyFormAction } =
      await import('../../src/app/super-admin/empresa/[id]/dados-mensais/actions');
    expect(typeof loadMonthlyFormAction).toBe('function');
  });

  it('saveMonthlyRHDataAction é função', async () => {
    const { saveMonthlyRHDataAction } =
      await import('../../src/app/super-admin/empresa/[id]/dados-mensais/actions');
    expect(typeof saveMonthlyRHDataAction).toBe('function');
  });

  it('getClosureStatusAction é função', async () => {
    const { getClosureStatusAction } =
      await import('../../src/app/super-admin/empresa/[id]/dados-mensais/actions');
    expect(typeof getClosureStatusAction).toBe('function');
  });

  it('unlockMonthAction é função', async () => {
    const { unlockMonthAction } =
      await import('../../src/app/super-admin/empresa/[id]/dados-mensais/actions');
    expect(typeof unlockMonthAction).toBe('function');
  });
});
