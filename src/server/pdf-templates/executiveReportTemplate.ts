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
// Determinismo canonico: mesmo `ExecutiveReportFinalPayload` = mesmo
// HTML byte a byte, exceto `geradoEmIso` que vai no rodape.

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
// Secoes canonicas §7.5
// ============================================================

function renderCapa(input: ExecutiveReportFinalPayload): string {
  const escopoNome =
    input.escopo.tipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : input.escopo.tipo === 'departamento'
        ? `Departamento: ${escapeHtml(input.escopo.rotulo)}`
        : `Equipe: ${escapeHtml(input.escopo.rotulo)}`;
  return `<section>
  <h1>Relatório executivo trimestral</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.nomeFantasia)}</p>
  <p><strong>Trimestre:</strong> ${escapeHtml(input.trimestre)}</p>
  <p><strong>Escopo:</strong> ${escopoNome}</p>
  <p><strong>Data de geração:</strong> ${escapeHtml(input.geradoEmIso)}</p>
  <p class="muted">Este relatório combina dados estruturados determinísticos com comentário interpretativo curto por bloco e um resumo executivo geral no topo. A IA nunca calcula — apenas interpreta os números já calculados.</p>
</section>`;
}

function renderResumoExecutivo(texto: string): string {
  return `<section class="page-break">
  <h2>Resumo executivo geral</h2>
  <p>${escapeHtml(texto)}</p>
</section>`;
}

function renderBlocoFinanceiro(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoFinanceiro;
  const linhas: string[] = [];
  linhas.push(`<tr><th>ROI agregado</th><td>${fmtNum(b.trimestreAtual.roiAgregado, 4)}</td></tr>`);
  if (b.trimestreAtual.faturamentoMedioTrimestral !== null) {
    linhas.push(
      `<tr><th>Faturamento médio trimestral</th><td>${fmtMoeda(b.trimestreAtual.faturamentoMedioTrimestral)}</td></tr>`,
    );
  }
  if (b.trimestreAtual.folhaTotalMedia !== null) {
    linhas.push(
      `<tr><th>Folha total média</th><td>${fmtMoeda(b.trimestreAtual.folhaTotalMedia)}</td></tr>`,
    );
  }
  linhas.push(
    `<tr><th>% da meta atingida</th><td>${fmtPct(b.trimestreAtual.percMetaAtingidaAgregada)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Colaboradores ativos</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</td></tr>`,
  );
  if (b.comparativoTrimestreAnterior) {
    linhas.push(
      `<tr><th>ROI (trimestre anterior)</th><td>${fmtNum(b.comparativoTrimestreAnterior.roiAgregado, 4)} · Δ ${fmtPct(b.comparativoTrimestreAnterior.variacaoPercentualRoi)}</td></tr>`,
    );
  }
  if (b.comparativoMesmoTrimestreAnoAnterior) {
    linhas.push(
      `<tr><th>ROI (mesmo trim. ano anterior)</th><td>${fmtNum(b.comparativoMesmoTrimestreAnoAnterior.roiAgregado, 4)} · Δ ${fmtPct(b.comparativoMesmoTrimestreAnoAnterior.variacaoPercentualRoi)}</td></tr>`,
    );
  }
  return `<section class="page-break">
  <h2>Bloco Financeiro</h2>
  <table class="kv">${linhas.join('\n')}</table>
  <p>${escapeHtml(input.paragrafoFinanceiro)}</p>
</section>`;
}

function renderBlocoDesempenho(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoDesempenho;
  const dist = b.trimestreAtual.distribuicaoPorFaixa;
  const linhas: string[] = [];
  linhas.push(
    `<tr><th>Índice de desempenho médio</th><td>${fmtNum(b.trimestreAtual.scoreDesempenhoMedioAgregado)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>% da meta atingida</th><td>${fmtPct(b.trimestreAtual.percMetaAtingidaAgregada)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Assiduidade média</th><td>${fmtPct(b.trimestreAtual.assiduidadeMedia)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Colaboradores ativos</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Distribuição por faixa</th><td>Acima meta: ${fmtInt(dist.acimaMeta)} · Na meta: ${fmtInt(dist.naMeta)} · Próx. meta: ${fmtInt(dist.proximoMeta)} · Abaixo: ${fmtInt(dist.abaixoMeta)}</td></tr>`,
  );
  if (b.comparativoTrimestreAnterior) {
    linhas.push(
      `<tr><th>Trimestre anterior</th><td>Δ ${fmtPct(b.comparativoTrimestreAnterior.variacaoPercentual)}</td></tr>`,
    );
  }
  return `<section class="page-break">
  <h2>Bloco Desempenho</h2>
  <table class="kv">${linhas.join('\n')}</table>
  <p>${escapeHtml(input.paragrafoDesempenho)}</p>
</section>`;
}

