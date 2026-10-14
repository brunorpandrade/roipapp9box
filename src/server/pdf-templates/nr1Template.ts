/* eslint-disable @stylistic/max-len -- template HTML canonico com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — template PDF Radar NR-1 (ME-050/51, S257).
//
// Renderizacao HTML deterministica do relatorio do Radar NR-1
// (DOC 03 §11.12). Consumido por `nr1.downloadReport` (Route Handler);
// convertido em PDF pela toolchain `pdfRenderer.ts` (Puppeteer via
// `puppeteer-core`).
//
// Regime canonico (§11.12):
// - Renderizacao DETERMINISTICA (mesmos dados = mesmo PDF byte a byte,
//   exceto o timestamp de geracao).
// - 100% template — SEM participacao de IA.
// - Estrutura canonica em 13 paginas: capa, sumario, resumo executivo,
//   radar da empresa (8 fatores), radar por departamento, departamentos
//   com amostra insuficiente, analise de convergencia/divergencia,
//   departamento em situacao critica, alertas informativos por fator,
//   comparacao com ciclo anterior, comparacao historica de longo prazo,
//   sugestoes de proximos passos, rastreabilidade (com nota de auditoria
//   condicional se `dataFechamentoOriginal` esta presente).
// - Nome canonico do arquivo:
//   `Radar_NR-1_[nome_empresa_normalizado]_[data_abertura]_[data_geracao].pdf`.
//   Normalizacao: espaco -> underscore, remove acentos, remove
//   caracteres especiais, limita a 40 caracteres.

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

/** Score de um dos 8 fatores canonicos. */
export interface Nr1FatorScore {
  fatorId: number; // 1 a 8
  nome: string;
  score: number; // 0 a 100
}

/** Score por departamento. */
export interface Nr1DepartamentoScore {
  departamentoNome: string;
  amostra: number;
  fatores: Nr1FatorScore[];
}

/** Departamento com amostra abaixo do piso canonico (5). */
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

/**
 * Nota de auditoria canonica de edicao de data de fechamento (§11.12).
 * Somente presente se `copsoqCycles.dataFechamentoOriginal IS NOT NULL`.
 */
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
  dataAbertura: string; // YYYY-MM-DD
  dataFechamento: string; // YYYY-MM-DD
  totalRespondentes: number;
  totalElegiveis: number;
}

/** Input canonico do template. */
export interface Nr1TemplateInput {
  company: LayoutBaseCompany;
  ciclo: Nr1CicloInfo;
  resumoExecutivo: string;
  radarEmpresa: Nr1FatorScore[]; // 8 fatores canonicos
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
  /** Data e hora de geracao (rodape + rastreabilidade). */
  generatedAtIso: string;
  /** Data curta para o filename (YYYY-MM-DD). */
  generatedAtDate: string;
}

/**
 * Normalizacao canonica do nome da empresa para o filename (§11.12):
 * 1. Substituir espacos por underscore.
 * 2. Remover acentos (NFD + strip).
 * 3. Remover caracteres especiais (`&`, `.`, `,`, `/`, `\`, `:`, `;`,
 *    `!`, `?`, `*`, `"`, `'`, `<`, `>`, `|`).
 * 4. Limitar a 40 caracteres.
 */
export function normalizeNomeEmpresaForFilename(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const semEspacosSubst = semAcento.replace(/\s+/g, '_');
  const semEspecial = semEspacosSubst.replace(/[&.,/\\:;!?*"'<>|]/g, '');
  const limitado = semEspecial.slice(0, 40);
  return limitado.length > 0 ? limitado : 'Empresa';
}

/**
 * Compoe o nome canonico do arquivo PDF conforme §11.12.
 * `Radar_NR-1_[nomeNorm]_[dataAbertura]_[dataGeracao].pdf`.
 */
export function composeNr1ReportFilename(
  nomeEmpresa: string,
  dataAbertura: string,
  dataGeracao: string,
): string {
  const nomeNorm = normalizeNomeEmpresaForFilename(nomeEmpresa);
  return `Radar_NR-1_${nomeNorm}_${dataAbertura}_${dataGeracao}.pdf`;
}

function renderCapa(input: Nr1TemplateInput): string {
  return `<section>
  <h1>Radar NR-1</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.company.nomeFantasia)}</p>
  <p><strong>Ciclo:</strong> ${escapeHtml(input.ciclo.cicloRotulo)}</p>
  <p><strong>Período:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataAbertura))} a ${escapeHtml(formatDateBR(input.ciclo.dataFechamento))}</p>
  <p><strong>Respondentes:</strong> ${input.ciclo.totalRespondentes} de ${input.ciclo.totalElegiveis}</p>
  <p class="muted">Radar diagnóstico preliminar dos 8 fatores psicossociais no ambiente de trabalho. Não substitui os instrumentos e processos formais.</p>
</section>`;
}

function renderSumario(): string {
  const items = [
    'Resumo executivo',
    'Radar da empresa',
    'Radar por departamento',
    'Departamentos com amostra insuficiente',
    'Análise de convergência e divergência',
    'Departamento em situação crítica',
    'Alertas informativos por fator',
    'Comparação com ciclo anterior',
    'Comparação histórica',
    'Sugestões de próximos passos',
    'Rastreabilidade',
  ];
  const lis = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('\n');
  return `<section class="page-break">
  <h2>Sumário</h2>
  <ol>
${lis}
  </ol>
</section>`;
}

function renderResumoExecutivo(texto: string): string {
  return `<section class="page-break">
  <h2>Resumo executivo</h2>
  <p>${escapeHtml(texto)}</p>
</section>`;
}

// ============================================================
// Radar SVG canonico (ME-1.3c)
// ============================================================

// Geometria canonica do radar — espelho bit-exact do mockup
// `relatorio_radar_nr1_v1.html` pagina 4.
const RADAR_SVG_CX = 200;
const RADAR_SVG_CY = 200;
const RADAR_SVG_MAX_RADIUS = 140;
const RADAR_SVG_VIEWBOX = '0 0 400 380';
const RADAR_SVG_NUM_RINGS = 4;

/** Rotulos canonicos externos dos 8 eixos — projecao com margem. */
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
      return (
        `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" text-anchor="middle" ` +
        `font-size="10" font-weight="600" fill="${RADAR_COLORS.labelFill}">${label}</text>`
      );
    })
    .join('\n');
}

