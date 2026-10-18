/* eslint-disable @stylistic/max-len -- template HTML editorial com strings de layout longas */
// ROIP APP 9BOX — template PDF Snapshot 9-Box (ME-1.3c-Snapshot v1).
//
// Renderizacao HTML deterministica do Snapshot do 9-Box (DOC 03 §13.7).
// 100% template — sem IA. Consumido por `exports.getSnapshot9Box`
// (Route Handler); convertido em PDF pelo `pdfRenderer.ts`.
//
// v1 adota o padrao canonico do Radar NR-1 (ME-1.3c CC079-v7.x) como
// linguagem comum de todos os PDFs ROIP:
// - Capa: hero em 2 linhas canonicas (preto bold + teal), logo canto
//   superior direito, meta grid card, nota ambar "Sobre este relatorio",
//   resumo executivo com 3 KPI cards + gauge semicircular do perfil.
// - Secoes com H2 preto bold + underline teal 2pt.
// - Matriz 9-Box dentro de card emoldurado (.radar-block).
// - Pagina de departamento em UMA pagina (matriz + comparativo + mini
//   matriz empresa + texto, tudo cabivel em A4 sem corte).
// - Resumao com texto introdutorio canonico + legenda completa dos 9
//   quadrantes cabivel na mesma pagina das barras.
// - Rastreabilidade e integridade final em card cinza.
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

/**
 * Deriva a data civil (YYYY-MM-DD) em America/Sao_Paulo a partir do
 * timestamp ISO UTC — espelho do helper canonico do Radar NR-1 v7.1.
 * Debito D-DUP-DATA registrado para extracao futura em helper comum.
 */
function dataCivilBrtFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const partes = d
    .toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .split('/');
  if (partes.length !== 3) return iso;
  const [dd, mm, yyyy] = partes;
  return `${yyyy}-${mm}-${dd}`;
}

function formatDataEditorial(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) return iso;
  const [, y, m, d] = match;
  if (y === undefined || m === undefined || d === undefined) return iso;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return iso;
  const mesNome = MESES_PT_BR[mi];
  if (mesNome === undefined) return iso;
  return `${Number(d)} de ${mesNome} de ${y}`;
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
// Ordenacao canonica (preservada do CC079-v3)
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
// Grid SVG do 9-Box (preservado + ajuste de tamanhos)
// ============================================================

const NINE_BOX_SVG_GRID = [
  ['POTENCIAL SUBUTILIZADO', 'DESEMPENHO REPRESADO', 'ALTO IMPACTO'],
  ['DESEMPENHO CRÍTICO', 'EQUILÍBRIO FRÁGIL', 'ALTA ENTREGA'],
  ['RISCO CRÍTICO', 'DESGASTE OCULTO', 'RISCO DE ESGOTAMENTO'],
] as const satisfies readonly (readonly NineBoxQuadrante[])[];

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
      const multilinha = options.size !== 'large' && nomePartes.length >= 2;
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
// Perfil derivado da empresa (para KPIs e gauge do resumo executivo)
// ============================================================

interface PerfilEmpresa {
  readonly centroPrincipal: NineBoxQuadrante | undefined;
  readonly centroCount: number;
  readonly pctPositivos: number;
  readonly countPositivos: number;
  readonly pctCriticos: number;
  readonly countCriticos: number;
  readonly faixa: 'verde' | 'amarelo' | 'vermelho';
}

const QUADRANTES_POSITIVOS: readonly NineBoxQuadrante[] = [
  'ALTO IMPACTO',
  'ALTA ENTREGA',
  'DESEMPENHO REPRESADO',
];
const QUADRANTES_CRITICOS: readonly NineBoxQuadrante[] = [
  'RISCO CRÍTICO',
  'RISCO DE ESGOTAMENTO',
  'DESEMPENHO CRÍTICO',
];

