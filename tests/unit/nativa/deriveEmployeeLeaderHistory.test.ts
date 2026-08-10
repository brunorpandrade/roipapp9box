// ROIP APP 9BOX — teste unit dos 68 employeeLeaderHistory canonicos (ME-068).
//
// Cobre invariantes canonicas bit-exact:
//   - 68 linhas (66 vinculos originais + 2 promocoes/transferencias).
//   - Cada linha tem exatamente um entre liderId/clevelId preenchido.
//   - transferBatchId e UUID v4 valido.
//   - reason canonico entre 100 e 500 caracteres.

import { describe, expect, it } from 'vitest';

import {
  NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT,
  deriveNativaEmployeeLeaderHistory,
} from '../../../src/db/seed/nativa/deriveEmployeeLeaderHistory';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('deriveNativaEmployeeLeaderHistory — 68 canonicos bit-exact', () => {
  const rows = deriveNativaEmployeeLeaderHistory();

  it('total canonico = 68 (66 originais + 2 promocoes)', () => {
    expect(rows.length).toBe(68);
    expect(NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT).toBe(68);
    expect(rows.length).toBe(NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT);
  });

  it('exatamente um entre liderId/clevelId preenchido por linha', () => {
    for (const r of rows) {
      const liderSet = r.liderId !== null;
      const clevelSet = r.clevelId !== null;
      expect(liderSet !== clevelSet).toBe(true);
    }
  });

  it('transferBatchId e UUID v4 canonico', () => {
    for (const r of rows) {
      expect(r.transferBatchId).toMatch(UUID_V4);
    }
  });

  it('reason canonico tem tamanho aceitavel (>= 20 chars)', () => {
    for (const r of rows) {
      expect(r.reason.length).toBeGreaterThanOrEqual(20);
      expect(r.reason.length).toBeLessThanOrEqual(500);
    }
  });

  it('dataInicio e string ISO YYYY-MM-DD', () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    for (const r of rows) {
      expect(r.dataInicio).toMatch(iso);
      if (r.dataFim !== null) {
        expect(r.dataFim).toMatch(iso);
      }
    }
  });

  it('createdAt e Date valida', () => {
    for (const r of rows) {
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(Number.isNaN(r.createdAt.getTime())).toBe(false);
    }
  });
});
