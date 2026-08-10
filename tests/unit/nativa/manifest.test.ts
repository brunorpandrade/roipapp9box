// ROIP APP 9BOX — teste unit do manifest SHA-256 canonico da fixture Nativa (ME-068).
//
// Cobre invariantes canonicas bit-exact:
//   - Manifest tem exatamente 20 entradas (RV-15 + guard TS compile-time).
//   - Cada SHA-256 e hex-lowercase de 64 caracteres.
//   - Nao ha filename duplicado.
//   - NATIVA_FIXTURE_COUNT bate com o tuple length em runtime.

import { describe, expect, it } from 'vitest';

import {
  NATIVA_FIXTURE_COUNT,
  NATIVA_FIXTURE_MANIFEST,
} from '../../../src/db/seed/nativa/manifest.sha256';

describe('NATIVA_FIXTURE_MANIFEST — invariantes canonicas', () => {
  it('tem exatamente 20 entradas (E-068-2 Cenario A)', () => {
    expect(NATIVA_FIXTURE_MANIFEST.length).toBe(20);
    expect(NATIVA_FIXTURE_COUNT).toBe(20);
    expect(NATIVA_FIXTURE_MANIFEST.length).toBe(NATIVA_FIXTURE_COUNT);
  });

  it('cada SHA-256 e hex-lowercase de 64 caracteres', () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    for (const entry of NATIVA_FIXTURE_MANIFEST) {
      expect(entry.sha256).toMatch(hexPattern);
    }
  });

  it('nao ha filename duplicado', () => {
    const filenames = NATIVA_FIXTURE_MANIFEST.map((e) => e.filename);
    const unique = new Set(filenames);
    expect(unique.size).toBe(NATIVA_FIXTURE_MANIFEST.length);
  });

  it('cada recordCount e um inteiro nao-negativo', () => {
    for (const entry of NATIVA_FIXTURE_MANIFEST) {
      expect(Number.isInteger(entry.recordCount)).toBe(true);
      expect(entry.recordCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('cada destinationTable e string nao-vazia', () => {
    for (const entry of NATIVA_FIXTURE_MANIFEST) {
      expect(typeof entry.destinationTable).toBe('string');
      expect(entry.destinationTable.length).toBeGreaterThan(0);
    }
  });
});
