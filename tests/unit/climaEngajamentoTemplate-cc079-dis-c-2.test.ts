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

  it('Rotulos abreviados na tabela comparativa', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    for (const r of ['Resp.', 'Engaj.', 'Desenv.', 'Pertenc.', 'Realiz.']) {
      expect(html).toContain(r);
    }
  });

  it('Ordem canonica das secoes no body', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    const idxPanoramica = html.indexOf('Visão panorâmica');
    const idxTop3 = html.indexOf('Top 3 aspectos individuais');
    const idxDetalhamento = html.indexOf('Detalhamento dos aspectos individuais');
    const idxComparativo = html.indexOf('Comparativo entre departamentos');
    const idxRanking = html.indexOf('Ranking de equipes');
    const idxDrillDepto = html.indexOf('Drill-down por departamento');
    const idxDrillLider = html.indexOf('Drill-down por liderança');
    const idxProximos = html.indexOf('Próximos passos');
    const idxRastre = html.indexOf('Rastreabilidade e integridade');
    expect(idxPanoramica).toBeGreaterThan(0);
    expect(idxTop3).toBeGreaterThan(idxPanoramica);
    expect(idxDetalhamento).toBeGreaterThan(idxTop3);
    expect(idxComparativo).toBeGreaterThan(idxDetalhamento);
    expect(idxRanking).toBeGreaterThan(idxComparativo);
    expect(idxDrillDepto).toBeGreaterThan(idxRanking);
    expect(idxDrillLider).toBeGreaterThan(idxDrillDepto);
    expect(idxProximos).toBeGreaterThan(idxDrillLider);
    expect(idxRastre).toBeGreaterThan(idxProximos);
  });

  it('Drill-down por departamento sem tabela de sub-equipes', () => {
    const html = renderClimaEngajamentoHTML(baseFixture);
    const idxDepto = html.indexOf('Drill-down por departamento');
    const idxLider = html.indexOf('Drill-down por liderança');
    const trechoDepto = html.slice(idxDepto, idxLider);
    expect(trechoDepto).not.toContain('clima-equipes-mini');
  });

  it('Determinismo byte-a-byte (mesma fixture = mesmo HTML)', () => {
    const h1 = renderClimaEngajamentoHTML(baseFixture);
    const h2 = renderClimaEngajamentoHTML(baseFixture);
    expect(h1).toBe(h2);
  });
});
