/* eslint-disable @stylistic/max-len -- template HTML canonico com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — template PDF Relatorio executivo trimestral
// (ME-053, S275).
//
// Renderizacao HTML deterministica em cascata canonica §7.5 do DOC 04
// consumindo `ExecutiveReportFinalPayload` (dados deterministicos +
// paragrafos IA + resumo executivo geral).
//
// Estrutura canonica §7.5:
//   1. Pagina de capa canonica — nome, trimestre, escopo, data.
//   2. Resumo executivo geral (paragrafo IA da 6a chamada).
//   3. Bloco sintese (5 blocos + 4 paragrafos IA quando escopo=equipe).
//   4. Bloco comparativo canonico (empresa apenas) — visao geral de
//      todos os departamentos lado a lado.
//   5. Detalhamento capilar canonico — cada departamento + equipes
//      (empresa e departamento apenas).
//
// ME-1.3d (26/10/2026): lapidacao visual estrutural canonica. Adota
// o padrao canonizado em Radar NR-1 (v7.2) + Snapshot 9-Box (v4):
// - Capa com `cover-hero` (titulo preto bold + accent teal) + meta
//   grid + nota contextual ambar.
// - Resumo executivo em `info-card` dedicado.
// - 5 blocos com KPI cards (financeiro, desempenho, plenitude, clima,
//   turnover) + barras de dimensao para plenitude e clima +
//   paragrafo IA em `info-card` teal.
// - Comparativo por departamento em `data-table` canonica.
// - Detalhamento capilar com cabecalho de dept + tabela de equipes.
// - Rastreabilidade final canonica em card cinza.
//
// Determinismo canonico: mesmo `ExecutiveReportFinalPayload` = mesmo
// HTML byte a byte, exceto `geradoEmIso` que vai no rodape.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import type { ExecutiveReportFinalPayload } from '../services/_shared/executiveReportTypes';

// ============================================================
// Helpers de formatacao canonica
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

function fmtPctInt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

function fmtMoeda(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function classesDeVariacao(variacao: number | null): {
  highlight: string;
  valueClass: string;
} {
  if (variacao === null || !Number.isFinite(variacao)) {
    return { highlight: '', valueClass: '' };
  }
  return variacao >= 0
    ? { highlight: 'highlight-green', valueClass: 'green' }
    : { highlight: 'highlight-red', valueClass: 'red' };
}

// ============================================================
// Dim-bar canonica (plenitude / clima)
// ============================================================

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
// Filename canonico §13.5 DOC 03
// ============================================================

/**
 * Compoe o nome canonico do arquivo PDF do Relatorio executivo:
 * `relatorio_executivo_[razaoSocialSanitizada]_[trimestre]_[YYYYMMDD_HHmm].pdf`
 * (§13.5). `dataGeracaoIso` e convertido em `YYYYMMDD_HHmm`.
 */
export function composeExecutiveReportFilename(
  razaoSocialSanitizada: string,
  trimestre: string,
  dataGeracaoIso: string,
): string {
  const d = new Date(dataGeracaoIso);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const stamp = `${yyyy}${mm}${dd}_${hh}${mi}`;
  return `relatorio_executivo_${razaoSocialSanitizada}_${trimestre}_${stamp}.pdf`;
}

// ============================================================
// Secoes canonicas §7.5 (padrao canonizado NR-1 v7.2 / Snapshot v4)
// ============================================================

