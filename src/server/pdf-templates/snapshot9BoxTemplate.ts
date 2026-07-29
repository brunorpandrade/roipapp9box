/* eslint-disable @stylistic/max-len -- template HTML canonico */
// ROIP APP 9BOX — template PDF Snapshot 9-Box (ME-053, S275).
//
// Renderizacao HTML deterministica do Snapshot do 9-Box (DOC 03 §13.7).
// 100% template — SEM participacao de IA. Consumido por
// `exports.getSnapshot9Box` (Route Handler); convertido em PDF pelo
// `pdfRenderer.ts`.
//
// Estrutura canonica em cascata §13.7:
//   - Escopo empresa: visao geral consolidada (matriz 3x3 + tabela por
//     quadrante) + detalhamento por departamento + detalhamento por
//     equipe.
//   - Escopo departamento / equipe: mesma cascata restrita ao recorte.
//
// Determinismo canonico: mesmos dados = mesmo HTML byte a byte.

import { escapeHtml, renderLayoutBase } from './layoutBase';

/** 9 quadrantes canonicos do DOC 03 §10.5. */
export const NINE_BOX_QUADRANTES = [
  'ALTO IMPACTO',
  'DESEMPENHO REPRESADO',
  'POTENCIAL SUBUTILIZADO',
  'ALTA ENTREGA',
  'EQUILÍBRIO FRÁGIL',
  'DESEMPENHO CRÍTICO',
  'RISCO DE ESGOTAMENTO',
  'DESGASTE OCULTO',
  'RISCO CRÍTICO',
] as const;

export type NineBoxQuadrante = (typeof NINE_BOX_QUADRANTES)[number];

/** Distribuicao canonica por quadrante (contagem absoluta). */
export type NineBoxDistribuicao = Record<NineBoxQuadrante, number>;

/** Linha de colaborador na tabela por quadrante. */
export interface NineBoxLinhaColaborador {
  employeeId: number;
  nome: string;
  departamento: string;
  scoreDesempenho: number | null;
  plenitudeScore: number | null;
  quadrante: NineBoxQuadrante;
}

/** Bloco canonico por escopo (empresa/departamento/equipe). */
export interface NineBoxBlocoEscopo {
  titulo: string;
  totalClassificados: number;
  distribuicao: NineBoxDistribuicao;
  colaboradores: NineBoxLinhaColaborador[];
}

/** Input canonico do template. */
export interface Snapshot9BoxTemplateInput {
  nomeFantasia: string;
  razaoSocialSanitizada: string;
  trimestre: string;
  escopoTipo: 'empresa' | 'departamento' | 'equipe';
  escopoRotulo: string;
  /** Bloco principal do escopo escolhido. */
  blocoPrincipal: NineBoxBlocoEscopo;
  /** Blocos derivados canonicos (cascata). Vazio quando escopo=equipe. */
  blocosCapilares: NineBoxBlocoEscopo[];
  geradoEmIso: string;
}

// ============================================================
// Helpers de formatacao
// ============================================================

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ============================================================
// Filename canonico §13.7
// ============================================================

/**
 * Compoe o nome canonico do arquivo PDF:
 * `snapshot_9box_[razaoSocial]_[trimestre]_[YYYYMMDD_HHmm].pdf`.
 */
export function composeSnapshot9BoxFilename(
  razaoSocialSanitizada: string,
  trimestre: string,
  dataGeracaoIso: string,
): string {
  const d = new Date(dataGeracaoIso);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}_${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `snapshot_9box_${razaoSocialSanitizada}_${trimestre}_${stamp}.pdf`;
}

// ============================================================
// Secoes canonicas
// ============================================================

