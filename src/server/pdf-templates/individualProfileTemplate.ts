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
  bloco: 'Postura' | 'Estrutura' | 'Motor' | 'Equilibrio' | 'Assinatura';
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

function renderIdentificacaoSection(id: IndividualProfileIdentificacao): string {
  return `<section>
  <h2>Identificação</h2>
  <p><strong>Nome:</strong> ${escapeHtml(asStr(id.nome))}</p>
  <p><strong>Cargo:</strong> ${escapeHtml(asStr(id.cargo))}</p>
  <p><strong>Nível hierárquico:</strong> ${escapeHtml(NIVEL_HIERARQUICO_ROTULO[id.nivelHierarquico])}</p>
  <p><strong>Departamento:</strong> ${escapeHtml(asStr(id.departamento))}</p>
  <p><strong>Líder direto:</strong> ${escapeHtml(asStr(id.liderDireto))}</p>
  <p><strong>Data de aplicação:</strong> ${escapeHtml(asStr(id.dataAplicacao))}</p>
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
  ${subLista('Riscos de overuse', b?.riscos_de_overuse)}
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
    Equilibrio: [],
    Assinatura: [],
  };
  for (const s of subvetores) grouped[s.bloco]?.push(s);

  const blocks = Object.entries(grouped)
    .filter(([, arr]) => arr.length > 0)
    .map(([bloco, arr]) => {
      const rows = arr
        .map((s) => {
          const pct = Math.max(0, Math.min(100, s.valor));
          return `<tr>
      <td style="width:35%; padding:2mm 3mm 2mm 0;">${escapeHtml(asStr(s.rotulo))}</td>
      <td style="width:55%;">
        <div style="background:#e5e7eb; height:4mm; border-radius:1mm;">
          <div style="background:#111827; width:${pct.toFixed(1)}%; height:4mm; border-radius:1mm;"></div>
        </div>
      </td>
      <td style="width:10%; text-align:right; padding:2mm 0 2mm 3mm;">${pct.toFixed(1)}</td>
    </tr>`;
        })
        .join('\n');
      return `<h3>${escapeHtml(bloco)}</h3>
<table style="width:100%; border-collapse:collapse; margin-bottom:4mm;">
${rows}
</table>`;
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
    `<h1>Perfil Individual</h1>`,
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
    title: `Perfil Individual — ${input.identificacao.nome}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
