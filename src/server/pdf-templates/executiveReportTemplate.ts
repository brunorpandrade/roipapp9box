/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Relatorio executivo trimestral
// (ME-053, S275; ME-1.3d-REV DIS-B reescrita integral).
//
// Renderizacao HTML deterministica em cascata §7.5 do DOC 04
// consumindo `ExecutiveReportFinalPayload` (dados deterministicos +
// paragrafos IA + resumo executivo geral + topDestaques + aspectos
// por dimensao estendidos pela DIS-A).
//
// ME-1.3d-REV DIS-B (31/10/2026):
// - Capa enxuta sem mencao a "IA nunca calcula" (mensagem redundante).
// - Pluralizacao sempre no plural.
// - Resumo executivo: 3 bullets `topDestaques` no topo + info-card
//   com paragrafos arejados (quebras canonicas em "\n\n" caso o IA
//   produza paragrafos; caso contrario, texto puro).
// - Bloco Financeiro ganha % folha/faturamento + faixa ideal com
//   semantica de cores (acima = vermelho; dentro ou abaixo = verde).
// - Bloco Clima tem 5 aspectos por dimensao SOMENTE no agregado
//   empresa; dept/equipe mantem apenas as 4 notas de dimensao +
//   nota de clima geral.
// - Bloco Turnover ganha 4 KPI cards (trimestre, variacao com
//   SEMANTICA INVERTIDA, ultimos 12 meses, anualizado) + aberturas
//   voluntario/involuntario + nivel hierarquico quando empresa.
// - Comparativo por departamento sem "Síntese canônica"; detalhamento
//   capilar sem H2 + paragrafo introdutorio e sem page-break-before
//   por departamento (fluxo continuo).
// - Linha de equipe exibe metainformacao do lider entre parenteses
//   quando pertinente: `(C-level)` para C-level + `(Departamento X)`
//   quando o lider pertence a outro departamento (DIS-A Opcao B).
// - Zero mencao a `canonico/canonica` em texto user-facing.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { TEXTOS_QUESTOES_CLIMA, rotuloDimensaoClima } from '../../lib/climate/textosQuestoesClima';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import type {
  ExecReportEquipeLinha,
  ExecutiveReportFinalPayload,
} from '../services/_shared/executiveReportTypes';

// ============================================================
// Helpers de formatacao
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

/**
 * Semantica INVERTIDA do turnover: subida = pior = vermelho; descida
 * = melhor = verde; zero = neutro.
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
// Dim-bar + Aspecto-bar
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

/**
 * Renderiza os 20 aspectos agrupados por dimensao em grid 2 colunas
 * (consome `notasPorAspecto` do bloco de clima — chamado APENAS no
 * agregado empresa).
 */
function renderAspectosEmpresa(notas: readonly (number | null)[]): string {
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
  return `<h3 class="h3-compact" style="margin-top:5mm;">Aspectos individuais por dimensão</h3>
  <div class="aspecto-dim-grid">${dimBlocos.join('\n')}</div>`;
}

// ============================================================
// Filename §13.5 DOC 03
// ============================================================

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
// Secoes
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
    <strong>⚠ Sobre este relatório:</strong> combina dados estruturados com um resumo executivo geral no topo, comentário interpretativo curto por bloco e visão comparativa dos departamentos ao final.
  </div>
