// ROIP APP 9BOX — testes unit do derivador Ubatuba employeeLeaderHistory
// (ME-080e D1). Cobre invariantes canonicas bit-exact:
//   - Total: 68 rows (66 iniciais + 2 pos-promocao).
//   - Shift +1000 em employeeId, liderId (nao-null) e clevelId (nao-null).
//   - Exatamente XOR entre liderId e clevelId em cada row (§4.6).
//   - dataFim NOT NULL apenas para 2 rows: employeeId=1047 (Tatiane,
//     2027-06-30) e employeeId=1059 (Beatriz, 2027-03-31).
//   - reason bit-exact herdado de Nativa.
//   - transferBatchId no formato UUID (8-4-4-4-12) e determinista v5.
//   - Determinismo bit-exact: duas execucoes produzem transferBatchIds
//     identicos.
//
// RV-15: numeros medidos, nao estimados. RV-13: derivadores exercitados.

import { describe, expect, it } from 'vitest';

import * as nativaElh from '../../../src/db/seed/nativa/deriveEmployeeLeaderHistory';
import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_ELH_UUID_NAMESPACE_SEED,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from '../../../src/db/seed/ubatuba/constants';
import * as ubatubaElh from '../../../src/db/seed/ubatuba/deriveUbatubaEmployeeLeaderHistory';

const deriveNativaEmployeeLeaderHistory = nativaElh.deriveNativaEmployeeLeaderHistory;
const deriveUbatubaEmployeeLeaderHistory = ubatubaElh.deriveUbatubaEmployeeLeaderHistory;
const derivarUuidV5Deterministico = ubatubaElh.derivarUuidV5Deterministico;
const UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO =
  ubatubaElh.UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deriveUbatubaEmployeeLeaderHistory — bit-exact (ME-080e D1)', () => {
  const rows = deriveUbatubaEmployeeLeaderHistory();

  it('total = 68 rows (66 iniciais + 2 pos-promocao)', () => {
    expect(rows.length).toBe(68);
    expect(rows.length).toBe(UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO);
  });

  it('shift +1000 em employeeId sobre a fonte Nativa', () => {
    const nativa = deriveNativaEmployeeLeaderHistory();
    for (let index = 0; index < rows.length; index++) {
      const u = rows[index]!;
      const n = nativa[index]!;
      expect(u.employeeId).toBe(n.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT);
    }
  });

  it('shift +1000 em liderId (quando nao-null), null preservado', () => {
    const nativa = deriveNativaEmployeeLeaderHistory();
    for (let index = 0; index < rows.length; index++) {
      const u = rows[index]!;
      const n = nativa[index]!;
      if (n.liderId === null) {
        expect(u.liderId).toBeNull();
      } else {
        expect(u.liderId).toBe(n.liderId + UBATUBA_EMPLOYEE_ID_SHIFT);
      }
    }
  });

  it('shift +1000 em clevelId (quando nao-null), null preservado', () => {
    const nativa = deriveNativaEmployeeLeaderHistory();
    for (let index = 0; index < rows.length; index++) {
      const u = rows[index]!;
      const n = nativa[index]!;
      if (n.clevelId === null) {
        expect(u.clevelId).toBeNull();
      } else {
        expect(u.clevelId).toBe(n.clevelId + UBATUBA_CLEVEL_ID_SHIFT);
      }
    }
  });

  it('§4.6 XOR: exatamente um entre liderId e clevelId preenchido por row', () => {
    for (const row of rows) {
      const temLider = row.liderId !== null;
      const temClevel = row.clevelId !== null;
      expect(temLider !== temClevel).toBe(true);
    }
  });

  it('clevelId (quando nao-null) sempre em {1002, 1003} (nunca 1001 no mapping canonico)', () => {
    for (const row of rows) {
      if (row.clevelId !== null) {
        expect([1002, 1003]).toContain(row.clevelId);
      }
    }
  });

  it('dataFim NOT NULL somente para Tatiane (1047) e Beatriz (1059) originais', () => {
    const withDataFim = rows.filter((r) => r.dataFim !== null);
    expect(withDataFim.length).toBe(2);
    const idsComFim = withDataFim.map((r) => r.employeeId).sort((a, b) => a - b);
    expect(idsComFim).toEqual([1047, 1059]);
    const tatiane = rows.find((r) => r.employeeId === 1047 && r.dataFim !== null);
    const beatriz = rows.find((r) => r.employeeId === 1059 && r.dataFim !== null);
    expect(tatiane?.dataFim).toBe('2027-06-30');
    expect(beatriz?.dataFim).toBe('2027-03-31');
  });

  it('dataInicio, reason e createdAt preservados bit-exact de Nativa', () => {
    const nativa = deriveNativaEmployeeLeaderHistory();
    for (let index = 0; index < rows.length; index++) {
      const u = rows[index]!;
      const n = nativa[index]!;
      expect(u.dataInicio).toBe(n.dataInicio);
      expect(u.reason).toBe(n.reason);
      expect(u.createdAt.toISOString()).toBe(n.createdAt.toISOString());
    }
  });

  it('transferBatchId formato UUID v5 valido em todas as 68 rows', () => {
    for (const row of rows) {
      expect(UUID_REGEX.test(row.transferBatchId)).toBe(true);
    }
  });

  it('transferBatchId unico entre as 68 rows', () => {
    const uuids = new Set(rows.map((r) => r.transferBatchId));
    expect(uuids.size).toBe(68);
  });

  it('determinismo bit-exact: duas execucoes produzem transferBatchIds identicos', () => {
    const first = deriveUbatubaEmployeeLeaderHistory();
    const second = deriveUbatubaEmployeeLeaderHistory();
    expect(first.length).toBe(second.length);
    for (let index = 0; index < first.length; index++) {
      expect(second[index]!.transferBatchId).toBe(first[index]!.transferBatchId);
      expect(second[index]!.employeeId).toBe(first[index]!.employeeId);
    }
  });

  it('array retornado e congelado (Object.freeze)', () => {
    expect(Object.isFrozen(rows)).toBe(true);
  });
});

describe('derivarUuidV5Deterministico — invariantes RFC 4122 §4.3', () => {
  it('produz UUID no formato 8-4-4-4-12 com versao 5', () => {
    const uuid = derivarUuidV5Deterministico(UBATUBA_ELH_UUID_NAMESPACE_SEED, 'elh:0');
    expect(UUID_REGEX.test(uuid)).toBe(true);
    expect(uuid.charAt(14)).toBe('5');
  });

  it('bit-exact para mesmo (namespaceSeed, name)', () => {
    const first = derivarUuidV5Deterministico('ns:test', 'name:1');
    const second = derivarUuidV5Deterministico('ns:test', 'name:1');
    expect(first).toBe(second);
  });

  it('names diferentes produzem UUIDs diferentes', () => {
    const a = derivarUuidV5Deterministico('ns:test', 'name:a');
    const b = derivarUuidV5Deterministico('ns:test', 'name:b');
    expect(a).not.toBe(b);
  });

  it('namespaces diferentes produzem UUIDs diferentes para mesmo name', () => {
    const a = derivarUuidV5Deterministico('ns:A', 'name:x');
    const b = derivarUuidV5Deterministico('ns:B', 'name:x');
    expect(a).not.toBe(b);
  });
});
