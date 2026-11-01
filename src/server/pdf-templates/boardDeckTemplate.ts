/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Board deck one-pager (ME-053, S275;
// ME-1.3d-REV DIS-B reescrita integral).
//
// Renderizacao HTML deterministica do Board deck (DOC 03 §13.8).
// 4 elementos canonicos: Distribuicao 9-Box, ROI agregado, Radar de
// riscos psicossociais (NR-1), Turnover. Escopo: empresa ou
// departamento (sem equipe).
//
// ME-1.3d-REV DIS-B (31/10/2026):
// - Capa enxuta sem frases redundantes de rastreabilidade (vao para
//   a secao final).
// - Pluralizacao sempre no plural (sem `(s)/(es)` no texto corrido).
// - Titulos de secao sem prefixo "Elemento N ·".
// - Distribuicao 9-Box em pagina compacta (matriz + 9 linhas na mesma
//   folha).
// - ROI + Turnover unificados em uma unica pagina (ROI em cima,
//   Turnover em baixo).
// - Turnover ganha 4 KPI cards canonicos (trimestral, variacao vs trim
//   anterior com SEMANTICA INVERTIDA, ultimos 12 meses, anualizado) +
//   abertura voluntario/involuntario + nivel hierarquico.
// - Zero mencao a `canonico/canonica` em texto user-facing.
//
// Determinismo: mesmos dados -> mesmo HTML byte a byte, exceto
// `geradoEmIso` no rodape.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  projectRadarPoint,
  projectRadarPolygon,
  renderRadarGridSvg,
} from '../../lib/svg/pdfSvgHelpers';
import { RADAR_COLORS, RADAR_NR1_CORES } from '../../lib/svg/pdfVisualTokens';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import {
  NINE_BOX_QUADRANTES,
  type NineBoxDistribuicao,
  renderGaugeSvg,
  renderGrid9BoxSvg,
} from './snapshot9BoxTemplate';

/** Fator do radar NR-1 (DOC 03 §11 fatores 1..8). */
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
  /**
   * Turnover canonico extendido (DIS-B). Alem dos agregados ja
   * existentes, carrega variacao com semantica INVERTIDA e janela
   * movel de 12 meses, plus abertura voluntario/involuntario.
   */
  turnover: {
    trimestralPercentual: number;
    anualizadoPercentual: number;
    /**
     * Variacao vs trimestre anterior (pontos percentuais sobre a taxa
     * trimestral). Positivo = turnover subiu (ruim); negativo = caiu
     * (bom). `null` quando nao ha trimestre anterior disponivel.
     */
    variacaoTrimestreAnteriorPercentual: number | null;
    /** Taxa de rotatividade dos ultimos 12 meses. */
    ultimos12MesesPercentual: number;
    /** Taxa aberta por motivo. */
    voluntarioPercentual: number;
    involuntarioPercentual: number;
    saidasTotaisTrimestre: number;
    saidasVoluntariasTrimestre: number;
    saidasInvoluntariasTrimestre: number;
    /** Presente apenas quando escopo=empresa. */
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
  return `${sinal}${fmtNum(v)} p.p.`;
}

function fmtPctInt(v: number): string {
  if (!Number.isFinite(v)) return '0%';
  return `${Math.round(v)}%`;
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

/**
 * Classes do KPI de variação do turnover com semântica INVERTIDA:
 * subida (positivo) = ruim = vermelho; descida (negativo) = bom =
 * verde. Zero: neutro.
 */
function classesTurnoverInvertido(variacao: number | null): {
  cardClass: string;
  valueClass: string;
} {
  if (variacao === null || !Number.isFinite(variacao) || variacao === 0) {
    return { cardClass: '', valueClass: '' };
  }
  return variacao > 0
    ? { cardClass: 'turnover-up', valueClass: 'turnover-up' }
    : { cardClass: 'turnover-down', valueClass: 'turnover-down' };
}

// ============================================================
// Perfil global — deriva faixa semantica do gauge
// ============================================================

interface PerfilGlobal {
  pctPositivos: number;
  pctCriticos: number;
  countPositivos: number;
  countCriticos: number;
  faixa: 'verde' | 'amarelo' | 'vermelho';
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
  return { pctPositivos, pctCriticos, countPositivos, countCriticos, faixa };
}

// ============================================================
// Radar NR-1 inline (reutiliza helpers pdfSvgHelpers)
// ============================================================

const RADAR_SVG_CX = 450;
const RADAR_SVG_CY = 280;
const RADAR_SVG_MAX_RADIUS = 170;
const RADAR_SVG_VIEWBOX = '0 0 900 560';
const RADAR_SVG_NUM_RINGS = 4;

function renderRadarAxisLabels(fatores: readonly BoardDeckRadarFator[]): string {
  const labelRadius = RADAR_SVG_MAX_RADIUS + 32;
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
      return `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="15" font-weight="600" fill="${RADAR_COLORS.labelFill}">${label}</text>`;
    })
    .join('\n');
}

