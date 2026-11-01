/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Board deck (ME-053, S275;
// ME-1.3d-REV DIS-C redesign McKinsey/BCG).
//
// Renderizacao HTML deterministica do Board deck (DOC 03 §13.8).
// 4 elementos canonicos: Distribuicao 9-Box, ROI agregado, Radar de
// riscos psicossociais (NR-1), Turnover. Escopo: empresa ou
// departamento (sem equipe).
//
// ME-1.3d-REV DIS-C (01/11/2026) — redesign estrutural padrao
// consultoria estrategica:
// - Capa + tese canonica + 3 achados principais ✦.
// - Pagina 9-Box em UMA A4 (matriz compacta + tabela 9 linhas, fix
//   D-BOARD-9BOX-QUEBRA).
// - Alinhamento canonico das colunas da tabela com os cabecalhos.
// - ROI + Turnover unificados em UMA A4; KPIs de ROI sem subtextos.
// - Turnover com texto introdutorio enxuto; 4 KPI cards com p.p.
//   como valor principal e variacao relativa (%) como subtexto do
//   card de variacao vs trim. anterior.
// - Fix D-CONCORDANCIA-SAIDAS: "1 saida" em singular.
// - Boxes horizontais para voluntarias/involuntarias e para nivel
//   hierarquico (3 cards lado a lado).
// - Radar NR-1 em UMA A4 (SVG + tabela com cor por valor e top 3
//   fatores de risco destacados), sem texto introdutorio.
// - Nova pagina de proximos passos canonicos (3 recomendacoes
//   derivadas deterministicamente dos dados do deck).

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  classificarTipoFatorRadar,
  coresCanonicasPorFaixa,
  faixaFatorRadar,
  faixaRoi,
  faixaTurnover,
} from '../../lib/semaforo/faixasCanonicas';
import {
  projectRadarPoint,
  projectRadarPolygon,
  renderRadarGridSvg,
} from '../../lib/svg/pdfSvgHelpers';
import { RADAR_COLORS, RADAR_NR1_CORES } from '../../lib/svg/pdfVisualTokens';
import { pluralSaida } from '../../lib/text/plurais';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import {
  NINE_BOX_QUADRANTES,
  type NineBoxDistribuicao,
  renderGaugeSvg,
  renderGrid9BoxSvg,
} from './snapshot9BoxTemplate';
import { derivarProximosPassosBoardDeck } from './_shared/proximosPassosHelpers';

/** Fator canonico do radar NR-1 (DOC 03 §11 fatores 1..8). */
export interface BoardDeckRadarFator {
  fatorId: number;
  nome: string;
  scoreZeroCem: number;
}

/** Distribuicao de saidas por nivel hierarquico. */
export interface BoardDeckTurnoverPorNivel {
  estrategico: { turnoverPercentual: number; saidas: number };
  tatico: { turnoverPercentual: number; saidas: number };
  operacional: { turnoverPercentual: number; saidas: number };
}

export interface BoardDeckTemplateInput {
  nomeFantasia: string;
  razaoSocialSanitizada: string;
  /**
   * ME-1.3d-REV DIS-C CC079-1: URL da logo canonica da empresa.
   * `null` ou ausente → sem marca no canto superior direito.
   */
  logoUrl?: string | null;
  trimestre: string;
  escopoTipo: 'empresa' | 'departamento';
  escopoRotulo: string;
  nineBoxDistribuicao: NineBoxDistribuicao;
  totalClassificados: number;
  roi: {
    roiAgregado: number | null;
    variacaoTrimestreAnterior: number | null;
    variacaoAnoAnterior: number | null;
  };
  radarPsicossocial: BoardDeckRadarFator[];
  turnover: {
    trimestralPercentual: number;
    anualizadoPercentual: number;
    /**
     * Variacao vs trimestre anterior em PONTOS PERCENTUAIS (`taxa_atual -
     * taxa_anterior`). Positivo = turnover subiu (ruim); negativo =
     * caiu (bom). `null` quando nao ha trimestre anterior disponivel.
     */
    variacaoTrimestreAnteriorPercentual: number | null;
    /**
     * Variacao RELATIVA (`%`) vs trimestre anterior — exibida como
     * subtexto do card de variacao. `null` quando o anterior era 0
     * (divisao por zero) ou nao ha trimestre anterior.
     */
    variacaoTrimestreAnteriorPercentualRelativa: number | null;
    ultimos12MesesPercentual: number;
    voluntarioPercentual: number;
    involuntarioPercentual: number;
    saidasTotaisTrimestre: number;
    saidasVoluntariasTrimestre: number;
    saidasInvoluntariasTrimestre: number;
    aberturaPorNivel: BoardDeckTurnoverPorNivel | null;
  };
  geradoEmIso: string;
}

