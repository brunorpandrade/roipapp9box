/* eslint-disable @stylistic/max-len -- template HTML editorial com strings de layout longas */
// ROIP APP 9BOX — template PDF Snapshot 9-Box (ME-1.3c CC079-v4).
//
// Renderizacao HTML determinística do Snapshot do 9-Box (DOC 03 §13.7).
// 100% template — sem IA. Consumido por `exports.getSnapshot9Box`
// (Route Handler); convertido em PDF pelo `pdfRenderer.ts`.
//
// Estrutura CC079-v4 (editorial, espelho dos dashboards agregados):
// - Capa sem badge, sem tabela, com hero + subtitulo + card editorial.
// - Agregado empresa: pagina 1 com 9-Box em cima + texto editorial
//   embaixo; lista de colaboradores a partir da pagina seguinte,
//   ordenada por quadrante e por nome dentro de cada quadrante.
// - Agregado por departamento: pagina 1 com 9-Box do dept +
//   comparativo (mini 9-Box da empresa + texto automatico); lista do
//   dept a partir da pagina seguinte.
// - Resumao final: grade de mini 9-Boxes (um por dept + empresa em
//   destaque) + barras empilhadas horizontais com participacao
//   percentual por quadrante.
//
// Determinismo: mesmos dados -> mesmo HTML byte-exact.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { NINE_BOX_PALETTE, RADAR_COLORS } from '../../lib/svg/pdfVisualTokens';
import { escapeHtml, renderLayoutBase } from './layoutBase';

/** 9 quadrantes do DOC 03 §10.5. */
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

/** Distribuicao por quadrante (contagem absoluta). */
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

/** Bloco por escopo (empresa / departamento / equipe). */
export interface NineBoxBlocoEscopo {
  titulo: string;
  totalClassificados: number;
  distribuicao: NineBoxDistribuicao;
  colaboradores: NineBoxLinhaColaborador[];
}

/** Input do template. */
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

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '0%';
  return `${Math.round(v)}%`;
}

/** Compoe o nome do arquivo PDF (§13.7). */
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
// Ordenacao da tabela de colaboradores (preservada do CC079-v3)
// ============================================================

export const NINE_BOX_PRIORIDADE: Readonly<Record<NineBoxQuadrante, number>> = Object.freeze(
  Object.fromEntries(NINE_BOX_QUADRANTES.map((q, idx) => [q, idx])),
) as Readonly<Record<NineBoxQuadrante, number>>;

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

// ============================================================
// Grid SVG do 9-Box (CC079-v4: delicado, com destaque de centro de massa)
// ============================================================

// Ordem canonica das 9 caixas no grid 3x3 — plenitude alta no topo,
// desempenho alto a direita (DOC 05 §UI mirror).
const NINE_BOX_SVG_GRID = [
  ['POTENCIAL SUBUTILIZADO', 'DESEMPENHO REPRESADO', 'ALTO IMPACTO'],
  ['DESEMPENHO CRÍTICO', 'EQUILÍBRIO FRÁGIL', 'ALTA ENTREGA'],
  ['RISCO CRÍTICO', 'DESGASTE OCULTO', 'RISCO DE ESGOTAMENTO'],
] as const satisfies readonly (readonly NineBoxQuadrante[])[];

/**
 * Identifica os quadrantes com o maior valor da distribuicao
 * (centro(s) de massa). Centros com valor 0 nao sao destacados.
 * Retorna Set para suportar empates como destaque simultaneo.
 */
export function detectarCentrosDeMassa(distribuicao: NineBoxDistribuicao): Set<NineBoxQuadrante> {
  let max = 0;
  for (const q of NINE_BOX_QUADRANTES) {
    const v = distribuicao[q];
    if (v > max) max = v;
  }
  const centros = new Set<NineBoxQuadrante>();
  if (max === 0) return centros;
  for (const q of NINE_BOX_QUADRANTES) {
    if (distribuicao[q] === max) centros.add(q);
  }
  return centros;
}

/**
 * Renderiza o grid 9-Box como SVG inline em tamanho configuravel.
 * Padrao v4: cards arredondados pastel, numero + nome, destaque sutil
 * no(s) centro(s) de massa (borda escura + sombra interna sutil);
 * eixos como texto PLENITUDE na vertical lido de baixo para cima,
 * seta ↑ independente apontando genuinamente para cima, DESEMPENHO →
 * horizontal abaixo.
 */
