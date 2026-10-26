/* eslint-disable @stylistic/max-len -- template HTML canonico com strings de layout longas */
// ROIP APP 9BOX — template PDF Clima e engajamento (ME-053, S275).
//
// Renderizacao HTML deterministica do relatorio Clima e engajamento
// (DOC 03 §13.6). 100% template — SEM participacao de IA. Consumido
// por `exports.getClimaEngajamento` (Route Handler).
//
// Estrutura canonica em cascata organograma §13.6:
//   1. Visao geral da empresa.
//   2. Visao geral de cada departamento.
//   3. Detalhamento equipe a equipe dentro de cada departamento (com
//      nome do lider direto).
//
// Piso de anonimato canonico: aplicado em cada nivel da cascata.
// Grupos abaixo do piso sao agregados ao nivel imediatamente acima
// (mesma mecanica do Bloco Clima do relatorio executivo).
//
// ME-1.3d (26/10/2026): lapidacao visual estrutural canonica. Adota
// o padrao canonizado em Radar NR-1 (v7.2) + Snapshot 9-Box (v4):
// - Capa com `cover-hero` (titulo preto bold + accent teal) + meta
//   grid + nota contextual ambar + H2 "Resumo executivo" + 3 KPI
//   cards (respondentes, nota de clima, adesao) sobre o agregado
//   empresa.
// - Blocos empresa / dept / equipe com KPI cards compactos + barras
//   horizontais por dimensao (Engajamento/Desenvolvimento/
//   Pertencimento/Realizacao) em `.dim-bars`.
// - Nota de anonimato em `.clima-anonimato-nota` quando aplicavel.
// - Hierarquia visual canonica: dept em `.clima-nivel-dept`,
//   equipe em `.clima-nivel-equipe` (indent com border-left teal
//   claro).
// - Rastreabilidade final canonica em card cinza.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { escapeHtml, renderLayoutBase } from './layoutBase';

/** Bloco canonico de agregacao de Clima (empresa/depto/equipe). */
export interface ClimaBlocoEscopo {
  titulo: string;
  respondentes: number;
  notaClima: number | null;
  adesao: number | null;
  porDimensao: {
    engajamento: number | null;
    desenvolvimento: number | null;
    pertencimento: number | null;
    realizacao: number | null;
  };
  /**
   * Nota canonica de agregacao por anonimato — presente quando o
   * escopo original ficou abaixo do piso e foi agregado ao nivel
   * hierarquico imediatamente acima.
   */
  notaAgregacao: string | null;
}

/** Bloco de departamento com equipes internas. */
export interface ClimaBlocoDepartamento extends ClimaBlocoEscopo {
  equipes: ClimaBlocoEscopo[];
}