function renderBlocoPlenitude(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoPlenitude;
  const dim = b.trimestreAtual.porDimensaoAgregada;
  const linhas: string[] = [];
  linhas.push(
    `<tr><th>Índice de plenitude médio</th><td>${fmtNum(b.trimestreAtual.plenitudeScoreMedioAgregado)}</td></tr>`,
  );
  linhas.push(`<tr><th>Engajamento</th><td>${fmtNum(dim.engajamento)}</td></tr>`);
  linhas.push(`<tr><th>Desenvolvimento</th><td>${fmtNum(dim.desenvolvimento)}</td></tr>`);
  linhas.push(`<tr><th>Pertencimento</th><td>${fmtNum(dim.pertencimento)}</td></tr>`);
  linhas.push(`<tr><th>Realização</th><td>${fmtNum(dim.realizacao)}</td></tr>`);
  linhas.push(
    `<tr><th>% com alerta de divergência</th><td>${fmtPct(b.trimestreAtual.percColaboradoresComAlertaDivergencia)}</td></tr>`,
  );
  if (b.comparativoTrimestreAnterior) {
    linhas.push(
      `<tr><th>Trimestre anterior</th><td>Δ ${fmtPct(b.comparativoTrimestreAnterior.variacaoPercentual)}</td></tr>`,
    );
  }
  return `<section class="page-break">
  <h2>Bloco Plenitude</h2>
  <table class="kv">${linhas.join('\n')}</table>
  <p>${escapeHtml(input.paragrafoPlenitude)}</p>
</section>`;
}

