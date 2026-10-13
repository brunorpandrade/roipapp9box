// ROIP APP 9BOX — Testes unit do catalogo canonico de motivos de
// inconsistencia do Perfil Individual (ME-1.11 do ROADMAP_V3).
//
// Escopo: 15 cenarios canonicos cobrindo as 3 severidades (ok, medio,
// critico) x 5 subindices (att, soc, acq, cons, ext) + ordem de
// severidade + filtro de ok + formato de retorno. Protege contra drift
// silencioso dos thresholds em relacao ao motor
// `individualProfileEngine.ts` (D-THRESHOLDS-SHARED).
//
// RV-14: um statement por linha, largura maxima 100 cols.
// RV-13: cobre o export `classificarMotivosInconsistencia` e o
//   `MOTIVO_LABELS` do modulo canonico.

import { describe, expect, it } from 'vitest';

import {
  classificarMotivosInconsistencia,
  MOTIVO_LABELS,
  type MotivoKey,
  type SubescalaScores,
} from '../../src/lib/instruments/individualProfileReliabilityLabels';

const SCORES_OK: SubescalaScores = {
  ia_att: '2',
  ia_soc: '0',
  ia_acq: '0',
  ia_cons: '0',
  ia_ext: '0.50',
};

function withOverride(base: SubescalaScores, override: Partial<SubescalaScores>): SubescalaScores {
  return { ...base, ...override };
}

describe('ME-1.11 — MOTIVO_LABELS canonico', () => {
  it('expoe os 5 subindices canonicos com titulo e descricao', () => {
    const chaves: readonly MotivoKey[] = ['ia_att', 'ia_soc', 'ia_acq', 'ia_cons', 'ia_ext'];
    for (const chave of chaves) {
      const label = MOTIVO_LABELS[chave];
      expect(label.titulo.length).toBeGreaterThan(0);
      expect(label.descricao.length).toBeGreaterThan(0);
    }
  });

  it('nenhum titulo expoe termo tecnico sem traducao (DOC 03 §6.7)', () => {
    const termosProibidos = ['aquiescencia', 'construto', 'faceta', 'traco'];
    const todos = Object.values(MOTIVO_LABELS);
    for (const t of termosProibidos) {
      for (const label of todos) {
        expect(label.titulo.toLowerCase()).not.toContain(t);
      }
    }
  });
});

describe('ME-1.11 — classificarMotivosInconsistencia severidade por subescala', () => {
  // ----- ia_att (§5.1.1): 0-2. ok=2, medio=1, critico=0 -----

  it('ia_att score 2 retorna vazio (ok)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_att: '2' }));
    expect(resp.find((m) => m.chave === 'ia_att')).toBeUndefined();
  });

  it('ia_att score 1 retorna medio', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_att: '1' }));
    const motivo = resp.find((m) => m.chave === 'ia_att');
    expect(motivo?.severidade).toBe('medio');
  });

  it('ia_att score 0 retorna critico', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_att: '0' }));
    const motivo = resp.find((m) => m.chave === 'ia_att');
    expect(motivo?.severidade).toBe('critico');
  });

  // ----- ia_soc (§5.1.2): 0-6. ok<=1, medio<=3, critico>3 -----

  it('ia_soc score 1 retorna vazio (ok)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_soc: '1' }));
    expect(resp.find((m) => m.chave === 'ia_soc')).toBeUndefined();
  });

  it('ia_soc score 3 retorna medio', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_soc: '3' }));
    const motivo = resp.find((m) => m.chave === 'ia_soc');
    expect(motivo?.severidade).toBe('medio');
  });

  it('ia_soc score 4 retorna critico', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_soc: '4' }));
    const motivo = resp.find((m) => m.chave === 'ia_soc');
    expect(motivo?.severidade).toBe('critico');
  });

  // ----- ia_acq (§5.1.3): 0-1. ok=0, medio=1 (nunca critico) -----

  it('ia_acq score 0 retorna vazio (ok)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_acq: '0' }));
    expect(resp.find((m) => m.chave === 'ia_acq')).toBeUndefined();
  });

  it('ia_acq score 1 retorna medio (nunca critico neste subindice)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_acq: '1' }));
    const motivo = resp.find((m) => m.chave === 'ia_acq');
    expect(motivo?.severidade).toBe('medio');
  });

  it('ia_acq nao emite critico mesmo com entrada extrema', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_acq: '1' }));
    const motivo = resp.find((m) => m.chave === 'ia_acq');
    expect(motivo?.severidade).not.toBe('critico');
  });

  // ----- ia_cons (§5.1.4): 0-6. ok<=1, medio=2, critico>2 -----

  it('ia_cons score 1 retorna vazio (ok)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_cons: '1' }));
    expect(resp.find((m) => m.chave === 'ia_cons')).toBeUndefined();
  });

  it('ia_cons score 2 retorna medio', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_cons: '2' }));
    const motivo = resp.find((m) => m.chave === 'ia_cons');
    expect(motivo?.severidade).toBe('medio');
  });

  it('ia_cons score 3 retorna critico', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_cons: '3' }));
    const motivo = resp.find((m) => m.chave === 'ia_cons');
    expect(motivo?.severidade).toBe('critico');
  });

  // ----- ia_ext (§5.1.5): 0-1 (proporcao). ok<=0.6, medio<=0.75, critico>0.75 -----

  it('ia_ext score 0.60 retorna vazio (ok)', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_ext: '0.60' }));
    expect(resp.find((m) => m.chave === 'ia_ext')).toBeUndefined();
  });

  it('ia_ext score 0.75 retorna medio', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_ext: '0.75' }));
    const motivo = resp.find((m) => m.chave === 'ia_ext');
    expect(motivo?.severidade).toBe('medio');
  });

  it('ia_ext score 0.80 retorna critico', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_ext: '0.80' }));
    const motivo = resp.find((m) => m.chave === 'ia_ext');
    expect(motivo?.severidade).toBe('critico');
  });
});

