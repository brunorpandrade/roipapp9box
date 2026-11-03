// ROIP APP 9BOX — teste unit executiveReportTemplate (CC079-DIS-C-3-EXEC).
//
// Cobertura canonica consolidada das 3 MEs da serie CC079-DIS-C-3-EXEC:
//
// CC079-DIS-C-3-EXEC (origem):
//   1. Painel executivo em DUAS linhas (3+2 full-width cada).
//   2. Bloco Financeiro em 7 KPIs exatos distribuidos em 3 linhas
//      (2+2+3). Removidos: Variação ano, META/REALIZADO/% META.
//   3. Bloco Plenitude: card 1 sem subtexto "N colaboradores ativos";
//      card 3 "Liderança"; card 4 "Divergência"; card variação por
//      extenso + sinal.
//   4. Bloco Turnover: subtexto do card variação apenas com %
//      relativo sinalizado (sem "vs trim. anterior" redundante).
//
// CC079-DIS-C-3-EXEC-1 (5 ajustes finos pos-auditoria):
//   5. Painel executivo com delta "+X% vs trimestre anterior" por
//      extenso.
//   6. Bloco Financeiro — Distância do teto ideal com subtexto
//      canonico sem repetir numero.
//   7. Bloco Clima — card variação por extenso + grid redimensionado.
//   8. Clima dimensões abertas usam .dim-aberta-compacta.
//   9. Bloco Turnover em 3 linhas (2+2+2).
//
// CC079-DIS-C-3-EXEC-2 (3 ajustes pos-auditoria do EXEC-1):
//  10. Painel executivo amarelo em #F2A900 canonico (antes #92400E
//      laranja/marrom antigo).
//  11. Bloco Desempenho sem card "% da meta atingida" (2 cards
//      restantes full-width).
//  12. Bloco Plenitude em 2 linhas full-width (2 + 3): PlenitudeMédia
//      + Variação na linha 1; Autoavaliação + Lideranca + Divergência
//      na linha 2.
//
// CC079-DIS-C-3-EXEC-3 (1 ajuste pos-auditoria do EXEC-2):
//  13. .achado-item.achado-amarelo com color #F2A900 canonico (antes
//      #78350F marrom antigo). Afeta os bullets amarelos do Resumo
//      executivo geral.

import { describe, expect, it } from 'vitest';

import { renderExecutiveReportHTML } from '../../src/server/pdf-templates/executiveReportTemplate';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import type { ExecutiveReportFinalPayload } from '../../src/server/services/_shared/executiveReportTypes';

