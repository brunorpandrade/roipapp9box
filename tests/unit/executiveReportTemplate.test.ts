// ROIP APP 9BOX — teste unit `executiveReportTemplate`
// (ME-053, S275).
//
// Cobertura canonica:
//   - Determinismo: mesmo payload = mesmo HTML byte a byte, exceto
//     campos que dependem de `geradoEmIso` (rodape + capa).
//   - Filename canonico §13.5 respeita padrao
//     `relatorio_executivo_[razao]_[trimestre]_[YYYYMMDD_HHmm].pdf`.
//   - Bloco Clima com disponivel=false renderiza o paragrafo canonico
//     curto sem tabela.
//   - Bloco Turnover omitido quando payload.blocoTurnover === null.

import { describe, expect, it } from 'vitest';

import {
  composeExecutiveReportFilename,
  renderExecutiveReportHTML,
} from '../../src/server/pdf-templates/executiveReportTemplate';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import type { ExecutiveReportFinalPayload } from '../../src/server/services/_shared/executiveReportTypes';

const basePayload: ExecutiveReportFinalPayload = {
  companyId: 1,
  nomeFantasia: 'Empresa Teste ME053',
  razaoSocialSanitizada: 'EMPRESA_TESTE',
  escopo: { tipo: 'empresa', referencia: null, rotulo: 'Empresa' },
  trimestre: '2026-Q1',
  trimestreAnterior: '2025-Q4',
  mesmoTrimestreAnoAnterior: '2025-Q1',
  blocoFinanceiro: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q1' },
    trimestreAtual: {
      roiAgregado: 1.23,
      faturamentoMedioTrimestral: 500000,
      folhaTotalMedia: 100000,
      percMetaAtingidaAgregada: 95.5,
      colaboradoresAtivos: 42,
    },
    comparativoTrimestreAnterior: {
      roiAgregado: 1.15,
      variacaoPercentualRoi: 6.95,
      percMetaAtingidaAgregada: 92.0,
      variacaoPercentualMeta: 3.8,
    },
    comparativoMesmoTrimestreAnoAnterior: {
      roiAgregado: 1.05,
      variacaoPercentualRoi: 17.14,
    },
  },
  blocoDesempenho: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q1' },
    trimestreAtual: {
      scoreDesempenhoMedioAgregado: 82.5,
      percMetaAtingidaAgregada: 95.5,
      assiduidadeMedia: 97.2,
      distribuicaoPorFaixa: { acimaMeta: 10, naMeta: 20, proximoMeta: 8, abaixoMeta: 4 },
      colaboradoresAtivos: 42,
    },
    comparativoTrimestreAnterior: {
      scoreDesempenhoMedioAgregado: 80.0,
      variacaoPercentual: 3.13,
      percMetaAtingidaAgregada: 92.0,
    },
  },
  blocoPlenitude: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q1' },
    trimestreAtual: {
      plenitudeScoreMedioAgregado: 78.4,
      scoreAMedio: 79.0,
      scoreCMedio: 77.5,
      porDimensaoAgregada: {
        engajamento: 78.0,
        desenvolvimento: 79.0,
        pertencimento: 78.5,
        realizacao: 78.0,
      },
      percColaboradoresComAlertaDivergencia: 4.76,
      colaboradoresAtivos: 42,
    },
    comparativoTrimestreAnterior: {
      plenitudeScoreMedioAgregado: 76.0,
      variacaoPercentual: 3.16,
    },
  },
  blocoClima: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q1' },
    trimestreReferencia: '2026-Q1',
    disponivel: true,
    trimestreAtual: {
      notaClima: 3.85,
      adesao: 87.2,
      porDimensaoAgregada: {
        engajamento: 3.9,
        desenvolvimento: 3.8,
        pertencimento: 3.85,
        realizacao: 3.85,
      },
      respondentes: 36,
    },
    comparativoTrimestreAnterior: {
      notaClima: 3.7,
      variacaoPercentual: 4.05,
    },
    notaAgregacaoAnonimato: null,
  },
  blocoTurnover: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q1' },
    trimestreAtual: {
      turnoverTrimestralPercentual: 4.5,
      turnoverAnualizadoPercentual: 18.0,
      colaboradoresAtivosInicioTrimestre: 42,
      saidasTotais: 2,
      saidasVoluntarias: 1,
      saidasInvoluntarias: 1,
    },
    aberturaPorNivelHierarquico: {
      estrategico: { turnoverPercentual: 0, saidas: 0 },
      tatico: { turnoverPercentual: 5.0, saidas: 1 },
      operacional: { turnoverPercentual: 4.0, saidas: 1 },
    },
    comparativoTrimestreAnterior: {
      turnoverTrimestralPercentual: 3.8,
      variacaoPercentual: 18.42,
    },
  },
  detalhamentoCapilar: {
    departamentos: [
      {
        departamento: 'Comercial',
        colaboradoresAtivos: 12,
        scoreDesempenhoMedio: 85.0,
        plenitudeScoreMedio: 80.0,
        notaClima: 3.9,
        turnoverTrimestralPercentual: 3.0,
        equipes: [
          {
            liderId: 100,
            liderNome: 'Ana Silva',
            colaboradoresAtivos: 6,
            scoreDesempenhoMedio: 86.0,
            plenitudeScoreMedio: 81.0,
          },
        ],
      },
    ],
  },
  paragrafoFinanceiro: 'Paragrafo interpretativo financeiro canonico.',
  paragrafoDesempenho: 'Paragrafo interpretativo de desempenho canonico.',
  paragrafoPlenitude: 'Paragrafo interpretativo de plenitude canonico.',
  paragrafoClima: 'Paragrafo interpretativo de clima canonico.',
  paragrafoTurnover: 'Paragrafo interpretativo de turnover canonico.',
  resumoExecutivoGeral: 'Resumo executivo geral canonico integrado dos 5 blocos.',
  geradoEmIso: '2026-01-15T12:00:00.000Z',
};