function renderBlocoClima(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoClima;
  if (!b.disponivel) {
    return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <p class="muted">${escapeHtml(input.paragrafoClima)}</p>
</section>`;
  }
  const atual = b.trimestreAtual;
  if (atual === null) {
    return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <p class="muted">${escapeHtml(input.paragrafoClima)}</p>
</section>`;
  }
  const linhas: string[] = [];
  linhas.push(`<tr><th>Nota de clima</th><td>${fmtNum(atual.notaClima)}</td></tr>`);
  linhas.push(`<tr><th>Adesão</th><td>${fmtPct(atual.adesao)}</td></tr>`);
  linhas.push(
    `<tr><th>Engajamento</th><td>${fmtNum(atual.porDimensaoAgregada.engajamento)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Desenvolvimento</th><td>${fmtNum(atual.porDimensaoAgregada.desenvolvimento)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Pertencimento</th><td>${fmtNum(atual.porDimensaoAgregada.pertencimento)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Realização</th><td>${fmtNum(atual.porDimensaoAgregada.realizacao)}</td></tr>`,
  );
  linhas.push(`<tr><th>Respondentes</th><td>${fmtInt(atual.respondentes)}</td></tr>`);
  if (b.comparativoTrimestreAnterior) {
    linhas.push(
      `<tr><th>Trimestre anterior</th><td>Δ ${fmtPct(b.comparativoTrimestreAnterior.variacaoPercentual)}</td></tr>`,
    );
  }
  const notaAgregacao = b.notaAgregacaoAnonimato
    ? `<p class="muted">${escapeHtml(b.notaAgregacaoAnonimato)}</p>`
    : '';
  return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <table class="kv">${linhas.join('\n')}</table>
  ${notaAgregacao}
  <p>${escapeHtml(input.paragrafoClima)}</p>
</section>`;
}

function renderBlocoTurnover(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoTurnover;
  if (b === null) return '';
  const linhas: string[] = [];
  linhas.push(
    `<tr><th>Turnover trimestral</th><td>${fmtPct(b.trimestreAtual.turnoverTrimestralPercentual)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Turnover anualizado</th><td>${fmtPct(b.trimestreAtual.turnoverAnualizadoPercentual)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Colaboradores ativos (início)</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivosInicioTrimestre)}</td></tr>`,
  );
  linhas.push(`<tr><th>Saídas totais</th><td>${fmtInt(b.trimestreAtual.saidasTotais)}</td></tr>`);
  linhas.push(
    `<tr><th>Saídas voluntárias</th><td>${fmtInt(b.trimestreAtual.saidasVoluntarias)}</td></tr>`,
  );
  linhas.push(
    `<tr><th>Saídas involuntárias</th><td>${fmtInt(b.trimestreAtual.saidasInvoluntarias)}</td></tr>`,
  );
  if (b.aberturaPorNivelHierarquico) {
    linhas.push(
      `<tr><th>Estratégico</th><td>${fmtPct(b.aberturaPorNivelHierarquico.estrategico.turnoverPercentual)} · ${fmtInt(b.aberturaPorNivelHierarquico.estrategico.saidas)} saída(s)</td></tr>`,
    );
    linhas.push(
      `<tr><th>Tático</th><td>${fmtPct(b.aberturaPorNivelHierarquico.tatico.turnoverPercentual)} · ${fmtInt(b.aberturaPorNivelHierarquico.tatico.saidas)} saída(s)</td></tr>`,
    );
    linhas.push(
      `<tr><th>Operacional</th><td>${fmtPct(b.aberturaPorNivelHierarquico.operacional.turnoverPercentual)} · ${fmtInt(b.aberturaPorNivelHierarquico.operacional.saidas)} saída(s)</td></tr>`,
    );
  }
  if (b.comparativoTrimestreAnterior) {
    linhas.push(
      `<tr><th>Trimestre anterior</th><td>Δ ${fmtPct(b.comparativoTrimestreAnterior.variacaoPercentual)}</td></tr>`,
    );
  }
  const paragrafo = input.paragrafoTurnover ?? '';
  return `<section class="page-break">
  <h2>Bloco Turnover</h2>
  <table class="kv">${linhas.join('\n')}</table>
  <p>${escapeHtml(paragrafo)}</p>
</section>`;
}

function renderComparativoDepartamentos(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  const rows = linhas
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.departamento)}</td><td>${fmtInt(d.colaboradoresAtivos)}</td><td>${fmtNum(d.scoreDesempenhoMedio)}</td><td>${fmtNum(d.plenitudeScoreMedio)}</td><td>${fmtNum(d.notaClima)}</td><td>${fmtPct(d.turnoverTrimestralPercentual)}</td></tr>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Comparativo por departamento</h2>
  <table class="grid">
    <thead>
      <tr><th>Departamento</th><th>Ativos</th><th>Desempenho</th><th>Plenitude</th><th>Clima</th><th>Turnover</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderDetalhamentoCapilar(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  const secoes = linhas
    .map((d) => {
      const equipes =
        d.equipes.length === 0
          ? '<p class="muted">Sem equipes com liderados diretos ativos neste trimestre.</p>'
          : `<table class="grid">
    <thead>
      <tr><th>Líder</th><th>Ativos</th><th>Desempenho</th><th>Plenitude</th></tr>
    </thead>
    <tbody>${d.equipes
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.liderNome)}</td><td>${fmtInt(e.colaboradoresAtivos)}</td><td>${fmtNum(e.scoreDesempenhoMedio)}</td><td>${fmtNum(e.plenitudeScoreMedio)}</td></tr>`,
      )
      .join('\n')}</tbody>
  </table>`;
      return `<section class="page-break">
  <h3>${escapeHtml(d.departamento)}</h3>
  <p class="muted">${fmtInt(d.colaboradoresAtivos)} colaboradores ativos · Desempenho médio ${fmtNum(d.scoreDesempenhoMedio)} · Plenitude média ${fmtNum(d.plenitudeScoreMedio)}</p>
  ${equipes}
</section>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Detalhamento capilar</h2>
</section>
${secoes}`;
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
  ]
    .filter((s) => s.length > 0)
    .join('\n');

  return renderLayoutBase({
    title: `Relatório executivo trimestral · ${input.nomeFantasia} · ${input.trimestre}`,
    company: { nomeFantasia: input.nomeFantasia },
    bodyHtml,
    footerCenter: `Gerado em ${input.geradoEmIso}`,
  });
}
