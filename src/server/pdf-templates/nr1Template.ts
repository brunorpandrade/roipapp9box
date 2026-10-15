/* eslint-disable @stylistic/max-len -- template HTML editorial com strings longas */
// ROIP APP 9BOX — template PDF Radar NR-1 (ME-1.3c CC079-v4).
//
// Renderizacao HTML determinística do relatorio do Radar NR-1
// (DOC 03 §11.12). Consumido por `nr1.downloadReport` (Route Handler);
// convertido em PDF pela toolchain `pdfRenderer.ts`.
//
// Estrutura CC079-v4 (editorial, enxuta):
// - Capa sem badge, hero em uma linha, meta grid compacta (empresa,
//   ciclo, datas, data de geracao), cover-note ambar.
// - Resumo executivo com 3 KPI cards horizontais (adesao, respostas
//   invalidadas, fatores em alerta) e gauge de adesao.
// - Pagina inteira para o radar da empresa (grafico em cima + tabela
//   de 8 fatores embaixo).
// - Pagina inteira seguinte para a descricao de cada fator (com os
//   rotulos "Fator de risco" / "Fator de recurso" preservados).
// - Radar por departamento (quando houver departamentos com nome e
//   amostra suficiente).
// - Alertas informativos por fator.
// - Rastreabilidade.
//
// Secoes vazias (convergencia/divergencia sem dado, dept critico
// ausente, ciclo anterior inexistente, historico insuficiente) sao
// suprimidas integralmente. Sugestoes de proximos passos eliminada.
//
// Determinismo: mesmos dados -> mesmo HTML byte-exact exceto timestamp.

import { formatDateBR } from '../../lib/date/formatDateBR';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  projectRadarPoint,
  projectRadarPolygon,
  renderRadarGridSvg,
} from '../../lib/svg/pdfSvgHelpers';
import {
  classificarNr1Faixa,
  type Nr1Faixa,
  RADAR_COLORS,
  RADAR_NR1_CORES,
} from '../../lib/svg/pdfVisualTokens';
import { escapeHtml, type LayoutBaseCompany, renderLayoutBase } from './layoutBase';

/** Score de um dos 8 fatores. */
export interface Nr1FatorScore {
  fatorId: number;
  nome: string;
  score: number;
}

/** Score por departamento. */
export interface Nr1DepartamentoScore {
  departamentoNome: string;
  amostra: number;
  fatores: Nr1FatorScore[];
}

/** Departamento com amostra abaixo do piso (5). */
export interface Nr1DepartamentoInsuficiente {
  departamentoNome: string;
  amostra: number;
}

/** Analise de convergencia / divergencia. */
export interface Nr1DivergenceEntry {
  fatorNome: string;
  scoreEmpresa: number;
  scoreDepartamento: number;
  departamentoNome: string;
  gap: number;
}

/** Alerta informativo por fator (§11.13). */
export interface Nr1AlertaFator {
  fatorNome: string;
  escopo: 'empresa' | 'departamento';
  departamentoNome?: string;
  score: number;
}

/** Comparacao entre ciclos. */
export interface Nr1ComparacaoCiclo {
  cicloRotulo: string;
  fatores: Nr1FatorScore[];
}

/** Nota de auditoria de edicao de data de fechamento (§11.12). */
export interface Nr1NotaAuditoriaEdicao {
  dataFechamentoOriginal: string;
  dataFechamentoAtual: string;
  ultimaEdicaoEm: string;
  ultimaEdicaoPor: string;
  ultimaEdicaoJustificativa: string;
}

/** Ciclo alvo do relatorio. */
export interface Nr1CicloInfo {
  cicloRotulo: string;
  dataAbertura: string;
  dataFechamento: string;
  totalRespondentes: number;
  totalElegiveis: number;
}

/** Input do template. */
export interface Nr1TemplateInput {
  company: LayoutBaseCompany;
  ciclo: Nr1CicloInfo;
  resumoExecutivo: string;
  radarEmpresa: Nr1FatorScore[];
  radaresPorDepartamento: Nr1DepartamentoScore[];
  departamentosInsuficientes: Nr1DepartamentoInsuficiente[];
  divergencias: Nr1DivergenceEntry[];
  departamentoCritico?: {
    nome: string;
    fatoresCriticos: string[];
    diagnostico: string;
  };
  alertas: Nr1AlertaFator[];
  comparacaoCicloAnterior?: Nr1ComparacaoCiclo;
  comparacaoHistorica?: Nr1ComparacaoCiclo[];
  sugestoesProximosPassos: string[];
  notaAuditoriaEdicao?: Nr1NotaAuditoriaEdicao;
  generatedAtIso: string;
  generatedAtDate: string;
}

