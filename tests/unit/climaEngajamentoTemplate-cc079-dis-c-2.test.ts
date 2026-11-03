// ROIP APP 9BOX — teste unit climaEngajamentoTemplate (CC079-DIS-C-2a).
//
// Cobertura canonica da ME-1.10-CC079-DIS-C-2a:
//   - Fluxo canonico de paginas: Top 3 na pg 2, Detalhamento isolado,
//     Drill-down por departamento, Drill-down por lideranca.
//   - Rodape canonico de equipes abaixo do piso com nome do lider +
//     N liderados.
//   - Ordem canonica das secoes no HTML final.

import { describe, expect, it } from 'vitest';

import {
  renderClimaEngajamentoHTML,
  type ClimaEngajamentoTemplateInput,
} from '../../src/server/pdf-templates/climaEngajamentoTemplate';

const baseFixture: ClimaEngajamentoTemplateInput = {
  nomeFantasia: 'Smoke CC079-DIS-C-2',
  razaoSocialSanitizada: 'SMOKE_CC079',
  logoUrl: null,
  trimestre: '2026-Q3',
  blocoEmpresa: {
    titulo: 'Empresa',
    respondentes: 10,
    notaClima: 7.5,
    adesao: 100,
    porDimensao: {
      engajamento: 7.4,
      desenvolvimento: 7.5,
      pertencimento: 7.6,
      realizacao: 7.5,
    },
    notasPorAspecto: Array.from({ length: 20 }, (_, i) => 7 + (i % 5) * 0.1),
    notaAgregacao: null,
  },
  blocosDepartamentos: [
    {
      titulo: 'Vendas',
      respondentes: 5,
      notaClima: 7.6,
      adesao: 100,
      porDimensao: {
        engajamento: 7.5,
        desenvolvimento: 7.6,
        pertencimento: 7.7,
        realizacao: 7.6,
      },
      notaAgregacao: null,
      equipes: [
        {
          titulo: 'Equipe: Jose Silva',
          respondentes: 4,
          notaClima: 7.6,
          adesao: 100,
          porDimensao: {
            engajamento: 7.5,
            desenvolvimento: 7.6,
            pertencimento: 7.7,
            realizacao: 7.6,
          },
          notaAgregacao: null,
        },
        {
          titulo: 'Equipe: Maria Santos',
          respondentes: 2,
          notaClima: null,
          adesao: null,
          porDimensao: {
            engajamento: null,
            desenvolvimento: null,
            pertencimento: null,
            realizacao: null,
          },
          notaAgregacao: null,
        },
      ],
    },
  ],
  geradoEmIso: '2026-11-01T19:42:00.000Z',
};

