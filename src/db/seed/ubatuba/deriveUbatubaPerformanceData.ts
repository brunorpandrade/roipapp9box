// ROIP APP 9BOX — derivacao canonica bit-exact de performanceData e
// performanceVariableData da Bebidas Ubatuba (ME-080e Dispatch 2).
//
// Estrategia canonica (mesma D1): consome o JSON pinado por SHA-256
// `performance_mensal.json` (SHA `66ac271e...`, recordCount=1210) como
// fonte da verdade e aplica shift +UBATUBA_EMPLOYEE_ID_SHIFT (=1000,
// D5.9) sobre `employeeId`. companyId = UBATUBA_COMPANY_ID (=2).
//
// Duas responsabilidades neste arquivo:
//
//   1. deriveUbatubaPerformanceData(): mapeia 1210 rows do JSON para o
//      shape de INSERT em `performanceData`. Espelha 1:1 o
//      `mapPerfMensalToRow` do Nativa (loadFixtures.ts linhas 697-710),
//      apenas trocando NATIVA_COMPANY_ID -> UBATUBA_COMPANY_ID e
//      employeeId += UBATUBA_EMPLOYEE_ID_SHIFT. Total canonico 1210.
//
//   2. deriveUbatubaPerformanceVariables(perfDataIdIndex): itera o mesmo
//      JSON e, para cada row, extrai o array `variables` — cada elemento
//      [variableIndex, demanda, executado, desempenho, peso] vira 1 row
//      em `performanceVariableData` com FK `performanceDataId` resolvida
//      pelo indice recebido. Espelha 1:1 as linhas 425-445 do Nativa
//      loadFixtures. Total canonico 4840 (1210 rows × ~4 variables cada,
//      exatamente 4840 conforme invariante do JSON canonico).
//
// D2.1 (aprovado): variant isolada Ubatuba, nao parametriza Nativa.
// D2.2 (aprovado): determinismo total via reuso do JSON pinado.
// D2.3 (aprovado): 1210 + 4840 rows bit-exact.
//
// RV-02: SHA-256 do JSON pinado no manifest Nativa. Ubatuba consome via
//   loadFixture() (que valida SHA-256 antes de retornar).
// RV-12: 100% Drizzle-ready via consumidor seedUbatubaOperacionalD2.
// RV-13: consumido por seedUbatubaOperacionalD2.ts +
//   tests/unit/ubatuba/derivePerformanceData.test.ts.
// RV-14: um statement por linha, largura <= 100 colunas.
// RV-15: contagens 1210 e 4840 medidas e exportadas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import { UBATUBA_COMPANY_ID, UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

/**
 * Shape canonico de uma row de `performance_mensal.json`. Espelha 1:1
 * os campos usados em `mapPerfMensalToRow` do Nativa.
 */
interface PerfMensalJsonRow {
  readonly employeeId: number;
  readonly nome: string;
  readonly mes: string;
  readonly custoTotalMes: number;
  readonly faltas: number;
  readonly assiduidade: number;
  readonly indiceDesempenho: number;
  readonly variables: ReadonlyArray<readonly [number, number, number, number, number]>;
}

/**
 * Shape canonico bit-exact para INSERT em `performanceData` da Ubatuba.
 * Espelha o payload de INSERT do Nativa (loadFixtures.ts linhas
 * 697-710) — mesmos campos, mesmos tipos, mesmos formatos.
 */
export interface DerivedUbatubaPerformanceDataRow {
  readonly companyId: number;
  readonly employeeId: number;
  readonly mes: string;
  readonly custoTotalMes: string;
  readonly faltas: number;
  readonly diasUteis: number;
  readonly assiduidade: string;
  readonly indiceDesempenho: string;
  readonly createdAt: Date;
}

/**
 * Shape canonico bit-exact para INSERT em `performanceVariableData` da
 * Ubatuba. `performanceDataId` e resolvida pelo indice passado ao
 * derivador.
 */
export interface DerivedUbatubaPerformanceVariableRow {
  readonly performanceDataId: number;
  readonly variableIndex: number;
  readonly demanda: string;
  readonly executado: string;
  readonly desempenho: string;
  readonly peso: string;
}

/**
 * Deriva as 1210 rows canonicas bit-exact de performanceData da Bebidas
 * Ubatuba. Consome `performance_mensal.json` (SHA-256 pinado, validado
 * por loadFixture) e aplica shift +1000 em employeeId + companyId=2.
 *
 * @returns array congelado de exatamente 1210 registros.
 */
export function deriveUbatubaPerformanceData(): readonly DerivedUbatubaPerformanceDataRow[] {
  const fixture = loadFixture<PerfMensalJsonRow[]>('performance_mensal.json');
  const rows: DerivedUbatubaPerformanceDataRow[] = fixture.data.map((r) => ({
    companyId: UBATUBA_COMPANY_ID,
    employeeId: r.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
    mes: r.mes,
    custoTotalMes: r.custoTotalMes.toFixed(2),
    faltas: r.faltas,
    diasUteis: 22,
    assiduidade: r.assiduidade.toFixed(2),
    indiceDesempenho: r.indiceDesempenho.toFixed(4),
    createdAt: new Date(`${r.mes}-11T00:00:00.000Z`),
  }));
  return Object.freeze(rows);
}

/**
 * Deriva as 4840 rows canonicas bit-exact de performanceVariableData da
 * Bebidas Ubatuba. Consome o MESMO JSON de performance_mensal e itera
 * os arrays `variables` de cada row. `performanceDataId` e resolvida
 * pelo indice `{employeeId:mes -> id}` construido apos INSERT de
 * `performanceData` (padrao Nativa loadFixtures.ts linhas 407-420).
 *
 * @param perfDataIdIndex Map de "${employeeId}:${mes}" para o id auto
 *   incrementado retornado pelo INSERT de performanceData na base.
 *   `employeeId` deve estar ja no espaco Ubatuba (post-shift).
 * @returns array congelado de exatamente 4840 registros.
 * @throws Error se qualquer chave employeeId:mes nao existir no indice
 *   (sinal de INSERT incompleto ou indice mal montado).
 */
export function deriveUbatubaPerformanceVariables(
  perfDataIdIndex: ReadonlyMap<string, number>,
): readonly DerivedUbatubaPerformanceVariableRow[] {
  const fixture = loadFixture<PerfMensalJsonRow[]>('performance_mensal.json');
  const rows: DerivedUbatubaPerformanceVariableRow[] = [];
  for (const raw of fixture.data) {
    const ubatubaEmployeeId = raw.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT;
    const key = `${ubatubaEmployeeId}:${raw.mes}`;
    const perfId = perfDataIdIndex.get(key);
    if (perfId === undefined) {
      throw new Error(
        `deriveUbatubaPerformanceVariables: performanceDataId nao encontrado para ${key}.`,
      );
    }
    for (const [variableIndex, demanda, executado, desempenho, peso] of raw.variables) {
      rows.push({
        performanceDataId: perfId,
        variableIndex,
        demanda: demanda.toFixed(2),
        executado: executado.toFixed(2),
        desempenho: desempenho.toFixed(4),
        peso: peso.toFixed(2),
      });
    }
  }
  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada de performanceData Ubatuba. */
export const UBATUBA_PERFORMANCE_DATA_TOTAL_ESPERADO = 1210 as const;

/** Contagem canonica bit-exact esperada de performanceVariableData Ubatuba. */
export const UBATUBA_PERFORMANCE_VARIABLE_DATA_TOTAL_ESPERADO = 4840 as const;