export interface Render9BoxOptions {
  readonly size: 'large' | 'medium' | 'mini';
  readonly destacarCentroMassa: boolean;
}

export function renderGrid9BoxSvg(
  distribuicao: NineBoxDistribuicao,
  options: Render9BoxOptions,
): string {
  const dims =
    options.size === 'large'
      ? {
          svgWidth: 720,
          svgHeight: 720,
          originX: 70,
          originY: 10,
          gridSize: 600,
          gap: 10,
          radius: 14,
          numFontSize: 36,
          nameFontSize: 10,
          axisFontSize: 15,
          axisArrowFontSize: 20,
          axisGapX: 32,
          axisGapY: 30,
        }
      : options.size === 'medium'
        ? {
            svgWidth: 480,
            svgHeight: 480,
            originX: 50,
            originY: 10,
            gridSize: 400,
            gap: 7,
            radius: 10,
            numFontSize: 26,
            nameFontSize: 8,
            axisFontSize: 11,
            axisArrowFontSize: 15,
            axisGapX: 24,
            axisGapY: 22,
          }
        : {
            svgWidth: 240,
            svgHeight: 240,
            originX: 24,
            originY: 6,
            gridSize: 200,
            gap: 3,
            radius: 5,
            numFontSize: 15,
            nameFontSize: 5,
            axisFontSize: 6,
            axisArrowFontSize: 8,
            axisGapX: 12,
            axisGapY: 10,
          };

  const centros = options.destacarCentroMassa
    ? detectarCentrosDeMassa(distribuicao)
    : new Set<NineBoxQuadrante>();

  const cellSize = (dims.gridSize - 2 * dims.gap) / 3;
  const cellsSvg: string[] = [];
  for (let row = 0; row < 3; row++) {
    const linha = NINE_BOX_SVG_GRID[row];
    if (linha === undefined) continue;
    for (let col = 0; col < 3; col++) {
      const quadrante = linha[col];
      if (quadrante === undefined) continue;
      const paleta = NINE_BOX_PALETTE[quadrante];
      const x = dims.originX + col * (cellSize + dims.gap);
      const y = dims.originY + row * (cellSize + dims.gap);
      const cxCell = x + cellSize / 2;
      const total = fmtInt(distribuicao[quadrante]);
      const ehCentro = centros.has(quadrante);
      const nomePartes = quadrante.split(' ');
      const multilinha = options.size === 'mini' && nomePartes.length >= 2;
      let nomeSvg: string;
      if (multilinha) {
        const half = Math.ceil(nomePartes.length / 2);
        const linha1 = nomePartes.slice(0, half).join(' ');
        const linha2 = nomePartes.slice(half).join(' ');
        const line2Y = y + cellSize - dims.gap - 4;
        const line1Y = line2Y - dims.nameFontSize * 1.1;
        nomeSvg =
          `<text x="${cxCell}" y="${line1Y}" text-anchor="middle" font-size="${dims.nameFontSize}" font-weight="700" fill="${paleta.text}" letter-spacing="0.3">${escapeHtml(linha1)}</text>` +
          `<text x="${cxCell}" y="${line2Y}" text-anchor="middle" font-size="${dims.nameFontSize}" font-weight="700" fill="${paleta.text}" letter-spacing="0.3">${escapeHtml(linha2)}</text>`;
      } else {
        const nomeY = y + cellSize - dims.gap - 4;
        nomeSvg = `<text x="${cxCell}" y="${nomeY}" text-anchor="middle" font-size="${dims.nameFontSize}" font-weight="700" fill="${paleta.text}" letter-spacing="0.3">${escapeHtml(quadrante)}</text>`;
      }
      const numY = y + cellSize / 2 + dims.numFontSize * 0.35;
      const bordaStroke = ehCentro ? `stroke="${paleta.text}" stroke-width="2.5"` : 'stroke="none"';
      const shadowOverlay = ehCentro
        ? `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cellSize - 3}" height="${cellSize - 3}" rx="${dims.radius - 1}" ry="${dims.radius - 1}" fill="none" stroke="${paleta.text}" stroke-opacity="0.15" stroke-width="4" />`
        : '';
      cellsSvg.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${dims.radius}" ry="${dims.radius}" fill="${paleta.bg}" ${bordaStroke} />` +
          shadowOverlay +
          `<text x="${cxCell}" y="${numY}" text-anchor="middle" font-size="${dims.numFontSize}" font-weight="700" fill="${paleta.text}">${total}</text>` +
          nomeSvg,
      );
    }
  }

  const axisFill = RADAR_COLORS.textMuted;
  const gridEndY = dims.originY + dims.gridSize;

  const desempenhoY = gridEndY + dims.axisGapY;
  const desempenhoCx = dims.originX + dims.gridSize / 2;
  const desempenhoSvg =
    `<text x="${desempenhoCx - 8}" y="${desempenhoY}" text-anchor="end" font-size="${dims.axisFontSize}" font-weight="700" fill="${axisFill}" letter-spacing="2.5">DESEMPENHO</text>` +
    `<text x="${desempenhoCx + 4}" y="${desempenhoY}" text-anchor="start" font-size="${dims.axisArrowFontSize}" font-weight="700" fill="${axisFill}">→</text>`;

  const plenitudeX = dims.originX - dims.axisGapX;
  const plenitudeCy = dims.originY + dims.gridSize / 2;
  const plenitudeTextSvg = `<text x="${plenitudeX}" y="${plenitudeCy + 15}" text-anchor="start" font-size="${dims.axisFontSize}" font-weight="700" fill="${axisFill}" letter-spacing="2.5" transform="rotate(-90 ${plenitudeX} ${plenitudeCy})">PLENITUDE</text>`;
  const plenitudeArrowY = dims.originY + 15;
  const plenitudeArrowSvg = `<text x="${plenitudeX}" y="${plenitudeArrowY}" text-anchor="middle" font-size="${dims.axisArrowFontSize}" font-weight="700" fill="${axisFill}">↑</text>`;

  const viewBoxW = dims.svgWidth;
  const viewBoxH = dims.svgHeight;
  return `<svg viewBox="0 0 ${viewBoxW} ${viewBoxH}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; display:block;">
${cellsSvg.join('\n')}
${desempenhoSvg}
${plenitudeTextSvg}
${plenitudeArrowSvg}
</svg>`;
}

