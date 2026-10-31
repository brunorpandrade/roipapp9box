/* eslint-disable @stylistic/max-len -- template HTML editorial com strings longas */
// ROIP APP 9BOX — template PDF Radar NR-1 (ME-1.3c CC079-v6).
//
// Renderizacao HTML deterministica (DOC 03 §11.12) espelhando as 14
// paginas canonicas do modelo visual de referencia enviado pelo Bruno
// em 17/10/2026 (`nr1_modelo.pdf`). Zero chamada a IA — hash SHA-256
// estavel entre runs (exceto timestamp de geracao).
//
// Ordem canonica das paginas (uma por secao, exceto radar por dept que
// expande em N paginas conforme quantidade de deptos com amostra ≥ 5):
//   1. Capa + Resumo executivo (combinados na mesma pagina)
//   2. Radar da empresa (grafico maior, nomes completos dos fatores)
//   3. Descricao de cada fator (8 cards com borda lateral teal)
//   4. Alertas informativos por fator — escopo empresa apenas
//   5. Rastreabilidade basica (bloco tecnico curto)
//   6..6+N: Radar por departamento (uma pagina por dept, radar + tabela
//      3 colunas FATOR / DEPARTAMENTO / EMPRESA na mesma pagina, sem
//      corte)
//   p+1: Departamentos com amostra insuficiente (simplificado: lista
//      nome + N respondentes, sem card elaborado)
//   p+2: Analise de convergencia e divergencia (populada quando ha
//      divergencia na base)
//   p+3: Departamento em situacao critica (populada quando ha dept
//      critico identificado)
//   p+4: Alertas informativos por fator (completo — empresa + dept)
//   p+5: Comparacao com ciclo anterior (nota "Dados ainda insuficientes"
//      quando primeiro ciclo)
//   p+6: Comparacao historica de longo prazo (nota padrao enquanto nao
//      ha serie)
//   p+7: Sugestoes de proximos passos (texto denso, derivacao canonica
//      enriquecida)
//   p+8: Rastreabilidade e integridade do relatorio (completa — com
//      hash SHA-256, versao do instrumento, breakdown de respondentes,
//      nota de auditoria se aplicavel)
//
// Design canonico v6 — mais limpo e suave que v5:
//   - Capa: logo no canto superior direito como marca independente;
//     titulo "Radar NR-1" em preto bold linha 1, "Riscos Psicossociais
//     no Trabalho" em teal linha 2 limpa.
//   - Radar: grafico maior (85% da coluna), nomes COMPLETOS dos 8
//     fatores nos eixos — nunca abreviacoes (ex.: "Suporte social do
//     lider", nao "Sup. lider").
//   - Deptos: 1 pagina = 1 dept. Radar + tabela 8 fatores na mesma
//     pagina. Nunca corta a tabela entre paginas.
//   - Insuficientes: lista enxuta "nome · N respondentes". Cabecalho
//     explica que entram no consolidado da empresa.
//   - Alertas empresa (p.4) e alertas completo (p.13): seccoes
//     complementares, cada uma com criterio explicito no cabecalho.
//   - Dept critico (criterio: maior magnitude de divergencia negativa
//     vs empresa, ≥ 10 pontos abaixo em pelo menos 1 fator).
//   - Sugestoes ricas: paragrafo substantivo por item (fator empresa,
//     dept critico com fatores nomeados, replicacao de divergencia
//     positiva, monitoramento historico).

import { formatDateBR } from '../../lib/date/formatDateBR';
import { dataCivilBrtFromIso, formatDataEditorial } from '../../lib/date/formatDataEditorial';
import { toTimestampBrt } from '../../lib/date/toIsoDateUtc';
import {
  projectRadarPoint,
  projectRadarPolygon,
  renderRadarGridSvg,
} from '../../lib/svg/pdfSvgHelpers';
import {
  classificarNr1Faixa,
  type Nr1Faixa,
  RADAR_COLORS,
  RADAR_NR1_CORES,
} from '../../lib/svg/pdfVisualTokens';
import { escapeHtml, type LayoutBaseCompany, renderLayoutBase } from './layoutBase';

/** Score de um dos 8 fatores. */
export interface Nr1FatorScore {
  fatorId: number;
  nome: string;
  score: number;
}

/** Score por departamento. */
export interface Nr1DepartamentoScore {
  departamentoNome: string;
  amostra: number;
  fatores: Nr1FatorScore[];
}

/** Departamento com amostra abaixo do piso (5). */
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

/** Nota de auditoria de edicao de data de fechamento (§11.12). */
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
  dataAbertura: string;
  dataFechamento: string;
  totalRespondentes: number;
  totalElegiveis: number;
}

/** Input do template. */
export interface Nr1TemplateInput {
  company: LayoutBaseCompany;
  ciclo: Nr1CicloInfo;
  resumoExecutivo: string;
  radarEmpresa: Nr1FatorScore[];
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
  generatedAtIso: string;
  generatedAtDate: string;
}

