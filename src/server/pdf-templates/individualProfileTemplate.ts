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
  'Índice geral de equilíbrio': 'Resumo da competência emocional, média das quatro leituras acima.',
  Sabedoria: 'Excelência em análise, diagnóstico e clareza de raciocínio.',
  Coragem: 'Excelência em decisões difíceis e iniciativa em contexto ambíguo.',
  Humanidade: 'Excelência em vínculo, cuidado e leitura relacional.',
  Justiça: 'Excelência em cooperação, equidade e legitimidade.',
  Temperança: 'Excelência em disciplina, método e prudência.',
  Transcendência: 'Excelência em sentido, propósito e mobilização.',
};

const ROTULO_INDICE_EQUILIBRIO = 'Índice geral de equilíbrio';

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

/** Uma barra semaforizada com rotulo, nota fixa, faixa e selo opcional. */
function renderSubvRow(s: IndividualProfileSubvector, selo: string | null): string {
  const pct = Math.max(0, Math.min(100, s.valor));
  const fx = faixaIntensidade(s.valor);
  const nota = NOTA_SUBVETOR[s.rotulo] ?? '';
  const notaHtml =
    nota.length > 0 ? `\n        <div class="subv-note">${escapeHtml(nota)}</div>` : '';
  const seloHtml = selo !== null ? ` <span class="subv-selo">${escapeHtml(selo)}</span>` : '';
  return `<div class="subv-row">
      <div class="subv-label-col">
        <div class="subv-label">${escapeHtml(asStr(s.rotulo))}${seloHtml}</div>${notaHtml}
      </div>
      <div class="dim-bar-track"><div class="dim-bar-fill subv-fx${fx}" style="width:${pct.toFixed(1)}%;"></div></div>
      <div class="subv-value"><span class="subv-num">${pct.toFixed(0)}</span><span class="subv-faixa">${escapeHtml(faixaRotulo(s.valor))}</span></div>
    </div>`;
}

/** Linha de destaque do Indice geral de equilibrio (fora do semaforo). */
function renderIndiceRow(s: IndividualProfileSubvector): string {
  const pct = Math.max(0, Math.min(100, s.valor));
  const nota = NOTA_SUBVETOR[s.rotulo] ?? '';
  const notaHtml =
    nota.length > 0 ? `\n        <div class="subv-note">${escapeHtml(nota)}</div>` : '';
  return `<div class="subv-row subv-indice-row">
      <div class="subv-label-col">
        <div class="subv-label subv-indice-label">${escapeHtml(asStr(s.rotulo))}</div>${notaHtml}
      </div>
      <div class="dim-bar-track"><div class="dim-bar-fill subv-indice-fill" style="width:${pct.toFixed(1)}%;"></div></div>
      <div class="subv-value"><span class="subv-num subv-indice-num">${pct.toFixed(0)}</span><span class="subv-faixa">${escapeHtml(faixaRotulo(s.valor))}</span></div>
    </div>`;
}

/**
 * Escore agregado da area (0-100), identico ao painel resumido da
 * plataforma: Equilibrio usa o Indice geral; as demais usam a media
 * dos subvetores. Deriva dos mesmos valores, entao bate por construcao.
 */
function escoreArea(
  bloco: IndividualProfileSubvector['bloco'],
  itens: readonly IndividualProfileSubvector[],
): number | null {
  if (bloco === 'Equilíbrio') {
    const indice = itens.find((s) => s.rotulo === ROTULO_INDICE_EQUILIBRIO);
    if (indice) return indice.valor;
  }
  const base = itens.filter((s) => s.rotulo !== ROTULO_INDICE_EQUILIBRIO);
  if (base.length === 0) return null;
  const soma = base.reduce((acc, s) => acc + s.valor, 0);
  return soma / base.length;
}

/** Um bloco de area: cabecalho + nota da area + barras. */
function renderAreaBloco(
  bloco: IndividualProfileSubvector['bloco'],
  itens: readonly IndividualProfileSubvector[],
): string {
  const selos = selosDoBloco(bloco, itens);
  const escore = escoreArea(bloco, itens);
  const escoreHtml =
    escore !== null
      ? `<span class="subv-area-score">${escapeHtml(faixaRotulo(escore))} · ${Math.round(escore)}</span>`
      : '';
  const rows = itens
    .map((s) => {
      if (bloco === 'Equilíbrio' && s.rotulo === ROTULO_INDICE_EQUILIBRIO) {
        return renderIndiceRow(s);
      }
      return renderSubvRow(s, selos.get(s.rotulo) ?? null);
    })
    .join('\n');
  return `<div class="subv-area">
    <div class="subv-area-head"><span class="subv-area-title">${escapeHtml(bloco)}</span>${escoreHtml}</div>
    <div class="subv-area-note">${escapeHtml(NOTA_AREA[bloco])}</div>
    <div class="subv-bars">
${rows}
    </div>
  </div>`;
}

/**
 * Painel de resultados por area (ME-1.10-DIS-F). Cinco areas em duas
 * paginas: tres na primeira (Postura, Estrutura, Motor) e duas na
 * segunda (Equilibrio, Assinatura), nenhuma cortada ao meio
 * (`page-break-inside: avoid` por area). Cada area abre com sua nota
 * fixa; cada leitura traz nota fixa, barra semaforizada por faixa,
 * valor, faixa textual e selo de papel quando aplicavel. O Indice geral
 * de equilibrio aparece em destaque, fora do semaforo.
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

  const pagina1 = (['Postura', 'Estrutura', 'Motor'] as const)
    .filter((b) => grouped[b].length > 0)
    .map((b) => renderAreaBloco(b, grouped[b]))
    .join('\n');
  const pagina2 = (['Equilíbrio', 'Assinatura'] as const)
    .filter((b) => grouped[b].length > 0)
    .map((b) => renderAreaBloco(b, grouped[b]))
    .join('\n');

  return `<section class="page-break">
  <h2>Painel de resultados por área</h2>
  ${pagina1}
</section>
<section class="page-break">
  ${pagina2}
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