/** Abreviacao canonica dos nomes longos para caber no label do SVG. */
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

/**
 * Renderiza o radar SVG canonico (8 eixos + 4 aneis + poligono do
 * dado + pontos por eixo + rotulos). Compara opcionalmente contra
 * um radar de referencia (media empresa — tracejado cinza).
 */
function renderRadarSvg(
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  // Radar canonico exige pelo menos 3 eixos para render geometrico
  // deterministico (poligono fechado). Fatores < 3 fazem fallback para
  // string vazia — o renderRadarLegend adjacente ja apresenta os scores
  // em tabela, preservando a leitura canonica.
  if (fatores.length < 3) {
    return '';
  }
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
      )}" fill="none" stroke="${RADAR_COLORS.mediaEmpresaStroke}" stroke-width="1.5" ` +
      `stroke-dasharray="${RADAR_COLORS.mediaEmpresaDasharray}" />`
    : '';
  return (
    `<svg viewBox="${RADAR_SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ` +
    `style="width:100%; max-width:90mm; height:auto; display:block;">
${renderRadarGridSvg(
  scores.length,
  RADAR_SVG_CX,
  RADAR_SVG_CY,
  RADAR_SVG_MAX_RADIUS,
  RADAR_SVG_NUM_RINGS,
  RADAR_COLORS.gridStroke,
)}
${referenciaPoly}
<polygon points="${polygonPoints}" fill="${RADAR_COLORS.teal}" ` +
    `fill-opacity="${RADAR_COLORS.tealFillOpacity}" stroke="${RADAR_COLORS.teal}" stroke-width="2" />
<g fill="${RADAR_COLORS.teal}">
${dataPoints}
</g>
${renderRadarAxisLabels(fatores)}
</svg>`
  );
}

/** Legenda canonica a direita do radar — dot colorido + score + faixa. */
function renderRadarLegend(fatores: readonly Nr1FatorScore[]): string {
  const items = fatores
    .map((f) => {
      const faixa: Nr1Faixa = classificarNr1Faixa(f.score);
      const dotColor = RADAR_NR1_CORES[faixa];
      const scoreFmt = Math.max(0, Math.min(100, f.score)).toFixed(1);
      return (
        `<tr>
    <td style="padding:4px 10px 4px 0;">
      <span style="display:inline-block; width:9px; height:9px; border-radius:50%; ` +
        `background:${dotColor}; margin-right:6px;"></span>
      <span style="color:${RADAR_COLORS.labelFill}; font-weight:500;">` +
        `${escapeHtml(f.nome)}</span>
    </td>
    <td style="text-align:right; font-weight:700; color:${dotColor};">${scoreFmt}</td>
  </tr>`
      );
    })
    .join('\n');
  return `<table style="width:100%; border-collapse:collapse; font-size:9.5pt;">
${items}
</table>`;
}

/** Linha SVG + legenda canonica compartilhada por empresa e dept. */
function renderRadarBlock(
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  return `<table style="width:100%; border-collapse:collapse; margin-bottom:4mm;">
  <tr>
    <td style="width:52%; vertical-align:top; padding-right:8mm;">
${renderRadarSvg(fatores, referencia)}
    </td>
    <td style="vertical-align:top;">
${renderRadarLegend(fatores)}
    </td>
  </tr>
</table>`;
}