function classificarTipoFator(nome: string): 'risco' | 'recurso' {
  const prefixosRisco = ['Exigências', 'Ritmo', 'Conflitos', 'Insegurança'];
  const isRisco = prefixosRisco.some((prefix) => nome.startsWith(prefix));
  return isRisco ? 'risco' : 'recurso';
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
      const tipo = classificarTipoFator(f.nome);
      const corPonto = tipo === 'risco' ? RADAR_NR1_CORES.vermelho : RADAR_NR1_CORES.verde;
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" fill="${corPonto}" stroke="${RADAR_COLORS.textStrong}" stroke-width="1"/>`;
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
  return `<svg class="radar-svg-centered" viewBox="${RADAR_SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  ${grid}
  <polygon points="${polygonPoints}" fill="${RADAR_COLORS.teal}" fill-opacity="${RADAR_COLORS.tealFillOpacity}" stroke="${RADAR_COLORS.teal}" stroke-width="2"/>
  ${circulos}
  ${labels}
</svg>`;
}

function renderRadarLegendaBiparticao(): string {
  return `<div class="radar-legenda-biparticao">
    <div class="radar-legenda-item">
      <span class="radar-legenda-swatch" style="background:${RADAR_NR1_CORES.verde}; border:1px solid ${RADAR_COLORS.textStrong};"></span>
      <span>Fator de recurso — scores mais altos indicam ambiente mais saudável.</span>
    </div>
    <div class="radar-legenda-item">
      <span class="radar-legenda-swatch" style="background:${RADAR_NR1_CORES.vermelho}; border:1px solid ${RADAR_COLORS.textStrong};"></span>
      <span>Fator de risco — scores mais altos indicam maior pressão psicossocial.</span>
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

function renderCapaMaisResumo(input: BoardDeckTemplateInput): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const perfil = derivarPerfilGlobal(input.nineBoxDistribuicao, input.totalClassificados);
  const highlightClass =
    perfil.faixa === 'verde'
      ? 'highlight-green'
      : perfil.faixa === 'amarelo'
        ? 'highlight-yellow'
        : 'highlight-red';
  const valueClass =
    perfil.faixa === 'verde' ? 'green' : perfil.faixa === 'amarelo' ? 'yellow' : 'red';
  const criticoAlertante = perfil.pctCriticos >= 10;
  const escopoLegenda =
    input.escopoTipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : `Departamento: ${escapeHtml(input.escopoRotulo)}`;
  const gaugeTitulo =
    perfil.faixa === 'verde'
      ? 'Perfil saudável'
      : perfil.faixa === 'amarelo'
        ? 'Perfil misto'
        : 'Perfil preocupante';
  const gaugeBody =
    perfil.faixa === 'verde'
      ? 'A maior parte dos colaboradores classificados está nos quadrantes de desempenho alto. O board deck pode ser lido com segurança para decisões de alocação, investimento e desenvolvimento.'
      : perfil.faixa === 'amarelo'
        ? 'A concentração nos quadrantes positivos é moderada. Vale cruzar os quatro elementos abaixo antes de decidir — financeiro, psicossocial e turnover podem contar histórias diferentes.'
        : 'A maioria dos colaboradores está em quadrantes de equilíbrio frágil ou crítico. Recomenda-se usar o board deck como ponto de partida para investigação priorizada com a liderança operacional.';
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
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> consolida quatro elementos — distribuição 9-Box, ROI agregado, radar de riscos psicossociais (NR-1) e turnover — para leitura rápida em comitê.
  </div>
  <h2 class="h2-compact">Resumo executivo</h2>
  <p class="resumo-exec-paragrafo">${fmtInt(input.totalClassificados)} colaboradores classificados no ciclo.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Classificados</div>
      <div class="kpi-value">${fmtInt(input.totalClassificados)}</div>
      <div class="kpi-sub">Base da distribuição 9-Box</div>
    </div>
    <div class="kpi-card ${highlightClass}">
      <div class="kpi-label">Em quadrantes positivos</div>
      <div class="kpi-value ${valueClass}">${fmtPctInt(perfil.pctPositivos)}</div>
      <div class="kpi-sub">${fmtInt(perfil.countPositivos)} em Alto Impacto, Alta Entrega ou Desempenho Represado</div>
    </div>
    <div class="kpi-card ${criticoAlertante ? 'highlight-red' : ''}">
      <div class="kpi-label">Em quadrantes críticos</div>
      <div class="kpi-value ${criticoAlertante ? 'red' : ''}">${fmtPctInt(perfil.pctCriticos)}</div>
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
 * Distribuicao 9-Box em pagina compacta: matriz + tabela de 9 linhas,
 * ambas na mesma A4. Colunas "Colaboradores" e "%" com alinhamento à
 * direita; "%" sem sufixo (cabecalho ja indica a unidade).
 */
function renderElemento9Box(input: BoardDeckTemplateInput): string {
  const linhasTabela = NINE_BOX_QUADRANTES.map((q) => {
    const n = input.nineBoxDistribuicao[q];
    const pct = input.totalClassificados > 0 ? (n / input.totalClassificados) * 100 : 0;
    return `<tr><td>${escapeHtml(q)}</td><td class="right">${fmtInt(n)}</td><td class="right">${fmtIntNoPct(pct)}</td></tr>`;
  }).join('\n');
  return `<section class="page-break">
  <h2>Distribuição 9-Box</h2>
  <p>Posicionamento dos ${fmtInt(input.totalClassificados)} colaboradores classificados no cruzamento desempenho × plenitude. O quadrante com maior concentração é destacado com borda escura.</p>
  <div class="radar-block">
    <div class="radar-block-head">
      <span class="radar-block-title">Matriz 9-Box</span>
      <span class="radar-block-subtitle">${fmtInt(input.totalClassificados)} colaboradores classificados</span>
    </div>
    <div style="max-width:120mm; margin:0 auto;">
      ${renderGrid9BoxSvg(input.nineBoxDistribuicao, { size: 'medium', destacarCentroMassa: true })}
    </div>
  </div>
  <table class="data-table" style="margin-top:3mm;">
    <thead><tr><th>Quadrante</th><th class="right">Colaboradores</th><th class="right">%</th></tr></thead>
    <tbody>${linhasTabela}</tbody>
  </table>
</section>`;
}

/**
 * ROI + Turnover unificados em UMA pagina: ROI no topo (3 KPI cards),
 * Turnover em baixo (4 KPI cards + abertura voluntario/involuntario +
 * nivel hierarquico quando empresa).
 */
function renderElementoRoiMaisTurnover(input: BoardDeckTemplateInput): string {
  const r = input.roi;
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
  const classesVar = classesTurnoverInvertido(t.variacaoTrimestreAnteriorPercentual);
  const alertanteTri = t.trimestralPercentual >= 10;
  const alertanteAnu = t.anualizadoPercentual >= 25;
  const classeTriTurn = alertanteTri ? 'highlight-red' : '';
  const valueClassTriTurn = alertanteTri ? 'red' : '';
  const classeAnu = alertanteAnu ? 'highlight-red' : '';
  const valueClassAnu = alertanteAnu ? 'red' : '';
  const nivel = t.aberturaPorNivel;
  const barrasNivelHtml =
    nivel === null
      ? ''
      : `<div class="turnover-bars" style="margin-top:4mm;">
    <h3 class="h3-compact">Abertura por nível hierárquico</h3>
    ${renderBarraNivel('Estratégico', nivel.estrategico.turnoverPercentual, nivel.estrategico.saidas, '#DBEAFE', '#1E40AF')}
    ${renderBarraNivel('Tático', nivel.tatico.turnoverPercentual, nivel.tatico.saidas, '#FEF3C7', '#92400E')}
    ${renderBarraNivel('Operacional', nivel.operacional.turnoverPercentual, nivel.operacional.saidas, '#E0E7FF', '#3730A3')}
  </div>`;
  return `<section class="page-break">
  <h2>ROI agregado</h2>
  <p>Retorno sobre pessoas no trimestre e as duas variações de comparação: trimestre anterior e mesmo trimestre do ano anterior.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">ROI do trimestre</div>
      <div class="kpi-value">${fmtNum(r.roiAgregado, 2)}</div>
      <div class="kpi-sub">Agregado da base ativa no período</div>
    </div>
    <div class="kpi-card ${classeTri}">
      <div class="kpi-label">Variação vs. trimestre anterior</div>
      <div class="kpi-value ${valueClassTri}">${fmtPct(r.variacaoTrimestreAnterior)}</div>
      <div class="kpi-sub">Comparação com o fechamento imediatamente anterior</div>
    </div>
    <div class="kpi-card ${classeAno}">
      <div class="kpi-label">Variação vs. mesmo trim. ano anterior</div>
      <div class="kpi-value ${valueClassAno}">${fmtPct(r.variacaoAnoAnterior)}</div>
      <div class="kpi-sub">Sazonalidade controlada ano a ano</div>
    </div>
  </div>

  <h2 style="margin-top:8mm;">Turnover</h2>
  <p>Rotatividade no trimestre, variação (subida = pior), janela móvel de 12 meses e projeção anualizada. Abertura voluntário × involuntário no detalhe.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
    <div class="kpi-card ${classeTriTurn}">
      <div class="kpi-label">Turnover trimestral</div>
      <div class="kpi-value ${valueClassTriTurn}">${fmtPct(t.trimestralPercentual)}</div>
      <div class="kpi-sub">${fmtInt(t.saidasTotaisTrimestre)} saídas no período</div>
    </div>
    <div class="kpi-card ${classesVar.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVar.valueClass}">${fmtPctSigned(t.variacaoTrimestreAnteriorPercentual)}</div>
      <div class="kpi-sub">Subida = pior, descida = melhor</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Últimos 12 meses</div>
      <div class="kpi-value">${fmtPct(t.ultimos12MesesPercentual)}</div>
      <div class="kpi-sub">Janela móvel encerrando no trimestre</div>
    </div>
    <div class="kpi-card ${classeAnu}">
      <div class="kpi-label">Projeção anualizada</div>
      <div class="kpi-value ${valueClassAnu}">${fmtPct(t.anualizadoPercentual)}</div>
      <div class="kpi-sub">Base trimestral × 4</div>
    </div>
  </div>
  <table class="kv" style="margin-top:4mm;">
    <tr><th>Saídas voluntárias</th><td>${fmtInt(t.saidasVoluntariasTrimestre)} · ${fmtPct(t.voluntarioPercentual)}</td></tr>
    <tr><th>Saídas involuntárias</th><td>${fmtInt(t.saidasInvoluntariasTrimestre)} · ${fmtPct(t.involuntarioPercentual)}</td></tr>
  </table>
  ${barrasNivelHtml}
</section>`;
}

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
      return `<tr><td class="right">${fmtInt(f.fatorId)}</td><td>${escapeHtml(f.nome)}</td><td class="right fw-700">${fmtScoreInt(f.scoreZeroCem)}</td></tr>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Radar de riscos psicossociais</h2>
  <p>Os 8 fatores do instrumento NR-1 / COPSOQ. Scores em escala 0-100 — o polígono mostra o perfil atual da empresa.</p>
  <div class="radar-block">
    <div class="radar-block-head">
      <span class="radar-block-title">Radar NR-1</span>
      <span class="radar-block-subtitle">8 fatores</span>
    </div>
    <div style="max-width:155mm; margin:0 auto;">
      ${renderRadarSvg(input.radarPsicossocial)}
    </div>
  </div>
  ${renderRadarLegendaBiparticao()}
  <table class="data-table" style="margin-top:4mm;">
    <thead><tr><th class="right">#</th><th>Fator</th><th class="right">Score (0-100)</th></tr></thead>
    <tbody>${linhasTabela}</tbody>
  </table>
</section>`;
}

function renderBarraNivel(
  rotulo: string,
  valorPct: number,
  saidas: number,
  corBg: string,
  corText: string,
): string {
  const larguraPct = Math.max(0, Math.min(100, valorPct));
  return `<div class="turnover-bar-row">
    <div class="turnover-bar-label">${escapeHtml(rotulo)}</div>
    <div class="turnover-bar-track">
      <div class="turnover-bar-fill" style="width:${larguraPct.toFixed(2)}%; background:${corBg}; color:${corText};">${fmtPctInt(valorPct)}</div>
    </div>
    <div class="turnover-bar-value">${fmtInt(saidas)} saídas</div>
  </div>`;
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
  const bodyHtml = [
    renderCapaMaisResumo(input),
    renderElemento9Box(input),
    renderElementoRoiMaisTurnover(input),
    renderElementoRadar(input),
    renderRastreabilidade(input),
  ].join('\n');
  return renderLayoutBase({
    title: `Board deck · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Board deck · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
