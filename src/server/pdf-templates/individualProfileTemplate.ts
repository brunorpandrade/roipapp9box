/* eslint-disable @stylistic/max-len -- template HTML canonico com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — template PDF Perfil Individual (ME pos-fila7).
//
// Renderizacao HTML deterministica do relatorio expandido do Perfil
// Individual (DOC 03 §10.10, DOC 04 §3.8 + §3.9). Consumido por
// `individualProfile.generatePDF`; convertido em PDF pela toolchain
// `pdfRenderer.ts` (Puppeteer via `puppeteer-core`).
//
// ME pos-fila7: o contrato do `expandidoJson` e a estrutura RICA
// aninhada definida no system prompt (Secao 11) — cada bloco e um
// objeto com paragrafos e listas de bullets, nao uma string plana. O
// template consome essa estrutura fielmente. `escapeHtml` e usado com
// coercao defensiva (asStr) porque a saida vem de um LLM.
//
// Determinismo canonico: nenhuma leitura de `Date.now()` interna. A
// data de geracao viaja no input (`generatedAt`) e vai ao rodape.

import { formatDateBR } from '../../lib/date/formatDateBR';
import { escapeHtml, type LayoutBaseCompany, renderLayoutBase } from './layoutBase';

// ── Estrutura rica do JSON (system prompt, Secao 11) ──────────────

/** Sintese executiva — 4 blocos de prosa (identica em resumo e expandido). */
export interface SinteseExecutiva {
  retrato_integrado: string;
  entrega_natural: string;
  equilibrio_sob_pressao: string;
  pontos_atencao: string;
  recomendacao_sintese: string;
}

/** Aderencia do perfil a tipos de posicao (ME-1.20, Secao 8). */
export interface AderenciaPosicoes {
  sintese: string;
  rende_mais: string[];
  exige_esforco: string[];
}

/** Recomendacoes executivas — paragrafos + listas de bullets. */
export interface RecomendacoesExecutivas {
  onde_performa_melhor: string;
  /** Opcional: ausente em perfis gerados antes da ME-1.20 (cache do JSON). */
  aderencia_posicoes?: AderenciaPosicoes;
  o_que_precisa_do_gestor: string[];
  zona_de_desenvolvimento: string;
  sinais_de_alerta: string[];
  contextos_a_evitar: string;
}

export interface BlocoComoAge {
  estilo_predominante: string;
  contribuicoes_tipicas: string[];
  riscos_de_excesso: string[];
  natural_vs_adaptado: string | null;
}

export interface BlocoQuemE {
  configuracao_estrutural: string;
  implicacoes_praticas: string[];
  amplifica_ou_compensa: string;
}

export interface BlocoOQueMove {
  sustenta_engajamento: string;
  sustenta_energia: string;
  o_que_esgota: string[];
  o_que_sacrifica: string;
}

export interface BlocoComoReage {
  leitura_geral: string;
  o_que_faz_bem: string[];
  o_que_deteriora: string[];
  padrao_paradoxal: string | null;
}

export interface BlocoNaturalmenteExcelente {
  assinatura_dominante: string;
  onde_gera_valor: string[];
  riscos_de_overuse: string[];
}

export interface Confiabilidade {
  nivel: 'alta' | 'moderada';
  nota_contexto: string | null;
  dimensoes_com_hedge?: string[] | null;
}

/**
 * Estrutura canonica do JSON expandido (system prompt Secao 11).
 * Blocos condicionais aparecem como `null` quando a condicao nao e
 * atendida — nunca sao omitidos.
 */
export interface IndividualProfileExpandidoJson {
  sintese_executiva: SinteseExecutiva;
  como_age: BlocoComoAge;
  quem_e: BlocoQuemE;
  o_que_move: BlocoOQueMove;
  como_reage_sob_pressao: BlocoComoReage;
  naturalmente_excelente: BlocoNaturalmenteExcelente;
  recomendacoes_executivas: RecomendacoesExecutivas;
  confiabilidade: Confiabilidade;
}

/** Subvetor: rotulo canonico + valor 0-100 (DOC 03 §10.8). */
export interface IndividualProfileSubvector {
  bloco: 'Postura' | 'Estrutura' | 'Motor' | 'Equilíbrio' | 'Assinatura';
  rotulo: string;
  valor: number;
}

/** Identificacao canonica do colaborador (DOC 04 §8.1 identificacao). */
export interface IndividualProfileIdentificacao {
  nome: string;
  cargo: string;
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico';
  departamento: string;
  liderDireto: string;
  dataAplicacao: string; // YYYY-MM-DD
}

/** Alerta de uma metrica de confiabilidade (espelha o motor, §5.1). */
export type AlertaMetrica = 'ok' | 'medio' | 'critico';

/** Uma das cinco metricas de confiabilidade, com seu alerta. */
export interface ConfiabilidadeMetrica {
  readonly rotulo: string;
  readonly alerta: AlertaMetrica;
}

