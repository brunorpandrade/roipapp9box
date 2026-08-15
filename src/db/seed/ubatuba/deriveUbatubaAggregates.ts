// ROIP APP 9BOX — derivacao canonica bit-exact das 3 tabelas
// agregadoras (plenitude, nineBox, iqlData) da Bebidas Ubatuba
// (ME-080e D4-final).
//
// Consome 3 JSONs pinados:
//   - plenitude_completa.json (401 rows, employeeId direto no JSON)
//   - nine_box.json (387 rows, employeeId direto no JSON)
//   - iql_data.json (45 rows, resolucao por nome + tipo liderId/clevelId)
//
// Aplica shift +1000. Replica mappers Nativa (loadFixtures.ts linhas
// 773-874).

import { loadFixture } from '../nativa/loadJsonFixtures';

import {
  buildUbatubaIdIndex,
  resolveCLevelIdUbatuba,
  resolveEmployeeIdUbatuba,
} from './buildUbatubaIdIndex';
import { UBATUBA_COMPANY_ID, UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

interface PlenitudeJsonRow {
  readonly employeeId: number;
  readonly trimestre: string;
  readonly scoreA: number;
  readonly scoreC: number;
  readonly plenitudeScore: number;
  readonly faixaPlenitude?: 'baixa' | 'media' | 'alta';
  readonly divergencia: number;
  readonly alertaDivergencia: boolean;
  readonly engajamentoA?: number | null;
  readonly engajamentoC?: number | null;
}

interface NineBoxJsonRow {
  readonly employeeId: number;
  readonly trimestre: string;
  readonly scoreDesempenho: number;
  readonly plenitudeScore: number;
  readonly posicaoX: 'baixo' | 'medio' | 'alto';
  readonly posicaoY: 'baixa' | 'media' | 'alta';
  readonly quadrante: string;
  readonly quadranteAnterior?: string | null;
  readonly direcaoMovimento?: 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez';
}

interface IqlJsonRow {
  readonly lider: string;
  readonly liderTipo?: 'employee' | 'clevel';
  readonly trimestre: string;
  readonly iql: number | null;
  readonly scoreDirecionamentoClareza?: number;
  readonly scoreDesenvolvimentoApoio?: number;
  readonly scoreRelacionamentoConfianca?: number;
  readonly scoreGestaoResultados?: number;
  readonly countRespondentes: number;
}

/** Shape INSERT plenitudeData. */
export interface DerivedUbatubaPlenitudeRow {
  readonly companyId: number;
  readonly employeeId: number;
  readonly trimestre: string;
  readonly scoreA: string;
  readonly scoreC: string;
  readonly plenitudeScore: string;
  readonly faixaPlenitude: 'baixa' | 'media' | 'alta';
  readonly divergencia: string;
  readonly alertaDivergencia: boolean;
  readonly engajamentoA: string | null;
  readonly engajamentoC: string | null;
}

/** Union canonica dos 9 quadrantes do 9-Box (bit-exact ao schema). */
export type Nr1Quadrante =
  | 'ALTO IMPACTO'
  | 'DESEMPENHO REPRESADO'
  | 'POTENCIAL SUBUTILIZADO'
  | 'ALTA ENTREGA'
  | 'EQUILÍBRIO FRÁGIL'
  | 'DESEMPENHO CRÍTICO'
  | 'RISCO DE ESGOTAMENTO'
  | 'DESGASTE OCULTO'
  | 'RISCO CRÍTICO';

/** Shape INSERT nineBoxClassifications. */
export interface DerivedUbatubaNineBoxRow {
  readonly companyId: number;
  readonly employeeId: number;
  readonly trimestre: string;
  readonly scoreDesempenho: string;
  readonly plenitudeScore: string;
  readonly posicaoX: 'baixo' | 'medio' | 'alto';
  readonly posicaoY: 'baixa' | 'media' | 'alta';
  readonly quadrante: Nr1Quadrante;
  readonly quadranteAnterior: string | null;
  readonly direcaoMovimento: 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez';
}

/** Shape INSERT iqlData. */
export interface DerivedUbatubaIqlRow {
  readonly companyId: number;
  readonly liderId: number | null;
  readonly clevelId: number | null;
  readonly trimestre: string;
  readonly scoreDirecionamentoClareza: string | null;
  readonly scoreDesenvolvimentoApoio: string | null;
  readonly scoreRelacionamentoConfianca: string | null;
  readonly scoreGestaoResultados: string | null;
  readonly iql: string | null;
  readonly countRespondentes: number;
  readonly countRespondentesElegiveis: number;
}

export function deriveUbatubaPlenitude(): readonly DerivedUbatubaPlenitudeRow[] {
  const fixture = loadFixture<PlenitudeJsonRow[]>('plenitude_completa.json');
  const rows: DerivedUbatubaPlenitudeRow[] = fixture.data.map((r) => ({
    companyId: UBATUBA_COMPANY_ID,
    employeeId: r.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
    trimestre: r.trimestre,
    scoreA: r.scoreA.toFixed(2),
    scoreC: r.scoreC.toFixed(2),
    plenitudeScore: r.plenitudeScore.toFixed(2),
    faixaPlenitude: r.faixaPlenitude ?? 'media',
    divergencia: r.divergencia.toFixed(2),
    alertaDivergencia: r.alertaDivergencia,
    engajamentoA: r.engajamentoA != null ? r.engajamentoA.toFixed(2) : null,
    engajamentoC: r.engajamentoC != null ? r.engajamentoC.toFixed(2) : null,
  }));
  return Object.freeze(rows);
}

export function deriveUbatubaNineBox(): readonly DerivedUbatubaNineBoxRow[] {
  const fixture = loadFixture<NineBoxJsonRow[]>('nine_box.json');
  const rows: DerivedUbatubaNineBoxRow[] = fixture.data.map((r) => ({
    companyId: UBATUBA_COMPANY_ID,
    employeeId: r.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
    trimestre: r.trimestre,
    scoreDesempenho: r.scoreDesempenho.toFixed(2),
    plenitudeScore: r.plenitudeScore.toFixed(2),
    posicaoX: r.posicaoX,
    posicaoY: r.posicaoY,
    quadrante: r.quadrante as Nr1Quadrante,
    quadranteAnterior: r.quadranteAnterior ?? null,
    direcaoMovimento: r.direcaoMovimento ?? 'primeira_vez',
  }));
  return Object.freeze(rows);
}

export function deriveUbatubaIql(): readonly DerivedUbatubaIqlRow[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<IqlJsonRow[]>('iql_data.json');
  const rows: DerivedUbatubaIqlRow[] = fixture.data.map((r) => {
    const liderTipo = r.liderTipo ?? 'employee';
    const liderIdRaw =
      liderTipo === 'employee'
        ? resolveEmployeeIdUbatuba(r.lider, idx)
        : resolveCLevelIdUbatuba(r.lider, idx);
    const iql = r.iql != null ? r.iql.toFixed(2) : null;
    const parcial = iql ?? null;
    return {
      companyId: UBATUBA_COMPANY_ID,
      liderId: liderTipo === 'employee' ? liderIdRaw : null,
      clevelId: liderTipo === 'clevel' ? liderIdRaw : null,
      trimestre: r.trimestre,
      scoreDirecionamentoClareza:
        r.scoreDirecionamentoClareza !== undefined
          ? r.scoreDirecionamentoClareza.toFixed(2)
          : parcial,
      scoreDesenvolvimentoApoio:
        r.scoreDesenvolvimentoApoio !== undefined
          ? r.scoreDesenvolvimentoApoio.toFixed(2)
          : parcial,
      scoreRelacionamentoConfianca:
        r.scoreRelacionamentoConfianca !== undefined
          ? r.scoreRelacionamentoConfianca.toFixed(2)
          : parcial,
      scoreGestaoResultados:
        r.scoreGestaoResultados !== undefined ? r.scoreGestaoResultados.toFixed(2) : parcial,
      iql,
      countRespondentes: r.countRespondentes,
      countRespondentesElegiveis: r.countRespondentes,
    };
  });
  return Object.freeze(rows);
}

export const UBATUBA_PLENITUDE_TOTAL_ESPERADO = 401 as const;
export const UBATUBA_NINE_BOX_TOTAL_ESPERADO = 387 as const;
export const UBATUBA_IQL_TOTAL_ESPERADO = 45 as const;
