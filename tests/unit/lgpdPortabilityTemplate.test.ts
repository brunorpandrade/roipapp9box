// ROIP APP 9BOX — teste unit canonico do template
// `src/server/pdf-templates/lgpdPortabilityTemplate.ts` com os novos
// modos canonicos ME-1.12 Despacho A (itens [1.12.a] + [1.12.b] +
// [1.12.c] do roadmap V4).
//
// Cobre bit-exact:
//   1. Modo 'colaborador': HTML inclui cadastrais + termo de aceite,
//      e EXCLUI as 4 secoes de respostas brutas (A, D, COPSOQ, Perfil
//      Individual).
//   2. Modo 'super_admin': HTML inclui todas as secoes canonicas
//      (padrao pre-ME-1.12.a) + termo de aceite.
//   3. Compatibilidade bit-exact: input sem `modo` cai em
//      'super_admin' (preserva callers legados).
//   4. Termo de aceite: renderiza versao + data + texto literal
//      quando `termoAceite` presente; renderiza fallback quando
//      `termoAceite === null` ou `textoLiteral === null`.
//   5. Preambulo canonico muda por modo (titulo "Portabilidade" vs
//      "Meus dados pessoais").

import { describe, expect, it } from 'vitest';

import {
  renderLgpdPortabilityHTML,
  type LgpdPortabilityTemplateInput,
} from '../../src/server/pdf-templates/lgpdPortabilityTemplate';
import { TERMO_LITERAL_V10 } from '../../src/lib/lgpd/termoLiteral';

const BASE_INPUT: LgpdPortabilityTemplateInput = {
  company: { nomeFantasia: 'Empresa Canonica Teste' },
  cadastrais: {
    titularType: 'employee',
    nome: 'Fulana de Tal',
    cpf: '12345678909',
    email: 'fulana@teste.com.br',
    dataNascimento: '1985-06-15',
    dataAdmissao: '2020-01-10',
    cargo: 'Analista de Testes',
    departamento: 'tecnologia',
    cbo: '2124',
    descricaoCBO: 'Analista de Testes',
    nivelHierarquico: 'operacional',
    senioridade: 'pleno',
    jobFamily: 'tecnologia_desenvolvimento',
    status: 'ativo',
  },
  instrumentA: [{ trimestre: '2026-Q1', dimensao: 1, itemIndex: 1, valor: 4, respondidoEm: null }],
  instrumentD: [{ trimestre: '2026-Q1', dimensao: 2, itemIndex: 1, valor: 5, respondidoEm: null }],
  copsoq: [
    {
      cicloDbId: 1,
      cicloReferencia: '2026-Q1',
      fator: 1,
      itemIndex: 1,
      valor: 4,
      respondidoEm: null,
    },
  ],
  individualProfile: [
    {
      assessmentId: 1,
      tentativa: 1,
      status: 'enviado',
      blocoAtual: 10,
      enviadoEm: null,
      respostas: { bloco1: [1, 2, 3] },
    },
  ],
  generatedAtDate: '2026-10-18',
};

describe('lgpdPortabilityTemplate — modo colaborador (ME-1.12.a)', () => {
  it('exclui todas as secoes de respostas brutas', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT, modo: 'colaborador' });
    expect(html).not.toContain('Instrumento A — Autoavaliação');
    expect(html).not.toContain('Instrumento D — Avaliação do líder direto');
    expect(html).not.toContain('Radar NR-1 (COPSOQ)');
    expect(html).not.toContain('Perfil Individual — respostas brutas');
  });

  it('inclui secao canonica de dados cadastrais', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT, modo: 'colaborador' });
    expect(html).toContain('Dados cadastrais');
    expect(html).toContain('Fulana de Tal');
  });

  it('usa titulo canonico "Meus dados pessoais" no preambulo', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT, modo: 'colaborador' });
    expect(html).toContain('Meus dados pessoais');
    expect(html).not.toContain('Portabilidade de dados pessoais');
  });

  it('inclui secao de termo de aceite quando termoAceite presente', () => {
    const html = renderLgpdPortabilityHTML({
      ...BASE_INPUT,
      modo: 'colaborador',
      termoAceite: {
        versao: '1.0',
        aceitoEmDate: '2026-10-15',
        textoLiteral: TERMO_LITERAL_V10,
      },
    });
    expect(html).toContain('Termo de aceite');
    expect(html).toContain('Versão aceita:');
    expect(html).toContain('1.0');
    expect(html).toContain('direitos previstos na lei');
  });

  it('renderiza fallback canonico quando termoAceite === null', () => {
    const html = renderLgpdPortabilityHTML({
      ...BASE_INPUT,
      modo: 'colaborador',
      termoAceite: null,
    });
    expect(html).toContain('Termo de aceite');
    expect(html).toContain('Não há registro de aceite');
  });
});

describe('lgpdPortabilityTemplate — modo super_admin (ME-1.12.b)', () => {
  it('inclui todas as secoes canonicas de respostas brutas', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT, modo: 'super_admin' });
    expect(html).toContain('Instrumento A — Autoavaliação');
    expect(html).toContain('Instrumento D — Avaliação do líder direto');
    expect(html).toContain('Radar NR-1 (COPSOQ)');
    expect(html).toContain('Perfil Individual — respostas brutas');
  });

  it('usa titulo canonico "Portabilidade de dados pessoais" no preambulo', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT, modo: 'super_admin' });
    expect(html).toContain('Portabilidade de dados pessoais');
  });

  it('inclui termo de aceite tambem no modo super_admin (rastreabilidade canonica)', () => {
    const html = renderLgpdPortabilityHTML({
      ...BASE_INPUT,
      modo: 'super_admin',
      termoAceite: {
        versao: '1.0',
        aceitoEmDate: '2026-10-15',
        textoLiteral: TERMO_LITERAL_V10,
      },
    });
    expect(html).toContain('Termo de aceite');
    expect(html).toContain('1.0');
  });
});

describe('lgpdPortabilityTemplate — compatibilidade bit-exact (modo omitido)', () => {
  it('cai em super_admin quando modo nao informado', () => {
    const html = renderLgpdPortabilityHTML({ ...BASE_INPUT });
    expect(html).toContain('Instrumento A — Autoavaliação');
    expect(html).toContain('Portabilidade de dados pessoais');
  });
});

describe('lgpdPortabilityTemplate — termo aceite com versao historica (textoLiteral=null)', () => {
  it('renderiza fallback canonico quando textoLiteral === null', () => {
    const html = renderLgpdPortabilityHTML({
      ...BASE_INPUT,
      modo: 'colaborador',
      termoAceite: {
        versao: '0.5',
        aceitoEmDate: '2024-01-01',
        textoLiteral: null,
      },
    });
    expect(html).toContain('Termo de aceite');
    expect(html).toContain('0.5');
    expect(html).toContain('Versão histórica');
  });
});
