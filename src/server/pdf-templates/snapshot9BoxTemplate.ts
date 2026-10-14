/* eslint-disable @stylistic/max-len -- template HTML canonico */
// ROIP APP 9BOX — template PDF Snapshot 9-Box (ME-053, S275; ME-1.3c CC079 leva v2).
//
// Renderizacao HTML deterministica do Snapshot do 9-Box (DOC 03 §13.7).
// 100% template — SEM participacao de IA. Consumido por
// `exports.getSnapshot9Box` (Route Handler); convertido em PDF pelo
// `pdfRenderer.ts`.
//
// Estrutura canonica em cascata §13.7 (ME-1.3c CC079-v2 — padrao
// editorial do mockup `relatorio_radar_nr1_v1.html`):
// - Capa editorial com badge, hero title + accent teal, meta grid card,
//   cover-note.
// - Sumario estilizado com dots e numeracao de pagina.
// - Secao numerada com section-num teal + h2 com borda inferior teal.
// - Grid SVG 3x3 colorido com cores canonicas da UI + bolhas dos
//   colaboradores com title canonico + rotulos de eixo.
// - Tabela estilizada canonica com badges coloridos de quadrante por
//   `NINE_BOX_PALETTE`.
//
// Determinismo canonico (§13.7): mesmos dados = mesmo HTML byte-exact.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { NINE_BOX_PALETTE, RADAR_COLORS } from '../../lib/svg/pdfVisualTokens';
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
  blocoPrincipal: NineBoxBlocoEscopo;
  blocosCapilares: NineBoxBlocoEscopo[];
  geradoEmIso: string;
}

// ============================================================
// Helpers canonicos de formatacao
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
// Grid SVG canonico do 9-Box (ME-1.3c + CC079-v2)
// ============================================================

const NINE_BOX_SVG_ORIGIN_X = 60;
const NINE_BOX_SVG_ORIGIN_Y = 60;
const NINE_BOX_SVG_GRID_SIZE = 600;

const NINE_BOX_SVG_GRID = [
  ['POTENCIAL SUBUTILIZADO', 'DESEMPENHO REPRESADO', 'ALTO IMPACTO'],
  ['DESEMPENHO CRÍTICO', 'EQUILÍBRIO FRÁGIL', 'ALTA ENTREGA'],
  ['RISCO CRÍTICO', 'DESGASTE OCULTO', 'RISCO DE ESGOTAMENTO'],
] as const satisfies readonly (readonly NineBoxQuadrante[])[];

// Espacamento canonico entre celulas (gutter) para o visual de cards
// arredondados do dashboard canonico (DOC 05 §UI mirror). Decisao
// canonica ME-1.3c CC079-v3 — espelho visual do dashboard agregado.
const NINE_BOX_CELL_GAP = 10;
const NINE_BOX_CELL_RADIUS = 14;

function renderNineBoxGridCells(distribuicao: NineBoxDistribuicao): string {
  const cellSize = (NINE_BOX_SVG_GRID_SIZE - 2 * NINE_BOX_CELL_GAP) / 3;
  const cells: string[] = [];
  for (let row = 0; row < 3; row++) {
    const linha = NINE_BOX_SVG_GRID[row];
    if (linha === undefined) {
      continue;
    }
    for (let col = 0; col < 3; col++) {
      const quadrante = linha[col];
      if (quadrante === undefined) {
        continue;
      }
      const paleta = NINE_BOX_PALETTE[quadrante];
      const x = NINE_BOX_SVG_ORIGIN_X + col * (cellSize + NINE_BOX_CELL_GAP);
      const y = NINE_BOX_SVG_ORIGIN_Y + row * (cellSize + NINE_BOX_CELL_GAP);
      const cx = x + cellSize / 2;
      // Numero grande centralizado em cima + nome do quadrante em
      // UPPERCASE embaixo (padrao canonico do dashboard agregado).
      const countY = y + cellSize / 2 - 6;
      const nomeY = y + cellSize / 2 + 32;
      const total = fmtInt(distribuicao[quadrante]);
      cells.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" ` +
          `rx="${NINE_BOX_CELL_RADIUS}" ry="${NINE_BOX_CELL_RADIUS}" ` +
          `fill="${paleta.bg}" />` +
          `<text x="${cx}" y="${countY}" text-anchor="middle" ` +
          `font-size="56" font-weight="700" fill="${paleta.text}">${total}</text>` +
          `<text x="${cx}" y="${nomeY}" text-anchor="middle" ` +
          `font-size="13" font-weight="700" fill="${paleta.text}" ` +
          `letter-spacing="0.5">${escapeHtml(quadrante)}</text>`,
      );
    }
  }
  return cells.join('\n');
}

/**
 * Rotulos canonicos de eixo — setas discretas no padrao do dashboard
 * agregado (DOC 05 §UI mirror): "PLENITUDE ↑" vertical rotacionado a
 * esquerda do grid; "DESEMPENHO →" horizontal abaixo do grid.
 */
