// ROIP APP 9BOX — testes unit dos derivadores Ubatuba performanceData
// e performanceVariableData (ME-080e D2). Cobre invariantes canonicas
// bit-exact:
//   - performanceData: 1210 rows, employeeId shift +1000, companyId=2,
//     custoTotalMes formato decimal 2 casas, faltas inteiro, diasUteis
//     sempre 22, assiduidade 2 casas, indiceDesempenho 4 casas,
//     createdAt = <mes>-11T00:00:00Z.
//   - performanceVariableData: 4840 rows derivados quando indice
//     completo passado; erro claro quando chave ausente.
//   - unicidade natural (companyId, employeeId, mes) para performanceData.
//   - determinismo: 2 execucoes produzem output identico.
//
// RV-15: numeros medidos. RV-13: derivadores exercitados.

import { describe, expect, it } from 'vitest';

import { loadFixture } from '../../../src/db/seed/nativa/loadJsonFixtures';
import {
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO,
  UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO,
  deriveUbatubaPerformanceData,
  deriveUbatubaPerformanceVariables,
} from '../../../src/db/seed/ubatuba/deriveUbatubaPerformanceData';

describe('deriveUbatubaPerformanceData — bit-exact (ME-080e D2)', () => {
  const rows = deriveUbatubaPerformanceData();

  it('total = 1210 rows', () => {
    expect(rows.length).toBe(1210);
    expect(rows.length).toBe(UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO);
  });

  it('companyId = 2 em todas as rows', () => {
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('employeeId shift +1000 sobre a fonte Nativa', () => {
    interface JsonRow {
      readonly employeeId: number;
    }
    const fixture = loadFixture<JsonRow[]>('performance_mensal.json');
    for (let i = 0; i < rows.length; i++) {
      const orig = fixture.data[i]!;
      expect(rows[i]!.employeeId).toBe(orig.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT);
      expect(rows[i]!.employeeId).toBeGreaterThanOrEqual(1004);
      expect(rows[i]!.employeeId).toBeLessThanOrEqual(1069);
    }
  });

  it('diasUteis = 22 em todas as rows (constante canonica)', () => {
    for (const r of rows) {
      expect(r.diasUteis).toBe(22);
    }
  });

  it('custoTotalMes com 2 casas decimais (formato string)', () => {
    for (const r of rows) {
      expect(r.custoTotalMes).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('assiduidade com 2 casas decimais', () => {
    for (const r of rows) {
      expect(r.assiduidade).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('indiceDesempenho com 4 casas decimais', () => {
    for (const r of rows) {
      expect(r.indiceDesempenho).toMatch(/^\d+\.\d{4}$/);
    }
  });

  it('createdAt = dia 11 do mes de referencia (00:00 UTC)', () => {
    for (const r of rows) {
      const iso = r.createdAt.toISOString();
      expect(iso).toBe(`${r.mes}-11T00:00:00.000Z`);
    }
  });

  it('unicidade natural (companyId, employeeId, mes)', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.companyId}:${r.employeeId}:${r.mes}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(1210);
  });

  it('mes no formato YYYY-MM', () => {
    for (const r of rows) {
      expect(r.mes).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('determinismo: duas execucoes produzem arrays com mesmos valores', () => {
    const first = deriveUbatubaPerformanceData();
    const second = deriveUbatubaPerformanceData();
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toEqual(first[i]);
    }
  });

  it('array retornado e congelado', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});

describe('deriveUbatubaPerformanceVariables — bit-exact (ME-080e D2)', () => {
  // Constroi um indice sintetico {employeeId:mes -> id fake sequencial}
  // partindo dos rows canonicos, para exercitar o derivador sem MySQL.
  const perfDataRows = deriveUbatubaPerformanceData();
  const idx = new Map<string, number>();
  perfDataRows.forEach((r, i) => idx.set(`${r.employeeId}:${r.mes}`, 10_000 + i));
  const varRows = deriveUbatubaPerformanceVariables(idx);

  it('total = 4840 rows (1210 rows × ~4 variables cada)', () => {
    expect(varRows.length).toBe(4840);
    expect(varRows.length).toBe(UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO);
  });

  it('performanceDataId sempre no range do indice sintetico', () => {
    for (const v of varRows) {
      expect(v.performanceDataId).toBeGreaterThanOrEqual(10_000);
      expect(v.performanceDataId).toBeLessThan(10_000 + 1210);
    }
  });

  it('variableIndex sempre em {0,1,2,3} (invariante canonico)', () => {
    for (const v of varRows) {
      expect([0, 1, 2, 3]).toContain(v.variableIndex);
    }
  });

  it('demanda/executado com 2 casas; desempenho com 4; peso com 2', () => {
    for (const v of varRows) {
      expect(v.demanda).toMatch(/^\d+\.\d{2}$/);
      expect(v.executado).toMatch(/^\d+\.\d{2}$/);
      expect(v.desempenho).toMatch(/^-?\d+\.\d{4}$/);
      expect(v.peso).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('unicidade natural (performanceDataId, variableIndex)', () => {
    const seen = new Set<string>();
    for (const v of varRows) {
      const key = `${v.performanceDataId}:${v.variableIndex}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(4840);
  });

  it('erro claro se chave employeeId:mes ausente do indice', () => {
    expect(() => deriveUbatubaPerformanceVariables(new Map())).toThrow(
      /performanceDataId nao encontrado/,
    );
  });

  it('array retornado e congelado', () => {
    expect(Object.isFrozen(varRows)).toBe(true);
  });
});
