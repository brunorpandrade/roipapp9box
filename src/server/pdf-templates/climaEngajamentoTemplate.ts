/* eslint-disable @stylistic/max-len -- template HTML com strings de layout longas */
// ROIP APP 9BOX — template PDF Clima e engajamento (ME-053, S275;
// ME-1.3d-REV DIS-C redesign McKinsey/BCG; CC079-DIS-C-2 reestrut.).
//
// Renderizacao HTML deterministica do relatorio Clima e engajamento
// (DOC 03 §13.6). 100% template — SEM participacao de IA. Consumido
// por `exports.getClimaEngajamento` (Route Handler).
//
// CC079-DIS-C-2 (01/11/2026) — reestruturacao canonica:
//
// Estrutura canonica final:
//   1. Capa + 3 achados principais ✦ (nota geral, dimensao mais
//      fragil, depto com pior clima).
//   2. Visao panoramica da empresa — 3 KPI cards + 4 dim-bars
//      semaforizadas + Top 3 aspectos individuais por dimensao.
//   3. Detalhamento dos aspectos individuais por dimensao — as 4
//      dimensoes abertas em uma pagina isolada.
//   4. Comparativo entre departamentos — tabela ordenada por nota
//      de clima + linha de media + cor por valor + takeaway.
//   5. Ranking de equipes — top 5 e bottom 5 equipes com piso
//      atendido em cards verticais.
//   6+. Drill-down por departamento — 4 cards por A4 em grid 2x2,
//      cada um com nota, dim-bars; sem tabela de sub-equipes.
//   N+. Drill-down por lideranca — 4 cards por A4 em grid 2x2,
//      cada um com nome do lider, depto, nota e dim-bars; rodape
//      com equipes abaixo do piso de anonimato.
//   M. Proximos passos canonicos — 3 recomendacoes derivadas
//      deterministicamente dos dados.
//   M+1. Rastreabilidade e integridade.
//
// Fix D-CLIMA-CABECALHO-COLADO: tabela cascata com `table-layout:
// fixed`, larguras percentuais explicitas, fonte 6pt + word-break.
//
// Determinismo: mesmo input = mesmo HTML byte a byte, exceto
// `geradoEmIso` no rodape.

import { formatTrimestreBR } from '../../lib/cycle/formatTrimestreBR';
import { TEXTOS_QUESTOES_CLIMA, rotuloDimensaoClima } from '../../lib/climate/textosQuestoesClima';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  coresCanonicasPorFaixa,
  faixaClima,
  type FaixaSemaforo,
} from '../../lib/semaforo/faixasCanonicas';
import { escapeHtml, renderLayoutBase } from './layoutBase';
import { derivarProximosPassosClima } from './_shared/proximosPassosHelpers';
import { ordenarRanking, derivarTopBottom } from './_shared/rankingHelpers';

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
  notasPorAspecto?: readonly (number | null)[] | null;
  notaAgregacao: string | null;
}

export interface ClimaBlocoDepartamento extends ClimaBlocoEscopo {
  equipes: ClimaBlocoEscopo[];
}