function renderNineBoxAxisLabels(): string {
  const originX = NINE_BOX_SVG_ORIGIN_X;
  const originY = NINE_BOX_SVG_ORIGIN_Y;
  const size = NINE_BOX_SVG_GRID_SIZE;
  const labelFill = RADAR_COLORS.textMuted;
  // Eixo horizontal: "DESEMPENHO →" centralizado embaixo.
  const xHorizontalLabelCx = originX + size / 2;
  const xHorizontalLabelY = originY + size + 40;
  // Eixo vertical: "PLENITUDE ↑" rotacionado -90 graus a esquerda.
  const yVerticalLabelX = originX - 22;
  const yVerticalLabelCy = originY + size / 2;
  return (
    `<text x="${xHorizontalLabelCx}" y="${xHorizontalLabelY}" text-anchor="middle" ` +
    `font-size="13" font-weight="700" fill="${labelFill}" letter-spacing="2">` +
    `DESEMPENHO →</text>` +
    `<text x="${yVerticalLabelX}" y="${yVerticalLabelCy}" text-anchor="middle" ` +
    `font-size="13" font-weight="700" fill="${labelFill}" letter-spacing="2" ` +
    `transform="rotate(-90 ${yVerticalLabelX} ${yVerticalLabelCy})">` +
    `PLENITUDE ↑</text>`
  );
}

/**
 * Renderiza o grid 9-Box canonico como SVG inline (ME-1.3c CC079-v3).
 * Grid 3x3 de cards arredondados com cores canonicas da UI
 * (`NINE_BOX_PALETTE`), numero grande centralizado por quadrante + nome
 * em UPPERCASE embaixo, mais setas canonicas de eixo. Zero bolhas de
 * colaboradores — a identificacao individual fica na tabela abaixo
 * com badges coloridos de quadrante.
 */
function renderMatriz3x3(bloco: NineBoxBlocoEscopo): string {
  const svgWidth = NINE_BOX_SVG_ORIGIN_X * 2 + NINE_BOX_SVG_GRID_SIZE;
  const svgHeight = NINE_BOX_SVG_ORIGIN_Y + NINE_BOX_SVG_GRID_SIZE + 56;
  return (
    `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" ` +
    `xmlns="http://www.w3.org/2000/svg" ` +
    `style="width:100%; height:auto; display:block; margin:0 auto 6mm;">
${renderNineBoxGridCells(bloco.distribuicao)}
${renderNineBoxAxisLabels()}
</svg>`
  );
}

// ============================================================
// Secoes editoriais canonicas (ME-1.3c CC079-v2)
// ============================================================

/** Humaniza data ISO em "DD de mes de YYYY". */
const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

function formatDataEditorial(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return iso;
  }
  const year = d.getUTCFullYear();
  const month = MESES_PT_BR[d.getUTCMonth()];
  const day = d.getUTCDate();
  if (month === undefined) {
    return iso;
  }
  return `${day} de ${month} de ${year}`;
}

function renderCapa(input: Snapshot9BoxTemplateInput): string {
  const escopoTxt =
    input.escopoTipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : `${input.escopoTipo.charAt(0).toUpperCase() + input.escopoTipo.slice(1)}: ${input.escopoRotulo}`;
  const dataGeracao = formatDataEditorial(input.geradoEmIso);
  const totalColaboradores = input.blocoPrincipal.totalClassificados;
  return `<section class="cover-page">
  <div class="cover-badge">Snapshot do trimestre</div>
  <div class="cover-title">Snapshot<br/><span class="cover-title-accent">do 9-Box</span></div>
  <div class="cover-subtitle">${escapeHtml(input.nomeFantasia)} · ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Trimestre</span><span class="cover-meta-value">${escapeHtml(formatTrimestreBR(input.trimestre))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Escopo</span><span class="cover-meta-value">${escapeHtml(escopoTxt)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Colaboradores classificados</span><span class="cover-meta-value">${fmtInt(totalColaboradores)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note" style="background:#F0FDFA; border-color:#99F6E4; color:#134E4A;">
    <strong>Sobre este relatório:</strong> apresenta a distribuição dos colaboradores no 9-Box calculada no trimestre, cruzando eixo de desempenho e eixo de plenitude. Renderização estritamente determinística — sem participação de IA. Material de leitura executiva para suportar conversas de gestão e desenvolvimento.
  </div>
</section>`;
}

// Indice canonico de prioridade dos 9 quadrantes para ordenacao da
// tabela — espelho da ordem de `NINE_BOX_QUADRANTES` (DOC 01 §8.4), do
// melhor (ALTO IMPACTO = 0) ao pior (RISCO CRITICO = 8). Decisao
// canonica ME-1.3c CC079-v3.
export const NINE_BOX_PRIORIDADE: Readonly<Record<NineBoxQuadrante, number>> = Object.freeze(
  Object.fromEntries(NINE_BOX_QUADRANTES.map((q, idx) => [q, idx])),
) as Readonly<Record<NineBoxQuadrante, number>>;

