// ROIP APP 9BOX — testes unit derivadores D4-final (ME-080e).

import { describe, expect, it } from 'vitest';

import { UBATUBA_COMPANY_ID } from '../../../src/db/seed/ubatuba/constants';
import {
  UBATUBA_IQL_TOTAL_ESPERADO,
  UBATUBA_NINE_BOX_TOTAL_ESPERADO,
  UBATUBA_PLENITUDE_TOTAL_ESPERADO,
  deriveUbatubaIql,
  deriveUbatubaNineBox,
  deriveUbatubaPlenitude,
} from '../../../src/db/seed/ubatuba/deriveUbatubaAggregates';
import {
  UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO,
  UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO,
  UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO,
  deriveUbatubaCopsoqCycle,
  deriveUbatubaCopsoqFactorScores,
  deriveUbatubaCopsoqResponses,
  deriveUbatubaCopsoqSnapshots,
  deriveUbatubaNr1Divergences,
} from '../../../src/db/seed/ubatuba/deriveUbatubaCopsoq';
import {
  UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO,
  UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO,
  deriveUbatubaInstrumentA,
  deriveUbatubaInstrumentC,
  deriveUbatubaInstrumentD,
} from '../../../src/db/seed/ubatuba/deriveUbatubaInstruments';
import {
  UBATUBA_TERMINATION_TOTAL_ESPERADO,
  deriveUbatubaTermination,
} from '../../../src/db/seed/ubatuba/deriveUbatubaTermination';

const FAKE_CICLO_ID = 999;

describe('instrumentos A/C/D — bit-exact (ME-080e D4-final)', () => {
  it('instrumentA: 8020 rows, companyId=2, shift +1000', () => {
    const rows = deriveUbatubaInstrumentA();
    expect(rows.length).toBe(8020);
    expect(rows.length).toBe(UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
      expect(r.employeeId).toBeGreaterThanOrEqual(1004);
      expect(r.employeeId).toBeLessThanOrEqual(1069);
    }
  });

  it('instrumentC: 8020 rows, XOR liderId/clevelId', () => {
    const rows = deriveUbatubaInstrumentC();
    expect(rows.length).toBe(8020);
    expect(rows.length).toBe(UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO);
    for (const r of rows) {
      const temLider = r.liderId !== null;
      const temClevel = r.clevelId !== null;
      expect(temLider !== temClevel).toBe(true);
    }
  });

  it('instrumentD: 4000 rows, XOR liderId/clevelId, versaoInstrumento=1', () => {
    const rows = deriveUbatubaInstrumentD();
    expect(rows.length).toBe(4000);
    expect(rows.length).toBe(UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO);
    for (const r of rows) {
      const temLider = r.liderId !== null;
      const temClevel = r.clevelId !== null;
      expect(temLider !== temClevel).toBe(true);
      expect(r.versaoInstrumento).toBe(1);
    }
  });
});

describe('agregados plenitude/9box/IQL — bit-exact (ME-080e D4-final)', () => {
  it('plenitude: 401 rows, faixaPlenitude enum', () => {
    const rows = deriveUbatubaPlenitude();
    expect(rows.length).toBe(401);
    expect(rows.length).toBe(UBATUBA_PLENITUDE_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
      expect(['baixa', 'media', 'alta']).toContain(r.faixaPlenitude);
      expect(r.employeeId).toBeGreaterThanOrEqual(1004);
    }
  });

  it('nineBox: 387 rows, posicaoX/Y enums, quadrante nao-vazio', () => {
    const rows = deriveUbatubaNineBox();
    expect(rows.length).toBe(387);
    expect(rows.length).toBe(UBATUBA_NINE_BOX_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(['baixo', 'medio', 'alto']).toContain(r.posicaoX);
      expect(['baixa', 'media', 'alta']).toContain(r.posicaoY);
      expect(r.quadrante.length).toBeGreaterThan(0);
    }
  });

  it('iqlData: 45 rows, XOR liderId/clevelId', () => {
    const rows = deriveUbatubaIql();
    expect(rows.length).toBe(45);
    expect(rows.length).toBe(UBATUBA_IQL_TOTAL_ESPERADO);
    for (const r of rows) {
      const temLider = r.liderId !== null;
      const temClevel = r.clevelId !== null;
      expect(temLider !== temClevel).toBe(true);
      expect(r.countRespondentes).toBe(r.countRespondentesElegiveis);
    }
  });
});

describe('COPSOQ + NR-1 — bit-exact (ME-080e D4-final)', () => {
  it('cycle: 1 row, companyId=2, status enum', () => {
    const c = deriveUbatubaCopsoqCycle();
    expect(c.companyId).toBe(UBATUBA_COMPANY_ID);
    expect(['agendado', 'aberto', 'fechado']).toContain(c.status);
    expect(c.dataAbertura).toBeInstanceOf(Date);
    expect(c.dataFechamento).toBeInstanceOf(Date);
  });

  it('snapshots: 51 rows (C-levels filtrados), respondeu=true', () => {
    const rows = deriveUbatubaCopsoqSnapshots(FAKE_CICLO_ID);
    expect(rows.length).toBe(51);
    expect(rows.length).toBe(UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.cicloDbId).toBe(FAKE_CICLO_ID);
      expect(r.respondeu).toBe(true);
      expect(r.employeeId).toBeGreaterThanOrEqual(1004);
    }
  });

  it('responses: 1248 rows (39 emp × 32 itens), itemIndex local ∈ {1..4}', () => {
    const rows = deriveUbatubaCopsoqResponses(FAKE_CICLO_ID);
    expect(rows.length).toBe(1248);
    expect(rows.length).toBe(UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.cicloDbId).toBe(FAKE_CICLO_ID);
      expect(r.itemIndex).toBeGreaterThanOrEqual(1);
      expect(r.itemIndex).toBeLessThanOrEqual(4);
      expect(r.versaoInstrumento).toBe('placeholder_MVP_v1');
    }
  });

  it('factorScores: 56 rows, escopo enum', () => {
    const rows = deriveUbatubaCopsoqFactorScores(FAKE_CICLO_ID);
    expect(rows.length).toBe(56);
    expect(rows.length).toBe(UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(['empresa', 'departamento', 'agregacao']).toContain(r.escopo);
    }
  });

  it('divergences: 6 rows, escopo=departamento, classificacao enum', () => {
    const rows = deriveUbatubaNr1Divergences(FAKE_CICLO_ID);
    expect(rows.length).toBe(6);
    expect(rows.length).toBe(UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.escopo).toBe('departamento');
      expect(['divergencia_critica', 'divergencia_positiva', 'convergente']).toContain(
        r.classificacao,
      );
    }
  });
});

describe('termination — bit-exact (ME-080e D4-final)', () => {
  it('13 rows, shift +1000, actorTipo enum', () => {
    const rows = deriveUbatubaTermination();
    expect(rows.length).toBe(13);
    expect(rows.length).toBe(UBATUBA_TERMINATION_TOTAL_ESPERADO);
    for (const r of rows) {
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
      expect(r.employeeId).toBeGreaterThanOrEqual(1004);
      expect(['employee', 'superAdmin']).toContain(r.actorTipo);
      expect(['voluntario', 'involuntario']).toContain(r.motivo);
    }
  });
});
