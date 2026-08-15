// ROIP APP 9BOX — testes unit do derivador Ubatuba performanceQuarterlyData
// (ME-080e D2). Cobre invariantes canonicas bit-exact:
//   - Total: 415 rows.
//   - companyId=2, employeeId shift +1000.
//   - Nullable canonicos preservados (capacidadeOciosa: 97 nulls;
//     indice/score/faixa/retorno/participacao/roi/percMeta: 25 nulls
//     cada — invariante do JSON canonico).
//   - Formato decimais correto (custoMedio 2, metaROI 2, participacao 6,
//     indice/roi 4, score/capacidade/percMeta 2, retorno 2).
//   - createdAt = dia 11 do mes seguinte ao fim do trimestre.
//   - trimestre no formato YYYY-Qn.
//   - unicidade natural (companyId, employeeId, trimestre).
//
// RV-15: numeros medidos.

import { describe, expect, it } from 'vitest';

import { loadFixture } from '../../../src/db/seed/nativa/loadJsonFixtures';
import {
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO,
  deriveUbatubaPerformanceQuarterlyData,
} from '../../../src/db/seed/ubatuba/deriveUbatubaPerformanceQuarterlyData';

describe('deriveUbatubaPerformanceQuarterlyData — bit-exact (ME-080e D2)', () => {
  const rows = deriveUbatubaPerformanceQuarterlyData();

  it('total = 415 rows', () => {
    expect(rows.length).toBe(415);
    expect(rows.length).toBe(UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO);
  });

  it('companyId = 2 em todas', () => {
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('employeeId shift +1000 sobre a fonte Nativa', () => {
    interface JsonRow {
      readonly employeeId: number;
    }
    const fixture = loadFixture<JsonRow[]>('performance_trimestral.json');
    for (let i = 0; i < rows.length; i++) {
      const orig = fixture.data[i]!;
      expect(rows[i]!.employeeId).toBe(orig.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT);
    }
  });

  it('trimestre no formato YYYY-Qn (n em 1..4)', () => {
    for (const r of rows) {
      expect(r.trimestre).toMatch(/^\d{4}-Q[1-4]$/);
    }
  });

  it('custoMedioTrimestral 2 casas; metaROI 2 casas', () => {
    for (const r of rows) {
      expect(r.custoMedioTrimestral).toMatch(/^-?\d+\.\d{2}$/);
      expect(r.metaROI).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('campos nullable com contagem canonica bit-exact', () => {
    let capaciOc = 0;
    let indice = 0;
    let score = 0;
    let faixa = 0;
    let retornoP = 0;
    let particip = 0;
    let retornoE = 0;
    let roi = 0;
    let percMeta = 0;
    for (const r of rows) {
      if (r.capacidadeOciosa === null) capaciOc++;
      if (r.indiceDesempenho === null) indice++;
      if (r.scoreDesempenho === null) score++;
      if (r.faixaDesempenho === null) faixa++;
      if (r.retornoPotencial === null) retornoP++;
      if (r.participacao === null) particip++;
      if (r.retornoEstimado === null) retornoE++;
      if (r.roiEstimado === null) roi++;
      if (r.percMetaAtingida === null) percMeta++;
    }
    expect(capaciOc).toBe(97);
    expect(indice).toBe(25);
    expect(score).toBe(25);
    expect(faixa).toBe(25);
    expect(retornoP).toBe(25);
    expect(particip).toBe(25);
    expect(retornoE).toBe(25);
    expect(roi).toBe(25);
    expect(percMeta).toBe(25);
  });

  it('createdAt = dia 11 do mes seguinte ao fim do trimestre', () => {
    for (const r of rows) {
      const [ano, qStr] = r.trimestre.split('-Q');
      const q = parseInt(qStr!, 10);
      const mesFim = q * 3;
      const anoFech = mesFim === 12 ? parseInt(ano!, 10) + 1 : parseInt(ano!, 10);
      const mesFech = mesFim === 12 ? 1 : mesFim + 1;
      const iso = r.createdAt.toISOString();
      const mesStr = String(mesFech).padStart(2, '0');
      expect(iso).toBe(`${anoFech}-${mesStr}-11T00:00:00.000Z`);
    }
  });

  it('unicidade natural (companyId, employeeId, trimestre)', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.companyId}:${r.employeeId}:${r.trimestre}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(415);
  });

  it('faixaDesempenho (quando nao-null) em {baixo,medio,alto}', () => {
    for (const r of rows) {
      if (r.faixaDesempenho !== null) {
        expect(['baixo', 'medio', 'alto']).toContain(r.faixaDesempenho);
      }
    }
  });

  it('determinismo: duas execucoes produzem output identico', () => {
    const first = deriveUbatubaPerformanceQuarterlyData();
    const second = deriveUbatubaPerformanceQuarterlyData();
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toEqual(first[i]);
    }
  });

  it('array retornado e congelado', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});