/**
 * Ordena colaboradores canonicamente — primeiro pela ordem canonica
 * dos 9 quadrantes (do melhor ao pior); dentro de cada quadrante, por
 * ordem alfabetica do nome do colaborador (locale pt-BR, sem
 * sensibilidade a acentos para que "Álvaro" fique perto de "Alvaro").
 */
export function ordenarColaboradoresCanonicos(
  colaboradores: readonly NineBoxLinhaColaborador[],
): NineBoxLinhaColaborador[] {
  return [...colaboradores].sort((a, b) => {
    const prioridadeA = NINE_BOX_PRIORIDADE[a.quadrante];
    const prioridadeB = NINE_BOX_PRIORIDADE[b.quadrante];
    if (prioridadeA !== prioridadeB) {
      return prioridadeA - prioridadeB;
    }
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  });
}

function renderBloco(bloco: NineBoxBlocoEscopo, seccao: string, headingLevel: 2 | 3): string {
  const h = `h${headingLevel}`;
  const colaboradoresOrdenados = ordenarColaboradoresCanonicos(bloco.colaboradores);
  const colaboradores =
    colaboradoresOrdenados.length === 0
      ? '<p class="muted">Sem colaboradores classificados neste escopo.</p>'
      : `<table class="data-table">
    <thead>
      <tr>
        <th>Colaborador</th>
        <th>Departamento</th>
        <th class="right">Desempenho</th>
        <th class="right">Plenitude</th>
        <th>Quadrante</th>
      </tr>
    </thead>
    <tbody>
${colaboradoresOrdenados
  .map((c) => {
    const paleta = NINE_BOX_PALETTE[c.quadrante];
    const badge = `<span style="display:inline-block; padding:1mm 2.5mm; border-radius:4pt; background:${paleta.bg}; color:${paleta.text}; font-size:8.5pt; font-weight:700; letter-spacing:0.03em;">${escapeHtml(c.quadrante)}</span>`;
    return `<tr>
    <td>${escapeHtml(c.nome)}</td>
    <td>${escapeHtml(c.departamento)}</td>
    <td class="right fw-700">${fmtNum(c.scoreDesempenho)}</td>
    <td class="right">${fmtNum(c.plenitudeScore)}</td>
    <td>${badge}</td>
  </tr>`;
  })
  .join('\n')}
    </tbody>
  </table>`;
  const sectionNum = `<span class="section-num">${seccao}</span>`;
  const sectionClass = headingLevel === 2 ? 'page-break' : '';
  return `<section class="${sectionClass}">
  ${headingLevel === 2 ? sectionNum : ''}
  <${h}>${escapeHtml(bloco.titulo)}</${h}>
  <p class="muted" style="font-size:9.5pt;">Total classificados: <strong>${fmtInt(bloco.totalClassificados)}</strong></p>
  ${renderMatriz3x3(bloco)}
  ${colaboradores}
</section>`;
}

function renderIntroDistribuicao(input: Snapshot9BoxTemplateInput): string {
  const total = input.blocoPrincipal.totalClassificados;
  return `<section class="page-break">
  <span class="section-num">Seção 1</span>
  <h2>Distribuição no 9-Box</h2>
  <p style="font-size:10pt;">Esta seção apresenta a distribuição dos <strong>${fmtInt(total)}</strong> colaboradores classificados no trimestre. Cada quadrante é apresentado com cor canônica da plataforma e os colaboradores são projetados por desempenho e plenitude.</p>
  ${renderBloco(input.blocoPrincipal, 'Visão geral', 3)}
</section>`;
}

function renderCapilares(input: Snapshot9BoxTemplateInput): string {
  if (input.blocosCapilares.length === 0) {
    return '';
  }
  const blocos = input.blocosCapilares
    .map((b, idx) => renderBloco(b, `Recorte ${idx + 1}`, 3))
    .join('\n');
  return `<section class="page-break">
  <span class="section-num">Seção 2</span>
  <h2>Recortes capilares</h2>
  <p style="font-size:10pt;">Detalhamento canônico do escopo em cascata — mesmo grid e mesma tabela aplicados a cada recorte interno (por departamento ou por equipe).</p>
  ${blocos}
</section>`;
}

/** Renderiza o HTML canonico do Snapshot 9-Box (ME-1.3c CC079-v2). */
export function renderSnapshot9BoxHTML(input: Snapshot9BoxTemplateInput): string {
  const bodyHtml = [renderCapa(input), renderIntroDistribuicao(input), renderCapilares(input)]
    .filter((s) => s.length > 0)
    .join('\n');
  return renderLayoutBase({
    title: `Snapshot do 9-Box`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Snapshot 9-Box · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