function derivarPerfilEmpresa(bloco: NineBoxBlocoEscopo): PerfilEmpresa {
  const total = bloco.totalClassificados;
  const centros = detectarCentrosDeMassa(bloco.distribuicao);
  const centroPrincipal = Array.from(centros)[0];
  const centroCount = centroPrincipal ? bloco.distribuicao[centroPrincipal] : 0;
  const countPositivos = QUADRANTES_POSITIVOS.reduce((acc, q) => acc + bloco.distribuicao[q], 0);
  const pctPositivos = total > 0 ? (countPositivos / total) * 100 : 0;
  const countCriticos = QUADRANTES_CRITICOS.reduce((acc, q) => acc + bloco.distribuicao[q], 0);
  const pctCriticos = total > 0 ? (countCriticos / total) * 100 : 0;
  const faixa: PerfilEmpresa['faixa'] =
    pctPositivos >= 60 ? 'verde' : pctPositivos >= 40 ? 'amarelo' : 'vermelho';
  return {
    centroPrincipal,
    centroCount,
    pctPositivos,
    countPositivos,
    pctCriticos,
    countCriticos,
    faixa,
  };
}

// ============================================================
// Gauge semicircular (resumo executivo — padrao canonico Radar NR-1)
// ============================================================

function renderGaugeSvg(percent: number, faixa: 'verde' | 'amarelo' | 'vermelho'): string {
  const clamp = Math.max(0, Math.min(100, percent));
  const color = faixa === 'verde' ? '#16A34A' : faixa === 'amarelo' ? '#D97706' : '#DC2626';
  const angle = Math.PI - (clamp / 100) * Math.PI;
  const endX = 110 + 90 * Math.cos(angle);
  const endY = 120 - 90 * Math.sin(angle);
  const largeArc = clamp > 50 ? 1 : 0;
  const label = `${Math.round(clamp)}%`;
  return `<svg width="140" height="90" viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 120 A 90 90 0 0 1 200 120" fill="none" stroke="#F3F4F6" stroke-width="16" stroke-linecap="round"/>
  <path d="M 20 120 A 90 90 ${largeArc} 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
  <text x="110" y="115" font-family="Liberation Sans, system-ui, sans-serif" font-size="34" font-weight="700" fill="#111827" text-anchor="middle">${label}</text>
</svg>`;
}

// ============================================================
// Secoes canonicas v1
// ============================================================

/**
 * Pagina 1 — Capa + Resumo executivo (padrao canonico Radar NR-1 v7.1).
 *
 * Hero em 2 linhas canonicas (preto bold + teal), logo canto superior
 * direito via layoutBase, meta grid com 4 chaves, nota ambar "Sobre
 * este relatorio", H2 "Resumo executivo" + 3 KPI cards + gauge do
 * perfil do portfolio, tudo na mesma A4.
 */
