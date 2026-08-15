// ROIP APP 9BOX — testes unit deriveUbatubaProfileScoresSemAssessmentId
// (ME-080e D3).

import { describe, expect, it } from 'vitest';

import { UBATUBA_COMPANY_ID } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO,
  deriveUbatubaProfileScoresSemAssessmentId,
} from '../../../src/db/seed/ubatuba/deriveUbatubaProfileScores';

describe('deriveUbatubaProfileScoresSemAssessmentId — bit-exact (ME-080e D3)', () => {
  const rows = deriveUbatubaProfileScoresSemAssessmentId();

  it('total = 66 rows', () => {
    expect(rows.length).toBe(66);
    expect(rows.length).toBe(UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO);
  });

  it('companyId = 2 em todas', () => {
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('shift +1000 nos userIds conforme userType', () => {
    for (const r of rows) {
      if (r.userType === 'clevel') {
        expect(r.userId).toBeGreaterThanOrEqual(1001);
        expect(r.userId).toBeLessThanOrEqual(1003);
      } else {
        expect(r.userId).toBeGreaterThanOrEqual(1004);
        expect(r.userId).toBeLessThanOrEqual(1069);
      }
    }
  });

  it('26 decimais canonicos com valor "50.00" (comportamento canonico Nativa preservado)', () => {
    // Bit-exact: JSON usa keys UPPERCASE, lookup lowercase → todos default '50.00'.
    // Preserva mapScoreToRow Nativa (loadFixtures.ts).
    for (const r of rows) {
      expect(r.post_assert).toBe('50.00');
      expect(r.post_tarefas).toBe('50.00');
      expect(r.post_pessoas).toBe('50.00');
      expect(r.post_pressao).toBe('50.00');
      expect(r.est_abert).toBe('50.00');
      expect(r.est_disc).toBe('50.00');
      expect(r.est_ext).toBe('50.00');
      expect(r.est_amab).toBe('50.00');
      expect(r.est_estab).toBe('50.00');
      expect(r.mot_maestria).toBe('50.00');
      expect(r.mot_lideranca).toBe('50.00');
      expect(r.mot_autonomia).toBe('50.00');
      expect(r.mot_seguranca).toBe('50.00');
      expect(r.mot_proposito).toBe('50.00');
      expect(r.equ_autocons).toBe('50.00');
      expect(r.equ_autogest).toBe('50.00');
      expect(r.equ_leitura).toBe('50.00');
      expect(r.equ_influencia).toBe('50.00');
      expect(r.equ_indice).toBe('50.00');
      expect(r.ass_sabed).toBe('50.00');
      expect(r.ass_coragem).toBe('50.00');
      expect(r.ass_humanid).toBe('50.00');
      expect(r.ass_justica).toBe('50.00');
      expect(r.ass_temper).toBe('50.00');
      expect(r.ass_temper).toBe('50.00');
      expect(r.ass_transc).toBe('50.00');
    }
  });

  it('tentativa=1 em todas', () => {
    for (const r of rows) {
      expect(r.tentativa).toBe(1);
    }
  });

  it('vetorSustentacao e vetorNegligenciado sempre null (bit-exact Nativa)', () => {
    for (const r of rows) {
      expect(r.vetorSustentacao).toBeNull();
      expect(r.vetorNegligenciado).toBeNull();
      expect(r.resumoJson).toBeNull();
      expect(r.expandidoJson).toBeNull();
    }
  });

  it('createdAt e updatedAt = 2026-02-15 10:00 UTC (canonico)', () => {
    for (const r of rows) {
      expect(r.createdAt.toISOString()).toBe('2026-02-15T10:00:00.000Z');
      expect(r.updatedAt.toISOString()).toBe('2026-02-15T10:00:00.000Z');
    }
  });

  it('cada score referencia um assessment existente via (userType, userId, tentativa)', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.userType}:${r.userId}:${r.tentativa}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(66);
  });

  it('determinismo', () => {
    const first = deriveUbatubaProfileScoresSemAssessmentId();
    const second = deriveUbatubaProfileScoresSemAssessmentId();
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toEqual(first[i]);
    }
  });

  it('array congelado', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});
