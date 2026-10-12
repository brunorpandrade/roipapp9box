// ME-1.4b: testes RV-03 bi-direcional do fixture canonico regenerado
// `tests/fixtures/nativa/performance_trimestral.json`.
//
// Causa raiz exercitada: o fixture original (gerador Python ME-068) nao
// aplicava o passo canonico do fator moderador por scoreDesempenho,
// gerando `participacao = participacaoBase` em toda a populacao P.
// Consequencia: `percMetaAtingida` em plato uniforme ~168% (apenas 2
// valores distintos em 53 colaboradores por trimestre).
//
// Correcao canonica (ME-1.4b b-α): fixture regenerado aplicando motor v2
// TS canonico (`src/lib/roiFormulas.ts`). 4 campos recalculados por
// registro, 12 campos preservados bit-exact.
//
// RV-03 bi-direcional:
//   - Caso bom: fixture novo tem dispersao canonica real por trimestre
//     (>40 valores distintos de percMetaAtingida em 2026-Q4; nenhum na
//     faixa 168.4-168.45).
//   - Defeito injetado: SHA-256 do fixture no manifest deve bater com o
//     SHA novo (`13fd3be1...`); divergencia reprova o teste.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NATIVA_FIXTURE_MANIFEST } from '../../src/db/seed/nativa/manifest.sha256';

const FIXTURE_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'nativa');
const PERF_TRIM_PATH = join(FIXTURE_DIR, 'performance_trimestral.json');

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

interface PerfTrimRow {
  nome: string;
  employeeId: number;
  trimestre: string;
  scoreDesempenho: number | null;
  custoMedioTrimestral: number;
  metaROI: number | null;
  retornoPotencial: number | null;
  participacao: number | null;
  retornoEstimado: number | null;
  roiEstimado: number | null;
  percMetaAtingida: number | null;
}

describe('ME-1.4b fixture performance_trimestral.json regenerado via motor v2', () => {
  const buf = readFileSync(PERF_TRIM_PATH);
  const rows = JSON.parse(buf.toString()) as PerfTrimRow[];

  it('SHA-256 do fixture bate bit-exact com manifest canonico (RV-02)', () => {
    const atual = sha256(buf);
    const entry = NATIVA_FIXTURE_MANIFEST.find((e) => e.filename === 'performance_trimestral.json');
    expect(entry).toBeDefined();
    expect(atual).toBe(entry?.sha256);
  });

  it('415 registros preservados', () => {
    expect(rows).toHaveLength(415);
  });

  it('zero linhas de 2026-Q4 em plato 168.42-168.43 (caso bom do RV-03)', () => {
    const q4EmPlato = rows.filter(
      (r) =>
        r.trimestre === '2026-Q4' &&
        r.percMetaAtingida !== null &&
        r.percMetaAtingida >= 168.42 &&
        r.percMetaAtingida <= 168.43,
    );
    expect(q4EmPlato).toHaveLength(0);
  });

  it('dispersao canonica real em 2026-Q4 (>40 valores distintos de percMetaAtingida)', () => {
    const q4 = rows.filter((r) => r.trimestre === '2026-Q4' && r.percMetaAtingida !== null);
    const distintos = new Set(q4.map((r) => r.percMetaAtingida));
    expect(distintos.size).toBeGreaterThan(40);
  });

  it('amplitude canonica em 2026-Q4 (min < 110, max > 180)', () => {
    const q4 = rows.filter((r) => r.trimestre === '2026-Q4' && r.percMetaAtingida !== null);
    const vals = q4.map((r) => r.percMetaAtingida as number);
    expect(Math.min(...vals)).toBeLessThan(110);
    expect(Math.max(...vals)).toBeGreaterThan(180);
  });

  it('Jonas Rocha em 2027-Q4 sai do plato 176% para faixa coerente (100-110%)', () => {
    const jr = rows.find((r) => r.nome === 'Jonas Rocha' && r.trimestre === '2027-Q4');
    expect(jr).toBeDefined();
    const perc = jr?.percMetaAtingida ?? 0;
    expect(perc).toBeGreaterThan(100);
    expect(perc).toBeLessThan(110);
  });

  it('Σ participacao em cada trimestre bate ~1.0 (identidade canonica motor v2)', () => {
    const trims = new Set(rows.map((r) => r.trimestre));
    for (const t of trims) {
      const soma = rows
        .filter((r) => r.trimestre === t && r.participacao !== null)
        .reduce((acc, r) => acc + (r.participacao as number), 0);
      expect(soma).toBeGreaterThan(0.999);
      expect(soma).toBeLessThan(1.001);
    }
  });
});