describe('executiveReportTemplate — renderExecutiveReportHTML', () => {
  it('gera HTML deterministico byte a byte para o mesmo payload', () => {
    const html1 = renderExecutiveReportHTML(basePayload);
    const html2 = renderExecutiveReportHTML(basePayload);
    expect(html1).toBe(html2);
  });

  it('renderiza secoes canonicas §7.5 no HTML', () => {
    const html = renderExecutiveReportHTML(basePayload);
    expect(html).toContain('Relatório executivo trimestral');
    expect(html).toContain('Resumo executivo geral');
    expect(html).toContain('Bloco Financeiro');
    expect(html).toContain('Bloco Desempenho');
    expect(html).toContain('Bloco Plenitude');
    expect(html).toContain('Bloco Clima');
    expect(html).toContain('Bloco Turnover');
    expect(html).toContain('Comparativo por departamento');
    expect(html).toContain('Detalhamento capilar');
  });

  it('renderiza clima com paragrafo canonico curto quando disponivel=false', () => {
    const payload: ExecutiveReportFinalPayload = {
      ...basePayload,
      blocoClima: {
        ...basePayload.blocoClima,
        disponivel: false,
        trimestreAtual: null,
        comparativoTrimestreAnterior: null,
      },
      paragrafoClima:
        'Bloco de Clima indisponível neste trimestre por número ' +
        'insuficiente de respondentes para preservar anonimato.',
    };
    const html = renderExecutiveReportHTML(payload);
    expect(html).toContain('Bloco de Clima indisponível');
    // Nao renderiza tabela de agregados de clima quando indisponivel.
    expect(html).not.toContain('Nota de clima');
  });

  it('omite bloco Turnover quando blocoTurnover=null (escopo=equipe)', () => {
    const payload: ExecutiveReportFinalPayload = {
      ...basePayload,
      blocoTurnover: null,
      paragrafoTurnover: null,
      escopo: { tipo: 'equipe', referencia: '100', rotulo: 'Equipe Ana Silva' },
      detalhamentoCapilar: { departamentos: [] },
    };
    const html = renderExecutiveReportHTML(payload);
    expect(html).not.toContain('Bloco Turnover');
    expect(html).not.toContain('Comparativo por departamento');
    expect(html).not.toContain('Detalhamento capilar');
  });
});

describe('executiveReportTemplate — composeExecutiveReportFilename', () => {
  it('compoe filename canonico §13.5', () => {
    const filename = composeExecutiveReportFilename(
      'EMPRESA_TESTE',
      '2026-Q1',
      '2026-01-15T12:34:56.000Z',
    );
    expect(filename).toBe('relatorio_executivo_EMPRESA_TESTE_2026-Q1_20260115_1234.pdf');
  });

  it('pad zero-pads em componentes de hora curtos', () => {
    const filename = composeExecutiveReportFilename('X', '2026-Q4', '2026-03-05T04:07:00.000Z');
    expect(filename).toBe('relatorio_executivo_X_2026-Q4_20260305_0407.pdf');
  });
});
