// ROIP APP 9BOX — teste unitario Template B (ME-060 §12.7).
// Cobre filtragem canonica por severidade (remove critico e info; mantem
// atencao e observacao), ordenacao, assunto com weekStart/weekEnd,
// contadores {N} atencao · {M} observacao.

import { beforeEach, describe, expect, it } from 'vitest';

import { _resetHandlebarsCache } from '../../src/lib/email/handlebarsCompiler';
import type { AlertEmailContext } from '../../src/lib/email/types';
import {
  buildAssuntoTemplateB,
  filterAndSortAlertsForTemplateB,
  renderTemplateB,
  TEMPLATE_B_URL_NOTIFICACOES,
} from '../../src/lib/email/templates/templateB_weeklyDigest';

function ctx(
  tipo: AlertEmailContext['tipo'],
  severidade: AlertEmailContext['severidade'],
): AlertEmailContext {
  return {
    tipo,
    rotuloLegivel: `rot-${tipo}`,
    severidade,
    emojiSeveridade:
      severidade === 'critico'
        ? '🔴'
        : severidade === 'atencao'
          ? '🔶'
          : severidade === 'observacao'
            ? '⚪'
            : '🔵',
    contextoCurto: `ctx-${tipo}`,
    linkDestino: `/link/${tipo}`,
  };
}

describe('filterAndSortAlertsForTemplateB — §12.7', () => {
  it('remove critico e info; mantem atencao e observacao', () => {
    const input = [
      ctx('desempenho_queda_brusca', 'critico'),
      ctx('desempenho_estagnacao', 'atencao'),
      ctx('desempenho_queda_isolada', 'observacao'),
      ctx('responsavel_financeiro_nomeado', 'info'),
    ];
    const out = filterAndSortAlertsForTemplateB(input);
    expect(out.map((a) => a.severidade)).toEqual(['atencao', 'observacao']);
  });

  it('ordena atencao antes de observacao (estavel dentro da severidade)', () => {
    const input = [
      ctx('desempenho_queda_isolada', 'observacao'),
      ctx('desempenho_estagnacao', 'atencao'),
      ctx('divergencia_a_c', 'observacao'),
    ];
    const out = filterAndSortAlertsForTemplateB(input);
    expect(out.map((a) => a.tipo)).toEqual([
      'desempenho_estagnacao',
      'desempenho_queda_isolada',
      'divergencia_a_c',
    ]);
  });
});

describe('buildAssuntoTemplateB — §12.7', () => {
  it('assunto com weekStart/weekEnd DD/MM/YYYY', () => {
    expect(buildAssuntoTemplateB('ACME Ltda', '05/01/2026', '12/01/2026')).toBe(
      '[ROIP APP] ACME Ltda — Resumo semanal de alertas (05/01/2026 a 12/01/2026)',
    );
  });
});

describe('renderTemplateB — §12.7 integracao', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('renderiza contadores + secoes atencao/observacao + link canonico', () => {
    const alerts = [
      ctx('desempenho_estagnacao', 'atencao'),
      ctx('desempenho_queda_isolada', 'observacao'),
      ctx('divergencia_a_c', 'observacao'),
    ];
    const r = renderTemplateB({
      primeiroNome: 'Ana',
      nomeEmpresa: 'ACME Ltda',
      weekStartFormatted: '05/01/2026',
      weekEndFormatted: '12/01/2026',
      alerts,
    });
    expect(r.assunto).toBe(
      '[ROIP APP] ACME Ltda — Resumo semanal de alertas (05/01/2026 a 12/01/2026)',
    );
    expect(r.corpoTexto).toContain('Olá, Ana,');
    // Contador: 1 atenção, 2 observação
    expect(r.corpoTexto).toContain('1 atenção · 2 observação');
    // Semana no formato DD/MM curto
    expect(r.corpoTexto).toContain('semana de 05/01 a 12/01');
    expect(r.corpoTexto).toContain('Atenção');
    expect(r.corpoTexto).toContain('Observação');
    expect(r.corpoTexto).toContain(TEMPLATE_B_URL_NOTIFICACOES);
  });

  it('secao vazia mostra "(nenhum)"', () => {
    const alerts = [ctx('desempenho_estagnacao', 'atencao')];
    const r = renderTemplateB({
      primeiroNome: 'Ana',
      nomeEmpresa: 'ACME Ltda',
      weekStartFormatted: '05/01/2026',
      weekEndFormatted: '12/01/2026',
      alerts,
    });
    expect(r.corpoTexto).toContain('1 atenção · 0 observação');
    expect(r.corpoTexto).toContain('(nenhum)');
  });
});
