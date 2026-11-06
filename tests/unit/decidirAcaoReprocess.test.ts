// ROIP APP 9BOX — ME-REPROC-IASOC: teste unit da decisao pura
// `decidirAcaoReprocess`. Sem IO (os `computeIa*` + `classifyReliability`
// + `normalizeRespostas` sao puros), entao roda no CI sem MySQL — regua
// de aceite RV-03 desta ME. Prova a discriminacao nos dois sentidos:
// respostas que passam sob a regua nova -> reprocessa; att=0 -> skip.

import { describe, expect, it } from 'vitest';

import {
  COMPANIES_DEMO,
  decidirAcaoReprocess,
  type DecisaoReprocess,
  type ReprocessAcao,
  type TentativaReprocess,
} from '../../src/server/services/reprocessIaSocInconsistentes';

// Respostas que, sob a regua recalibrada, produzem nivel != baixa:
// att=2 (ok), soc soma 5 (medio pos-recal), acq opostos (ok), cons
// soma 6 (ok), extremidade baixa (ok). ITEM_018 correta=2, ITEM_080
// correta=1 (espec §5.1.1).
const RESPOSTAS_PASSA: Record<string, number> = {
  ITEM_018: 2,
  ITEM_080: 1,
  ITEM_009: 5,
  ITEM_039: 4,
  ITEM_075: 3,
  ITEM_001: 5,
  ITEM_006: 1,
  ITEM_025: 3,
  ITEM_057: 3,
};

// Mesmas respostas, mas erra as duas perguntas de atencao -> IA_ATT=0 ->
// critico -> continua baixa mesmo pos-recalibragem (§5.1.1).
const RESPOSTAS_BAIXA: Record<string, number> = {
  ...RESPOSTAS_PASSA,
  ITEM_018: 5,
  ITEM_080: 5,
};

function t(
  id: number,
  tentativa: number,
  status: TentativaReprocess['status'],
  respostas: unknown,
): TentativaReprocess {
  return { id, tentativa, status, respostas };
}

describe('ME-REPROC-IASOC — decidirAcaoReprocess (pura)', () => {
  it('reprocessa_em_andamento: inconsistente que passa + tentativa aberta', () => {
    const d = decidirAcaoReprocess([
      t(10, 1, 'inconsistente', RESPOSTAS_PASSA),
      t(20, 2, 'em_andamento', { ITEM_001: 1 }),
    ]);
    const esperado: ReprocessAcao = 'reprocessa_em_andamento';
    expect(d.acao).toBe(esperado);
    expect(d.inconsistenteAssessmentId).toBe(10);
    expect(d.alvoAssessmentId).toBe(20);
    expect(d.alvoTentativa).toBe(2);
    expect(d.nivelNovo).not.toBe('baixa');
  });

  it('reprocessa_inplace: inconsistente que passa, sem tentativa aberta', () => {
    const d: DecisaoReprocess = decidirAcaoReprocess([t(11, 1, 'inconsistente', RESPOSTAS_PASSA)]);
    expect(d.acao).toBe('reprocessa_inplace');
    expect(d.inconsistenteAssessmentId).toBe(11);
    expect(d.alvoAssessmentId).toBe(11);
    expect(d.alvoTentativa).toBe(1);
  });

  it('COMPANIES_DEMO preserva Nativa (1) e Ubatuba (2) do reprocessamento', () => {
    expect(COMPANIES_DEMO).toContain(1);
    expect(COMPANIES_DEMO).toContain(2);
  });

  it('skip_continua_baixa: att=0 continua baixa (contraprova §5.1.1)', () => {
    const d = decidirAcaoReprocess([
      t(12, 1, 'inconsistente', RESPOSTAS_BAIXA),
      t(22, 2, 'em_andamento', {}),
    ]);
    expect(d.acao).toBe('skip_continua_baixa');
    expect(d.nivelNovo).toBe('baixa');
    expect(d.alvoAssessmentId).toBeNull();
  });

  it('skip_sem_respostas: tentativa inconsistente sem respostas', () => {
    const d = decidirAcaoReprocess([t(13, 1, 'inconsistente', {})]);
    expect(d.acao).toBe('skip_sem_respostas');
    expect(d.inconsistenteAssessmentId).toBe(13);
  });

  it('skip_sem_inconsistente: nenhuma tentativa inconsistente', () => {
    const d = decidirAcaoReprocess([t(14, 1, 'enviado', RESPOSTAS_PASSA)]);
    expect(d.acao).toBe('skip_sem_inconsistente');
    expect(d.inconsistenteAssessmentId).toBeNull();
  });

  it('usa a tentativa inconsistente de maior numero', () => {
    const d = decidirAcaoReprocess([
      t(15, 1, 'inconsistente', RESPOSTAS_BAIXA),
      t(16, 3, 'inconsistente', RESPOSTAS_PASSA),
      t(17, 2, 'inconsistente', RESPOSTAS_BAIXA),
    ]);
    // A de maior tentativa (t3, id=16, RESPOSTAS_PASSA) decide.
    expect(d.inconsistenteAssessmentId).toBe(16);
    expect(d.acao).toBe('reprocessa_inplace');
  });

  it('escolhe a tentativa em_andamento de maior numero como alvo', () => {
    const d = decidirAcaoReprocess([
      t(18, 1, 'inconsistente', RESPOSTAS_PASSA),
      t(19, 2, 'em_andamento', {}),
      t(21, 4, 'em_andamento', {}),
    ]);
    expect(d.acao).toBe('reprocessa_em_andamento');
    expect(d.alvoAssessmentId).toBe(21);
    expect(d.alvoTentativa).toBe(4);
  });
});
