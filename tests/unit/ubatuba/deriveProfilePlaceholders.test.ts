// ROIP APP 9BOX — testes unit deriveUbatubaProfilePlaceholders
// (ME-080e D3). Cobre invariantes bit-exact:
//   - Total 69 rows (3 clevels + 66 employees).
//   - companyId=2 sempre.
//   - clevels: userType='clevel', userId em {1001,1002,1003},
//     status='pendente', respondidoEm=null.
//   - employees: userType='employee', userId em [1004..1069],
//     status='respondido', respondidoEm=max(admissao+30d, 2026-02-15).
//   - determinismo.

import { describe, expect, it } from 'vitest';

import { NATIVA_CLEVELS, NATIVA_EMPLOYEES } from '../../../src/db/seed/nativa/constants';
import { UBATUBA_COMPANY_ID } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
  deriveUbatubaProfilePlaceholders,
} from '../../../src/db/seed/ubatuba/deriveUbatubaProfilePlaceholders';

describe('deriveUbatubaProfilePlaceholders — bit-exact (ME-080e D3)', () => {
  const rows = deriveUbatubaProfilePlaceholders();

  it('total = 69 rows (3 clevels + 66 employees)', () => {
    expect(rows.length).toBe(69);
    expect(rows.length).toBe(UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO);
  });

  it('companyId = 2 em todas', () => {
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('3 clevels: userType clevel, IDs {1001,1002,1003}, pendente, respondidoEm null', () => {
    const clevels = rows.filter((r) => r.userType === 'clevel');
    expect(clevels.length).toBe(3);
    const ids = clevels.map((r) => r.userId).sort((a, b) => a - b);
    expect(ids).toEqual([1001, 1002, 1003]);
    for (const r of clevels) {
      expect(r.status).toBe('pendente');
      expect(r.respondidoEm).toBeNull();
    }
  });

  it('66 employees: userType employee, IDs [1004..1069], respondido, respondidoEm nao-null', () => {
    const emps = rows.filter((r) => r.userType === 'employee');
    expect(emps.length).toBe(66);
    for (const r of emps) {
      expect(r.userId).toBeGreaterThanOrEqual(1004);
      expect(r.userId).toBeLessThanOrEqual(1069);
      expect(r.status).toBe('respondido');
      expect(r.respondidoEm).not.toBeNull();
    }
  });

  it('respondidoEm = max(admissao+30d, 2026-02-15) para cada employee', () => {
    const emps = rows.filter((r) => r.userType === 'employee');
    const dataMinima = new Date('2026-02-15T10:00:00.000Z').getTime();
    for (const r of emps) {
      const empId = r.userId - 1000;
      const nEmp = NATIVA_EMPLOYEES.find((e) => e.id === empId);
      expect(nEmp).toBeDefined();
      const admissao = new Date(nEmp!.dataAdmissao).getTime();
      const trintaDias = admissao + 30 * 24 * 3600 * 1000;
      const esperado = trintaDias > dataMinima ? trintaDias : dataMinima;
      expect(r.respondidoEm!.getTime()).toBe(esperado);
    }
  });

  it('createdAt = data de admissao 10:00 UTC (clevel e employee)', () => {
    for (const r of rows) {
      if (r.userType === 'clevel') {
        const cl = NATIVA_CLEVELS.find((c) => c.id === r.userId - 1000);
        expect(cl).toBeDefined();
        expect(r.createdAt.toISOString()).toBe(`${cl!.dataAdmissao}T10:00:00.000Z`);
      } else {
        const emp = NATIVA_EMPLOYEES.find((e) => e.id === r.userId - 1000);
        expect(emp).toBeDefined();
        expect(r.createdAt.toISOString()).toBe(`${emp!.dataAdmissao}T10:00:00.000Z`);
      }
    }
  });

  it('determinismo: duas execucoes produzem output identico', () => {
    const first = deriveUbatubaProfilePlaceholders();
    const second = deriveUbatubaProfilePlaceholders();
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toEqual(first[i]);
    }
  });

  it('array congelado', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});
