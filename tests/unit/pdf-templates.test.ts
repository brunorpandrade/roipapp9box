// ROIP APP 9BOX — teste unitario dos templates PDF (ME-050/51, S257).
//
// Cobre:
// - `escapeHtml` — escape canonico de todos os caracteres relevantes.
// - `renderLayoutBase` — determinismo, presenca de header/footer,
//   inclusao/omissao de logo.
// - `renderIndividualProfileHTML` — presenca das secoes canonicas,
//   render dos blocos condicionais quando `null` vs preenchido.
// - `renderNr1ReportHTML` — 13 secoes canonicas §11.12 presentes,
//   nota de auditoria condicional, radares vazios com fallback.
// - `normalizeColaboradorNameForFilename` — regras da §10.10.
// - `normalizeNomeEmpresaForFilename` — regras da §11.12 (limite 40
//   caracteres, remocao dos caracteres especiais enumerados).
// - `composeIndividualProfileFilename` e `composeNr1ReportFilename`
//   — formato canonico.

import { describe, expect, it } from 'vitest';

import {
  composeIndividualProfileFilename,
  type IndividualProfileTemplateInput,
  normalizeColaboradorNameForFilename,
  renderIndividualProfileHTML,
} from '../../src/server/pdf-templates/individualProfileTemplate';
import { escapeHtml, renderLayoutBase } from '../../src/server/pdf-templates/layoutBase';
import {
  composeNr1ReportFilename,
  normalizeNomeEmpresaForFilename,
  type Nr1TemplateInput,
  renderNr1ReportHTML,
} from '../../src/server/pdf-templates/nr1Template';

// ============================================================
// Fixtures canonicas deterministicas
// ============================================================

const CANON_INDIVIDUAL: IndividualProfileTemplateInput = {
  company: { nomeFantasia: 'Nexus & Cia' },
  identificacao: {
    nome: 'Maria da Silva',
    cargo: 'Gerente de Operações',
    nivelHierarquico: 'tatico',
    departamento: 'Operações',
    liderDireto: 'João Souza',
    dataAplicacao: '2026-06-15',
  },
  expandido: {
    sintese_executiva: 'Perfil equilibrado com alta orientação a pessoas.',
    como_age: 'Age de forma colaborativa, priorizando alinhamento.',
    quem_e: 'Profissional experiente com foco em resultado.',
    o_que_move: 'Aprendizado contínuo e propósito de contribuir.',
    como_reage_sob_pressao: 'Mantém compostura, ainda que reduza delegação.',
    naturalmente_excelente: 'Leitura fina de dinâmicas de equipe.',
    recomendacoes_executivas: [
      'Consolidar rituais de escuta ativa com liderados.',
      'Testar delegação em contextos de baixa criticidade.',
    ],
    confiabilidade: 'alta',
    natural_vs_adaptado: null,
    padrao_paradoxal: null,
    dimensoes_com_hedge: null,
  },
  subvetores: [
    { bloco: 'Postura', rotulo: 'Assertividade e ritmo', valor: 62.5 },
    { bloco: 'Estrutura', rotulo: 'Abertura à experiência', valor: 78 },
    { bloco: 'Motor', rotulo: 'Maestria', valor: 71.3 },
    { bloco: 'Equilibrio', rotulo: 'Autoconsciência', valor: 84 },
    { bloco: 'Assinatura', rotulo: 'Sabedoria', valor: 66 },
  ],
  generatedAtDate: '2026-07-28',
};

