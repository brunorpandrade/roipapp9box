/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Relatorio executivo trimestral
// (ME-053, S275; ME-1.3d-REV DIS-C redesign McKinsey/BCG).
//
// Renderizacao HTML deterministica em cascata §7.5 do DOC 04
// consumindo `ExecutiveReportFinalPayload`. Redesign estrutural
// padrao consultoria estrategica (McKinsey/BCG):
//
// Estrutura canonica:
//   1. Capa + tese canonica.
//   2. Painel executivo semaforizado — 5 blocos (Financeiro,
//      Desempenho, Plenitude, Clima, Turnover) em UMA A4 para
//      leitura instantanea pelo C-level.
//   3. Resumo executivo geral — 3 bullets ✦ coloridos por sentido
//      + info-card com paragrafo IA.
//   4. Comparativo entre departamentos — antecipado (vem antes dos
//      drill-downs individuais), com ranking por desempenho composto
//      e cor por valor em cada celula.
//   5-9. Drill-down dos 5 blocos — cada um com KPIs semaforizados,
//      detalhamento canonico e takeaway curto no rodape.
//   10. Detalhamento capilar — ranking de lideres com outliers
//       destacados por cor.
//   11. Proximos passos — 3 recomendacoes canonicas derivadas
//       deterministicamente dos dados.
//   12. Rastreabilidade e integridade.
//
// Convencoes canonicas aplicadas:
//   - Semaforizacao por valor em TODOS os KPIs e dim-bars (faixas
//     canonicas do modulo `faixasCanonicas`).
//   - Variacao canonica (McKinsey/BCG) nos cards de delta: positivo
//     = verde; recuo 0-2% = amarelo; recuo >= 2% = vermelho.
//   - Pluralizacao correta em "saida/saidas" (D-CONCORDANCIA-SAIDAS
//     fechado).
//   - Variacao do turnover em opcao canonica C: p.p. como valor
//     principal + variacao relativa (%) como subtexto.
//   - Zero mencao a "canonico/canonica" em texto user-facing.
//
// Determinismo canonico: mesmo payload = mesmo HTML byte a byte,
// exceto `geradoEmIso` no rodape.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { TEXTOS_QUESTOES_CLIMA, rotuloDimensaoClima } from '../../lib/climate/textosQuestoesClima';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  coresCanonicasPorFaixa,
  faixaAssiduidade,
  faixaClima,
  faixaDesempenho,
  faixaMetaAtingida,
  faixaPlenitude,
  faixaRoi,
  faixaTurnover,
  faixaVariacaoCanonica,
  faixaVariacaoInvertida,
  type FaixaSemaforo,
} from '../../lib/semaforo/faixasCanonicas';
import { pluralSaida } from '../../lib/text/plurais';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import { derivarProximosPassosExecutivo } from './_shared/proximosPassosHelpers';
import {
  takeawayClima,
  takeawayDesempenho,
  takeawayFinanceiro,
  takeawayPlenitude,
  takeawayTurnover,
} from './_shared/takeawayHelpers';
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