function renderCapa(input: ExecutiveReportFinalPayload): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const escopoNome =
    input.escopo.tipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : input.escopo.tipo === 'departamento'
        ? `Departamento: ${input.escopo.rotulo}`
        : `Equipe: ${input.escopo.rotulo}`;
  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Relatório executivo</div>
    <div class="cover-title-line2">Fechamento trimestral</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Trimestre</span><span class="cover-meta-value">${escapeHtml(formatTrimestreBR(input.trimestre))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Escopo</span><span class="cover-meta-value">${escapeHtml(escopoNome)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> este relatório combina dados estruturados determinísticos com comentário interpretativo curto por bloco e um resumo executivo geral no topo. A IA nunca calcula — apenas interpreta os números já calculados. Mesmos dados geram sempre a mesma saída.
  </div>
</section>`;
}

function renderResumoExecutivo(texto: string): string {
  return `<section class="page-break">
  <h2>Resumo executivo geral</h2>
  <div class="info-card">
    <p style="margin:0;">${escapeHtml(texto)}</p>
  </div>
</section>`;
}

function renderBlocoFinanceiro(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoFinanceiro;
  const variacaoTri = b.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null;
  const variacaoAno = b.comparativoMesmoTrimestreAnoAnterior?.variacaoPercentualRoi ?? null;
  const classesTri = classesDeVariacao(variacaoTri);
  const classesAno = classesDeVariacao(variacaoAno);
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">ROI agregado</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.roiAgregado, 2)}</div>
      <div class="kpi-sub">Retorno sobre pessoas no trimestre</div>
    </div>`);
  if (variacaoTri !== null) {
    kpiCards.push(`<div class="kpi-card ${classesTri.highlight}">
      <div class="kpi-label">Variação vs. trimestre anterior</div>
      <div class="kpi-value ${classesTri.valueClass}">${fmtPct(variacaoTri)}</div>
      <div class="kpi-sub">ROI anterior: ${fmtNum(b.comparativoTrimestreAnterior?.roiAgregado ?? null, 2)}</div>
    </div>`);
  }
  if (variacaoAno !== null) {
    kpiCards.push(`<div class="kpi-card ${classesAno.highlight}">
      <div class="kpi-label">Variação vs. mesmo trim. ano anterior</div>
      <div class="kpi-value ${classesAno.valueClass}">${fmtPct(variacaoAno)}</div>
      <div class="kpi-sub">ROI mesmo trim. ano anterior: ${fmtNum(b.comparativoMesmoTrimestreAnoAnterior?.roiAgregado ?? null, 2)}</div>
    </div>`);
  }
  const linhasExtras: string[] = [];
  if (b.trimestreAtual.faturamentoMedioTrimestral !== null) {
    linhasExtras.push(
      `<tr><th>Faturamento médio trimestral</th><td>${fmtMoeda(b.trimestreAtual.faturamentoMedioTrimestral)}</td></tr>`,
    );
  }
  if (b.trimestreAtual.folhaTotalMedia !== null) {
    linhasExtras.push(
      `<tr><th>Folha total média</th><td>${fmtMoeda(b.trimestreAtual.folhaTotalMedia)}</td></tr>`,
    );
  }
  linhasExtras.push(
    `<tr><th>% da meta atingida</th><td>${fmtPct(b.trimestreAtual.percMetaAtingidaAgregada)}</td></tr>`,
  );
  linhasExtras.push(
    `<tr><th>Colaboradores ativos</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</td></tr>`,
  );
  const kpiGrid =
    kpiCards.length === 0
      ? ''
      : `<div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>`;
  return `<section class="page-break">
  <h2>Bloco Financeiro</h2>
  ${kpiGrid}
  <table class="kv" style="margin-top:4mm;">${linhasExtras.join('\n')}</table>
  <div class="info-card" style="margin-top:3mm;">
    <p style="margin:0;">${escapeHtml(input.paragrafoFinanceiro)}</p>
  </div>
</section>`;
}