function renderCapaMaisResumo(input: Snapshot9BoxTemplateInput): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const perfil = derivarPerfilEmpresa(input.blocoPrincipal);
  const highlightClass =
    perfil.faixa === 'verde'
      ? 'highlight-green'
      : perfil.faixa === 'amarelo'
        ? 'highlight-yellow'
        : 'highlight-red';
  const valueClass =
    perfil.faixa === 'verde' ? 'green' : perfil.faixa === 'amarelo' ? 'yellow' : 'red';
  const gaugeTitulo =
    perfil.faixa === 'verde'
      ? 'Perfil saudável'
      : perfil.faixa === 'amarelo'
        ? 'Perfil misto'
        : 'Perfil preocupante';
  const gaugeBody =
    perfil.faixa === 'verde'
      ? 'A maior parte dos colaboradores classificados está nos quadrantes de desempenho alto. Portfólio sustenta decisões de desenvolvimento, sucessão e investimento com segurança.'
      : perfil.faixa === 'amarelo'
        ? 'A concentração nos quadrantes positivos é moderada. Vale investigar os departamentos com maior dispersão e priorizar conversas de calibração antes do próximo ciclo.'
        : 'A maioria dos colaboradores está em quadrantes de equilíbrio frágil ou crítico. Recomenda-se investigação prioritária com liderança operacional e revisão das rotinas de gestão.';

  // KPI de criticos é alertante quando ≥ 10%.
  const criticoAlertante = perfil.pctCriticos >= 10;

  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Snapshot</div>
    <div class="cover-title-line2">do 9-Box</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Trimestre</span><span class="cover-meta-value">${escapeHtml(formatTrimestreBR(input.trimestre))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Escopo</span><span class="cover-meta-value">${escapeHtml(input.escopoRotulo)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> o 9-Box cruza desempenho e plenitude para posicionar cada colaborador em um dos nove quadrantes. A leitura começa pela distribuição agregada da empresa e desce em cascata para cada departamento. O centro de massa — quadrante com maior concentração — é o ponto de partida para conversas de gestão. Material deterministicamente derivado dos dados do ciclo; mesmos dados geram sempre a mesma saída.
  </div>
  <h2 class="h2-compact">Resumo executivo</h2>
  <p class="resumo-exec-paragrafo">${fmtInt(input.blocoPrincipal.totalClassificados)} colaborador(es) classificado(s) no ciclo${perfil.centroPrincipal ? `, com centro de massa em <strong>${escapeHtml(perfil.centroPrincipal)}</strong>` : ''}.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Classificados</div>
      <div class="kpi-value">${fmtInt(input.blocoPrincipal.totalClassificados)}</div>
      <div class="kpi-sub">${input.blocosCapilares.length} departamento(s) com visão própria</div>
    </div>
    <div class="kpi-card ${highlightClass}">
      <div class="kpi-label">Em quadrantes positivos</div>
      <div class="kpi-value ${valueClass}">${fmtPct(perfil.pctPositivos)}</div>
      <div class="kpi-sub">${fmtInt(perfil.countPositivos)} em Alto Impacto, Alta Entrega ou Desempenho Represado</div>
    </div>
    <div class="kpi-card ${criticoAlertante ? 'highlight-red' : ''}">
      <div class="kpi-label">Em quadrantes críticos</div>
      <div class="kpi-value ${criticoAlertante ? 'red' : ''}">${fmtPct(perfil.pctCriticos)}</div>
      <div class="kpi-sub">${fmtInt(perfil.countCriticos)} em Risco Crítico, Risco de Esgotamento ou Desempenho Crítico</div>
    </div>
  </div>
  <div class="gauge-wrap">
    ${renderGaugeSvg(perfil.pctPositivos, perfil.faixa)}
    <div>
      <div class="gauge-info-title cs-${perfil.faixa === 'verde' ? 'green' : perfil.faixa === 'amarelo' ? 'yellow' : 'red'}">${gaugeTitulo}</div>
      <div class="gauge-info-body">${gaugeBody}</div>
    </div>
  </div>
</section>`;
}

/**
 * Pagina 2 — Visao geral da empresa: matriz 9-Box dentro de card
 * emoldurado (.radar-block) + card de leitura executiva.
 */
function renderPaginaEmpresaResumo(bloco: NineBoxBlocoEscopo): string {
  const perfil = derivarPerfilEmpresa(bloco);
  const centroTxt = perfil.centroPrincipal
    ? `O centro de massa está em <strong>${escapeHtml(perfil.centroPrincipal)}</strong>, com ${fmtInt(perfil.centroCount)} colaborador(es) concentrado(s) nesse quadrante.`
    : 'Nenhum quadrante concentra colaboradores suficientes para caracterizar um centro de massa claro neste trimestre.';

  return `<section class="page-break">
  <h2>Visão geral — ${escapeHtml(bloco.titulo)}</h2>
  <p>Distribuição consolidada dos ${fmtInt(bloco.totalClassificados)} colaboradores classificados no ciclo. O quadrante com maior concentração é destacado com borda escura.</p>
  <div class="radar-block">
    <div class="radar-block-head">
      <span class="radar-block-title">${escapeHtml(bloco.titulo)}</span>
      <span class="radar-block-subtitle">${fmtInt(bloco.totalClassificados)} colaborador(es) classificado(s)</span>
    </div>
    <div style="max-width:140mm; margin:0 auto;">
      ${renderGrid9BoxSvg(bloco.distribuicao, { size: 'large', destacarCentroMassa: true })}
    </div>
  </div>
  <div class="info-card">
    <p><strong>Leitura executiva.</strong> ${centroTxt}</p>
    <p>Nos quadrantes de desempenho alto (Alto Impacto, Alta Entrega e Desempenho Represado), concentram-se <strong>${fmtPct(perfil.pctPositivos)}</strong> dos classificados (${fmtInt(perfil.countPositivos)} de ${fmtInt(bloco.totalClassificados)}). Nos quadrantes mais críticos (Risco Crítico, Risco de Esgotamento e Desempenho Crítico), encontram-se <strong>${fmtPct(perfil.pctCriticos)}</strong> (${fmtInt(perfil.countCriticos)} de ${fmtInt(bloco.totalClassificados)}).</p>
    <p style="margin:0;">A seção a seguir detalha a lista nominal, ordenada do quadrante mais positivo ao mais crítico; dentro de cada quadrante, em ordem alfabética.</p>
  </div>
</section>`;
}

/** Tabela de colaboradores (preservada com polish editorial). */
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

/**
 * Pagina de departamento (CANONICA v1): matriz dept + "Comparativo com
 * a empresa" com mini-matriz à esquerda e texto à direita, tudo em UMA
 * pagina sem corte. Preserva page-break-inside: avoid.
 */
function renderPaginaDeptResumo(dept: NineBoxBlocoEscopo, empresa: NineBoxBlocoEscopo): string {
  return `<section class="page-break">
  <div class="ninebox-dept-page">
    <h2>9-Box por departamento — ${escapeHtml(dept.titulo)}</h2>
    <p>Distribuição dos ${fmtInt(dept.totalClassificados)} colaborador(es) do departamento comparada com a média da empresa. O quadrante com maior concentração é destacado com borda escura.</p>
    <div class="radar-block">
      <div class="radar-block-head">
        <span class="radar-block-title">${escapeHtml(dept.titulo)}</span>
        <span class="radar-block-subtitle">${fmtInt(dept.totalClassificados)} colaborador(es) classificado(s)</span>
      </div>
      <div style="max-width:120mm; margin:0 auto;">
        ${renderGrid9BoxSvg(dept.distribuicao, { size: 'medium', destacarCentroMassa: true })}
      </div>
    </div>
    <div class="ninebox-comparativo-wrap">
      <div class="ninebox-comparativo-head">Comparativo com a empresa</div>
      <div class="ninebox-comparativo-row">
        <div class="ninebox-comparativo-mini">
          <div class="ninebox-comparativo-mini-title">${escapeHtml(empresa.titulo)}</div>
          ${renderGrid9BoxSvg(empresa.distribuicao, { size: 'mini', destacarCentroMassa: true })}
        </div>
        <div class="ninebox-comparativo-texto">
          ${composeTextoComparativoDeptEmpresa(dept, empresa)}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function renderPaginaListaColaboradores(bloco: NineBoxBlocoEscopo): string {
  return `<section class="page-break">
  <h2>Colaboradores — ${escapeHtml(bloco.titulo)}</h2>
  ${renderTabelaColaboradores(bloco)}
</section>`;
}

// ============================================================
// Resumao comparativo final (grid mini + barras empilhadas)
// ============================================================

function renderMiniGridResumo(input: Snapshot9BoxTemplateInput): string {
  const miniEmpresa = `<div class="ninebox-mini-cell destaque">
    <div class="ninebox-mini-cell-title">${escapeHtml(input.blocoPrincipal.titulo)} · ${fmtInt(input.blocoPrincipal.totalClassificados)}</div>
    ${renderGrid9BoxSvg(input.blocoPrincipal.distribuicao, { size: 'mini', destacarCentroMassa: true })}
  </div>`;
  const miniDepts = input.blocosCapilares
    .map(
      (b) =>
        `<div class="ninebox-mini-cell">
      <div class="ninebox-mini-cell-title">${escapeHtml(b.titulo)} · ${fmtInt(b.totalClassificados)}</div>
      ${renderGrid9BoxSvg(b.distribuicao, { size: 'mini', destacarCentroMassa: true })}
    </div>`,
    )
    .join('\n');
  return `<div class="ninebox-mini-grid">
    ${miniEmpresa}
    ${miniDepts}
  </div>`;
}

function renderBarrasEmpilhadas(input: Snapshot9BoxTemplateInput): string {
  const todosBlocos: NineBoxBlocoEscopo[] = [input.blocoPrincipal, ...input.blocosCapilares];
  const linhas = todosBlocos
    .map((b) => {
      if (b.totalClassificados === 0) {
        return `<div class="ninebox-stacked-bar-row">
    <div class="ninebox-stacked-bar-label">${escapeHtml(b.titulo)}</div>
    <div class="ninebox-stacked-bar-wrap"></div>
    <div class="ninebox-stacked-bar-total">0</div>
  </div>`;
      }
      const segmentos = NINE_BOX_QUADRANTES.map((q) => {
        const n = b.distribuicao[q];
        if (n === 0) return '';
        const pct = (n / b.totalClassificados) * 100;
        const paleta = NINE_BOX_PALETTE[q];
        return `<div class="ninebox-stacked-bar-seg" style="flex:${pct.toFixed(2)}; background:${paleta.text};">${n}</div>`;
      })
        .filter((s) => s.length > 0)
        .join('');
      return `<div class="ninebox-stacked-bar-row">
    <div class="ninebox-stacked-bar-label">${escapeHtml(b.titulo)}</div>
    <div class="ninebox-stacked-bar-wrap">${segmentos}</div>
    <div class="ninebox-stacked-bar-total">${fmtInt(b.totalClassificados)}</div>
  </div>`;
    })
    .join('\n');
  const legenda = NINE_BOX_QUADRANTES.map(
    (q) =>
      `<div class="leg-item"><span class="leg-swatch" style="background:${NINE_BOX_PALETTE[q].text};"></span>${escapeHtml(q)}</div>`,
  ).join('');
  return `<div>
    ${linhas}
    <div class="ninebox-legend-full">${legenda}</div>
  </div>`;
}

function renderResumaoFinal(input: Snapshot9BoxTemplateInput): string {
  if (input.blocosCapilares.length === 0) {
    return '';
  }
  return `<section class="page-break">
  <h2>Resumão comparativo</h2>
  <p>Visão consolidada da empresa frente a cada departamento. A grade abaixo mostra os nove quadrantes lado a lado em cada agregado — a empresa aparece em destaque teal.</p>
  <h3>Distribuição por quadrante · cada agregado</h3>
  ${renderMiniGridResumo(input)}
  <h3>Participação relativa por quadrante</h3>
  <div class="ninebox-nota-intro">
    <strong>Como ler.</strong> Cada barra representa 100% dos colaboradores classificados do agregado correspondente, segmentada por quadrante na mesma ordem — do mais positivo (Alto Impacto, à esquerda) ao mais crítico (Risco Crítico, à direita). A comparação visual entre as linhas revela onde cada departamento se afasta do perfil da empresa como um todo.
  </div>
  ${renderBarrasEmpilhadas(input)}
  <p class="muted" style="font-size:9pt; margin-top:4mm;">Segmentos extremamente pequenos podem não exibir o número por falta de espaço horizontal.</p>
</section>`;
}

/**
 * Pagina final — Rastreabilidade e integridade do relatorio (padrao
 * canonico do Radar NR-1 p.17). Metadata chave:valor em card cinza +
 * nota final em prosa curta. Timestamp em fuso BRT.
 */
function renderRastreabilidade(input: Snapshot9BoxTemplateInput): string {
  const totalBlocos = 1 + input.blocosCapilares.length;
  const totalColaboradores = input.blocoPrincipal.totalClassificados;
  const timestampBrt = toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso;
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="rastreabilidade-card">
    <div class="rastreabilidade-row"><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</div>
    <div class="rastreabilidade-row"><strong>Trimestre:</strong> ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
    <div class="rastreabilidade-row"><strong>Escopo:</strong> ${escapeHtml(input.escopoRotulo)}</div>
    <div class="rastreabilidade-row"><strong>Agregados renderizados:</strong> ${fmtInt(totalBlocos)} (empresa + ${fmtInt(input.blocosCapilares.length)} departamento(s))</div>
    <div class="rastreabilidade-row"><strong>Colaboradores classificados:</strong> ${fmtInt(totalColaboradores)}</div>
    <div class="rastreabilidade-row"><strong>Gerado em:</strong> ${escapeHtml(timestampBrt)}</div>
  </div>
  <p class="rastreabilidade-nota"><strong>Nota final.</strong> O trimestre, uma vez fechado, é imutável. Este relatório pode ser regerado a qualquer momento a partir da base de dados original, apresentando idêntico conteúdo.</p>
</section>`;
}

/** Renderiza o HTML do Snapshot 9-Box (ME-1.3c-Snapshot v1). */
export function renderSnapshot9BoxHTML(input: Snapshot9BoxTemplateInput): string {
  const partes: string[] = [];
  partes.push(renderCapaMaisResumo(input));
  partes.push(renderPaginaEmpresaResumo(input.blocoPrincipal));
  partes.push(renderPaginaListaColaboradores(input.blocoPrincipal));
  for (const dept of input.blocosCapilares) {
    partes.push(renderPaginaDeptResumo(dept, input.blocoPrincipal));
    partes.push(renderPaginaListaColaboradores(dept));
  }
  const resumao = renderResumaoFinal(input);
  if (resumao.length > 0) partes.push(resumao);
  partes.push(renderRastreabilidade(input));

  const bodyHtml = partes.join('\n');
  return renderLayoutBase({
    title: 'Snapshot do 9-Box',
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Snapshot 9-Box · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
