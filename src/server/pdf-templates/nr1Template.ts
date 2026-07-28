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
  <p><strong>Período:</strong> ${escapeHtml(input.ciclo.dataAbertura)} a ${escapeHtml(input.ciclo.dataFechamento)}</p>
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

function renderRadarEmpresa(fatores: Nr1FatorScore[]): string {
  const rows = fatores
    .map((f) => {
      const pct = Math.max(0, Math.min(100, f.score));
      return `<tr>
    <td style="width:40%; padding:2mm 3mm 2mm 0;">${escapeHtml(f.nome)}</td>
    <td style="width:50%;">
      <div style="background:#e5e7eb; height:4mm;">
        <div style="background:#111827; width:${pct.toFixed(1)}%; height:4mm;"></div>
      </div>
    </td>
    <td style="width:10%; text-align:right;">${pct.toFixed(1)}</td>
  </tr>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Radar da empresa (8 fatores canônicos)</h2>
  <table style="width:100%; border-collapse:collapse;">
${rows}
  </table>
</section>`;
}

function renderRadarDepartamentos(deps: Nr1DepartamentoScore[]): string {
  if (deps.length === 0) {
    return `<section class="page-break"><h2>Radar por departamento</h2><p class="muted">Nenhum departamento com amostra suficiente para radar próprio.</p></section>`;
  }
  const blocks = deps
    .map(
      (d) =>
        `<h3>${escapeHtml(d.departamentoNome)} <span class="muted">(amostra ${d.amostra})</span></h3>
${d.fatores
  .map(
    (f) =>
      `<p>${escapeHtml(f.nome)}: <strong>${Math.max(0, Math.min(100, f.score)).toFixed(1)}</strong></p>`,
  )
  .join('\n')}`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Radar por departamento</h2>
  ${blocks}
</section>`;
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
  if (items.length === 0) {
    return `<section class="page-break"><h2>Convergência e divergência</h2><p class="muted">Sem divergências relevantes identificadas.</p></section>`;
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
      return `<li>${escapeHtml(a.fatorNome)} — ${escopo}, score ${a.score.toFixed(1)}.</li>`;
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
  const notaAuditoria = input.notaAuditoriaEdicao
    ? `<p><em>A data de fechamento original deste ciclo era ${escapeHtml(input.notaAuditoriaEdicao.dataFechamentoOriginal)}. Foi alterada para ${escapeHtml(input.notaAuditoriaEdicao.dataFechamentoAtual)} em ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoEm)} por ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoPor)}. Motivo registrado: ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoJustificativa)}.</em></p>`
    : '';
  return `<section class="page-break">
  <h2>Rastreabilidade</h2>
  <p><strong>Empresa:</strong> ${escapeHtml(input.company.nomeFantasia)}</p>
  <p><strong>Ciclo:</strong> ${escapeHtml(input.ciclo.cicloRotulo)}</p>
  <p><strong>Data de abertura do ciclo:</strong> ${escapeHtml(input.ciclo.dataAbertura)}</p>
  <p><strong>Data de fechamento do ciclo:</strong> ${escapeHtml(input.ciclo.dataFechamento)}</p>
  <p><strong>Gerado em:</strong> ${escapeHtml(input.generatedAtIso)}</p>
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
    renderRadarDepartamentos(input.radaresPorDepartamento),
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
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
