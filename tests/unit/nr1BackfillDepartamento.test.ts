// ROIP APP 9BOX — teste unit da derivacao do backfill cirurgico de
// `copsoqCycleSnapshot.departamentoId` (ME-1.3c CC079-v5).
//
// Valida a logica pura `derivarUpdatesBackfillDepartamento`, extraida
// do script `scripts/backfillSnapshotDepartamentoNativa.ts`. Sem IO.

import { describe, expect, it } from 'vitest';

import {
  type BackfillDerivation,
  type DepartamentoRow,
  derivarUpdatesBackfillDepartamento,
  type EmployeeNomeDepartamentoRow,
  type SnapshotNullRow,
} from '../../scripts/backfillSnapshotDepartamentoNativa';

const DEPARTAMENTOS_CANONICOS: readonly DepartamentoRow[] = [
  { id: 1, nome: 'Comercial' },
  { id: 2, nome: 'Marketing' },
  { id: 3, nome: 'Operações' },
  { id: 7, nome: 'Financeiro' },
  { id: 9, nome: 'Recursos Humanos' },
];

describe('derivarUpdatesBackfillDepartamento', () => {
  it('nao gera update quando nao ha snapshot null', () => {
    const r = derivarUpdatesBackfillDepartamento([], [], DEPARTAMENTOS_CANONICOS);
    expect(r.updates).toEqual([]);
    expect(r.naoResolvidosEmployeeAusente).toBe(0);
    expect(r.naoResolvidosNomeDepartamentoAusente).toBe(0);
  });

  it('resolve corretamente o departamentoId pelo nome do enum', () => {
    const snapshots: SnapshotNullRow[] = [
      { id: 100, employeeId: 10 },
      { id: 101, employeeId: 11 },
      { id: 102, employeeId: 12 },
    ];
    const emps: EmployeeNomeDepartamentoRow[] = [
      { id: 10, departamento: 'Comercial' },
      { id: 11, departamento: 'Financeiro' },
      { id: 12, departamento: 'Recursos Humanos' },
    ];
    const r: BackfillDerivation = derivarUpdatesBackfillDepartamento(
      snapshots,
      emps,
      DEPARTAMENTOS_CANONICOS,
    );
    expect(r.updates).toEqual([
      { snapshotId: 100, departamentoId: 1 },
      { snapshotId: 101, departamentoId: 7 },
      { snapshotId: 102, departamentoId: 9 },
    ]);
    expect(r.naoResolvidosEmployeeAusente).toBe(0);
    expect(r.naoResolvidosNomeDepartamentoAusente).toBe(0);
  });

  it('conta employee ausente quando o id do snapshot nao esta em employees', () => {
    const snapshots: SnapshotNullRow[] = [
      { id: 200, employeeId: 999 }, // nao existe em employees
      { id: 201, employeeId: 20 },
    ];
    const emps: EmployeeNomeDepartamentoRow[] = [{ id: 20, departamento: 'Operações' }];
    const r = derivarUpdatesBackfillDepartamento(snapshots, emps, DEPARTAMENTOS_CANONICOS);
    expect(r.updates).toEqual([{ snapshotId: 201, departamentoId: 3 }]);
    expect(r.naoResolvidosEmployeeAusente).toBe(1);
    expect(r.naoResolvidosNomeDepartamentoAusente).toBe(0);
  });

  it('conta nome de departamento ausente quando o enum nao casa com departments.nome', () => {
    const snapshots: SnapshotNullRow[] = [
      { id: 300, employeeId: 30 },
      { id: 301, employeeId: 31 },
    ];
    const emps: EmployeeNomeDepartamentoRow[] = [
      // `Logística` existe no enum DEPARTAMENTO_VALUES mas nao esta
      // na lista reduzida DEPARTAMENTOS_CANONICOS do teste — simula
      // ausencia em departments.
      { id: 30, departamento: 'Logística' },
      { id: 31, departamento: 'Marketing' },
    ];
    const r = derivarUpdatesBackfillDepartamento(snapshots, emps, DEPARTAMENTOS_CANONICOS);
    expect(r.updates).toEqual([{ snapshotId: 301, departamentoId: 2 }]);
    expect(r.naoResolvidosEmployeeAusente).toBe(0);
    expect(r.naoResolvidosNomeDepartamentoAusente).toBe(1);
  });

  it('e idempotente — mesma entrada produz mesma saida bit-exact', () => {
    const snapshots: SnapshotNullRow[] = [{ id: 1, employeeId: 10 }];
    const emps: EmployeeNomeDepartamentoRow[] = [{ id: 10, departamento: 'Comercial' }];
    const a = derivarUpdatesBackfillDepartamento(snapshots, emps, DEPARTAMENTOS_CANONICOS);
    const b = derivarUpdatesBackfillDepartamento(snapshots, emps, DEPARTAMENTOS_CANONICOS);
    expect(a).toEqual(b);
  });

  it('preserva a ordem dos snapshots originais nas updates', () => {
    const snapshots: SnapshotNullRow[] = [
      { id: 50, employeeId: 500 },
      { id: 51, employeeId: 501 },
      { id: 52, employeeId: 502 },
    ];
    const emps: EmployeeNomeDepartamentoRow[] = [
      { id: 500, departamento: 'Marketing' },
      { id: 501, departamento: 'Comercial' },
      { id: 502, departamento: 'Financeiro' },
    ];
    const r = derivarUpdatesBackfillDepartamento(snapshots, emps, DEPARTAMENTOS_CANONICOS);
    expect(r.updates.map((u) => u.snapshotId)).toEqual([50, 51, 52]);
  });
});