function renderRadarEmpresa(fatores: Nr1FatorScore[]): string {
  return (
    `<section class="page-break">
  <h2>Radar da empresa (8 fatores canônicos)</h2>
  <p class="muted" style="font-size:9pt;">Legenda: ` +
    `<span style="color:${RADAR_NR1_CORES.verde}; font-weight:700;">verde (66-100)</span> ` +
    `satisfatório · ` +
    `<span style="color:${RADAR_NR1_CORES.amarelo}; font-weight:700;">amarelo (50-65)</span> ` +
    `atenção · ` +
    `<span style="color:${RADAR_NR1_CORES.vermelho}; font-weight:700;">vermelho (0-49)</span> ` +
    `crítico.</p>
${renderRadarBlock(fatores)}
</section>`
  );
}

function renderRadarDepartamentos(
  deps: Nr1DepartamentoScore[],
  radarEmpresa?: readonly Nr1FatorScore[],
): string {
  if (deps.length === 0) {
    return `<section class="page-break"><h2>Radar por departamento</h2><p class="muted">Nenhum departamento com amostra suficiente para radar próprio.</p></section>`;
  }
  const blocks = deps
    .map(
      (d) =>
        `<h3>${escapeHtml(d.departamentoNome)} <span class="muted">(amostra ${d.amostra})</span></h3>
${renderRadarBlock(d.fatores, radarEmpresa)}`,
    )
    .join('\n');
  return (
    `<section class="page-break">
  <h2>Radar por departamento</h2>
  <p class="muted" style="font-size:9pt;">Polígono em teal: departamento. ` +
    `Tracejado cinza: média da empresa (referência).</p>
  ${blocks}
</section>`
  );
}

function renderInsuficientes(items: Nr1DepartamentoInsuficiente[]): string {
  if (items.length === 0) {
    return `<section class="page-break"><h2>Departamentos com amostra insuficiente</h2><p class="muted">Nenhum.</p></section>`;
  }
  const lis = items
    .map((i) => `<li>${escapeHtml(i.departamentoNome)} — amostra ${i.amostra}</li>`)
    .join('\n');
  return `<section class="page-break">
  <h2>Departamentos com amostra insuficiente</h2>
  <p class="muted">Piso mínimo canônico: 5 respondentes por escopo.</p>
  <ul>
${lis}
  </ul>
</section>`;
}

function renderDivergencias(items: Nr1DivergenceEntry[]): string {
  // NR1·5 (ME-B11.1b): estado vazio canonico quando nao ha
  // divergencias relevantes OU quando a tabela
  // `nr1AreaDivergenceAnalysis` nao tem entradas validas (ex.: ciclos
  // seed sem calculo completo). Antes desta ME + do fix no
  // `nr1Report.ts`, 6 bullets "Fator 0 ... 0.0 ... 0.0 (gap 0.0)"
  // vazavam na pagina 7 do PDF.
  if (items.length === 0) {
    return `<section class="page-break"><h2>Análise de convergência e divergência</h2><p class="muted">Sem análise de convergência e divergência para este ciclo.</p></section>`;
  }
  const lis = items
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.fatorNome)}</strong> — ${escapeHtml(e.departamentoNome)}: empresa ${e.scoreEmpresa.toFixed(1)}, departamento ${e.scoreDepartamento.toFixed(1)} (gap ${e.gap.toFixed(1)}).</li>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Análise de convergência e divergência</h2>
  <ul>
${lis}
  </ul>
</section>`;
}

function renderCritico(input: Nr1TemplateInput): string {
  if (!input.departamentoCritico) {
    return `<section class="page-break"><h2>Departamento em situação crítica</h2><p class="muted">Nenhum departamento em situação crítica identificado.</p></section>`;
  }
  const c = input.departamentoCritico;
  const lis = c.fatoresCriticos.map((f) => `<li>${escapeHtml(f)}</li>`).join('\n');
  return `<section class="page-break">
  <h2>Departamento em situação crítica</h2>
  <p><strong>Departamento:</strong> ${escapeHtml(c.nome)}</p>
  <p><strong>Fatores críticos:</strong></p>
  <ul>${lis}</ul>
  <p>${escapeHtml(c.diagnostico)}</p>
</section>`;
}

function renderAlertas(alertas: Nr1AlertaFator[]): string {
  if (alertas.length === 0) {
    return `<section class="page-break"><h2>Alertas informativos por fator</h2><p class="muted">Sem alertas gerados neste ciclo.</p></section>`;
  }
  const lis = alertas
    .map((a) => {
      const escopo =
        a.escopo === 'empresa'
          ? 'empresa'
          : `departamento ${escapeHtml(a.departamentoNome ?? '-')}`;
      // ME-1.3b: score canonicamente formatado em pt-BR (`39,1` em vez
      // de `39.1`); separador `:` em vez de travessao `—` (preferencia
      // canonica de Bruno). Formato explicito via toLocaleString evita
      // drift entre ambientes com Intl locale diferente.
      const scoreBr = a.score.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return `<li>${escapeHtml(a.fatorNome)}: ${escopo}, score ${scoreBr}.</li>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Alertas informativos por fator</h2>
  <p class="muted">Regra canônica §11.13: score &lt; 50.</p>
  <ul>