function renderBlocoDesempenho(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoDesempenho;
  const dist = b.trimestreAtual.distribuicaoPorFaixa;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classes = classesDeVariacao(variacao);
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Desempenho médio</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.scoreDesempenhoMedioAgregado)}</div>
      <div class="kpi-sub">Agregado da base ativa</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">% da meta atingida</div>
      <div class="kpi-value">${fmtPctInt(b.trimestreAtual.percMetaAtingidaAgregada)}</div>
      <div class="kpi-sub">Médio canônico ponderado</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Desempenho médio comparado</div>
    </div>`);
  }
  return `<section class="page-break">
  <h2>Bloco Desempenho</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <table class="kv" style="margin-top:4mm;">
    <tr><th>Assiduidade média</th><td>${fmtPct(b.trimestreAtual.assiduidadeMedia)}</td></tr>
    <tr><th>Colaboradores ativos</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</td></tr>
    <tr><th>Distribuição por faixa</th><td>Acima da meta: ${fmtInt(dist.acimaMeta)} · Na meta: ${fmtInt(dist.naMeta)} · Próx. meta: ${fmtInt(dist.proximoMeta)} · Abaixo: ${fmtInt(dist.abaixoMeta)}</td></tr>
  </table>
  <div class="info-card" style="margin-top:3mm;">
    <p style="margin:0;">${escapeHtml(input.paragrafoDesempenho)}</p>
  </div>
</section>`;
}

function renderBlocoPlenitude(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoPlenitude;
  const dim = b.trimestreAtual.porDimensaoAgregada;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classes = classesDeVariacao(variacao);
  const alertaPct = b.trimestreAtual.percColaboradoresComAlertaDivergencia;
  const alertante = alertaPct !== null && alertaPct >= 20;
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Plenitude média</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.plenitudeScoreMedioAgregado)}</div>
      <div class="kpi-sub">Agregado da base ativa</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${alertante ? 'highlight-red' : ''}">
      <div class="kpi-label">% com alerta de divergência</div>
      <div class="kpi-value ${alertante ? 'red' : ''}">${fmtPctInt(alertaPct)}</div>
      <div class="kpi-sub">Jornada vs expectativa discrepante</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Plenitude média comparada</div>
    </div>`);
  }
  return `<section class="page-break">
  <h2>Bloco Plenitude</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <h3 class="h3-compact">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBar('Engajamento', dim.engajamento, 10)}
    ${renderDimBar('Desenvolvimento', dim.desenvolvimento, 10)}
    ${renderDimBar('Pertencimento', dim.pertencimento, 10)}
    ${renderDimBar('Realização', dim.realizacao, 10)}
  </div>
  <div class="info-card" style="margin-top:3mm;">
    <p style="margin:0;">${escapeHtml(input.paragrafoPlenitude)}</p>
  </div>
</section>`;
}