function fmtPctRelativoSigned(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sinal = v > 0 ? '+' : '';
  return `${sinal}${fmtNum(v)}%`;
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

function faixaCssClass(faixa: FaixaSemaforo | null): string {
  if (faixa === null) return '';
  return `semf-${faixa}`;
}

function paragrafosArejados(texto: string): string {
  const partes = texto.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (partes.length <= 1) {
    return `<p style="margin:0;">${escapeHtml(texto.trim())}</p>`;
  }
  return partes.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
}

// ============================================================
// dim-bar / aspecto-bar semaforizadas
// ============================================================

function renderDimBarSemaforizada(
  rotulo: string,
  valor: number | null,
  maxEscala: number,
  faixa: FaixaSemaforo | null,
): string {
  if (valor === null || !Number.isFinite(valor)) {
    return `<div class="dim-bar-row">
      <div class="dim-bar-label">${escapeHtml(rotulo)}</div>
      <div class="dim-bar-track"></div>
      <div class="dim-bar-value">—</div>
    </div>`;
  }
  const pct = Math.max(0, Math.min(100, (valor / maxEscala) * 100));
  const css = faixaCssClass(faixa);
  return `<div class="dim-bar-row">
    <div class="dim-bar-label">${escapeHtml(rotulo)}</div>
    <div class="dim-bar-track"><div class="dim-bar-fill ${css}" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="dim-bar-value ${css}">${fmtNum(valor)}</div>
  </div>`;
}

function renderAspectoBar(
  texto: string,
  valor: number | null,
  maxEscala: number,
  faixa: FaixaSemaforo | null,
): string {
  if (valor === null || !Number.isFinite(valor)) {
    return `<div class="aspecto-bar-row">
      <div class="aspecto-bar-label">${escapeHtml(texto)}</div>
      <div class="aspecto-bar-track"></div>
      <div class="aspecto-bar-value">—</div>
    </div>`;
  }
  const pct = Math.max(0, Math.min(100, (valor / maxEscala) * 100));
  const css = faixaCssClass(faixa);
  return `<div class="aspecto-bar-row">
    <div class="aspecto-bar-label">${escapeHtml(texto)}</div>
    <div class="aspecto-bar-track"><div class="aspecto-bar-fill ${css}" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="aspecto-bar-value ${css}">${fmtNum(valor)}</div>
  </div>`;
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
// Capa + tese canonica
// ============================================================

function derivarTeseCanonica(payload: ExecutiveReportFinalPayload): string {
  const roi = payload.blocoFinanceiro.trimestreAtual.roiAgregado;
  const clima = payload.blocoClima.trimestreAtual?.notaClima ?? null;
  const turnover = payload.blocoTurnover?.trimestreAtual.turnoverTrimestralPercentual ?? null;
  const fRoi = faixaRoi(roi);
  const fClima = faixaClima(clima);
  const fTurn = faixaTurnover(turnover);
  const todosVerdes = fRoi === 'verde' && fClima === 'verde' && fTurn === 'verde';
  const temVermelho = fRoi === 'vermelho' || fClima === 'vermelho' || fTurn === 'vermelho';
  if (todosVerdes) {
    return 'Trimestre consistente — base pronta para apoiar decisões estratégicas sem ressalvas.';
  }
  if (temVermelho) {
    return 'Trimestre com alertas em pelo menos um bloco — leitura cruzada e plano de ação recomendados.';
  }
  return 'Trimestre com resultados mistos — monitorar os indicadores em zona de atenção no próximo ciclo.';
}

function renderCapa(input: ExecutiveReportFinalPayload): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const escopoNome =
    input.escopo.tipo === 'empresa'
      ? 'Empresa (agregado geral)'
      : input.escopo.tipo === 'departamento'
        ? `Departamento: ${input.escopo.rotulo}`
        : `Equipe: ${input.escopo.rotulo}`;
  const tese = derivarTeseCanonica(input);
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
  <div class="tese-card">${escapeHtml(tese)}</div>
</section>`;
}

// ============================================================
// Painel executivo semaforizado (pg 2)
// ============================================================

interface BlocoPainel {
  label: string;
  kpi: string;
  faixa: FaixaSemaforo | null;
  delta: string | null;
  deltaCss: 'delta-pos' | 'delta-neg' | '';
  takeaway: string;
}

function montarPainelExecutivo(input: ExecutiveReportFinalPayload): readonly BlocoPainel[] {
  const roi = input.blocoFinanceiro.trimestreAtual.roiAgregado;
  const roiVar = input.blocoFinanceiro.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null;
  const desemp = input.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado;
  const desempVar = input.blocoDesempenho.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const plen = input.blocoPlenitude.trimestreAtual.plenitudeScoreMedioAgregado;
  const plenVar = input.blocoPlenitude.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const clima = input.blocoClima.trimestreAtual?.notaClima ?? null;
  const climaVar = input.blocoClima.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const turn = input.blocoTurnover?.trimestreAtual.turnoverTrimestralPercentual ?? null;
  const turnVar = input.blocoTurnover?.comparativoTrimestreAnterior?.variacaoPercentual ?? null;

  const makeDelta = (
    v: number | null,
    invertido = false,
  ): { texto: string | null; css: BlocoPainel['deltaCss'] } => {
    if (v === null) return { texto: null, css: '' };
    const texto = `${v > 0 ? '+' : ''}${fmtNum(v)}% vs trim. ant.`;
    if (v === 0) return { texto, css: '' };
    const positivo = invertido ? v < 0 : v > 0;
    return { texto, css: positivo ? 'delta-pos' : 'delta-neg' };
  };

  const roiDelta = makeDelta(roiVar);
  const desempDelta = makeDelta(desempVar);
  const plenDelta = makeDelta(plenVar);
  const climaDelta = makeDelta(climaVar);
  const turnDelta = makeDelta(turnVar, /* invertido */ true);

  return [
    {
      label: 'Financeiro — ROI',
      kpi: fmtNum(roi, 2),
      faixa: faixaRoi(roi),
      delta: roiDelta.texto,
      deltaCss: roiDelta.css,
      takeaway:
        roi === null
          ? 'ROI indisponível.'
          : faixaRoi(roi) === 'verde'
            ? 'Produtividade da folha saudável.'
            : faixaRoi(roi) === 'amarelo'
              ? 'Produtividade em atenção.'
              : 'Produtividade frágil.',
    },
    {
      label: 'Desempenho',
      kpi: fmtNum(desemp, 2),
      faixa: faixaDesempenho(desemp),
      delta: desempDelta.texto,
      deltaCss: desempDelta.css,
      takeaway:
        desemp === null
          ? 'Score indisponível.'
          : faixaDesempenho(desemp) === 'verde'
            ? 'Base entregando acima do limiar.'
            : faixaDesempenho(desemp) === 'amarelo'
              ? 'Base em zona de atenção.'
              : 'Base com entrega frágil.',
    },
    {
      label: 'Plenitude',
      kpi: fmtNum(plen, 2),
      faixa: faixaPlenitude(plen),
      delta: plenDelta.texto,
      deltaCss: plenDelta.css,
      takeaway:
        plen === null
          ? 'Score indisponível.'
          : faixaPlenitude(plen) === 'verde'
            ? 'Jornada em bom equilíbrio.'
            : faixaPlenitude(plen) === 'amarelo'
              ? 'Jornada em atenção.'
              : 'Jornada frágil.',
    },
    {
      label: 'Clima',
      kpi: fmtNum(clima, 2),
      faixa: faixaClima(clima),
      delta: climaDelta.texto,
      deltaCss: climaDelta.css,
      takeaway:
        clima === null
          ? 'Clima indisponível (anonimato).'
          : faixaClima(clima) === 'verde'
            ? 'Clima favorável.'
            : faixaClima(clima) === 'amarelo'
              ? 'Clima em atenção.'
              : 'Clima crítico.',
    },
    {
      label: 'Turnover trimestral',
      kpi: fmtPct(turn),
      faixa: faixaTurnover(turn),
      delta: turnDelta.texto,
      deltaCss: turnDelta.css,
      takeaway:
        turn === null
          ? 'Turnover indisponível.'
          : faixaTurnover(turn) === 'verde'
            ? 'Rotatividade saudável.'
            : faixaTurnover(turn) === 'amarelo'
              ? 'Rotatividade em atenção.'
              : 'Rotatividade crítica.',
    },
  ];
}

function renderPainelExecutivo(input: ExecutiveReportFinalPayload): string {
  const blocos = montarPainelExecutivo(input);
  const cards = blocos
    .map((b) => {
      const corFaixa = b.faixa === null ? '' : `painel-${b.faixa}`;
      const deltaHtml =
        b.delta === null
          ? ''
          : `<div class="painel-exec-delta ${b.deltaCss}">${escapeHtml(b.delta)}</div>`;
      return `<div class="painel-exec-card ${corFaixa}">
      <div class="painel-exec-label">${escapeHtml(b.label)}</div>
      <div class="painel-exec-kpi">${escapeHtml(b.kpi)}</div>
      ${deltaHtml}
      <div class="painel-exec-takeaway">${escapeHtml(b.takeaway)}</div>
    </div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Painel executivo do trimestre</h2>
  <p>Leitura instantânea dos cinco blocos com semaforização por faixa de valor e variação relativa vs trimestre anterior.</p>
  <div class="painel-exec-grid">${cards}</div>
  <div class="takeaway-card">Painel calibrado com faixas canônicas de referência; cores por valor e por sinal de variação. Blocos em vermelho indicam prioridade de investigação.</div>
</section>`;
}

// ============================================================
// Resumo executivo geral (pg 3)
// ============================================================

function derivarSentidosDestaques(payload: ExecutiveReportFinalPayload): readonly FaixaSemaforo[] {
  // Heuristica canonica: cada destaque corresponde a uma das 3
  // variacoes principais (ROI, desempenho, plenitude). Aplica a
  // faixa canonica de variacao (McKinsey/BCG).
  const roiVar =
    payload.blocoFinanceiro.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null;
  const desVar = payload.blocoDesempenho.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const plenVar = payload.blocoPlenitude.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const faixaOuVerde = (v: number | null): FaixaSemaforo => faixaVariacaoCanonica(v) ?? 'verde';
  return [faixaOuVerde(roiVar), faixaOuVerde(desVar), faixaOuVerde(plenVar)];
}

function renderResumoExecutivo(input: ExecutiveReportFinalPayload): string {
  const sentidos = derivarSentidosDestaques(input);
  const bullets = input.topDestaques
    .map((d, i) => `<li class="achado-item achado-${sentidos[i] ?? 'verde'}">${escapeHtml(d)}</li>`)
    .join('\n');
  return `<section class="page-break">
  <h2>Resumo executivo geral</h2>
  <ul class="achados-list">${bullets}</ul>
  <div class="info-card">
    ${paragrafosArejados(input.resumoExecutivoGeral)}
  </div>
</section>`;
}

// ============================================================
// Comparativo entre departamentos (pg 4, antecipado)
// ============================================================

function renderComparativoDepartamentos(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  // Ordenar por desempenho medio (desc), empate por nome.
  const ordenados = [...linhas].sort((a, b) => {
    const sa = a.scoreDesempenhoMedio ?? -Infinity;
    const sb = b.scoreDesempenhoMedio ?? -Infinity;
    if (sa !== sb) return sb - sa;
    return a.departamento.localeCompare(b.departamento, 'pt-BR');
  });
  // Media canonica da empresa.
  const medias = (() => {
    const valores = linhas.map((d) => ({
      desemp: d.scoreDesempenhoMedio,
      plen: d.plenitudeScoreMedio,
      clima: d.notaClima,
      turn: d.turnoverTrimestralPercentual,
      ativos: d.colaboradoresAtivos,
    }));
    const media = (nums: readonly (number | null)[]): number | null => {
      const validos = nums.filter((n): n is number => n !== null && Number.isFinite(n));
      if (validos.length === 0) return null;
      return validos.reduce((a, b) => a + b, 0) / validos.length;
    };
    return {
      desemp: media(valores.map((v) => v.desemp)),
      plen: media(valores.map((v) => v.plen)),
      clima: media(valores.map((v) => v.clima)),
      turn: media(valores.map((v) => v.turn)),
      ativos: valores.reduce((acc, v) => acc + v.ativos, 0),
    };
  })();
  const classeDesemp = (v: number | null): string => faixaCssClass(faixaDesempenho(v));
  const classePlen = (v: number | null): string => faixaCssClass(faixaPlenitude(v));
  const classeClima = (v: number | null): string => faixaCssClass(faixaClima(v));
  const classeTurn = (v: number | null): string => faixaCssClass(faixaTurnover(v));
  const linhaMediaHtml = `<tr class="ranking-row-media">
    <td>Média da empresa</td>
    <td class="right">${fmtInt(medias.ativos)}</td>
    <td class="right cell-${classeDesemp(medias.desemp)}">${fmtNum(medias.desemp)}</td>
    <td class="right cell-${classePlen(medias.plen)}">${fmtNum(medias.plen)}</td>
    <td class="right cell-${classeClima(medias.clima)}">${fmtNum(medias.clima)}</td>
    <td class="right cell-${classeTurn(medias.turn)}">${fmtPct(medias.turn)}</td>
  </tr>`;
  const rows = ordenados
    .map(
      (d) =>
        `<tr>
      <td>${escapeHtml(d.departamento)}</td>
      <td class="right">${fmtInt(d.colaboradoresAtivos)}</td>
      <td class="right cell-${classeDesemp(d.scoreDesempenhoMedio)}">${fmtNum(d.scoreDesempenhoMedio)}</td>
      <td class="right cell-${classePlen(d.plenitudeScoreMedio)}">${fmtNum(d.plenitudeScoreMedio)}</td>
      <td class="right cell-${classeClima(d.notaClima)}">${fmtNum(d.notaClima)}</td>
      <td class="right cell-${classeTurn(d.turnoverTrimestralPercentual)}">${fmtPct(d.turnoverTrimestralPercentual)}</td>
    </tr>`,
    )
    .join('\n');
  // Outliers canonicos: melhor e pior depto por desempenho.
  const outlierTop = ordenados[0];
  const outlierBot = ordenados[ordenados.length - 1];
  const takeaway =
    outlierTop && outlierBot && outlierTop !== outlierBot
      ? `Maior desempenho em ${outlierTop.departamento} (${fmtNum(outlierTop.scoreDesempenhoMedio)}); menor em ${outlierBot.departamento} (${fmtNum(outlierBot.scoreDesempenhoMedio)}).`
      : 'Dispersão entre departamentos sem outliers claros.';
  return `<section class="page-break">
  <h2>Comparativo entre departamentos</h2>
  <div class="exec-dept-table-wrap wrap-no-clip">
    <table class="ranking-table data-table">
      <colgroup>
        <col style="width:28%" />
        <col style="width:10%" />
        <col style="width:15%" />
        <col style="width:14%" />
        <col style="width:14%" />
        <col style="width:19%" />
      </colgroup>
      <thead>
        <tr><th>Departamento</th><th class="right">Ativos</th><th class="right">Desempenho</th><th class="right">Plenitude</th><th class="right">Clima</th><th class="right">Turnover</th></tr>
      </thead>
      <tbody>${linhaMediaHtml}
${rows}</tbody>
    </table>
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Bloco Financeiro (pg 5)
// ============================================================

function renderBlocoFinanceiro(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoFinanceiro;
  const faixa = faixaRoi(b.trimestreAtual.roiAgregado);
  const classesRoi = coresCanonicasPorFaixa(faixa);
  const variacaoTri = b.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null;
  const variacaoAno = b.comparativoMesmoTrimestreAnoAnterior?.variacaoPercentualRoi ?? null;
  const classesTri = coresCanonicasPorFaixa(faixaVariacaoCanonica(variacaoTri));
  const classesAno = coresCanonicasPorFaixa(faixaVariacaoCanonica(variacaoAno));
  const roiAnterior = b.comparativoTrimestreAnterior?.roiAgregado ?? null;
  const roiAnoAnterior = b.comparativoMesmoTrimestreAnoAnterior?.roiAgregado ?? null;
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${classesRoi.cardClass}">
      <div class="kpi-label">ROI agregado</div>
      <div class="kpi-value ${classesRoi.valueClass}">${fmtNum(b.trimestreAtual.roiAgregado, 2)}</div>
      <div class="kpi-sub">Produtividade da folha</div>
    </div>`);
  if (variacaoTri !== null) {
    kpiCards.push(`<div class="kpi-card ${classesTri.cardClass}">
      <div class="kpi-label">Variação vs. trimestre anterior</div>
      <div class="kpi-value ${classesTri.valueClass}">${fmtPct(variacaoTri)}</div>
      <div class="kpi-sub">ROI trim. anterior: ${fmtNum(roiAnterior, 2)}</div>
    </div>`);
  }
  if (variacaoAno !== null) {
    kpiCards.push(`<div class="kpi-card ${classesAno.cardClass}">
      <div class="kpi-label">Variação vs. mesmo trim. ano anterior</div>
      <div class="kpi-value ${classesAno.valueClass}">${fmtPct(variacaoAno)}</div>
      <div class="kpi-sub">ROI mesmo trim. ano anterior: ${fmtNum(roiAnoAnterior, 2)}</div>
    </div>`);
  }
  // Folha/faturamento + distancia do teto.
  const percFolha = b.trimestreAtual.percFolhaFaturamento;
  const faixaMin = b.trimestreAtual.folhaPercMinimaIdeal;
  const faixaMax = b.trimestreAtual.folhaPercMaximaIdeal;
  const folhaCards: string[] = [];
  if (percFolha !== null) {
    const dentroFaixa = faixaMax === null || percFolha <= faixaMax;
    const faixaClass = dentroFaixa ? 'folha-dentro' : 'folha-acima';
    const valClass = dentroFaixa ? 'folha-ok' : 'folha-alerta';
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
      const distTexto =
        distancia > 0
          ? `+${fmtNum(distancia, 1)} p.p. acima do teto`
          : distancia < 0
            ? `${fmtNum(Math.abs(distancia), 1)} p.p. abaixo do teto`
            : 'exatamente no teto';
      folhaCards.push(`<div class="kpi-card ${faixaClass}">
      <div class="kpi-label">Distância do teto ideal</div>
      <div class="kpi-value ${valClass}">${fmtNum(distancia, 2)} p.p.</div>
      <div class="kpi-sub">${distTexto}</div>
    </div>`);
    }
  }
  // KV substituida por 4 KPI cards canonicos.
  const kpiRodape: string[] = [];
  kpiRodape.push(`<div class="kpi-card">
      <div class="kpi-label">Faturamento médio</div>
      <div class="kpi-value">${fmtMoeda(b.trimestreAtual.faturamentoMedioTrimestral)}</div>
      <div class="kpi-sub">Média do trimestre</div>
    </div>`);
  kpiRodape.push(`<div class="kpi-card">
      <div class="kpi-label">Folha total</div>
      <div class="kpi-value">${fmtMoeda(b.trimestreAtual.folhaTotalMedia)}</div>
      <div class="kpi-sub">Média do trimestre</div>
    </div>`);
  const classesMeta = coresCanonicasPorFaixa(
    faixaMetaAtingida(b.trimestreAtual.percMetaAtingidaAgregada),
  );
  kpiRodape.push(`<div class="kpi-card ${classesMeta.cardClass}">
      <div class="kpi-label">% da meta atingida</div>
      <div class="kpi-value ${classesMeta.valueClass}">${fmtPct(b.trimestreAtual.percMetaAtingidaAgregada)}</div>
      <div class="kpi-sub">Média ponderada</div>
    </div>`);
  kpiRodape.push(`<div class="kpi-card">
      <div class="kpi-label">Colaboradores ativos</div>
      <div class="kpi-value">${fmtInt(b.trimestreAtual.colaboradoresAtivos)}</div>
      <div class="kpi-sub">Base no período</div>
    </div>`);
  const takeaway = takeawayFinanceiro({
    roi: b.trimestreAtual.roiAgregado,
    variacaoRoi: variacaoTri,
    percMeta: b.trimestreAtual.percMetaAtingidaAgregada,
    percFolhaFaturamento: percFolha,
    folhaMaximaIdeal: faixaMax,
  });
  return `<section class="page-break">
  <h2>Bloco Financeiro</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  ${folhaCards.length > 0 ? `<div class="kpi-grid" style="grid-template-columns: repeat(${folhaCards.length}, 1fr); margin-top:3mm;">${folhaCards.join('\n')}</div>` : ''}
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:3mm;">${kpiRodape.join('\n')}</div>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoFinanceiro)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Bloco Desempenho (pg 6)
// ============================================================

function renderBlocoDesempenho(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoDesempenho;
  const dist = b.trimestreAtual.distribuicaoPorFaixa;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const faixa = faixaDesempenho(b.trimestreAtual.scoreDesempenhoMedioAgregado);
  const classes = coresCanonicasPorFaixa(faixa);
  const classesVar = coresCanonicasPorFaixa(faixaVariacaoCanonica(variacao));
  const kpiCards: string[] = [];
  const colaboradoresAtivos = b.trimestreAtual.colaboradoresAtivos;
  kpiCards.push(`<div class="kpi-card ${classes.cardClass}">
      <div class="kpi-label">Desempenho médio</div>
      <div class="kpi-value ${classes.valueClass}">${fmtNum(b.trimestreAtual.scoreDesempenhoMedioAgregado)}</div>
      <div class="kpi-sub">${fmtInt(colaboradoresAtivos)} colaboradores ativos</div>
    </div>`);
  const classesMeta = coresCanonicasPorFaixa(
    faixaMetaAtingida(b.trimestreAtual.percMetaAtingidaAgregada),
  );
  kpiCards.push(`<div class="kpi-card ${classesMeta.cardClass}">
      <div class="kpi-label">% da meta atingida</div>
      <div class="kpi-value ${classesMeta.valueClass}">${fmtPctInt(b.trimestreAtual.percMetaAtingidaAgregada)}</div>
      <div class="kpi-sub">Média ponderada</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classesVar.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVar.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Desempenho médio comparado</div>
    </div>`);
  }
  // Distribuicao por faixa — 4 cards semaforizados por posicao.
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
  // Assiduidade — barra full-width semaforizada.
  const assiduidade = b.trimestreAtual.assiduidadeMedia;
  const faixaAssid = faixaAssiduidade(assiduidade);
  const cssAssid = faixaCssClass(faixaAssid);
  const assidPct = assiduidade === null ? 0 : Math.max(0, Math.min(100, assiduidade));
  const assidHtml = `<div class="assiduidade-wrap">
    <div class="assiduidade-head">
      <div class="assiduidade-label">Assiduidade média</div>
      <div class="assiduidade-value ${cssAssid}">${fmtPct(assiduidade)}</div>
    </div>
    <div class="assiduidade-track"><div class="assiduidade-fill ${cssAssid}" style="width:${assidPct.toFixed(2)}%;"></div></div>
  </div>`;
  const takeaway = takeawayDesempenho({
    scoreMedio: b.trimestreAtual.scoreDesempenhoMedioAgregado,
    variacao,
    percMeta: b.trimestreAtual.percMetaAtingidaAgregada,
    distAcima: dist.acimaMeta,
    distNa: dist.naMeta,
    distProximo: dist.proximoMeta,
    distAbaixo: dist.abaixoMeta,
  });
  return `<section class="page-break">
  <h2>Bloco Desempenho</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <h3 class="h3-compact" style="margin-top:4mm;">Distribuição por faixa</h3>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">${faixaCards.join('\n')}</div>
  ${assidHtml}
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoDesempenho)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Bloco Plenitude (pg 7)
// ============================================================

function renderBlocoPlenitude(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoPlenitude;
  const dim = b.trimestreAtual.porDimensaoAgregada;
  const variacao = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  const faixa = faixaPlenitude(b.trimestreAtual.plenitudeScoreMedioAgregado);
  const classesPlen = coresCanonicasPorFaixa(faixa);
  const classesVar = coresCanonicasPorFaixa(faixaVariacaoCanonica(variacao));
  const alertaPct = b.trimestreAtual.percColaboradoresComAlertaDivergencia;
  const alertante = alertaPct !== null && alertaPct >= 20;
  const classesAlerta = alertante
    ? { cardClass: 'highlight-red', valueClass: 'red' }
    : { cardClass: '', valueClass: '' };
  const kpiCards: string[] = [];
  const colaboradoresAtivos = b.trimestreAtual.colaboradoresAtivos;
  kpiCards.push(`<div class="kpi-card ${classesPlen.cardClass}">
      <div class="kpi-label">Plenitude média</div>
      <div class="kpi-value ${classesPlen.valueClass}">${fmtNum(b.trimestreAtual.plenitudeScoreMedioAgregado)}</div>
      <div class="kpi-sub">${fmtInt(colaboradoresAtivos)} colaboradores ativos</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Autoavaliação</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.scoreAMedio)}</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Avaliação da liderança</div>
      <div class="kpi-value">${fmtNum(b.trimestreAtual.scoreCMedio)}</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${classesAlerta.cardClass}">
      <div class="kpi-label">Alerta de divergência</div>
      <div class="kpi-value ${classesAlerta.valueClass}">${fmtPctInt(alertaPct)}</div>
    </div>`);
  const variacaoHtml =
    variacao === null
      ? ''
      : `<div class="kpi-grid" style="grid-template-columns: 1fr; margin-top:3mm;">
    <div class="kpi-card ${classesVar.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVar.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Plenitude média comparada</div>
    </div>
  </div>`;
  // Semaforizar dim-bars por valor (escala 0-10 na visualizacao, mas
  // o payload traz 0-100 neste bloco — normalizar faixa).
  const faixaDim = (v: number | null): FaixaSemaforo | null => {
    if (v === null) return null;
    // Escala 0-10 (plataforma mostra como 0-10 no gauge).
    if (v >= 7.5) return 'verde';
    if (v >= 5) return 'amarelo';
    return 'vermelho';
  };
  const takeaway = takeawayPlenitude({
    scoreMedio: b.trimestreAtual.plenitudeScoreMedioAgregado,
    variacao,
    pctAlertaDivergencia: alertaPct,
  });
  return `<section class="page-break">
  <h2>Bloco Plenitude</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  ${variacaoHtml}
  <h3 class="h3-compact" style="margin-top:4mm;">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBarSemaforizada('Engajamento', dim.engajamento, 10, faixaDim(dim.engajamento))}
    ${renderDimBarSemaforizada('Desenvolvimento', dim.desenvolvimento, 10, faixaDim(dim.desenvolvimento))}
    ${renderDimBarSemaforizada('Pertencimento', dim.pertencimento, 10, faixaDim(dim.pertencimento))}
    ${renderDimBarSemaforizada('Realização', dim.realizacao, 10, faixaDim(dim.realizacao))}
  </div>
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoPlenitude)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Bloco Clima (pg 8 fechada + pg 9 aberta)
// ============================================================

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
  const faixaClimaAtual = faixaClima(atual.notaClima);
  const classesClima = coresCanonicasPorFaixa(faixaClimaAtual);
  const classesVar = coresCanonicasPorFaixa(faixaVariacaoCanonica(variacao));
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${classesClima.cardClass}">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value ${classesClima.valueClass}">${fmtNum(atual.notaClima)}</div>
      <div class="kpi-sub">${fmtInt(atual.respondentes)} respondentes</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(atual.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>`);
  if (variacao !== null) {
    kpiCards.push(`<div class="kpi-card ${classesVar.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVar.valueClass}">${fmtPct(variacao)}</div>
      <div class="kpi-sub">Nota de clima comparada</div>
    </div>`);
  }
  const notaAgregacao = b.notaAgregacaoAnonimato
    ? `<div class="clima-anonimato-nota">${escapeHtml(b.notaAgregacaoAnonimato)}</div>`
    : '';
  const takeaway = takeawayClima({
    notaClima: atual.notaClima,
    variacao,
    adesao: atual.adesao,
    respondentes: atual.respondentes,
  });
  // Pagina 1 do bloco clima.
  const pg1 = `<section class="page-break">
  <h2>Bloco Clima</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(${kpiCards.length}, 1fr);">${kpiCards.join('\n')}</div>
  <h3 class="h3-compact">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBarSemaforizada('Engajamento', dim.engajamento, 10, faixaClima(dim.engajamento))}
    ${renderDimBarSemaforizada('Desenvolvimento', dim.desenvolvimento, 10, faixaClima(dim.desenvolvimento))}
    ${renderDimBarSemaforizada('Pertencimento', dim.pertencimento, 10, faixaClima(dim.pertencimento))}
    ${renderDimBarSemaforizada('Realização', dim.realizacao, 10, faixaClima(dim.realizacao))}
  </div>
  ${notaAgregacao}
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(input.paragrafoClima)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
  // Pagina 2 do bloco clima — dimensoes abertas APENAS para empresa.
  if (input.escopo.tipo !== 'empresa' || atual.notasPorAspecto.length !== 20) {
    return pg1;
  }
  const dimAbertaHtml = (() => {
    const grupos: string[] = [];
    const dimNotas = [dim.engajamento, dim.desenvolvimento, dim.pertencimento, dim.realizacao];
    for (let d = 1; d <= 4; d += 1) {
      const dimNome = rotuloDimensaoClima(d);
      const notaDim = dimNotas[d - 1] ?? null;
      const faixaDimAtual = faixaClima(notaDim);
      const cssDim = faixaCssClass(faixaDimAtual);
      const pctDim = notaDim === null ? 0 : Math.max(0, Math.min(100, (notaDim / 10) * 100));
      const aspectoLinhas: string[] = [];
      for (let item = 1; item <= 5; item += 1) {
        const idx = (d - 1) * 5 + (item - 1);
        const valor = atual.notasPorAspecto[idx] ?? null;
        const texto = TEXTOS_QUESTOES_CLIMA[idx] ?? '';
        aspectoLinhas.push(renderAspectoBar(texto, valor, 10, faixaClima(valor)));
      }
      grupos.push(`<div class="dim-aberta-group">
      <div class="dim-aberta-head">
        <h4 class="dim-aberta-title">${escapeHtml(dimNome)}</h4>
        <div class="dim-aberta-barra"><div class="dim-aberta-fill ${cssDim}" style="width:${pctDim.toFixed(2)}%;"></div></div>
        <div class="dim-aberta-nota ${cssDim}">${fmtNum(notaDim)}</div>
      </div>
      <div class="aspecto-bars">${aspectoLinhas.join('\n')}</div>
    </div>`);
    }
    return grupos.join('\n');
  })();
  const pg2 = `<section class="page-break">
  <h2>Clima — dimensões abertas por aspecto</h2>
  <p>Dimensão a dimensão, com as 5 perguntas canônicas por extenso e nota individual por aspecto.</p>
  ${dimAbertaHtml}
</section>`;
  return pg1 + '\n' + pg2;
}