// ============================================================
// Texto automatico de comparativo dept x empresa
// ============================================================

/**
 * Paragrafo automatico ao lado do mini 9-Box da empresa, com dados
 * reais (nao inventa). Destaca os 2 maiores desvios em pontos
 * percentuais do dept frente a empresa e sinaliza concentracao
 * (centro de massa).
 */
export function composeTextoComparativoDeptEmpresa(
  dept: NineBoxBlocoEscopo,
  empresa: NineBoxBlocoEscopo,
): string {
  const totDept = dept.totalClassificados;
  const totEmp = empresa.totalClassificados;
  if (totDept === 0 || totEmp === 0) {
    return `<p>Comparativo com o agregado da empresa indisponível por falta de dados classificados.</p>`;
  }
  const centroDept = Array.from(detectarCentrosDeMassa(dept.distribuicao))[0];
  const centroEmp = Array.from(detectarCentrosDeMassa(empresa.distribuicao))[0];

  type Desvio = { quadrante: NineBoxQuadrante; pctDept: number; pctEmp: number; delta: number };
  const desvios: Desvio[] = NINE_BOX_QUADRANTES.map((q) => {
    const pctDept = (dept.distribuicao[q] / totDept) * 100;
    const pctEmp = (empresa.distribuicao[q] / totEmp) * 100;
    return { quadrante: q, pctDept, pctEmp, delta: pctDept - pctEmp };
  });
  const topDesvios = [...desvios].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);

  const linhasDesvio = topDesvios
    .map((d) => {
      if (Math.abs(d.delta) < 1) {
        return `<strong>${escapeHtml(d.quadrante)}</strong>: alinhado à empresa (${fmtPct(d.pctDept)} contra ${fmtPct(d.pctEmp)})`;
      }
      const direcao = d.delta > 0 ? 'acima' : 'abaixo';
      return `<strong>${escapeHtml(d.quadrante)}</strong>: ${fmtPct(Math.abs(d.delta))} ${direcao} da empresa (${fmtPct(d.pctDept)} contra ${fmtPct(d.pctEmp)})`;
    })
    .join('; ');

  const centroTxt =
    centroDept !== undefined && centroEmp !== undefined
      ? centroDept === centroEmp
        ? `Centro de massa coincide com o da empresa, em <strong>${escapeHtml(centroDept)}</strong>.`
        : `Centro de massa do departamento está em <strong>${escapeHtml(centroDept)}</strong>, enquanto o da empresa está em <strong>${escapeHtml(centroEmp)}</strong>.`
      : '';

  const tamanho = `Este agregado reúne <strong>${fmtInt(totDept)} colaboradores</strong>, frente aos ${fmtInt(totEmp)} do total da empresa.`;

  return `<p>${tamanho}</p><p>Maiores desvios frente à empresa: ${linhasDesvio}.</p><p>${centroTxt}</p>`;
}

