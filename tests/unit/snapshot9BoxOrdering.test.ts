// ROIP APP 9BOX — teste canonico da ordenacao da tabela de colaboradores
// do Snapshot 9-Box (ME-1.3c CC079-v3).
//
// Cobre a decisao canonica: ordenacao primaria pela ordem canonica dos
// 9 quadrantes (do melhor ao pior conforme `NINE_BOX_QUADRANTES` do DOC
// 01 §8.4); ordenacao secundaria por nome do colaborador (locale pt-BR,
// insensivel a acentos).

import { describe, expect, it } from 'vitest';

import {
  NINE_BOX_PRIORIDADE,
  NINE_BOX_QUADRANTES,
  type NineBoxLinhaColaborador,
  ordenarColaboradoresCanonicos,
} from '../../src/server/pdf-templates/snapshot9BoxTemplate';

const colaboradorMinimo = (
  nome: string,
  quadrante: NineBoxLinhaColaborador['quadrante'],
  employeeId = 1,
): NineBoxLinhaColaborador => ({
  employeeId,
  nome,
  departamento: 'TI',
  scoreDesempenho: 80,
  plenitudeScore: 70,
  quadrante,
});

describe('NINE_BOX_PRIORIDADE', () => {
  it('reflete bit-exact a ordem canonica de NINE_BOX_QUADRANTES', () => {
    NINE_BOX_QUADRANTES.forEach((q, idx) => {
      expect(NINE_BOX_PRIORIDADE[q]).toBe(idx);
    });
  });

  it('ALTO IMPACTO tem prioridade 0 (melhor)', () => {
    expect(NINE_BOX_PRIORIDADE['ALTO IMPACTO']).toBe(0);
  });

  it('RISCO CRITICO tem prioridade 8 (pior)', () => {
    expect(NINE_BOX_PRIORIDADE['RISCO CRÍTICO']).toBe(8);
  });
});

describe('ordenarColaboradoresCanonicos', () => {
  it('ordena primeiro pela ordem canonica dos quadrantes', () => {
    const entrada: NineBoxLinhaColaborador[] = [
      colaboradorMinimo('Zelia', 'RISCO CRÍTICO', 1),
      colaboradorMinimo('Alice', 'ALTO IMPACTO', 2),
      colaboradorMinimo('Bruno', 'EQUILÍBRIO FRÁGIL', 3),
    ];
    const resultado = ordenarColaboradoresCanonicos(entrada);
    expect(resultado.map((c) => c.quadrante)).toEqual([
      'ALTO IMPACTO',
      'EQUILÍBRIO FRÁGIL',
      'RISCO CRÍTICO',
    ]);
  });

  it('ordena por nome alfabetico dentro do mesmo quadrante', () => {
    const entrada: NineBoxLinhaColaborador[] = [
      colaboradorMinimo('Camila', 'ALTO IMPACTO', 1),
      colaboradorMinimo('Alice', 'ALTO IMPACTO', 2),
      colaboradorMinimo('Bruno', 'ALTO IMPACTO', 3),
    ];
    const resultado = ordenarColaboradoresCanonicos(entrada);
    expect(resultado.map((c) => c.nome)).toEqual(['Alice', 'Bruno', 'Camila']);
  });

  it('ordena combinando quadrante primario + nome secundario', () => {
    const entrada: NineBoxLinhaColaborador[] = [
      colaboradorMinimo('Zelia', 'ALTO IMPACTO', 1),
      colaboradorMinimo('Alice', 'EQUILÍBRIO FRÁGIL', 2),
      colaboradorMinimo('Alice', 'ALTO IMPACTO', 3),
      colaboradorMinimo('Zelia', 'EQUILÍBRIO FRÁGIL', 4),
    ];
    const resultado = ordenarColaboradoresCanonicos(entrada);
    expect(resultado.map((c) => `${c.quadrante}·${c.nome}`)).toEqual([
      'ALTO IMPACTO·Alice',
      'ALTO IMPACTO·Zelia',
      'EQUILÍBRIO FRÁGIL·Alice',
      'EQUILÍBRIO FRÁGIL·Zelia',
    ]);
  });

  it('ordena pt-BR insensivel a acentos (Álvaro perto de Alvaro)', () => {
    const entrada: NineBoxLinhaColaborador[] = [
      colaboradorMinimo('Beatriz', 'ALTO IMPACTO', 1),
      colaboradorMinimo('Álvaro', 'ALTO IMPACTO', 2),
      colaboradorMinimo('Antonio', 'ALTO IMPACTO', 3),
    ];
    const resultado = ordenarColaboradoresCanonicos(entrada);
    expect(resultado.map((c) => c.nome)).toEqual(['Álvaro', 'Antonio', 'Beatriz']);
  });

  it('nao muta o array de entrada (imutabilidade canonica)', () => {
    const entrada: NineBoxLinhaColaborador[] = [
      colaboradorMinimo('Zelia', 'RISCO CRÍTICO', 1),
      colaboradorMinimo('Alice', 'ALTO IMPACTO', 2),
    ];
    const copia = [...entrada];
    ordenarColaboradoresCanonicos(entrada);
    expect(entrada).toEqual(copia);
  });

  it('array vazio retorna array vazio', () => {
    expect(ordenarColaboradoresCanonicos([])).toEqual([]);
  });
});