const CANON_NR1: Nr1TemplateInput = {
  company: { nomeFantasia: 'Acme Indústria' },
  ciclo: {
    cicloRotulo: '2026-Q2',
    dataAbertura: '2026-04-01',
    dataFechamento: '2026-06-30',
    totalRespondentes: 42,
    totalElegiveis: 50,
  },
  resumoExecutivo: 'Fatores gerais estáveis; atenção a Demandas.',
  radarEmpresa: [
    { fatorId: 1, nome: 'Demandas', score: 45 },
    { fatorId: 2, nome: 'Controle', score: 72 },
    { fatorId: 3, nome: 'Apoio', score: 68 },
    { fatorId: 4, nome: 'Relações', score: 71 },
    { fatorId: 5, nome: 'Função', score: 65 },
    { fatorId: 6, nome: 'Mudança', score: 60 },
    { fatorId: 7, nome: 'Saúde', score: 74 },
    { fatorId: 8, nome: 'Reconhecimento', score: 55 },
  ],
  radaresPorDepartamento: [
    {
      departamentoNome: 'Manufatura',
      amostra: 20,
      fatores: [{ fatorId: 1, nome: 'Demandas', score: 40 }],
    },
  ],
  departamentosInsuficientes: [{ departamentoNome: 'Diretoria', amostra: 3 }],
  divergencias: [
    {
      fatorNome: 'Demandas',
      scoreEmpresa: 45,
      scoreDepartamento: 40,
      departamentoNome: 'Manufatura',
      gap: -5,
    },
  ],
  departamentoCritico: {
    nome: 'Manufatura',
    fatoresCriticos: ['Demandas'],
    diagnostico: 'Demandas em alerta com impacto observado.',
  },
  alertas: [
    { fatorNome: 'Demandas', escopo: 'empresa', score: 45 },
    { fatorNome: 'Demandas', escopo: 'departamento', departamentoNome: 'Manufatura', score: 40 },
  ],
  comparacaoCicloAnterior: {
    cicloRotulo: '2026-Q1',
    fatores: [{ fatorId: 1, nome: 'Demandas', score: 50 }],
  },
  comparacaoHistorica: [
    {
      cicloRotulo: '2025-Q4',
      fatores: [{ fatorId: 1, nome: 'Demandas', score: 55 }],
    },
  ],
  sugestoesProximosPassos: ['Aprofundar diagnóstico em Manufatura.'],
  generatedAtIso: '2026-07-28T10:00:00Z',
  generatedAtDate: '2026-07-28',
};

// ============================================================
// Testes
// ============================================================

describe('layoutBase (ME-050/51)', () => {
  it('escapeHtml — cobre todos os caracteres canonicos', () => {
    const raw = `Fulano & <script>alert("xss")</script> 'test'`;
    const escaped = escapeHtml(raw);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#39;');
    expect(escaped).not.toContain('<script>');
  });

  it('renderLayoutBase — determinismo (mesma entrada -> mesma saida)', () => {
    const input = {
      title: 'Titulo',
      company: { nomeFantasia: 'Acme' },
      bodyHtml: '<p>corpo</p>',
      footerCenter: 'Gerado em 2026-07-28',
    };
    expect(renderLayoutBase(input)).toBe(renderLayoutBase(input));
  });

  it('renderLayoutBase — omite logo quando ausente', () => {
    const html = renderLayoutBase({
      title: 'Titulo',
      company: { nomeFantasia: 'Acme' },
      bodyHtml: '',
    });
    expect(html).not.toContain('<img');
  });

  it('renderLayoutBase — inclui logo quando presente e escapa a URL', () => {
    const html = renderLayoutBase({
      title: 'Titulo',
      company: { nomeFantasia: 'Acme', logoUrl: 'https://example.com/logo.png?a="b"' },
      bodyHtml: '',
    });
    expect(html).toContain('<img');
    expect(html).toContain('&quot;');
  });

  it('renderLayoutBase — inclui @page A4 portrait margem 20mm', () => {
    const html = renderLayoutBase({
      title: 'x',
      company: { nomeFantasia: 'y' },
      bodyHtml: '',
    });
    expect(html).toMatch(/@page[\s\S]*A4 portrait/);
    expect(html).toMatch(/margin:\s*20mm/);
  });
});