describe('ME-1.11 — classificarMotivosInconsistencia ordem e filtro', () => {
  it('ordena criticos antes de medios', () => {
    const resp = classificarMotivosInconsistencia({
      ia_att: '1', // medio
      ia_soc: '4', // critico
      ia_acq: '0', // ok (filtrado)
      ia_cons: '3', // critico
      ia_ext: '0.70', // medio
    });
    expect(resp).toHaveLength(4);
    const [m0, m1, m2, m3] = resp;
    expect(m0?.severidade).toBe('critico');
    expect(m1?.severidade).toBe('critico');
    expect(m2?.severidade).toBe('medio');
    expect(m3?.severidade).toBe('medio');
  });

  it('preserva ordem canonica do DOC 03 §5.1 dentro da mesma severidade', () => {
    const resp = classificarMotivosInconsistencia({
      ia_att: '0', // critico
      ia_soc: '4', // critico
      ia_acq: '0', // ok
      ia_cons: '3', // critico
      ia_ext: '0.60', // ok
    });
    const chaves = resp.map((m) => m.chave);
    expect(chaves).toEqual(['ia_att', 'ia_soc', 'ia_cons']);
  });

  it('filtra todos os motivos ok', () => {
    const resp = classificarMotivosInconsistencia(SCORES_OK);
    expect(resp).toHaveLength(0);
  });

  it('filtra scores null silenciosamente', () => {
    const resp = classificarMotivosInconsistencia({
      ia_att: null,
      ia_soc: '4',
      ia_acq: null,
      ia_cons: null,
      ia_ext: null,
    });
    expect(resp).toHaveLength(1);
    expect(resp[0]?.chave).toBe('ia_soc');
  });

  it('filtra scores nao-finitos silenciosamente', () => {
    const resp = classificarMotivosInconsistencia({
      ia_att: 'abc',
      ia_soc: '4',
      ia_acq: null,
      ia_cons: null,
      ia_ext: null,
    });
    expect(resp).toHaveLength(1);
    expect(resp[0]?.chave).toBe('ia_soc');
  });

  it('cada motivo retorna titulo e descricao do catalogo canonico', () => {
    const resp = classificarMotivosInconsistencia(withOverride(SCORES_OK, { ia_att: '0' }));
    expect(resp).toHaveLength(1);
    const motivo = resp[0];
    expect(motivo?.titulo).toBe(MOTIVO_LABELS.ia_att.titulo);
    expect(motivo?.descricao).toBe(MOTIVO_LABELS.ia_att.descricao);
  });
});
