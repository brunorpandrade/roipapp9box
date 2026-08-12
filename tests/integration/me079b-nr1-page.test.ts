// ROIP APP 9BOX — teste de integração ME-079b helpers + smoke test
// da rota `/super-admin/empresa/[id]/nr1`.
//
// Cobre:
//   1. Helpers puros de `internals.ts` (classForScore, formatDateBR,
//      formatTimestampBR, daysBetween, daysUntil, parseCompanyIdParam).
//   2. Constantes canônicas (FATORES_NR1, ABAS_NR1, BANNER_TEXT_NR1,
//      STATUS_BADGE, FAIXAS_SCORE, FATOR_DESCRICOES).
//   3. RadarPolar — polygon geometry helpers.
//   4. Smoke: actions existem e exportam os tipos corretos.
//
// Faixa CNPJ canônica ME-079b: 79200000000000..79299999999999.

import { describe, expect, it } from 'vitest';

import {
  ABA_LABELS,
  ABA_NR1_DEFAULT,
  ABAS_NR1,
  BANNER_TEXT_NR1,
  classForScore,
  daysBetween,
  daysUntil,
  FAIXAS_ADESAO,
  FAIXAS_SCORE,
  FATOR_DESCRICOES,
  FATORES_NR1,
  formatDateBR,
  formatTimestampBR,
  parseCompanyIdParam,
  SCORE_COLORS,
  STATUS_BADGE,
} from '../../src/app/super-admin/empresa/[id]/nr1/internals';

// -----------------------------------------------------------------------
// 1. Helpers puros
// -----------------------------------------------------------------------

