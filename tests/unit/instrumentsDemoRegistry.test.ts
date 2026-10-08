// ROIP APP 9BOX — testes unitarios do registry demo dos instrumentos
// (ME-B11.2; ampliado em ME-B11.2b — C agora tem `kind: 'likert_c'`
// com Experiencia do usuario). Verifica a ordenacao canonica
// A, B, C, D, PI; a completude das 4 secoes de descricao; a resolucao
// por id; e os `kind` canonicos atribuidos.

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

  it('nenhuma entrada carrega notaDisponibilidade (B11.2b)', () => {
    const entries = listInstrumentDemoEntries();
    for (const entry of entries) {
      expect(entry.notaDisponibilidade).toBeUndefined();
    }
  });

  it('nenhuma entrada tem `kind=nao_disponivel` (B11.2b)', () => {
    const entries = listInstrumentDemoEntries();
    const naoDisponiveis = entries.filter((e) => e.kind === 'nao_disponivel');
    expect(naoDisponiveis).toHaveLength(0);
  });

  it('findInstrumentDemoEntry resolve por id ou retorna null', () => {
    expect(findInstrumentDemoEntry('instrumento-a')?.kind).toBe('likert_a');
    expect(findInstrumentDemoEntry('instrumento-c')?.kind).toBe('likert_c');
    expect(findInstrumentDemoEntry('instrumento-d')?.kind).toBe('likert_d');
    expect(findInstrumentDemoEntry('perfil-individual')?.kind).toBe('perfil_individual');
    expect(findInstrumentDemoEntry('instrumento-b')?.kind).toBe('nr1');
    expect(findInstrumentDemoEntry('inexistente')).toBeNull();
  });

  it('kinds canonicos — todos os 5 instrumentos com Experiencia do usuario', () => {
    const entries = listInstrumentDemoEntries();
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toEqual(['likert_a', 'nr1', 'likert_c', 'likert_d', 'perfil_individual']);
  });
});