function renderCapa(input: Snapshot9BoxTemplateInput): string {
  const escopo =
    input.escopoTipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : `${input.escopoTipo.charAt(0).toUpperCase() + input.escopoTipo.slice(1)}: ${escapeHtml(input.escopoRotulo)}`;
  return `<section>
  <h1>Snapshot do 9-Box</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</p>
  <p><strong>Trimestre:</strong> ${escapeHtml(input.trimestre)}</p>
  <p><strong>Escopo:</strong> ${escopo}</p>
  <p><strong>Data de geração:</strong> ${escapeHtml(input.geradoEmIso)}</p>
  <p class="muted">Este relatório apresenta a distribuição dos colaboradores no 9-Box calculada no trimestre. Estritamente determinístico — sem participação de IA.</p>
</section>`;
}

function renderMatriz3x3(bloco: NineBoxBlocoEscopo): string {
  const q = bloco.distribuicao;
  // Ordem canonica de exibicao — leitura da matriz 9-Box (plenitude no
  // eixo Y crescente para cima; desempenho no eixo X crescente para
  // direita).
  return `<table class="grid nineBox">
  <thead>
    <tr><th></th><th>Desempenho baixo</th><th>Desempenho médio</th><th>Desempenho alto</th></tr>
  </thead>
  <tbody>
    <tr><th>Plenitude alta</th><td>POTENCIAL SUBUTILIZADO<br>${fmtInt(q['POTENCIAL SUBUTILIZADO'])}</td><td>ALTA ENTREGA<br>${fmtInt(q['ALTA ENTREGA'])}</td><td>ALTO IMPACTO<br>${fmtInt(q['ALTO IMPACTO'])}</td></tr>
    <tr><th>Plenitude média</th><td>EQUILÍBRIO FRÁGIL<br>${fmtInt(q['EQUILÍBRIO FRÁGIL'])}</td><td>DESGASTE OCULTO<br>${fmtInt(q['DESGASTE OCULTO'])}</td><td>DESEMPENHO REPRESADO<br>${fmtInt(q['DESEMPENHO REPRESADO'])}</td></tr>
    <tr><th>Plenitude baixa</th><td>RISCO CRÍTICO<br>${fmtInt(q['RISCO CRÍTICO'])}</td><td>DESEMPENHO CRÍTICO<br>${fmtInt(q['DESEMPENHO CRÍTICO'])}</td><td>RISCO DE ESGOTAMENTO<br>${fmtInt(q['RISCO DE ESGOTAMENTO'])}</td></tr>
  </tbody>
</table>`;
}

function renderTabelaColaboradores(bloco: NineBoxBlocoEscopo): string {
  if (bloco.colaboradores.length === 0) {
    return '<p class="muted">Sem colaboradores classificados neste escopo.</p>';
  }
  const rows = bloco.colaboradores
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.departamento)}</td><td>${fmtNum(c.scoreDesempenho)}</td><td>${fmtNum(c.plenitudeScore)}</td><td>${escapeHtml(c.quadrante)}</td></tr>`,
    )
    .join('\n');
  return `<table class="grid">
  <thead>
    <tr><th>Colaborador</th><th>Departamento</th><th>Desempenho</th><th>Plenitude</th><th>Quadrante</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function renderBloco(bloco: NineBoxBlocoEscopo, headingLevel: 2 | 3): string {
  const h = `h${headingLevel}`;
  return `<section class="page-break">
  <${h}>${escapeHtml(bloco.titulo)}</${h}>
  <p class="muted">Total classificados: ${fmtInt(bloco.totalClassificados)}</p>
  ${renderMatriz3x3(bloco)}
  ${renderTabelaColaboradores(bloco)}
</section>`;
}

// ============================================================
// Funcao publica canonica
// ============================================================

export function renderSnapshot9BoxHTML(input: Snapshot9BoxTemplateInput): string {
  const secoesCapilares =
    input.blocosCapilares.length === 0
      ? ''
      : input.blocosCapilares.map((b) => renderBloco(b, 3)).join('\n');
  const bodyHtml = [renderCapa(input), renderBloco(input.blocoPrincipal, 2), secoesCapilares]
    .filter((s) => s.length > 0)
    .join('\n');
  return renderLayoutBase({
    title: `Snapshot 9-Box · ${input.nomeFantasia} · ${input.trimestre}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerCenter: `Gerado em ${input.geradoEmIso}`,
  });
}