/** Normalizacao canonica do nome da empresa para o filename (§11.12). */
export function normalizeNomeEmpresaForFilename(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const semEspacosSubst = semAcento.replace(/\s+/g, '_');
  const semEspecial = semEspacosSubst.replace(/[&.,/\\:;!?*"'<>|]/g, '');
  const limitado = semEspecial.slice(0, 40);
  return limitado.length > 0 ? limitado : 'Empresa';
}

/** Compoe o nome do arquivo PDF conforme §11.12. */
export function composeNr1ReportFilename(
  nomeEmpresa: string,
  dataAbertura: string,
  dataGeracao: string,
): string {
  const nomeNorm = normalizeNomeEmpresaForFilename(nomeEmpresa);
  return `Radar_NR-1_${nomeNorm}_${dataAbertura}_${dataGeracao}.pdf`;
}

// ============================================================
// Helpers de formatacao editorial
// ============================================================

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

function fmtScore(score: number): string {
  const clamp = Math.max(0, Math.min(100, score));
  return clamp.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function abreviarFator(nome: string): string {
  const map: Record<string, string> = {
    'Exigências quantitativas': 'Exig. quant.',
    'Ritmo de trabalho': 'Ritmo',
    'Conflitos de papel': 'Confl. papel',
    Autonomia: 'Autonomia',
    'Suporte social do líder': 'Sup. líder',
    'Suporte social de colegas': 'Sup. colegas',
    'Insegurança no trabalho': 'Insegurança',
    'Saúde geral autopercebida': 'Saúde',
  };
  return map[nome] ?? nome;
}

function classificarTipoFator(nome: string): 'Fator de risco' | 'Fator de recurso' {
  const prefixosRisco = ['Exigências', 'Ritmo', 'Conflitos', 'Insegurança'];
  const isRisco = prefixosRisco.some((prefix) => nome.startsWith(prefix));
  return isRisco ? 'Fator de risco' : 'Fator de recurso';
}

// ============================================================
// Geometria do radar SVG
// ============================================================

const RADAR_SVG_CX = 200;
const RADAR_SVG_CY = 200;
const RADAR_SVG_MAX_RADIUS = 140;
const RADAR_SVG_VIEWBOX = '0 0 400 380';
const RADAR_SVG_NUM_RINGS = 4;

function renderRadarAxisLabels(fatores: readonly Nr1FatorScore[]): string {
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
      const label = escapeHtml(abreviarFator(f.nome));
      return `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" text-anchor="middle" font-size="10" font-weight="600" fill="${RADAR_COLORS.labelFill}">${label}</text>`;
    })
    .join('\n');
}

function renderRadarSvg(
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  if (fatores.length < 3) return '';
  const scores = fatores.map((f) => f.score);
  const polygonPoints = projectRadarPolygon(
    scores,
    RADAR_SVG_CX,
    RADAR_SVG_CY,
    RADAR_SVG_MAX_RADIUS,
  );
  const dataPoints = scores
    .map((score, idx) => {
      const p = projectRadarPoint(
        idx,
        scores.length,
        score,
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        RADAR_SVG_MAX_RADIUS,
      );
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" />`;
    })
    .join('\n');
  const referenciaPoly = referencia
    ? `<polygon points="${projectRadarPolygon(
        referencia.map((f) => f.score),
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        RADAR_SVG_MAX_RADIUS,
      )}" fill="none" stroke="${RADAR_COLORS.mediaEmpresaStroke}" stroke-width="1.5" stroke-dasharray="${RADAR_COLORS.mediaEmpresaDasharray}" />`
    : '';
  return `<svg viewBox="${RADAR_SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; display:block;">
${renderRadarGridSvg(scores.length, RADAR_SVG_CX, RADAR_SVG_CY, RADAR_SVG_MAX_RADIUS, RADAR_SVG_NUM_RINGS, RADAR_COLORS.gridStroke)}
${referenciaPoly}
<polygon points="${polygonPoints}" fill="${RADAR_COLORS.teal}" fill-opacity="${RADAR_COLORS.tealFillOpacity}" stroke="${RADAR_COLORS.teal}" stroke-width="2" />
<g fill="${RADAR_COLORS.teal}">
${dataPoints}
</g>
${renderRadarAxisLabels(fatores)}
</svg>`;
}

function renderRadarLegend(fatores: readonly Nr1FatorScore[]): string {
  const items = fatores
    .map((f) => {
      const faixa: Nr1Faixa = classificarNr1Faixa(f.score);
      const dotColor = RADAR_NR1_CORES[faixa];
      return `<tr>
    <td style="padding:1.5mm 3mm 1.5mm 0; border-bottom:1px solid #F3F4F6;">
      <span class="legend-dot" style="background:${dotColor};"></span>
      <span style="color:#374151; font-weight:500;">${escapeHtml(f.nome)}</span>
    </td>
    <td class="right" style="padding:1.5mm 0; border-bottom:1px solid #F3F4F6; font-weight:700; color:${dotColor};">${fmtScore(f.score)}</td>
  </tr>`;
    })
    .join('\n');
  return `<table style="width:100%; border-collapse:collapse; font-size:9.5pt;">
${items}
</table>`;
}

function renderRadarCardBlock(
  titulo: string,
  subtitulo: string,
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  return `<div class="radar-block">
  <div class="radar-block-head">
    <span class="radar-block-title">${escapeHtml(titulo)}</span>
    <span class="radar-block-subtitle">${escapeHtml(subtitulo)}</span>
  </div>
  <div class="radar-row">
    <div class="radar-svg-wrap">${renderRadarSvg(fatores, referencia)}</div>
    <div class="radar-legend">${renderRadarLegend(fatores)}</div>
  </div>
</div>`;
}

// ============================================================
// Gauge semicircular
// ============================================================

function renderGaugeSvg(percent: number): string {
  const clamp = Math.max(0, Math.min(100, percent));
  const faixa: Nr1Faixa = clamp >= 66 ? 'verde' : clamp >= 50 ? 'amarelo' : 'vermelho';
  const color = RADAR_NR1_CORES[faixa];
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
// Secoes editoriais CC079-v4
// ============================================================

function renderCapa(input: Nr1TemplateInput): string {
  const dataGeracao = formatDataEditorial(input.generatedAtDate);
  const adesao =
    input.ciclo.totalElegiveis > 0
      ? Math.round((input.ciclo.totalRespondentes / input.ciclo.totalElegiveis) * 100)
      : 0;
  const alertaAdesao =
    adesao < 50
      ? `<div class="cover-note" style="background:#FEE2E2; border-color:#FCA5A5; color:#991B1B; margin-bottom:8mm;">
    <strong>Atenção:</strong> adesão inferior a 50% dos colaboradores elegíveis. Os resultados devem ser interpretados com cautela e não representam necessariamente a percepção da maioria da força de trabalho.
  </div>`
      : '';
  return `<section class="cover-page">
  ${alertaAdesao}
  <div class="cover-title" style="font-size:26pt; line-height:1.15;">Radar NR-1 <span class="cover-title-accent">Riscos Psicossociais no Trabalho</span></div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.company.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Ciclo</span><span class="cover-meta-value">${escapeHtml(input.ciclo.cicloRotulo)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de abertura</span><span class="cover-meta-value">${escapeHtml(formatDataEditorial(input.ciclo.dataAbertura))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de fechamento</span><span class="cover-meta-value">${escapeHtml(formatDataEditorial(input.ciclo.dataFechamento))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> este documento entrega um radar diagnóstico preliminar dos 8 fatores psicossociais. Não substitui os instrumentos e processos formais exigidos pela NR-1, que requerem instrumento validado cientificamente e responsável técnico habilitado. Use os resultados como ponto de partida para investigação aprofundada quando necessário.
  </div>
</section>`;
}

function renderResumoExecutivo(input: Nr1TemplateInput): string {
  const adesao =
    input.ciclo.totalElegiveis > 0
      ? Math.round((input.ciclo.totalRespondentes / input.ciclo.totalElegiveis) * 100)
      : 0;
  const alertasCount = input.alertas.filter((a) => a.escopo === 'empresa').length;
  const invalidados = Math.max(0, input.ciclo.totalElegiveis - input.ciclo.totalRespondentes);
  const faixaAdesao: Nr1Faixa = adesao >= 66 ? 'verde' : adesao >= 50 ? 'amarelo' : 'vermelho';
  const highlightAdesao =
    faixaAdesao === 'verde'
      ? 'highlight-green'
      : faixaAdesao === 'amarelo'
        ? 'highlight-yellow'
        : 'highlight-red';
  const kpiValueClass =
    faixaAdesao === 'verde' ? 'green' : faixaAdesao === 'amarelo' ? 'yellow' : 'red';
  const gaugeTitulo =
    faixaAdesao === 'verde'
      ? 'Adesão saudável'
      : faixaAdesao === 'amarelo'
        ? 'Adesão limítrofe'
        : 'Adesão crítica';
  const gaugeBody =
    faixaAdesao === 'verde'
      ? 'Os resultados representam de forma consistente a percepção da força de trabalho e sustentam análise executiva confiável.'
      : faixaAdesao === 'amarelo'
        ? 'A adesão permite leitura executiva, mas convém investigar a razão de parte dos elegíveis não responder, para reforçar a próxima rodada.'
        : 'A adesão é insuficiente para representar a força de trabalho. Resultados devem ser lidos com cautela e investigação ativa é recomendada.';
  const gaugeClass =
    faixaAdesao === 'verde' ? 'cs-green' : faixaAdesao === 'amarelo' ? 'cs-yellow' : 'cs-red';
  const resumoLimpo = input.resumoExecutivo.replace(/atencao/gi, 'atenção');
  return `<section class="page-break">
  <h2>Resumo executivo</h2>
  <p>${escapeHtml(resumoLimpo)}</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card ${highlightAdesao}">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value ${kpiValueClass}">${adesao}%</div>
      <div class="kpi-sub">${input.ciclo.totalRespondentes} / ${input.ciclo.totalElegiveis} elegíveis</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Respostas invalidadas</div>
      <div class="kpi-value">${invalidados}</div>
      <div class="kpi-sub">Por controle de qualidade</div>
    </div>
    <div class="kpi-card ${alertasCount > 0 ? 'highlight-red' : ''}">
      <div class="kpi-label">Fatores em alerta</div>
      <div class="kpi-value ${alertasCount > 0 ? 'red' : ''}">${alertasCount}</div>
      <div class="kpi-sub">Score inferior a 50 (escopo empresa)</div>
    </div>
  </div>
  <div class="gauge-wrap">
    ${renderGaugeSvg(adesao)}
    <div>
      <div class="gauge-info-title ${gaugeClass}">${gaugeTitulo}</div>
      <div class="gauge-info-body">${gaugeBody}</div>
    </div>
  </div>
  <p class="muted" style="font-size:9pt; line-height:1.55;"><strong>Nota metodológica.</strong> Adesão calculada sobre o universo de colaboradores elegíveis no snapshot do dia da abertura do ciclo. Respostas invalidadas por controle de qualidade (respostas idênticas em todos os itens ou preenchimento em tempo inferior a 180 segundos) não entram no cálculo dos scores por fator.</p>
</section>`;
}

const DESCRICOES_FATORES: Record<string, string> = {
  'Exigências quantitativas':
    'Mede a percepção do respondente sobre volume de trabalho e prazo disponível. Escores altos indicam demandas dimensionadas de forma saudável.',
  'Ritmo de trabalho':
    'Mede a intensidade e previsibilidade do ritmo exigido ao longo da jornada. Escores altos indicam ritmo sustentável.',
  'Conflitos de papel':
    'Mede clareza sobre o próprio papel e coerência entre demandas recebidas. Escores altos indicam papel bem definido e demandas alinhadas.',
  Autonomia:
    'Mede o grau de autonomia percebida nas decisões sobre o próprio trabalho. Escores altos indicam liberdade construtiva na execução.',
  'Suporte social do líder':
    'Mede a percepção de apoio direto da liderança imediata. Escores altos indicam vínculo e escuta efetivos.',
  'Suporte social de colegas':
    'Mede a percepção de apoio entre pares. Escores altos indicam ambiente colaborativo e seguro entre colegas.',
  'Insegurança no trabalho':
    'Mede a percepção de estabilidade e previsibilidade sobre o vínculo e as condições de trabalho. Escores altos indicam sensação de segurança.',
  'Saúde geral autopercebida':
    'Mede a percepção subjetiva do colaborador sobre a própria saúde geral. Escores altos indicam bem-estar relatado.',
};

function renderRadarEmpresa(input: Nr1TemplateInput): string {
  const subtit = `${input.ciclo.totalRespondentes} respondentes efetivos`;
  return `<section class="page-break">
  <h2>Radar da empresa — 8 fatores</h2>
  <p style="font-size:10pt;">Consolidação dos 8 fatores psicossociais no escopo empresa, agregando as respostas válidas de <strong>${input.ciclo.totalRespondentes} respondentes efetivos</strong>. Legenda: <span class="cs-green fw-700">verde (66-100)</span> satisfatório · <span class="cs-yellow fw-700">amarelo (50-65)</span> atenção · <span class="cs-red fw-700">vermelho (0-49)</span> crítico.</p>
  ${renderRadarCardBlock('Empresa', subtit, input.radarEmpresa)}
</section>`;
}

function renderDescricoesFatoresPagina(input: Nr1TemplateInput): string {
  const blocos = input.radarEmpresa
    .map((f) => {
      const faixa: Nr1Faixa = classificarNr1Faixa(f.score);
      const color = RADAR_NR1_CORES[faixa];
      const desc = DESCRICOES_FATORES[f.nome] ?? '';
      return `<div class="factor-desc">
  <div class="factor-desc-head">
    <div><span class="factor-desc-name">${escapeHtml(f.nome)}</span><span class="factor-desc-type">· ${escapeHtml(classificarTipoFator(f.nome))}</span></div>
    <span class="factor-desc-score" style="color:${color};">${fmtScore(f.score)}</span>
  </div>
  <div class="factor-desc-text">${escapeHtml(desc)}</div>
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Descrição de cada fator</h2>
  <p style="font-size:10pt;">Síntese do que cada fator mede e orientação de leitura dos escores agregados do ciclo.</p>
  ${blocos}
</section>`;
}

function renderRadarDepartamentos(input: Nr1TemplateInput): string {
  if (input.radaresPorDepartamento.length === 0) return '';
  const blocks = input.radaresPorDepartamento
    .map((d) =>
      renderRadarCardBlock(
        d.departamentoNome,
        `${d.amostra} respondentes efetivos`,
        d.fatores,
        input.radarEmpresa,
      ),
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Radar por departamento</h2>
  <p style="font-size:10pt;">Detalhamento dos 8 fatores por departamento com amostra suficiente. Polígono em teal: departamento. Tracejado cinza: média da empresa (referência comparativa).</p>
  ${blocks}
</section>`;
}

function renderInsuficientes(input: Nr1TemplateInput): string {
  if (input.departamentosInsuficientes.length === 0) return '';
  const cards = input.departamentosInsuficientes
    .map(
      (i) => `<div class="dept-card" style="background:#F9FAFB; border-style:dashed;">
  <div class="dept-card-head">
    <div>
      <div class="dept-card-name">${escapeHtml(i.departamentoNome)}</div>
      <div class="dept-card-meta">${i.amostra} respondentes efetivos · abaixo do piso de 5</div>
    </div>
  </div>
  <div class="dept-card-body">Recomenda-se aguardar próximo ciclo ou considerar agrupamento com departamento afim para análise consolidada.</div>
</div>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Departamentos com amostra insuficiente</h2>
  <p style="font-size:10pt;">Departamentos com menos de 5 respondentes efetivos não geram radar próprio para preservar o anonimato dos respondentes.</p>
  ${cards}
</section>`;
}

function renderDivergencias(input: Nr1TemplateInput): string {
  if (input.divergencias.length === 0 || input.radaresPorDepartamento.length === 0) return '';
  const divergPorDept = new Map<string, Nr1DivergenceEntry[]>();
  for (const d of input.divergencias) {
    const arr = divergPorDept.get(d.departamentoNome) ?? [];
    arr.push(d);
    divergPorDept.set(d.departamentoNome, arr);
  }
  const cards = input.radaresPorDepartamento
    .map((dept) => {
      const divs = divergPorDept.get(dept.departamentoNome) ?? [];
      const criticas = divs.filter((d) => d.gap < -10);
      const positivas = divs.filter((d) => d.gap > 10);
      let classe: 'convergente' | 'critica' | 'positiva';
      let classeLabel: string;
      let corpo: string;
      let badges: Nr1DivergenceEntry[];
      let badgeClass: 'crit' | 'pos' | '';
      if (criticas.length > 0 && criticas.length >= positivas.length) {
        classe = 'critica';
        classeLabel = 'Divergência crítica';
        corpo = `Este departamento apresenta divergência significativa em ${criticas.length} fator(es) frente à média da empresa, no sentido de agravamento.`;
        badges = criticas;
        badgeClass = 'crit';
      } else if (positivas.length > 0) {
        classe = 'positiva';
        classeLabel = 'Divergência positiva';
        corpo = `Este departamento apresenta divergência positiva em ${positivas.length} fator(es). Prática replicável para outras áreas.`;
        badges = positivas;
        badgeClass = 'pos';
      } else {
        classe = 'convergente';
        classeLabel = 'Convergente';
        corpo =
          'Alinhado à média da empresa em todos os 8 fatores (variações inferiores a 10 pontos).';
        badges = [];
        badgeClass = '';
      }
      const badgeHtml =
        badges.length === 0
          ? ''
          : `<div class="dept-badges">${badges
              .map(
                (b) =>
                  `<div class="dept-badge ${badgeClass}">${escapeHtml(b.fatorNome)} ${b.gap > 0 ? '+' : ''}${Math.round(b.gap)}</div>`,
              )
              .join('')}</div>`;
      return `<div class="dept-card">
  <div class="dept-card-head">
    <div>
      <div class="dept-card-name">${escapeHtml(dept.departamentoNome)}</div>
      <div class="dept-card-meta">${dept.amostra} respondentes efetivos</div>
    </div>
    <div class="dept-card-class ${classe}">${classeLabel}</div>
  </div>
  <div class="dept-card-body">${corpo}</div>
  ${badgeHtml}
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Análise de convergência e divergência</h2>
  <p style="font-size:10pt;">Cada departamento é classificado conforme a magnitude da variação dos seus 8 fatores em relação à média da empresa. Diferenças de até 10 pontos indicam convergência. Diferenças superiores com agravamento indicam divergência crítica; superiores com atenuação indicam divergência positiva.</p>
  ${cards}
</section>`;
}

function renderCritico(input: Nr1TemplateInput): string {
  if (!input.departamentoCritico) return '';
  const c = input.departamentoCritico;
  const badges = c.fatoresCriticos
    .map((f) => `<div class="critico-badge">${escapeHtml(f)}</div>`)
    .join('');
  return `<section class="page-break">
  <h2>Departamento em situação crítica</h2>
  <p style="font-size:10pt;">Identificação automática do departamento com maior magnitude de divergência negativa entre todos os avaliados no ciclo. Merece atenção prioritária nos próximos passos operacionais.</p>
  <div class="critico-card">
    <div class="critico-head">
      <div class="critico-icon">!</div>
      <div>
        <div class="critico-name">${escapeHtml(c.nome)}</div>
        <div class="critico-count">${c.fatoresCriticos.length} fator(es) em divergência crítica</div>
      </div>
    </div>
    <div class="critico-body">${escapeHtml(c.diagnostico)}</div>
    <div class="critico-badges">${badges}</div>
  </div>
</section>`;
}

function renderAlertas(input: Nr1TemplateInput): string {
  if (input.alertas.length === 0) return '';
  const cards = input.alertas
    .map((a) => {
      const isCritical = a.score < 40;
      const escopoTxt =
        a.escopo === 'empresa'
          ? 'Escopo empresa'
          : `Escopo departamento · ${escapeHtml(a.departamentoNome ?? '-')}`;
      const titulo =
        a.escopo === 'departamento'
          ? `${escapeHtml(a.fatorNome)} — ${escapeHtml(a.departamentoNome ?? '')}`
          : `${escapeHtml(a.fatorNome)} — Empresa`;
      return `<div class="alert-card${isCritical ? ' critical' : ''}">
  <div class="alert-icon${isCritical ? ' critical' : ''}">!</div>
  <div class="alert-info">
    <div class="alert-title">${titulo}</div>
    <div class="alert-sub">${classificarTipoFator(a.fatorNome)} · ${escopoTxt}</div>
  </div>
  <div class="alert-score${isCritical ? '' : ' yellow'}">${fmtScore(a.score)}</div>
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Alertas informativos por fator</h2>
  <p style="font-size:10pt;">Registro de todos os fatores que ficaram com score inferior a 50 em qualquer escopo (empresa ou departamento) no ciclo. Alertas são informativos e não substituem análise por profissional habilitado.</p>
  ${cards}
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Legenda de intensidade.</strong> <span class="cs-red fw-700">Vermelho intenso</span> indica escopo com score inferior a 40. <span class="cs-yellow fw-700">Amarelo escuro</span> indica escopo com score entre 40 e 49.</p>
</section>`;
}

function renderComparacaoAnterior(input: Nr1TemplateInput): string {
  const comp = input.comparacaoCicloAnterior;
  if (!comp) return '';
  const atualPorFator = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
  const rows = comp.fatores
    .map((f) => {
      const atual = atualPorFator.get(f.nome) ?? 0;
      const variacao = atual - f.score;
      const direction: 'up' | 'down' | 'eq' =
        variacao > 0.5 ? 'up' : variacao < -0.5 ? 'down' : 'eq';
      const arrow = direction === 'up' ? '▲ +' : direction === 'down' ? '▼ ' : '▬ ';
      const rowClass = Math.abs(variacao) >= 5 ? (direction === 'up' ? 'row-up' : 'row-down') : '';
      return `<tr class="${rowClass}">
  <td>${escapeHtml(f.nome)}</td>
  <td class="right" style="color:#6B7280; font-size:9pt;">${classificarTipoFator(f.nome).replace('Fator de ', '')}</td>
  <td class="right fw-700">${fmtScore(atual)}</td>
  <td class="right">${fmtScore(f.score)}</td>
  <td class="right variacao ${direction}">${arrow}${Math.abs(variacao).toFixed(1)}</td>
</tr>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação com ciclo anterior</h2>
  <p style="font-size:10pt;">Variação dos scores por fator no escopo empresa em relação ao ciclo imediatamente anterior fechado <strong>(${escapeHtml(comp.cicloRotulo)})</strong>. Variações superiores a 5 pontos são destacadas em cor.</p>
  <table class="data-table">
    <thead>
      <tr>
        <th>Fator</th>
        <th class="right">Tipo</th>
        <th class="right">Ciclo atual</th>
        <th class="right">Ciclo anterior</th>
        <th class="right">Variação</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

const HIST_PALETA: Record<string, string> = {
  'Exigências quantitativas': '#D97706',
  'Ritmo de trabalho': '#EA580C',
  'Conflitos de papel': '#DC2626',
  Autonomia: '#16A34A',
  'Insegurança no trabalho': '#991B1B',
};
const HIST_FATORES_ALVO = [
  'Exigências quantitativas',
  'Ritmo de trabalho',
  'Conflitos de papel',
  'Autonomia',
  'Insegurança no trabalho',
] as const;

function renderComparacaoHistorica(input: Nr1TemplateInput): string {
  const comps = input.comparacaoHistorica;
  if (!comps || comps.length < 2) return '';
  const widthViewBox = 800;
  const heightViewBox = 280;
  const chartLeft = 60;
  const chartRight = 780;
  const chartTop = 20;
  const chartBottom = 230;
  const totalCiclos = comps.length;
  const xStep = (chartRight - chartLeft) / (totalCiclos - 1);
  const yFor = (score: number): number => {
    const clamp = Math.max(0, Math.min(100, score));
    return chartBottom - (clamp / 100) * (chartBottom - chartTop);
  };
  const polylines = HIST_FATORES_ALVO.map((fatorNome) => {
    const color = HIST_PALETA[fatorNome] ?? '#374151';
    const pts: string[] = [];
    const circles: string[] = [];
    comps.forEach((c, idx) => {
      const f = c.fatores.find((x) => x.nome === fatorNome);
      if (f === undefined) return;
      const x = chartLeft + idx * xStep;
      const y = yFor(f.score);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`);
    });
    if (pts.length < 2) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />${circles.join('')}`;
  }).join('\n');
  const legendaChart = HIST_FATORES_ALVO.map(
    (f) =>
      `<span style="display:inline-flex; align-items:center; gap:1.5mm; margin-right:4mm; font-size:8.5pt;"><span style="display:inline-block; width:3mm; height:1mm; border-radius:1pt; background:${HIST_PALETA[f]};"></span>${escapeHtml(abreviarFator(f))}</span>`,
  ).join('');
  const xLabels = comps
    .map((c, idx) => {
      const x = chartLeft + idx * xStep;
      return `<text x="${x.toFixed(1)}" y="258" font-family="Liberation Sans, system-ui, sans-serif" font-size="9" fill="#6B7280" text-anchor="middle" font-weight="600">${escapeHtml(c.cicloRotulo)}</text>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação histórica de longo prazo</h2>
  <p style="font-size:10pt;">Evolução dos scores por fator ao longo dos últimos ciclos executados. A linha tracejada vermelha marca o limite crítico de score 50.</p>
  <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8pt; padding:4mm 5mm; margin-top:3mm;">
    <div style="margin-bottom:3mm; padding-bottom:2mm; border-bottom:1px solid #E5E7EB;">${legendaChart}</div>
    <svg viewBox="0 0 ${widthViewBox} ${heightViewBox}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
      <g stroke="#E5E7EB" stroke-width="1">
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartRight}" y2="${chartTop}" />
        <line x1="${chartLeft}" y1="${(chartTop + chartBottom) / 2}" x2="${chartRight}" y2="${(chartTop + chartBottom) / 2}" />
        <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" />
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom + 10}" stroke="#9CA3AF" />
      </g>
      <g font-family="Liberation Sans, system-ui, sans-serif" font-size="9" fill="#9CA3AF" text-anchor="end">
        <text x="${chartLeft - 6}" y="${chartTop + 4}">100</text>
        <text x="${chartLeft - 6}" y="${(chartTop + chartBottom) / 2 + 4}">50</text>
        <text x="${chartLeft - 6}" y="${chartBottom + 4}">0</text>
      </g>
      <line x1="${chartLeft}" y1="${yFor(50)}" x2="${chartRight}" y2="${yFor(50)}" stroke="#DC2626" stroke-width="1" stroke-dasharray="3,3" opacity="0.5" />
      <text x="${chartRight - 10}" y="${yFor(50) - 4}" font-family="Liberation Sans, system-ui, sans-serif" font-size="8" fill="#DC2626" text-anchor="end" opacity="0.7">Alerta (50)</text>
      ${xLabels}
      ${polylines}
    </svg>
  </div>
</section>`;
}

function renderRastreabilidade(input: Nr1TemplateInput): string {
  const notaAuditoria = input.notaAuditoriaEdicao
    ? `<div class="edit-note"><strong>Nota de auditoria — data de fechamento editada.</strong> A data de fechamento original deste ciclo era ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoOriginal))}. Foi alterada para ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoAtual))} em ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.ultimaEdicaoEm))} por ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoPor)}. Motivo registrado: <em>${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoJustificativa)}</em></div>`
    : '';
  const invalidados = Math.max(0, input.ciclo.totalElegiveis - input.ciclo.totalRespondentes);
  // Correcao canonica CC079-v4: "as 07:28" -> "às 07:28" (acento agudo
  // obrigatorio no advérbio de hora em pt-BR). Protege contra output
  // antigo do `toTimestampBrt` que emitia "as" sem crase.
  const geradoEmBrt = (toTimestampBrt(input.generatedAtIso) ?? input.generatedAtIso).replace(
    /\bas\b/g,
    'às',
  );
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <p style="font-size:10pt;">Este relatório foi gerado automaticamente pelo módulo Radar NR-1 do ROIP APP no fechamento do ciclo, a partir das respostas válidas registradas em base de dados. Os campos abaixo permitem a verificação técnica e histórica do documento.</p>
  <div class="trace-card">
    <div><strong>Empresa:</strong> ${escapeHtml(input.company.nomeFantasia)}</div>
    <div><strong>Identificador do ciclo:</strong> <code>${escapeHtml(input.ciclo.cicloRotulo)}</code></div>
    <div><strong>Data de abertura:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataAbertura))} · <strong>Data de fechamento:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataFechamento))}</div>
    <div><strong>Respondentes elegíveis:</strong> ${input.ciclo.totalElegiveis} · <strong>Efetivos válidos:</strong> ${input.ciclo.totalRespondentes} · <strong>Diferença (invalidados + não respondidos):</strong> ${invalidados}</div>
    <div><strong>Gerado em:</strong> ${escapeHtml(geradoEmBrt)}</div>
    <div><strong>Escala do instrumento:</strong> 0 (Nunca) · 1 (Quase nunca) · 2 (Às vezes) · 3 (Quase sempre) · 4 (Sempre)</div>
  </div>
  ${notaAuditoria}
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Nota final.</strong> O ciclo, uma vez fechado, é imutável. Este relatório pode ser regerado a qualquer momento a partir da base de dados original, apresentando idêntico conteúdo.</p>
</section>`;
}

/**
 * Renderiza o HTML do Radar NR-1 (ME-1.3c CC079-v4).
 * Secoes vazias sao suprimidas; sugestoes de proximos passos eliminada.
 */
export function renderNr1ReportHTML(input: Nr1TemplateInput): string {
  const partes: string[] = [];
  partes.push(renderCapa(input));
  partes.push(renderResumoExecutivo(input));
  partes.push(renderRadarEmpresa(input));
  partes.push(renderDescricoesFatoresPagina(input));
  partes.push(renderRadarDepartamentos(input));
  partes.push(renderInsuficientes(input));
  partes.push(renderDivergencias(input));
  partes.push(renderCritico(input));
  partes.push(renderAlertas(input));
  partes.push(renderComparacaoAnterior(input));
  partes.push(renderComparacaoHistorica(input));
  partes.push(renderRastreabilidade(input));
  const bodyHtml = partes.filter((p) => p.length > 0).join('\n');

  return renderLayoutBase({
    title: 'Radar NR-1',
    company: input.company,
    bodyHtml,
    footerLeft: `Radar NR-1 · ${input.company.nomeFantasia} · ${input.ciclo.cicloRotulo}`,
    footerCenter: input.ciclo.cicloRotulo,
  });
}