// ============================================================
// Helpers
// ============================================================

function fmtNum(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${fmtNum(v)}%`;
}

function fmtPctSigned(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sinal = v > 0 ? '+' : '';
  // "p.p." em span com fonte reduzida para caber na mesma linha do
  // numero no KPI card de variacao do turnover.
  return `${sinal}${fmtNum(v)}<span class="pp-unidade"> p.p.</span>`;
}

function fmtPctRelativoSigned(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sinal = v > 0 ? '+' : '';
  return `${sinal}${fmtNum(v)}%`;
}

function fmtIntNoPct(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return `${Math.round(v)}`;
}

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

function fmtScoreInt(score: number): string {
  const clamp = Math.max(0, Math.min(100, score));
  return Math.round(clamp).toString();
}

// ============================================================
// Perfil global
// ============================================================

interface PerfilGlobal {
  pctPositivos: number;
  pctCriticos: number;
  countPositivos: number;
  countCriticos: number;
  faixa: 'verde' | 'amarelo' | 'vermelho';
  centroQuadrante: string;
  centroCount: number;
}

const QUADRANTES_POSITIVOS = ['ALTO IMPACTO', 'ALTA ENTREGA', 'DESEMPENHO REPRESADO'] as const;

const QUADRANTES_CRITICOS = [
  'RISCO CRÍTICO',
  'RISCO DE ESGOTAMENTO',
  'DESEMPENHO CRÍTICO',
] as const;

function derivarPerfilGlobal(distribuicao: NineBoxDistribuicao, total: number): PerfilGlobal {
  const countPositivos = QUADRANTES_POSITIVOS.reduce((acc, q) => acc + distribuicao[q], 0);
  const countCriticos = QUADRANTES_CRITICOS.reduce((acc, q) => acc + distribuicao[q], 0);
  const pctPositivos = total > 0 ? (countPositivos / total) * 100 : 0;
  const pctCriticos = total > 0 ? (countCriticos / total) * 100 : 0;
  const faixa: PerfilGlobal['faixa'] =
    pctPositivos >= 60 ? 'verde' : pctPositivos >= 40 ? 'amarelo' : 'vermelho';
  let centroQuadrante = '';
  let centroCount = -1;
  for (const q of NINE_BOX_QUADRANTES) {
    if (distribuicao[q] > centroCount) {
      centroCount = distribuicao[q];
      centroQuadrante = q;
    }
  }
  return {
    pctPositivos,
    pctCriticos,
    countPositivos,
    countCriticos,
    faixa,
    centroQuadrante,
    centroCount,
  };
}

// ============================================================
// Derivacoes para 3 achados canonicos + proximos passos
// ============================================================

interface AchadoCanonico {
  texto: string;
  faixa: 'verde' | 'amarelo' | 'vermelho';
}

function derivarAchadosCanonicos(
  input: BoardDeckTemplateInput,
  perfil: PerfilGlobal,
): readonly [AchadoCanonico, AchadoCanonico, AchadoCanonico] {
  const faixaPerfil = perfil.faixa;
  const achado1: AchadoCanonico = {
    texto:
      perfil.pctPositivos > 0
        ? `${Math.round(perfil.pctPositivos)}% dos ${fmtInt(input.totalClassificados)} colaboradores classificados estão em quadrantes positivos — centro de massa em ${perfil.centroQuadrante.toLowerCase()}.`
        : `Portfólio de pessoas com ${fmtInt(input.totalClassificados)} colaboradores classificados; nenhum em quadrantes positivos.`,
    faixa: faixaPerfil,
  };
  const faixaRoiAtual = faixaRoi(input.roi.roiAgregado);
  const achado2: AchadoCanonico = {
    texto:
      input.roi.roiAgregado === null
        ? 'ROI agregado não disponível para o escopo informado.'
        : input.roi.variacaoTrimestreAnterior !== null && input.roi.variacaoTrimestreAnterior >= 0
          ? `ROI agregado de ${fmtNum(input.roi.roiAgregado, 2)}, com alta de ${fmtPct(input.roi.variacaoTrimestreAnterior)} vs trimestre anterior.`
          : input.roi.variacaoTrimestreAnterior !== null
            ? `ROI agregado de ${fmtNum(input.roi.roiAgregado, 2)}, com recuo de ${fmtPct(Math.abs(input.roi.variacaoTrimestreAnterior))} vs trimestre anterior.`
            : `ROI agregado de ${fmtNum(input.roi.roiAgregado, 2)} no trimestre.`,
    faixa: faixaRoiAtual ?? 'amarelo',
  };
  const faixaTurn = faixaTurnover(input.turnover.trimestralPercentual);
  const achado3: AchadoCanonico = {
    texto: (() => {
      const base = `Turnover trimestral em ${fmtPct(input.turnover.trimestralPercentual)}`;
      const perfilSaidas =
        input.turnover.voluntarioPercentual > input.turnover.involuntarioPercentual
          ? 'predominantemente voluntário'
          : input.turnover.involuntarioPercentual > input.turnover.voluntarioPercentual
            ? 'predominantemente involuntário'
            : 'equilibrado';
      const anualizado = `anualizado em ${fmtPct(input.turnover.anualizadoPercentual)}`;
      return `${base} (${perfilSaidas}); ${anualizado}.`;
    })(),
    faixa: faixaTurn ?? 'amarelo',
  };
  return [achado1, achado2, achado3] as const;
}

// ============================================================
// Radar NR-1 inline (reutiliza helpers pdfSvgHelpers)
// ============================================================

const RADAR_SVG_CX = 300;
const RADAR_SVG_CY = 200;
const RADAR_SVG_MAX_RADIUS = 115;
const RADAR_SVG_VIEWBOX = '0 0 600 400';
const RADAR_SVG_NUM_RINGS = 4;

function renderRadarAxisLabels(fatores: readonly BoardDeckRadarFator[]): string {
  const labelRadius = RADAR_SVG_MAX_RADIUS + 24;
  return fatores
    .map((f, idx) => {
      const p = projectRadarPoint(
        idx,
        fatores.length,
        100,
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        labelRadius,
      );
      const label = escapeHtml(f.nome);
      const angleFromTop = (2 * Math.PI * idx) / fatores.length;
      const cos = Math.cos(-Math.PI / 2 + angleFromTop);
      let anchor = 'middle';
      if (cos > 0.3) anchor = 'start';
      else if (cos < -0.3) anchor = 'end';
      return `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" font-weight="600" fill="${RADAR_COLORS.labelFill}">${label}</text>`;
    })
    .join('\n');
}

