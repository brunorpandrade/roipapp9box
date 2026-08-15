// ROIP APP 9BOX — derivacao canonica bit-exact dos 3 instrumentos
// avaliativos (A, C, D) da Bebidas Ubatuba (ME-080e D4-final).
//
// Consome 3 JSONs pinados por SHA-256:
//   - instrumento_a_respostas.json (8020 rows — autoavaliacao)
//   - instrumento_c_respostas.json (8020 rows — chefe avalia liderado,
//     par liderId/clevelId)
//   - instrumento_d_respostas.json (4000 rows — liderado avalia chefe,
//     par liderId/clevelId)
//
// Aplica shift +1000 em todos os IDs. Replica bit-exact os mappers
// Nativa (loadFixtures.ts linhas 738-844).
//
// RV-13/14/15 canonicas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import {
  buildUbatubaIdIndex,
  resolveCLevelIdUbatuba,
  resolveEmployeeIdUbatuba,
} from './buildUbatubaIdIndex';
import { UBATUBA_COMPANY_ID } from './constants';

interface InstAJsonRow {
  readonly nome: string;
  readonly trimestre: string;
  readonly dimensao?: number;
  readonly itemIndex: number;
  readonly valor: number;
}

interface InstCJsonRow {
  readonly nome_liderado: string;
  readonly nome_lider: string;
  readonly tipo_lider?: 'employee' | 'clevel';
  readonly trimestre: string;
  readonly dimensao?: number;
  readonly itemIndex: number;
  readonly valor: number;
}

interface InstDJsonRow {
  readonly respondente: string;
  readonly lider: string;
  readonly liderTipo?: 'employee' | 'clevel';
  readonly trimestre: string;
  readonly dimensao?: number;
  readonly itemIndex: number;
  readonly valor: number;
}

/** Shape INSERT instrumentA_responses. */
export interface DerivedUbatubaInstAResp {
  readonly companyId: number;
  readonly employeeId: number;
  readonly trimestre: string;
  readonly dimensao: number;
  readonly itemIndex: number;
  readonly valor: number;
}

/** Shape INSERT instrumentC_assessments. */
export interface DerivedUbatubaInstCResp {
  readonly companyId: number;
  readonly employeeId: number;
  readonly liderId: number | null;
  readonly clevelId: number | null;
  readonly trimestre: string;
  readonly dimensao: number;
  readonly itemIndex: number;
  readonly valor: number;
}

/** Shape INSERT instrumentD_responses. */
export interface DerivedUbatubaInstDResp {
  readonly companyId: number;
  readonly respondenteId: number;
  readonly liderId: number | null;
  readonly clevelId: number | null;
  readonly trimestre: string;
  readonly dimensao: number;
  readonly itemIndex: number;
  readonly valor: number;
  readonly versaoInstrumento: number;
}

export function deriveUbatubaInstrumentA(): readonly DerivedUbatubaInstAResp[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<InstAJsonRow[]>('instrumento_a_respostas.json');
  const rows: DerivedUbatubaInstAResp[] = fixture.data.map((r) => ({
    companyId: UBATUBA_COMPANY_ID,
    employeeId: resolveEmployeeIdUbatuba(r.nome, idx),
    trimestre: r.trimestre,
    dimensao: r.dimensao ?? 1,
    itemIndex: r.itemIndex,
    valor: r.valor,
  }));
  return Object.freeze(rows);
}

export function deriveUbatubaInstrumentC(): readonly DerivedUbatubaInstCResp[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<InstCJsonRow[]>('instrumento_c_respostas.json');
  const rows: DerivedUbatubaInstCResp[] = fixture.data.map((r) => {
    const tipoLider = r.tipo_lider ?? 'employee';
    const liderIdRaw =
      tipoLider === 'employee'
        ? resolveEmployeeIdUbatuba(r.nome_lider, idx)
        : resolveCLevelIdUbatuba(r.nome_lider, idx);
    return {
      companyId: UBATUBA_COMPANY_ID,
      employeeId: resolveEmployeeIdUbatuba(r.nome_liderado, idx),
      liderId: tipoLider === 'employee' ? liderIdRaw : null,
      clevelId: tipoLider === 'clevel' ? liderIdRaw : null,
      trimestre: r.trimestre,
      dimensao: r.dimensao ?? 1,
      itemIndex: r.itemIndex,
      valor: r.valor,
    };
  });
  return Object.freeze(rows);
}

export function deriveUbatubaInstrumentD(): readonly DerivedUbatubaInstDResp[] {
  const idx = buildUbatubaIdIndex();
  const fixture = loadFixture<InstDJsonRow[]>('instrumento_d_respostas.json');
  const rows: DerivedUbatubaInstDResp[] = fixture.data.map((r) => {
    const liderTipo = r.liderTipo ?? 'employee';
    const liderIdRaw =
      liderTipo === 'employee'
        ? resolveEmployeeIdUbatuba(r.lider, idx)
        : resolveCLevelIdUbatuba(r.lider, idx);
    return {
      companyId: UBATUBA_COMPANY_ID,
      respondenteId: resolveEmployeeIdUbatuba(r.respondente, idx),
      liderId: liderTipo === 'employee' ? liderIdRaw : null,
      clevelId: liderTipo === 'clevel' ? liderIdRaw : null,
      trimestre: r.trimestre,
      dimensao: r.dimensao ?? 1,
      itemIndex: r.itemIndex,
      valor: r.valor,
      versaoInstrumento: 1,
    };
  });
  return Object.freeze(rows);
}

export const UBATUBA_INSTRUMENT_A_TOTAL_ESPERADO = 8020 as const;
export const UBATUBA_INSTRUMENT_C_TOTAL_ESPERADO = 8020 as const;
export const UBATUBA_INSTRUMENT_D_TOTAL_ESPERADO = 4000 as const;