</section>`;
}

function paragrafosArejados(texto: string): string {
  const partes = texto.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (partes.length <= 1) {
    return `<p style="margin:0;">${escapeHtml(texto.trim())}</p>`;
  }
  return partes.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
}

function renderResumoExecutivo(input: ExecutiveReportFinalPayload): string {
  const bullets = input.topDestaques
    .map((d) => `<li class="exec-topdestaques-item">${escapeHtml(d)}</li>`)
    .join('\n');
  return `<section class="page-break">
  <h2>Resumo executivo geral</h2>
  <ul class="exec-topdestaques-list">${bullets}</ul>
  <div class="info-card">
    ${paragrafosArejados(input.resumoExecutivoGeral)}
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
  // Faixa ideal da folha em % do faturamento (DIS-B).
  const percFolha = b.trimestreAtual.percFolhaFaturamento;
  const faixaMin = b.trimestreAtual.folhaPercMinimaIdeal;
  const faixaMax = b.trimestreAtual.folhaPercMaximaIdeal;
  const folhaCards: string[] = [];
  if (percFolha !== null) {
    const faixaOk = faixaMax !== null && percFolha > faixaMax ? false : true;
    const faixaClass = faixaOk ? 'folha-dentro' : 'folha-acima';
    const valClass = faixaOk ? 'folha-ok' : 'folha-alerta';
    const subText =
      faixaMin !== null && faixaMax !== null
        ? `Faixa ideal: ${fmtNum(faixaMin, 1)}% a ${fmtNum(faixaMax, 1)}%`
        : 'Faixa ideal não definida para a empresa';
    folhaCards.push(`<div class="kpi-card ${faixaClass}">
      <div class="kpi-label">Folha / faturamento</div>
      <div class="kpi-value ${valClass}">${fmtPct(percFolha)}</div>
      <div class="kpi-sub">${subText}</div>
    </div>`);
    if (faixaMax !== null) {
      const distancia = percFolha - faixaMax;
      const distanciaValor =
        distancia > 0
          ? `+${fmtNum(distancia, 1)} p.p. acima do teto`
          : distancia < 0
            ? `${fmtNum(Math.abs(distancia), 1)} p.p. abaixo do teto`
            : 'exatamente no teto';
      folhaCards.push(`<div class="kpi-card ${faixaClass}">
      <div class="kpi-label">Distância do teto ideal</div>
      <div class="kpi-value ${valClass}">${fmtNum(distancia, 2)} p.p.</div>
      <div class="kpi-sub">${distanciaValor}</div>
    </div>`);
    }
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
  const folhaGrid =
    folhaCards.length === 0
      ? ''
      : `<div class="kpi-grid" style="grid-template-columns: repeat(${folhaCards.length}, 1fr); margin-top:3mm;">${folhaCards.join('\n')}</div>`;
  return `<section class="page-break">
  <h2>Bloco Financeiro</h2>
  ${kpiGrid}
  ${folhaGrid}
  <table class="kv" style="margin-top:4mm;">${linhasExtras.join('\n')}</table>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoFinanceiro)}
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
      <div class="kpi-sub">Médio ponderado</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Desempenho médio comparado</div>
    </div>`);
  }
  const totalFaixa = dist.acimaMeta + dist.naMeta + dist.proximoMeta + dist.abaixoMeta;
  const faixaCards: string[] = [
    { label: 'Acima da meta', valor: dist.acimaMeta, classeVal: 'green' },
    { label: 'Na meta', valor: dist.naMeta, classeVal: '' },
    { label: 'Próximo à meta', valor: dist.proximoMeta, classeVal: 'yellow' },
    { label: 'Abaixo da meta', valor: dist.abaixoMeta, classeVal: 'red' },
  ].map((f) => {
    const pct = totalFaixa > 0 ? (f.valor / totalFaixa) * 100 : 0;
    return `<div class="kpi-card">
      <div class="kpi-label">${f.label}</div>
      <div class="kpi-value ${f.classeVal}">${fmtInt(f.valor)}</div>
      <div class="kpi-sub">${fmtPctInt(pct)} dos ativos</div>
    </div>`;
  });
  return `<section class="page-break">
  <h2>Bloco Desempenho</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <h3 class="h3-compact" style="margin-top:4mm;">Distribuição por faixa</h3>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">${faixaCards.join('\n')}</div>
  <table class="kv" style="margin-top:4mm;">
    <tr><th>Assiduidade média</th><td>${fmtPct(b.trimestreAtual.assiduidadeMedia)}</td></tr>
    <tr><th>Colaboradores ativos</th><td>${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</td></tr>
  </table>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoDesempenho)}
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
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Autoavaliação (A)</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.scoreAMedio)}</div>
      <div class="kpi-sub">Média do instrumento A</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Avaliação da liderança (C)</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.scoreCMedio)}</div>
      <div class="kpi-sub">Média do instrumento C</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${alertante ? 'highlight-red' : ''}">
      <div class="kpi-label">% com alerta de divergência</div>
      <div class="kpi-value ${alertante ? 'red' : ''}">${fmtPctInt(alertaPct)}</div>
      <div class="kpi-sub">Jornada vs expectativa discrepante</div>
    </div>`);
  const variacaoCard =
    variacao === null
      ? ''
      : `<div class="kpi-grid" style="grid-template-columns: 1fr; margin-top:3mm;">
    <div class="kpi-card ${classes.highlight}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classes.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Plenitude média comparada</div>
    </div>
  </div>`;
  return `<section class="page-break">
  <h2>Bloco Plenitude</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  ${variacaoCard}
  <h3 class="h3-compact" style="margin-top:4mm;">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBar('Engajamento', dim.engajamento, 10)}
    ${renderDimBar('Desenvolvimento', dim.desenvolvimento, 10)}
    ${renderDimBar('Pertencimento', dim.pertencimento, 10)}
    ${renderDimBar('Realização', dim.realizacao, 10)}
  </div>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoPlenitude)}
  </div>
</section>`;
}

