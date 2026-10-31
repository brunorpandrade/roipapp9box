// ROIP APP 9BOX — teste canonico ME-1.3d-REV DIS-A (CC079-DIS-A-1):
// `derivarTopDestaquesDeterministicos`.
//
// Funcao pura — recebe o payload deterministico do executive report e
// retorna exatamente 3 strings de destaque. Determinismo bit-exact
// (mesmo payload = mesmas 3 strings).
//
// Precisa existir fora de `src/server/services/` para satisfazer o
// gate `check-no-dead-exports.sh` (RV-13).

import { describe, expect, it } from 'vitest';

import {
  type BuildExecutiveReportArgs,
  derivarTopDestaquesDeterministicos,
} from '../../src/server/services/executiveReportEngine';
import type {
  ExecReportBlocoFinanceiro,
  ExecutiveReportDeterministicoPayload,
} from '../../src/server/services/_shared/executiveReportTypes';

// Importar `BuildExecutiveReportArgs` + `ExecReportBlocoFinanceiro` como
// multi-especificador canonico (RV-14) impede o Prettier de colapsar o
// import de linha unica que ultrapassaria 100 colunas.
void (null as unknown as BuildExecutiveReportArgs);
void (null as unknown as ExecReportBlocoFinanceiro);

const basePayload: ExecutiveReportDeterministicoPayload = {
  companyId: 1,
  nomeFantasia: 'Nativa Alimentos',
  razaoSocialSanitizada: 'NATIVA_ALIMENTOS_LTDA',
  escopo: { tipo: 'empresa', referencia: null, rotulo: 'Empresa' },
  trimestre: '2026-Q4',
  trimestreAnterior: '2026-Q3',
  mesmoTrimestreAnoAnterior: '2025-Q4',
  blocoFinanceiro: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      roiAgregado: 5.2,
      faturamentoMedioTrimestral: 1820000,
      folhaTotalMedia: 350200,
      percMetaAtingidaAgregada: 167.7,
      colaboradoresAtivos: 53,
      percFolhaFaturamento: 19.24,
      folhaPercMinimaIdeal: 18,
      folhaPercMaximaIdeal: 25,
    },
    comparativoTrimestreAnterior: {
      roiAgregado: 5.0,
      variacaoPercentualRoi: 3.94,
      percMetaAtingidaAgregada: 163.04,
      variacaoPercentualMeta: 2.86,
    },
    comparativoMesmoTrimestreAnoAnterior: null,
  },
  blocoDesempenho: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      scoreDesempenhoMedioAgregado: 89.82,
      percMetaAtingidaAgregada: 167.7,
      assiduidadeMedia: 97.01,
      distribuicaoPorFaixa: { acimaMeta: 41, naMeta: 0, proximoMeta: 0, abaixoMeta: 0 },
      colaboradoresAtivos: 53,
    },
    comparativoTrimestreAnterior: {
      scoreDesempenhoMedioAgregado: 90.27,
      variacaoPercentual: -0.5,
      percMetaAtingidaAgregada: 163.04,
    },
  },
  blocoPlenitude: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      plenitudeScoreMedioAgregado: 77.8,
      scoreAMedio: 78.5,
      scoreCMedio: 77.0,
      porDimensaoAgregada: {
        engajamento: 78.0,
        desenvolvimento: 77.5,
        pertencimento: 78.5,
        realizacao: 77.0,
      },
      percColaboradoresComAlertaDivergencia: 5,
      colaboradoresAtivos: 53,
    },
    comparativoTrimestreAnterior: null,
  },
  blocoClima: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreReferencia: '2026-Q3',
    disponivel: true,
    trimestreAtual: {
      notaClima: 7.4,
      adesao: 87,
      porDimensaoAgregada: {
        engajamento: 7.4,
        desenvolvimento: 7.4,
        pertencimento: 7.4,
        realizacao: 7.5,
      },
      respondentes: 36,
      notasPorAspecto: Array.from(
        { length: 20 },
        (_, i) => Math.round((7 + (i % 3) * 0.2) * 10) / 10,
      ),
    },
    comparativoTrimestreAnterior: null,
    notaAgregacaoAnonimato: null,
  },
  blocoTurnover: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      turnoverTrimestralPercentual: 6.5,
      turnoverAnualizadoPercentual: 26,
      colaboradoresAtivosInicioTrimestre: 53,
      saidasTotais: 3,
      saidasVoluntarias: 2,
      saidasInvoluntarias: 1,
      turnoverVoluntarioPercentual: 3.77,
      turnoverInvoluntarioPercentual: 1.89,
    },
    ultimos12Meses: { turnoverPercentual: 15.5, saidasTotais: 7, headcountInicio: 45 },
    aberturaPorNivelHierarquico: {
      estrategico: { turnoverPercentual: 0, saidas: 0 },
      tatico: { turnoverPercentual: 5, saidas: 1 },
      operacional: { turnoverPercentual: 7, saidas: 2 },
    },
    comparativoTrimestreAnterior: { turnoverTrimestralPercentual: 5, variacaoPercentual: 30 },
  },
  detalhamentoCapilar: { departamentos: [] },
};

describe('ME-1.3d-REV DIS-A — derivarTopDestaquesDeterministicos', () => {
  it('retorna exatamente 3 strings nao vazias', () => {
    const destaques = derivarTopDestaquesDeterministicos(basePayload);
    expect(destaques).toHaveLength(3);
    for (const d of destaques) {
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(0);
    }
  });

  it('determinismo bit-exact: mesmo payload produz mesmos destaques', () => {
    const a = derivarTopDestaquesDeterministicos(basePayload);
    const b = derivarTopDestaquesDeterministicos(basePayload);
    expect(a).toEqual(b);
  });

  it('prioriza variacao positiva de ROI como primeiro destaque quando positiva', () => {
    const destaques = derivarTopDestaquesDeterministicos(basePayload);
    expect(destaques[0]).toContain('ROI subiu');
  });

  it('fallback canonico: payload sem comparativos ainda retorna 3 destaques', () => {
    const payloadSemComparativos: ExecutiveReportDeterministicoPayload = {
      ...basePayload,
      blocoFinanceiro: {
        ...basePayload.blocoFinanceiro,
        comparativoTrimestreAnterior: null,
        comparativoMesmoTrimestreAnoAnterior: null,
      },
      blocoDesempenho: { ...basePayload.blocoDesempenho, comparativoTrimestreAnterior: null },
      blocoPlenitude: { ...basePayload.blocoPlenitude, comparativoTrimestreAnterior: null },
      blocoTurnover: null,
    };
    const destaques = derivarTopDestaquesDeterministicos(payloadSemComparativos);
    expect(destaques).toHaveLength(3);
    expect(destaques[0]).toContain('ROI');
    expect(destaques[1]).toContain('Desempenho');
    expect(destaques[2]).toContain('clima');
  });
});
