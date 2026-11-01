/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Clima e engajamento (ME-053, S275;
// ME-1.3d-REV DIS-B reescrita integral).
//
// Renderizacao HTML deterministica do relatorio Clima e engajamento
// (DOC 03 §13.6). 100% template — SEM participacao de IA. Consumido
// por `exports.getClimaEngajamento` (Route Handler).
//
// ME-1.3d-REV DIS-B (31/10/2026):
// - Pluralizacao sempre no plural (sem `(s)/(es)`).
// - Logo canto superior direito via layoutBase (DIS-A).
// - Agregado empresa carrega 5 aspectos por dimensao (barras
//   horizontais) consumindo `notasPorAspecto` + `TEXTOS_QUESTOES_CLIMA`.
// - Dept e equipe exibem apenas as 4 notas de dimensao + nota geral
//   consolidada.
// - Cascata Opcao B canonica: tabela unica por departamento com
//   equipes como linhas-filha, sem repetir o nome do departamento no
//   cabecalho interno.
// - Zero mencao a `canonico/canonica` em texto user-facing.
//
// Determinismo: mesmo input = mesmo HTML byte a byte, exceto
// `geradoEmIso` no rodape.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { TEXTOS_QUESTOES_CLIMA, rotuloDimensaoClima } from '../../lib/climate/textosQuestoesClima';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { escapeHtml, renderLayoutBase } from './layoutBase';

/**
 * Bloco de agregacao de Clima (empresa/depto/equipe). Agregado empresa
 * pode popular `notasPorAspecto` com 20 posicoes para o detalhamento
 * horizontal por aspecto; dept e equipe deixam `null`.
 */
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
   * Notas por aspecto (20 posicoes `(dim-1)*5+(item-1)`) — populado
   * APENAS no bloco empresa (DIS-B). `null` ou ausente nos demais
   * blocos.
   */
  notasPorAspecto?: readonly (number | null)[] | null;
  /**
   * Nota de agregacao por anonimato — presente quando o escopo original
   * ficou abaixo do piso e foi agregado ao nivel hierarquico
   * imediatamente acima.
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
  blocoEmpresa: ClimaBlocoEscopo;
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

// Barra horizontal fina para aspectos (visual mais compacto que a
// dim-bar porque as 20 linhas precisam caber em uma pagina A4).
function renderAspectoBar(texto: string, valor: number | null, maxEscala: number): string {
  if (valor === null || !Number.isFinite(valor)) {
    return `<div class="aspecto-bar-row">
      <div class="aspecto-bar-label">${escapeHtml(texto)}</div>
      <div class="aspecto-bar-track"></div>
      <div class="aspecto-bar-value">—</div>
    </div>`;
  }
  const pct = Math.max(0, Math.min(100, (valor / maxEscala) * 100));
  return `<div class="aspecto-bar-row">
    <div class="aspecto-bar-label">${escapeHtml(texto)}</div>
    <div class="aspecto-bar-track"><div class="aspecto-bar-fill" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="aspecto-bar-value">${fmtNum(valor)}</div>
  </div>`;
}

// ============================================================
// Filename §13.6
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
// Secoes
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
  const totalDepts = input.blocosDepartamentos.length;
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
    <strong>⚠ Sobre este relatório:</strong> os agregados de clima e engajamento do último trimestre disponível. Grupos abaixo do piso de anonimato são agregados ao nível hierárquico imediatamente acima.
  </div>
  <h2 class="h2-compact">Resumo executivo</h2>
  <p class="resumo-exec-paragrafo">${fmtInt(bloco.respondentes)} respondentes no agregado da empresa, com nota de clima ${fmtNum(notaClima)}.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Respondentes</div>
      <div class="kpi-value">${fmtInt(bloco.respondentes)}</div>
      <div class="kpi-sub">${fmtInt(totalDepts)} departamentos na cascata</div>
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

/**
 * Agregado da empresa: 2 KPI cards + 4 dim-bars + 5 aspectos por
 * dimensao (barras horizontais consumindo `notasPorAspecto`).
 */
function renderBlocoEmpresa(input: ClimaEngajamentoTemplateInput): string {
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
  const notas = bloco.notasPorAspecto ?? null;
  const aspectosHtml = (() => {
    if (notas === null) return '';
    const dimBlocos: string[] = [];
    for (let dim = 1; dim <= 4; dim += 1) {
      const rotuloDim = rotuloDimensaoClima(dim);
      const linhas: string[] = [];
      for (let item = 1; item <= 5; item += 1) {
        const idx = (dim - 1) * 5 + (item - 1);
        const valor = notas[idx] ?? null;
        const texto = TEXTOS_QUESTOES_CLIMA[idx] ?? '';
        linhas.push(renderAspectoBar(texto, valor, 10));
      }
      dimBlocos.push(`<div class="aspecto-dim-group">
        <h4 class="aspecto-dim-title">${escapeHtml(rotuloDim)}</h4>
        <div class="aspecto-bars">${linhas.join('\n')}</div>
      </div>`);
    }
    return `<h3 class="h3-compact" style="margin-top:6mm;">Aspectos individuais por dimensão</h3>
    <div class="aspecto-dim-grid">${dimBlocos.join('\n')}</div>`;
  })();
  const notaAgreg = bloco.notaAgregacao
    ? `<div class="clima-anonimato-nota">${escapeHtml(bloco.notaAgregacao)}</div>`
    : '';
  return `<section class="page-break">
  <h2>Visão geral — Empresa</h2>
  <p>Agregado consolidado do trimestre no topo da cascata hierárquica.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr); margin-top:2mm;">
    <div class="kpi-card ${highlight}">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value ${valueClass}">${fmtNum(notaClima)}</div>
      <div class="kpi-sub">${fmtInt(bloco.respondentes)} respondentes</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(bloco.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>
  </div>
  <h3 class="h3-compact">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBar('Engajamento', bloco.porDimensao.engajamento, 10)}
    ${renderDimBar('Desenvolvimento', bloco.porDimensao.desenvolvimento, 10)}
    ${renderDimBar('Pertencimento', bloco.porDimensao.pertencimento, 10)}
    ${renderDimBar('Realização', bloco.porDimensao.realizacao, 10)}
  </div>
  ${notaAgreg}
  ${aspectosHtml}
</section>`;
}

/**
 * Cascata Opcao B: tabela unica por departamento com equipes como
 * linhas-filha. Cabecalho de dept carrega KPIs resumidos; linhas de
 * equipe aparecem como linhas internas identadas, sem repetir o nome
 * do departamento.
 */
function renderBlocoDepartamento(dept: ClimaBlocoDepartamento): string {
  const notaClima = dept.notaClima;
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
  const notaAgreg = dept.notaAgregacao
    ? `<div class="clima-anonimato-nota">${escapeHtml(dept.notaAgregacao)}</div>`
    : '';
  // Tabela cascata canonica: linha de dept + linhas-filha de equipe,
  // mesma estrutura visual Opcao B do relatorio executivo.
  const linhasCascata: string[] = [];
  linhasCascata.push(`<tr class="clima-row-dept">
      <td>Agregado do departamento</td>
      <td class="right">${fmtInt(dept.respondentes)}</td>
      <td class="right fw-700">${fmtNum(notaClima)}</td>
      <td class="right">${fmtPctInt(dept.adesao)}</td>
      <td class="right">${fmtNum(dept.porDimensao.engajamento)}</td>
      <td class="right">${fmtNum(dept.porDimensao.desenvolvimento)}</td>
      <td class="right">${fmtNum(dept.porDimensao.pertencimento)}</td>
      <td class="right">${fmtNum(dept.porDimensao.realizacao)}</td>
    </tr>`);
  for (const eq of dept.equipes) {
    linhasCascata.push(`<tr class="clima-row-equipe">
      <td><span class="clima-row-equipe-prefix">↳</span> ${escapeHtml(eq.titulo)}</td>
      <td class="right">${fmtInt(eq.respondentes)}</td>
      <td class="right fw-700">${fmtNum(eq.notaClima)}</td>
      <td class="right">${fmtPctInt(eq.adesao)}</td>
      <td class="right">${fmtNum(eq.porDimensao.engajamento)}</td>
      <td class="right">${fmtNum(eq.porDimensao.desenvolvimento)}</td>
      <td class="right">${fmtNum(eq.porDimensao.pertencimento)}</td>
      <td class="right">${fmtNum(eq.porDimensao.realizacao)}</td>
    </tr>`);
  }
  const notasAgregacaoEquipes = dept.equipes
    .filter((e) => e.notaAgregacao !== null)
    .map((e) => `${escapeHtml(e.titulo)}: ${escapeHtml(e.notaAgregacao ?? '')}`)
    .join(' · ');
  const notasEquipesHtml = notasAgregacaoEquipes
    ? `<div class="clima-anonimato-nota" style="margin-top:2mm;">${notasAgregacaoEquipes}</div>`
    : '';
  return `<section class="page-break">
  <h2>${escapeHtml(dept.titulo)}</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr); margin-top:2mm;">
    <div class="kpi-card ${highlight}">
      <div class="kpi-label">Nota de clima do departamento</div>
      <div class="kpi-value ${valueClass}">${fmtNum(notaClima)}</div>
      <div class="kpi-sub">${fmtInt(dept.respondentes)} respondentes</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(dept.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>
  </div>
  <h3 class="h3-compact">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBar('Engajamento', dept.porDimensao.engajamento, 10)}
    ${renderDimBar('Desenvolvimento', dept.porDimensao.desenvolvimento, 10)}
    ${renderDimBar('Pertencimento', dept.porDimensao.pertencimento, 10)}
    ${renderDimBar('Realização', dept.porDimensao.realizacao, 10)}
  </div>
  ${notaAgreg}
  <h3 class="h3-compact">Cascata por equipe</h3>
  <div class="exec-dept-table-wrap">
    <table class="data-table clima-cascata-tabela">
      <thead>
        <tr>
          <th>Agregado</th>
          <th class="right">Respondentes</th>
          <th class="right">Clima</th>
          <th class="right">Adesão</th>
          <th class="right">Engaj.</th>
          <th class="right">Desenv.</th>
          <th class="right">Pertenc.</th>
          <th class="right">Realiz.</th>
        </tr>
      </thead>
      <tbody>${linhasCascata.join('\n')}</tbody>
    </table>
  </div>
  ${notasEquipesHtml}
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
// Funcao publica
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