export interface ClimaEngajamentoTemplateInput {
  nomeFantasia: string;
  razaoSocialSanitizada: string;
  trimestre: string;
  /** Bloco da empresa (topo da cascata). */
  blocoEmpresa: ClimaBlocoEscopo;
  /** Blocos por departamento com equipes dentro (cascata). */
  blocosDepartamentos: ClimaBlocoDepartamento[];
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

function fmtPctInt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

function renderDimBar(rotulo: string, valor: number | null, maxEscala: number): string {
  if (valor === null || !Number.isFinite(valor)) {
    return `<div class="dim-bar-row">
      <div class="dim-bar-label">${escapeHtml(rotulo)}</div>
      <div class="dim-bar-track"></div>
      <div class="dim-bar-value">—</div>
    </div>`;
  }
  const pct = Math.max(0, Math.min(100, (valor / maxEscala) * 100));
  return `<div class="dim-bar-row">
    <div class="dim-bar-label">${escapeHtml(rotulo)}</div>
    <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="dim-bar-value">${fmtNum(valor)}</div>
  </div>`;
}

// ============================================================
// Filename canonico §13.6
// ============================================================

export function composeClimaEngajamentoFilename(
  razaoSocialSanitizada: string,
  trimestre: string,
  dataGeracaoIso: string,
): string {
  const d = new Date(dataGeracaoIso);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}_${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `clima_engajamento_${razaoSocialSanitizada}_${trimestre}_${stamp}.pdf`;
}

// ============================================================
// Secoes canonicas (padrao canonizado NR-1 v7.2 / Snapshot v4)
// ============================================================

function renderCapaMaisResumo(input: ClimaEngajamentoTemplateInput): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const bloco = input.blocoEmpresa;
  const notaClima = bloco.notaClima;
  const highlight =
    notaClima === null
      ? ''
      : notaClima >= 7.5
        ? 'highlight-green'
        : notaClima >= 5
          ? 'highlight-yellow'
          : 'highlight-red';
  const valueClass =
    notaClima === null ? '' : notaClima >= 7.5 ? 'green' : notaClima >= 5 ? 'yellow' : 'red';
  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Clima e engajamento</div>
    <div class="cover-title-line2">Agregados do trimestre</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Trimestre de referência</span><span class="cover-meta-value">${escapeHtml(formatTrimestreBR(input.trimestre))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> este relatório apresenta os agregados de clima e engajamento do último trimestre disponível. Estritamente determinístico — sem participação de IA. Grupos abaixo do piso de anonimato são agregados ao nível hierárquico imediatamente acima.
  </div>
  <h2 class="h2-compact">Resumo executivo</h2>
  <p class="resumo-exec-paragrafo">${fmtInt(bloco.respondentes)} respondente(s) no agregado da empresa, com nota de clima ${fmtNum(notaClima)}.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Respondentes</div>
      <div class="kpi-value">${fmtInt(bloco.respondentes)}</div>
      <div class="kpi-sub">${input.blocosDepartamentos.length} departamento(s) na cascata</div>
    </div>
    <div class="kpi-card ${highlight}">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value ${valueClass}">${fmtNum(notaClima)}</div>
      <div class="kpi-sub">Agregado empresa</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(bloco.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>
  </div>
</section>`;
}

interface RenderBlocoOptions {
  readonly nivel: 'empresa' | 'dept' | 'equipe';
  readonly headingLevel: 2 | 3 | 4;
}

function renderBloco(bloco: ClimaBlocoEscopo, options: RenderBlocoOptions): string {
  const h = `h${options.headingLevel}`;
  const notaClima = bloco.notaClima;
  const highlight =
    notaClima === null
      ? ''
      : notaClima >= 7.5
        ? 'highlight-green'
        : notaClima >= 5
          ? 'highlight-yellow'
          : 'highlight-red';
  const valueClass =
    notaClima === null ? '' : notaClima >= 7.5 ? 'green' : notaClima >= 5 ? 'yellow' : 'red';
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${highlight}">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value ${valueClass}">${fmtNum(notaClima)}</div>
      <div class="kpi-sub">${fmtInt(bloco.respondentes)} respondente(s)</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(bloco.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>`);
  const notaAgreg = bloco.notaAgregacao
    ? `<div class="clima-anonimato-nota">${escapeHtml(bloco.notaAgregacao)}</div>`
    : '';
  const cssNivel =
    options.nivel === 'dept'
      ? 'clima-nivel-dept'
      : options.nivel === 'equipe'
        ? 'clima-nivel-equipe'
        : 'clima-nivel-empresa';
  return `<div class="${cssNivel}">
    <${h}>${escapeHtml(bloco.titulo)}</${h}>
    <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr); margin-top:2mm;">${kpiCards.join('\n')}</div>
    <h${options.headingLevel + 1} class="h3-compact">Perfil por dimensão</h${options.headingLevel + 1}>
    <div class="dim-bars">
      ${renderDimBar('Engajamento', bloco.porDimensao.engajamento, 10)}
      ${renderDimBar('Desenvolvimento', bloco.porDimensao.desenvolvimento, 10)}
      ${renderDimBar('Pertencimento', bloco.porDimensao.pertencimento, 10)}
      ${renderDimBar('Realização', bloco.porDimensao.realizacao, 10)}
    </div>
    ${notaAgreg}
  </div>`;
}

function renderBlocoEmpresa(input: ClimaEngajamentoTemplateInput): string {
  return `<section class="page-break">
  <h2>Visão geral — Empresa</h2>
  <p>Agregado consolidado do trimestre no topo da cascata hierárquica. As dimensões abaixo compõem canonicamente a leitura de clima e engajamento.</p>
  ${renderBloco(input.blocoEmpresa, { nivel: 'empresa', headingLevel: 3 })}
</section>`;
}

function renderBlocoDepartamento(dept: ClimaBlocoDepartamento): string {
  const equipesHtml =
    dept.equipes.length === 0
      ? ''
      : dept.equipes.map((e) => renderBloco(e, { nivel: 'equipe', headingLevel: 4 })).join('\n');
  return `<section class="page-break">
  <h2>Departamento — ${escapeHtml(dept.titulo)}</h2>
  <p>Agregado do departamento e, abaixo, cada equipe com seus respectivos agregados. Grupos abaixo do piso são agregados ao nível imediatamente acima.</p>
  ${renderBloco(dept, { nivel: 'dept', headingLevel: 3 })}
  ${equipesHtml}
</section>`;
}

function renderRastreabilidade(input: ClimaEngajamentoTemplateInput): string {
  const timestampBrt = toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso;
  const totalEquipes = input.blocosDepartamentos.reduce((acc, d) => acc + d.equipes.length, 0);
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="rastreabilidade-card">
    <div class="rastreabilidade-row"><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</div>
    <div class="rastreabilidade-row"><strong>Trimestre:</strong> ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
    <div class="rastreabilidade-row"><strong>Respondentes agregado empresa:</strong> ${fmtInt(input.blocoEmpresa.respondentes)}</div>
    <div class="rastreabilidade-row"><strong>Departamentos na cascata:</strong> ${fmtInt(input.blocosDepartamentos.length)}</div>
    <div class="rastreabilidade-row"><strong>Equipes na cascata:</strong> ${fmtInt(totalEquipes)}</div>
    <div class="rastreabilidade-row"><strong>Gerado em:</strong> ${escapeHtml(timestampBrt)}</div>
  </div>
  <p class="rastreabilidade-nota"><strong>Nota final.</strong> O trimestre, uma vez fechado, é imutável. Este relatório pode ser regerado a qualquer momento a partir da base de dados original, apresentando idêntico conteúdo. 100% determinístico — nenhuma IA participou da geração.</p>
</section>`;
}

// ============================================================
// Funcao publica canonica
// ============================================================

export function renderClimaEngajamentoHTML(input: ClimaEngajamentoTemplateInput): string {
  const secoesDept = input.blocosDepartamentos.map((d) => renderBlocoDepartamento(d)).join('\n');
  const bodyHtml = [
    renderCapaMaisResumo(input),
    renderBlocoEmpresa(input),
    secoesDept,
    renderRastreabilidade(input),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
  return renderLayoutBase({
    title: `Clima e engajamento · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Clima e engajamento · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