function renderRadarSvg(fatores: readonly BoardDeckRadarFator[]): string {
  if (fatores.length < 3) return '';
  const scores = fatores.map((f) => f.scoreZeroCem);
  const polygonPoints = projectRadarPolygon(
    scores,
    RADAR_SVG_CX,
    RADAR_SVG_CY,
    RADAR_SVG_MAX_RADIUS,
  );
  const circulos = fatores
    .map((f, idx) => {
      const p = projectRadarPoint(
        idx,
        fatores.length,
        f.scoreZeroCem,
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        RADAR_SVG_MAX_RADIUS,
      );
      const tipo = classificarTipoFatorRadar(f.nome);
      const corPonto = tipo === 'risco' ? RADAR_NR1_CORES.vermelho : RADAR_NR1_CORES.verde;
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3" fill="${corPonto}" stroke="${RADAR_COLORS.textStrong}" stroke-width="0.8"/>`;
    })
    .join('\n');
  const grid = renderRadarGridSvg(
    fatores.length,
    RADAR_SVG_CX,
    RADAR_SVG_CY,
    RADAR_SVG_MAX_RADIUS,
    RADAR_SVG_NUM_RINGS,
    RADAR_COLORS.gridStroke,
  );
  const labels = renderRadarAxisLabels(fatores);
  return `<svg class="radar-svg-centered" viewBox="${RADAR_SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
  ${grid}
  <polygon points="${polygonPoints}" fill="${RADAR_COLORS.teal}" fill-opacity="${RADAR_COLORS.tealFillOpacity}" stroke="${RADAR_COLORS.teal}" stroke-width="1.5"/>
  ${circulos}
  ${labels}
</svg>`;
}