describe('climaEngajamentoTemplate CC079-DIS-C-2a', () => {
  it('Top 3 aspectos individuais por dimensao presente no HTML', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Top 3 aspectos individuais por dimensão');
  });

  it('Detalhamento dos aspectos individuais por dimensao presente', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Detalhamento dos aspectos individuais por dimensão');
  });

  it('Drill-down por departamento presente', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Drill-down por departamento');
  });

  it('Drill-down por lideranca presente', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Drill-down por liderança');
  });

  it('Rodape de equipes abaixo do piso presente', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Equipes abaixo do piso de anonimato');
  });

  it('Equipe abaixo do piso lista nome do lider e N liderados', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('Equipe: Maria Santos');
    expect(html).toContain('2 liderados');
  });

  it('CC079-DIS-C-2a-2: Rotulos INTEIROS na tabela comparativa', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    const rotulosInteiros = [
      '<th class="right">Respondentes</th>',
      '<th class="right">Clima</th>',
      '<th class="right">Adesão</th>',
      '<th class="right">Engajamento</th>',
      '<th class="right">Desenvolvimento</th>',
      '<th class="right">Pertencimento</th>',
      '<th class="right">Realização</th>',
    ];
    for (const r of rotulosInteiros) {
      expect(html).toContain(r);
    }
    const rotulosAbreviadosBanidos = [
      '<th class="right">Resp.</th>',
      '<th class="right">Engaj.</th>',
      '<th class="right">Desenv.</th>',
      '<th class="right">Pertenc.</th>',
      '<th class="right">Realiz.</th>',
    ];
    for (const r of rotulosAbreviadosBanidos) {
      expect(html).not.toContain(r);
    }
  });

  it('CC079-DIS-C-2a-3: Ordem canonica das secoes macro->zoom', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    const idxPanoramica = html.indexOf('Visão panorâmica');
    const idxTop3 = html.indexOf('Top 3 aspectos individuais');
    const idxDetalhamento = html.indexOf('Detalhamento dos aspectos individuais');
    const idxComparativo = html.indexOf('Comparativo entre departamentos');
    const idxDrillDepto = html.indexOf('Drill-down por departamento');
    const idxRanking = html.indexOf('Ranking de equipes');
    const idxDrillLider = html.indexOf('Drill-down por liderança');
    const idxProximos = html.indexOf('Próximos passos');
    const idxRastre = html.indexOf('Rastreabilidade e integridade');
    expect(idxPanoramica).toBeGreaterThan(0);
    expect(idxTop3).toBeGreaterThan(idxPanoramica);
    expect(idxDetalhamento).toBeGreaterThan(idxTop3);
    // Depto macro -> zoom
    expect(idxComparativo).toBeGreaterThan(idxDetalhamento);
    expect(idxDrillDepto).toBeGreaterThan(idxComparativo);
    // Equipe macro -> zoom
    expect(idxRanking).toBeGreaterThan(idxDrillDepto);
    expect(idxDrillLider).toBeGreaterThan(idxRanking);
    expect(idxProximos).toBeGreaterThan(idxDrillLider);
    expect(idxRastre).toBeGreaterThan(idxProximos);
  });

  it('Drill-down por departamento sem tabela de sub-equipes', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    // CC079-DIS-C-2a-3: entre Drill depto e Ranking agora (nova
    // sequencia macro->zoom), nao mais entre Drill depto e Drill lider.
    const idxDepto = html.indexOf('Drill-down por departamento');
    const idxRanking = html.indexOf('Ranking de equipes');
    const trechoDepto = html.slice(idxDepto, idxRanking);
    expect(trechoDepto).not.toContain('clima-equipes-mini');
  });

  it('Determinismo byte-a-byte (mesma fixture = mesmo HTML)', () => {
    const h1 = renderClimaEngajamentoHTML(baseFixture);
    const h2 = renderClimaEngajamentoHTML(baseFixture);
    expect(h1).toBe(h2);
  });

  it('CC079-DIS-C-2a-1: Detalhamento usa classe compacta canonica', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('dim-aberta-compacta');
    expect(html).not.toContain('aspecto-dim-grid');
  });

  it('CC079-DIS-C-2a-2: Drill-down usa grid-8 (8 cards por A4)', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('clima-drilldown-grid-8');
    // nenhum consumo da classe antiga -4 por template
    expect(html).not.toContain('clima-drilldown-grid-4');
  });

  it('CC079-DIS-C-2a-2: padding-right global no main (fix bordas)', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('main {\n    padding-right: 1mm;\n  }');
  });

  it('CC079-DIS-C-2a-3: dim-bar da dimensao com 28mm (igual aos aspectos)', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    expect(html).toContain('.dim-aberta-compacta .dim-aberta-barra {\n    width: 28mm;');
    expect(html).not.toContain('.dim-aberta-compacta .dim-aberta-barra {\n    width: 40mm;');
    // Alinhamento canonico do cabecalho com as linhas de aspecto.
    expect(html).toContain(
      '.dim-aberta-compacta .dim-aberta-head {\n    grid-template-columns: 1fr 28mm 11mm;',
    );
  });

  it('CC079-DIS-C-2a-3: card de lideranca SEM "Departamento:" no subtitulo', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    // Procura trecho entre o h2 do drill-down liderança e o fim da secao
    const idxDrillLider = html.indexOf('Drill-down por liderança');
    const idxProximos = html.indexOf('Próximos passos');
    const trechoLider = html.slice(idxDrillLider, idxProximos);
    // Em cards de lider, nao deve mais aparecer "Departamento: ..."
    expect(trechoLider).not.toContain('Departamento:');
    // Metadata do card ainda tem respondentes + adesao
    expect(trechoLider).toContain('respondentes · Adesão');
  });
});
