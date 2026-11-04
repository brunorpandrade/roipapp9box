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
  pontos_atencao: string;
  recomendacao_sintese: string;
}

/** Recomendacoes executivas — paragrafos + listas de bullets. */
export interface RecomendacoesExecutivas {
  onde_performa_melhor: string;
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

/** Input canonico do template. */
export interface IndividualProfileTemplateInput {
  company: LayoutBaseCompany;
  identificacao: IndividualProfileIdentificacao;
  expandido: IndividualProfileExpandidoJson;
  subvetores: IndividualProfileSubvector[];
  /** Data de geracao para o rodape. `YYYY-MM-DD`. */
  generatedAtDate: string;
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
  <div class="cover-badge">Perfil individual</div>
  <div class="cover-hero">
    <div class="cover-title-line1">Perfil individual</div>
    <div class="cover-title-line2">Retrato comportamental</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Colaborador</span><span class="cover-meta-value">${escapeHtml(asStr(id.nome))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Cargo</span><span class="cover-meta-value">${escapeHtml(asStr(id.cargo))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Nível hierárquico</span><span class="cover-meta-value">${escapeHtml(nivel)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Departamento</span><span class="cover-meta-value">${escapeHtml(asStr(id.departamento))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de aplicação</span><span class="cover-meta-value">${escapeHtml(formatDateBR(asStr(id.dataAplicacao)))}</span></div>
  </div>
  <div class="cover-note"><strong>Documento confidencial.</strong> Este relatório descreve padrões comportamentais e de potencial — é uma leitura de estilo, não um juízo de valor sobre a pessoa. Destina-se exclusivamente à gestão de pessoas e ao desenvolvimento do colaborador.</div>
</section>`;
}

function renderIdentificacaoSection(id: IndividualProfileIdentificacao): string {
  return `<section class="page-break">
  <h2>Identificação</h2>
  <p><strong>Nome:</strong> ${escapeHtml(asStr(id.nome))}</p>
  <p><strong>Cargo:</strong> ${escapeHtml(asStr(id.cargo))}</p>
  <p><strong>Nível hierárquico:</strong> ${escapeHtml(NIVEL_HIERARQUICO_ROTULO[id.nivelHierarquico])}</p>
  <p><strong>Departamento:</strong> ${escapeHtml(asStr(id.departamento))}</p>
  <p><strong>Líder direto:</strong> ${escapeHtml(asStr(id.liderDireto))}</p>
  <p><strong>Data de aplicação:</strong> ${escapeHtml(formatDateBR(asStr(id.dataAplicacao)))}</p>
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

function renderRecomendacoes(r: RecomendacoesExecutivas): string {
  return `<section>
  <h2>Recomendações executivas</h2>
  ${subBloco('Onde performa melhor', r?.onde_performa_melhor)}
  ${subLista('O que precisa do gestor', r?.o_que_precisa_do_gestor)}
  ${subBloco('Zona de desenvolvimento', r?.zona_de_desenvolvimento)}
  ${subLista('Sinais de alerta', r?.sinais_de_alerta)}
  ${subBloco('Contextos a evitar', r?.contextos_a_evitar)}
</section>`;
}

function renderConfiabilidade(c: Confiabilidade): string {
  const nivel = asStr(c?.nivel);
  const nota = asStr(c?.nota_contexto);
  const hedge = asList(c?.dimensoes_com_hedge);
  const hedgeHtml = hedge.length > 0 ? `\n  ${subLista('Dimensões com ressalva', hedge)}` : '';
  const notaHtml = nota.length > 0 ? ` — ${escapeHtml(nota)}` : '';
  return `<section>
  <p class="muted"><strong>Confiabilidade:</strong> ${escapeHtml(nivel)}${notaHtml}</p>${hedgeHtml}
</section>`;
}

function renderSubvectorPanel(subvetores: IndividualProfileSubvector[]): string {
  const grouped: Record<string, IndividualProfileSubvector[]> = {
    Postura: [],
    Estrutura: [],
    Motor: [],
    Equilíbrio: [],
    Assinatura: [],
  };
  for (const s of subvetores) grouped[s.bloco]?.push(s);

  // ME-1.10-CC079-DIS-E: barras canonicas `.dim-bar-row` na cor de
  // marca (teal #14B8A6), NAO semaforicas. O Perfil individual e
  // descritivo, nao avaliativo — um subvetor baixo (ex. amabilidade) e
  // posicao no traco, nao "ruim". Semaforo verde/amarelo/vermelho
  // introduziria juizo de valor ausente do instrumento (DOC 03 §10.8).
  // Cada bloco e envolvido em `page-break-inside: avoid` para eliminar
  // titulos de bloco orfaos no fim de pagina.
  const blocks = Object.entries(grouped)
    .filter(([, arr]) => arr.length > 0)
    .map(([bloco, arr]) => {
      const rows = arr
        .map((s) => {
          const pct = Math.max(0, Math.min(100, s.valor));
          return `<div class="dim-bar-row">
      <div class="dim-bar-label">${escapeHtml(asStr(s.rotulo))}</div>
      <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${pct.toFixed(1)}%;"></div></div>
      <div class="dim-bar-value">${pct.toFixed(1)}</div>
    </div>`;
        })
        .join('\n');
      return `<div style="page-break-inside: avoid; margin-bottom:4mm;">
  <h3>${escapeHtml(bloco)}</h3>
  <div class="dim-bars">
${rows}
  </div>
</div>`;
    })
    .join('\n');

  return `<section class="page-break">
  <h2>Painel dos subvetores</h2>
  ${blocks}
</section>`;
}

/**
 * Renderiza o HTML canonico do Perfil Individual expandido em PDF.
 * Deterministico: mesmos inputs -> mesma saida byte a byte.
 */
export function renderIndividualProfileHTML(input: IndividualProfileTemplateInput): string {
  const exp = input.expandido;
  const bodyHtml = [
    renderCoverPage(input.identificacao),
    renderIdentificacaoSection(input.identificacao),
    renderSintese(exp.sintese_executiva),
    renderComoAge(exp.como_age),
    renderQuemE(exp.quem_e),
    renderOQueMove(exp.o_que_move),
    renderComoReage(exp.como_reage_sob_pressao),
    renderNaturalmenteExcelente(exp.naturalmente_excelente),
    renderSubvectorPanel(input.subvetores),
    renderRecomendacoes(exp.recomendacoes_executivas),
    renderConfiabilidade(exp.confiabilidade),
  ].join('\n\n');

  return renderLayoutBase({
    title: `Perfil individual — ${input.identificacao.nome}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