const basePayload: ExecutiveReportFinalPayload = {
  companyId: 1,
  nomeFantasia: 'Smoke CC079-DIS-C-3-EXEC',
  razaoSocialSanitizada: 'SMOKE_EXEC',
  escopo: { tipo: 'empresa', referencia: null, rotulo: 'Empresa' },
  trimestre: '2026-Q4',
  trimestreAnterior: '2026-Q3',
  mesmoTrimestreAnoAnterior: '2025-Q4',
  blocoFinanceiro: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      roiAgregado: 5.2,
      faturamentoMedioTrimestral: 1_820_000,
      folhaTotalMedia: 350_200,
      percMetaAtingidaAgregada: 167.7,
      colaboradoresAtivos: 53,
      percFolhaFaturamento: 19.24,
      folhaPercMinimaIdeal: 16.0,
      folhaPercMaximaIdeal: 25.0,
      faturamentoIdeal: 2_600_000,
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
      distribuicaoPorFaixa: { acimaMeta: 53, naMeta: 0, proximoMeta: 0, abaixoMeta: 0 },
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
      plenitudeScoreMedioAgregado: 76.01,
      scoreAMedio: 75.61,
      scoreCMedio: 76.28,
      porDimensaoAgregada: {
        engajamento: 75.58,
        desenvolvimento: 75.93,
        pertencimento: 75.58,
        realizacao: 76.69,
      },
      percColaboradoresComAlertaDivergencia: 0,
      colaboradoresAtivos: 53,
    },
    comparativoTrimestreAnterior: {
      plenitudeScoreMedioAgregado: 75.39,
      variacaoPercentual: 0.82,
    },
  },
  blocoClima: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreReferencia: '2026-Q4',
    disponivel: true,
    trimestreAtual: {
      notaClima: 7.49,
      adesao: 100,
      porDimensaoAgregada: {
        engajamento: 7.42,
        desenvolvimento: 7.48,
        pertencimento: 7.5,
        realizacao: 7.56,
      },
      respondentes: 50,
      notasPorAspecto: Array.from({ length: 20 }, (_, i) => 7 + (i % 5) * 0.1),
    },
    comparativoTrimestreAnterior: {
      notaClima: 7.33,
      variacaoPercentual: 2.18,
    },
    notaAgregacaoAnonimato: null,
  },
  blocoTurnover: {
    escopo: { tipo: 'empresa', referencia: 'Empresa', trimestre: '2026-Q4' },
    trimestreAtual: {
      turnoverTrimestralPercentual: 6,
      turnoverAnualizadoPercentual: 12.5,
      colaboradoresAtivosInicioTrimestre: 53,
      saidasTotais: 3,
      saidasVoluntarias: 1,
      saidasInvoluntarias: 2,
      turnoverVoluntarioPercentual: 2,
      turnoverInvoluntarioPercentual: 4,
    },
    ultimos12Meses: {
      turnoverPercentual: 12.5,
      saidasTotais: 7,
      headcountInicio: 53,
    },
    aberturaPorNivelHierarquico: {
      estrategico: { turnoverPercentual: 0, saidas: 0 },
      tatico: { turnoverPercentual: 0, saidas: 0 },
      operacional: { turnoverPercentual: 7.32, saidas: 3 },
    },
    comparativoTrimestreAnterior: {
      turnoverTrimestralPercentual: 4.17,
      variacaoPercentual: 43.88,
    },
  },
  detalhamentoCapilar: {
    departamentos: [],
  },
  paragrafoFinanceiro: 'Paragrafo canonico financeiro.',
  paragrafoDesempenho: 'Paragrafo canonico desempenho.',
  paragrafoPlenitude: 'Paragrafo canonico plenitude.',
  paragrafoClima: 'Paragrafo canonico clima.',
  paragrafoTurnover: 'Paragrafo canonico turnover.',
  resumoExecutivoGeral: 'Resumo executivo canonico.',
  topDestaques: [
    'ROI subiu 3,94% vs trimestre anterior.',
    'Plenitude média subiu 0,82%.',
    'Desempenho recuou 0,50%.',
  ] as const,
  geradoEmIso: '2026-11-02T22:00:00.000Z',
};

