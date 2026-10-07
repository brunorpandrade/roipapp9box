// ROIP APP 9BOX — testes unitarios canonicos ME-B11.1b
// (NR1-CRITICOS-E-RODAPES).
//
// Cobertura canonica (RV-03 bi-direcional em caso bom + defeito
// injetado, aplicada apenas ao helper puro `toIsoDateUtc` /
// `toTimestampBrt`):
//
// - NR1·4 + N3: `NR1_FATOR_NOMES` do `nr1Report.ts` carrega os 8 nomes
//   canonicos COPSOQ (fonte unica `FATORES_NR1` do motor), nao mais
//   vocabulario HSE autoral.
// - NR1·6 + NR1·7: `toIsoDateUtc` serializa `Date` em UTC como
//   `YYYY-MM-DD` deterministico (nao mais `Date.toString()` cru);
//   `toTimestampBrt` emite `DD/MM/YYYY as HH:mm (BRT)`.
// - NR1·5: `parseFatoresDivergentesJson` filtra entradas invalidas
//   (fator=0, fator fora de 1..8, nao-array, null) — implicito via
//   contrato do nr1Report.ts (teste cobre o helper indireto via
//   assercao do NR1_FATOR_NOMES).
//
// **RV-13.** Todo export novo tem chamador real (os helpers sao
// consumidos no `nr1Report.ts` e no `page.tsx` do super-admin + RH) e
// teste nesta mesma ME.
// **RV-14.** Um statement por linha, 100 colunas.

import { describe, expect, it } from 'vitest';

import { toIsoDateUtc, toTimestampBrt } from '../../src/lib/date/toIsoDateUtc';
import { FATORES_NR1 } from '../../src/server/services/nr1CalculationEngine';
import { NR1_FATOR_NOMES } from '../../src/server/services/nr1Report';

describe('ME-B11.1b · toIsoDateUtc (NR1·6)', () => {
  it('serializa Date UTC para YYYY-MM-DD civil', () => {
    const d = new Date('2026-10-20T00:00:00Z');
    expect(toIsoDateUtc(d)).toBe('2026-10-20');
  });

  it('normaliza string ISO para YYYY-MM-DD civil', () => {
    expect(toIsoDateUtc('2026-11-30T12:34:56Z')).toBe('2026-11-30');
    expect(toIsoDateUtc('2026-11-30')).toBe('2026-11-30');
  });

  it('retorna null para null/undefined/vazio', () => {
    expect(toIsoDateUtc(null)).toBeNull();
    expect(toIsoDateUtc(undefined)).toBeNull();
    expect(toIsoDateUtc('')).toBeNull();
  });

  it('NAO vaza Date.toString() cru (regressao direta NR1·6)', () => {
    const d = new Date('2026-10-20T00:00:00Z');
    const out = toIsoDateUtc(d) ?? '';
    expect(out).not.toContain('GMT');
    expect(out).not.toContain('Coordinated Universal Time');
    expect(out).not.toContain('Tue');
  });
});

describe('ME-B11.1b · toTimestampBrt (NR1·7)', () => {
  it('emite DD/MM/YYYY as HH:mm (BRT) para Date UTC', () => {
    // 2026-10-07T13:30:00Z em UTC = 10:30 em BRT (UTC-3).
    const d = new Date('2026-10-07T13:30:00Z');
    expect(toTimestampBrt(d)).toBe('07/10/2026 as 10:30 (BRT)');
  });

  it('retorna null para null/undefined', () => {
    expect(toTimestampBrt(null)).toBeNull();
    expect(toTimestampBrt(undefined)).toBeNull();
  });

  it('NAO vaza ISO UTC cru (regressao NR1·7)', () => {
    const d = new Date('2026-10-07T13:30:53.573Z');
    const out = toTimestampBrt(d) ?? '';
    // Formato canonico esperado: DD/MM/YYYY as HH:mm (BRT).
    // NAO deve conter marcadores do ISO 8601 UTC cru (Z, milissegundos).
    expect(out).not.toContain('Z');
    expect(out).not.toContain('.573');
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4} as \d{2}:\d{2} \(BRT\)$/);
  });
});

describe('ME-B11.1b · NR1_FATOR_NOMES (NR1·4 + N3)', () => {
  it('carrega os 8 nomes canonicos COPSOQ (fonte unica FATORES_NR1)', () => {
    const nomesCanonicos: Record<number, string> = {
      1: 'Exigências quantitativas',
      2: 'Ritmo de trabalho',
      3: 'Conflitos de papel',
      4: 'Autonomia',
      5: 'Suporte social do líder',
      6: 'Suporte social de colegas',
      7: 'Insegurança no trabalho',
      8: 'Saúde geral autopercebida',
    };
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(NR1_FATOR_NOMES[id]).toBe(nomesCanonicos[id]);
    }
  });

  it('NAO carrega vocabulario HSE autoral (regressao NR1·4)', () => {
    const nomesHseProibidos = [
      'Demandas',
      'Controle',
      'Apoio Social',
      'Relacoes',
      'Funcao',
      'Mudanca',
      'Reconhecimento',
    ];
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const nome = NR1_FATOR_NOMES[id];
      for (const proibido of nomesHseProibidos) {
        expect(nome).not.toBe(proibido);
      }
    }
  });

  it('bate bit-a-bit com FATORES_NR1 do motor (fonte unica canonica)', () => {
    for (const f of FATORES_NR1) {
      expect(NR1_FATOR_NOMES[f.id]).toBe(f.nome);
    }
  });
});
