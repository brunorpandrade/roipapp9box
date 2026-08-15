// ROIP APP 9BOX — testes unit deriveUbatubaProfileAssessments (ME-080e D3).

import { describe, expect, it } from 'vitest';

import { UBATUBA_COMPANY_ID } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO,
  deriveUbatubaProfileAssessments,
} from '../../../src/db/seed/ubatuba/deriveUbatubaProfileAssessments';

describe('deriveUbatubaProfileAssessments — bit-exact (ME-080e D3)', () => {
  const rows = deriveUbatubaProfileAssessments();

  it('total = 66 rows (3 clevels + 63 employees)', () => {
    expect(rows.length).toBe(66);
    expect(rows.length).toBe(UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO);
    const clevels = rows.filter((r) => r.userType === 'clevel');
    const emps = rows.filter((r) => r.userType === 'employee');
    expect(clevels.length).toBe(3);
    expect(emps.length).toBe(63);
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

  it('tentativa=1, blocoAtual=10, blocosCompletos=[1..10] em todas', () => {
    for (const r of rows) {
      expect(r.tentativa).toBe(1);
      expect(r.blocoAtual).toBe(10);
      expect(r.blocosCompletos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('status normalizado — respondido → enviado', () => {
    for (const r of rows) {
      expect(['em_andamento', 'enviado', 'inconsistente']).toContain(r.status);
    }
  });

  it('confiabilidadeNivel em enum canonico', () => {
    for (const r of rows) {
      expect(['alta', 'moderada', 'baixa']).toContain(r.confiabilidadeNivel);
    }
  });

  it('respostas: objeto com chaves ITEM_XXX (80 items ou vazio)', () => {
    let comRespostas = 0;
    for (const r of rows) {
      const keys = Object.keys(r.respostas);
      if (keys.length > 0) {
        comRespostas++;
        for (const k of keys) {
          expect(k).toMatch(/^ITEM_\d{3}$/);
        }
      }
    }
    // Todos os 66 devem ter 80 respostas (5280 total / 66 = 80).
    expect(comRespostas).toBe(66);
  });

  it('total de itens em respostas = 5280 (5280 responses / 66 assessments)', () => {
    let totalItens = 0;
    for (const r of rows) {
      totalItens += Object.keys(r.respostas).length;
    }
    expect(totalItens).toBe(5280);
  });

  it('unicidade natural (userType, userId, tentativa)', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.userType}:${r.userId}:${r.tentativa}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(66);
  });

  it('determinismo: duas execucoes produzem output identico', () => {
    const first = deriveUbatubaProfileAssessments();
    const second = deriveUbatubaProfileAssessments();
    for (let i = 0; i < first.length; i++) {
      expect(second[i]!.userId).toBe(first[i]!.userId);
      expect(second[i]!.userType).toBe(first[i]!.userType);
      const firstLen = Object.keys(first[i]!.respostas).length;
      const secondLen = Object.keys(second[i]!.respostas).length;
      expect(secondLen).toBe(firstLen);
    }
  });

  it('array congelado', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});