function renderBlocoClima(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoClima;
  if (!b.disponivel) {
    return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <div class="info-card">
    <p style="margin:0;" class="muted">${escapeHtml(input.paragrafoClima)}</p>
  </div>
</section>`;
  }
  const atual = b.trimestreAtual;
  if (atual === null) {
    return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <div class="info-card">
    <p style="margin:0;" class="muted">${escapeHtml(input.paragrafoClima)}</p>
  </div>
</section>`;
  }
  const dim = atual.porDimensaoAgregada;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classes = classesDeVariacao(variacao);
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value">${fmtNum(atual.notaClima)}</div>
      <div class="kpi-sub">${fmtInt(atual.respondentes)} respondente(s)</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(atual.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Nota de clima comparada</div>
    </div>`);
  }
  const notaAgregacao = b.notaAgregacaoAnonimato
    ? `<div class="clima-anonimato-nota">${escapeHtml(b.notaAgregacaoAnonimato)}</div>`
    : '';
  return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <h3 class="h3-compact">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBar('Engajamento', dim.engajamento, 10)}
    ${renderDimBar('Desenvolvimento', dim.desenvolvimento, 10)}
    ${renderDimBar('Pertencimento', dim.pertencimento, 10)}
    ${renderDimBar('Realização', dim.realizacao, 10)}
  </div>
  ${notaAgregacao}
  <div class="info-card" style="margin-top:3mm;">
    <p style="margin:0;">${escapeHtml(input.paragrafoClima)}</p>
  </div>
</section>`;
}

function renderBlocoTurnover(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoTurnover;
  if (b === null) return '';
  const atual = b.trimestreAtual;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classes = classesDeVariacao(variacao);
  const alertanteTri = atual.turnoverTrimestralPercentual >= 10;
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${alertanteTri ? 'highlight-red' : ''}">
      <div class="kpi-label">Turnover trimestral</div>
      <div class="kpi-value ${alertanteTri ? 'red' : ''}">${fmtPct(atual.turnoverTrimestralPercentual)}</div>
      <div class="kpi-sub">${fmtInt(atual.saidasTotais)} saída(s) no período</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Turnover anualizado</div>
      <div class="kpi-value">${fmtPct(atual.turnoverAnualizadoPercentual)}</div>
      <div class="kpi-sub">Projeção canônica (base trimestral × 4)</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Turnover trimestral comparado</div>
    </div>`);
  }
  const linhasKv: string[] = [];
  linhasKv.push(
    `<tr><th>Colaboradores ativos (início)</th><td>${fmtInt(atual.colaboradoresAtivosInicioTrimestre)}</td></tr>`,
  );
  linhasKv.push(
    `<tr><th>Saídas voluntárias / involuntárias</th><td>${fmtInt(atual.saidasVoluntarias)} voluntárias · ${fmtInt(atual.saidasInvoluntarias)} involuntárias</td></tr>`,
  );
  const nivel = b.aberturaPorNivelHierarquico;
  if (nivel) {
    linhasKv.push(
      `<tr><th>Estratégico</th><td>${fmtPct(nivel.estrategico.turnoverPercentual)} · ${fmtInt(nivel.estrategico.saidas)} saída(s)</td></tr>`,
    );
    linhasKv.push(
      `<tr><th>Tático</th><td>${fmtPct(nivel.tatico.turnoverPercentual)} · ${fmtInt(nivel.tatico.saidas)} saída(s)</td></tr>`,
    );
    linhasKv.push(
      `<tr><th>Operacional</th><td>${fmtPct(nivel.operacional.turnoverPercentual)} · ${fmtInt(nivel.operacional.saidas)} saída(s)</td></tr>`,
    );
  }
  const paragrafo = input.paragrafoTurnover ?? '';
  return `<section class="page-break">
  <h2>Bloco Turnover</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <table class="kv" style="margin-top:4mm;">${linhasKv.join('\n')}</table>
  <div class="info-card" style="margin-top:3mm;">
    <p style="margin:0;">${escapeHtml(paragrafo)}</p>
  </div>
</section>`;
}

function renderComparativoDepartamentos(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  const rows = linhas
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.departamento)}</td><td class="right">${fmtInt(d.colaboradoresAtivos)}</td><td class="right fw-700">${fmtNum(d.scoreDesempenhoMedio)}</td><td class="right">${fmtNum(d.plenitudeScoreMedio)}</td><td class="right">${fmtNum(d.notaClima)}</td><td class="right">${fmtPct(d.turnoverTrimestralPercentual)}</td></tr>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Comparativo por departamento</h2>
  <p>Síntese canônica da empresa com todos os departamentos lado a lado em uma única passada visual.</p>
  <div class="exec-dept-table-wrap">
    <table class="data-table">
      <thead>
        <tr><th>Departamento</th><th class="right">Ativos</th><th class="right">Desempenho</th><th class="right">Plenitude</th><th class="right">Clima</th><th class="right">Turnover</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="exec-info-row">
    <strong>Leitura rápida.</strong> Linhas em sequência canônica do departamento com maior população para o menor; use a coluna de Desempenho como primeiro recorte, Plenitude e Clima como leitura cruzada, Turnover como semáforo de risco.
  </div>
</section>`;
}

function renderDetalhamentoCapilar(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  const secoes = linhas
    .map((d) => {
      const equipes =
        d.equipes.length === 0
          ? '<div class="info-card"><p style="margin:0;" class="muted">Sem equipes com liderados diretos ativos neste trimestre.</p></div>'
          : `<div class="exec-dept-table-wrap"><table class="data-table">
    <thead>
      <tr><th>Líder</th><th class="right">Ativos</th><th class="right">Desempenho</th><th class="right">Plenitude</th></tr>
    </thead>
    <tbody>${d.equipes
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.liderNome)}</td><td class="right">${fmtInt(e.colaboradoresAtivos)}</td><td class="right fw-700">${fmtNum(e.scoreDesempenhoMedio)}</td><td class="right">${fmtNum(e.plenitudeScoreMedio)}</td></tr>`,
      )
      .join('\n')}</tbody>
  </table></div>`;
      return `<section class="page-break">
  <h3>${escapeHtml(d.departamento)}</h3>
  <div class="exec-info-row">
    <strong>${fmtInt(d.colaboradoresAtivos)} colaborador(es) ativo(s)</strong>
    · Desempenho médio ${fmtNum(d.scoreDesempenhoMedio)}
    · Plenitude média ${fmtNum(d.plenitudeScoreMedio)}
  </div>
  ${equipes}
</section>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Detalhamento capilar</h2>
  <p>Cada departamento com os seus líderes diretos, para leitura em cascata do agregado ao operacional.</p>
</section>
${secoes}`;
}

function renderRastreabilidade(input: ExecutiveReportFinalPayload): string {
  const timestampBrt = toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso;
  const escopoNome =
    input.escopo.tipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : input.escopo.tipo === 'departamento'
        ? `Departamento: ${input.escopo.rotulo}`
        : `Equipe: ${input.escopo.rotulo}`;
  const totalDepts = input.detalhamentoCapilar.departamentos.length;
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="rastreabilidade-card">
    <div class="rastreabilidade-row"><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</div>
    <div class="rastreabilidade-row"><strong>Trimestre:</strong> ${escapeHtml(formatTrimestreBR(input.trimestre))}</div>
    <div class="rastreabilidade-row"><strong>Escopo:</strong> ${escapeHtml(escopoNome)}</div>
    <div class="rastreabilidade-row"><strong>Departamentos renderizados:</strong> ${fmtInt(totalDepts)}</div>
    <div class="rastreabilidade-row"><strong>Gerado em:</strong> ${escapeHtml(timestampBrt)}</div>
  </div>
  <p class="rastreabilidade-nota"><strong>Nota final.</strong> O trimestre, uma vez fechado, é imutável. Este relatório pode ser regerado a qualquer momento a partir da base de dados original. Os parágrafos interpretativos vêm do motor de IA do ROIPeople; cálculos e distribuições são deterministicamente derivados da base.</p>
</section>`;
}

// ============================================================
// Funcao publica canonica
// ============================================================

/**
 * Renderiza o HTML canonico do Relatorio executivo trimestral para
 * conversao em PDF via `PdfRendererFacade`. Determinismo canonico:
 * mesmo `ExecutiveReportFinalPayload` produz o mesmo HTML byte a
 * byte, com excecao do `geradoEmIso` no rodape.
 */
export function renderExecutiveReportHTML(input: ExecutiveReportFinalPayload): string {
  const bodyHtml = [
    renderCapa(input),
    renderResumoExecutivo(input.resumoExecutivoGeral),
    renderBlocoFinanceiro(input),
    renderBlocoDesempenho(input),
    renderBlocoPlenitude(input),
    renderBlocoClima(input),
    renderBlocoTurnover(input),
    renderComparativoDepartamentos(input),
    renderDetalhamentoCapilar(input),
    renderRastreabilidade(input),
  ]
    .filter((s) => s.length > 0)
    .join('\n');

  return renderLayoutBase({
    title: `Relatório executivo trimestral · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerLeft: `Relatório executivo · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
