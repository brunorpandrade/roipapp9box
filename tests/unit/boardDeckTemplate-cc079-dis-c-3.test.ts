// ROIP APP 9BOX — teste unit boardDeckTemplate (CC079-DIS-C-3-BOARD).
//
// Cobertura canonica das correcoes da ME-1.10-CC079-DIS-C-3-BOARD:
//   - Cabecalho "#" removido da tabela do Radar NR-1 (coluna de
//     numero mantida, so sem rotulo).
//   - Alinhamento canonico: colunas de numero, Tipo e Score
//     centralizadas; Fator a esquerda.
//   - Numero do fator preservado em cada linha de dados.

import { describe, expect, it } from 'vitest';

import {
  renderBoardDeckHTML,
  type BoardDeckTemplateInput,
} from '../../src/server/pdf-templates/boardDeckTemplate';

const baseFixture: BoardDeckTemplateInput = {
  nomeFantasia: 'Smoke Board CC079-DIS-C-3',
  razaoSocialSanitizada: 'SMOKE_BOARD_CC079',
  logoUrl: null,
  trimestre: '2026-Q3',
  escopoTipo: 'empresa',
  escopoRotulo: 'Empresa',
  nineBoxDistribuicao: {
    'ALTO IMPACTO': 10,
    'DESEMPENHO REPRESADO': 2,
    'POTENCIAL SUBUTILIZADO': 1,
    'ALTA ENTREGA': 8,
    'EQUILÍBRIO FRÁGIL': 4,
    'DESEMPENHO CRÍTICO': 1,
    'RISCO DE ESGOTAMENTO': 0,
    'DESGASTE OCULTO': 0,
    'RISCO CRÍTICO': 0,
  },
  totalClassificados: 26,
  roi: {
    roiAgregado: 5.2,
    variacaoTrimestreAnterior: 3.94,
    variacaoAnoAnterior: null,
  },
  radarPsicossocial: [
    { fatorId: 1, nome: 'Exigências quantitativas', scoreZeroCem: 39 },
    { fatorId: 2, nome: 'Ritmo de trabalho', scoreZeroCem: 44 },
    { fatorId: 3, nome: 'Conflitos de papel', scoreZeroCem: 60 },
    { fatorId: 4, nome: 'Autonomia', scoreZeroCem: 66 },
    { fatorId: 5, nome: 'Suporte social do líder', scoreZeroCem: 72 },
    { fatorId: 6, nome: 'Suporte social de colegas', scoreZeroCem: 79 },
    { fatorId: 7, nome: 'Insegurança no trabalho', scoreZeroCem: 66 },
    { fatorId: 8, nome: 'Saúde geral autopercebida', scoreZeroCem: 73 },
  ],
  turnover: {
    trimestralPercentual: 6,
    anualizadoPercentual: 12.5,
    variacaoTrimestreAnteriorPercentual: 1.83,
    variacaoTrimestreAnteriorPercentualRelativa: 43.88,
    ultimos12MesesPercentual: 12.5,
    voluntarioPercentual: 2,
    involuntarioPercentual: 4,
    saidasTotaisTrimestre: 3,
    saidasVoluntariasTrimestre: 1,
    saidasInvoluntariasTrimestre: 2,
    aberturaPorNivel: {
      estrategico: { turnoverPercentual: 0, saidas: 0 },
      tatico: { turnoverPercentual: 0, saidas: 0 },
      operacional: { turnoverPercentual: 7.32, saidas: 3 },
    },
  },
  geradoEmIso: '2026-11-02T22:00:00.000Z',
};

describe('boardDeckTemplate CC079-DIS-C-3-BOARD', () => {
  it('tabela Radar NR-1 SEM rotulo "#" no cabecalho', () => {
    const html = renderBoardDeckHTML(baseFixture);
    // O cabecalho da coluna de numero fica vazio.
    expect(html).toContain('<th style="text-align:center;"></th><th>Fator</th>');
    // Nao deve haver mais nenhum "<th" literal com o rotulo "#".
    expect(html).not.toContain('<th class="right">#</th>');
    expect(html).not.toContain('<th>#</th>');
  });

  it('tabela Radar com cabecalhos "Tipo" e "Score" centralizados', () => {
    const html = renderBoardDeckHTML(baseFixture);
    expect(html).toContain('<th style="text-align:center;">Tipo</th>');
    expect(html).toContain('<th style="text-align:center;">Score (0-100)</th>');
  });

  it('coluna de numero dos fatores preservada em cada linha (1..8)', () => {
    const html = renderBoardDeckHTML(baseFixture);
    for (let i = 1; i <= 8; i += 1) {
      // Cada numero sai como <td style="text-align:center;">N</td>
      expect(html).toContain(`<td style="text-align:center;">${i}</td>`);
    }
  });

  it('celulas de dados "Tipo" e "Score" centralizadas', () => {
    const html = renderBoardDeckHTML(baseFixture);
    // Tipo com cor cinza + centralizacao canonica.
    expect(html).toContain('<td style="text-align:center; color:#6B7280;">Risco</td>');
    expect(html).toContain('<td style="text-align:center; color:#6B7280;">Recurso</td>');
    // Score em span semaforizado dentro de td centralizado.
    expect(html).toContain('<td style="text-align:center;"><span class="');
  });

  it('determinismo byte-a-byte', () => {
    const h1 = renderBoardDeckHTML(baseFixture);
    const h2 = renderBoardDeckHTML(baseFixture);
    expect(h1).toBe(h2);
  });

  it('herdou paleta amarelo canonico #F2A900 do layoutBase (CC079-DIS-C-2a-1)', () => {
    const html = renderBoardDeckHTML(baseFixture);
    expect(html).toContain('#F2A900');
    expect(html).not.toContain('#D97706');
  });

  it('herdou fix global das bordas via main padding-right (CC079-DIS-C-2a-2)', () => {
    const html = renderBoardDeckHTML(baseFixture);
    expect(html).toContain('main {\n    padding-right: 1mm;\n  }');
  });
});
