// ROIP APP 9BOX — teste de integração ME-080c helpers + smoke test
// da rota `/super-admin/empresa/[id]/onboarding-lideres`.
//
// Cobre:
//   1. Helpers puros de `internals.ts` (daysBetween,
//      computeDiasNoEstagio, formatDiasNoEstagio, formatTimestampBR,
//      iniciaisDoNome, parseCompanyIdParam).
//   2. Constantes canônicas (ESTAGIOS, ESTAGIO_LABELS,
//      ESTAGIO_COL_CLASS, limites de chars, threshold badge âmbar).
//   3. Smoke: actions existem e são importáveis + client component
//      é importável.

import { describe, expect, it } from 'vitest';

import {
  ANOTACAO_MAX_CHARS_CLIENT,
  ANOTACAO_MIN_CHARS_CLIENT,
  BADGE_DIAS_AMBAR_THRESHOLD,
  computeDiasNoEstagio,
  daysBetween,
  ESTAGIO_COL_CLASS,
  ESTAGIO_LABELS,
  ESTAGIOS,
  formatDiasNoEstagio,
  formatTimestampBR,
  iniciaisDoNome,
  parseCompanyIdParam,
} from '../../src/app/super-admin/empresa/[id]/onboarding-lideres/internals';

// -----------------------------------------------------------------------
// 1. Constantes canônicas
// -----------------------------------------------------------------------

describe('onboarding-lideres internals — constantes canonicas', () => {
  it('ESTAGIOS tem 4 valores canonicos na ordem exata', () => {
    expect(ESTAGIOS).toEqual(['treinar', 'em_treinamento', 'treinado', 'reciclagem']);
  });

  it('ESTAGIO_LABELS mapeia bit-exact com o mockup', () => {
    expect(ESTAGIO_LABELS.treinar).toBe('Treinar');
    expect(ESTAGIO_LABELS.em_treinamento).toBe('Em treinamento');
    expect(ESTAGIO_LABELS.treinado).toBe('Treinado');
    expect(ESTAGIO_LABELS.reciclagem).toBe('Reciclagem');
  });

  it('ESTAGIO_COL_CLASS mapeia bit-exact com o mockup', () => {
    expect(ESTAGIO_COL_CLASS.treinar).toBe('col-treinar');
    expect(ESTAGIO_COL_CLASS.em_treinamento).toBe('col-em-treinamento');
    expect(ESTAGIO_COL_CLASS.treinado).toBe('col-treinado');
    expect(ESTAGIO_COL_CLASS.reciclagem).toBe('col-reciclagem');
  });

  it('limites de chars da anotacao replicam os do router (100-500)', () => {
    expect(ANOTACAO_MIN_CHARS_CLIENT).toBe(100);
    expect(ANOTACAO_MAX_CHARS_CLIENT).toBe(500);
  });

  it('threshold canonico badge ambar (mockup + §14.27)', () => {
    expect(BADGE_DIAS_AMBAR_THRESHOLD).toBe(15);
  });
});

// -----------------------------------------------------------------------
// 2. Helpers puros de data
// -----------------------------------------------------------------------

describe('daysBetween', () => {
  it('retorna 0 para mesma data', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(daysBetween(d, d)).toBe(0);
  });

  it('retorna dias inteiros positivos quando `to` posterior', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-11T00:00:00Z');
    expect(daysBetween(from, to)).toBe(10);
  });

  it('retorna dias negativos quando `to` anterior', () => {
    const from = new Date('2026-01-11T00:00:00Z');
    const to = new Date('2026-01-01T00:00:00Z');
    expect(daysBetween(from, to)).toBe(-10);
  });

  it('arredonda para baixo em diferenca fracionaria', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    // +36h → 1.5 dias → 1 (floor).
    const to = new Date('2026-01-02T12:00:00Z');
    expect(daysBetween(from, to)).toBe(1);
  });
});

describe('computeDiasNoEstagio', () => {
  it('retorna 0 quando entrada eh no futuro (clock skew defensivo)', () => {
    const entrada = new Date('2026-02-01T00:00:00Z');
    const now = new Date('2026-01-01T00:00:00Z');
    expect(computeDiasNoEstagio(entrada, now)).toBe(0);
  });

  it('retorna 0 para entrada = now', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(computeDiasNoEstagio(d, d)).toBe(0);
  });

  it('retorna N dias inteiros para entrada N dias antes', () => {
    const entrada = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-16T00:00:00Z');
    expect(computeDiasNoEstagio(entrada, now)).toBe(15);
  });

  it('threshold ambar: 16 dias eh maior que 15 (destaque)', () => {
    const entrada = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-17T00:00:00Z');
    expect(computeDiasNoEstagio(entrada, now) > BADGE_DIAS_AMBAR_THRESHOLD).toBe(true);
  });

  it('threshold ambar: 15 dias NAO eh maior que 15 (sem destaque)', () => {
    const entrada = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-16T00:00:00Z');
    expect(computeDiasNoEstagio(entrada, now) > BADGE_DIAS_AMBAR_THRESHOLD).toBe(false);
  });
});