describe('individualProfileTemplate (ME-050/51)', () => {
  it('renderIndividualProfileHTML — determinismo', () => {
    expect(renderIndividualProfileHTML(CANON_INDIVIDUAL)).toBe(
      renderIndividualProfileHTML(CANON_INDIVIDUAL),
    );
  });

  it('renderIndividualProfileHTML — contem todas as secoes canonicas §10.10', () => {
    const html = renderIndividualProfileHTML(CANON_INDIVIDUAL);
    expect(html).toContain('Perfil Individual');
    expect(html).toContain('Identificação');
    expect(html).toContain('Síntese executiva');
    expect(html).toContain('Como age');
    expect(html).toContain('Quem é');
    expect(html).toContain('O que move');
    expect(html).toContain('Como reage sob pressão');
    expect(html).toContain('Naturalmente excelente');
    expect(html).toContain('Painel dos subvetores');
    expect(html).toContain('Recomendações executivas');
    expect(html).toContain('Confiabilidade');
  });

  it('renderIndividualProfileHTML — blocos condicionais omitidos quando null', () => {
    const html = renderIndividualProfileHTML(CANON_INDIVIDUAL);
    expect(html).not.toContain('Natural vs. adaptado');
    expect(html).not.toContain('Padrão paradoxal');
    expect(html).not.toContain('Dimensões com ressalva');
  });

  it('renderIndividualProfileHTML — blocos condicionais renderizados quando preenchidos', () => {
    const html = renderIndividualProfileHTML({
      ...CANON_INDIVIDUAL,
      expandido: {
        ...CANON_INDIVIDUAL.expandido,
        natural_vs_adaptado: 'Texto sobre natural vs adaptado.',
        padrao_paradoxal: 'Texto sobre padrão paradoxal.',
        dimensoes_com_hedge: ['Dimensão X com ressalva'],
      },
    });
    expect(html).toContain('Natural vs. adaptado');
    expect(html).toContain('Padrão paradoxal');
    expect(html).toContain('Dimensões com ressalva');
    expect(html).toContain('Dimensão X com ressalva');
  });

  it('renderIndividualProfileHTML — escapa nomes com caracteres especiais', () => {
    const html = renderIndividualProfileHTML({
      ...CANON_INDIVIDUAL,
      identificacao: {
        ...CANON_INDIVIDUAL.identificacao,
        nome: 'Maria & Silva <script>',
      },
    });
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('normalizeColaboradorNameForFilename — remove acentos, especiais e espaços', () => {
    expect(normalizeColaboradorNameForFilename('João da Silva')).toBe('Joao_da_Silva');
    expect(normalizeColaboradorNameForFilename('Ana Paula "Duda" da Costa')).toBe(
      'Ana_Paula_Duda_da_Costa',
    );
    expect(normalizeColaboradorNameForFilename('   ')).toBe('Colaborador');
  });

  it('composeIndividualProfileFilename — formato canonico', () => {
    expect(composeIndividualProfileFilename('João da Silva', '2026-07-28')).toBe(
      'Perfil_Individual_Joao_da_Silva_2026-07-28.pdf',
    );
  });
});

describe('nr1Template (ME-050/51)', () => {
  it('renderNr1ReportHTML — determinismo (mesmos inputs identicos byte a byte)', () => {
    expect(renderNr1ReportHTML(CANON_NR1)).toBe(renderNr1ReportHTML(CANON_NR1));
  });

  it('renderNr1ReportHTML — cobre 13 secoes canonicas §11.12', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    // Capa
    expect(html).toContain('Radar NR-1');
    // Sumário
    expect(html).toContain('Sumário');
    // Resumo executivo
    expect(html).toContain('Resumo executivo');
    // Radar da empresa
    expect(html).toContain('Radar da empresa');
    // Radar por departamento
    expect(html).toContain('Radar por departamento');
    // Amostra insuficiente
    expect(html).toContain('amostra insuficiente');
    // Convergência
    expect(html).toContain('convergência');
    // Departamento crítico
    expect(html).toContain('situação crítica');
    // Alertas
    expect(html).toContain('Alertas informativos');
    // Comparação anterior
    expect(html).toContain('Comparação com ciclo anterior');
    // Comparação histórica
    expect(html).toContain('Comparação histórica');
    // Sugestões
    expect(html).toContain('Sugestões de próximos passos');
    // Rastreabilidade
    expect(html).toContain('Rastreabilidade');
  });

  it('renderNr1ReportHTML — nota de auditoria de edicao omitida quando ausente', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    expect(html).not.toContain('A data de fechamento original deste ciclo era');
  });

  it('renderNr1ReportHTML — nota de auditoria de edicao renderizada quando presente', () => {
    const html = renderNr1ReportHTML({
      ...CANON_NR1,
      notaAuditoriaEdicao: {
        dataFechamentoOriginal: '2026-06-30',
        dataFechamentoAtual: '2026-07-15',
        ultimaEdicaoEm: '2026-06-20',
        ultimaEdicaoPor: 'RH Alice',
        ultimaEdicaoJustificativa: 'Necessidade de mais tempo por baixa participação.',
      },
    });
    expect(html).toContain('A data de fechamento original deste ciclo era 2026-06-30');
    expect(html).toContain('RH Alice');
  });

  it('normalizeNomeEmpresaForFilename — regra canonica §11.12 (todos os passos)', () => {
    expect(normalizeNomeEmpresaForFilename('Nexus Soluções & Cia. Ltda.')).toBe(
      'Nexus_Solucoes__Cia_Ltda',
    );
    // Limite de 40 caracteres.
    expect(normalizeNomeEmpresaForFilename('a'.repeat(50)).length).toBe(40);
    // Fallback quando vazio.
    expect(normalizeNomeEmpresaForFilename('&&&&')).toBe('Empresa');
  });

  it('composeNr1ReportFilename — formato canonico §11.12', () => {
    expect(
      composeNr1ReportFilename('Nexus Soluções & Cia. Ltda.', '2026-10-20', '2027-01-20'),
    ).toBe('Radar_NR-1_Nexus_Solucoes__Cia_Ltda_2026-10-20_2027-01-20.pdf');
  });
});