describe('executiveReportTemplate CC079-DIS-C-3-EXEC', () => {
  it('Painel executivo em DUAS linhas canonicas (3 + 2)', () => {
    const html = renderExecutiveReportHTML(basePayload);
    expect(html).toContain('painel-exec-grid-3');
    expect(html).toContain('painel-exec-grid-2');
    const idxGrid3 = html.indexOf('painel-exec-grid-3');
    const idxGrid2 = html.indexOf('painel-exec-grid-2');
    expect(idxGrid3).toBeGreaterThan(0);
    expect(idxGrid2).toBeGreaterThan(idxGrid3);
  });

  it('Bloco Financeiro: 7 KPIs exatos (sem META/REALIZADO/% META)', () => {
    const html = renderExecutiveReportHTML(basePayload);
    // Isolar o trecho do Bloco Financeiro para asserções precisas.
    // CC079-DIS-C-3-EXEC-2: "% da meta atingida" foi tambem removido
    // do Bloco Desempenho. Aqui o foco da assercao e o Financeiro.
    const idxFin = html.indexOf('<h2>Bloco Financeiro</h2>');
    const idxDes = html.indexOf('<h2>Bloco Desempenho</h2>');
    expect(idxFin).toBeGreaterThan(0);
    expect(idxDes).toBeGreaterThan(idxFin);
    const trechoFin = html.slice(idxFin, idxDes);
    // Rotulos presentes no Financeiro.
    expect(trechoFin).toContain('<div class="kpi-label">ROI agregado</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Variação vs. trimestre anterior</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Folha / faturamento</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Distância do teto ideal</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Faturamento médio</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Folha total</div>');
    expect(trechoFin).toContain('<div class="kpi-label">Colaboradores</div>');
    // Rotulos BANIDOS no Financeiro.
    expect(trechoFin).not.toContain('<div class="kpi-label">Meta</div>');
    expect(trechoFin).not.toContain('<div class="kpi-label">Realizado</div>');
    expect(trechoFin).not.toContain('<div class="kpi-label">% da meta atingida</div>');
    expect(trechoFin).not.toContain('<div class="kpi-label">Colaboradores ativos</div>');
    expect(trechoFin).not.toContain('Variação vs. mesmo trim. ano anterior');
  });

  it('Bloco Plenitude: card 1 sem "colaboradores ativos" + card 3 e 4 canonizados', () => {
    const html = renderExecutiveReportHTML(basePayload);
    expect(html).toContain('<div class="kpi-label">Liderança</div>');
    expect(html).toContain('<div class="kpi-label">Divergência</div>');
    expect(html).not.toContain('<div class="kpi-label">Avaliação da liderança</div>');
    expect(html).not.toContain('<div class="kpi-label">Alerta de divergência</div>');
    // Card 1 "Plenitude média" NAO tem mais o subtexto de colaboradores ativos.
    const idxPlenitude = html.indexOf('<div class="kpi-label">Plenitude média</div>');
    const idxAuto = html.indexOf('<div class="kpi-label">Autoavaliação</div>');
    const trecho = html.slice(idxPlenitude, idxAuto);
    expect(trecho).not.toContain('colaboradores ativos');
  });

  it('Bloco Plenitude: card variacao por extenso + sinal + sem subtexto', () => {
    const html = renderExecutiveReportHTML(basePayload);
    // O card de variacao em Plenitude agora tem titulo POR EXTENSO.
    expect(html).toContain('<div class="kpi-label">Variação vs. trimestre anterior</div>');
    // O card de variacao de Plenitude NAO deve mais ter "Plenitude média comparada".
    expect(html).not.toContain('Plenitude média comparada');
    // O valor deve carregar o sinal explicito (+0,82%).
    expect(html).toContain('+0,82%');
  });

  it('Bloco Turnover: p.p. em span canonico + subtexto sem "vs trim. anterior"', () => {
    const html = renderExecutiveReportHTML(basePayload);
    // Card de variacao do turnover: p.p. em span pp-unidade.
    expect(html).toContain('<span class="pp-unidade"> p.p.</span>');
    // Subtexto NAO deve mais conter "vs trim. anterior".
    const idxTurn = html.indexOf('Bloco Turnover');
    const idxFim = html.indexOf('</section>', idxTurn);
    const trechoTurn = html.slice(idxTurn, idxFim);
    expect(trechoTurn).not.toContain('vs trim. anterior');
  });

  it('Determinismo byte-a-byte', () => {
    const h1 = renderExecutiveReportHTML(basePayload);
    const h2 = renderExecutiveReportHTML(basePayload);
    expect(h1).toBe(h2);
  });

  it('Herancas do Clima: paleta #F2A900 + main padding-right', () => {
    const html = renderExecutiveReportHTML(basePayload);
    expect(html).toContain('#F2A900');
    expect(html).not.toContain('#D97706');
    expect(html).toContain('main {\n    padding-right: 1mm;\n  }');
  });

  it('CC079-DIS-C-3-EXEC-1: Painel executivo com delta por extenso', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxPainel = html.indexOf('Painel executivo do trimestre');
    const idxResumo = html.indexOf('Resumo executivo geral');
    const trechoPainel = html.slice(idxPainel, idxResumo);
    expect(trechoPainel).toContain('vs trimestre anterior');
    expect(trechoPainel).not.toContain('vs trim. ant.');
    // Fonte do delta reduzida + nowrap para caber em uma linha.
    expect(html).toContain('white-space: nowrap;');
  });

  it('CC079-DIS-C-3-EXEC-1: Distância do teto ideal sem repetir numero', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxDist = html.indexOf('Distância do teto ideal');
    const trecho = html.slice(idxDist, idxDist + 500);
    expect(trecho).toContain('Pontos percentuais abaixo do teto');
    expect(trecho).not.toContain('5,8 p.p. abaixo do teto');
    expect(trecho).not.toContain('7,4 p.p. abaixo do teto');
  });

  it('CC079-DIS-C-3-EXEC-1: Clima com variacao por extenso + grid redimensionado', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxClima = html.indexOf('<h2>Bloco Clima</h2>');
    const idxTurn = html.indexOf('<h2>Bloco Turnover</h2>');
    const trecho = html.slice(idxClima, idxTurn);
    // Titulo canonico por extenso na variacao do Clima.
    expect(trecho).toContain('<div class="kpi-label">Variação vs. trimestre anterior</div>');
    expect(trecho).not.toContain('<div class="kpi-label">Variação vs. trim. anterior</div>');
    // Grid redimensionado 0.75 + 0.75 + 1.5 para abrir espaco a variacao.
    expect(trecho).toContain('grid-template-columns: 0.75fr 0.75fr 1.5fr;');
  });

  it('CC079-DIS-C-3-EXEC-1: Clima dimensoes abertas usam .dim-aberta-compacta', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxDim = html.indexOf('Clima — dimensões abertas por aspecto');
    expect(idxDim).toBeGreaterThan(0);
    const trecho = html.slice(idxDim, idxDim + 2000);
    expect(trecho).toContain('dim-aberta-compacta');
  });

  it('CC079-DIS-C-3-EXEC-1: Bloco Turnover em 3 linhas (2+2+2)', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxTurn = html.indexOf('<h2>Bloco Turnover</h2>');
    const idxFim = html.indexOf('</section>', idxTurn);
    const trecho = html.slice(idxTurn, idxFim);
    // Nenhum grid de 4 colunas no Turnover (antes tinha repeat(4, 1fr)).
    expect(trecho).not.toContain('grid-template-columns: repeat(4, 1fr);');
    // Dois grids 2x1 canonicos.
    const matches = trecho.match(/grid-template-columns: repeat\(2, 1fr\);/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('CC079-DIS-C-3-EXEC-2: Painel executivo amarelo em #F2A900 canonico', () => {
    const html = renderExecutiveReportHTML(basePayload);
    // kpi do card amarelo do painel exec canonizado em #F2A900
    // (antes era #92400E, laranja/marrom antigo).
    expect(html).toContain('.painel-exec-card.painel-amarelo .painel-exec-kpi { color: #F2A900; }');
    expect(html).not.toContain(
      '.painel-exec-card.painel-amarelo .painel-exec-kpi { color: #92400E; }',
    );
    // delta dentro do card amarelo tambem canonizado em #F2A900.
    expect(html).toContain('.painel-exec-card.painel-amarelo .painel-exec-delta,');
  });

  it('CC079-DIS-C-3-EXEC-2: Bloco Desempenho sem card "% da meta atingida"', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxDes = html.indexOf('<h2>Bloco Desempenho</h2>');
    const idxFimDes = html.indexOf('</section>', idxDes);
    const trechoDes = html.slice(idxDes, idxFimDes);
    // O card "% da meta atingida" foi removido do Bloco Desempenho.
    expect(trechoDes).not.toContain('<div class="kpi-label">% da meta atingida</div>');
    // "Média ponderada" (subtexto do card removido) nao deve aparecer no bloco.
    expect(trechoDes).not.toContain('<div class="kpi-sub">Média ponderada</div>');
  });

  it('CC079-DIS-C-3-EXEC-2: Bloco Plenitude em 2 linhas full-width (2 + 3)', () => {
    const html = renderExecutiveReportHTML(basePayload);
    const idxPlen = html.indexOf('<h2>Bloco Plenitude</h2>');
    const idxPerfil = html.indexOf('Perfil por dimensão', idxPlen);
    const trechoCabecalho = html.slice(idxPlen, idxPerfil);
    // Linha 1 full-width 1fr 1fr (Plenitude média + Variação).
    expect(trechoCabecalho).toContain('grid-template-columns: 1fr 1fr;');
    // Linha 2 full-width 1fr 1fr 1fr (Autoavaliação + Lideranca + Divergência).
    expect(trechoCabecalho).toContain('grid-template-columns: 1fr 1fr 1fr;');
    // Grid antigo de 4 colunas (repeat(4, 1fr)) nao deve existir no cabecalho.
    expect(trechoCabecalho).not.toContain('grid-template-columns: repeat(4, 1fr);');
    // Ordem canonica: Plenitude média ANTES de Variação na linha 1.
    const idxPlenMedia = trechoCabecalho.indexOf('Plenitude média');
    const idxVariacao = trechoCabecalho.indexOf('Variação vs. trimestre anterior');
    const idxAutoav = trechoCabecalho.indexOf('Autoavaliação');
    const idxLideranca = trechoCabecalho.indexOf('>Liderança<');
    const idxDiverg = trechoCabecalho.indexOf('>Divergência<');
    expect(idxPlenMedia).toBeGreaterThan(0);
    expect(idxVariacao).toBeGreaterThan(idxPlenMedia);
    expect(idxAutoav).toBeGreaterThan(idxVariacao);
    expect(idxLideranca).toBeGreaterThan(idxAutoav);
    expect(idxDiverg).toBeGreaterThan(idxLideranca);
  });

  it('CC079-DIS-C-3-EXEC-3: achado-amarelo com texto em #F2A900', () => {
    const html = renderExecutiveReportHTML(basePayload);
    // Regra CSS canonica do achado amarelo (bullets do Resumo executivo geral).
    expect(html).toContain(
      '.achado-item.achado-amarelo { background: #FEFCE8; ' +
        'border-left-color: #F2A900; color: #F2A900; }',
    );
    // Cor marrom antiga NAO deve mais estar presente nessa regra.
    expect(html).not.toContain(
      '.achado-item.achado-amarelo { background: #FEFCE8; ' +
        'border-left-color: #F2A900; color: #78350F; }',
    );
  });
});