/** Input canonico do template. */
export interface IndividualProfileTemplateInput {
  company: LayoutBaseCompany;
  identificacao: IndividualProfileIdentificacao;
  expandido: IndividualProfileExpandidoJson;
  subvetores: IndividualProfileSubvector[];
  /** Data de geracao para o rodape. `YYYY-MM-DD`. */
  generatedAtDate: string;
  /** Cinco metricas de confiabilidade para o grafico (DIS-G). */
  confiabilidadeMetricas?: readonly ConfiabilidadeMetrica[];
}

const NIVEL_HIERARQUICO_ROTULO: Record<IndividualProfileIdentificacao['nivelHierarquico'], string> =
  {
    operacional: 'Operacional',
    tatico: 'Tático',
    estrategico: 'Estratégico',
  };

/**
 * Coercao defensiva para string. A saida vem de um LLM: um campo pode
 * chegar como null, numero ou ate objeto. `asStr` garante que
 * `escapeHtml` nunca receba nao-string (que quebrava o PDF inteiro com
 * `a.replace is not a function`). null/undefined viram string vazia;
 * objetos inesperados viram JSON legivel em vez de derrubar o render.
 */
function asStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Lista de bullets defensiva: aceita array; ignora itens vazios. */
function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asStr).filter((s) => s.trim().length > 0);
}

/**
 * Normalizacao canonica do nome do colaborador para o filename
 * (DOC 03 §10.10). Regras: espacos -> underscore; remove acentos;
 * remove pontuacao; nunca vazio.
 */
export function normalizeColaboradorNameForFilename(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const semEspecial = semAcento.replace(/[^A-Za-z0-9\s_-]/g, '');
  const comUnderscore = semEspecial.replace(/\s+/g, '_').replace(/_+/g, '_');
  const trim = comUnderscore.replace(/^_+|_+$/g, '');
  return trim.length > 0 ? trim : 'Colaborador';
}

/** Compoe o nome canonico do arquivo PDF conforme §10.10. */
export function composeIndividualProfileFilename(nome: string, generatedAtDate: string): string {
  const nomeNorm = normalizeColaboradorNameForFilename(nome);
  return `Perfil_Individual_${nomeNorm}_${generatedAtDate}.pdf`;
}

/**
 * ME-1.10-CC079-DIS-E: capa editorial canonica (pagina 1) no padrao dos
 * 5 PDFs ja fechados do item [1.10]. Badge + cover-hero + cover-meta de
 * identificacao resumida + cover-note sobre o carater descritivo do
 * instrumento. A ficha de identificacao completa (§10.10) permanece como
 * primeira secao do corpo (pagina 2), preservada bit-a-bit.
 */
