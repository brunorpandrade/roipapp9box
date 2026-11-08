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
  renderIndividualProfileOnlineHTML,
} from '../../src/server/pdf-templates/individualProfileTemplate';
import { escapeHtml, renderLayoutBase } from '../../src/server/pdf-templates/layoutBase';
import {
  composeNr1ReportFilename,
  normalizeNomeEmpresaForFilename,
  type Nr1TemplateInput,
  renderNr1ReportHTML,
} from '../../src/server/pdf-templates/nr1Template';
import {
  renderDocumentoPadraoBody,
  renderDocumentoPadraoPdfHtml,
} from '../../src/server/pdf-templates/terminationFormDocumentTemplate';

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
    sintese_executiva: {
      retrato_integrado: 'Perfil equilibrado com alta orientação a pessoas.',
      entrega_natural: 'Entrega consistente em contextos colaborativos.',
      equilibrio_sob_pressao: 'Regula bem a reação na maior parte do tempo.',
      pontos_atencao: 'Pode centralizar decisões sob pressão.',
      recomendacao_sintese: 'Ampliar delegação gradual.',
    },
    como_age: {
      estilo_predominante: 'Age de forma colaborativa, priorizando alinhamento.',
      contribuicoes_tipicas: ['Facilita consenso.', 'Mantém o time coeso.'],
      riscos_de_excesso: ['Pode evitar conflito necessário.'],
      natural_vs_adaptado: null,
    },
    quem_e: {
      configuracao_estrutural: 'Profissional experiente com foco em resultado.',
      implicacoes_praticas: ['Adapta-se bem a contextos variados.'],
      amplifica_ou_compensa: 'A estabilidade sustenta a competência emocional.',
    },
    o_que_move: {
      sustenta_engajamento: 'Aprendizado contínuo e propósito de contribuir.',
      sustenta_energia: 'Reconhecimento do impacto gerado.',
      o_que_esgota: ['Microgestão.'],
      o_que_sacrifica: 'Abre mão de protagonismo por harmonia.',
    },
    como_reage_sob_pressao: {
      leitura_geral: 'Mantém compostura, ainda que reduza delegação.',
      o_que_faz_bem: ['Estabiliza o time.'],
      o_que_deteriora: ['Centraliza decisões.'],
      padrao_paradoxal: null,
    },
    naturalmente_excelente: {
      assinatura_dominante: 'Leitura fina de dinâmicas de equipe.',
      onde_gera_valor: ['Mediação de conflitos.'],
      riscos_de_overuse: ['Excesso de acolhimento.'],
    },
    recomendacoes_executivas: {
      onde_performa_melhor: 'Times que exigem coesão e escuta.',
      aderencia_posicoes: {
        sintese:
          'Rende em posições relacionais; exige esforço em posições de alta pressão decisória.',
        rende_mais: ['Atendimento e relação com o público — escuta e cuidado com o clima.'],
        exige_esforco: ['Comercial e negociação — confronto direto não é natural.'],
      },
      o_que_precisa_do_gestor: [
        'Consolidar rituais de escuta ativa com liderados.',
        'Testar delegação em contextos de baixa criticidade.',
      ],
      zona_de_desenvolvimento: 'Delegação sob pressão.',
      sinais_de_alerta: ['Sobrecarga silenciosa.'],
      contextos_a_evitar: 'Ambientes de alta competição individual.',
    },
    confiabilidade: {
      nivel: 'alta',
      nota_contexto: null,
      dimensoes_com_hedge: null,
    },
  },
  subvetores: [
    { bloco: 'Postura', rotulo: 'Assertividade e decisão', valor: 62.5 },
    { bloco: 'Estrutura', rotulo: 'Abertura à experiência', valor: 78 },
    { bloco: 'Motor', rotulo: 'Maestria', valor: 71.3 },
    { bloco: 'Equilíbrio', rotulo: 'Autoconsciência', valor: 84 },
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
    expect(html).toContain('Perfil individual');
    expect(html).toContain('Síntese executiva');
    // ME-1.19: parágrafo do equilíbrio integrado na síntese executiva.
    expect(html).toContain('Equilíbrio sob pressão');
    expect(html).toContain('Regula bem a reação na maior parte do tempo.');
    expect(html).toContain('Como essa pessoa age');
    expect(html).toContain('Quem essa pessoa é');
    expect(html).toContain('O que move essa pessoa');
    expect(html).toContain('Como reage sob pressão');
    expect(html).toContain('naturalmente excelente');
    expect(html).toContain('Painel de resultados por área');
    expect(html).toContain('Recomendações executivas');
    // ME-1.20: bloco de aderência a tipos de posição na Seção 8.
    expect(html).toContain('Aderência a tipos de posição');
    expect(html).toContain('Rende mais naturalmente em');
    expect(html).toContain('Exige mais esforço em');
    expect(html).toContain('Confiabilidade');
    // ME-1.19 (adicao): página final de rastreabilidade.
    expect(html).toContain('Rastreabilidade e integridade do relatório');
    // ME-1.10-DIS-F: pagina de identificacao redundante removida,
    // etiqueta da capa removida, titulo antigo do painel renomeado.
    expect(html).not.toContain('<h2>Identificação</h2>');
    expect(html).not.toContain('Painel dos subvetores');
    expect(html).not.toContain('<div class="cover-badge">');
  });

  it('ME-1.21: perfil on-line — sem capa/rastreabilidade, com confiabilidade', () => {
    const html = renderIndividualProfileOnlineHTML(CANON_INDIVIDUAL);
    // Presentes: mapa, painel, síntese e confiabilidade (idêntico ao PDF).
    expect(html).toContain('Mapa de leituras');
    expect(html).toContain('Painel de resultados por área');
    expect(html).toContain('Síntese executiva');
    expect(html).toContain('Confiabilidade');
    // Ausentes: a capa e a página de rastreabilidade.
    expect(html).not.toContain('class="cover-page"');
    expect(html).not.toContain('Rastreabilidade e integridade do relatório');
  });

  it('ME-1.21 patch: modo resumo — recorte Mapa + Síntese + Recomendações', () => {
    const html = renderIndividualProfileOnlineHTML(CANON_INDIVIDUAL, 'resumo');
    expect(html).toContain('Mapa de leituras');
    expect(html).toContain('Síntese executiva');
    expect(html).toContain('Recomendações executivas');
    expect(html).not.toContain('Painel de resultados por área');
    expect(html).not.toContain('Como essa pessoa age');
    expect(html).not.toContain('Confiabilidade');
  });

  it('ME-1.21 patch: visão on-line nunca mostra a logo da empresa', () => {
    const comLogo: IndividualProfileTemplateInput = {
      ...CANON_INDIVIDUAL,
      company: { nomeFantasia: 'Nexus & Cia', logoUrl: 'https://exemplo/logo.png' },
    };
    const html = renderIndividualProfileOnlineHTML(comLogo, 'completo');
    expect(html).not.toContain('logo-brand');
    expect(html).not.toContain('https://exemplo/logo.png');
  });

  it('DIS-G: radar, painel pf-*, confiabilidade e remocao do Balanceamento', () => {
    const html = renderIndividualProfileHTML({
      ...CANON_INDIVIDUAL,
      confiabilidadeMetricas: [
        { rotulo: 'Atenção', alerta: 'ok' },
        { rotulo: 'Desejabilidade social', alerta: 'medio' },
        { rotulo: 'Padrão de concordância', alerta: 'ok' },
        { rotulo: 'Consistência interna', alerta: 'ok' },
        { rotulo: 'Uso de extremos', alerta: 'ok' },
      ],
      subvetores: [
        { bloco: 'Postura', rotulo: 'Assertividade e decisão', valor: 50 },
        { bloco: 'Estrutura', rotulo: 'Abertura à experiência', valor: 67 },
        { bloco: 'Motor', rotulo: 'Maestria', valor: 56 },
        { bloco: 'Motor', rotulo: 'Liderança', valor: 10 },
        { bloco: 'Motor', rotulo: 'Autonomia', valor: 67 },
        { bloco: 'Motor', rotulo: 'Segurança', valor: 67 },
        { bloco: 'Motor', rotulo: 'Propósito', valor: 90 },
        { bloco: 'Equilíbrio', rotulo: 'Autoconsciência', valor: 29 },
        { bloco: 'Equilíbrio', rotulo: 'Autogestão emocional', valor: 71 },
        { bloco: 'Equilíbrio', rotulo: 'Leitura do outro', valor: 71 },
        { bloco: 'Equilíbrio', rotulo: 'Influência e condução', valor: 80 },
        { bloco: 'Equilíbrio', rotulo: 'Índice geral de equilíbrio', valor: 63 },
        { bloco: 'Assinatura', rotulo: 'Sabedoria', valor: 79 },
        { bloco: 'Assinatura', rotulo: 'Coragem', valor: 50 },
        { bloco: 'Assinatura', rotulo: 'Humanidade', valor: 50 },
        { bloco: 'Assinatura', rotulo: 'Justiça', valor: 75 },
        { bloco: 'Assinatura', rotulo: 'Temperança', valor: 50 },
        { bloco: 'Assinatura', rotulo: 'Transcendência', valor: 67 },
      ],
    });
    // Painel no layout de leitura (pf-*): nome em linha, barra curta,
    // nota embaixo; cabecalho de area como barra.
    expect(html).toContain('class="pf-row"');
    expect(html).toContain('pf-item pf-area');
    expect(html).toContain('class="pf-nome"');
    expect(html).toContain('class="pf-nota"');
    expect(html).toContain('class="pf-val"');
    expect(html).toContain('class="pf-bar"');
    // Escala de intensidade por faixa (5 tons): 10 muito baixo (fx1),
    // 90 muito alto (fx5).
    expect(html).toContain('dim-bar-fill subv-fx1');
    expect(html).toContain('dim-bar-fill subv-fx5');
    // Rotulos de faixa em cinco niveis, inclusive os extremos.
    expect(html).toContain('Muito baixo');
    expect(html).toContain('Muito alto');
    // Selos de papel: Motor (dominante/sustentacao/negligenciado) e
    // Assinatura (Top 3).
    expect(html).toContain('Dominante');
    expect(html).toContain('Sustentação');
    expect(html).toContain('Negligenciado');
    expect(html).toContain('Top 3');
    // ME-1.19: legenda das etiquetas sob o cabeçalho de Motor e Assinatura.
    expect(html).toContain('<div class="selo-legenda">');
    expect(html).toContain('o que mais move');
    expect(html).toContain('as três forças naturais de maior expressão');
    // Grafico de teia: pagina dedicada, fronteiras em ardosia escura,
    // legenda de faixa.
    expect(html).toContain('class="radar-wrap"');
    expect(html).toContain('stroke="#334155"');
    expect(html).toContain('class="leg-swatch"');
    // Confiabilidade: barras tonais, descricao por aspecto e semaforo
    // translucido no nivel geral.
    expect(html).toContain('class="conf-bar"');
    expect(html).toContain('class="conf-desc"');
    expect(html).toContain('conf-nivel-badge conf-nivel-alta');
    expect(html).toContain('Consistência nas respostas a itens de verificação');
    expect(html).toContain('Aprovado');
    expect(html).toContain('Alerta médio');
    // DIS-G: o indice geral de equilibrio (rotulo emitido pelo router) e
    // filtrado em todos os lugares; Equilibrio e tratado como as demais
    // areas, sem item composto, sem bloco final e sem eixo extra no radar.
    expect(html).not.toContain('Índice geral de equilíbrio');
    expect(html).not.toContain('Balanceamento');
    expect(html).not.toContain('subv-indice-fill');
    expect(html).not.toContain('bal-final');
    expect(html).not.toContain('class="subv-row"');
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
        como_age: {
          ...CANON_INDIVIDUAL.expandido.como_age,
          natural_vs_adaptado: 'Texto sobre natural vs adaptado.',
        },
        como_reage_sob_pressao: {
          ...CANON_INDIVIDUAL.expandido.como_reage_sob_pressao,
          padrao_paradoxal: 'Texto sobre padrão paradoxal.',
        },
        confiabilidade: {
          ...CANON_INDIVIDUAL.expandido.confiabilidade,
          nivel: 'moderada',
          dimensoes_com_hedge: ['Dimensão X com ressalva'],
        },
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

  it('renderNr1ReportHTML — cobre as secoes editoriais do CC079-v7', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    // Capa com hero em duas linhas separadas (v6+).
    expect(html).toContain('cover-title-line1');
    expect(html).toContain('cover-title-line2');
    expect(html).toContain('Radar NR-1');
    expect(html).toContain('Riscos Psicossociais no Trabalho');
    // Resumo executivo presente na mesma secao da capa.
    expect(html).toContain('Resumo executivo');
    // Radar da empresa.
    expect(html).toContain('Radar da empresa');
    // Descricao dos 8 fatores.
    expect(html).toContain('Descrição de cada fator');
    // Instrumento aplicado (ME-1.18: titulo sem "— os 32 itens",
    // seçoes horizontais em lista, com nome + explicaçao + afirmaçoes).
    expect(html).toContain('Instrumento aplicado');
    expect(html).not.toContain('Instrumento aplicado — os 32 itens');
    expect(html).toContain('instrumento-lista');
    expect(html).toContain('instrumento-fator-header');
    expect(html).toContain('instrumento-fator-desc');
    expect(html).toContain('Escala das respostas: (Nunca) · (Quase nunca) · (Às vezes)');
    // Rastreabilidade UNICA (basica removida na v7).
    const rastreabilidadeCount = (html.match(/Rastreabilidade e integridade do relatório/g) ?? [])
      .length;
    expect(rastreabilidadeCount).toBe(1);
    // Nao deve ter mais o texto introdutorio longo nem versao do instrumento.
    expect(html).not.toContain('Rastreabilidade completa do documento — hash');
    expect(html).not.toContain('placeholder_MVP_v1');
    expect(html).not.toContain('verificação forense');
    // Radar por departamento (v6+ — uma pagina por dept com nome no titulo)
    expect(html).toContain('Radar por departamento — Manufatura');
    // ME-1.18: tabela 4 colunas (Fator / Departamento / Diferença /
    // Empresa), colunas numericas centralizadas.
    expect(html).toContain('data-table-4col');
    expect(html).toContain('<th>Fator</th>');
    expect(html).toContain('<th class="center">Departamento</th>');
    expect(html).toContain('<th class="center">Diferença</th>');
    expect(html).toContain('<th class="center">Empresa</th>');
    // Departamento critico (presente em CANON_NR1).
    expect(html).toContain('situação crítica');
    // Alertas (v6+: duas secoes — resumo empresa + completo).
    expect(html).toContain('Alertas informativos por fator');
    expect(html).toContain('Alertas informativos por fator — visão completa');
    // Analise de convergencia e divergencia.
    expect(html).toContain('Análise de convergência e divergência');
    // Sugestoes de proximos passos.
    expect(html).toContain('Sugestões de próximos passos');
    // Vocabulario proibido nao pode vazar no cliente.
    expect(html).not.toContain('Sumário');
    expect(html).not.toContain('canônico');
    expect(html).not.toContain('canônica');
    expect(html).not.toContain('SEÇÃO ');
    expect(html).not.toContain('Seção ');
  });

  it('renderNr1ReportHTML — v7: pagina do instrumento contem os 32 itens', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    // Headers dos 8 fatores.
    expect(html).toContain('>Exigências quantitativas</div>');
    expect(html).toContain('>Ritmo de trabalho</div>');
    expect(html).toContain('>Conflitos de papel</div>');
    expect(html).toContain('>Autonomia</div>');
    expect(html).toContain('>Suporte social do líder</div>');
    expect(html).toContain('>Suporte social de colegas</div>');
    expect(html).toContain('>Insegurança no trabalho</div>');
    expect(html).toContain('>Saúde geral autopercebida</div>');
    // 32 itens no total (4 por fator).
    const itensCount = (html.match(/<li class="instrumento-item">/g) ?? []).length;
    expect(itensCount).toBe(32);
    // Primeiro item (ancora de amostragem).
    expect(html).toContain(
      'Tenho mais tarefas do que o tempo disponível permite concluir com qualidade.',
    );
    // Ultimo item (ancora de amostragem).
    expect(html).toContain(
      'Sinto que minha saúde permite desempenhar meu trabalho sem grande desgaste.',
    );
  });

  it('renderNr1ReportHTML — v6: nomes completos dos fatores nos eixos do radar', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    // Nenhuma abreviacao conhecida de v4/v5 pode aparecer nos eixos.
    expect(html).not.toContain('>Exig. quant.<');
    expect(html).not.toContain('>Confl. papel<');
    expect(html).not.toContain('>Sup. líder<');
    expect(html).not.toContain('>Sup. colegas<');
    // Nomes completos presentes (CANON_NR1 usa 'Demandas'... — ao
    // menos um nome composto completo deve aparecer no SVG).
    expect(html).toMatch(/<text[^>]*>Demandas<\/text>/);
    expect(html).toMatch(/<text[^>]*>Reconhecimento<\/text>/);
  });

  it('renderNr1ReportHTML — v6: insuficientes rendem lista enxuta', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    expect(html).toContain('dept-insuf-list');
    expect(html).toContain('dept-insuf-nome');
    // Nao deve ter mais o card elaborado da v5.
    expect(html).not.toContain('abaixo do piso de 5');
  });

  it('renderNr1ReportHTML — v6: dept critico com badges derivadas sem fatores do service', () => {
    // Service passa dept critico apenas com nome, sem fatores nomeados —
    // template deriva do delta vs empresa.
    const input: Nr1TemplateInput = {
      ...CANON_NR1,
      departamentoCritico: {
        nome: 'Manufatura',
        fatoresCriticos: [],
        diagnostico: 'texto placeholder',
      },
    };
    const html = renderNr1ReportHTML(input);
    expect(html).toContain('Manufatura');
    expect(html).toContain('critico-badges');
    // Como Manufatura tem Demandas 40 vs empresa 45 (delta -5, nao
    // critico), o derivador NAO achara fatores — resulta em "Nenhum
    // departamento em situacao critica" com descarte do passado.
    // (Validacao real exige dados com delta <= -10.)
  });

  it('renderNr1ReportHTML — v5+6: mantem a pagina com nota padronizada quando sem dados', () => {
    // Entrada com todas as secoes opcionais vazias — a v5 nunca
    // suprime pagina; renderiza a nota "Dados ainda insuficientes…".
    const input: Nr1TemplateInput = {
      ...CANON_NR1,
      radaresPorDepartamento: [],
      departamentosInsuficientes: [],
      divergencias: [],
      departamentoCritico: undefined,
      alertas: [],
      comparacaoCicloAnterior: undefined,
      comparacaoHistorica: undefined,
      sugestoesProximosPassos: [],
    };
    const html = renderNr1ReportHTML(input);
    // Todas as paginas permanecem presentes.
    expect(html).toContain('Radar por departamento');
    expect(html).toContain('Departamentos com amostra insuficiente');
    expect(html).toContain('Análise de convergência e divergência');
    expect(html).toContain('Departamento em situação crítica');
    expect(html).toContain('Alertas informativos');
    expect(html).toContain('Comparação com ciclo anterior');
    expect(html).toContain('Comparação histórica de longo prazo');
    expect(html).toContain('Sugestões de próximos passos');
    // Nota padrao renderizada em multiplas paginas.
    const notas = html.match(/sem-dados-nota/g) ?? [];
    expect(notas.length).toBeGreaterThanOrEqual(5);
  });

  it('renderNr1ReportHTML — v5: radar da empresa com legenda ABAIXO (padrao stacked)', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    expect(html).toContain('radar-stacked');
    expect(html).toContain('radar-svg-centered');
    expect(html).toContain('radar-legend-horizontal');
    expect(html).toContain('respondentes efetivos');
  });

  it('renderNr1ReportHTML — v5: radar por dept usa legenda biparticao Empresa/Dept', () => {
    const html = renderNr1ReportHTML(CANON_NR1);
    expect(html).toContain('radar-legend-biparticao');
    // ME-1.18: dois chips — Departamento (linha cheia cinza) + Empresa
    // (linha tracejada azul-escuro).
    expect(html).toMatch(/<span>Empresa<\/span>/);
    expect(html).toMatch(/<span>Departamento<\/span>/);
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
    expect(html).toContain('A data de fechamento original deste ciclo era 30/06/2026');
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

// ============================================================
// ME-1.10-CC079-DIS-E — lapidacao visual estrutural (item [1.10]).
// Regua de presenca das classes canonicas introduzidas nos 4 PDFs
// restantes. Provada nos dois sentidos (RV-03): o caso bom passa; a
// remocao de qualquer classe canonica reprova.
// ============================================================
describe('ME-1.10-CC079-DIS-E — Perfil individual lapidado', () => {
  it('capa editorial canonica presente, sem etiqueta (DIS-F)', () => {
    const html = renderIndividualProfileHTML(CANON_INDIVIDUAL);
    expect(html).toContain('class="cover-page"');
    expect(html).toContain('class="cover-hero"');
    expect(html).toContain('class="cover-meta"');
    expect(html).toContain('class="cover-note"');
    // DIS-F: a etiqueta da capa foi removida.
    expect(html).not.toContain('<div class="cover-badge">');
    // Lider direto migrou da pagina de identificacao para a capa.
    expect(html).toContain('Líder direto');
  });

  it('painel de resultados por area usa barras de intensidade no layout pf-* (DIS-G)', () => {
    const html = renderIndividualProfileHTML(CANON_INDIVIDUAL);
    expect(html).toContain('class="pf-row"');
    expect(html).toContain('class="dim-bar-track"');
    expect(html).toContain('dim-bar-fill subv-fx');
    expect(html).toContain('class="pf-nota"');
    // A barra preta inline antiga (#111827 como fill) foi removida.
    expect(html).not.toContain('background:#111827; width:');
  });
});

describe('ME-1.10-CC079-DIS-E — documentos de desligamento lapidados', () => {
  it('corpo compartilhado usa cards de pergunta e descricao, sem <h2>', () => {
    const roteiro = renderDocumentoPadraoBody('roteiro-voluntario');
    const formulario = renderDocumentoPadraoBody('formulario-involuntario');
    expect(roteiro).toContain('class="pergunta-card"');
    expect(roteiro).toContain('class="doc-desc"');
    expect(formulario).toContain('class="pergunta-card"');
    expect(formulario).toContain('class="doc-desc"');
    // O titulo sai do corpo (fica no modal/web e no header do PDF).
    expect(roteiro).not.toContain('<h2>');
    expect(formulario).not.toContain('<h2>');
  });

  it('wrapper do PDF injeta o cabecalho editorial compacto', () => {
    const company = { nomeFantasia: 'Nexus & Cia' };
    const pdf = renderDocumentoPadraoPdfHtml('roteiro-voluntario', company, 'Gerado em 2026-11-04');
    expect(pdf).toContain('class="doc-head-compact"');
    expect(pdf).toContain('class="doc-head-badge"');
    expect(pdf).toContain('class="doc-head-title"');
  });

  it('determinismo — mesma entrada gera mesma saida', () => {
    expect(renderDocumentoPadraoBody('roteiro-voluntario')).toBe(
      renderDocumentoPadraoBody('roteiro-voluntario'),
    );
  });
});