describe('formatDiasNoEstagio', () => {
  it('0 dias → "Hoje"', () => {
    expect(formatDiasNoEstagio(0)).toBe('Hoje');
  });

  it('negativo → "Hoje" (defensivo)', () => {
    expect(formatDiasNoEstagio(-3)).toBe('Hoje');
  });

  it('1 dia → "Há 1 dia" (singular)', () => {
    expect(formatDiasNoEstagio(1)).toBe('Há 1 dia');
  });

  it('N dias (N > 1) → "Há N dias" (plural)', () => {
    expect(formatDiasNoEstagio(2)).toBe('Há 2 dias');
    expect(formatDiasNoEstagio(22)).toBe('Há 22 dias');
    expect(formatDiasNoEstagio(365)).toBe('Há 365 dias');
  });
});

describe('formatTimestampBR', () => {
  it('formata canonicamente em pt-BR com timezone America/Sao_Paulo', () => {
    // 22/06/2026 10:14 BRT ↔ 22/06/2026 13:14 UTC (BRT = UTC-3).
    const d = new Date('2026-06-22T13:14:00Z');
    expect(formatTimestampBR(d)).toBe('22/06/2026 · 10:14');
  });

  it('respeita 2 digitos em dia/mes/hora/min', () => {
    const d = new Date('2026-01-05T14:07:00Z');
    // 05/01/2026 11:07 BRT.
    expect(formatTimestampBR(d)).toBe('05/01/2026 · 11:07');
  });
});

// -----------------------------------------------------------------------
// 3. iniciaisDoNome
// -----------------------------------------------------------------------

describe('iniciaisDoNome', () => {
  it('nome vazio → "?"', () => {
    expect(iniciaisDoNome('')).toBe('?');
    expect(iniciaisDoNome('   ')).toBe('?');
  });

  it('nome unico → 2 primeiras letras UPPER', () => {
    expect(iniciaisDoNome('Bruno')).toBe('BR');
  });

  it('nome unico com 1 letra → 1 letra UPPER', () => {
    expect(iniciaisDoNome('X')).toBe('X');
  });

  it('nome + sobrenome → primeira letra de cada', () => {
    expect(iniciaisDoNome('Carlos Mendes')).toBe('CM');
    expect(iniciaisDoNome('Ana Beatriz Silva')).toBe('AS');
  });

  it('extra whitespace ignorado', () => {
    expect(iniciaisDoNome('  Carlos   Mendes  ')).toBe('CM');
  });
});

// -----------------------------------------------------------------------
// 4. parseCompanyIdParam
// -----------------------------------------------------------------------

describe('parseCompanyIdParam', () => {
  it('aceita inteiros positivos', () => {
    expect(parseCompanyIdParam('1')).toBe(1);
    expect(parseCompanyIdParam('42')).toBe(42);
    expect(parseCompanyIdParam('12345')).toBe(12345);
  });

  it('rejeita vazio, zero, negativos, decimais, texto', () => {
    expect(parseCompanyIdParam('')).toBeNull();
    expect(parseCompanyIdParam('0')).toBeNull();
    expect(parseCompanyIdParam('-1')).toBeNull();
    expect(parseCompanyIdParam('1.5')).toBeNull();
    expect(parseCompanyIdParam('abc')).toBeNull();
    expect(parseCompanyIdParam('1a')).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 5. Smoke: actions importáveis
// -----------------------------------------------------------------------

describe('onboarding-lideres actions smoke', () => {
  it('listOnboardingCardsAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/onboarding-lideres/actions');
    expect(typeof mod.listOnboardingCardsAction).toBe('function');
  });

  it('updateOnboardingStageAction é importável', async () => {
    const mod = await import('../../src/app/super-admin/empresa/[id]/onboarding-lideres/actions');
    expect(typeof mod.updateOnboardingStageAction).toBe('function');
  });
});

// -----------------------------------------------------------------------
// 6. Smoke: OnboardingLideresClient importável
// -----------------------------------------------------------------------

describe('OnboardingLideresClient smoke', () => {
  it('componente é importável', async () => {
    const path =
      '../../src/app/super-admin/empresa/[id]/onboarding-lideres/OnboardingLideresClient';
    const mod = await import(path);
    expect(typeof mod.OnboardingLideresClient).toBe('function');
  });
});
