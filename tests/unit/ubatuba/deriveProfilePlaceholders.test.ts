// ROIP APP 9BOX — testes unit deriveUbatubaProfilePlaceholders
// (ME-080e D3, ampliado na ME-fila2-seed D1 aprovada).
// Cobre invariantes bit-exact:
//   - Total 69 rows (3 clevels + 66 employees).
//   - companyId=2 sempre.
//   - Distribuicao canonica S366 vinda do JSON pinado:
//     * 3 C-levels: userType='clevel', userId em {1001,1002,1003},
//       status='respondido', respondidoEm='2026-02-15'.
//     * 63 employees: userType='employee', status='respondido',
//       respondidoEm='2026-02-15' (data canonica do JSON — nao mais
//       derivada de admissao+30d).
//     * 3 employees: userType='employee', userId em {1028,1030,1031}
//       (desligados pre-Perfil), status='pendente', respondidoEm=null.
//   - determinismo.

import { describe, expect, it } from 'vitest';

import { NATIVA_CLEVELS, NATIVA_EMPLOYEES } from '../../../src/db/seed/nativa/constants';
import { UBATUBA_COMPANY_ID } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
  deriveUbatubaProfilePlaceholders,
} from '../../../src/db/seed/ubatuba/deriveUbatubaProfilePlaceholders';

describe('deriveUbatubaProfilePlaceholders — bit-exact (ME-fila2-seed D1)', () => {
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

  it('3 clevels: userType clevel, IDs {1001,1002,1003}, respondido em 2026-02-15', () => {
    const clevels = rows.filter((r) => r.userType === 'clevel');
    expect(clevels.length).toBe(3);
    const ids = clevels.map((r) => r.userId).sort((a, b) => a - b);
    expect(ids).toEqual([1001, 1002, 1003]);
    for (const r of clevels) {
      expect(r.status).toBe('respondido');
      expect(r.respondidoEm).not.toBeNull();
      expect(r.respondidoEm!.toISOString().slice(0, 10)).toBe('2026-02-15');
    }
  });

  it('63 employees respondido: userType employee, IDs [1004..1069], respondidoEm nao-null', () => {
    const empsResp = rows.filter((r) => r.userType === 'employee' && r.status === 'respondido');
    expect(empsResp.length).toBe(63);
    for (const r of empsResp) {
      expect(r.userId).toBeGreaterThanOrEqual(1004);
      expect(r.userId).toBeLessThanOrEqual(1069);
      expect(r.respondidoEm).not.toBeNull();
    }
  });

  it('3 employees pendente: IDs {1028,1030,1031} desligados pre-Perfil, resp null', () => {
    const empsPend = rows.filter((r) => r.userType === 'employee' && r.status === 'pendente');
    expect(empsPend.length).toBe(3);
    const ids = empsPend.map((r) => r.userId).sort((a, b) => a - b);
    expect(ids).toEqual([1028, 1030, 1031]);
    for (const r of empsPend) {
      expect(r.respondidoEm).toBeNull();
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