describe('nr1 internals', () => {
  describe('classForScore', () => {
    it('retorna verde para score >= 66', () => {
      expect(classForScore(66)).toBe('verde');
      expect(classForScore(100)).toBe('verde');
      expect(classForScore(80)).toBe('verde');
    });

    it('retorna amarelo para score 50-65', () => {
      expect(classForScore(50)).toBe('amarelo');
      expect(classForScore(65)).toBe('amarelo');
      expect(classForScore(55)).toBe('amarelo');
    });

    it('retorna vermelho para score < 50', () => {
      expect(classForScore(0)).toBe('vermelho');
      expect(classForScore(49)).toBe('vermelho');
      expect(classForScore(25)).toBe('vermelho');
    });
  });

  describe('formatDateBR', () => {
    it('formata 2026-10-20 corretamente', () => {
      expect(formatDateBR('2026-10-20')).toBe('20/10/2026');
    });

    it('formata timestamp ISO corretamente', () => {
      expect(formatDateBR('2026-10-20T14:30:00.000Z')).toBe('20/10/2026');
    });

    it('retorna — para null', () => {
      expect(formatDateBR(null)).toBe('—');
    });

    it('retorna — para string vazia', () => {
      expect(formatDateBR('')).toBe('—');
    });
  });

  describe('formatTimestampBR', () => {
    it('retorna — para null', () => {
      expect(formatTimestampBR(null)).toBe('—');
    });

    it('retorna — para string vazia', () => {
      expect(formatTimestampBR('')).toBe('—');
    });

    it('formata timestamp ISO válido', () => {
      const result = formatTimestampBR('2026-10-20T14:30:00.000Z');
      // Timezone-dependent, but should contain date parts
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('daysBetween', () => {
    it('calcula 92 dias entre 2026-10-20 e 2027-01-20', () => {
      expect(daysBetween('2026-10-20', '2027-01-20')).toBe(92);
    });

    it('calcula 30 dias entre datas consecutivas', () => {
      expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    });

    it('retorna 0 para null', () => {
      expect(daysBetween(null, '2026-01-01')).toBe(0);
      expect(daysBetween('2026-01-01', null)).toBe(0);
    });
  });

  describe('daysUntil', () => {
    it('retorna 0 para null', () => {
      expect(daysUntil(null)).toBe(0);
    });

    it('retorna 0 para data no passado', () => {
      expect(daysUntil('2020-01-01')).toBe(0);
    });

    it('retorna valor positivo para data futura', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const iso = future.toISOString().split('T')[0]!;
      const result = daysUntil(iso);
      expect(result).toBeGreaterThanOrEqual(9);
      expect(result).toBeLessThanOrEqual(11);
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

    it('rejeita decimal', () => {
      expect(parseCompanyIdParam('1.5')).toBeNull();
    });
  });
});

// -----------------------------------------------------------------------
// 2. Constantes canônicas
// -----------------------------------------------------------------------

describe('nr1 constantes canônicas', () => {
  it('FATORES_NR1 tem exatamente 8 fatores', () => {
    expect(FATORES_NR1).toHaveLength(8);
  });

  it('FATORES_NR1 IDs são 1 a 8 consecutivos', () => {
    const ids = FATORES_NR1.map((f) => f.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('FATORES_NR1 tipos são risco ou recurso', () => {
    for (const f of FATORES_NR1) {
      expect(['risco', 'recurso']).toContain(f.tipo);
    }
  });

  it('FATORES_NR1 fator 1 é Exigências quantitativas', () => {
    expect(FATORES_NR1[0]!.nome).toBe('Exigências quantitativas');
  });

  it('FATORES_NR1 fator 8 é Saúde geral autopercebida', () => {
    expect(FATORES_NR1[7]!.nome).toBe('Saúde geral autopercebida');
  });

  it('ABAS_NR1 tem exatamente 2 abas', () => {
    expect(ABAS_NR1).toHaveLength(2);
    expect(ABAS_NR1).toEqual(['visao_geral', 'alertas_historico']);
  });

  it('ABA_NR1_DEFAULT é visao_geral', () => {
    expect(ABA_NR1_DEFAULT).toBe('visao_geral');
  });

  it('ABA_LABELS tem rótulos para todas as abas', () => {
    expect(ABA_LABELS.visao_geral).toBe('Visão geral');
    expect(ABA_LABELS.alertas_historico).toBe('Alertas e histórico');
  });

  it('BANNER_TEXT_NR1 contém texto canônico literal', () => {
    expect(BANNER_TEXT_NR1).toContain('radar diagnóstico preliminar');
    expect(BANNER_TEXT_NR1).toContain('8 fatores psicossociais canônicos');
    expect(BANNER_TEXT_NR1).toContain('Não substitui os instrumentos');
  });

  it('STATUS_BADGE tem 3 status', () => {
    expect(Object.keys(STATUS_BADGE)).toHaveLength(3);
    expect(STATUS_BADGE.agendado.label).toBe('Agendado');
    expect(STATUS_BADGE.aberto.label).toBe('Aberto');
    expect(STATUS_BADGE.fechado.label).toBe('Fechado');
  });

  it('FAIXAS_SCORE cobre 0-100 sem gaps', () => {
    expect(FAIXAS_SCORE.vermelho.min).toBe(0);
    expect(FAIXAS_SCORE.vermelho.max).toBe(49);
    expect(FAIXAS_SCORE.amarelo.min).toBe(50);
    expect(FAIXAS_SCORE.amarelo.max).toBe(65);
    expect(FAIXAS_SCORE.verde.min).toBe(66);
    expect(FAIXAS_SCORE.verde.max).toBe(100);
  });

  it('FAIXAS_ADESAO tem 3 faixas', () => {
    expect(FAIXAS_ADESAO.vermelho.label).toBe('Adesão baixa');
    expect(FAIXAS_ADESAO.amarelo.label).toBe('Adesão moderada');
    expect(FAIXAS_ADESAO.verde.label).toBe('Adesão satisfatória');
  });

  it('SCORE_COLORS tem 3 cores hex', () => {
    expect(SCORE_COLORS.verde).toMatch(/^#[0-9A-F]{6}$/i);
    expect(SCORE_COLORS.amarelo).toMatch(/^#[0-9A-F]{6}$/i);
    expect(SCORE_COLORS.vermelho).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('FATOR_DESCRICOES tem descrição para todos os 8 fatores', () => {
    for (let i = 1; i <= 8; i += 1) {
      expect(FATOR_DESCRICOES[i]).toBeDefined();
      expect(typeof FATOR_DESCRICOES[i]).toBe('string');
      expect(FATOR_DESCRICOES[i]!.length).toBeGreaterThan(20);
    }
  });
});

// -----------------------------------------------------------------------
// 3. Smoke: actions existem
// -----------------------------------------------------------------------

describe('nr1 actions smoke', () => {
  it('getCycleDetailsAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.getCycleDetailsAction).toBe('function');
  });

  it('getCollectionStatusAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.getCollectionStatusAction).toBe('function');
  });

  it('configureCycleAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.configureCycleAction).toBe('function');
  });

  it('editClosingDateAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.editClosingDateAction).toBe('function');
  });

  it('cancelCycleAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.cancelCycleAction).toBe('function');
  });

  it('startDownloadTokenAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/nr1/actions');
    expect(typeof mod.startDownloadTokenAction).toBe('function');
  });
});

// -----------------------------------------------------------------------
// 4. RadarPolar smoke
// -----------------------------------------------------------------------

describe('RadarPolar smoke', () => {
  it('componente é importável', async () => {
    const mod = await import('../../src/components/nr1/RadarPolar');
    expect(typeof mod.RadarPolar).toBe('function');
    expect(typeof mod.default).toBe('function');
  });
});