// ============================================================
// Secoes editoriais
// ============================================================

function renderCapa(input: Snapshot9BoxTemplateInput): string {
  return `<section class="cover-page">
  <div class="cover-title">Snapshot<br/><span class="cover-title-accent">do 9-Box</span></div>
  <div class="cover-subtitle">${escapeHtml(input.nomeFantasia)} · ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
  <div class="cover-note" style="background:#F0FDFA; border-color:#99F6E4; color:#134E4A; margin-top:12mm;">
    <p style="margin-bottom:3mm;"><strong>Sobre este relatório.</strong> O 9-Box cruza dois eixos. No eixo horizontal, o <strong>desempenho</strong> consolida resultados de entrega. No eixo vertical, a <strong>plenitude</strong> consolida condições de sustentabilidade pessoal e profissional. O cruzamento posiciona cada colaborador em um dos nove quadrantes, do canto superior direito (Alto Impacto) ao canto inferior esquerdo (Risco Crítico).</p>
    <p style="margin-bottom:3mm;">A leitura executiva começa pela distribuição agregada da empresa inteira e desce em cascata para cada departamento. Em cada agregado, o <strong>centro de massa</strong> — o quadrante com maior concentração de colaboradores — é destacado como ponto de partida para conversas de gestão. Comparativos entre departamentos e com a empresa como um todo sinalizam onde há desvios relevantes.</p>
    <p style="margin:0;">O material serve como apoio objetivo para reuniões de desenvolvimento, calibração entre pares e decisões sobre sucessão, promoção e investimento em capacitação. A renderização é determinística: os mesmos dados geram sempre a mesma saída.</p>
  </div>
</section>`;
}

/** Pagina 1 do bloco Empresa: 9-Box em cima + texto editorial embaixo. */
function renderPaginaEmpresaResumo(bloco: NineBoxBlocoEscopo): string {
  const total = bloco.totalClassificados;
  const centros = detectarCentrosDeMassa(bloco.distribuicao);
  const centroPrincipal = Array.from(centros)[0];
  const centroNomeTxt = centroPrincipal
    ? `O centro de massa está em <strong>${escapeHtml(centroPrincipal)}</strong>, com ${fmtInt(bloco.distribuicao[centroPrincipal])} colaboradores concentrados nesse quadrante.`
    : 'Nenhum quadrante concentra colaboradores suficientes para caracterizar um centro de massa claro neste trimestre.';

  const ladoDireitoBons: NineBoxQuadrante[] = [
    'ALTO IMPACTO',
    'ALTA ENTREGA',
    'DESEMPENHO REPRESADO',
  ];
  const nosQuadrantesPositivos = ladoDireitoBons.reduce((acc, q) => acc + bloco.distribuicao[q], 0);
  const pctPositivos = total > 0 ? (nosQuadrantesPositivos / total) * 100 : 0;

  const quadrantesCriticos: NineBoxQuadrante[] = [
    'RISCO CRÍTICO',
    'RISCO DE ESGOTAMENTO',
    'DESEMPENHO CRÍTICO',
  ];
  const nosCriticos = quadrantesCriticos.reduce((acc, q) => acc + bloco.distribuicao[q], 0);
  const pctCriticos = total > 0 ? (nosCriticos / total) * 100 : 0;

  return `<section>
  <h2>Visão geral · ${escapeHtml(bloco.titulo)}</h2>
  <p class="muted" style="font-size:10pt;">Total de colaboradores classificados: <strong>${fmtInt(total)}</strong></p>
  <div style="max-width:140mm; margin:0 auto 6mm;">
    ${renderGrid9BoxSvg(bloco.distribuicao, { size: 'large', destacarCentroMassa: true })}
  </div>
  <div class="info-card" style="margin-top:4mm;">
    <p style="margin-bottom:3mm;"><strong>Leitura executiva.</strong> ${centroNomeTxt}</p>
    <p style="margin-bottom:3mm;">No conjunto dos quadrantes de desempenho alto, concentram-se <strong>${fmtPct(pctPositivos)}</strong> dos colaboradores classificados (${fmtInt(nosQuadrantesPositivos)} de ${fmtInt(total)}). Nos quadrantes mais críticos (Risco Crítico, Risco de Esgotamento e Desempenho Crítico), encontram-se <strong>${fmtPct(pctCriticos)}</strong> (${fmtInt(nosCriticos)} de ${fmtInt(total)}).</p>
    <p style="margin:0;">A seção a seguir detalha a lista nominal, ordenada do quadrante mais positivo ao mais crítico; dentro de cada quadrante, em ordem alfabética.</p>
  </div>
</section>`;
}