export interface ClimaEngajamentoTemplateInput {
  nomeFantasia: string;
  razaoSocialSanitizada: string;
  /**
   * ME-1.3d-REV DIS-C CC079-1: URL da logo canonica da empresa.
   * `null` ou ausente → sem marca no canto superior direito.
   */
  logoUrl?: string | null;
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

function faixaCss(faixa: FaixaSemaforo | null): string {
  if (faixa === null) return '';
  return `semf-${faixa}`;
}

function renderDimBarSemaforizada(rotulo: string, valor: number | null, maxEscala: number): string {
  const faixa = faixaClima(valor);
  const css = faixaCss(faixa);
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
    <div class="dim-bar-track"><div class="dim-bar-fill ${css}" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="dim-bar-value ${css}">${fmtNum(valor)}</div>
  </div>`;
}

function renderAspectoBar(texto: string, valor: number | null, maxEscala: number): string {
  const faixa = faixaClima(valor);
  const css = faixaCss(faixa);
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
    <div class="aspecto-bar-track"><div class="aspecto-bar-fill ${css}" style="width:${pct.toFixed(2)}%;"></div></div>
    <div class="aspecto-bar-value ${css}">${fmtNum(valor)}</div>
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
// Derivacao canonica dos 3 achados + piores dimensao e aspecto
// ============================================================

function piorDimensao(bloco: ClimaBlocoEscopo): { nome: string; valor: number } | null {
  const dim = bloco.porDimensao;
  const linhas = [
    { nome: 'engajamento', valor: dim.engajamento },
    { nome: 'desenvolvimento', valor: dim.desenvolvimento },
    { nome: 'pertencimento', valor: dim.pertencimento },
    { nome: 'realização', valor: dim.realizacao },
  ];
  const validos = linhas.filter((l): l is { nome: string; valor: number } => l.valor !== null);
  if (validos.length === 0) return null;
  return validos.reduce((acc, cur) => (cur.valor < acc.valor ? cur : acc));
}

function piorDepartamentoClima(
  deptos: readonly ClimaBlocoDepartamento[],
): ClimaBlocoDepartamento | null {
  const validos = deptos.filter(
    (d): d is ClimaBlocoDepartamento & { notaClima: number } =>
      d.notaClima !== null && Number.isFinite(d.notaClima),
  );
  if (validos.length === 0) return null;
  return validos.reduce((acc, cur) => (cur.notaClima < acc.notaClima ? cur : acc));
}

function piorAspectoCanonico(notas: readonly (number | null)[]): {
  idx: number;
  texto: string;
  valor: number;
} | null {
  const linhas = notas
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v));
  if (linhas.length === 0) return null;
  const pior = linhas.reduce((acc, cur) => (cur.v < acc.v ? cur : acc));
  return { idx: pior.i, texto: TEXTOS_QUESTOES_CLIMA[pior.i] ?? '', valor: pior.v };
}

interface AchadoCanonico {
  texto: string;
  faixa: FaixaSemaforo;
}

function derivarAchadosCanonicos(input: ClimaEngajamentoTemplateInput): readonly AchadoCanonico[] {
  const empresa = input.blocoEmpresa;
  const achados: AchadoCanonico[] = [];
  const faixaNota = faixaClima(empresa.notaClima);
  if (empresa.notaClima !== null && faixaNota !== null) {
    achados.push({
      texto: `Nota de clima da empresa em ${fmtNum(empresa.notaClima)} (${fmtInt(empresa.respondentes)} respondentes; adesão de ${fmtPctInt(empresa.adesao)}).`,
      faixa: faixaNota,
    });
  }
  const piorDim = piorDimensao(empresa);
  if (piorDim !== null) {
    const faixa = faixaClima(piorDim.valor) ?? 'amarelo';
    achados.push({
      texto: `Dimensão mais frágil: ${piorDim.nome} em ${fmtNum(piorDim.valor)}.`,
      faixa,
    });
  }
  const piorDept = piorDepartamentoClima(input.blocosDepartamentos);
  if (piorDept !== null) {
    const faixa = faixaClima(piorDept.notaClima) ?? 'amarelo';
    achados.push({
      texto: `Departamento com menor nota de clima: ${piorDept.titulo} em ${fmtNum(piorDept.notaClima)}.`,
      faixa,
    });
  }
  while (achados.length < 3) {
    achados.push({
      texto: 'Dados complementares disponíveis nas próximas páginas.',
      faixa: 'amarelo',
    });
  }
  return achados.slice(0, 3);
}

// ============================================================
// Capa + 3 achados
// ============================================================

function renderCapaMaisAchados(input: ClimaEngajamentoTemplateInput): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.geradoEmIso));
  const achados = derivarAchadosCanonicos(input);
  const achadosHtml = achados
    .map((a) => `<li class="achado-item achado-${a.faixa}">${escapeHtml(a.texto)}</li>`)
    .join('\n');
  const tese =
    (faixaClima(input.blocoEmpresa.notaClima) ?? 'amarelo') === 'verde'
      ? 'Clima favorável no trimestre — base pronta para sustentar entrega e desenvolvimento.'
      : (faixaClima(input.blocoEmpresa.notaClima) ?? 'amarelo') === 'amarelo'
        ? 'Clima em zona de atenção — monitorar dimensões e departamentos frágeis.'
        : 'Clima em alerta — recomendada investigação prioritária com liderança.';
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
  <div class="tese-card">${escapeHtml(tese)}</div>
  <h2 class="h2-compact" style="margin-top:6mm;">Principais achados do trimestre</h2>
  <ul class="achados-list">${achadosHtml}</ul>
</section>`;
}

// ============================================================
// Visao panoramica da empresa + Top 3 aspectos individuais (pg 2)
// ============================================================

function renderTop3Cards(input: ClimaEngajamentoTemplateInput): string {
  const notas = input.blocoEmpresa.notasPorAspecto ?? [];
  if (notas.length !== 20) {
    return '';
  }
  const aspectos = notas
    .map((v, i) => ({ v, i, texto: TEXTOS_QUESTOES_CLIMA[i] ?? '' }))
    .filter(
      (x): x is { v: number; i: number; texto: string } => x.v !== null && Number.isFinite(x.v),
    );
  const ranking = ordenarRanking(
    aspectos,
    (a) => a.v,
    (a) => a.texto,
  );
  const topBottom = derivarTopBottom(ranking, 3);
  const topItems = topBottom.top
    .map(
      (r) =>
        `<div class="ranking-item"><div class="ranking-item-name">${escapeHtml(r.item.texto)}</div><div class="ranking-item-score">${fmtNum(r.score)}</div></div>`,
    )
    .join('\n');
  const bottomItems = topBottom.bottom
    .map(
      (r) =>
        `<div class="ranking-item"><div class="ranking-item-name">${escapeHtml(r.item.texto)}</div><div class="ranking-item-score">${fmtNum(r.score)}</div></div>`,
    )
    .join('\n');
  return `<h3 class="h3-compact" style="margin-top:5mm;">Top 3 aspectos individuais por dimensão</h3>
  <div class="ranking-grid">
    <div class="ranking-col ranking-top">
      <h4 class="ranking-col-title">Top 3 aspectos mais fortes</h4>
      ${topItems}
    </div>
    <div class="ranking-col ranking-bottom">
      <h4 class="ranking-col-title">Top 3 aspectos mais frágeis</h4>
      ${bottomItems}
    </div>
  </div>`;
}

function renderVisaoPanoramica(input: ClimaEngajamentoTemplateInput): string {
  const bloco = input.blocoEmpresa;
  const faixaNota = faixaClima(bloco.notaClima);
  const classesNota = coresCanonicasPorFaixa(faixaNota);
  const takeawayTexto = (() => {
    if (bloco.notaClima === null) return 'Nota de clima indisponível pelo piso de anonimato.';
    const piorDim = piorDimensao(bloco);
    if (piorDim === null) {
      return `Nota agregada em ${fmtNum(bloco.notaClima)}; perfil estável entre dimensões.`;
    }
    return `Nota agregada em ${fmtNum(bloco.notaClima)}; dimensão mais frágil: ${piorDim.nome} (${fmtNum(piorDim.valor)}).`;
  })();
  return `<section class="page-break">
  <h2>Visão panorâmica — Empresa</h2>
  <p>Agregado consolidado no topo da cascata hierárquica, com cores por valor nas dimensões.</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-top:2mm;">
    <div class="kpi-card">
      <div class="kpi-label">Respondentes</div>
      <div class="kpi-value">${fmtInt(bloco.respondentes)}</div>
      <div class="kpi-sub">${fmtInt(input.blocosDepartamentos.length)} departamentos na cascata</div>
    </div>
    <div class="kpi-card ${classesNota.cardClass}">
      <div class="kpi-label">Nota de clima</div>
      <div class="kpi-value ${classesNota.valueClass}">${fmtNum(bloco.notaClima)}</div>
      <div class="kpi-sub">Agregado empresa</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value">${fmtPctInt(bloco.adesao)}</div>
      <div class="kpi-sub">Participação no ciclo</div>
    </div>
  </div>
  <h3 class="h3-compact" style="margin-top:4mm;">Perfil por dimensão</h3>
  <div class="dim-bars">
    ${renderDimBarSemaforizada('Engajamento', bloco.porDimensao.engajamento, 10)}
    ${renderDimBarSemaforizada('Desenvolvimento', bloco.porDimensao.desenvolvimento, 10)}
    ${renderDimBarSemaforizada('Pertencimento', bloco.porDimensao.pertencimento, 10)}
    ${renderDimBarSemaforizada('Realização', bloco.porDimensao.realizacao, 10)}
  </div>
  <div class="takeaway-card">${escapeHtml(takeawayTexto)}</div>
  ${renderTop3Cards(input)}
</section>`;
}

// ============================================================
// Detalhamento dos aspectos individuais por dimensao (pg 3)
// — as 4 dimensoes abertas em uma pagina isolada.
// ============================================================

function renderDetalhamentoAspectos(input: ClimaEngajamentoTemplateInput): string {
  const notas = input.blocoEmpresa.notasPorAspecto ?? [];
  if (notas.length !== 20) {
    return '';
  }
  const dimEmpresa = input.blocoEmpresa.porDimensao;
  const dimNotas = [
    dimEmpresa.engajamento,
    dimEmpresa.desenvolvimento,
    dimEmpresa.pertencimento,
    dimEmpresa.realizacao,
  ];
  const grupos: string[] = [];
  for (let d = 1; d <= 4; d += 1) {
    const dimNome = rotuloDimensaoClima(d);
    const notaDim = dimNotas[d - 1] ?? null;
    const faixaDimAtual = faixaClima(notaDim);
    const cssDim = faixaCss(faixaDimAtual);
    const pctDim = notaDim === null ? 0 : Math.max(0, Math.min(100, (notaDim / 10) * 100));
    const aspectoLinhas: string[] = [];
    for (let item = 1; item <= 5; item += 1) {
      const idx = (d - 1) * 5 + (item - 1);
      const valor = notas[idx] ?? null;
      const texto = TEXTOS_QUESTOES_CLIMA[idx] ?? '';
      aspectoLinhas.push(renderAspectoBar(texto, valor, 10));
    }
    // CC079-DIS-C-2a-1: layout 1 coluna canonico (modelo do print):
    // cabecalho da dimensao (nome + dim-bar longa + nota) e abaixo
    // os 5 aspectos empilhados com barras curtas a direita do label.
    // 4 blocos cabem em uma unica A4 via fonte compacta e espacamento
    // reduzido na classe `.dim-aberta-compacta` do layoutBase.
    grupos.push(`<div class="dim-aberta-group dim-aberta-compacta">
      <div class="dim-aberta-head">
        <h4 class="dim-aberta-title">${escapeHtml(dimNome)}</h4>
        <div class="dim-aberta-barra"><div class="dim-aberta-fill ${cssDim}" style="width:${pctDim.toFixed(2)}%;"></div></div>
        <div class="dim-aberta-nota ${cssDim}">${fmtNum(notaDim)}</div>
      </div>
      <div class="aspecto-bars">${aspectoLinhas.join('\n')}</div>
    </div>`);
  }
  return `<section class="page-break">
  <h2>Detalhamento dos aspectos individuais por dimensão</h2>
  <div>${grupos.join('\n')}</div>
</section>`;
}

// ============================================================
// Comparativo entre departamentos (pg 4) — tabela com ranking +
// linha de media + cor por valor
// ============================================================

function renderComparativoDeptos(input: ClimaEngajamentoTemplateInput): string {
  const deptos = input.blocosDepartamentos;
  if (deptos.length === 0) return '';
  const comNota = deptos.filter(
    (d): d is ClimaBlocoDepartamento & { notaClima: number } =>
      d.notaClima !== null && Number.isFinite(d.notaClima),
  );
  const semNota = deptos.filter((d) => d.notaClima === null);
  comNota.sort((a, b) => {
    if (a.notaClima !== b.notaClima) return b.notaClima - a.notaClima;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });
  const ordenados = [...comNota, ...semNota];
  const media = input.blocoEmpresa;
  const mediaFaixa = faixaCss(faixaClima(media.notaClima));
  const linhaMedia = `<tr class="ranking-row-media">
    <td>Média da empresa</td>
    <td class="right">${fmtInt(media.respondentes)}</td>
    <td class="right cell-${mediaFaixa}">${fmtNum(media.notaClima)}</td>
    <td class="right">${fmtPctInt(media.adesao)}</td>
    <td class="right cell-${faixaCss(faixaClima(media.porDimensao.engajamento))}">${fmtNum(media.porDimensao.engajamento)}</td>
    <td class="right cell-${faixaCss(faixaClima(media.porDimensao.desenvolvimento))}">${fmtNum(media.porDimensao.desenvolvimento)}</td>
    <td class="right cell-${faixaCss(faixaClima(media.porDimensao.pertencimento))}">${fmtNum(media.porDimensao.pertencimento)}</td>
    <td class="right cell-${faixaCss(faixaClima(media.porDimensao.realizacao))}">${fmtNum(media.porDimensao.realizacao)}</td>
  </tr>`;
  const rows = ordenados
    .map((d) => {
      const corNota = faixaCss(faixaClima(d.notaClima));
      return `<tr>
      <td>${escapeHtml(d.titulo)}</td>
      <td class="right">${fmtInt(d.respondentes)}</td>
      <td class="right cell-${corNota}">${fmtNum(d.notaClima)}</td>
      <td class="right">${fmtPctInt(d.adesao)}</td>
      <td class="right cell-${faixaCss(faixaClima(d.porDimensao.engajamento))}">${fmtNum(d.porDimensao.engajamento)}</td>
      <td class="right cell-${faixaCss(faixaClima(d.porDimensao.desenvolvimento))}">${fmtNum(d.porDimensao.desenvolvimento)}</td>
      <td class="right cell-${faixaCss(faixaClima(d.porDimensao.pertencimento))}">${fmtNum(d.porDimensao.pertencimento)}</td>
      <td class="right cell-${faixaCss(faixaClima(d.porDimensao.realizacao))}">${fmtNum(d.porDimensao.realizacao)}</td>
    </tr>`;
    })
    .join('\n');
  const takeaway = (() => {
    if (comNota.length === 0) return 'Sem departamentos com piso atendido para comparar.';
    const melhor = comNota[0];
    const pior = comNota[comNota.length - 1];
    if (!melhor || !pior || melhor === pior) {
      return 'Dispersão entre departamentos sem outliers claros.';
    }
    return `Maior clima em ${melhor.titulo} (${fmtNum(melhor.notaClima)}); menor em ${pior.titulo} (${fmtNum(pior.notaClima)}).`;
  })();
  return `<section class="page-break">
  <h2>Comparativo entre departamentos</h2>
  <p>Departamentos ordenados pela nota de clima; linha de média da empresa como referência. Cores por valor em cada célula.</p>
  <div class="exec-dept-table-wrap wrap-no-clip">
    <table class="ranking-table data-table clima-cascata-tabela">
      <colgroup>
        <col style="width:18%" />
        <col style="width:11%" />
        <col style="width:8%" />
        <col style="width:8%" />
        <col style="width:13.75%" />
        <col style="width:13.75%" />
        <col style="width:13.75%" />
        <col style="width:13.75%" />
      </colgroup>
      <thead>
        <tr>
          <th>Departamento</th>
          <th class="right">Respondentes</th>
          <th class="right">Clima</th>
          <th class="right">Adesão</th>
          <th class="right">Engajamento</th>
          <th class="right">Desenvolvimento</th>
          <th class="right">Pertencimento</th>
          <th class="right">Realização</th>
        </tr>
      </thead>
      <tbody>${linhaMedia}
${rows}</tbody>
    </table>
  </div>
  <div class="takeaway-card">${escapeHtml(takeaway)}</div>
</section>`;
}

// ============================================================
// Ranking de equipes (pg 5)
// ============================================================

interface EquipeComContexto {
  departamento: string;
  equipe: ClimaBlocoEscopo;
}

function renderRankingEquipes(input: ClimaEngajamentoTemplateInput): string {
  const equipes: EquipeComContexto[] = [];
  let equipesForaRanking = 0;
  for (const d of input.blocosDepartamentos) {
    for (const e of d.equipes) {
      if (e.notaClima !== null && Number.isFinite(e.notaClima)) {
        equipes.push({ departamento: d.titulo, equipe: e });
      } else {
        equipesForaRanking += 1;
      }
    }
  }
  if (equipes.length === 0) {
    return `<section class="page-break">
  <h2>Ranking de equipes</h2>
  <div class="info-card"><p class="muted" style="margin:0;">Nenhuma equipe atingiu o piso de anonimato para entrar no ranking.</p></div>
</section>`;
  }
  const ranking = ordenarRanking(
    equipes,
    (e) => e.equipe.notaClima,
    (e) => e.equipe.titulo,
  );
  const topBottom = derivarTopBottom(ranking, 5);
  const topItems = topBottom.top
    .map(
      (r) =>
        `<div class="ranking-item"><div class="ranking-item-name">${escapeHtml(r.item.equipe.titulo)}<br/><span class="muted" style="font-size:8pt;">${escapeHtml(r.item.departamento)}</span></div><div class="ranking-item-score ${faixaCss(faixaClima(r.score))}">${fmtNum(r.score)}</div></div>`,
    )
    .join('\n');
  const bottomItems = topBottom.bottom
    .map(
      (r) =>
        `<div class="ranking-item"><div class="ranking-item-name">${escapeHtml(r.item.equipe.titulo)}<br/><span class="muted" style="font-size:8pt;">${escapeHtml(r.item.departamento)}</span></div><div class="ranking-item-score ${faixaCss(faixaClima(r.score))}">${fmtNum(r.score)}</div></div>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Ranking de equipes</h2>
  <p>Top 5 melhores e top 5 mais frágeis entre as equipes que atingiram o piso de anonimato.</p>
  <div class="ranking-grid">
    <div class="ranking-col ranking-top">
      <h4 class="ranking-col-title">Top 5 melhores</h4>
      ${topItems}
    </div>
    <div class="ranking-col ranking-bottom">
      <h4 class="ranking-col-title">Top 5 mais frágeis</h4>
      ${bottomItems}
    </div>
  </div>
  <div class="takeaway-card">${fmtInt(equipes.length)} ${equipes.length === 1 ? 'equipe entrou' : 'equipes entraram'} no ranking.${equipesForaRanking > 0 ? ` Ficaram fora do ranking ${fmtInt(equipesForaRanking)} ${equipesForaRanking === 1 ? 'equipe que não atingiu' : 'equipes que não atingiram'} o piso de anonimato.` : ''}</div>
</section>`;
}

// ============================================================
// Drill-down por departamento (4 por A4 em grid 2x2)
// CC079-DIS-C-2: SEM tabela de sub-equipes (migrou para a secao
// de Drill-down por lideranca).
// ============================================================

function renderDrillDownDepto(dept: ClimaBlocoDepartamento): string {
  const faixa = faixaClima(dept.notaClima);
  const css = faixaCss(faixa);
  return `<div class="clima-drilldown-card">
    <div class="clima-drilldown-head">
      <div class="clima-drilldown-nome">${escapeHtml(dept.titulo)}</div>
      <div class="clima-drilldown-nota ${css}">${fmtNum(dept.notaClima)}</div>
    </div>
    <div class="clima-drilldown-meta">${fmtInt(dept.respondentes)} respondentes · Adesão ${fmtPctInt(dept.adesao)}</div>
    <div class="dim-bars clima-drilldown-bars">
      ${renderDimBarSemaforizada('Engajamento', dept.porDimensao.engajamento, 10)}
      ${renderDimBarSemaforizada('Desenvolvimento', dept.porDimensao.desenvolvimento, 10)}
      ${renderDimBarSemaforizada('Pertencimento', dept.porDimensao.pertencimento, 10)}
      ${renderDimBarSemaforizada('Realização', dept.porDimensao.realizacao, 10)}
    </div>
  </div>`;
}

function renderDrillDownDeptos(input: ClimaEngajamentoTemplateInput): string {
  const deptos = input.blocosDepartamentos;
  if (deptos.length === 0) return '';
  const paginas: string[] = [];
  // CC079-DIS-C-2a-2: 8 cards por pagina (grid 2 colunas x 4 linhas).
  for (let i = 0; i < deptos.length; i += 8) {
    const grupo = deptos.slice(i, i + 8);
    const cards = grupo.map((d) => renderDrillDownDepto(d)).join('\n');
    paginas.push(`<section class="page-break">
  ${i === 0 ? '<h2>Drill-down por departamento</h2>' : ''}
  <div class="clima-drilldown-grid-8">${cards}</div>
</section>`);
  }
  return paginas.join('\n');
}

// ============================================================
// Drill-down por lideranca (4 por A4 em grid 2x2)
// CC079-DIS-C-2 (NOVO): visao canonica por lideranca com depto
// de referencia. Equipes abaixo do piso de anonimato entram no
// rodape da ultima pagina da secao, com nome do lider e N
// liderados.
// ============================================================

interface LiderancaCard {
  nomeLider: string;
  departamento: string;
  bloco: ClimaBlocoEscopo;
}

function renderDrillDownLiderancaCard(card: LiderancaCard): string {
  const faixa = faixaClima(card.bloco.notaClima);
  const css = faixaCss(faixa);
  return `<div class="clima-drilldown-card">
    <div class="clima-drilldown-head">
      <div class="clima-drilldown-nome">${escapeHtml(card.nomeLider)}</div>
      <div class="clima-drilldown-nota ${css}">${fmtNum(card.bloco.notaClima)}</div>
    </div>
    <div class="clima-drilldown-meta">${fmtInt(card.bloco.respondentes)} respondentes · Adesão ${fmtPctInt(card.bloco.adesao)}</div>
    <div class="dim-bars clima-drilldown-bars">
      ${renderDimBarSemaforizada('Engajamento', card.bloco.porDimensao.engajamento, 10)}
      ${renderDimBarSemaforizada('Desenvolvimento', card.bloco.porDimensao.desenvolvimento, 10)}
      ${renderDimBarSemaforizada('Pertencimento', card.bloco.porDimensao.pertencimento, 10)}
      ${renderDimBarSemaforizada('Realização', card.bloco.porDimensao.realizacao, 10)}
    </div>
  </div>`;
}

function renderDrillDownLiderancas(input: ClimaEngajamentoTemplateInput): string {
  const comPiso: LiderancaCard[] = [];
  const semPiso: LiderancaCard[] = [];
  for (const d of input.blocosDepartamentos) {
    for (const e of d.equipes) {
      const card: LiderancaCard = {
        nomeLider: e.titulo,
        departamento: d.titulo,
        bloco: e,
      };
      if (e.notaClima !== null && Number.isFinite(e.notaClima)) {
        comPiso.push(card);
      } else {
        semPiso.push(card);
      }
    }
  }
  if (comPiso.length === 0 && semPiso.length === 0) return '';
  // Ordem canonica: por nota desc (comPiso) e por nome asc (semPiso).
  comPiso.sort((a, b) => {
    const na = a.bloco.notaClima ?? -Infinity;
    const nb = b.bloco.notaClima ?? -Infinity;
    if (na !== nb) return nb - na;
    return a.nomeLider.localeCompare(b.nomeLider, 'pt-BR');
  });
  semPiso.sort((a, b) => a.nomeLider.localeCompare(b.nomeLider, 'pt-BR'));
  const paginas: string[] = [];
  // CC079-DIS-C-2a-2: 8 cards por pagina (grid 2 colunas x 4 linhas).
  if (comPiso.length > 0) {
    for (let i = 0; i < comPiso.length; i += 8) {
      const grupo = comPiso.slice(i, i + 8);
      const cards = grupo.map((c) => renderDrillDownLiderancaCard(c)).join('\n');
      const isUltimaPagina = i + 8 >= comPiso.length;
      const rodapeSemPiso =
        isUltimaPagina && semPiso.length > 0
          ? `<div class="clima-liderancas-fora-piso">
            <h4 class="clima-liderancas-fora-piso-title">Equipes abaixo do piso de anonimato</h4>
            <p class="clima-liderancas-fora-piso-hint">${fmtInt(semPiso.length)} ${semPiso.length === 1 ? 'equipe' : 'equipes'} não ${semPiso.length === 1 ? 'atingiu' : 'atingiram'} o piso para aparecer no drill-down.</p>
            <ul class="clima-liderancas-fora-piso-list">${semPiso
              .map(
                (s) =>
                  `<li>${escapeHtml(s.nomeLider)} <span class="muted">(${escapeHtml(s.departamento)})</span> — ${fmtInt(s.bloco.respondentes)} ${s.bloco.respondentes === 1 ? 'liderado' : 'liderados'}</li>`,
              )
              .join('\n')}</ul>
          </div>`
          : '';
      paginas.push(`<section class="page-break">
  ${i === 0 ? '<h2>Drill-down por liderança</h2>' : ''}
  <div class="clima-drilldown-grid-8">${cards}</div>
  ${rodapeSemPiso}
</section>`);
    }
  } else if (semPiso.length > 0) {
    // Nenhum lider atingiu o piso — pagina so com o rodape.
    paginas.push(`<section class="page-break">
  <h2>Drill-down por liderança</h2>
  <div class="info-card"><p class="muted" style="margin:0;">Nenhuma liderança atingiu o piso de anonimato para o drill-down.</p></div>
  <div class="clima-liderancas-fora-piso">
    <h4 class="clima-liderancas-fora-piso-title">Equipes abaixo do piso de anonimato</h4>
    <p class="clima-liderancas-fora-piso-hint">${fmtInt(semPiso.length)} ${semPiso.length === 1 ? 'equipe' : 'equipes'} não ${semPiso.length === 1 ? 'atingiu' : 'atingiram'} o piso para aparecer no drill-down.</p>
    <ul class="clima-liderancas-fora-piso-list">${semPiso
      .map(
        (s) =>
          `<li>${escapeHtml(s.nomeLider)} <span class="muted">(${escapeHtml(s.departamento)})</span> — ${fmtInt(s.bloco.respondentes)} ${s.bloco.respondentes === 1 ? 'liderado' : 'liderados'}</li>`,
      )
      .join('\n')}</ul>
  </div>
</section>`);
  }
  return paginas.join('\n');
}

// ============================================================
// Proximos passos canonicos
// ============================================================

function renderProximosPassos(input: ClimaEngajamentoTemplateInput): string {
  const piorAspecto = (() => {
    const notas = input.blocoEmpresa.notasPorAspecto;
    if (!notas || notas.length !== 20) return null;
    return piorAspectoCanonico(notas);
  })();
  const passos = derivarProximosPassosClima({
    notaClimaEmpresa: input.blocoEmpresa.notaClima,
    deptos: input.blocosDepartamentos.map((d) => ({
      titulo: d.titulo,
      notaClima: d.notaClima,
      respondentes: d.respondentes,
    })),
    dimensoesEmpresa: input.blocoEmpresa.porDimensao,
    piorAspectoTexto: piorAspecto === null ? null : piorAspecto.texto,
  });
  const html = passos
    .map(
      (p, i) =>
        `<li class="proximos-passos-item"><div class="proximos-passos-numero">${i + 1}</div><div>${escapeHtml(p)}</div></li>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Próximos passos</h2>
  <p>Três recomendações derivadas dos dados do trimestre para orientar os próximos ciclos.</p>
  <ul class="proximos-passos-list">${html}</ul>
</section>`;
}

// ============================================================
// Rastreabilidade
// ============================================================

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
  const bodyHtml = [
    renderCapaMaisAchados(input),
    renderVisaoPanoramica(input),
    renderDetalhamentoAspectos(input),
    // CC079-DIS-C-2a-3: sequencia canonica macro->zoom em cada camada.
    // Depto: macro (comparativo) -> zoom (drill-down). Equipe: macro
    // (ranking) -> zoom (drill-down).
    renderComparativoDeptos(input),
    renderDrillDownDeptos(input),
    renderRankingEquipes(input),
    renderDrillDownLiderancas(input),
    renderProximosPassos(input),
    renderRastreabilidade(input),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
  return renderLayoutBase({
    title: `Clima e engajamento · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    company: {
      nomeFantasia: input.nomeFantasia,
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    },
    bodyHtml,
    footerLeft: `Clima e engajamento · ${input.nomeFantasia} · ${formatTrimestreBR(input.trimestre)}`,
    footerCenter: `Gerado em ${toTimestampBrt(input.geradoEmIso) ?? input.geradoEmIso}`,
  });
}
