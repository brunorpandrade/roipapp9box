// ROIP APP 9BOX — testes unitarios do registry demo dos instrumentos
// (ME-B11.2). Verifica a ordenacao canonica A, B, C, D, PI; a
// completude das 4 secoes de descricao; a presenca/ausencia da
// `notaDisponibilidade` conforme o `kind`; e a resolucao por id.

import { describe, it, expect } from 'vitest';

import {
  findInstrumentDemoEntry,
  listInstrumentDemoEntries,
} from '../../src/lib/instruments/instrumentsDemoRegistry';

describe('instrumentsDemoRegistry', () => {
  it('ordem canonica — A, B, C, D, Perfil Individual', () => {
    const entries = listInstrumentDemoEntries();
    expect(entries.map((e) => e.id)).toEqual([
      'instrumento-a',
      'instrumento-b',
      'instrumento-c',
      'instrumento-d',
      'perfil-individual',
    ]);
  });

  it('toda entrada tem as 4 secoes canonicas preenchidas', () => {
    const entries = listInstrumentDemoEntries();
    for (const entry of entries) {
      expect(entry.descricao.oQueFaz.length).toBeGreaterThan(0);
      expect(entry.descricao.paraQueServe.length).toBeGreaterThan(0);
      expect(entry.descricao.periodicidade.length).toBeGreaterThan(0);
      expect(entry.descricao.quemPreenche.length).toBeGreaterThan(0);
    }
  });

  it('Instrumento C e o unico com `kind=nao_disponivel` + nota (D5=B)', () => {
    const entries = listInstrumentDemoEntries();
    const naoDisponiveis = entries.filter((e) => e.kind === 'nao_disponivel');
    expect(naoDisponiveis).toHaveLength(1);
    expect(naoDisponiveis[0]?.id).toBe('instrumento-c');
    expect(naoDisponiveis[0]?.notaDisponibilidade).toBeDefined();
  });

  it('instrumentos com experiencia nao carregam nota de disponibilidade', () => {
    const entries = listInstrumentDemoEntries();
    for (const entry of entries) {
      if (entry.kind !== 'nao_disponivel') {
        expect(entry.notaDisponibilidade).toBeUndefined();
      }
    }
  });

  it('findInstrumentDemoEntry resolve por id ou retorna null', () => {
    expect(findInstrumentDemoEntry('instrumento-a')?.kind).toBe('likert_a');
    expect(findInstrumentDemoEntry('instrumento-d')?.kind).toBe('likert_d');
    expect(findInstrumentDemoEntry('perfil-individual')?.kind).toBe('perfil_individual');
    expect(findInstrumentDemoEntry('instrumento-b')?.kind).toBe('nr1');
    expect(findInstrumentDemoEntry('inexistente')).toBeNull();
  });

  it('kinds canonicos cobrem todos os instrumentos exceto C', () => {
    const entries = listInstrumentDemoEntries();
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toEqual(['likert_a', 'nr1', 'nao_disponivel', 'likert_d', 'perfil_individual']);
  });
});