/** Tabela de colaboradores de um bloco — ocupa quantas paginas forem necessarias. */
function renderTabelaColaboradores(bloco: NineBoxBlocoEscopo): string {
  const ordenados = ordenarColaboradoresCanonicos(bloco.colaboradores);
  if (ordenados.length === 0) {
    return '<p class="muted">Sem colaboradores classificados neste escopo.</p>';
  }
  const rows = ordenados
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
    .join('\n');
  return `<table class="data-table" style="page-break-inside:auto;">
  <thead>
    <tr>
      <th>Colaborador</th>
      <th>Departamento</th>
      <th class="right">Desempenho</th>
      <th class="right">Plenitude</th>
      <th>Quadrante</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

/** Pagina 1 de cada bloco de departamento: 9-Box + comparativo com empresa. */
function renderPaginaDeptResumo(dept: NineBoxBlocoEscopo, empresa: NineBoxBlocoEscopo): string {
  return `<section>
  <h2>${escapeHtml(dept.titulo)}</h2>
  <p class="muted" style="font-size:10pt;">Total de colaboradores classificados: <strong>${fmtInt(dept.totalClassificados)}</strong></p>
  <div style="max-width:140mm; margin:0 auto 6mm;">
    ${renderGrid9BoxSvg(dept.distribuicao, { size: 'medium', destacarCentroMassa: true })}
  </div>
  <h3 style="margin-top:6mm;">Comparativo com a empresa</h3>
  <div class="dept-vs-empresa">
    <div class="mini-empresa">
      <div style="font-size:9pt; color:#6B7280; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2mm; text-align:center;">${escapeHtml(empresa.titulo)}</div>
      ${renderGrid9BoxSvg(empresa.distribuicao, { size: 'mini', destacarCentroMassa: true })}
    </div>
    <div class="texto-comparativo">
      ${composeTextoComparativoDeptEmpresa(dept, empresa)}
    </div>
  </div>
</section>`;
}

/** Pagina da lista de colaboradores de cada bloco (empresa ou dept). */
function renderPaginaListaColaboradores(bloco: NineBoxBlocoEscopo): string {
  return `<section class="page-break">
  <h2>Colaboradores · ${escapeHtml(bloco.titulo)}</h2>
  ${renderTabelaColaboradores(bloco)}
</section>`;
}

// ============================================================
// Resumao comparativo final
// ============================================================

/** Grade de mini 9-Boxes: empresa em destaque + um por departamento. */
function renderMiniGridResumo(input: Snapshot9BoxTemplateInput): string {
  const miniEmpresa = `<div class="mini-empresa-destaque">
    <div class="mini-titulo">${escapeHtml(input.blocoPrincipal.titulo)} · ${fmtInt(input.blocoPrincipal.totalClassificados)}</div>
    ${renderGrid9BoxSvg(input.blocoPrincipal.distribuicao, { size: 'mini', destacarCentroMassa: true })}
  </div>`;
  const miniDepts = input.blocosCapilares
    .map(
      (b) =>
        `<div>
      <div class="mini-titulo">${escapeHtml(b.titulo)} · ${fmtInt(b.totalClassificados)}</div>
      ${renderGrid9BoxSvg(b.distribuicao, { size: 'mini', destacarCentroMassa: true })}
    </div>`,
    )
    .join('\n');
  return `<div class="mini-grid-row">
    ${miniEmpresa}
    ${miniDepts}
  </div>`;
}

/** Barras empilhadas horizontais por bloco (empresa + um por dept). */
function renderBarrasEmpilhadas(input: Snapshot9BoxTemplateInput): string {
  const todosBlocos: NineBoxBlocoEscopo[] = [input.blocoPrincipal, ...input.blocosCapilares];
  const linhas = todosBlocos
    .map((b) => {
      if (b.totalClassificados === 0) {
        return `<div class="stacked-bar-row">
    <div class="nome-depto">${escapeHtml(b.titulo)}</div>
    <div class="barra-wrap" style="background:#F3F4F6;"></div>
    <div class="total-depto">0</div>
  </div>`;
      }
      const segmentos = NINE_BOX_QUADRANTES.map((q) => {
        const n = b.distribuicao[q];
        if (n === 0) return '';
        const pct = (n / b.totalClassificados) * 100;
        const paleta = NINE_BOX_PALETTE[q];
        return `<div class="barra-seg" style="flex:${pct.toFixed(2)}; background:${paleta.text};">${n}</div>`;
      })
        .filter((s) => s.length > 0)
        .join('');
      return `<div class="stacked-bar-row">
    <div class="nome-depto">${escapeHtml(b.titulo)}</div>
    <div class="barra-wrap">${segmentos}</div>
    <div class="total-depto">${fmtInt(b.totalClassificados)}</div>
  </div>`;
    })
    .join('\n');
  const legenda = NINE_BOX_QUADRANTES.map(
    (q) =>
      `<div class="leg-item"><span class="leg-swatch" style="background:${NINE_BOX_PALETTE[q].text};"></span>${escapeHtml(q)}</div>`,
  ).join('');
  return `<div style="margin-top:6mm;">
    ${linhas}
    <div class="legenda-quadrantes" style="margin-top:4mm;">${legenda}</div>
  </div>`;
}

function renderResumaoFinal(input: Snapshot9BoxTemplateInput): string {
  if (input.blocosCapilares.length === 0) {
    return '';
  }
  return `<section class="page-break">
  <h2>Resumão comparativo</h2>
  <p style="font-size:10pt;">Visão consolidada da empresa frente a cada departamento. A grade superior mostra os nove quadrantes lado a lado em cada agregado. As barras inferiores apresentam a distribuição percentual por quadrante em cada agregado, do mais positivo (Alto Impacto, à esquerda) ao mais crítico (Risco Crítico, à direita).</p>
  <h3 style="margin-top:5mm;">Distribuição por quadrante · cada agregado</h3>
  ${renderMiniGridResumo(input)}
  <h3 style="margin-top:8mm;">Participação relativa por quadrante</h3>
  ${renderBarrasEmpilhadas(input)}
  <p class="muted" style="font-size:9pt; margin-top:5mm;">Cada barra reflete 100% dos colaboradores classificados do agregado correspondente. Segmentos extremamente pequenos podem não ter o número visível.</p>
</section>`;
}

/** Renderiza o HTML do Snapshot 9-Box (ME-1.3c CC079-v4). */
export function renderSnapshot9BoxHTML(input: Snapshot9BoxTemplateInput): string {
  const partes: string[] = [];
  partes.push(renderCapa(input));
  partes.push(
    `<section class="page-break">${renderPaginaEmpresaResumo(input.blocoPrincipal)}</section>`,
  );
  partes.push(renderPaginaListaColaboradores(input.blocoPrincipal));
  for (const dept of input.blocosCapilares) {
    partes.push(
      `<section class="page-break">${renderPaginaDeptResumo(dept, input.blocoPrincipal)}</section>`,
    );
    partes.push(renderPaginaListaColaboradores(dept));
  }
  const resumao = renderResumaoFinal(input);
  if (resumao.length > 0) partes.push(resumao);

  const bodyHtml = partes.join('\n');
  return renderLayoutBase({
    title: 'Snapshot do 9-Box',
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Snapshot 9-Box · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
