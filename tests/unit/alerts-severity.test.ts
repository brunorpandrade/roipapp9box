// ROIP APP 9BOX — teste unit resolveCanal (ME-059).
// Cobre §6.3 (regra por severidade) e §6.5 (M6 com overrides).

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TIPO_VALUES } from '../../src/db/schema/enums';
import { resolveCanal } from '../../src/lib/alerts/severity';
import { TIPO_DICTIONARY } from '../../src/lib/alerts/typeDictionary';

describe('resolveCanal — regra canonica §6.5', () => {
  describe('severidade critico', () => {
    it('sempre imediato — sem override possivel', () => {
      // §6.3: `critico → sempre imediato. Sem override possivel.`
      for (const tipo of NOTIFICATION_TIPO_VALUES) {
        expect(resolveCanal('critico', tipo)).toEqual({ canal: 'imediato', motivo: null });
      }
    });
  });

  describe('severidade atencao', () => {
    it('digest_semanal por padrao — tipos sem override', () => {
      // §6.5 regra 2 — tipos atencao FORA da lista de override → digest_semanal.
      const naoOverride = NOTIFICATION_TIPO_VALUES.filter(
        (t) =>
          TIPO_DICTIONARY[t].severidadePadrao === 'atencao' &&
          !TIPO_DICTIONARY[t].override_atencao_imediato,
      );
      expect(naoOverride.length).toBeGreaterThan(0);
      for (const tipo of naoOverride) {
        expect(resolveCanal('atencao', tipo)).toEqual({
          canal: 'digest_semanal',
          motivo: null,
        });
      }
    });

    it('imediato para tipos em lista de override §6.5 — Q2 + T1', () => {
      // Lista canonica §6.5: desempenho_estagnacao (Q2),
      // perfil_inconsistente_primeira + perfil_retest_reincidente (T1),
      // desbloqueio_solicitado + desbloqueio_aprovado + desbloqueio_recusado (T1).
      const override = [
        'desempenho_estagnacao',
        'perfil_inconsistente_primeira',
        'perfil_retest_reincidente',
        'desbloqueio_solicitado',
        'desbloqueio_aprovado',
        'desbloqueio_recusado',
      ] as const;
      for (const tipo of override) {
        expect(resolveCanal('atencao', tipo)).toEqual({ canal: 'imediato', motivo: null });
      }
    });
  });

  describe('severidade observacao', () => {
    it('sempre digest_semanal — sem override possivel', () => {
      for (const tipo of NOTIFICATION_TIPO_VALUES) {
        expect(resolveCanal('observacao', tipo)).toEqual({
          canal: 'digest_semanal',
          motivo: null,
        });
      }
    });
  });

  describe('severidade info', () => {
    it('sem canal — sinaliza motivo severidade_info', () => {
      // §6.5 regra 4: `info` nao gera e-mail. Fim para este destinatario.
      for (const tipo of NOTIFICATION_TIPO_VALUES) {
        expect(resolveCanal('info', tipo)).toEqual({ canal: null, motivo: 'severidade_info' });
      }
    });
  });
});
