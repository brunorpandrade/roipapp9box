// ROIP APP 9BOX — teste unitario Template A (ME-060 §12.6).
// Cobre filtragem canonica por severidade + ordenacao (critico > atencao),
// composicao de assunto (1 vs N alertas), rodape por perfil, badge por
// alerta + link canonico.

import { beforeEach, describe, expect, it } from 'vitest';

import { _resetHandlebarsCache } from '../../src/lib/email/handlebarsCompiler';
import type { AlertEmailContext } from '../../src/lib/email/types';
import {
  buildAssuntoTemplateA,
  filterAndSortAlertsForTemplateA,
  renderTemplateA,
  resolvePainelUrl,
  TEMPLATE_A_URL_BASE_PAINEL,
} from '../../src/lib/email/templates/templateA_immediate';

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

describe('resolvePainelUrl — §12.6 linha 1411', () => {
  it('rh', () => {
    expect(resolvePainelUrl('rh')).toBe(`${TEMPLATE_A_URL_BASE_PAINEL}/painel-rh`);
  });
  it('clevel', () => {
    expect(resolvePainelUrl('clevel')).toBe(`${TEMPLATE_A_URL_BASE_PAINEL}/painel-clevel`);
  });
  it('financeiro', () => {
    expect(resolvePainelUrl('financeiro')).toBe(`${TEMPLATE_A_URL_BASE_PAINEL}/painel-financeiro`);
  });
  it('super_admin → /super-admin (§12.6 linha 1411 nota canonica)', () => {
    expect(resolvePainelUrl('super_admin')).toBe(`${TEMPLATE_A_URL_BASE_PAINEL}/super-admin`);
  });
});

describe('filterAndSortAlertsForTemplateA — §12.6', () => {
  it('remove observacao e info; mantem critico e atencao', () => {
    const input = [
      ctx('desempenho_estagnacao', 'atencao'),
      ctx('desempenho_queda_isolada', 'observacao'),
      ctx('responsavel_financeiro_nomeado', 'info'),
      ctx('desempenho_queda_brusca', 'critico'),
    ];
    const out = filterAndSortAlertsForTemplateA(input);
    expect(out.map((a) => a.severidade)).toEqual(['critico', 'atencao']);
  });

  it('ordena critico antes de atencao (estavel dentro da severidade)', () => {
    const input = [
      ctx('desempenho_estagnacao', 'atencao'),
      ctx('desempenho_queda_brusca', 'critico'),
      ctx('assiduidade_baixa', 'critico'),
    ];
    const out = filterAndSortAlertsForTemplateA(input);
    expect(out.map((a) => a.tipo)).toEqual([
      'desempenho_queda_brusca',
      'assiduidade_baixa',
      'desempenho_estagnacao',
    ]);
  });

  it('array vazio retorna vazio', () => {
    expect(filterAndSortAlertsForTemplateA([])).toEqual([]);
  });
});

describe('buildAssuntoTemplateA — §12.6', () => {
  it('1 alerta: "{nome} — {tipo_legivel}"', () => {
    const a = ctx('nr1_fator_critico', 'atencao');
    expect(buildAssuntoTemplateA('ACME Ltda', [a])).toBe(
      '[ROIP APP] ACME Ltda — rot-nr1_fator_critico',
    );
  });

  it('N > 1 alertas: "{nome} — {N} novos alertas"', () => {
    const alerts = [ctx('assiduidade_baixa', 'critico'), ctx('desempenho_estagnacao', 'atencao')];
    expect(buildAssuntoTemplateA('ACME Ltda', alerts)).toBe(
      '[ROIP APP] ACME Ltda — 2 novos alertas',
    );
  });
});

describe('renderTemplateA — §12.6 integracao', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('renderiza saudacao + contador + badges + rodape com perfil', () => {
    const alerts = [ctx('desempenho_queda_brusca', 'critico')];
    const r = renderTemplateA({
      primeiroNome: 'Bruno',
      nomeEmpresa: 'ACME Ltda',
      perfil: 'super_admin',
      alerts,
    });
    expect(r.assunto).toBe('[ROIP APP] ACME Ltda — rot-desempenho_queda_brusca');
    expect(r.corpoTexto).toContain('Ola, Bruno,');
    expect(r.corpoTexto).toContain('Voce tem 1 novo(s) alerta(s)');
    expect(r.corpoTexto).toContain('🔴 rot-desempenho_queda_brusca');
    expect(r.corpoTexto).toContain('ctx-desempenho_queda_brusca');
    expect(r.corpoTexto).toContain('[Ver detalhes →] /link/desempenho_queda_brusca');
    expect(r.corpoTexto).toContain(`${TEMPLATE_A_URL_BASE_PAINEL}/super-admin`);
  });

  it('corpo HTML sem target=_blank (B3)', () => {
    const r = renderTemplateA({
      primeiroNome: 'Bruno',
      nomeEmpresa: 'ACME Ltda',
      perfil: 'rh',
      alerts: [ctx('assiduidade_baixa', 'critico')],
    });
    expect(r.corpoHtml).not.toContain('target="_blank"');
    expect(r.corpoHtml).toContain('href="/link/assiduidade_baixa"');
  });
});
