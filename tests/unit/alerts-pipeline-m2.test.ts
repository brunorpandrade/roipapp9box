// ROIP APP 9BOX — teste unit stepM2Materiality (ME-059).
// Cobre §8.4 P06 canonizada — 3 tipos em escopo com filtro 5pp.

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TIPO_VALUES } from '../../src/db/schema/enums';
import {
  LIMIAR_5PP,
  stepM2Materiality,
  TIPOS_M2,
} from '../../src/lib/alerts/pipeline/m2-materiality';

describe('stepM2Materiality — filtro canonico 5pp §8.4', () => {
  it('LIMIAR_5PP constante canonica = 5.0', () => {
    expect(LIMIAR_5PP).toBe(5.0);
  });

  it('TIPOS_M2 canonicos = 3 tipos', () => {
    expect([...TIPOS_M2].sort()).toEqual(
      ['desempenho_queda_brusca', 'desempenho_queda_isolada', 'divergencia_a_c'].sort(),
    );
  });

  describe('fora do escopo M2 — 14 tipos passam sem verificacao', () => {
    it('todos os demais tipos passam com motivo=fora_escopo_m2', () => {
      const foraEscopo = NOTIFICATION_TIPO_VALUES.filter((t) => !TIPOS_M2.includes(t));
      expect(foraEscopo.length).toBe(14);
      for (const tipo of foraEscopo) {
        const res = stepM2Materiality(tipo, {});
        expect(res.suppress).toBe(false);
        expect(res.motivo).toBe('fora_escopo_m2');
      }
    });
  });

  describe('desempenho_queda_brusca — variacao', () => {
    it('|variacao|=25 → passa (acima_limiar)', () => {
      const res = stepM2Materiality('desempenho_queda_brusca', { variacao: -25 });
      expect(res.suppress).toBe(false);
      expect(res.motivo).toBe('acima_limiar');
      expect(res.valorExtraido).toBe(-25);
    });
    it('|variacao|=5.00 → passa (limite inclusivo — nao suprime)', () => {
      // §8.4 SQL literal: `|variacao| < 5.00` — 5.00 exatamente nao e menor.
      const res = stepM2Materiality('desempenho_queda_brusca', { variacao: -5.0 });
      expect(res.suppress).toBe(false);
      expect(res.motivo).toBe('acima_limiar');
    });
    it('|variacao|=4.99 → suprime (abaixo_limiar)', () => {
      const res = stepM2Materiality('desempenho_queda_brusca', { variacao: -4.99 });
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('abaixo_limiar');
      expect(res.valorExtraido).toBe(-4.99);
    });
    it('sem campo variacao → suprime (sem_valor_material)', () => {
      const res = stepM2Materiality('desempenho_queda_brusca', {});
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('sem_valor_material');
    });
    it('metadados null → suprime (sem_valor_material)', () => {
      const res = stepM2Materiality('desempenho_queda_brusca', null);
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('sem_valor_material');
    });
  });

  describe('desempenho_queda_isolada — mesmo padrao (variacao)', () => {
    it('|variacao|=20 → passa', () => {
      const res = stepM2Materiality('desempenho_queda_isolada', { variacao: -20 });
      expect(res.suppress).toBe(false);
    });
    it('|variacao|=3 → suprime', () => {
      const res = stepM2Materiality('desempenho_queda_isolada', { variacao: -3 });
      expect(res.suppress).toBe(true);
    });
  });

  describe('divergencia_a_c — diferenca (chave distinta)', () => {
    it('extrai `diferenca` em vez de `variacao` para P28', () => {
      const res = stepM2Materiality('divergencia_a_c', { diferenca: 30 });
      expect(res.suppress).toBe(false);
      expect(res.valorExtraido).toBe(30);
    });
    it('|diferenca|=4 → suprime', () => {
      const res = stepM2Materiality('divergencia_a_c', { diferenca: 4 });
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('abaixo_limiar');
    });
    it('P28 com campo variacao (chave errada) → suprime (sem_valor_material)', () => {
      // Guardiao defensivo: se o hook popular chave errada, M2 nao emite.
      const res = stepM2Materiality('divergencia_a_c', { variacao: 30 });
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('sem_valor_material');
    });
  });
});