${lis}
  </ul>
</section>`;
}

function renderComparacaoAnterior(comp: Nr1ComparacaoCiclo | undefined): string {
  if (!comp) {
    return `<section class="page-break"><h2>Comparação com ciclo anterior</h2><p class="muted">Sem ciclo anterior comparável.</p></section>`;
  }
  const rows = comp.fatores
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.nome)}</td><td style="text-align:right;">${f.score.toFixed(1)}</td></tr>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação com ciclo anterior — ${escapeHtml(comp.cicloRotulo)}</h2>
  <table style="width:100%; border-collapse:collapse;">${rows}</table>
</section>`;
}

function renderComparacaoHistorica(comps: Nr1ComparacaoCiclo[] | undefined): string {
  if (!comps || comps.length === 0) {
    return `<section class="page-break"><h2>Comparação histórica</h2><p class="muted">Base histórica ainda insuficiente.</p></section>`;
  }
  const blocks = comps
    .map(
      (c) =>
        `<h3>${escapeHtml(c.cicloRotulo)}</h3>
${c.fatores.map((f) => `<p>${escapeHtml(f.nome)}: <strong>${f.score.toFixed(1)}</strong></p>`).join('\n')}`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação histórica</h2>
  ${blocks}
</section>`;
}

function renderSugestoes(items: string[]): string {
  if (items.length === 0) {
    return `<section class="page-break"><h2>Sugestões de próximos passos</h2><p class="muted">Sem sugestões automáticas para este ciclo.</p></section>`;
  }
  const lis = items.map((s) => `<li>${escapeHtml(s)}</li>`).join('\n');
  return `<section class="page-break">
  <h2>Sugestões de próximos passos</h2>
  <ul>
${lis}
  </ul>
</section>`;
}

function renderRastreabilidade(input: Nr1TemplateInput): string {
  // ME-1.3b: 3 datas da nota de auditoria canonicamente humanizadas em
  // DD/MM/YYYY via `formatDateBR`. Antes da ME-1.3b emitiam ISO cru.
  const notaAuditoria = input.notaAuditoriaEdicao
    ? `<p><em>A data de fechamento original deste ciclo era ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoOriginal))}. Foi alterada para ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoAtual))} em ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.ultimaEdicaoEm))} por ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoPor)}. Motivo registrado: ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoJustificativa)}.</em></p>`
    : '';
  return `<section class="page-break">
  <h2>Rastreabilidade</h2>
  <p><strong>Empresa:</strong> ${escapeHtml(input.company.nomeFantasia)}</p>
  <p><strong>Ciclo:</strong> ${escapeHtml(input.ciclo.cicloRotulo)}</p>
  <p><strong>Data de abertura do ciclo:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataAbertura))}</p>
  <p><strong>Data de fechamento do ciclo:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataFechamento))}</p>
  <p><strong>Gerado em:</strong> ${escapeHtml(toTimestampBrt(input.generatedAtIso) ?? input.generatedAtIso)}</p>
  ${notaAuditoria}
</section>`;
}

/**
 * Renderiza o HTML canonico do Radar NR-1 em PDF (13 paginas §11.12).
 * Deterministico: mesmos inputs -> mesma saida byte a byte (excluidas
 * `generatedAtIso` e `generatedAtDate`, que sao inputs do consumidor).
 */
export function renderNr1ReportHTML(input: Nr1TemplateInput): string {
  const bodyHtml = [
    renderCapa(input),
    renderSumario(),
    renderResumoExecutivo(input.resumoExecutivo),
    renderRadarEmpresa(input.radarEmpresa),
    renderRadarDepartamentos(input.radaresPorDepartamento, input.radarEmpresa),
    renderInsuficientes(input.departamentosInsuficientes),
    renderDivergencias(input.divergencias),
    renderCritico(input),
    renderAlertas(input.alertas),
    renderComparacaoAnterior(input.comparacaoCicloAnterior),
    renderComparacaoHistorica(input.comparacaoHistorica),
    renderSugestoes(input.sugestoesProximosPassos),
    renderRastreabilidade(input),
  ].join('\n\n');

  return renderLayoutBase({
    title: `Radar NR-1 — ${input.company.nomeFantasia} — ${input.ciclo.cicloRotulo}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${toTimestampBrt(input.generatedAtIso) ?? input.generatedAtDate}`,
  });
}