// ============================================================
// Bloco Turnover (pg 10)
// ============================================================

function renderBlocoTurnover(input: ExecutiveReportFinalPayload): string {
  const b = input.blocoTurnover;
  if (b === null) return '';
  const atual = b.trimestreAtual;
  const anterior = b.comparativoTrimestreAnterior?.turnoverTrimestralPercentual ?? null;
  const variacaoRelativa = b.comparativoTrimestreAnterior?.variacaoPercentual ?? null;
  // Opcao C canonica: p.p. como principal + relativo como subtexto.
  const variacaoPp =
    anterior === null
      ? null
      : Math.round((atual.turnoverTrimestralPercentual - anterior) * 100) / 100;
  const faixaTurn = faixaTurnover(atual.turnoverTrimestralPercentual);
  const classesTurn = coresCanonicasPorFaixa(faixaTurn);
  const classesVariacao = coresCanonicasPorFaixa(faixaVariacaoInvertida(variacaoPp));
  const classesAnu = coresCanonicasPorFaixa(faixaTurnover(atual.turnoverAnualizadoPercentual));
  const kpiCards: string[] = [];
  kpiCards.push(`<div class="kpi-card ${classesTurn.cardClass}">
      <div class="kpi-label">Turnover trimestral</div>
      <div class="kpi-value ${classesTurn.valueClass}">${fmtPct(atual.turnoverTrimestralPercentual)}</div>
      <div class="kpi-sub">${fmtInt(atual.saidasTotais)} ${pluralSaida(atual.saidasTotais)} no período</div>
    </div>`);
  const subtextoVariacao =
    variacaoRelativa === null
      ? 'variação relativa indisponível'
      : `${fmtPctRelativoSigned(variacaoRelativa)} vs trim. anterior`;
  kpiCards.push(`<div class="kpi-card ${classesVariacao.cardClass}">
      <div class="kpi-label">Variação vs. trim. anterior</div>
      <div class="kpi-value ${classesVariacao.valueClass}">${fmtPctSigned(variacaoPp)}</div>
      <div class="kpi-sub">${escapeHtml(subtextoVariacao)}</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card">
      <div class="kpi-label">Últimos 12 meses</div>
      <div class="kpi-value">${fmtPct(b.ultimos12Meses.turnoverPercentual)}</div>
      <div class="kpi-sub">Janela móvel</div>
    </div>`);
  kpiCards.push(`<div class="kpi-card ${classesAnu.cardClass}">
      <div class="kpi-label">Projeção anualizada</div>
      <div class="kpi-value ${classesAnu.valueClass}">${fmtPct(atual.turnoverAnualizadoPercentual)}</div>
      <div class="kpi-sub">Base trimestral × 4</div>
    </div>`);
  // Voluntarias/involuntarias em 2 KPI cards horizontais.
  const voluntariasHtml = `<div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr); margin-top:3mm;">
    <div class="kpi-card">
      <div class="kpi-label">Saídas voluntárias</div>
      <div class="kpi-value">${fmtInt(atual.saidasVoluntarias)}</div>
      <div class="kpi-sub">Taxa: ${fmtPct(atual.turnoverVoluntarioPercentual)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Saídas involuntárias</div>
      <div class="kpi-value">${fmtInt(atual.saidasInvoluntarias)}</div>
      <div class="kpi-sub">Taxa: ${fmtPct(atual.turnoverInvoluntarioPercentual)}</div>
    </div>
  </div>`;
  // Abertura por nivel hierarquico — 3 KPI cards.
  const nivel = b.aberturaPorNivelHierarquico;
  const nivelHtml =
    nivel === null
      ? ''
      : `<h3 class="h3-compact" style="margin-top:4mm;">Abertura por nível hierárquico</h3>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card">
      <div class="kpi-label">Estratégico</div>
      <div class="kpi-value">${fmtPct(nivel.estrategico.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.estrategico.saidas)} ${pluralSaida(nivel.estrategico.saidas)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tático</div>
      <div class="kpi-value">${fmtPct(nivel.tatico.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.tatico.saidas)} ${pluralSaida(nivel.tatico.saidas)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Operacional</div>
      <div class="kpi-value">${fmtPct(nivel.operacional.turnoverPercentual)}</div>
      <div class="kpi-sub">${fmtInt(nivel.operacional.saidas)} ${pluralSaida(nivel.operacional.saidas)}</div>
    </div>
  </div>`;
  const paragrafo = input.paragrafoTurnover ?? '';
  const takeaway = takeawayTurnover({
    trimestralPct: atual.turnoverTrimestralPercentual,
    variacaoPct: variacaoRelativa,
    ultimos12mPct: b.ultimos12Meses.turnoverPercentual,
    voluntarioPct: atual.turnoverVoluntarioPercentual,
    involuntarioPct: atual.turnoverInvoluntarioPercentual,
  });
  return `<section class="page-break">
  <h2>Bloco Turnover</h2>
  <p>Rotatividade no trimestre, variação, janela móvel de 12 meses e projeção anualizada.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">${kpiCards.join('\n')}</div>
  ${voluntariasHtml}
  ${nivelHtml}
  <div class="info-card" style="margin-top:3mm;">
    ${paragrafosArejados(paragrafo)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Detalhamento capilar — ranking de lideres com outliers
// ============================================================

function metadadoLider(equipe: ExecReportEquipeLinha, departamentoDoBloco: string): string {
  if (equipe.tipoLider === 'clevel') return ' <span class="muted">(C-level)</span>';
  if (equipe.departamentoDoLider !== null && equipe.departamentoDoLider !== departamentoDoBloco) {
    return ` <span class="muted">(${escapeHtml(equipe.departamentoDoLider)})</span>`;
  }
  return '';
}

function renderDetalhamentoCapilar(input: ExecutiveReportFinalPayload): string {
  const linhas = input.detalhamentoCapilar.departamentos;
  if (linhas.length === 0) return '';
  const secoes = linhas
    .map((d) => {
      const equipesOrdenadas = [...d.equipes].sort((a, b) => {
        const sa = a.scoreDesempenhoMedio ?? -Infinity;
        const sb = b.scoreDesempenhoMedio ?? -Infinity;
        if (sa !== sb) return sb - sa;
        return a.liderNome.localeCompare(b.liderNome, 'pt-BR');
      });
      const equipes =
        equipesOrdenadas.length === 0
          ? '<div class="info-card"><p style="margin:0;" class="muted">Sem equipes com liderados diretos ativos neste trimestre.</p></div>'
          : `<div class="exec-dept-table-wrap wrap-no-clip"><table class="ranking-table data-table">
    <colgroup>
      <col style="width:45%" />
      <col style="width:12%" />
      <col style="width:21%" />
      <col style="width:22%" />
    </colgroup>
    <thead>
      <tr><th>Líder</th><th class="right">Ativos</th><th class="right">Desempenho</th><th class="right">Plenitude</th></tr>
    </thead>
    <tbody>${equipesOrdenadas
      .map((e) => {
        const fDesemp = faixaDesempenho(e.scoreDesempenhoMedio);
        const fPlen = faixaPlenitude(e.plenitudeScoreMedio);
        return `<tr><td>${escapeHtml(e.liderNome)}${metadadoLider(e, d.departamento)}</td><td class="right">${fmtInt(e.colaboradoresAtivos)}</td><td class="right cell-${faixaCssClass(fDesemp)}">${fmtNum(e.scoreDesempenhoMedio)}</td><td class="right cell-${faixaCssClass(fPlen)}">${fmtNum(e.plenitudeScoreMedio)}</td></tr>`;
      })
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
  return `<section class="page-break">
  <h2>Detalhamento capilar</h2>
  <p>Equipes ordenadas por desempenho dentro de cada departamento. Cores por valor identificam outliers.</p>
</section>
${secoes}`;
}

// ============================================================
// Proximos passos canonicos (pg 11)
// ============================================================

function renderProximosPassos(input: ExecutiveReportFinalPayload): string {
  const passos = derivarProximosPassosExecutivo(input);
  const html = passos
    .map(
      (p, i) =>
        `<li class="proximos-passos-item"><div class="proximos-passos-numero">${i + 1}</div><div>${escapeHtml(p)}</div></li>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Próximos passos</h2>
  <p>Três recomendações derivadas dos dados do trimestre para orientar o próximo ciclo.</p>
  <ul class="proximos-passos-list">${html}</ul>
</section>`;
}

// ============================================================
// Rastreabilidade
// ============================================================

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
    renderPainelExecutivo(input),
    renderResumoExecutivo(input),
    renderComparativoDepartamentos(input),
    renderBlocoFinanceiro(input),
    renderBlocoDesempenho(input),
    renderBlocoPlenitude(input),
    renderBlocoClima(input),
    renderBlocoTurnover(input),
    renderDetalhamentoCapilar(input),
    renderProximosPassos(input),
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
