// ROIP APP 9BOX — teste de integracao ME-fila2-seed do consumo do JSON
// canonico `individual_profile_placeholders.json` (S366).
//
// Cobertura canonica:
// - `deriveUbatubaProfilePlaceholders` retorna 69 rows com distribuicao
//   canonica: 3 C-levels respondido + 63 employees respondido + 3
//   employees pendente (id shifted +1000).
// - Contagem canonica bit-a-bit ao MD §12.1 (69 rows totais).
// - IDs canonicos dos 3 pendentes: shifted (1028, 1030, 1031)
//   correspondendo a Bruno Henrique (28), Felipe Barros (30), Marcos
//   Vinicius Souza (31) do MD §12.2.
// - C-levels shifted (1001, 1002, 1003) todos respondido em 2026-02-15.
//
// Teste puro contra fixture (sem MySQL) — nao insere no banco. O
// derivador ja e testado indiretamente pelo teste V3 de seed integral
// que ja existe no repo.

import { describe, expect, it } from 'vitest';

import {
  deriveUbatubaProfilePlaceholders,
  UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO,
} from '../../src/db/seed/ubatuba/deriveUbatubaProfilePlaceholders';

describe('ME-fila2-seed — deriveUbatubaProfilePlaceholders consome JSON canonico', () => {
  it('retorna exatamente 69 rows (contagem canonica MD §12.1)', () => {
    const rows = deriveUbatubaProfilePlaceholders();
    expect(rows.length).toBe(UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO);
    expect(rows.length).toBe(69);
  });

  it('distribuicao canonica: 3 clevels + 63 emp respondido + 3 emp pendente', () => {
    const rows = deriveUbatubaProfilePlaceholders();

    const clRespondido = rows.filter((r) => r.userType === 'clevel' && r.status === 'respondido');
    const clPendente = rows.filter((r) => r.userType === 'clevel' && r.status === 'pendente');
    const empRespondido = rows.filter(
      (r) => r.userType === 'employee' && r.status === 'respondido',
    );
    const empPendente = rows.filter((r) => r.userType === 'employee' && r.status === 'pendente');

    expect(clRespondido.length).toBe(3);
    expect(clPendente.length).toBe(0);
    expect(empRespondido.length).toBe(63);
    expect(empPendente.length).toBe(3);
  });

  it('C-levels shifted (1001, 1002, 1003) todos respondido em 2026-02-15', () => {
    const rows = deriveUbatubaProfilePlaceholders();
    const clevels = rows.filter((r) => r.userType === 'clevel');
    const ids = clevels.map((r) => r.userId).sort((a, b) => a - b);
    expect(ids).toEqual([1001, 1002, 1003]);

    for (const cl of clevels) {
      expect(cl.status).toBe('respondido');
      expect(cl.respondidoEm).not.toBeNull();
      expect(cl.respondidoEm?.toISOString().slice(0, 10)).toBe('2026-02-15');
    }
  });

  it('Os 3 pendentes canonicos sao os desligados pre-Perfil: shifted 1028, 1030, 1031', () => {
    // MD §12.2: Bruno Henrique Alves (id=28), Felipe Barros (id=30),
    // Marcos Vinicius Souza (id=31). Shift +1000 aplicado no Ubatuba.
    const rows = deriveUbatubaProfilePlaceholders();
    const pendentes = rows.filter((r) => r.status === 'pendente');
    const ids = pendentes.map((r) => r.userId).sort((a, b) => a - b);
    expect(ids).toEqual([1028, 1030, 1031]);

    for (const p of pendentes) {
      expect(p.userType).toBe('employee');
      expect(p.respondidoEm).toBeNull();
    }
  });

  it('todos os employees respondido tem respondidoEm nao-nulo', () => {
    const rows = deriveUbatubaProfilePlaceholders();
    const empRespondidos = rows.filter(
      (r) => r.userType === 'employee' && r.status === 'respondido',
    );
    for (const emp of empRespondidos) {
      expect(emp.respondidoEm).not.toBeNull();
    }
  });

  it('companyId canonicamente eh UBATUBA_COMPANY_ID (=2) em todas as rows', () => {
    const rows = deriveUbatubaProfilePlaceholders();
    for (const r of rows) {
      expect(r.companyId).toBe(2);
    }
  });

  it('todos os userId de employee estao em faixa canonica 1004..1069', () => {
    const rows = deriveUbatubaProfilePlaceholders();
    const empIds = rows.filter((r) => r.userType === 'employee').map((r) => r.userId);
    for (const id of empIds) {
      expect(id).toBeGreaterThanOrEqual(1004);
      expect(id).toBeLessThanOrEqual(1069);
    }
  });
});
