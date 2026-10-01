// ROIP APP 9BOX — teste canonico de guard dos invariantes de grid dos
// fixtures do Instrumento A/C e das 8 colunas da plenitude (ME-B2-01c).
//
// Objetivo: travar em compile+run time 2 bugs canonicos corrigidos nesta
// ME, de modo que qualquer regressao futura reprove o `npm run validate`
// antes de qualquer deploy.
//
// Invariantes testados:
//
// 1. Fixture `instrumento_a_respostas.json`: todas as 8020 rows cobrem o
//    grid canonico `dimensao 1..4 × itemIndex 1..5` (§9.4). O motor
//    `climateCalculationEngine` descarta itemIndex > 5 — se o fixture
//    voltar a usar numeracao linear 1..20, as dimensoes 2/3/4 somem do
//    Bloco Clima.
//
// 2. Fixture `instrumento_c_respostas.json`: mesmo grid canonico.
//
// 3. `deriveUbatubaPlenitude` persiste as 8 colunas de dimensao
//    (engajamento/desenvolvimento/pertencimento/realizacao, A e C). O
//    bug 1 da ME-B2-01c era o mapper so transportar 2 das 8 — e o
//    fixture `plenitude_completa.json` ja tinha todas; a regressao
//    estava no clone do mapper Nativa.
//
// RV-13: consumido pelo npm run validate.

import { describe, expect, it } from 'vitest';

import { loadFixture } from '../../../src/db/seed/nativa/loadJsonFixtures';
import { deriveUbatubaPlenitude } from '../../../src/db/seed/ubatuba/deriveUbatubaAggregates';

interface GridRow {
  readonly dimensao: number;
  readonly itemIndex: number;
}

/**
 * Verifica canonicamente que o fixture cobre o grid 4x5 e que nenhum
 * row usa itemIndex fora de [1..5] (regressao bug 2 da ME-B2-01c).
 */
function assertGridCanonico(filename: string, expectedRows: number): void {
  const fx = loadFixture<readonly GridRow[]>(filename);
  expect(fx.recordCount).toBe(expectedRows);
  const chaves = new Set<string>();
  for (const r of fx.data) {
    expect(r.dimensao).toBeGreaterThanOrEqual(1);
    expect(r.dimensao).toBeLessThanOrEqual(4);
    expect(r.itemIndex).toBeGreaterThanOrEqual(1);
    expect(r.itemIndex).toBeLessThanOrEqual(5);
    chaves.add(`${r.dimensao}-${r.itemIndex}`);
  }
  // 20 combinacoes canonicas (4 dims x 5 itens cada).
  expect(chaves.size).toBe(20);
  for (let d = 1; d <= 4; d++) {
    for (let i = 1; i <= 5; i++) {
      expect(chaves.has(`${d}-${i}`)).toBe(true);
    }
  }
}

describe('ME-B2-01c — fixtures canonicos cobrem grid 4x5', () => {
  it('instrumento_a_respostas.json: dimensao 1..4 x itemIndex 1..5 (bug 2)', () => {
    assertGridCanonico('instrumento_a_respostas.json', 8020);
  });

  it('instrumento_c_respostas.json: dimensao 1..4 x itemIndex 1..5 (bug 2)', () => {
    assertGridCanonico('instrumento_c_respostas.json', 8020);
  });
});

describe('ME-B2-01c — deriveUbatubaPlenitude persiste 8 colunas de dimensao', () => {
  it('transporta engajamento/desenvolvimento/pertencimento/realizacao A+C (bug 1)', () => {
    const rows = deriveUbatubaPlenitude();
    expect(rows.length).toBe(401);
    // Audita que pelo menos 1 row tem cada uma das 6 colunas que o bug
    // deixava null. As rows do fixture Juliana Freitas (primeiros rows)
    // tem todas as 8 colunas preenchidas na origem (plenitude_completa).
    const comDesenvolvimentoA = rows.some((r) => r.desenvolvimentoA !== null);
    const comPertencimentoA = rows.some((r) => r.pertencimentoA !== null);
    const comRealizacaoA = rows.some((r) => r.realizacaoA !== null);
    const comDesenvolvimentoC = rows.some((r) => r.desenvolvimentoC !== null);
    const comPertencimentoC = rows.some((r) => r.pertencimentoC !== null);
    const comRealizacaoC = rows.some((r) => r.realizacaoC !== null);
    expect(comDesenvolvimentoA).toBe(true);
    expect(comPertencimentoA).toBe(true);
    expect(comRealizacaoA).toBe(true);
    expect(comDesenvolvimentoC).toBe(true);
    expect(comPertencimentoC).toBe(true);
    expect(comRealizacaoC).toBe(true);
  });
});