function renderRadarLegendaBiparticao(): string {
  return `<div class="radar-legenda-biparticao" style="font-size:8.5pt;">
    <div class="radar-legenda-item">
      <span class="radar-legenda-swatch" style="background:${RADAR_NR1_CORES.verde}; border:1px solid ${RADAR_COLORS.textStrong};"></span>
      <span>Recurso — scores mais altos indicam ambiente saudável.</span>
    </div>
    <div class="radar-legenda-item">
      <span class="radar-legenda-swatch" style="background:${RADAR_NR1_CORES.vermelho}; border:1px solid ${RADAR_COLORS.textStrong};"></span>
      <span>Risco — scores mais altos indicam maior pressão psicossocial.</span>
    </div>
  </div>`;
}

// ============================================================
// Filename §13.8
// ============================================================

export function composeBoardDeckFilename(
  razaoSocialSanitizada: string,
  trimestre: string,
  dataGeracaoIso: string,
): string {
  const d = new Date(dataGeracaoIso);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}_${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `board_deck_${razaoSocialSanitizada}_${trimestre}_${stamp}.pdf`;
}

// ============================================================
// Secoes
// ============================================================

/**
 * Capa + tese canonica + 3 achados principais no padrao consultoria
 * estrategica (McKinsey/BCG).
 */
