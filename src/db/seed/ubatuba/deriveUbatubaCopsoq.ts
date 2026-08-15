// ROIP APP 9BOX — derivacao canonica bit-exact do bloco COPSOQ/NR-1 da
// Bebidas Ubatuba (ME-080e D4-final). Cinco tabelas em cadeia FK:
//   1. copsoqCycles (1 row — 1 ciclo canonico)
//   2. copsoqCycleSnapshot (51 rows — 39 respondentes + 12 nao-respondentes;
//      C-levels filtrados por regulamentacao NR-1)
//   3. copsoq_responses (1248 rows — 39 employees × 32 itens)
//   4. copsoqFactorScores (56 rows)
//   5. nr1AreaDivergenceAnalysis (6 rows)
//
// cicloDbId (FK das 4 tabelas subsequentes) e resolvido pelo orquestrador
// pos-INSERT — derivadores aqui devolvem row builders parametrizados.
//
// RV-11: dependencia de cicloDbId real do INSERT.
// RV-13/14 canonicas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import { buildUbatubaIdIndex, resolveEmployeeIdUbatuba } from './buildUbatubaIdIndex';
import { UBATUBA_COMPANY_ID, UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

interface NR1CycleJsonRow {
  readonly nome: string;
  readonly dataAbertura: string;
  readonly dataFechamento: string;
  readonly status: 'agendado' | 'aberto' | 'fechado';
  readonly departamentosAmostraInsuficiente?: unknown;
}

interface NR1SnapshotJsonRow {
  readonly userType?: 'employee' | 'clevel';
  readonly userId: number;
  readonly nome?: string;
}

interface NR1ResponseJsonRow {
  readonly userType?: 'employee' | 'clevel';
  readonly userId: number;
  readonly nome?: string;
  readonly fatorNum: number;
  readonly itemIndex: number;
  readonly valor: number;
}

interface NR1FactorScoreJsonRow {
  readonly escopo?: 'empresa' | 'departamento' | 'agregacao';
  readonly departamentoNome?: string | null;
  readonly fatorNum: number;
  readonly score: number | null;
  readonly countRespondentes: number;
}

interface NR1DivergenceJsonRow {
  readonly departamento: string;
  readonly tipo: 'critica' | 'positiva' | 'convergente';
  readonly fatorNum: number;
}

export interface DerivedUbatubaCopsoqCycle {
  readonly companyId: number;
  readonly ciclo: string;
  readonly dataAbertura: Date;
  readonly dataFechamento: Date;
  readonly status: 'agendado' | 'aberto' | 'fechado';
  readonly departamentosAmostraInsuficiente: unknown;
  readonly createdAt: Date;
}

export interface DerivedUbatubaCopsoqSnapshot {
  readonly cicloDbId: number;
  readonly companyId: number;
  readonly employeeId: number;
  readonly departamentoId: null;
  readonly respondeu: boolean;
  readonly createdAt: Date;
}

export interface DerivedUbatubaCopsoqResponse {
  readonly cicloDbId: number;
  readonly companyId: number;
  readonly employeeId: number;
  readonly fator: number;
  readonly itemIndex: number;
  readonly valor: number;
  readonly versaoInstrumento: string;
}

export interface DerivedUbatubaCopsoqFactorScore {
  readonly cicloDbId: number;
  readonly companyId: number;
  readonly escopo: 'empresa' | 'departamento' | 'agregacao';
  readonly escopoDepartamentoId: null;
  readonly escopoNomeAgregacao: string | null;
  readonly fator: number;
  readonly score: string;
  readonly countRespondentes: number;
}

export interface DerivedUbatubaNr1Divergence {
  readonly cicloDbId: number;
  readonly companyId: number;
  readonly escopo: 'departamento';
  readonly escopoDepartamentoId: null;
  readonly escopoNomeAgregacao: string;
  readonly classificacao: 'divergencia_critica' | 'divergencia_positiva' | 'convergente';
  readonly fatoresDivergentesCriticos: unknown;
  readonly fatoresDivergentesPositivos: unknown;
}

/** Deriva o unico ciclo COPSOQ canonico da Ubatuba. */
export function deriveUbatubaCopsoqCycle(): DerivedUbatubaCopsoqCycle {
  const fixture = loadFixture<NR1CycleJsonRow>('nr1_ciclo.json');
  const r = fixture.data;
  return {
    companyId: UBATUBA_COMPANY_ID,
    ciclo: r.nome,
    dataAbertura: new Date(r.dataAbertura + 'T00:00:00.000Z'),
    dataFechamento: new Date(r.dataFechamento + 'T00:00:00.000Z'),
    status: r.status,
    departamentosAmostraInsuficiente: r.departamentosAmostraInsuficiente ?? null,
    createdAt: new Date(r.dataAbertura + 'T00:00:00.000Z'),
  };
}

/**
 * Deriva 51 snapshots (39 respondentes + 12 nao-respondentes; C-levels
 * filtrados canonicamente por regulamentacao NR-1).
 */
export function deriveUbatubaCopsoqSnapshots(
  cicloDbId: number,
): readonly DerivedUbatubaCopsoqSnapshot[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<NR1SnapshotJsonRow[]>('nr1_snapshots.json');
  const filtered = fixture.data.filter((r) => (r.userType ?? 'employee') === 'employee');
  const rows: DerivedUbatubaCopsoqSnapshot[] = filtered.map((r) => {
    const userType = r.userType ?? 'employee';
    const employeeId =
      userType === 'employee'
        ? r.userId + UBATUBA_EMPLOYEE_ID_SHIFT
        : resolveEmployeeIdUbatuba(String(r.nome ?? ''), idx);
    return {
      cicloDbId,
      companyId: UBATUBA_COMPANY_ID,
      employeeId,
      departamentoId: null,
      respondeu: true,
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
    };
  });
  return Object.freeze(rows);
}

/**
 * Deriva 1248 respostas COPSOQ (39 employees × 32 itens; C-levels
 * filtrados). itemIndex convertido de global (1..32) para local ao
 * fator (1..4) via ((global-1) % 4) + 1.
 */
export function deriveUbatubaCopsoqResponses(
  cicloDbId: number,
): readonly DerivedUbatubaCopsoqResponse[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<NR1ResponseJsonRow[]>('nr1_respostas.json');
  const filtered = fixture.data.filter((r) => (r.userType ?? 'employee') === 'employee');
  const rows: DerivedUbatubaCopsoqResponse[] = filtered.map((r) => {
    const userType = r.userType ?? 'employee';
    const employeeId =
      userType === 'employee'
        ? r.userId + UBATUBA_EMPLOYEE_ID_SHIFT
        : resolveEmployeeIdUbatuba(String(r.nome ?? ''), idx);
    const itemIndexLocal = ((r.itemIndex - 1) % 4) + 1;
    return {
      cicloDbId,
      companyId: UBATUBA_COMPANY_ID,
      employeeId,
      fator: r.fatorNum,
      itemIndex: itemIndexLocal,
      valor: r.valor,
      versaoInstrumento: 'placeholder_MVP_v1',
    };
  });
  return Object.freeze(rows);
}

/** Deriva 56 factor scores. */
export function deriveUbatubaCopsoqFactorScores(
  cicloDbId: number,
): readonly DerivedUbatubaCopsoqFactorScore[] {
  const fixture = loadFixture<NR1FactorScoreJsonRow[]>('nr1_factor_scores.json');
  const rows: DerivedUbatubaCopsoqFactorScore[] = fixture.data.map((r) => {
    const escopo = r.escopo ?? 'empresa';
    return {
      cicloDbId,
      companyId: UBATUBA_COMPANY_ID,
      escopo,
      escopoDepartamentoId: null,
      escopoNomeAgregacao: escopo === 'empresa' ? null : (r.departamentoNome ?? null),
      fator: r.fatorNum,
      score: r.score != null ? r.score.toFixed(2) : '0.00',
      countRespondentes: r.countRespondentes,
    };
  });
  return Object.freeze(rows);
}

/** Deriva 6 divergencias. */
export function deriveUbatubaNr1Divergences(
  cicloDbId: number,
): readonly DerivedUbatubaNr1Divergence[] {
  const fixture = loadFixture<NR1DivergenceJsonRow[]>('nr1_divergencias.json');
  const rows: DerivedUbatubaNr1Divergence[] = fixture.data.map((r) => {
    const classificacao =
      r.tipo === 'critica'
        ? ('divergencia_critica' as const)
        : r.tipo === 'positiva'
          ? ('divergencia_positiva' as const)
          : ('convergente' as const);
    return {
      cicloDbId,
      companyId: UBATUBA_COMPANY_ID,
      escopo: 'departamento' as const,
      escopoDepartamentoId: null,
      escopoNomeAgregacao: r.departamento,
      classificacao,
      fatoresDivergentesCriticos: classificacao === 'divergencia_critica' ? [r.fatorNum] : null,
      fatoresDivergentesPositivos: classificacao === 'divergencia_positiva' ? [r.fatorNum] : null,
    };
  });
  return Object.freeze(rows);
}

export const UBATUBA_COPSOQ_CYCLES_TOTAL_ESPERADO = 1 as const;
export const UBATUBA_COPSOQ_SNAPSHOTS_TOTAL_ESPERADO = 51 as const;
export const UBATUBA_COPSOQ_RESPONSES_TOTAL_ESPERADO = 1248 as const;
export const UBATUBA_COPSOQ_FACTOR_SCORES_TOTAL_ESPERADO = 56 as const;
export const UBATUBA_NR1_DIVERGENCES_TOTAL_ESPERADO = 6 as const;