function renderBlocoClima(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoClima;
  if (!b.disponivel || b.trimestreAtual === null) {
    return `<section class="page-break">
  <h2>Bloco Clima</h2>
  <div class="info-card">
    ${paragrafosArejados(input.paragrafoClima)}
  </div>
</section>`;
  }
  const atual = b.trimestreAtual;
  const dim = atual.porDimensaoAgregada;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classes = classesDeVariacao(variacao);
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value">${fmtNum(atual.notaClima)}</div>
      <div class="kpi-sub">${fmtInt(atual.respondentes)} respondentes</div>
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
  // Aspectos individuais SOMENTE no agregado empresa (DIS-B).
  const aspectosHtml =
    input.escopo.tipo === 'empresa' && atual.notasPorAspecto.length === 20
      ? renderAspectosEmpresa(atual.notasPorAspecto)
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
  ${aspectosHtml}
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoClima)}
  </div>
</section>`;
}

function renderBlocoTurnover(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoTurnover;
  if (b === null) return '';
  const atual = b.trimestreAtual;
  const ult12 = b.ultimos12Meses;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const classesVar = classesTurnoverInvertido(variacao);
  const alertanteTri = atual.turnoverTrimestralPercentual >= 10;
  const alertanteAnu = atual.turnoverAnualizadoPercentual >= 25;
  const classeTri = alertanteTri ? 'highlight-red' : '';
  const valueClassTri = alertanteTri ? 'red' : '';
  const classeAnu = alertanteAnu ? 'highlight-red' : '';
  const valueClassAnu = alertanteAnu ? 'red' : '';
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${classeTri}">
      <div class="kpi-label">Turnover trimestral</div>
      <div class="kpi-value ${valueClassTri}">${fmtPct(atual.turnoverTrimestralPercentual)}</div>
      <div class="kpi-sub">${fmtInt(atual.saidasTotais)} saídas no período</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${classesVar.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVar.valueClass}">${fmtPctSigned(variacao)}</div>
      <div class="kpi-sub">Subida = pior, descida = melhor</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Últimos 12 meses</div>
      <div class="kpi-value">${fmtPct(ult12.turnoverPercentual)}</div>
      <div class="kpi-sub">Janela móvel encerrando no trimestre</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${classeAnu}">
      <div class="kpi-label">Projeção anualizada</div>
      <div class="kpi-value ${valueClassAnu}">${fmtPct(atual.turnoverAnualizadoPercentual)}</div>
      <div class="kpi-sub">Base trimestral × 4</div>
    </div>`);
  const linhasKv: string[] = [];
  linhasKv.push(
    `<tr><th>Colaboradores ativos (início)</th><td>${fmtInt(atual.colaboradoresAtivosInicioTrimestre)}</td></tr>`,
  );
  linhasKv.push(
    `<tr><th>Saídas voluntárias</th><td>${fmtInt(atual.saidasVoluntarias)} · ${fmtPct(atual.turnoverVoluntarioPercentual)}</td></tr>`,
  );
  linhasKv.push(
    `<tr><th>Saídas involuntárias</th><td>${fmtInt(atual.saidasInvoluntarias)} · ${fmtPct(atual.turnoverInvoluntarioPercentual)}</td></tr>`,
  );
  const nivel = b.aberturaPorNivelHierarquico;
  if (nivel) {
    linhasKv.push(
      `<tr><th>Estratégico</th><td>${fmtPct(nivel.estrategico.turnoverPercentual)} · ${fmtInt(nivel.estrategico.saidas)} saídas</td></tr>`,
    );
    linhasKv.push(
      `<tr><th>Tático</th><td>${fmtPct(nivel.tatico.turnoverPercentual)} · ${fmtInt(nivel.tatico.saidas)} saídas</td></tr>`,
    );
    linhasKv.push(
      `<tr><th>Operacional</th><td>${fmtPct(nivel.operacional.turnoverPercentual)} · ${fmtInt(nivel.operacional.saidas)} saídas</td></tr>`,
    );
  }
  const paragrafo = input.paragrafoTurnover ?? '';
  return `<section class="page-break">
  <h2>Bloco Turnover</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">${kpiCards.join('\n')}</div>
  <table class="kv" style="margin-top:4mm;">${linhasKv.join('\n')}</table>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(paragrafo)}
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
  <p>Todos os departamentos lado a lado em uma única passada visual: Desempenho como primeiro recorte, Plenitude e Clima como leitura cruzada, Turnover como semáforo de risco.</p>
  <div class="exec-dept-table-wrap">
    <table class="data-table">
      <thead>
        <tr><th>Departamento</th><th class="right">Ativos</th><th class="right">Desempenho</th><th class="right">Plenitude</th><th class="right">Clima</th><th class="right">Turnover</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

/**
 * Metainformacao canonica entre parenteses ao lado do nome do lider,
 * populada apenas quando pertinente:
 *   - C-level: sempre carrega `(C-level)`.
 *   - Lider pertencente a outro departamento: carrega
 *     `(Departamento X)` entre parenteses.
 *   - Lider do mesmo departamento do bloco: sem parenteses.
 */
function metadadoLider(equipe: ExecReportEquipeLinha, departamentoDoBloco: string): string {
  if (equipe.tipoLider === 'clevel') {
    return ' <span class="muted">(C-level)</span>';
  }
  if (equipe.departamentoDoLider !== null && equipe.departamentoDoLider !== departamentoDoBloco) {
    return ` <span class="muted">(${escapeHtml(equipe.departamentoDoLider)})</span>`;
  }
  return '';
}

/**
 * Detalhamento capilar em fluxo contínuo: sem H2 wrapper e sem
 * page-break-before entre departamentos (DIS-B).
 */
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
          `<tr><td>${escapeHtml(e.liderNome)}${metadadoLider(e, d.departamento)}</td><td class="right">${fmtInt(e.colaboradoresAtivos)}</td><td class="right fw-700">${fmtNum(e.scoreDesempenhoMedio)}</td><td class="right">${fmtNum(e.plenitudeScoreMedio)}</td></tr>`,
      )
      .join('\n')}</tbody>
  </table></div>`;
      return `<section class="exec-dept-section">
  <h3>${escapeHtml(d.departamento)}</h3>
  <div class="exec-info-row">
    <strong>${fmtInt(d.colaboradoresAtivos)} colaboradores ativos</strong>
    · Desempenho médio ${fmtNum(d.scoreDesempenhoMedio)}
    · Plenitude média ${fmtNum(d.plenitudeScoreMedio)}
  </div>
  ${equipes}
</section>`;
    })
    .join('\n');
  return secoes;
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
// Funcao publica
// ============================================================

export function renderExecutiveReportHTML(input: ExecutiveReportFinalPayload): string {
  const bodyHtml = [
    renderCapa(input),
    renderResumoExecutivo(input),
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
