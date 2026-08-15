// ROIP APP 9BOX — derivacao canonica bit-exact de performanceQuarterlyData
// da Bebidas Ubatuba (ME-080e Dispatch 2).
//
// Estrategia canonica (mesma D1/D2 performanceData): consome o JSON pinado
// por SHA-256 `performance_trimestral.json` (SHA `d3948036...`,
// recordCount=415) como fonte da verdade e aplica shift
// +UBATUBA_EMPLOYEE_ID_SHIFT (=1000, D5.9) sobre `employeeId`.
// companyId = UBATUBA_COMPANY_ID (=2).
//
// Mapeamento espelha 1:1 o `mapPerfTrimToRow` do Nativa
// (loadFixtures.ts linhas 712-736): mesmos campos, mesmos formatos
// decimais, mesmo calculo de `createdAt` a partir do trimestre.
//
// Campos nullable canonicos (medidos no JSON: 97 rows com
// capacidadeOciosa=null; 25 rows com indice/score/faixa/retorno/
// participacao/roi/percMeta=null). Estes nulls sao propagados bit-exact
// como null no INSERT.
//
// D2.1 (aprovado): variant isolada Ubatuba, nao parametriza Nativa.
// D2.3 (aprovado): 415 rows bit-exact.
//
// RV-02: SHA-256 pinado; loadFixture valida antes de retornar.
// RV-13: consumido por seedUbatubaOperacionalD2.ts +
//   tests/unit/ubatuba/derivePerformanceQuarterlyData.test.ts.
// RV-14: um statement por linha, largura <= 100 colunas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import { UBATUBA_COMPANY_ID, UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

/**
 * Shape canonico de uma row de `performance_trimestral.json`. Espelha
 * 1:1 os campos usados em `mapPerfTrimToRow` do Nativa. Campos
 * nullable estao marcados explicitamente.
 */
interface PerfTrimJsonRow {
  readonly employeeId: number;
  readonly nome: string;
  readonly trimestre: string;
  readonly indiceDesempenho: number | null;
  readonly scoreDesempenho: number | null;
  readonly capacidadeOciosa: number | null;
  readonly faixaDesempenho: 'baixo' | 'medio' | 'alto' | null;
  readonly custoMedioTrimestral: number;
  readonly metaROI: number;
  readonly retornoPotencial: number | null;
  readonly participacao: number | null;
  readonly retornoEstimado: number | null;
  readonly roiEstimado: number | null;
  readonly percMetaAtingida: number | null;
}

/**
 * Shape canonico bit-exact para INSERT em `performanceQuarterlyData` da
 * Ubatuba. Espelha o payload de INSERT do Nativa
 * (loadFixtures.ts linhas 712-736).
 */
export interface DerivedUbatubaPerformanceQuarterlyRow {
  readonly companyId: number;
  readonly employeeId: number;
  readonly trimestre: string;
  readonly indiceDesempenho: string | null;
  readonly scoreDesempenho: string | null;
  readonly capacidadeOciosa: string | null;
  readonly faixaDesempenho: 'baixo' | 'medio' | 'alto' | null;
  readonly custoMedioTrimestral: string;
  readonly metaROI: string;
  readonly retornoPotencial: string | null;
  readonly participacao: string | null;
  readonly retornoEstimado: string | null;
  readonly roiEstimado: string | null;
  readonly percMetaAtingida: string | null;
  readonly createdAt: Date;
}

/**
 * Alias curto usado internamente para caber em 100 colunas nas
 * assinaturas de retorno; export publico preserva o nome canonico verboso.
 */
type QuarterlyRow = DerivedUbatubaPerformanceQuarterlyRow;

/**
 * Deriva as 415 rows canonicas bit-exact de performanceQuarterlyData da
 * Bebidas Ubatuba. Consome `performance_trimestral.json` (SHA-256
 * pinado, validado por loadFixture) e aplica shift +1000 em employeeId
 * + companyId=2.
 *
 * @returns array congelado de exatamente 415 registros.
 */
export function deriveUbatubaPerformanceQuarterlyData(): readonly QuarterlyRow[] {
  const fixture = loadFixture<PerfTrimJsonRow[]>('performance_trimestral.json');
  const rows: QuarterlyRow[] = fixture.data.map((r) => {
    const [anoStr, qStr] = r.trimestre.split('-Q');
    if (anoStr === undefined || qStr === undefined) {
      throw new Error(
        `deriveUbatubaPerformanceQuarterlyData: trimestre invalido '${r.trimestre}'.`,
      );
    }
    const q = parseInt(qStr, 10);
    const mesFim = q * 3;
    const anoFech = mesFim === 12 ? parseInt(anoStr, 10) + 1 : parseInt(anoStr, 10);
    const mesFech = mesFim === 12 ? 1 : mesFim + 1;
    const mesFechStr = String(mesFech).padStart(2, '0');
    return {
      companyId: UBATUBA_COMPANY_ID,
      employeeId: r.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
      trimestre: r.trimestre,
      indiceDesempenho: r.indiceDesempenho === null ? null : r.indiceDesempenho.toFixed(4),
      scoreDesempenho: r.scoreDesempenho === null ? null : r.scoreDesempenho.toFixed(2),
      capacidadeOciosa: r.capacidadeOciosa === null ? null : r.capacidadeOciosa.toFixed(2),
      faixaDesempenho: r.faixaDesempenho,
      custoMedioTrimestral: r.custoMedioTrimestral.toFixed(2),
      metaROI: r.metaROI.toFixed(2),
      retornoPotencial: r.retornoPotencial === null ? null : r.retornoPotencial.toFixed(2),
      participacao: r.participacao === null ? null : r.participacao.toFixed(6),
      retornoEstimado: r.retornoEstimado === null ? null : r.retornoEstimado.toFixed(2),
      roiEstimado: r.roiEstimado === null ? null : r.roiEstimado.toFixed(4),
      percMetaAtingida: r.percMetaAtingida === null ? null : r.percMetaAtingida.toFixed(2),
      createdAt: new Date(`${anoFech}-${mesFechStr}-11T00:00:00.000Z`),
    };
  });
  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada. */
export const UBATUBA_PERFORMANCE_QUARTERLY_DATA_TOTAL_ESPERADO = 415 as const;
