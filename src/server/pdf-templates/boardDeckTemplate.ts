/* eslint-disable @stylistic/max-len -- template HTML canonico */
// ROIP APP 9BOX — template PDF Board deck one-pager (ME-053, S275).
//
// Renderizacao HTML deterministica do Board deck (DOC 03 §13.8). 4
// elementos fixos, todos sempre presentes: (1) distribuicao 9-Box,
// (2) ROI agregado, (3) radar de riscos psicossociais, (4) turnover.
// Escopo canonico: empresa ou departamento (sem equipe).

import { escapeHtml, renderLayoutBase } from './layoutBase';
import { NINE_BOX_QUADRANTES, type NineBoxDistribuicao } from './snapshot9BoxTemplate';

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
  trimestre: string;
  escopoTipo: 'empresa' | 'departamento';
  escopoRotulo: string;
  /** Elemento 1: distribuicao 9-Box canonica. */
  nineBoxDistribuicao: NineBoxDistribuicao;
  totalClassificados: number;
  /** Elemento 2: ROI agregado + comparativos. */
  roi: {
    roiAgregado: number | null;
    variacaoTrimestreAnterior: number | null;
    variacaoAnoAnterior: number | null;
  };
  /** Elemento 3: 8 fatores canonicos com score 0-100. */
  radarPsicossocial: BoardDeckRadarFator[];
  /** Elemento 4: turnover. */
  turnover: {
    trimestralPercentual: number;
    anualizadoPercentual: number;
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

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

// ============================================================
// Filename canonico §13.8
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
// Secoes canonicas
// ============================================================

function renderCapaBloco(input: BoardDeckTemplateInput): string {
  const escopo =
    input.escopoTipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : `Departamento: ${escapeHtml(input.escopoRotulo)}`;
  return `<section>
  <h1>Board deck</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</p>
  <p><strong>Trimestre:</strong> ${escapeHtml(input.trimestre)}</p>
  <p><strong>Escopo:</strong> ${escopo}</p>
  <p class="muted">Board deck: resumo executivo ultra-condensado em 4 elementos canônicos.</p>
</section>`;
}

function renderElemento9Box(input: BoardDeckTemplateInput): string {
  const distro = input.nineBoxDistribuicao;
  const linhas = NINE_BOX_QUADRANTES.map(
    (q) => `<tr><td>${escapeHtml(q)}</td><td>${fmtInt(distro[q])}</td></tr>`,
  ).join('\n');
  return `<section class="page-break">
  <h2>1. Distribuição 9-Box</h2>
  <p class="muted">Total classificados: ${fmtInt(input.totalClassificados)}</p>
  <table class="grid">
    <thead><tr><th>Quadrante</th><th>Colaboradores</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
</section>`;
}

function renderElementoROI(input: BoardDeckTemplateInput): string {
  const r = input.roi;
  return `<section>
  <h2>2. ROI agregado</h2>
  <table class="kv">
    <tr><th>ROI do trimestre</th><td>${fmtNum(r.roiAgregado, 4)}</td></tr>
    <tr><th>Variação vs trimestre anterior</th><td>${fmtPct(r.variacaoTrimestreAnterior)}</td></tr>
    <tr><th>Variação vs mesmo trimestre ano anterior</th><td>${fmtPct(r.variacaoAnoAnterior)}</td></tr>
  </table>
</section>`;
}

function renderElementoRadar(input: BoardDeckTemplateInput): string {
  if (input.radarPsicossocial.length === 0) {
    return `<section>
  <h2>3. Radar de riscos psicossociais</h2>
  <p class="muted">Sem dados de Radar NR-1 disponíveis para este trimestre.</p>
</section>`;
  }
  const linhas = input.radarPsicossocial
    .map(
      (f) =>
        `<tr><td>${fmtInt(f.fatorId)}</td><td>${escapeHtml(f.nome)}</td><td>${fmtNum(f.scoreZeroCem, 0)}</td></tr>`,
    )
    .join('\n');
  return `<section>
  <h2>3. Radar de riscos psicossociais</h2>
  <table class="grid">
    <thead><tr><th>#</th><th>Fator</th><th>Score (0-100)</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
</section>`;
}

function renderElementoTurnover(input: BoardDeckTemplateInput): string {
  const t = input.turnover;
  const linhasBase = [
    `<tr><th>Turnover trimestral</th><td>${fmtPct(t.trimestralPercentual)}</td></tr>`,
    `<tr><th>Turnover anualizado</th><td>${fmtPct(t.anualizadoPercentual)}</td></tr>`,
  ];
  const nivel = t.aberturaPorNivel;
  const linhasNivel =
    nivel === null
      ? []
      : [
          `<tr><th>Estratégico</th><td>${fmtPct(nivel.estrategico.turnoverPercentual)} · ${fmtInt(nivel.estrategico.saidas)} saída(s)</td></tr>`,
          `<tr><th>Tático</th><td>${fmtPct(nivel.tatico.turnoverPercentual)} · ${fmtInt(nivel.tatico.saidas)} saída(s)</td></tr>`,
          `<tr><th>Operacional</th><td>${fmtPct(nivel.operacional.turnoverPercentual)} · ${fmtInt(nivel.operacional.saidas)} saída(s)</td></tr>`,
        ];
  return `<section>
  <h2>4. Turnover</h2>
  <table class="kv">${[...linhasBase, ...linhasNivel].join('\n')}</table>
</section>`;
}

// ============================================================
// Funcao publica canonica
// ============================================================

export function renderBoardDeckHTML(input: BoardDeckTemplateInput): string {
  const bodyHtml = [
    renderCapaBloco(input),
    renderElemento9Box(input),
    renderElementoROI(input),
    renderElementoRadar(input),
    renderElementoTurnover(input),
  ].join('\n');
  return renderLayoutBase({
    title: `Board deck · ${input.nomeFantasia} · ${input.trimestre}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerCenter: `Gerado em ${input.geradoEmIso}`,
  });
}
