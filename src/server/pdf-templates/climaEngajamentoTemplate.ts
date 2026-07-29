/* eslint-disable @stylistic/max-len -- template HTML canonico */
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

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${fmtNum(v)}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
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
// Secoes canonicas
// ============================================================

function renderCapaBloco(input: ClimaEngajamentoTemplateInput): string {
  return `<section>
  <h1>Clima e engajamento</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</p>
  <p><strong>Trimestre de referência:</strong> ${escapeHtml(input.trimestre)}</p>
  <p><strong>Data de geração:</strong> ${escapeHtml(input.geradoEmIso)}</p>
  <p class="muted">Este relatório apresenta os agregados de clima e engajamento do último trimestre disponível. Estritamente determinístico — sem participação de IA. Grupos abaixo do piso de anonimato são agregados ao nível hierárquico imediatamente acima.</p>
</section>`;
}

function renderBloco(bloco: ClimaBlocoEscopo, headingLevel: 2 | 3 | 4): string {
  const h = `h${headingLevel}`;
  const linhas: string[] = [];
  linhas.push(`<tr><th>Respondentes</th><td>${fmtInt(bloco.respondentes)}</td></tr>`);
  linhas.push(`<tr><th>Nota de clima</th><td>${fmtNum(bloco.notaClima)}</td></tr>`);
  linhas.push(`<tr><th>Adesão</th><td>${fmtPct(bloco.adesao)}</td></tr>`);
  linhas.push(`<tr><th>Engajamento</th><td>${fmtNum(bloco.porDimensao.engajamento)}</td></tr>`);
  linhas.push(
    `<tr><th>Desenvolvimento</th><td>${fmtNum(bloco.porDimensao.desenvolvimento)}</td></tr>`,
  );
  linhas.push(`<tr><th>Pertencimento</th><td>${fmtNum(bloco.porDimensao.pertencimento)}</td></tr>`);
  linhas.push(`<tr><th>Realização</th><td>${fmtNum(bloco.porDimensao.realizacao)}</td></tr>`);
  const notaAgreg = bloco.notaAgregacao
    ? `<p class="muted">${escapeHtml(bloco.notaAgregacao)}</p>`
    : '';
  return `<section class="page-break">
  <${h}>${escapeHtml(bloco.titulo)}</${h}>
  <table class="kv">${linhas.join('\n')}</table>
  ${notaAgreg}
</section>`;
}

// ============================================================
// Funcao publica canonica
// ============================================================

export function renderClimaEngajamentoHTML(input: ClimaEngajamentoTemplateInput): string {
  const secoesDept = input.blocosDepartamentos
    .map((d) => {
      const bloco = renderBloco(d, 3);
      const equipes = d.equipes.map((e) => renderBloco(e, 4)).join('\n');
      return [bloco, equipes].filter((s) => s.length > 0).join('\n');
    })
    .join('\n');
  const bodyHtml = [renderCapaBloco(input), renderBloco(input.blocoEmpresa, 2), secoesDept]
    .filter((s) => s.length > 0)
    .join('\n');
  return renderLayoutBase({
    title: `Clima e engajamento · ${input.nomeFantasia} · ${input.trimestre}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerCenter: `Gerado em ${input.geradoEmIso}`,
  });
}
