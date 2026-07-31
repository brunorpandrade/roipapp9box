// ROIP APP 9BOX — teste unit stepM6Channel (ME-059).
// Cobre §8.8 M6 — thin wrapper sobre resolveCanal.

import { describe, expect, it } from 'vitest';

import { stepM6Channel } from '../../src/lib/alerts/pipeline/m6-channel';

describe('stepM6Channel — delegacao para resolveCanal §8.8', () => {
  it('critico → imediato', () => {
    expect(stepM6Channel('critico', 'desempenho_queda_brusca')).toEqual({
      canal: 'imediato',
      motivo: null,
    });
  });
  it('atencao com override → imediato', () => {
    expect(stepM6Channel('atencao', 'desempenho_estagnacao')).toEqual({
      canal: 'imediato',
      motivo: null,
    });
  });
  it('atencao sem override → digest_semanal', () => {
    expect(stepM6Channel('atencao', 'nr1_fator_critico')).toEqual({
      canal: 'digest_semanal',
      motivo: null,
    });
  });
  it('observacao → digest_semanal', () => {
    expect(stepM6Channel('observacao', 'desempenho_queda_isolada')).toEqual({
      canal: 'digest_semanal',
      motivo: null,
    });
  });
  it('info → null (sem canal)', () => {
    expect(stepM6Channel('info', 'responsavel_financeiro_nomeado')).toEqual({
      canal: null,
      motivo: 'severidade_info',
    });
  });
});