function renderCapaMaisAchados(input: BoardDeckTemplateInput, perfil: PerfilGlobal): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const escopoLegenda =
    input.escopoTipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : `Departamento: ${escapeHtml(input.escopoRotulo)}`;
  const tese =
    perfil.faixa === 'verde'
      ? 'Portfólio de pessoas saudável — base pronta para decisões de alocação e desenvolvimento.'
      : perfil.faixa === 'amarelo'
        ? 'Portfólio de pessoas misto — cruzamento dos quatro elementos recomendado antes de decidir.'
        : 'Portfólio de pessoas em alerta — investigação prioritária com a liderança operacional.';
  const achados = derivarAchadosCanonicos(input, perfil);
  const achadosHtml = achados
    .map((a) => `<li class="achado-item achado-${a.faixa}">${escapeHtml(a.texto)}</li>`)
    .join('\n');
  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Board deck</div>
    <div class="cover-title-line2">Visão executiva consolidada</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Trimestre</span><span class="cover-meta-value">${escapeHtml(formatTrimestreBR(input.trimestre))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Escopo</span><span class="cover-meta-value">${escopoLegenda}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="tese-card">${escapeHtml(tese)}</div>
  <h2 class="h2-compact" style="margin-top:6mm;">Principais achados do trimestre</h2>
  <ul class="achados-list">${achadosHtml}</ul>
</section>`;
}

/**
 * Distribuicao 9-Box compactada em UMA A4 (fix D-BOARD-9BOX-QUEBRA):
 * matriz + tabela de 9 linhas na mesma pagina. Colunas alinhadas com
 * cabecalhos — "COLABORADORES" e "%" alinham com os dados abaixo.
 */
function renderElemento9Box(input: BoardDeckTemplateInput, perfil: PerfilGlobal): string {
  const linhasTabela = NINE_BOX_QUADRANTES.map((q) => {
    const n = input.nineBoxDistribuicao[q];
    const pct = input.totalClassificados > 0 ? (n / input.totalClassificados) * 100 : 0;
    return `<tr><td>${escapeHtml(q)}</td><td style="text-align:center;">${fmtInt(n)}</td><td style="text-align:center;">${fmtIntNoPct(pct)}</td></tr>`;
  }).join('\n');
  const takeaway =
    perfil.pctCriticos >= 10
      ? `Concentração de ${Math.round(perfil.pctCriticos)}% em quadrantes críticos — recomendado mapeamento individual.`
      : `Centro de massa em ${perfil.centroQuadrante.toLowerCase()} com ${fmtInt(perfil.centroCount)} ${perfil.centroCount === 1 ? 'colaborador' : 'colaboradores'}; perfil ${perfil.faixa === 'verde' ? 'saudável' : 'misto'}.`;
  return `<section class="page-break" style="page-break-inside: avoid;">
  <h2>Distribuição 9-Box</h2>
  <div class="radar-block">
    <div class="radar-block-head">
      <span class="radar-block-title">Matriz 9-Box</span>
      <span class="radar-block-subtitle">${fmtInt(input.totalClassificados)} colaboradores classificados</span>
    </div>
    <div style="max-width:95mm; margin:0 auto;">
      ${renderGrid9BoxSvg(input.nineBoxDistribuicao, { size: 'medium', destacarCentroMassa: true })}
    </div>
  </div>
  <table class="data-table" style="margin-top:3mm; table-layout:fixed; font-size:9pt;">
    <colgroup>
      <col style="width:60%" />
      <col style="width:22%" />
      <col style="width:18%" />
    </colgroup>
    <thead><tr><th>Quadrante</th><th style="text-align:center;">Colaboradores</th><th style="text-align:center;">%</th></tr></thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

/**
 * ROI + Turnover em UMA A4: ROI em cima (3 KPI cards sem subtextos
 * secundarios), Turnover em baixo com 4 KPI cards redesenhados,
 * boxes de voluntarias/involuntarias e abertura por nivel.
 */
function renderElementoRoiMaisTurnover(input: BoardDeckTemplateInput): string {
  const r = input.roi;
  const faixaRoiAtual = faixaRoi(r.roiAgregado);
  const classesRoi = coresCanonicasPorFaixa(faixaRoiAtual);
  const classeTri =
    r.variacaoTrimestreAnterior === null
      ? ''
      : r.variacaoTrimestreAnterior >= 0
        ? 'highlight-green'
        : 'highlight-red';
  const valueClassTri =
    r.variacaoTrimestreAnterior === null ? '' : r.variacaoTrimestreAnterior >= 0 ? 'green' : 'red';
  const classeAno =
    r.variacaoAnoAnterior === null
      ? ''
      : r.variacaoAnoAnterior >= 0
        ? 'highlight-green'
        : 'highlight-red';
  const valueClassAno =
    r.variacaoAnoAnterior === null ? '' : r.variacaoAnoAnterior >= 0 ? 'green' : 'red';
  const t = input.turnover;
  const faixaTurn = faixaTurnover(t.trimestralPercentual);
  const classesTurn = coresCanonicasPorFaixa(faixaTurn);
  const classesVariacaoTurn =
    t.variacaoTrimestreAnteriorPercentual === null || t.variacaoTrimestreAnteriorPercentual === 0
      ? { cardClass: '', valueClass: '' }
      : t.variacaoTrimestreAnteriorPercentual > 0
        ? { cardClass: 'turnover-up', valueClass: 'turnover-up' }
        : { cardClass: 'turnover-down', valueClass: 'turnover-down' };
  const faixaAnu = faixaTurnover(t.anualizadoPercentual);
  const classesAnu = coresCanonicasPorFaixa(faixaAnu);
  const nivel = t.aberturaPorNivel;
  const barrasNivelHtml =
    nivel === null
      ? ''
      : `<h3 class="h3-compact" style="margin-top:5mm;">Abertura por nível hierárquico</h3>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Estratégico</div>
      <div class="kpi-value">${fmtPct(nivel.estrategico.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.estrategico.saidas)} ${pluralSaida(nivel.estrategico.saidas)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tático</div>
      <div class="kpi-value">${fmtPct(nivel.tatico.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.tatico.saidas)} ${pluralSaida(nivel.tatico.saidas)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Operacional</div>
      <div class="kpi-value">${fmtPct(nivel.operacional.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.operacional.saidas)} ${pluralSaida(nivel.operacional.saidas)}</div>
    </div>
  </div>`;
  const takeawayTurn =
    faixaTurn === 'verde'
      ? `Turnover saudável em ${fmtPct(t.trimestralPercentual)}; perfil ${t.voluntarioPercentual > t.involuntarioPercentual ? 'voluntário' : t.involuntarioPercentual > t.voluntarioPercentual ? 'involuntário' : 'equilibrado'}.`
      : faixaTurn === 'amarelo'
        ? `Turnover em zona de atenção (${fmtPct(t.trimestralPercentual)}); monitorar próximos ciclos.`
        : `Turnover crítico (${fmtPct(t.trimestralPercentual)}); revisão imediata de política de retenção.`;
  // Subtexto do card de variacao: formato canonico opcao C "(-2,04% vs
  // trim. anterior)" quando a variacao relativa existir.
  const subtextoVariacao =
    t.variacaoTrimestreAnteriorPercentualRelativa === null
      ? 'variação relativa indisponível'
      : fmtPctRelativoSigned(t.variacaoTrimestreAnteriorPercentualRelativa);
  return `<section class="page-break">
  <h2>ROI agregado</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card ${classesRoi.cardClass}">
      <div class="kpi-label">ROI do trimestre</div>
      <div class="kpi-value ${classesRoi.valueClass}">${fmtNum(r.roiAgregado, 2)}</div>
      <div class="kpi-sub">Produtividade da folha</div>
    </div>
    <div class="kpi-card ${classeTri}">
      <div class="kpi-label">Variação vs. trimestre anterior</div>
      <div class="kpi-value ${valueClassTri}">${fmtPct(r.variacaoTrimestreAnterior)}</div>
    </div>
    <div class="kpi-card ${classeAno}">
      <div class="kpi-label">Variação vs. mesmo trim. ano anterior</div>
      <div class="kpi-value ${valueClassAno}">${fmtPct(r.variacaoAnoAnterior)}</div>
    </div>
  </div>

  <h2 style="margin-top:8mm;">Turnover</h2>
  <p style="margin-bottom:3mm;">Rotatividade no trimestre, variação, janela móvel de 12 meses e projeção anualizada.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
    <div class="kpi-card ${classesTurn.cardClass}">
      <div class="kpi-label">Turnover trimestral</div>
      <div class="kpi-value ${classesTurn.valueClass}">${fmtPct(t.trimestralPercentual)}</div>
      <div class="kpi-sub">${fmtInt(t.saidasTotaisTrimestre)} ${pluralSaida(t.saidasTotaisTrimestre)} no período</div>
    </div>
    <div class="kpi-card ${classesVariacaoTurn.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVariacaoTurn.valueClass}">${fmtPctSigned(t.variacaoTrimestreAnteriorPercentual)}</div>
      <div class="kpi-sub">${escapeHtml(subtextoVariacao)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Últimos 12 meses</div>
      <div class="kpi-value">${fmtPct(t.ultimos12MesesPercentual)}</div>
      <div class="kpi-sub">Janela móvel</div>
    </div>
    <div class="kpi-card ${classesAnu.cardClass}">
      <div class="kpi-label">Projeção anualizada</div>
      <div class="kpi-value ${classesAnu.valueClass}">${fmtPct(t.anualizadoPercentual)}</div>
      <div class="kpi-sub">Base trimestral × 4</div>
    </div>
  </div>
  <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr); margin-top:3mm;">
    <div class="kpi-card">
      <div class="kpi-label">Saídas voluntárias</div>
      <div class="kpi-value">${fmtInt(t.saidasVoluntariasTrimestre)}</div>
      <div class="kpi-sub">${fmtPct(t.voluntarioPercentual)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Saídas involuntárias</div>
      <div class="kpi-value">${fmtInt(t.saidasInvoluntariasTrimestre)}</div>
      <div class="kpi-sub">${fmtPct(t.involuntarioPercentual)}</div>
    </div>
  </div>
  ${barrasNivelHtml}
  <div class="takeaway-card">${escapeHtml(takeawayTurn)}</div>
</section>`;
}

/**
 * Radar NR-1 em UMA A4: SVG + legenda + tabela com cor por valor.
 * Sem texto introdutorio.
 */
function renderElementoRadar(input: BoardDeckTemplateInput): string {
  if (input.radarPsicossocial.length === 0) {
    return `<section class="page-break">
  <h2>Radar de riscos psicossociais</h2>
  <div class="info-card">
    <p class="muted">Sem dados de Radar NR-1 disponíveis para este trimestre.</p>
  </div>
</section>`;
  }
  const linhasTabela = input.radarPsicossocial
    .map((f) => {
      const faixa = faixaFatorRadar(f.nome, f.scoreZeroCem);
      const corClass = faixa === 'verde' ? 'green' : faixa === 'amarelo' ? 'yellow' : 'red';
      const tipo = classificarTipoFatorRadar(f.nome);
      return `<tr><td class="right">${fmtInt(f.fatorId)}</td><td>${escapeHtml(f.nome)}</td><td class="right" style="color:#6B7280;">${tipo === 'risco' ? 'Risco' : 'Recurso'}</td><td class="right"><span class="${corClass}" style="font-weight:700;">${fmtScoreInt(f.scoreZeroCem)}</span></td></tr>`;
    })
    .join('\n');
  // ME-1.3d-REV DIS-C CC079-1 (D-DIS-C-RADAR-TOP3): fatores em alerta
  // ORDENADOS por severidade decrescente (vermelho antes de amarelo;
  // dentro do mesmo nivel, pior score canonico primeiro). Isso evita
  // omitir fatores vermelhos quando os primeiros 3 por `fatorId` sao
  // apenas amarelos. Pior score para RISCO = score alto; para RECURSO
  // = score baixo (inverter via 100 - score).
  const fatoresAlerta = input.radarPsicossocial
    .map((f) => ({ f, faixa: faixaFatorRadar(f.nome, f.scoreZeroCem) }))
    .filter((x) => x.faixa === 'vermelho' || x.faixa === 'amarelo')
    .sort((a, b) => {
      const sevA = a.faixa === 'vermelho' ? 2 : 1;
      const sevB = b.faixa === 'vermelho' ? 2 : 1;
      if (sevA !== sevB) return sevB - sevA;
      const tipoA = classificarTipoFatorRadar(a.f.nome);
      const tipoB = classificarTipoFatorRadar(b.f.nome);
      const scoreA = tipoA === 'risco' ? a.f.scoreZeroCem : 100 - a.f.scoreZeroCem;
      const scoreB = tipoB === 'risco' ? b.f.scoreZeroCem : 100 - b.f.scoreZeroCem;
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map((x) => x.f);
  const takeawayRadar =
    fatoresAlerta.length === 0
      ? 'Nenhum fator psicossocial em zona de alerta — perfil psicossocial estável no trimestre.'
      : `Fatores em alerta: ${fatoresAlerta.map((f) => f.nome).join('; ')}. Priorizar investigação estrutural.`;
  return `<section class="page-break" style="page-break-inside: avoid;">
  <h2>Radar de riscos psicossociais</h2>
  <div class="radar-block">
    <div class="radar-block-head">
      <span class="radar-block-title">Radar NR-1</span>
      <span class="radar-block-subtitle">8 fatores</span>
    </div>
    <div style="max-width:120mm; margin:0 auto;">
      ${renderRadarSvg(input.radarPsicossocial)}
    </div>
  </div>
  ${renderRadarLegendaBiparticao()}
  <table class="data-table" style="margin-top:3mm; table-layout:fixed; font-size:9pt;">
    <colgroup>
      <col style="width:8%" />
      <col style="width:55%" />
      <col style="width:17%" />
      <col style="width:20%" />
    </colgroup>
    <thead><tr><th class="right">#</th><th>Fator</th><th class="right">Tipo</th><th class="right">Score (0-100)</th></tr></thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="takeaway-card">${escapeHtml(takeawayRadar)}</div>
</section>`;
}

/**
 * Proximos passos canonicos (3 recomendacoes derivadas
 * deterministicamente dos dados do board_deck).
 */
function renderProximosPassos(input: BoardDeckTemplateInput, perfil: PerfilGlobal): string {
  const piorFator = input.radarPsicossocial
    .map((f) => ({ f, faixa: faixaFatorRadar(f.nome, f.scoreZeroCem) }))
    .filter((x) => x.faixa === 'vermelho' || x.faixa === 'amarelo')
    .sort((a, b) => {
      const tipoA = classificarTipoFatorRadar(a.f.nome);
      const tipoB = classificarTipoFatorRadar(b.f.nome);
      const scoreA = tipoA === 'risco' ? a.f.scoreZeroCem : 100 - a.f.scoreZeroCem;
      const scoreB = tipoB === 'risco' ? b.f.scoreZeroCem : 100 - b.f.scoreZeroCem;
      return scoreB - scoreA;
    })[0];
  const passos = derivarProximosPassosBoardDeck({
    pctCriticos9Box: perfil.pctCriticos,
    pctPositivos9Box: perfil.pctPositivos,
    turnoverTrimestralPct: input.turnover.trimestralPercentual,
    turnoverAnualizadoPct: input.turnover.anualizadoPercentual,
    piorFatorRadarNome: piorFator ? piorFator.f.nome : null,
    piorFatorRadarScore: piorFator ? piorFator.f.scoreZeroCem : null,
  });
  const html = passos
    .map(
      (p, i) =>
        `<li class="proximos-passos-item"><div class="proximos-passos-numero">${i + 1}</div><div>${escapeHtml(p)}</div></li>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Próximos passos</h2>
  <p>Três recomendações derivadas dos dados do deck para orientar a leitura em comitê.</p>
  <ul class="proximos-passos-list">${html}</ul>
</section>`;
}

function renderRastreabilidade(input: BoardDeckTemplateInput): string {
  const timestampBrt = toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso;
  const escopoLegenda =
    input.escopoTipo === 'empresa' ? 'Empresa (agregado geral)' : input.escopoRotulo;
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="rastreabilidade-card">
    <div class="rastreabilidade-row"><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</div>
    <div class="rastreabilidade-row"><strong>Trimestre:</strong> ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
    <div class="rastreabilidade-row"><strong>Escopo:</strong> ${escapeHtml(escopoLegenda)}</div>
    <div class="rastreabilidade-row"><strong>Colaboradores classificados:</strong> ${fmtInt(input.totalClassificados)}</div>
    <div class="rastreabilidade-row"><strong>Fatores NR-1 renderizados:</strong> ${fmtInt(input.radarPsicossocial.length)}</div>
    <div class="rastreabilidade-row"><strong>Gerado em:</strong> ${escapeHtml(timestampBrt)}</div>
  </div>
  <p class="rastreabilidade-nota"><strong>Nota final.</strong> O trimestre, uma vez fechado, é imutável. Este board deck pode ser regerado a qualquer momento a partir da base de dados original, apresentando idêntico conteúdo.</p>
</section>`;
}

// ============================================================
// Funcao publica
// ============================================================

export function renderBoardDeckHTML(input: BoardDeckTemplateInput): string {
  const perfil = derivarPerfilGlobal(input.nineBoxDistribuicao, input.totalClassificados);
  const bodyHtml = [
    renderCapaMaisAchados(input, perfil),
    renderElemento9Box(input, perfil),
    renderElementoRoiMaisTurnover(input),
    renderElementoRadar(input),
    renderProximosPassos(input, perfil),
    renderRastreabilidade(input),
  ].join('\n');
  // `renderGaugeSvg` continua exportado em snapshot9BoxTemplate — nao
  // usado neste board_deck DIS-C (gauge saiu da capa), mas o import
  // tipado se mantém via re-uso do pacote.
  void renderGaugeSvg;
  return renderLayoutBase({
    title: `Board deck · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: {
      nomeFantasia: input.nomeFantasia,
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    },
    bodyHtml,
    footerLeft: `Board deck · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
