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

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { projectNineBoxBubble } from '../../lib/svg/pdfSvgHelpers';
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
  <p><strong>Trimestre:</strong> ${escapeHtml(formatTrimestreBR(input.trimestre))}</p>
  <p><strong>Escopo:</strong> ${escopo}</p>
  <p><strong>Data de geração:</strong> ${escapeHtml(toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso)}</p>
  <p class="muted">Este relatório apresenta a distribuição dos colaboradores no 9-Box calculada no trimestre. Estritamente determinístico — sem participação de IA.</p>
</section>`;
}

// ============================================================
// Grid SVG canonico do 9-Box (ME-1.3c)
// ============================================================

// Geometria canonica do SVG do 9-Box. viewBox 720x720; grid 600x600
// com margens 60/60 para espaco de rotulos de eixo.
const NINE_BOX_SVG_ORIGIN_X = 60;
const NINE_BOX_SVG_ORIGIN_Y = 60;
const NINE_BOX_SVG_GRID_SIZE = 600;

// Ordem canonica das 9 caixas no grid 3x3 — espelho visual da UI
// canonica (`NINE_BOX_GRID` em
// `src/app/dashboard-individual/[id]/internals.ts:178-194`).
// Row 0 = plenitude ALTA (topo); Row 2 = plenitude BAIXA (fundo).
// Col 0 = desempenho BAIXO (esquerda); Col 2 = desempenho ALTO (dir).
const NINE_BOX_SVG_GRID = [
  ['POTENCIAL SUBUTILIZADO', 'DESEMPENHO REPRESADO', 'ALTO IMPACTO'],
  ['DESEMPENHO CRÍTICO', 'EQUILÍBRIO FRÁGIL', 'ALTA ENTREGA'],
  ['RISCO CRÍTICO', 'DESGASTE OCULTO', 'RISCO DE ESGOTAMENTO'],
] as const satisfies readonly (readonly NineBoxQuadrante[])[];

/** Rotulo curto canonico de iniciais do colaborador para a bolha. */
function initialsFor(nome: string): string {
  const parts = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const first = parts[0];
  if (first === undefined) {
    return '?';
  }
  const last = parts[parts.length - 1];
  if (parts.length === 1 || last === undefined) {
    return first.slice(0, 2).toUpperCase();
  }
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Celulas coloridas 3x3 do grid canonico. */
function renderNineBoxGridCells(distribuicao: NineBoxDistribuicao): string {
  const cellSize = NINE_BOX_SVG_GRID_SIZE / 3;
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
      const x = NINE_BOX_SVG_ORIGIN_X + col * cellSize;
      const y = NINE_BOX_SVG_ORIGIN_Y + row * cellSize;
      const labelX = x + cellSize / 2;
      const labelY = y + 24;
      const countY = y + cellSize - 16;
      const total = fmtInt(distribuicao[quadrante]);
      cells.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" ` +
          `fill="${paleta.bg}" stroke="#FFFFFF" stroke-width="3" />` +
          `<text x="${labelX}" y="${labelY}" text-anchor="middle" ` +
          `font-size="12" font-weight="700" fill="${paleta.text}">` +
          `${escapeHtml(quadrante)}</text>` +
          `<text x="${labelX}" y="${countY}" text-anchor="middle" ` +
          `font-size="22" font-weight="700" fill="${paleta.text}">${total}</text>`,
      );
    }
  }
  return cells.join('\n');
}

/** Bolhas dos colaboradores projetadas pelo helper canonico. */
function renderNineBoxBubbles(colaboradores: readonly NineBoxLinhaColaborador[]): string {
  const bolhas = colaboradores
    .filter((c) => c.scoreDesempenho !== null && c.plenitudeScore !== null)
    .map((c) => {
      const b = projectNineBoxBubble(
        c.scoreDesempenho ?? 0,
        c.plenitudeScore ?? 0,
        NINE_BOX_SVG_ORIGIN_X,
        NINE_BOX_SVG_ORIGIN_Y,
        NINE_BOX_SVG_GRID_SIZE,
      );
      const paleta = NINE_BOX_PALETTE[c.quadrante];
      const initials = escapeHtml(initialsFor(c.nome));
      const title = escapeHtml(`${c.nome} · ${c.quadrante}`);
      return (
        `<g><title>${title}</title>` +
        `<circle cx="${b.cx.toFixed(2)}" cy="${b.cy.toFixed(2)}" r="14" ` +
        `fill="${paleta.text}" fill-opacity="0.92" stroke="#FFFFFF" stroke-width="2" />` +
        `<text x="${b.cx.toFixed(2)}" y="${(b.cy + 4).toFixed(2)}" text-anchor="middle" ` +
        `font-size="10" font-weight="700" fill="#FFFFFF">${initials}</text>` +
        `</g>`
      );
    });
  return bolhas.join('\n');
}

/** Rotulos canonicos de eixo do grid (desempenho em X, plenitude em Y). */
function renderNineBoxAxisLabels(): string {
  const originX = NINE_BOX_SVG_ORIGIN_X;
  const originY = NINE_BOX_SVG_ORIGIN_Y;
  const size = NINE_BOX_SVG_GRID_SIZE;
  const cell = size / 3;
  const cx = (col: number): number => originX + cell * (col + 0.5);
  const cy = (row: number): number => originY + cell * (row + 0.5);
  const labelY = originY + size + 32;
  const labelX = originX - 16;
  const labelFill = RADAR_COLORS.labelFill;
  const labels: string[] = [];
  labels.push(
    `<text x="${cx(0)}" y="${labelY}" text-anchor="middle" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Desempenho baixo</text>`,
    `<text x="${cx(1)}" y="${labelY}" text-anchor="middle" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Desempenho médio</text>`,
    `<text x="${cx(2)}" y="${labelY}" text-anchor="middle" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Desempenho alto</text>`,
  );
  labels.push(
    `<text x="${labelX}" y="${cy(0)}" text-anchor="end" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Plenitude alta</text>`,
    `<text x="${labelX}" y="${cy(1)}" text-anchor="end" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Plenitude média</text>`,
    `<text x="${labelX}" y="${cy(2)}" text-anchor="end" ` +
      `font-size="11" font-weight="600" fill="${labelFill}">Plenitude baixa</text>`,
  );
  return labels.join('\n');
}

/**
 * Renderiza o grid 9-Box canonico como SVG inline (ME-1.3c). Grid
 * colorido 3x3 com cores canonicas espelhadas da UI
 * (`NINE_BOX_PALETTE`) + bolhas dos colaboradores projetadas por
 * `projectNineBoxBubble` + rotulos canonicos de eixo.
 */
function renderMatriz3x3(bloco: NineBoxBlocoEscopo): string {
  const svgWidth = NINE_BOX_SVG_ORIGIN_X * 2 + NINE_BOX_SVG_GRID_SIZE;
  const svgHeight = NINE_BOX_SVG_ORIGIN_Y + NINE_BOX_SVG_GRID_SIZE + 48;
  return (
    `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" ` +
    `xmlns="http://www.w3.org/2000/svg" ` +
    `style="width:100%; max-width:160mm; height:auto; display:block; margin:0 auto 6mm;">
${renderNineBoxGridCells(bloco.distribuicao)}
${renderNineBoxAxisLabels()}
${renderNineBoxBubbles(bloco.colaboradores)}
</svg>`
  );
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
    title: `Snapshot do 9-Box · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
