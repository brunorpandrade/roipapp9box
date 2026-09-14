// ROIP APP 9BOX — teste de integracao ME-fila2-seed do derivador
// `deriveOpenNr1Cycle` (src/db/seed/nativa/deriveOpenNr1Cycle.ts).
//
// Cobertura canonica:
// - Row canonica: `ciclo='2026-Q3-CORRENTE'`, `dataAbertura=2026-09-15`,
//   `dataFechamento=2026-10-30`, `status='aberto'`, `abertoEm=2026-09-15`,
//   `configuradoPorSuperAdminId=1`.
// - Determinismo: mesma companyId produz mesma row.
// - `NATIVA_OPEN_NR1_DATA_ABERTURA` constante canonica exportada.

import { describe, expect, it } from 'vitest';

import {
  deriveOpenNr1Cycle,
  NATIVA_OPEN_NR1_DATA_ABERTURA,
} from '../../src/db/seed/nativa/deriveOpenNr1Cycle';

describe('ME-fila2-seed — deriveOpenNr1Cycle (D2 aprovada Opcao B)', () => {
  it('retorna row canonica bit-a-bit para NATIVA_COMPANY_ID=1', () => {
    const row = deriveOpenNr1Cycle(1);
    expect(row.companyId).toBe(1);
    expect(row.ciclo).toBe('2026-Q3-CORRENTE');
    expect(row.status).toBe('aberto');
    expect(row.configuradoPorSuperAdminId).toBe(1);
  });

  it('datas canonicas: abertura 2026-09-15, fechamento 2026-10-30', () => {
    const row = deriveOpenNr1Cycle(1);
    expect(row.dataAbertura.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(row.dataFechamento.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    expect(row.abertoEm.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(row.createdAt.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('idempotencia canonica: duas chamadas produzem mesmas datas', () => {
    const r1 = deriveOpenNr1Cycle(1);
    const r2 = deriveOpenNr1Cycle(1);
    expect(r1.dataAbertura.getTime()).toBe(r2.dataAbertura.getTime());
    expect(r1.dataFechamento.getTime()).toBe(r2.dataFechamento.getTime());
    expect(r1.ciclo).toBe(r2.ciclo);
  });

  it('constante canonica NATIVA_OPEN_NR1_DATA_ABERTURA exportada', () => {
    expect(NATIVA_OPEN_NR1_DATA_ABERTURA).toBe('2026-09-15');
  });
});
