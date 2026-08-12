// ROIP APP 9BOX — teste de integração ME-079a helpers + smoke test
// das actions da rota `/super-admin/empresa/[id]/relatorios-e-
// exportacoes`.
//
// Cobre:
//   1. Helpers puros de `internals.ts` (formatTrimestreLabel,
//      parseCompanyIdParam).
//   2. Constantes canônicas (CARD_DEFS, NIVEL_OPTIONS, ICON_COLORS).
//   3. Smoke: actions existem e exportam os tipos corretos.
//
// Faixa CNPJ canônica ME-079a: 79100000000000..79199999999999.

import { describe, expect, it } from 'vitest';

import {
  CARD_DEFS,
  DESKTOP_ONLY_MESSAGE,
  formatTrimestreLabel,
  ICON_COLORS,
  NIVEL_OPTIONS,
  parseCompanyIdParam,
} from '../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/internals';

// -----------------------------------------------------------------------
// 1. Helpers puros
// -----------------------------------------------------------------------

describe('relatorios internals', () => {
  describe('formatTrimestreLabel', () => {
    it('formata 2025-Q4 corretamente', () => {
      expect(formatTrimestreLabel('2025-Q4')).toBe('4º trimestre de 2025');
    });

    it('formata 2026-Q1 corretamente', () => {
      expect(formatTrimestreLabel('2026-Q1')).toBe('1º trimestre de 2026');
    });

    it('retorna input para formato inválido', () => {
      expect(formatTrimestreLabel('abc')).toBe('abc');
    });
  });

  describe('parseCompanyIdParam', () => {
    it('aceita inteiro positivo', () => {
      expect(parseCompanyIdParam('1')).toBe(1);
    });

    it('rejeita string vazia', () => {
      expect(parseCompanyIdParam('')).toBeNull();
    });

    it('rejeita não-numérico', () => {
      expect(parseCompanyIdParam('abc')).toBeNull();
    });
  });
});

// -----------------------------------------------------------------------
// 2. Constantes canônicas
// -----------------------------------------------------------------------

describe('relatorios constantes canonicas', () => {
  it('CARD_DEFS tem 6 cards', () => {
    expect(CARD_DEFS).toHaveLength(6);
  });

  it('IDs dos 6 cards canônicos §12.3', () => {
    const ids = CARD_DEFS.map((c) => c.id);
    expect(ids).toContain('resumo_dashboard');
    expect(ids).toContain('evolucao_trimestral');
    expect(ids).toContain('relatorio_executivo');
    expect(ids).toContain('snapshot_9box');
    expect(ids).toContain('board_deck');
    expect(ids).toContain('clima_engajamento');
  });

  it('2 cards na subseção planilhas', () => {
    const planilhas = CARD_DEFS.filter((c) => c.section === 'planilhas');
    expect(planilhas).toHaveLength(2);
  });

  it('4 cards na subseção relatórios', () => {
    const relatorios = CARD_DEFS.filter((c) => c.section === 'relatorios');
    expect(relatorios).toHaveLength(4);
  });

  it('board_deck omite Equipe (§12.5)', () => {
    const bd = CARD_DEFS.find((c) => c.id === 'board_deck');
    expect(bd?.hasEquipe).toBe(false);
  });

  it('clima_engajamento não usa cascata (§12.7)', () => {
    const clima = CARD_DEFS.find((c) => c.id === 'clima_engajamento');
    expect(clima?.hasCascade).toBe(false);
  });

  it('relatorio_executivo é tipo ia (§12.4)', () => {
    const exec = CARD_DEFS.find((c) => c.id === 'relatorio_executivo');
    expect(exec?.iconType).toBe('ia');
  });

  it('NIVEL_OPTIONS tem 3 opções', () => {
    expect(NIVEL_OPTIONS).toHaveLength(3);
    const values = NIVEL_OPTIONS.map((o) => o.value);
    expect(values).toContain('empresa');
    expect(values).toContain('departamento');
    expect(values).toContain('equipe');
  });

  it('ICON_COLORS cobre 3 tipos', () => {
    expect(ICON_COLORS.xlsx).toBeDefined();
    expect(ICON_COLORS.pdf).toBeDefined();
    expect(ICON_COLORS.ia).toBeDefined();
  });

  it('DESKTOP_ONLY_MESSAGE definida', () => {
    expect(DESKTOP_ONLY_MESSAGE.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// 3. Smoke: actions exportam tipos corretos
// -----------------------------------------------------------------------

describe('relatorios actions smoke', () => {
  it('listClosedQuartersAction é função', async () => {
    const mod =
      await import('../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/actions');
    expect(typeof mod.listClosedQuartersAction).toBe('function');
  });

  it('listDepartmentsAction é função', async () => {
    const mod =
      await import('../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/actions');
    expect(typeof mod.listDepartmentsAction).toBe('function');
  });

  it('listLeadersAction é função', async () => {
    const mod =
      await import('../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/actions');
    expect(typeof mod.listLeadersAction).toBe('function');
  });

  it('generateRelatorioExecutivoAction é função', async () => {
    const mod =
      await import('../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/actions');
    expect(typeof mod.generateRelatorioExecutivoAction).toBe('function');
  });
});
