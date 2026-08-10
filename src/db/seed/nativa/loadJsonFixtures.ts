// ROIP APP 9BOX — loader canonico dos 20 JSONs de fixture Nativa (ME-068).
//
// Cada arquivo:
//   1. Lido do disco (tests/fixtures/nativa/<filename>).
//   2. SHA-256 medido byte-a-byte.
//   3. Comparado bit-exact contra NATIVA_FIXTURE_MANIFEST.
//   4. Divergencia → throw canonico com detalhes (nome, esperado, obtido).
//   5. JSON.parse; contagem validada contra recordCount esperado.
//
// RV-02: SHA-256 pinado no manifest e a fonte da verdade. Fixture editada
// externamente = throw = ABORT. Nao ha silent fallback.
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts + tests/unit/nativa/
// loadJsonFixtures.test.ts.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NATIVA_FIXTURE_MANIFEST, type FixtureHashEntry } from './manifest.sha256';

/** Contexto canonico do carregamento — um arquivo. */
export interface LoadedFixture<T> {
  readonly filename: string;
  readonly data: T;
  readonly recordCount: number;
  readonly sha256: string;
}

/**
 * Localiza `tests/fixtures/nativa/` a partir do modulo. Consumido pelo loader
 * em runtime tanto no seed real (produto) quanto em testes vitest.
 */
function resolveFixtureDir(): string {
  // Caminho relativo canonico a partir de src/db/seed/nativa/ ate raiz.
  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  return resolve(repoRoot, 'tests', 'fixtures', 'nativa');
}

/**
 * Le e valida um JSON canonico. Divergencia = throw.
 * @throws {Error} se SHA-256 diverge, se arquivo ausente, ou se contagem diverge.
 */
export function loadFixture<T>(filename: string): LoadedFixture<T> {
  const entry = NATIVA_FIXTURE_MANIFEST.find((e) => e.filename === filename);
  if (entry === undefined) {
    throw new Error(
      `loadFixture: '${filename}' ausente do NATIVA_FIXTURE_MANIFEST. ` +
        `Arquivos canonicos: ${NATIVA_FIXTURE_MANIFEST.length}.`,
    );
  }

  const filepath = resolve(resolveFixtureDir(), filename);
  let bytes: Buffer;
  try {
    bytes = readFileSync(filepath);
  } catch (err) {
    throw new Error(`loadFixture: leitura falhou para '${filepath}': ${(err as Error).message}`);
  }

  const measured = createHash('sha256').update(bytes).digest('hex');
  if (measured !== entry.sha256) {
    throw new Error(
      `loadFixture: SHA-256 mismatch para '${filename}'. ` +
        `Esperado='${entry.sha256}', obtido='${measured}'. ` +
        `Arquivo corrompido ou editado — fixture NAO pode ser aplicada.`,
    );
  }

  const data = JSON.parse(bytes.toString('utf-8')) as T;

  // Validacao de contagem (apenas para arrays).
  const recordCount = Array.isArray(data) ? data.length : 1;
  if (recordCount !== entry.recordCount) {
    throw new Error(
      `loadFixture: contagem mismatch para '${filename}'. ` +
        `Esperado=${entry.recordCount}, obtido=${recordCount}. ` +
        `Divergencia canonica inaceitavel.`,
    );
  }

  return {
    filename,
    data,
    recordCount,
    sha256: measured,
  };
}

/**
 * Valida o manifest completo — le e verifica os 20 arquivos sem retornar
 * dados. Util no smoke test do seed antes de qualquer INSERT.
 */
export function validateNativaManifest(): {
  totalFiles: number;
  totalRecords: number;
  entries: readonly FixtureHashEntry[];
} {
  let totalRecords = 0;
  for (const entry of NATIVA_FIXTURE_MANIFEST) {
    const loaded = loadFixture<unknown>(entry.filename);
    totalRecords += loaded.recordCount;
  }
  return {
    totalFiles: NATIVA_FIXTURE_MANIFEST.length,
    totalRecords,
    entries: NATIVA_FIXTURE_MANIFEST,
  };
}