function renderCoverPage(id: IndividualProfileIdentificacao): string {
  const nivel = NIVEL_HIERARQUICO_ROTULO[id.nivelHierarquico];
  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Perfil individual</div>
    <div class="cover-title-line2">Retrato comportamental</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Colaborador</span><span class="cover-meta-value">${escapeHtml(asStr(id.nome))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Cargo</span><span class="cover-meta-value">${escapeHtml(asStr(id.cargo))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Nível hierárquico</span><span class="cover-meta-value">${escapeHtml(nivel)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Departamento</span><span class="cover-meta-value">${escapeHtml(asStr(id.departamento))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Líder direto</span><span class="cover-meta-value">${escapeHtml(asStr(id.liderDireto))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de aplicação</span><span class="cover-meta-value">${escapeHtml(formatDateBR(asStr(id.dataAplicacao)))}</span></div>
  </div>
  <div class="cover-note"><strong>Documento confidencial.</strong> Este relatório descreve padrões comportamentais e de potencial — é uma leitura de estilo, não um juízo de valor sobre a pessoa. Destina-se exclusivamente à gestão de pessoas e ao desenvolvimento do colaborador.</div>
</section>`;
}

/** Paragrafo(s): preserva quebras \n\n como paragrafos separados. */
function paragrafos(texto: unknown): string {
  const s = asStr(texto).trim();
  if (s.length === 0) return '';
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join('\n');
}

/** Bloco rotulado: subtitulo em italico + paragrafo. Omite se vazio. */
function subBloco(rotulo: string, texto: unknown): string {
  const p = paragrafos(texto);
  if (p.length === 0) return '';
  return `<p class="muted" style="margin-bottom:1mm;"><strong>${escapeHtml(rotulo)}</strong></p>\n${p}`;
}

/** Lista de bullets rotulada. Omite quando vazia. */
function subLista(rotulo: string, itens: unknown): string {
  const arr = asList(itens);
  if (arr.length === 0) return '';
  const lis = arr.map((r) => `<li>${escapeHtml(r)}</li>`).join('\n');
  return `<p class="muted" style="margin-bottom:1mm;"><strong>${escapeHtml(rotulo)}</strong></p>\n<ul>\n${lis}\n</ul>`;
}

function renderSintese(s: SinteseExecutiva): string {
  return `<section>
  <h2>Síntese executiva</h2>
  ${subBloco('Retrato integrado', s?.retrato_integrado)}
  ${subBloco('Entrega natural', s?.entrega_natural)}
  ${subBloco('Equilíbrio sob pressão', s?.equilibrio_sob_pressao)}
  ${subBloco('Pontos de atenção', s?.pontos_atencao)}
  ${subBloco('Recomendação', s?.recomendacao_sintese)}
</section>`;
}

function renderComoAge(b: BlocoComoAge): string {
  return `<section>
  <h2>Como essa pessoa age</h2>
  ${subBloco('Estilo predominante', b?.estilo_predominante)}
  ${subLista('Contribuições típicas', b?.contribuicoes_tipicas)}
  ${subLista('Riscos de excesso', b?.riscos_de_excesso)}
  ${subBloco('Natural vs. adaptado', b?.natural_vs_adaptado)}
</section>`;
}

function renderQuemE(b: BlocoQuemE): string {
  return `<section>
  <h2>Quem essa pessoa é</h2>
  ${subBloco('Configuração estrutural', b?.configuracao_estrutural)}
  ${subLista('Implicações práticas', b?.implicacoes_praticas)}
  ${subBloco('Amplifica ou compensa', b?.amplifica_ou_compensa)}
</section>`;
}

function renderOQueMove(b: BlocoOQueMove): string {
  return `<section>
  <h2>O que move essa pessoa</h2>
  ${subBloco('Sustenta o engajamento', b?.sustenta_engajamento)}
  ${subBloco('Sustenta a energia', b?.sustenta_energia)}
  ${subLista('O que esgota', b?.o_que_esgota)}
  ${subBloco('O que sacrifica', b?.o_que_sacrifica)}
</section>`;
}

function renderComoReage(b: BlocoComoReage): string {
  return `<section>
  <h2>Como reage sob pressão</h2>
  ${subBloco('Leitura geral', b?.leitura_geral)}
  ${subLista('O que faz bem', b?.o_que_faz_bem)}
  ${subLista('O que deteriora', b?.o_que_deteriora)}
  ${subBloco('Padrão paradoxal', b?.padrao_paradoxal)}
</section>`;
}

function renderNaturalmenteExcelente(b: BlocoNaturalmenteExcelente): string {
  return `<section>
  <h2>No que é naturalmente excelente</h2>
  ${subBloco('Assinatura dominante', b?.assinatura_dominante)}
  ${subLista('Onde gera valor', b?.onde_gera_valor)}
  ${subLista('Riscos de uso excessivo', b?.riscos_de_overuse)}
</section>`;
}

/**
 * Bloco de aderencia a tipos de posicao (ME-1.20): sintese + duas listas
 * (rende mais / exige esforco), em linguagem de tendencia. Gerado pela IA
 * a partir da lista fixa de oito tipos do system prompt. Omitido inteiro
 * quando o JSON nao traz o bloco (perfis gerados antes da ME).
 */
function renderAderenciaPosicoes(a: AderenciaPosicoes | undefined): string {
  const sintese = subBloco('Aderência a tipos de posição', a?.sintese);
  const rende = subLista('Rende mais naturalmente em', a?.rende_mais);
  const esforco = subLista('Exige mais esforço em', a?.exige_esforco);
  return [sintese, rende, esforco].filter((s) => s.length > 0).join('\n  ');
}

function renderRecomendacoes(r: RecomendacoesExecutivas): string {
  return `<section>
  <h2>Recomendações executivas</h2>
  ${subBloco('Onde performa melhor', r?.onde_performa_melhor)}
  ${renderAderenciaPosicoes(r?.aderencia_posicoes)}
  ${subLista('O que precisa do gestor', r?.o_que_precisa_do_gestor)}
  ${subBloco('Zona de desenvolvimento', r?.zona_de_desenvolvimento)}
  ${subLista('Sinais de alerta', r?.sinais_de_alerta)}
  ${subBloco('Contextos a evitar', r?.contextos_a_evitar)}
</section>`;
}

/** Integridade (0-100), tom de faixa e rotulo de estado a partir do alerta. */
function integridadeMetrica(alerta: AlertaMetrica): { pct: number; fx: number; estado: string } {
  if (alerta === 'ok') return { pct: 100, fx: 4, estado: 'Aprovado' };
  if (alerta === 'medio') return { pct: 55, fx: 3, estado: 'Alerta médio' };
  return { pct: 22, fx: 1, estado: 'Crítico' };
}

/** Descricao de uma linha de cada metrica de confiabilidade do motor. */
const DESC_CONFIAB: Readonly<Record<string, string>> = {
  Atenção: 'Consistência nas respostas a itens de verificação de atenção ao longo do instrumento.',
  'Desejabilidade social':
    'Tendência a responder conforme o socialmente esperado, em vez do próprio padrão.',
  'Padrão de concordância':
    'Viés de concordar ou discordar de forma indiscriminada, independentemente do conteúdo.',
  'Consistência interna': 'Coerência entre os itens que medem o mesmo traço.',
  'Uso de extremos': 'Uso das pontas da escala versus concentração no meio.',
};

/**
 * Confiabilidade (ME-1.10-DIS-G): nivel geral em destaque + barras de
 * integridade das cinco metricas do motor, no mesmo padrao tonal dos
 * fatores (track + preenchimento por faixa), com descricao de uma linha
 * e estado textual. Barra cheia quando a metrica esta limpa, menor
 * quando ha alerta; escala padronizada, sem numero bruto.
 */
function renderConfiabilidade(
  c: Confiabilidade,
  metricas?: readonly ConfiabilidadeMetrica[],
): string {
  const nivel = asStr(c?.nivel);
  const nivelNorm = nivel.trim().toLowerCase();
  const badgeTom =
    nivelNorm === 'alta'
      ? 'conf-nivel-alta'
      : nivelNorm === 'moderada'
        ? 'conf-nivel-moderada'
        : nivelNorm === 'baixa'
          ? 'conf-nivel-baixa'
          : 'conf-nivel-alta';
  const nota = asStr(c?.nota_contexto);
  const hedge = asList(c?.dimensoes_com_hedge);
  const hedgeHtml = hedge.length > 0 ? `\n  ${subLista('Dimensões com ressalva', hedge)}` : '';
  const notaHtml = nota.length > 0 ? `\n  <p class="muted">${escapeHtml(nota)}</p>` : '';
  const grafico =
    metricas && metricas.length > 0
      ? `\n  <div class="conf-chart">
${metricas
  .map((m) => {
    const { pct, fx, estado } = integridadeMetrica(m.alerta);
    const desc = DESC_CONFIAB[m.rotulo] ?? '';
    const descHtml =
      desc.length > 0 ? `\n      <div class="conf-desc">${escapeHtml(desc)}</div>` : '';
    return `    <div class="conf-row">
      <div class="conf-nome">${escapeHtml(m.rotulo)}</div>
      <div class="conf-bar"><div class="dim-bar-track"><div class="dim-bar-fill subv-fx${fx}" style="width:${pct}%;"></div></div></div>
      <div class="conf-estado">${escapeHtml(estado)}</div>
    </div>${descHtml}`;
  })
  .join('\n')}
  </div>`
      : '';
  return `<section class="page-break">
  <h2>Confiabilidade</h2>
  <p class="conf-nivel">Nível geral <span class="conf-nivel-badge ${badgeTom}">${escapeHtml(nivel)}</span></p>${notaHtml}${grafico}${hedgeHtml}
</section>`;
}

/** Faixa textual canonica (DOC 03 §5.4.2) a partir do valor 0-100. */
function faixaRotulo(valor: number): string {
  if (valor <= 20) return 'Muito baixo';
  if (valor <= 40) return 'Baixo';
  if (valor <= 60) return 'Médio';
  if (valor <= 80) return 'Alto';
  return 'Muito alto';
}

/**
 * Intensidade neutra por faixa (ME-1.10-DIS-F, Opcao C). Cinco tons da
 * MESMA matiz azul da marca, do mais claro (faixa muito baixa) ao mais
 * cheio (faixa muito alta), §5.4.2. A cor comunica magnitude, nunca
 * qualidade: nao ha semaforo verde/amarelo/vermelho. Um valor baixo e
 * posicao no perfil, e as notas de cada leitura permanecem neutras.
 */
function faixaIntensidade(valor: number): 1 | 2 | 3 | 4 | 5 {
  if (valor <= 20) return 1;
  if (valor <= 40) return 2;
  if (valor <= 60) return 3;
  if (valor <= 80) return 4;
  return 5;
}

/** Nota fixa de cada area (cabecalho do bloco). */
const NOTA_AREA: Record<IndividualProfileSubvector['bloco'], string> = {
  Postura: 'Como a pessoa age, decide e se comunica no trabalho.',
  Estrutura:
    'Quem a pessoa é na sua configuração estável, o que orienta seu jeito de operar em qualquer contexto.',
  Motor: 'O que move a pessoa, sustenta seu engajamento e ela não abre mão.',
  Equilíbrio: 'Como a pessoa percebe, regula e usa as emoções sob pressão.',
  Assinatura: 'No que a pessoa é naturalmente excelente e gera valor com baixo esforço.',
};

/** Nota fixa de cada leitura (abaixo de cada barra). Chave = rotulo. */
const NOTA_SUBVETOR: Record<string, string> = {
  'Assertividade e decisão': 'Velocidade para decidir e firmeza ao se posicionar.',
  'Orientação a tarefas': 'Foco em resultado, método e padrão de entrega.',
  'Orientação a pessoas': 'Investimento em relação, escuta e clima.',
  'Comportamento sob pressão': 'Como o estilo se altera quando a tensão sobe.',
  'Abertura à experiência': 'Curiosidade, apetite por novidade e tolerância à ambiguidade.',
  'Disciplina e autogestão': 'Organização, constância e cumprimento de compromisso.',
  Extroversão: 'Energia em interação e conforto com exposição social.',
  Amabilidade: 'Cooperação, empatia e disposição para o outro.',
  'Estabilidade emocional': 'Regularidade de humor e baixa reatividade sob adversidade.',
  Maestria: 'Busca por profundidade técnica e domínio do ofício.',
  Liderança: 'Energia em coordenar pessoas e assumir responsabilidade ampla.',
  Autonomia: 'Necessidade de liberdade para decidir o próprio caminho.',
  Segurança: 'Valor dado à estabilidade e à previsibilidade.',
  Propósito: 'Necessidade de sentido e alinhamento de valores no trabalho.',
  Autoconsciência: 'Percepção clara dos próprios estados e do que dispara as reações.',
  'Autogestão emocional': 'Regulação da própria reação sob pressão.',
  'Leitura do outro': 'Precisão em perceber o estado e o contexto das pessoas.',
  'Influência e condução': 'Capacidade de conduzir conversas e mobilizar com eficácia.',
  Sabedoria: 'Excelência em análise, diagnóstico e clareza de raciocínio.',
  Coragem: 'Excelência em decisões difíceis e iniciativa em contexto ambíguo.',
  Humanidade: 'Excelência em vínculo, cuidado e leitura relacional.',
  Justiça: 'Excelência em cooperação, equidade e legitimidade.',
  Temperança: 'Excelência em disciplina, método e prudência.',
  Transcendência: 'Excelência em sentido, propósito e mobilização.',
};

const ROTULO_INDICE_EQUILIBRIO = 'Índice geral de equilíbrio';

/** Cinco tons de azul por faixa (§5.4.2), espelham as classes subv-fx*. */
const FX_HEX = ['#C3D0E0', '#97ACC8', '#6A89AE', '#3E6191', '#1E3A5F'] as const;

/** Cor de intensidade (hex) a partir do valor 0-100, para o SVG do radar. */
function fxHex(valor: number): string {
  return FX_HEX[faixaIntensidade(valor) - 1] ?? FX_HEX[2];
}

/**
 * Selos de papel por leitura, espelhando a plataforma. Motor: dominante
 * (maior), sustentacao (segundo) e negligenciado (menor), §5.4.3.
 * Assinatura: as 3 maiores sao Top 3, §6.2.5. A fonte canonica do papel
 * e o motor; a derivacao aqui por ordenacao estavel reproduz a
 * classificacao para a apresentacao do PDF. Demais areas nao recebem
 * selo.
 */
function selosDoBloco(
  bloco: IndividualProfileSubvector['bloco'],
  itens: readonly IndividualProfileSubvector[],
): Map<string, string> {
  const selos = new Map<string, string>();
  if (bloco === 'Motor') {
    const ord = [...itens].sort((a, b) => b.valor - a.valor);
    const dominante = ord[0];
    const sustentacao = ord[1];
    const negligenciado = ord[ord.length - 1];
    if (dominante) selos.set(dominante.rotulo, 'Dominante');
    if (sustentacao) selos.set(sustentacao.rotulo, 'Sustentação');
    if (negligenciado) selos.set(negligenciado.rotulo, 'Negligenciado');
  } else if (bloco === 'Assinatura') {
    const ord = [...itens].sort((a, b) => b.valor - a.valor);
    for (const s of ord.slice(0, 3)) selos.set(s.rotulo, 'Top 3');
  }
  return selos;
}

/** Um par selo + definicao, reaproveitando o chip `.subv-selo`. */
function seloDef(selo: string, definicao: string): string {
  return `<span class="selo-def"><span class="subv-selo">${escapeHtml(selo)}</span> ${escapeHtml(definicao)}</span>`;
}

/**
 * Legenda das etiquetas (ME-1.19, item [1.19]): explica, logo abaixo do
 * cabecalho da area, o significado dos selos que aparecem nas barras,
 * para nao depender de quem conhece a metodologia. So Motor (dominante /
 * sustentacao / negligenciado) e Assinatura (Top 3) exibem selo; as
 * demais areas nao recebem legenda.
 */
function legendaSelos(bloco: IndividualProfileSubvector['bloco']): string {
  if (bloco === 'Motor') {
    const defs = [
      seloDef('Dominante', 'o que mais move'),
      seloDef('Sustentação', 'o que mantém a energia no dia a dia'),
      seloDef('Negligenciado', 'o que fica em segundo plano'),
    ].join('\n    ');
    return `<div class="selo-legenda">\n    ${defs}\n  </div>`;
  }
  if (bloco === 'Assinatura') {
    const def = seloDef('Top 3', 'as três forças naturais de maior expressão');
    return `<div class="selo-legenda">\n    ${def}\n  </div>`;
  }
  return '';
}

/**
 * Um item do painel (area ou leitura) no layout do print: nome em linha
 * cheia, sem quebrar; barra curta de largura fixa a direita, com valor e
 * faixa; e a nota fixa na linha de baixo. O escore da area tambem e uma
 * barra.
 */
function renderPainelItem(opts: {
  nome: string;
  nota: string;
  valor: number;
  area?: boolean;
  selo?: string | null;
}): string {
  const pct = Math.max(0, Math.min(100, opts.valor));
  const fill = `subv-fx${faixaIntensidade(opts.valor)}`;
  const selo = opts.selo ? ` <span class="subv-selo">${escapeHtml(opts.selo)}</span>` : '';
  const nota =
    opts.nota.length > 0 ? `\n    <div class="pf-nota">${escapeHtml(opts.nota)}</div>` : '';
  const item = opts.area ? 'pf-item pf-area' : 'pf-item';
  const nomeCls = opts.area ? 'pf-nome pf-nome-area' : 'pf-nome';
  return `<div class="${item}">
    <div class="pf-row">
      <div class="${nomeCls}">${escapeHtml(opts.nome)}${selo}</div>
      <div class="pf-bar"><div class="dim-bar-track"><div class="dim-bar-fill ${fill}" style="width:${pct.toFixed(1)}%;"></div></div></div>
      <div class="pf-val"><span class="subv-num">${pct.toFixed(0)}</span><span class="subv-faixa">${escapeHtml(faixaRotulo(opts.valor))}</span></div>
    </div>${nota}
  </div>`;
}

/**
 * Escore agregado da area (0-100): media simples dos subvetores da area,
 * igual para as cinco. Em Equilibrio, a media dos quatro subvetores e o
 * proprio EQU_INDICE da especificacao, entao bate por construcao (o item
 * composto nao e exibido a parte).
 */
function escoreArea(itens: readonly IndividualProfileSubvector[]): number | null {
  const base = itens.filter((s) => s.rotulo !== ROTULO_INDICE_EQUILIBRIO);
  if (base.length === 0) return null;
  const soma = base.reduce((acc, s) => acc + s.valor, 0);
  return soma / base.length;
}

/** Um bloco de area: cabecalho (como barra) seguido das leituras. */
function renderAreaBloco(
  bloco: IndividualProfileSubvector['bloco'],
  itens: readonly IndividualProfileSubvector[],
): string {
  const selos = selosDoBloco(bloco, itens);
  const escore = escoreArea(itens);
  const cabecalho =
    escore !== null
      ? renderPainelItem({ nome: bloco, nota: NOTA_AREA[bloco], valor: escore, area: true })
      : '';
  const legenda = legendaSelos(bloco);
  const rows = itens
    .filter((s) => s.rotulo !== ROTULO_INDICE_EQUILIBRIO)
    .map((s) =>
      renderPainelItem({
        nome: s.rotulo,
        nota: NOTA_SUBVETOR[s.rotulo] ?? '',
        valor: s.valor,
        selo: selos.get(s.rotulo) ?? null,
      }),
    )
    .join('\n');
  return `<div class="subv-area">
    ${cabecalho}
    ${legenda}
${rows}
  </div>`;
}

const RADAR_CX = 585;
const RADAR_CY = 610;
const RADAR_R = 336;
const RADAR_AZUL = '#3E6191';
const AREAS_ORDEM: readonly IndividualProfileSubvector['bloco'][] = [
  'Postura',
  'Estrutura',
  'Motor',
  'Equilíbrio',
  'Assinatura',
];
/** Os 24 subvetores (exclui o indice geral de equilibrio), na ordem fixa. */
function subvetores24(
  subvetores: readonly IndividualProfileSubvector[],
): IndividualProfileSubvector[] {
  const fora = subvetores.filter((s) => s.rotulo !== ROTULO_INDICE_EQUILIBRIO);
  const out: IndividualProfileSubvector[] = [];
  for (const area of AREAS_ORDEM) {
    for (const s of fora) {
      if (s.bloco === area) out.push(s);
    }
  }
  return out;
}

function radarAngulo(i: number, n: number): number {
  return (-90 + (i * 360) / n) * (Math.PI / 180);
}

function radarPonto(i: number, n: number, raioFrac: number): [number, number] {
  const a = radarAngulo(i, n);
  return [RADAR_CX + RADAR_R * raioFrac * Math.cos(a), RADAR_CY + RADAR_R * raioFrac * Math.sin(a)];
}

/**
 * Radar de teia com os 24 subvetores (ME-1.10-DIS-G). Cada area e uma
 * fatia (do centro as suas pontas) tonalizada no tom da sua media; tres
 * aneis internos em 40/60/80; linha radial sutil nas fronteiras entre
 * areas; contorno fino azul com os pontos nas pontas; nome e escore de
 * cada area do lado de fora. Nomes completos dos 24 subvetores nas
 * pontas.
 */
function renderRadarPerfil(subvetores: readonly IndividualProfileSubvector[]): string {
  const subs = subvetores24(subvetores);
  const n = subs.length;
  if (n === 0) return '';
  const passo = ((360 / n) * Math.PI) / 180;
  const valPt = (i: number): [number, number] =>
    radarPonto(i, n, Math.max(0, Math.min(100, subs[i]?.valor ?? 0)) / 100);
  const meio = (i: number, j: number): [number, number] => {
    const [xi, yi] = valPt(i);
    const [xj, yj] = valPt(j);
    return [(xi + xj) / 2, (yi + yj) / 2];
  };
  let grade = '';
  for (const k of [0.4, 0.6, 0.8]) {
    const pts: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const [x, y] = radarPonto(i, n, k);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    grade += `<polygon points="${pts.join(' ')}" fill="none" stroke="#E5E7EB" stroke-width="1" />`;
  }
  for (let i = 0; i < n; i += 1) {
    const [x, y] = radarPonto(i, n, 1 + 12 / RADAR_R);
    grade += `<line x1="${RADAR_CX}" y1="${RADAR_CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#EBF0F5" stroke-width="0.8" />`;
  }
  const grupos = AREAS_ORDEM.map((area) => {
    const idxs: number[] = [];
    subs.forEach((s, i) => {
      if (s.bloco === area) idxs.push(i);
    });
    const media =
      idxs.length > 0 ? idxs.reduce((acc, i) => acc + (subs[i]?.valor ?? 0), 0) / idxs.length : 0;
    return { area, idxs, media };
  }).filter((g) => g.idxs.length > 0);
  let fatias = '';
  for (const g of grupos) {
    const iF = g.idxs[0] ?? 0;
    const iL = g.idxs[g.idxs.length - 1] ?? 0;
    const pIni = meio((iF - 1 + n) % n, iF);
    const pFim = meio(iL, (iL + 1) % n);
    let d = `M ${RADAR_CX} ${RADAR_CY} L ${pIni[0].toFixed(1)} ${pIni[1].toFixed(1)}`;
    for (const i of g.idxs) {
      const [x, y] = valPt(i);
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += ` L ${pFim[0].toFixed(1)} ${pFim[1].toFixed(1)} Z`;
    fatias += `<path d="${d}" fill="${fxHex(g.media)}" fill-opacity="0.55" stroke="none" />`;
  }
  let fronteiras = '';
  for (const g of grupos) {
    const a = radarAngulo(g.idxs[0] ?? 0, n) - passo / 2;
    const x = RADAR_CX + RADAR_R * Math.cos(a);
    const y = RADAR_CY + RADAR_R * Math.sin(a);
    fronteiras += `<line x1="${RADAR_CX}" y1="${RADAR_CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#334155" stroke-width="1.8" />`;
  }
  const polyPts = subs.map((_, i) => {
    const [x, y] = valPt(i);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const dots = subs
    .map((_, i) => {
      const [x, y] = valPt(i);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${RADAR_AZUL}" />`;
    })
    .join('');
  const contorno = `<polygon points="${polyPts.join(' ')}" fill="none" stroke="${RADAR_AZUL}" stroke-width="1.5" />${dots}`;
  const rotulos = subs
    .map((s, i) => {
      const a = radarAngulo(i, n);
      const x = RADAR_CX + (RADAR_R + 16) * Math.cos(a);
      const y = RADAR_CY + (RADAR_R + 16) * Math.sin(a);
      const cos = Math.cos(a);
      const anchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle';
      const sin = Math.sin(a);
      const dy = sin > 0.15 ? '0.8em' : sin < -0.15 ? '-0.2em' : '0.3em';
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dy="${dy}" font-size="13" fill="#374151">${escapeHtml(asStr(s.rotulo))}</text>`;
    })
    .join('');
  let nomes = '';
  for (const g of grupos) {
    const iF = g.idxs[0] ?? 0;
    const iL = g.idxs[g.idxs.length - 1] ?? 0;
    const am = (radarAngulo(iF, n) + radarAngulo(iL, n)) / 2;
    const offset = g.area === 'Equilíbrio' ? 178 : 140;
    const lx = RADAR_CX + (RADAR_R + offset) * Math.cos(am);
    const ly = RADAR_CY + (RADAR_R + offset) * Math.sin(am);
    const anchor = Math.cos(am) > 0.15 ? 'start' : Math.cos(am) < -0.15 ? 'end' : 'middle';
    nomes += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dy="0.3em" font-size="17" font-weight="700" fill="#1E293B">${escapeHtml(g.area)}</text>`;
  }
  return `<svg viewBox="30 135 1110 960" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; display:block;">
${grade}
${fatias}
${fronteiras}
${contorno}
${nomes}
${rotulos}
</svg>`;
}

/** Faixa inferior da pagina do radar: indice por area e legenda de faixa. */
function renderIndicesArea(subvetores: readonly IndividualProfileSubvector[]): string {
  const grouped: Record<IndividualProfileSubvector['bloco'], IndividualProfileSubvector[]> = {
    Postura: [],
    Estrutura: [],
    Motor: [],
    Equilíbrio: [],
    Assinatura: [],
  };
  for (const s of subvetores) grouped[s.bloco]?.push(s);
  const linhas = AREAS_ORDEM.map((area) => {
    const esc = escoreArea(grouped[area]);
    if (esc === null) return '';
    const pct = Math.max(0, Math.min(100, esc));
    const fx = faixaIntensidade(esc);
    return `<div class="idxarea-row">
      <div class="idxarea-nome">${escapeHtml(area)}</div>
      <div class="dim-bar-track"><div class="dim-bar-fill subv-fx${fx}" style="width:${pct.toFixed(1)}%;"></div></div>
      <div class="idxarea-val"><span class="subv-num">${Math.round(esc)}</span><span class="subv-faixa">${escapeHtml(faixaRotulo(esc))}</span></div>
    </div>`;
  }).join('\n');
  const legItens: ReadonlyArray<readonly [string, string]> = [
    ['Muito baixo', FX_HEX[0]],
    ['Baixo', FX_HEX[1]],
    ['Médio', FX_HEX[2]],
    ['Alto', FX_HEX[3]],
    ['Muito alto', FX_HEX[4]],
  ];
  const legenda = legItens
    .map(
      ([rot, hex]) =>
        `<span class="leg-item"><span class="leg-swatch" style="background:${hex};"></span>${rot}</span>`,
    )
    .join('');
  return `<div class="idxarea">
    <div class="idxarea-title">Índice por área</div>
    ${linhas}
    <div class="leg-escala">${legenda}</div>
  </div>`;
}

/** Pagina dedicada ao radar de teia (vem antes do painel). */
function renderGraficoPage(subvetores: readonly IndividualProfileSubvector[]): string {
  return `<section class="page-break">
  <h2>Mapa de leituras</h2>
  <div class="radar-wrap">${renderRadarPerfil(subvetores)}</div>
  ${renderIndicesArea(subvetores)}
</section>`;
}

/**
 * Painel de resultados por area (ME-1.10-DIS-F/G). Cinco areas em tres
 * paginas (duas por pagina; a ultima so com Assinatura), nenhuma cortada
 * ao meio (`page-break-inside: avoid` por area). Cada area abre com sua
 * nota fixa e escore; cada leitura traz nota fixa, barra por faixa de
 * intensidade, valor, faixa textual e selo de papel quando aplicavel. O
 * Equilibrio e tratado como as demais (media dos subvetores), sem item
 * composto a parte.
 */
function renderSubvectorPanel(subvetores: IndividualProfileSubvector[]): string {
  const grouped: Record<IndividualProfileSubvector['bloco'], IndividualProfileSubvector[]> = {
    Postura: [],
    Estrutura: [],
    Motor: [],
    Equilíbrio: [],
    Assinatura: [],
  };
  for (const s of subvetores) grouped[s.bloco]?.push(s);

  const bloco = (b: IndividualProfileSubvector['bloco']): string =>
    grouped[b].length > 0 ? renderAreaBloco(b, grouped[b]) : '';

  return `<section class="page-break">
  <h2>Painel de resultados por área</h2>
  ${bloco('Postura')}
${bloco('Estrutura')}
</section>
<section class="page-break">
  ${bloco('Motor')}
${bloco('Equilíbrio')}
</section>
<section class="page-break">
  ${bloco('Assinatura')}
</section>`;
}

/**
 * Renderiza o HTML canonico do Perfil Individual expandido em PDF.
 * Deterministico: mesmos inputs -> mesma saida byte a byte.
 */
/**
 * Pagina final de rastreabilidade (ME-1.19, adicao): card tecnico enxuto
 * com identificacao, datas e nota de integridade, no mesmo padrao dos
 * demais PDFs do projeto. Usa apenas dados ja presentes no input — nao
 * exige nada novo do chamador.
 */
function renderRastreabilidade(input: IndividualProfileTemplateInput): string {
  const id = input.identificacao;
  const nivel = NIVEL_HIERARQUICO_ROTULO[id.nivelHierarquico];
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="trace-card trace-card-linhas">
    <div><strong>Empresa:</strong> ${escapeHtml(asStr(input.company.nomeFantasia))}</div>
    <div><strong>Colaborador:</strong> ${escapeHtml(asStr(id.nome))}</div>
    <div><strong>Cargo:</strong> ${escapeHtml(asStr(id.cargo))}</div>
    <div><strong>Nível hierárquico:</strong> ${escapeHtml(nivel)}</div>
    <div><strong>Departamento:</strong> ${escapeHtml(asStr(id.departamento))}</div>
    <div><strong>Líder direto:</strong> ${escapeHtml(asStr(id.liderDireto))}</div>
    <div><strong>Data de aplicação:</strong> ${escapeHtml(formatDateBR(asStr(id.dataAplicacao)))}</div>
    <div><strong>Gerado em:</strong> ${escapeHtml(formatDateBR(asStr(input.generatedAtDate)))}</div>
  </div>
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Nota final.</strong> Este relatório descreve o padrão atual do colaborador e pode ser regerado a partir das respostas originais do instrumento, apresentando idêntico conteúdo estrutural.</p>
</section>`;
}

export function renderIndividualProfileHTML(input: IndividualProfileTemplateInput): string {
  const exp = input.expandido;
  const bodyHtml = [
    renderCoverPage(input.identificacao),
    renderGraficoPage(input.subvetores),
    renderSubvectorPanel(input.subvetores),
    renderSintese(exp.sintese_executiva),
    renderComoAge(exp.como_age),
    renderQuemE(exp.quem_e),
    renderOQueMove(exp.o_que_move),
    renderComoReage(exp.como_reage_sob_pressao),
    renderNaturalmenteExcelente(exp.naturalmente_excelente),
    renderRecomendacoes(exp.recomendacoes_executivas),
    renderConfiabilidade(exp.confiabilidade, input.confiabilidadeMetricas),
    renderRastreabilidade(input),
  ].join('\n\n');

  return renderLayoutBase({
    title: `Perfil individual — ${input.identificacao.nome}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
