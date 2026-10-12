// ME-1.4a: testes RV-03 bi-direcional do helper canonico
// `normalizeScoresKeys` e do mapper `mapScoreToRow` corrigidos para
// resolver o defeito de carga do fixture
// `tests/fixtures/nativa/individual_profile_scores.json`.
//
// Causa raiz exercitada: o fixture canonico bit-exact emite as chaves do
// bloco `scores` em UPPERCASE (POST_ASSERT, EST_ABERT, ...) por convencao
// do gerador Python original; o mapper em `loadFixtures.ts` acessa em
// lowercase (post_assert, est_abert, ...) alinhadas ao schema MySQL.
// `normalizeScoresKeys` lowercase-normaliza; o mapper passa a ler os
// valores do fixture.
//
// RV-03 bi-direcional:
//   - Caso bom: fixture bit-exact de Camila Batista (employeeId=6) retorna
//     os 25 valores canonicos (todos != 50.00).
//   - Defeito injetado: fixture com chaves lowercase propositalmente
//     NAO-canonicas e um colaborador SEM override continua funcionando;
//     fixture com valores nao numericos retorna fallback '50.00'.
//
// RV-13: cada export deste helper tem chamador real em
// `src/db/seed/nativa/loadFixtures.ts` (mapScoreToRow) e em
// `src/db/seed/nativa/reprojectIndividualProfileScores.ts` (mapScoreToRow,
// buildIdIndex, NATIVA_COMPANY_ID).

import { describe, expect, it } from 'vitest';

import {
  buildIdIndex,
  mapScoreToRow,
  NATIVA_COMPANY_ID,
} from '../../src/db/seed/nativa/loadFixtures';
import { normalizeScoresKeys } from '../../src/db/seed/nativa/normalizeScoresKeys';

describe('normalizeScoresKeys', () => {
  it('normaliza chaves UPPERCASE para lowercase preservando valores', () => {
    const resultado = normalizeScoresKeys({
      POST_ASSERT: 77.55,
      EST_ABERT: 66.49,
      MOT_LIDERANCA: 81.68,
    });
    expect(resultado).toEqual({
      post_assert: 77.55,
      est_abert: 66.49,
      mot_lideranca: 81.68,
    });
  });

  it('e idempotente: chaves ja lowercase permanecem lowercase', () => {
    const resultado = normalizeScoresKeys({
      post_assert: 50,
      est_abert: 60,
    });
    expect(resultado).toEqual({ post_assert: 50, est_abert: 60 });
  });

  it('descarta valores nao numericos (RV-03 defeito injetado)', () => {
    const resultado = normalizeScoresKeys({
      POST_ASSERT: 'ruim' as unknown as number,
      EST_ABERT: null as unknown as number,
      MOT_LIDERANCA: Number.NaN,
      ASS_SABED: 44.5,
    });
    expect(resultado).toEqual({ ass_sabed: 44.5 });
  });

  it('aceita entrada null/undefined retornando objeto vazio', () => {
    expect(normalizeScoresKeys(null)).toEqual({});
    expect(normalizeScoresKeys(undefined)).toEqual({});
  });
});

describe('mapScoreToRow (RV-03 bi-direcional)', () => {
  // Thiago Costa (employeeId=11, Supervisor Comercial, FLAG_LIDER_REATIVO
  // canonico) e colaborador SEM override em perfilIndividualOverrides, por
  // isso o mapper le os valores direto do fixture — ideal para exercitar o
  // caminho corrigido pela ME-1.4a. Se estivesse na lista de overrides, o
  // branch de override prevaleceria e nao exercitariamos o fix.
  const idIdx = buildIdIndex();
  const assessmentIdIndex = new Map<string, number>();
  assessmentIdIndex.set('employee:11:1', 999);

  const fixtureCanonico: Record<string, unknown> = {
    nome: 'Thiago Costa',
    confiabilidadeNivel: 'alta',
    perfilComportamental: 'comando_execucao',
    scores: {
      POST_ASSERT: 48.12,
      POST_TAREFAS: 52.33,
      POST_PESSOAS: 71.45,
      POST_PRESSAO: 60.1,
      EST_ABERT: 55.5,
      EST_DISC: 62.8,
      EST_EXT: 59.0,
      EST_AMAB: 70.0,
      EST_ESTAB: 65.0,
      MOT_MAESTRIA: 58.0,
      MOT_LIDERANCA: 44.0,
      MOT_AUTONOMIA: 50.0,
      MOT_SEGURANCA: 60.0,
      MOT_PROPOSITO: 68.0,
      EQU_AUTOCONS: 55.0,
      EQU_AUTOGEST: 60.0,
      EQU_LEITURA: 65.0,
      EQU_INFLUENCIA: 58.0,
      EQU_INDICE: 59.5,
      ASS_SABED: 52.0,
      ASS_CORAGEM: 48.0,
      ASS_HUMANID: 72.0,
      ASS_JUSTICA: 61.0,
      ASS_TEMPER: 54.0,
      ASS_TRANSC: 50.0,
    },
    vetorDominante: 'post_pessoas',
    top3: ['ass_humanid', 'ass_justica', 'post_pessoas'],
  };

  it('caso bom: le os 25 valores do fixture UPPERCASE sem fallback', () => {
    const row = mapScoreToRow(fixtureCanonico, idIdx, assessmentIdIndex);
    expect(row.companyId).toBe(NATIVA_COMPANY_ID);
    expect(row.userType).toBe('employee');
    expect(row.userId).toBe(11);
    expect(row.post_assert).toBe('48.12');
    expect(row.post_pessoas).toBe('71.45');
    expect(row.mot_proposito).toBe('68.00');
    expect(row.ass_humanid).toBe('72.00');
    expect(row.ass_transc).toBe('50.00');
  });

  it('defeito injetado: scores vazio cai no fallback 50.00 em todas as colunas', () => {
    const defeito = { ...fixtureCanonico, scores: {} };
    const row = mapScoreToRow(defeito, idIdx, assessmentIdIndex);
    expect(row.post_assert).toBe('50.00');
    expect(row.est_abert).toBe('50.00');
    expect(row.mot_lideranca).toBe('50.00');
  });

  it('defeito injetado: scores com chaves nao numericas cai no fallback 50.00', () => {
    const defeito = {
      ...fixtureCanonico,
      scores: {
        POST_ASSERT: 'nao_numero' as unknown as number,
        EST_ABERT: Number.NaN,
      },
    };
    const row = mapScoreToRow(defeito, idIdx, assessmentIdIndex);
    expect(row.post_assert).toBe('50.00');
    expect(row.est_abert).toBe('50.00');
  });
});