/** Normalizacao canonica do nome da empresa para o filename (§11.12). */
export function normalizeNomeEmpresaForFilename(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const semEspacosSubst = semAcento.replace(/\s+/g, '_');
  const semEspecial = semEspacosSubst.replace(/[&.,/\\:;!?*"'<>|]/g, '');
  const limitado = semEspecial.slice(0, 40);
  return limitado.length > 0 ? limitado : 'Empresa';
}

/** Compoe o nome do arquivo PDF conforme §11.12. */
export function composeNr1ReportFilename(
  nomeEmpresa: string,
  dataAbertura: string,
  dataGeracao: string,
): string {
  const nomeNorm = normalizeNomeEmpresaForFilename(nomeEmpresa);
  return `Radar_NR-1_${nomeNorm}_${dataAbertura}_${dataGeracao}.pdf`;
}

// ============================================================
// Helpers de formatacao editorial
// ============================================================
//
// ME-1.3d (26/10/2026): `MESES_PT_BR`, `formatDataEditorial` e
// `dataCivilBrtFromIso` extraidos para `src/lib/date/formatDataEditorial.ts`
// como fonte canonica unica (debito D-DUP-DATA fechado via L125 integral).

function fmtScore(score: number): string {
  const clamp = Math.max(0, Math.min(100, score));
  return clamp.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function fmtScoreInt(score: number): string {
  const clamp = Math.max(0, Math.min(100, score));
  return Math.round(clamp).toString();
}

function classificarTipoFator(nome: string): 'Fator de risco' | 'Fator de recurso' {
  const prefixosRisco = ['Exigências', 'Ritmo', 'Conflitos', 'Insegurança'];
  const isRisco = prefixosRisco.some((prefix) => nome.startsWith(prefix));
  return isRisco ? 'Fator de risco' : 'Fator de recurso';
}

// ============================================================
// Geometria do radar SVG
// ============================================================
//
// CC079-v7: viewBox LARGO (900x560) para acomodar com folga os nomes
// COMPLETOS dos 8 fatores sem corte. Raio reduzido para que os labels
// das pontas tenham espaco horizontal. Font-size 11pt.

const RADAR_SVG_CX = 450;
const RADAR_SVG_CY = 280;
const RADAR_SVG_MAX_RADIUS = 170;
const RADAR_SVG_VIEWBOX = '0 0 900 560';
const RADAR_SVG_NUM_RINGS = 4;

function renderRadarAxisLabels(fatores: readonly Nr1FatorScore[]): string {
  const labelRadius = RADAR_SVG_MAX_RADIUS + 32;
  return fatores
    .map((f, idx) => {
      const p = projectRadarPoint(
        idx,
        fatores.length,
        100,
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        labelRadius,
      );
      const label = escapeHtml(f.nome);
      // Alinhamento canonico v6: deriva pelo quadrante do angulo.
      const angleFromTop = (2 * Math.PI * idx) / fatores.length;
      const cos = Math.cos(-Math.PI / 2 + angleFromTop);
      let anchor = 'middle';
      if (cos > 0.3) anchor = 'start';
      else if (cos < -0.3) anchor = 'end';
      return `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="15" font-weight="600" fill="${RADAR_COLORS.labelFill}">${label}</text>`;
    })
    .join('\n');
}

function renderRadarSvg(
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  if (fatores.length < 3) return '';
  const scores = fatores.map((f) => f.score);
  // CC079-v5+: no modo comparativo (referencia presente), o poligono
  // do dept vai em azul escuro navy e a empresa vem como tracejado
  // teal. No modo simples (empresa sozinha), mantem o teal canonico.
  const polyFill = referencia ? RADAR_COLORS.navy : RADAR_COLORS.teal;
  const polyStroke = referencia ? RADAR_COLORS.navy : RADAR_COLORS.teal;
  const refStroke = referencia ? RADAR_COLORS.teal : RADAR_COLORS.mediaEmpresaStroke;
  const polygonPoints = projectRadarPolygon(
    scores,
    RADAR_SVG_CX,
    RADAR_SVG_CY,
    RADAR_SVG_MAX_RADIUS,
  );
  const dataPoints = scores
    .map((score, idx) => {
      const p = projectRadarPoint(
        idx,
        scores.length,
        score,
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        RADAR_SVG_MAX_RADIUS,
      );
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="5" />`;
    })
    .join('\n');
  const referenciaPoly = referencia
    ? `<polygon points="${projectRadarPolygon(
        referencia.map((f) => f.score),
        RADAR_SVG_CX,
        RADAR_SVG_CY,
        RADAR_SVG_MAX_RADIUS,
      )}" fill="none" stroke="${refStroke}" stroke-width="1.6" stroke-dasharray="${RADAR_COLORS.mediaEmpresaDasharray}" />`
    : '';
  return `<svg viewBox="${RADAR_SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; display:block;">
${renderRadarGridSvg(scores.length, RADAR_SVG_CX, RADAR_SVG_CY, RADAR_SVG_MAX_RADIUS, RADAR_SVG_NUM_RINGS, RADAR_COLORS.gridStroke)}
${referenciaPoly}
<polygon points="${polygonPoints}" fill="${polyFill}" fill-opacity="${RADAR_COLORS.tealFillOpacity}" stroke="${polyStroke}" stroke-width="2" />
<g fill="${polyStroke}">
${dataPoints}
</g>
${renderRadarAxisLabels(fatores)}
</svg>`;
}

/**
 * Legenda horizontal canonica (CC079-v5+): grid 2 colunas de dot +
 * nome + score, para colocar ABAIXO do SVG do radar (padrao da
 * referencia visual).
 */
function renderRadarLegendHorizontal(fatores: readonly Nr1FatorScore[]): string {
  const items = fatores
    .map((f) => {
      const faixa: Nr1Faixa = classificarNr1Faixa(f.score);
      const dotColor = RADAR_NR1_CORES[faixa];
      return `<div class="leg-item">
  <span class="legend-dot" style="background:${dotColor};"></span>
  <span class="leg-nome">${escapeHtml(f.nome)}</span>
  <span class="leg-score" style="color:${dotColor};">${fmtScore(f.score)}</span>
</div>`;
    })
    .join('\n');
  return `<div class="radar-legend-horizontal">
${items}
</div>`;
}

/**
 * Legenda de biparticao canonica para o radar comparado por
 * departamento (CC079-v5+): "Empresa" (linha tracejada teal) +
 * "Departamento" (linha solida azul escuro).
 */
function renderRadarLegendBiparticao(): string {
  return `<div class="radar-legend-biparticao">
  <span class="leg-chip">
    <span class="leg-swatch-line dashed"></span>
    <span>Empresa</span>
  </span>
  <span class="leg-chip">
    <span class="leg-swatch-line" style="background:${RADAR_COLORS.navy};"></span>
    <span>Departamento</span>
  </span>
</div>`;
}

/**
 * Card canonico do radar: titulo + numero de respondentes acima do
 * SVG, radar centralizado grande, legenda abaixo.
 */
function renderRadarCardBlock(
  titulo: string,
  subtitulo: string,
  fatores: readonly Nr1FatorScore[],
  referencia?: readonly Nr1FatorScore[],
): string {
  let legenda: string;
  if (referencia) {
    legenda = renderRadarLegendBiparticao();
  } else {
    legenda = renderRadarLegendHorizontal(fatores);
  }
  return `<div class="radar-block">
  <div class="radar-block-head">
    <span class="radar-block-title">${escapeHtml(titulo)}</span>
  </div>
  <div class="radar-stacked">
    <div class="radar-respondentes-cap">${escapeHtml(subtitulo)}</div>
    <div class="radar-svg-centered">${renderRadarSvg(fatores, referencia)}</div>
    ${legenda}
  </div>
</div>`;
}

// ============================================================
// Gauge semicircular (resumo executivo)
// ============================================================

function renderGaugeSvg(percent: number): string {
  const clamp = Math.max(0, Math.min(100, percent));
  const faixa: Nr1Faixa = clamp >= 66 ? 'verde' : clamp >= 50 ? 'amarelo' : 'vermelho';
  const color = RADAR_NR1_CORES[faixa];
  const angle = Math.PI - (clamp / 100) * Math.PI;
  const endX = 110 + 90 * Math.cos(angle);
  const endY = 120 - 90 * Math.sin(angle);
  const largeArc = clamp > 50 ? 1 : 0;
  const label = `${Math.round(clamp)}%`;
  return `<svg width="140" height="90" viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 120 A 90 90 0 0 1 200 120" fill="none" stroke="#F3F4F6" stroke-width="16" stroke-linecap="round"/>
  <path d="M 20 120 A 90 90 ${largeArc} 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
  <text x="110" y="115" font-family="Liberation Sans, system-ui, sans-serif" font-size="34" font-weight="700" fill="#111827" text-anchor="middle">${label}</text>
</svg>`;
}

// ============================================================
// Secoes canonicas v6
// ============================================================

/**
 * Pagina 1 — Capa + Resumo executivo combinados.
 * CC079-v6: layout do modelo. Hero em DUAS linhas separadas
 * ("Radar NR-1" preto / "Riscos Psicossociais no Trabalho" teal),
 * logo da empresa fica no canto superior direito via layoutBase
 * (sem interferir no texto). Meta grid + cover-note + h2 "Resumo
 * executivo" + 3 KPIs + gauge na MESMA pagina.
 */
function renderCapaMaisResumo(input: Nr1TemplateInput): string {
  const dataGeracao = formatDataEditorial(dataCivilBrtFromIso(input.generatedAtIso));
  const adesao =
    input.ciclo.totalElegiveis > 0
      ? Math.round((input.ciclo.totalRespondentes / input.ciclo.totalElegiveis) * 100)
      : 0;
  const alertasEmpresaCount = input.alertas.filter((a) => a.escopo === 'empresa').length;
  const invalidados = Math.max(0, input.ciclo.totalElegiveis - input.ciclo.totalRespondentes);
  const faixaAdesao: Nr1Faixa = adesao >= 66 ? 'verde' : adesao >= 50 ? 'amarelo' : 'vermelho';
  const highlightAdesao =
    faixaAdesao === 'verde'
      ? 'highlight-green'
      : faixaAdesao === 'amarelo'
        ? 'highlight-yellow'
        : 'highlight-red';
  const kpiValueClass =
    faixaAdesao === 'verde' ? 'green' : faixaAdesao === 'amarelo' ? 'yellow' : 'red';
  const gaugeTitulo =
    faixaAdesao === 'verde'
      ? 'Adesão saudável'
      : faixaAdesao === 'amarelo'
        ? 'Adesão limítrofe'
        : 'Adesão crítica';
  const gaugeBody =
    faixaAdesao === 'verde'
      ? 'Os resultados representam de forma consistente a percepção da força de trabalho e sustentam análise executiva confiável.'
      : faixaAdesao === 'amarelo'
        ? 'A adesão permite leitura executiva, mas convém investigar a razão de parte dos elegíveis não responder, para reforçar a próxima rodada.'
        : 'A adesão é insuficiente para representar a força de trabalho. Resultados devem ser lidos com cautela e investigação ativa é recomendada.';
  const resumoLimpo = input.resumoExecutivo.replace(/atencao/gi, 'atenção');
  return `<section class="cover-page">
  <div class="cover-hero">
    <div class="cover-title-line1">Radar NR-1</div>
    <div class="cover-title-line2">Riscos Psicossociais no Trabalho</div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-meta-label">Empresa</span><span class="cover-meta-value">${escapeHtml(input.company.nomeFantasia)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Ciclo</span><span class="cover-meta-value">${escapeHtml(input.ciclo.cicloRotulo)}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de abertura</span><span class="cover-meta-value">${escapeHtml(formatDataEditorial(input.ciclo.dataAbertura))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de fechamento</span><span class="cover-meta-value">${escapeHtml(formatDataEditorial(input.ciclo.dataFechamento))}</span></div>
    <div class="cover-meta-row"><span class="cover-meta-label">Data de geração do relatório</span><span class="cover-meta-value">${escapeHtml(dataGeracao)}</span></div>
  </div>
  <div class="cover-note">
    <strong>⚠ Sobre este relatório:</strong> este documento entrega um radar diagnóstico preliminar dos 8 fatores psicossociais. Não substitui os instrumentos e processos formais exigidos pela NR-1, que requerem instrumento validado cientificamente e responsável técnico habilitado. Use os resultados como ponto de partida para investigação aprofundada quando necessário.
  </div>
  <h2 class="h2-compact">Resumo executivo</h2>
  <p class="resumo-exec-paragrafo">${escapeHtml(resumoLimpo)}</p>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card ${highlightAdesao}">
      <div class="kpi-label">Adesão</div>
      <div class="kpi-value ${kpiValueClass}">${adesao}%</div>
      <div class="kpi-sub">${input.ciclo.totalRespondentes} / ${input.ciclo.totalElegiveis} elegíveis</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Respostas invalidadas</div>
      <div class="kpi-value">${invalidados}</div>
      <div class="kpi-sub">Por controle de qualidade</div>
    </div>
    <div class="kpi-card ${alertasEmpresaCount > 0 ? 'highlight-red' : ''}">
      <div class="kpi-label">Fatores em alerta</div>
      <div class="kpi-value ${alertasEmpresaCount > 0 ? 'red' : ''}">${alertasEmpresaCount}</div>
      <div class="kpi-sub">Score inferior a 50 (escopo empresa)</div>
    </div>
  </div>
  <div class="gauge-wrap">
    ${renderGaugeSvg(adesao)}
    <div>
      <div class="gauge-info-title cs-${faixaAdesao === 'verde' ? 'green' : faixaAdesao === 'amarelo' ? 'yellow' : 'red'}">${gaugeTitulo}</div>
      <div class="gauge-info-body">${gaugeBody}</div>
    </div>
  </div>
</section>`;
}

/**
 * CC079-v7: as 32 afirmacoes do instrumento MVP, agrupadas pelos 8
 * fatores canonicos (4 itens por fator). Renderizadas em pagina
 * propria "Instrumento aplicado — os 32 itens" para transparencia
 * metodologica e auditabilidade do relatorio.
 */
const ITENS_INSTRUMENTO_32: ReadonlyArray<{ fator: string; itens: readonly string[] }> = [
  {
    fator: 'Exigências quantitativas',
    itens: [
      'Tenho mais tarefas do que o tempo disponível permite concluir com qualidade.',
      'Costumo acumular trabalho pendente ao final do dia ou da semana.',
      'Para dar conta das minhas atividades, preciso trabalhar em ritmo acima do que considero sustentável.',
      'Com frequência sinto que o volume de trabalho excede a capacidade da equipe.',
    ],
  },
  {
    fator: 'Ritmo de trabalho',
    itens: [
      'Preciso trabalhar muito rápido para cumprir as demandas diárias.',
      'Tenho pouco tempo para pausas ou intervalos entre uma tarefa e outra.',
      'O ritmo cobrado no meu trabalho me deixa mentalmente exausto ao final do dia.',
      'Sinto pressão constante por entregar mais em menos tempo.',
    ],
  },
  {
    fator: 'Conflitos de papel',
    itens: [
      'Recebo demandas contraditórias de pessoas diferentes na organização.',
      'Sou cobrado por resultados que dependem de fatores fora do meu controle.',
      'Preciso executar tarefas que considero fora do meu escopo de trabalho.',
      'Meus deveres e responsabilidades não estão claramente definidos.',
    ],
  },
  {
    fator: 'Autonomia',
    itens: [
      'Tenho liberdade para decidir como executar as minhas principais tarefas.',
      'Posso organizar minha sequência de atividades de forma que faça sentido para mim.',
      'Costumo participar das decisões que afetam diretamente meu trabalho diário.',
      'Tenho flexibilidade para ajustar meus horários conforme necessidades pessoais ou da equipe.',
    ],
  },
  {
    fator: 'Suporte social do líder',
    itens: [
      'Meu líder está disponível quando preciso de orientação ou apoio.',
      'Meu líder valoriza e reconhece o meu trabalho.',
      'Recebo do meu líder feedback claro sobre o meu desempenho.',
      'Meu líder demonstra interesse genuíno pelo meu bem-estar.',
    ],
  },
  {
    fator: 'Suporte social de colegas',
    itens: [
      'Posso contar com meus colegas quando preciso de ajuda para resolver um problema.',
      'Meus colegas demonstram respeito e consideração no dia a dia.',
      'Existe cooperação e parceria entre as pessoas da minha equipe.',
      'Sinto que faço parte de uma equipe que trabalha junto por objetivos comuns.',
    ],
  },
  {
    fator: 'Insegurança no trabalho',
    itens: [
      'Sinto que meu vínculo com a empresa é estável.',
      'Tenho clareza sobre as perspectivas do meu cargo nos próximos meses.',
      'Costumo me preocupar com mudanças organizacionais que possam afetar minha posição.',
      'As mudanças na empresa costumam ser comunicadas com transparência.',
    ],
  },
  {
    fator: 'Saúde geral autopercebida',
    itens: [
      'Considero meu estado geral de saúde bom.',
      'Tenho energia suficiente para enfrentar as demandas do meu dia de trabalho.',
      'Nos últimos meses, meu bem-estar físico e emocional tem se mantido estável.',
      'Sinto que minha saúde permite desempenhar meu trabalho sem grande desgaste.',
    ],
  },
] as const;

const DESCRICOES_FATORES: Record<string, string> = {
  'Exigências quantitativas':
    'Mede a percepção do respondente sobre volume de trabalho e prazo disponível. Escores altos indicam demandas dimensionadas de forma saudável.',
  'Ritmo de trabalho':
    'Mede a intensidade e previsibilidade do ritmo exigido ao longo da jornada. Escores altos indicam ritmo sustentável.',
  'Conflitos de papel':
    'Mede clareza sobre o próprio papel e coerência entre demandas recebidas. Escores altos indicam papel bem definido e demandas alinhadas.',
  Autonomia:
    'Mede o grau de autonomia percebida nas decisões sobre o próprio trabalho. Escores altos indicam liberdade construtiva na execução.',
  'Suporte social do líder':
    'Mede a percepção de apoio direto da liderança imediata. Escores altos indicam vínculo e escuta efetivos.',
  'Suporte social de colegas':
    'Mede a percepção de apoio entre pares. Escores altos indicam ambiente colaborativo e seguro entre colegas.',
  'Insegurança no trabalho':
    'Mede a percepção de estabilidade e previsibilidade sobre o vínculo e as condições de trabalho. Escores altos indicam sensação de segurança.',
  'Saúde geral autopercebida':
    'Mede a percepção subjetiva do colaborador sobre a própria saúde geral. Escores altos indicam bem-estar relatado.',
};

/** Pagina 2 — Radar da empresa. */
function renderRadarEmpresa(input: Nr1TemplateInput): string {
  const subtit = `${input.ciclo.totalRespondentes} respondentes efetivos`;
  return `<section class="page-break">
  <h2>Radar da empresa — 8 fatores</h2>
  <p style="font-size:10pt;">Consolidação dos 8 fatores psicossociais no escopo empresa, agregando as respostas válidas de <strong>${input.ciclo.totalRespondentes} respondentes efetivos</strong>. Legenda: <span class="cs-green fw-700">verde (66-100)</span> satisfatório · <span class="cs-yellow fw-700">amarelo (50-65)</span> atenção · <span class="cs-red fw-700">vermelho (0-49)</span> crítico.</p>
  ${renderRadarCardBlock('Empresa', subtit, input.radarEmpresa)}
</section>`;
}

/** Pagina 3 — Descricao de cada fator. */
function renderDescricoesFatoresPagina(input: Nr1TemplateInput): string {
  const blocos = input.radarEmpresa
    .map((f) => {
      const faixa: Nr1Faixa = classificarNr1Faixa(f.score);
      const color = RADAR_NR1_CORES[faixa];
      const desc = DESCRICOES_FATORES[f.nome] ?? '';
      return `<div class="factor-desc">
  <div class="factor-desc-head">
    <div><span class="factor-desc-name">${escapeHtml(f.nome)}</span><span class="factor-desc-type">· ${escapeHtml(classificarTipoFator(f.nome))}</span></div>
    <span class="factor-desc-score" style="color:${color};">${fmtScore(f.score)}</span>
  </div>
  <div class="factor-desc-text">${escapeHtml(desc)}</div>
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Descrição de cada fator</h2>
  <p style="font-size:10pt;">Síntese do que cada fator mede e orientação de leitura dos escores agregados do ciclo.</p>
  ${blocos}
</section>`;
}

/**
 * Pagina 4 — Alertas informativos por fator (RESUMO, escopo empresa).
 * CC079-v6: separada de "Alertas completo" para dar ao leitor um
 * primeiro recorte focado nos riscos agregados da empresa.
 */
function renderAlertasEmpresa(input: Nr1TemplateInput): string {
  const alertasEmpresa = input.alertas.filter((a) => a.escopo === 'empresa');
  if (alertasEmpresa.length === 0) {
    return `<section class="page-break">
  <h2>Alertas informativos por fator</h2>
  <p style="font-size:10pt;">Fatores com score inferior a 50 no escopo empresa.</p>
  <div class="sem-dados-nota">
    <strong>Nenhum fator em alerta no escopo empresa neste ciclo.</strong>
    Todos os 8 fatores da avaliação agregada da empresa ficaram com score igual ou superior a 50.
  </div>
</section>`;
  }
  const cards = alertasEmpresa
    .map((a) => {
      const isCritical = a.score < 40;
      return `<div class="alert-card${isCritical ? ' critical' : ''}">
  <div class="alert-icon${isCritical ? ' critical' : ''}">!</div>
  <div class="alert-info">
    <div class="alert-title">${escapeHtml(a.fatorNome)} — Empresa</div>
    <div class="alert-sub">${classificarTipoFator(a.fatorNome)} · Escopo empresa</div>
  </div>
  <div class="alert-score${isCritical ? '' : ' yellow'}">${fmtScore(a.score)}</div>
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Alertas informativos por fator</h2>
  <p style="font-size:10pt;">Fatores que ficaram com score inferior a 50 no escopo empresa neste ciclo. Esta visão foca no agregado — a análise completa por departamento aparece em seção posterior.</p>
  ${cards}
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Legenda de intensidade.</strong> <span class="cs-red fw-700">Vermelho intenso</span> indica escopo com score inferior a 40. <span class="cs-yellow fw-700">Amarelo escuro</span> indica escopo com score entre 40 e 49.</p>
</section>`;
}

/**
 * CC079-v7: Pagina "Instrumento aplicado — os 32 itens". Logo apos a
 * descricao de cada fator, apresenta as 32 afirmacoes do instrumento
 * agrupadas pelos 8 fatores (4 itens por fator). Sem escala — a
 * escala eh referenciada apenas na rastreabilidade final.
 */
function renderInstrumentoAplicado(): string {
  const blocos = ITENS_INSTRUMENTO_32.map((bloco) => {
    const itens = bloco.itens
      .map((texto) => `<li class="instrumento-item">${escapeHtml(texto)}</li>`)
      .join('\n');
    return `<div class="instrumento-fator">
  <div class="instrumento-fator-header">${escapeHtml(bloco.fator)}</div>
  <ol class="instrumento-item-list">
${itens}
  </ol>
</div>`;
  }).join('\n');
  return `<section class="page-break instrumento-page">
  <h2>Instrumento aplicado — os 32 itens</h2>
  <p style="font-size:9.5pt;">As 32 afirmações apresentadas aos respondentes, agrupadas pelos 8 fatores psicossociais avaliados.</p>
  <div class="instrumento-grid">
${blocos}
  </div>
</section>`;
}

/**
 * Tabela 3 colunas FATOR / DEPARTAMENTO / EMPRESA, sem delta e sem
 * setinhas. Leitura visual pela cor do semaforo em cada valor.
 */
function renderTabelaDeptVsEmpresa(
  fatoresDept: readonly Nr1FatorScore[],
  fatoresEmpresa: readonly Nr1FatorScore[],
): string {
  const empresaPorNome = new Map(fatoresEmpresa.map((f) => [f.nome, f.score]));
  const rows = fatoresDept
    .map((f) => {
      const faixaD: Nr1Faixa = classificarNr1Faixa(f.score);
      const corD = RADAR_NR1_CORES[faixaD];
      const scoreEmp = empresaPorNome.get(f.nome) ?? 0;
      const faixaE: Nr1Faixa = classificarNr1Faixa(scoreEmp);
      const corE = RADAR_NR1_CORES[faixaE];
      return `<tr>
  <td>${escapeHtml(f.nome)}</td>
  <td class="right" style="color:${corD};">${fmtScoreInt(f.score)}</td>
  <td class="right" style="color:${corE};">${fmtScoreInt(scoreEmp)}</td>
</tr>`;
    })
    .join('\n');
  return `<table class="data-table-3col">
  <thead>
    <tr>
      <th>Fator</th>
      <th class="right">Departamento</th>
      <th class="right">Empresa</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

/**
 * CC079-v6: UMA pagina por departamento com amostra suficiente,
 * cabecalho identico. Radar + tabela 8 fatores na MESMA pagina
 * (sem corte), via classe `dept-page` com page-break-inside: avoid.
 */
function renderPaginaDepartamento(
  dept: Nr1DepartamentoScore,
  radarEmpresa: readonly Nr1FatorScore[],
): string {
  const radar = renderRadarCardBlock(
    dept.departamentoNome,
    `${dept.amostra} respondentes efetivos`,
    dept.fatores,
    radarEmpresa,
  );
  const tabela = renderTabelaDeptVsEmpresa(dept.fatores, radarEmpresa);
  return `<section class="page-break dept-page">
  <h2>Radar por departamento — ${escapeHtml(dept.departamentoNome)}</h2>
  <p style="font-size:10pt;">Detalhamento dos 8 fatores no escopo do departamento, comparado com a média da empresa no mesmo ciclo. Polígono em azul escuro representa o departamento; tracejado teal representa a referência da empresa.</p>
  ${radar}
  ${tabela}
</section>`;
}

function renderRadarDepartamentos(input: Nr1TemplateInput): string {
  if (input.radaresPorDepartamento.length === 0) {
    return `<section class="page-break">
  <h2>Radar por departamento</h2>
  <p style="font-size:10pt;">Detalhamento dos 8 fatores por departamento com amostra suficiente, comparado à média da empresa no mesmo ciclo.</p>
  <div class="sem-dados-nota">
    <strong>Dados ainda insuficientes para esta análise.</strong>
    Nenhum departamento atingiu o piso de 5 respondentes efetivos neste ciclo.
  </div>
</section>`;
  }
  return input.radaresPorDepartamento
    .map((d) => renderPaginaDepartamento(d, input.radarEmpresa))
    .join('\n');
}

/**
 * Pagina — Departamentos com amostra insuficiente.
 * CC079-v6: SIMPLIFICADA. Apenas cabecalho explicativo + lista enxuta
 * "nome · N respondentes". Sem card elaborado, sem texto de
 * recomendacao individual, sem nota metodologica.
 */
function renderInsuficientes(input: Nr1TemplateInput): string {
  if (input.departamentosInsuficientes.length === 0) {
    return `<section class="page-break">
  <h2>Departamentos com amostra insuficiente</h2>
  <div class="sem-dados-nota">
    <strong>Nenhum departamento com amostra insuficiente neste ciclo.</strong>
    Todos os departamentos com snapshot válido atingiram o piso de 5 respondentes efetivos.
  </div>
</section>`;
  }
  const lista = input.departamentosInsuficientes
    .map(
      (i) =>
        `<li class="dept-insuf-item"><span class="dept-insuf-nome">${escapeHtml(i.departamentoNome)}</span><span class="dept-insuf-sep">·</span><span class="dept-insuf-count">${i.amostra} respondente${i.amostra === 1 ? '' : 's'}</span></li>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Departamentos com amostra insuficiente</h2>
  <p style="font-size:10pt;">Os departamentos abaixo estão incluídos no consolidado da empresa e não aparecem individualmente neste relatório porque têm menos de 5 respondentes efetivos — piso de preservação do anonimato.</p>
  <ul class="dept-insuf-list">
${lista}
  </ul>
</section>`;
}

/**
 * Pagina — Analise de convergencia e divergencia.
 * CC079-v6: SEMPRE renderizada com os cards por dept quando ha
 * `divergencias` populadas. Classifica cada dept em CRITICA, POSITIVA
 * ou CONVERGENTE conforme magnitude de desvio vs empresa.
 */
function renderDivergencias(input: Nr1TemplateInput): string {
  if (input.radaresPorDepartamento.length === 0) {
    return `<section class="page-break">
  <h2>Análise de convergência e divergência</h2>
  <div class="sem-dados-nota">
    <strong>Dados ainda insuficientes para esta análise.</strong>
    A análise exige pelo menos um departamento com amostra suficiente para comparação com o escopo empresa.
  </div>
</section>`;
  }
  const divergPorDept = new Map<string, Nr1DivergenceEntry[]>();
  for (const d of input.divergencias) {
    const arr = divergPorDept.get(d.departamentoNome) ?? [];
    arr.push(d);
    divergPorDept.set(d.departamentoNome, arr);
  }
  const cards = input.radaresPorDepartamento
    .map((dept) => {
      const divs = divergPorDept.get(dept.departamentoNome) ?? [];
      // Divergencias derivadas pelo delta dept vs empresa (fallback
      // quando a tabela nr1AreaDivergenceAnalysis nao cobrir o dept).
      const empresaPorNome = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
      const deltasDerivados = dept.fatores
        .map((f) => {
          const scoreEmp = empresaPorNome.get(f.nome) ?? 0;
          return {
            fatorNome: f.nome,
            gap: f.score - scoreEmp,
            scoreDepartamento: f.score,
            scoreEmpresa: scoreEmp,
          };
        })
        .filter((d) => Math.abs(d.gap) >= 10);
      const todasDiv = divs.length > 0 ? divs.map((d) => ({ ...d })) : deltasDerivados;
      const criticas = todasDiv.filter((d) => d.gap <= -10);
      const positivas = todasDiv.filter((d) => d.gap >= 10);
      let classe: 'convergente' | 'critica' | 'positiva';
      let classeLabel: string;
      let corpo: string;
      let badges: Array<{ fatorNome: string; gap: number }>;
      let badgeClass: 'crit' | 'pos' | '';
      if (criticas.length > 0 && criticas.length >= positivas.length) {
        classe = 'critica';
        classeLabel = 'Divergência crítica';
        corpo = `Este departamento apresenta divergência significativa em ${criticas.length} fator${criticas.length === 1 ? '' : 'es'} frente à média da empresa, todos no sentido de agravamento.`;
        badges = criticas;
        badgeClass = 'crit';
      } else if (positivas.length > 0) {
        classe = 'positiva';
        classeLabel = 'Divergência positiva';
        corpo = `Este departamento apresenta divergência positiva em ${positivas.length} fator${positivas.length === 1 ? '' : 'es'}. Prática replicável para outras áreas.`;
        badges = positivas;
        badgeClass = 'pos';
      } else {
        classe = 'convergente';
        classeLabel = 'Convergente';
        corpo =
          'Alinhado à média da empresa em todos os 8 fatores (variações inferiores a 10 pontos).';
        badges = [];
        badgeClass = '';
      }
      const badgeHtml =
        badges.length === 0
          ? ''
          : `<div class="dept-badges">${badges
              .map(
                (b) =>
                  `<div class="dept-badge ${badgeClass}">${escapeHtml(b.fatorNome)} ${b.gap > 0 ? '+' : ''}${Math.round(b.gap)}</div>`,
              )
              .join('')}</div>`;
      return `<div class="dept-card">
  <div class="dept-card-head">
    <div>
      <div class="dept-card-name">${escapeHtml(dept.departamentoNome)}</div>
      <div class="dept-card-meta">${dept.amostra} respondentes efetivos</div>
    </div>
    <div class="dept-card-class ${classe}">${classeLabel}</div>
  </div>
  <div class="dept-card-body">${corpo}</div>
  ${badgeHtml}
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Análise de convergência e divergência</h2>
  <p style="font-size:10pt;">Cada departamento é classificado conforme a magnitude da variação dos seus 8 fatores em relação à média da empresa. Diferenças de até 10 pontos indicam convergência. Diferenças superiores a 10 pontos com agravamento indicam divergência crítica; superiores com atenuação indicam divergência positiva.</p>
  ${cards}
</section>`;
}

/**
 * Pagina — Departamento em situacao critica.
 * CC079-v6: criterio = dept com maior magnitude de divergencia
 * negativa vs empresa (≥ 10 pontos abaixo em pelo menos 1 fator).
 * Quando o service nao preenche `departamentoCritico`, deriva do
 * delta dept × empresa para evitar falso vazio.
 */
function renderCritico(input: Nr1TemplateInput): string {
  let critico = input.departamentoCritico;
  // Se o service passou dept critico mas sem fatores nomeados, deriva
  // os fatores criticos (delta <= -10) a partir do radar do dept.
  if (critico && critico.fatoresCriticos.length === 0) {
    const criticoNome = critico.nome;
    const empresaPorNome = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
    const dept = input.radaresPorDepartamento.find((d) => d.departamentoNome === criticoNome);
    if (dept) {
      const criticos = dept.fatores
        .map((f) => ({ nome: f.nome, delta: f.score - (empresaPorNome.get(f.nome) ?? 0) }))
        .filter((d) => d.delta <= -10)
        .sort((a, b) => a.delta - b.delta);
      if (criticos.length > 0) {
        critico = {
          nome: criticoNome,
          fatoresCriticos: criticos.map((c) => c.nome),
          diagnostico: `Este departamento concentra ${criticos.length} fator${criticos.length === 1 ? '' : 'es'} com divergência negativa relevante em relação à média da empresa. Merece atenção prioritária nos próximos passos operacionais.`,
        };
      } else {
        critico = undefined;
      }
    }
  }
  if (!critico && input.radaresPorDepartamento.length > 0) {
    const empresaPorNome = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
    const candidatos = input.radaresPorDepartamento
      .map((dept) => {
        const criticos = dept.fatores
          .map((f) => ({
            nome: f.nome,
            delta: f.score - (empresaPorNome.get(f.nome) ?? 0),
          }))
          .filter((d) => d.delta <= -10);
        const piorDelta = criticos.reduce((min, d) => Math.min(min, d.delta), 0);
        return { dept, criticos, piorDelta };
      })
      .filter((c) => c.criticos.length > 0)
      .sort((a, b) => {
        if (b.criticos.length !== a.criticos.length) return b.criticos.length - a.criticos.length;
        return a.piorDelta - b.piorDelta;
      });
    if (candidatos.length > 0) {
      const topo = candidatos[0];
      if (topo) {
        critico = {
          nome: topo.dept.departamentoNome,
          fatoresCriticos: topo.criticos.map((c) => c.nome),
          diagnostico: `Este departamento concentra ${topo.criticos.length} fator${topo.criticos.length === 1 ? '' : 'es'} com divergência negativa relevante em relação à média da empresa, incluindo a pior magnitude observada neste ciclo. Merece atenção prioritária nos próximos passos operacionais.`,
        };
      }
    }
  }
  if (!critico) {
    return `<section class="page-break">
  <h2>Departamento em situação crítica</h2>
  <p style="font-size:10pt;">Identificação automática do departamento com maior magnitude de divergência negativa vs. média da empresa (≥ 10 pontos abaixo em pelo menos 1 fator).</p>
  <div class="sem-dados-nota">
    <strong>Nenhum departamento em situação crítica neste ciclo.</strong>
    Nenhum departamento apresentou divergência crítica frente à média da empresa.
  </div>
</section>`;
  }
  const empresaPorNome = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
  const deptFatoresMap = new Map(
    (
      input.radaresPorDepartamento.find((d) => d.departamentoNome === critico.nome)?.fatores ?? []
    ).map((f) => [f.nome, f.score] as const),
  );
  const badges = critico.fatoresCriticos
    .map((fatorNome) => {
      const scoreD = deptFatoresMap.get(fatorNome) ?? 0;
      const scoreE = empresaPorNome.get(fatorNome) ?? 0;
      const delta = Math.round(scoreD - scoreE);
      return `<div class="critico-badge">${escapeHtml(fatorNome)} ${fmtScoreInt(scoreD)} vs. ${fmtScoreInt(scoreE)} (${delta > 0 ? '+' : ''}${delta})</div>`;
    })
    .join('');
  return `<section class="page-break">
  <h2>Departamento em situação crítica</h2>
  <p style="font-size:10pt;">Identificação automática do departamento com maior magnitude de divergência negativa vs. média da empresa. Critério: ≥ 10 pontos abaixo da média da empresa em pelo menos 1 fator, com desempate pelo maior número de fatores em divergência crítica.</p>
  <div class="critico-card">
    <div class="critico-head">
      <div class="critico-icon">!</div>
      <div>
        <div class="critico-name">${escapeHtml(critico.nome)}</div>
        <div class="critico-count">${critico.fatoresCriticos.length} fator${critico.fatoresCriticos.length === 1 ? '' : 'es'} em divergência crítica</div>
      </div>
    </div>
    <div class="critico-body">${escapeHtml(critico.diagnostico)}</div>
    <div class="critico-badges">${badges}</div>
  </div>
  <div class="info-card" style="margin-top:4mm;">
    <strong>Critério de identificação.</strong> A escolha do departamento crítico segue algoritmo determinístico: (1) número de fatores em divergência crítica, ordenado do maior para o menor; (2) em caso de empate, maior magnitude da pior divergência absoluta. Se nenhum departamento apresentar divergência crítica no ciclo, esta seção informa "Nenhum departamento em situação crítica neste ciclo".
  </div>
</section>`;
}

/**
 * Pagina — Alertas informativos por fator (COMPLETO: empresa + dept).
 * CC079-v6: contrapartida da secao de p.4 (que lista apenas empresa).
 * Esta aqui dá o inventario completo item-a-item, incluindo os deptos.
 */
function renderAlertasCompleto(input: Nr1TemplateInput): string {
  if (input.alertas.length === 0) {
    return `<section class="page-break">
  <h2>Alertas informativos por fator — visão completa</h2>
  <div class="sem-dados-nota">
    <strong>Nenhum fator em alerta neste ciclo.</strong>
    Todos os fatores avaliados ficaram com score igual ou superior a 50 nos escopos empresa e departamento.
  </div>
</section>`;
  }
  const cards = input.alertas
    .map((a) => {
      const isCritical = a.score < 40;
      const escopoTxt =
        a.escopo === 'empresa'
          ? 'Escopo empresa'
          : `Escopo departamento · ${escapeHtml(a.departamentoNome ?? '-')}`;
      const titulo =
        a.escopo === 'departamento'
          ? `${escapeHtml(a.fatorNome)} — ${escapeHtml(a.departamentoNome ?? '')}`
          : `${escapeHtml(a.fatorNome)} — Empresa`;
      return `<div class="alert-card${isCritical ? ' critical' : ''}">
  <div class="alert-icon${isCritical ? ' critical' : ''}">!</div>
  <div class="alert-info">
    <div class="alert-title">${titulo}</div>
    <div class="alert-sub">${classificarTipoFator(a.fatorNome)} · ${escopoTxt}</div>
  </div>
  <div class="alert-score${isCritical ? '' : ' yellow'}">${fmtScore(a.score)}</div>
</div>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Alertas informativos por fator — visão completa</h2>
  <p style="font-size:10pt;">Inventário completo de todos os fatores com score inferior a 50 em qualquer escopo (empresa ou departamento) neste ciclo. Alertas são informativos e não substituem análise por profissional habilitado. Esta visão complementa a seção inicial, que recorta apenas o escopo empresa.</p>
  ${cards}
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Legenda de intensidade.</strong> <span class="cs-red fw-700">Vermelho intenso</span> indica escopo com score inferior a 40. <span class="cs-yellow fw-700">Amarelo escuro</span> indica escopo com score entre 40 e 49.</p>
</section>`;
}

/** Pagina — Comparacao com ciclo anterior. */
function renderComparacaoAnterior(input: Nr1TemplateInput): string {
  const comp = input.comparacaoCicloAnterior;
  if (!comp) {
    return `<section class="page-break">
  <h2>Comparação com ciclo anterior</h2>
  <p style="font-size:10pt;">Variação dos scores por fator no escopo empresa em relação ao ciclo imediatamente anterior fechado.</p>
  <div class="sem-dados-nota">
    <strong>Dados ainda insuficientes para esta análise.</strong>
    Este é o primeiro ciclo fechado da série ou o ciclo anterior não teve amostra válida no escopo empresa. A seção será preenchida automaticamente quando houver um ciclo anterior comparável.
  </div>
</section>`;
  }
  const atualPorFator = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
  const rows = comp.fatores
    .map((f) => {
      const atual = atualPorFator.get(f.nome) ?? 0;
      const variacao = atual - f.score;
      const direction: 'up' | 'down' | 'eq' =
        variacao > 0.5 ? 'up' : variacao < -0.5 ? 'down' : 'eq';
      const arrow = direction === 'up' ? '▲ +' : direction === 'down' ? '▼ ' : '▬ ';
      const rowClass = Math.abs(variacao) >= 5 ? (direction === 'up' ? 'row-up' : 'row-down') : '';
      return `<tr class="${rowClass}">
  <td>${escapeHtml(f.nome)}</td>
  <td class="right" style="color:#6B7280; font-size:9pt;">${classificarTipoFator(f.nome).replace('Fator de ', '')}</td>
  <td class="right fw-700">${fmtScore(atual)}</td>
  <td class="right">${fmtScore(f.score)}</td>
  <td class="right variacao ${direction}">${arrow}${Math.abs(variacao).toFixed(1)}</td>
</tr>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação com ciclo anterior</h2>
  <p style="font-size:10pt;">Variação dos scores por fator no escopo empresa em relação ao ciclo imediatamente anterior fechado <strong>(${escapeHtml(comp.cicloRotulo)})</strong>. Variações superiores a 5 pontos são destacadas em cor.</p>
  <table class="data-table">
    <thead>
      <tr>
        <th>Fator</th>
        <th class="right">Tipo</th>
        <th class="right">Ciclo atual</th>
        <th class="right">Ciclo anterior</th>
        <th class="right">Variação</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

const HIST_PALETA: Record<string, string> = {
  'Exigências quantitativas': '#D97706',
  'Ritmo de trabalho': '#EA580C',
  'Conflitos de papel': '#DC2626',
  Autonomia: '#16A34A',
  'Insegurança no trabalho': '#991B1B',
};
const HIST_FATORES_ALVO = [
  'Exigências quantitativas',
  'Ritmo de trabalho',
  'Conflitos de papel',
  'Autonomia',
  'Insegurança no trabalho',
] as const;

/** Pagina — Comparacao historica de longo prazo. */
function renderComparacaoHistorica(input: Nr1TemplateInput): string {
  const comps = input.comparacaoHistorica;
  if (!comps || comps.length < 2) {
    return `<section class="page-break">
  <h2>Comparação histórica de longo prazo</h2>
  <p style="font-size:10pt;">Evolução dos scores por fator ao longo dos últimos ciclos executados.</p>
  <div class="sem-dados-nota">
    <strong>Dados ainda insuficientes para esta análise.</strong>
    A comparação histórica requer pelo menos dois ciclos fechados consecutivos. A seção será preenchida automaticamente conforme a cadência de aplicação do radar for acumulando novos ciclos.
  </div>
</section>`;
  }
  const widthViewBox = 800;
  const heightViewBox = 280;
  const chartLeft = 60;
  const chartRight = 780;
  const chartTop = 20;
  const chartBottom = 230;
  const totalCiclos = comps.length;
  const xStep = (chartRight - chartLeft) / (totalCiclos - 1);
  const yFor = (score: number): number => {
    const clamp = Math.max(0, Math.min(100, score));
    return chartBottom - (clamp / 100) * (chartBottom - chartTop);
  };
  const polylines = HIST_FATORES_ALVO.map((fatorNome) => {
    const color = HIST_PALETA[fatorNome] ?? '#374151';
    const pts: string[] = [];
    const circles: string[] = [];
    comps.forEach((c, idx) => {
      const f = c.fatores.find((x) => x.nome === fatorNome);
      if (f === undefined) return;
      const x = chartLeft + idx * xStep;
      const y = yFor(f.score);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`);
    });
    if (pts.length < 2) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />${circles.join('')}`;
  }).join('\n');
  const legendaChart = HIST_FATORES_ALVO.map(
    (f) =>
      `<span style="display:inline-flex; align-items:center; gap:1.5mm; margin-right:4mm; font-size:9pt;"><span style="display:inline-block; width:3mm; height:1mm; border-radius:1pt; background:${HIST_PALETA[f]};"></span>${escapeHtml(f)}</span>`,
  ).join('');
  const xLabels = comps
    .map((c, idx) => {
      const x = chartLeft + idx * xStep;
      return `<text x="${x.toFixed(1)}" y="258" font-family="Liberation Sans, system-ui, sans-serif" font-size="9" fill="#6B7280" text-anchor="middle" font-weight="600">${escapeHtml(c.cicloRotulo)}</text>`;
    })
    .join('\n');
  return `<section class="page-break">
  <h2>Comparação histórica de longo prazo</h2>
  <p style="font-size:10pt;">Evolução dos scores por fator ao longo dos últimos ciclos executados. A linha tracejada vermelha marca o limite crítico de score 50.</p>
  <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8pt; padding:4mm 5mm; margin-top:3mm;">
    <div style="margin-bottom:3mm; padding-bottom:2mm; border-bottom:1px solid #E5E7EB;">${legendaChart}</div>
    <svg viewBox="0 0 ${widthViewBox} ${heightViewBox}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
      <g stroke="#E5E7EB" stroke-width="1">
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartRight}" y2="${chartTop}" />
        <line x1="${chartLeft}" y1="${(chartTop + chartBottom) / 2}" x2="${chartRight}" y2="${(chartTop + chartBottom) / 2}" />
        <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" />
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom + 10}" stroke="#9CA3AF" />
      </g>
      <g font-family="Liberation Sans, system-ui, sans-serif" font-size="9" fill="#9CA3AF" text-anchor="end">
        <text x="${chartLeft - 6}" y="${chartTop + 4}">100</text>
        <text x="${chartLeft - 6}" y="${(chartTop + chartBottom) / 2 + 4}">50</text>
        <text x="${chartLeft - 6}" y="${chartBottom + 4}">0</text>
      </g>
      <line x1="${chartLeft}" y1="${yFor(50)}" x2="${chartRight}" y2="${yFor(50)}" stroke="#DC2626" stroke-width="1" stroke-dasharray="3,3" opacity="0.5" />
      <text x="${chartRight - 10}" y="${yFor(50) - 4}" font-family="Liberation Sans, system-ui, sans-serif" font-size="8" fill="#DC2626" text-anchor="end" opacity="0.7">Alerta (50)</text>
      ${xLabels}
      ${polylines}
    </svg>
  </div>
</section>`;
}

/**
 * Pagina — Sugestoes de proximos passos.
 * CC079-v6: derivacao canonica enriquecida (deterministica, zero IA).
 * Cobre: cada fator em alerta no escopo empresa (com texto denso),
 * dept critico com fatores nomeados, replicacao de divergencia
 * positiva, monitoramento historico (quando aplicavel).
 */
function derivarSugestoesCanonicas(input: Nr1TemplateInput): Array<{
  titulo: string;
  descricao: string;
}> {
  if (input.sugestoesProximosPassos.length > 0) {
    return input.sugestoesProximosPassos.map((s) => {
      const match = /^([^.]+\.)\s*(.*)$/.exec(s);
      return {
        titulo: match ? (match[1] ?? s) : s,
        descricao: match ? (match[2] ?? '') : '',
      };
    });
  }
  const out: Array<{ titulo: string; descricao: string }> = [];
  const alertasEmpresa = input.alertas.filter((a) => a.escopo === 'empresa');
  for (const a of alertasEmpresa) {
    const tipoLower = classificarTipoFator(a.fatorNome).toLowerCase();
    const orientacao =
      tipoLower === 'fator de risco'
        ? 'investigação de causas-raiz nas rotinas de trabalho, cargas e prazos vinculados a este fator, com escuta estruturada da liderança operacional e amostra representativa de colaboradores'
        : 'investigação dos elementos culturais e de gestão que estão sustentando este recurso, para preservar ou expandir as práticas que o alimentam';
    out.push({
      titulo: `Aprofundar diagnóstico em ${a.fatorNome} (escopo empresa, score ${fmtScore(a.score)}).`,
      descricao: `Score abaixo do limite crítico de 50 no agregado da empresa indica sinal preliminar relevante. Recomenda-se ${orientacao}. A próxima rodada do ciclo deve monitorar se a intervenção reverteu o padrão.`,
    });
  }
  if (input.departamentoCritico) {
    const fatoresNomeados = input.departamentoCritico.fatoresCriticos.slice(0, 3).join(', ');
    out.push({
      titulo: `Investigação prioritária no departamento ${input.departamentoCritico.nome}.`,
      descricao: `Este departamento concentra ${input.departamentoCritico.fatoresCriticos.length} fator${input.departamentoCritico.fatoresCriticos.length === 1 ? '' : 'es'} com divergência negativa relevante vs. média da empresa${fatoresNomeados ? ` (${fatoresNomeados})` : ''}. Recomenda-se conversa estruturada com a liderança da área e amostra de colaboradores para contextualizar os desvios, identificar causas operacionais ou de gestão e priorizar intervenções focadas.`,
    });
  }
  // Replicacao de divergencia positiva (um dept pode ter fatores >=10
  // pontos ACIMA da media da empresa — pratica replicavel).
  const empresaPorNome = new Map(input.radarEmpresa.map((f) => [f.nome, f.score]));
  const deptsPositivos = input.radaresPorDepartamento
    .map((dept) => {
      const positivos = dept.fatores.filter(
        (f) => f.score - (empresaPorNome.get(f.nome) ?? 0) >= 10,
      );
      return { dept, positivos };
    })
    .filter((c) => c.positivos.length > 0)
    .sort((a, b) => b.positivos.length - a.positivos.length);
  if (deptsPositivos.length > 0) {
    const topo = deptsPositivos[0];
    if (topo) {
      const fatoresNomeados = topo.positivos
        .slice(0, 3)
        .map((f) => f.nome)
        .join(', ');
      out.push({
        titulo: `Replicação de boas práticas do departamento ${topo.dept.departamentoNome}.`,
        descricao: `Este departamento apresenta divergência positiva relevante em ${topo.positivos.length} fator${topo.positivos.length === 1 ? '' : 'es'} vs. média da empresa (${fatoresNomeados}). Recomenda-se conversa com a liderança da área para identificar práticas de gestão e rotinas que podem ser replicadas em outras equipes.`,
      });
    }
  }
  // Monitoramento historico — so quando ha serie disponivel.
  const historico = input.comparacaoHistorica;
  if (historico && historico.length >= 2) {
    out.push({
      titulo: 'Monitoramento da deterioração histórica em fatores de risco.',
      descricao:
        'Ao longo dos ciclos executados, observa-se degradação sustentada em um ou mais fatores de risco. Recomenda-se manter a cadência regular de aplicação do radar e considerar investigação aprofundada com profissional técnico habilitado, especialmente se o padrão persistir no próximo ciclo.',
    });
  }
  return out;
}

function renderSugestoesProximosPassos(input: Nr1TemplateInput): string {
  const sugestoes = derivarSugestoesCanonicas(input);
  if (sugestoes.length === 0) {
    return `<section class="page-break">
  <h2>Sugestões de próximos passos</h2>
  <div class="suggestion-intro">
    Este radar identifica sinais preliminares nos oito fatores psicossociais avaliados. Os pontos a seguir são sugestões de investigação e aprofundamento, com base nos resultados do ciclo, para orientar as próximas ações da empresa.
  </div>
  <div class="sem-dados-nota">
    <strong>Nenhuma sugestão específica para este ciclo.</strong>
    Nenhum fator ficou abaixo do limite crítico e não há departamento em situação de divergência. Recomenda-se manter a cadência regular de aplicação do radar.
  </div>
</section>`;
  }
  const items = sugestoes
    .map(
      (s) => `<div class="suggestion-item">
  <span class="suggestion-marker">▶</span>
  <div class="suggestion-body">
    <div class="suggestion-title">${escapeHtml(s.titulo)}</div>
    ${s.descricao ? `<div class="suggestion-desc">${escapeHtml(s.descricao)}</div>` : ''}
  </div>
</div>`,
    )
    .join('\n');
  return `<section class="page-break">
  <h2>Sugestões de próximos passos</h2>
  <div class="suggestion-intro">
    Este radar identifica sinais preliminares nos oito fatores psicossociais avaliados. Os pontos a seguir são sugestões de investigação e aprofundamento, derivadas automaticamente dos resultados do ciclo, para orientar as próximas ações da empresa.
  </div>
  ${items}
</section>`;
}

/**
 * Pagina final — Rastreabilidade e integridade do relatorio.
 * CC079-v7: unica aparicao de rastreabilidade (basica removida da
 * pipeline). Layout minimalista: card tecnico enxuto + nota final +
 * nota de auditoria ambar quando aplicavel. Sem hash SHA-256, sem
 * versao do instrumento, sem total de itens, sem texto introdutorio
 * longo — padrao canonico v7 definido pelo Bruno.
 */
function renderRastreabilidadeCompleta(input: Nr1TemplateInput): string {
  const notaAuditoria = input.notaAuditoriaEdicao
    ? `<div class="edit-note"><strong>Nota de auditoria — data de fechamento editada.</strong> A data de fechamento original deste ciclo era ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoOriginal))}. Foi alterada para ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.dataFechamentoAtual))} em ${escapeHtml(formatDateBR(input.notaAuditoriaEdicao.ultimaEdicaoEm))} por ${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoPor)}. Motivo registrado: <em>${escapeHtml(input.notaAuditoriaEdicao.ultimaEdicaoJustificativa)}</em></div>`
    : '';
  const invalidados = Math.max(0, input.ciclo.totalElegiveis - input.ciclo.totalRespondentes);
  const geradoEmBrt = (toTimestampBrt(input.generatedAtIso) ?? input.generatedAtIso).replace(
    /\bas\b/g,
    'às',
  );
  return `<section class="page-break">
  <h2>Rastreabilidade e integridade do relatório</h2>
  <div class="trace-card">
    <div><strong>Empresa:</strong> ${escapeHtml(input.company.nomeFantasia)}</div>
    <div><strong>Identificador do ciclo:</strong> <code>${escapeHtml(input.ciclo.cicloRotulo)}</code></div>
    <div><strong>Data de abertura:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataAbertura))} · <strong>Data de fechamento:</strong> ${escapeHtml(formatDateBR(input.ciclo.dataFechamento))}</div>
    <div><strong>Respondentes elegíveis:</strong> ${input.ciclo.totalElegiveis} · <strong>Efetivos válidos:</strong> ${input.ciclo.totalRespondentes} · <strong>Diferença (invalidados + não respondidos):</strong> ${invalidados}</div>
    <div><strong>Gerado em:</strong> ${escapeHtml(geradoEmBrt)}</div>
    <div><strong>Escala do instrumento:</strong> 0 (Nunca) · 1 (Quase nunca) · 2 (Às vezes) · 3 (Quase sempre) · 4 (Sempre)</div>
  </div>
  ${notaAuditoria}
  <p class="muted" style="font-size:9pt; line-height:1.55; margin-top:4mm;"><strong>Nota final.</strong> O ciclo, uma vez fechado, é imutável. Este relatório pode ser regerado a qualquer momento a partir da base de dados original, apresentando idêntico conteúdo.</p>
</section>`;
}

/**
 * Renderiza o HTML do Radar NR-1 (ME-1.3c CC079-v6).
 * Ordem canonica das paginas conforme modelo visual de referencia.
 */
export function renderNr1ReportHTML(input: Nr1TemplateInput): string {
  const partes: string[] = [];
  partes.push(renderCapaMaisResumo(input));
  partes.push(renderRadarEmpresa(input));
  partes.push(renderDescricoesFatoresPagina(input));
  partes.push(renderInstrumentoAplicado());
  partes.push(renderAlertasEmpresa(input));
  partes.push(renderRadarDepartamentos(input));
  partes.push(renderInsuficientes(input));
  partes.push(renderDivergencias(input));
  partes.push(renderCritico(input));
  partes.push(renderAlertasCompleto(input));
  partes.push(renderComparacaoAnterior(input));
  partes.push(renderComparacaoHistorica(input));
  partes.push(renderSugestoesProximosPassos(input));
  partes.push(renderRastreabilidadeCompleta(input));
  const bodyHtml = partes.filter((p) => p.length > 0).join('\n');

  return renderLayoutBase({
    title: 'Radar NR-1',
    company: input.company,
    bodyHtml,
    footerLeft: `Radar NR-1 · ${input.company.nomeFantasia} · ${input.ciclo.cicloRotulo}`,
    footerCenter: input.ciclo.cicloRotulo,
  });
}
