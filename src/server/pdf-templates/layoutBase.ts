/* eslint-disable @stylistic/max-len -- layout HTML canonico com string CSS multi-linha */
// ROIP APP 9BOX — layout HTML canonico compartilhado (ME-050/51, S257; ME-1.3c CC079 leva v2).
//
// Envelope HTML+CSS reutilizado por todos os templates PDF do projeto.
// A leva CC079-v2 da ME-1.3c eleva este arquivo canonicamente ao padrao
// editorial do mockup `relatorio_radar_nr1_v1.html`:
// - Capa editorial com badge, hero title, subtitulo teal, meta grid card,
//   cover-note ambar sobre limitacao diagnostica.
// - Header canonico recorrente ("ROIP APP · <doc>" esquerda + info do
//   ciclo direita) com faixa cinza divisoria sutil.
// - Rodape canonico ("Doc · Empresa · Ciclo" esquerda + "Pagina X de Y"
//   direita) com borda superior cinza.
// - Numeros de secao em teal com uppercase + espacamento canonicos.
// - Titulos de secao com borda inferior teal 2pt.
// - Cards KPI com highlights verde/amarelo/vermelho.
// - Blocos de descricao executiva com borda lateral teal.
// - Cards de analise de departamento com classes de severidade canonicas.
// - Cards de alertas com borda lateral canonica.
// - Tabela estilizada canonica (comparacoes, tabelas de colaboradores).
// - Rodape de rastreabilidade em card cinza + nota de auditoria ambar.
//
// Determinismo canonico (§11.12, §13.7): mesmos `LayoutBaseInput` geram
// o mesmo HTML byte-exact — nenhum `Date.now()`, nenhum `Math.random()`,
// nenhum campo dependente de ambiente e emitido pelo layout. O timestamp
// de geracao entra pelo campo `footerCenter` do consumidor, que decide
// se preserva ou omite.

/** Nome fantasia + logo opcional da empresa (cabecalho canonico). */
export interface LayoutBaseCompany {
  nomeFantasia: string;
  /** URL absoluta do logo (opcional — DOC 03 §10.10). Vazio omite. */
  logoUrl?: string;
}

/** Input canonico do layout base. */
export interface LayoutBaseInput {
  /** Titulo do documento — vai no `<title>` e no cabecalho editorial. */
  title: string;
  /** Empresa dona do artefato (cabecalho). */
  company: LayoutBaseCompany;
  /** Corpo HTML pronto — o template especifico injeta aqui. */
  bodyHtml: string;
  /**
   * Rodape em 3 slots (esquerda, centro, direita). Padrao canonico
   * DOC 03 §10.10: esquerda = identificacao do doc, centro = data de
   * geracao, direita = numeracao (renderizada pelo CSS `@page`).
   */
  footerLeft?: string;
  footerCenter?: string;
}

/**
 * Escapa texto para uso seguro em HTML (evita injecao de tags em campos
 * de dado). Aplica-se aos campos textuais recebidos como input — o
 * `bodyHtml` NAO passa por escape (e responsabilidade do template
 * especifico ja emitir HTML seguro).
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * CSS canonico compartilhado. Constante para permitir hash SHA-256
 * estavel do layout entre reruns (auditoria de drift visual).
 *
 * Design system canonico (ME-1.3c CC079-v2) espelho do mockup
 * `relatorio_radar_nr1_v1.html`:
 * - Cor primaria: teal `#14B8A6` (identidade ROIP APP).
 * - Cor secundaria: navy `#1F3A5F` (branding sobrio).
 * - Faixas semanticas: verde `#16A34A`, ambar `#D97706`, vermelho
 *   `#DC2626`.
 * - Neutros: `#111827` (titulo forte), `#1F2937` (body dark), `#374151`
 *   (body medio), `#6B7280` (muted), `#9CA3AF` (muted light), `#E5E7EB`
 *   (grid), `#F3F4F6` (hover), `#F9FAFB` (card bg), `#FFFFFF` (base).
 * - Highlights: `#F0FDF4` (bg verde), `#FEFCE8`/`#FEF3C7` (bg ambar),
 *   `#FEF2F2`/`#FEE2E2` (bg vermelho), `#F0FDFA` (bg teal), `#EEF2FF`
 *   (badge bg).
 * - Tipografia escalada: hero 32pt, h1 18pt, section-num 10pt uppercase
 *   teal, section-title 16pt + borda inferior teal 2pt, h3 12pt,
 *   body 10.5pt, meta 9pt, footer 8pt.
 */
export const LAYOUT_BASE_CSS = `
  @page {
    size: A4 portrait;
    margin: 20mm;
    @bottom-left {
      content: string(docFooterLeft);
      font-family: 'Liberation Sans', system-ui, sans-serif;
      font-size: 8pt;
      color: #6B7280;
      padding-top: 2mm;
      border-top: 0.5pt solid #E5E7EB;
    }
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-family: 'Liberation Sans', system-ui, sans-serif;
      font-size: 8pt;
      color: #6B7280;
      padding-top: 2mm;
      border-top: 0.5pt solid #E5E7EB;
    }
    @top-left {
      content: string(docHeaderLeft);
      font-family: 'Liberation Sans', system-ui, sans-serif;
      font-size: 9pt;
      font-weight: 700;
      color: #1F3A5F;
      padding-bottom: 2mm;
      border-bottom: 0.5pt solid #E5E7EB;
    }
    @top-right {
      content: string(docHeaderRight);
      font-family: 'Liberation Sans', system-ui, sans-serif;
      font-size: 8pt;
      color: #6B7280;
      padding-bottom: 2mm;
      border-bottom: 0.5pt solid #E5E7EB;
    }
  }
  @page cover {
    @top-left { content: none; border-bottom: none; }
    @top-right { content: none; border-bottom: none; }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Liberation Sans', system-ui, sans-serif;
    font-size: 10.5pt;
    color: #1F2937;
    line-height: 1.5;
  }
  .doc-header-left { string-set: docHeaderLeft content(); }
  .doc-header-right { string-set: docHeaderRight content(); }
  .doc-footer-left { string-set: docFooterLeft content(); }
  .string-set-only { position: absolute; left: -9999px; top: -9999px; }
  h1 {
    font-size: 18pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 4mm;
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    margin: 6mm 0 4mm;
    padding-bottom: 2mm;
    border-bottom: 2px solid #14B8A6;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    margin: 5mm 0 2mm;
    page-break-after: avoid;
  }
  p { margin: 0 0 3mm; }
  section { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
  .muted { color: #6B7280; }
  strong { font-weight: 600; color: #111827; }

  /* Classe editorial de card informativo arredondado (ME-1.3c v4). */
  .info-card {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 5mm 6mm;
    margin: 4mm 0;
  }

  /* Capa editorial — pagina 1. */
  .cover-page {
    page: cover;
    padding-top: 12mm;
  }
  .cover-badge {
    display: inline-block;
    padding: 5pt 14pt;
    background: #EEF2FF;
    color: #1F3A5F;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: 20pt;
    margin-bottom: 10mm;
  }
  .cover-title {
    font-size: 32pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.15;
    margin: 0 0 6mm;
    letter-spacing: -0.01em;
  }
  .cover-title-accent { color: #14B8A6; }
  .cover-subtitle {
    font-size: 14pt;
    color: #374151;
    font-weight: 500;
    margin-bottom: 14mm;
  }
  .cover-meta {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 6mm 8mm;
    margin-bottom: 10mm;
  }
  .cover-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2.5mm 0;
    border-bottom: 1px solid #E5E7EB;
    font-size: 10pt;
  }
  .cover-meta-row:last-child { border-bottom: none; }
  .cover-meta-label { color: #6B7280; font-weight: 500; }
  .cover-meta-value { color: #111827; font-weight: 700; }
  .cover-note {
    background: #FEF3C7;
    border: 1px solid #FBBF24;
    border-radius: 8pt;
    padding: 4mm 6mm;
    font-size: 9pt;
    color: #78350F;
    line-height: 1.55;
  }
  .cover-note strong { color: #78350F; font-weight: 700; }

  /* ME-1.3c CC079-v4: classes de sumario (.toc-*) retiradas junto com
  o indice do documento. */

  /* Cards KPI — resumo executivo. */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3mm;
    margin: 4mm 0 6mm;
  }
  .kpi-card {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 8pt;
    padding: 4mm 5mm;
  }
  .kpi-card.highlight-green { background: #F0FDF4; border-color: #86EFAC; }
  .kpi-card.highlight-yellow { background: #FEFCE8; border-color: #FDE047; }
  .kpi-card.highlight-red { background: #FEF2F2; border-color: #FCA5A5; }
  .kpi-label {
    font-size: 8.5pt;
    color: #6B7280;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 2mm;
  }
  .kpi-value { font-size: 22pt; font-weight: 700; color: #111827; line-height: 1; }
  .kpi-value.green { color: #16A34A; }
  .kpi-value.yellow { color: #D97706; }
  .kpi-value.red { color: #DC2626; }
  .kpi-sub { font-size: 8pt; color: #9CA3AF; margin-top: 1.5mm; font-weight: 500; }

  /* Gauge semicircular. */
  .gauge-wrap {
    display: flex;
    align-items: center;
    gap: 6mm;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 5mm 6mm;
    margin-bottom: 6mm;
  }
  .gauge-info-title { font-size: 12pt; font-weight: 700; margin-bottom: 1mm; }
  .gauge-info-body { font-size: 9.5pt; color: #374151; line-height: 1.55; }

  /* Radar block — card emoldurado. */
  .radar-block {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 5mm 6mm;
    margin-bottom: 4mm;
    page-break-inside: avoid;
  }
  .radar-block-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 3mm;
  }
  .radar-block-title { font-size: 12pt; font-weight: 700; color: #111827; }
  .radar-block-subtitle { font-size: 9pt; color: #6B7280; font-weight: 500; }
  .radar-row { display: flex; gap: 6mm; align-items: flex-start; }
  .radar-svg-wrap { width: 52%; max-width: 80mm; }
  .radar-legend { flex: 1; }

  /* Bloco de descricao executiva por fator — borda lateral teal. */
  .factor-desc {
    background: #F9FAFB;
    border-left: 3px solid #14B8A6;
    padding: 3mm 5mm;
    margin-bottom: 2.5mm;
    border-radius: 0 6pt 6pt 0;
    page-break-inside: avoid;
  }
  .factor-desc-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 1mm;
  }
  .factor-desc-name { font-size: 10.5pt; font-weight: 700; color: #111827; }
  .factor-desc-type {
    font-size: 8pt;
    color: #6B7280;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-left: 2mm;
  }
  .factor-desc-score { font-size: 11pt; font-weight: 700; }
  .factor-desc-text { font-size: 9pt; color: #4B5563; line-height: 1.5; }

  /* Cards de analise de departamento com classes de severidade. */
  .dept-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 4mm 6mm;
    margin-bottom: 3mm;
    page-break-inside: avoid;
  }
  .dept-card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2mm;
    gap: 3mm;
  }
  .dept-card-name { font-size: 11pt; font-weight: 700; color: #111827; }
  .dept-card-meta { font-size: 8.5pt; color: #6B7280; margin-top: 0.5mm; }
  .dept-card-class {
    padding: 1.5mm 3.5mm;
    border-radius: 20pt;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .dept-card-class.convergente { background: #F3F4F6; color: #374151; }
  .dept-card-class.critica { background: #FEE2E2; color: #991B1B; }
  .dept-card-class.positiva { background: #D1FAE5; color: #065F46; }
  .dept-card-body { font-size: 9pt; color: #374151; line-height: 1.55; }
  .dept-badges { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 2.5mm; }
  .dept-badge {
    font-size: 8.5pt;
    padding: 1mm 3mm;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 20pt;
    color: #374151;
    font-weight: 500;
  }
  .dept-badge.crit { background: #FEF2F2; border-color: #FCA5A5; color: #991B1B; font-weight: 600; }
  .dept-badge.pos { background: #F0FDF4; border-color: #86EFAC; color: #065F46; font-weight: 600; }

  /* Departamento critico em card vermelho. */
  .critico-card {
    background: #FEF2F2;
    border: 1px solid #FCA5A5;
    border-radius: 10pt;
    padding: 5mm 6mm;
    margin-bottom: 4mm;
    page-break-inside: avoid;
  }
  .critico-head { display: flex; align-items: center; gap: 3mm; margin-bottom: 2mm; }
  .critico-icon {
    width: 8mm; height: 8mm;
    border-radius: 50%;
    background: #DC2626; color: #FFFFFF;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14pt; font-weight: 700;
    flex-shrink: 0;
  }
  .critico-name { font-size: 12pt; font-weight: 700; color: #991B1B; }
  .critico-count { font-size: 9pt; color: #7F1D1D; font-weight: 600; margin-top: 0.5mm; }
  .critico-body { font-size: 9.5pt; color: #7F1D1D; line-height: 1.55; }
  .critico-badges { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 2.5mm; }
  .critico-badge {
    background: #FFFFFF;
    border: 1px solid #FCA5A5;
    padding: 1.5mm 3.5mm;
    border-radius: 20pt;
    font-size: 9pt;
    color: #991B1B;
    font-weight: 600;
  }

  /* Alertas. */
  .alert-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-left: 4px solid #D97706;
    border-radius: 8pt;
    padding: 3mm 5mm;
    margin-bottom: 2mm;
    display: flex;
    align-items: center;
    gap: 4mm;
    page-break-inside: avoid;
  }
  .alert-card.critical { border-left-color: #DC2626; }
  .alert-icon {
    width: 7mm; height: 7mm;
    border-radius: 50%;
    background: #FEF3C7; color: #B45309;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11pt; font-weight: 700;
    flex-shrink: 0;
  }
  .alert-icon.critical { background: #FEE2E2; color: #DC2626; }
  .alert-info { flex: 1; }
  .alert-title { font-size: 10pt; font-weight: 600; color: #111827; }
  .alert-sub { font-size: 8.5pt; color: #6B7280; margin-top: 0.3mm; }
  .alert-score { font-size: 12pt; font-weight: 700; color: #DC2626; min-width: 12mm; text-align: right; }
  .alert-score.yellow { color: #D97706; }

  /* Tabelas canonicas estilizadas. */
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-top: 2mm;
  }
  table.data-table thead th {
    text-align: left;
    padding: 2.5mm 3mm;
    background: #F9FAFB;
    color: #6B7280;
    font-weight: 600;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #E5E7EB;
  }
  table.data-table tbody td {
    padding: 2.5mm 3mm;
    border-bottom: 1px solid #F3F4F6;
    color: #111827;
    font-size: 9.5pt;
  }
  table.data-table tbody tr:last-child td { border-bottom: none; }
  td.right, th.right { text-align: right; }
  .variacao.up { color: #16A34A; font-weight: 700; }
  .variacao.down { color: #DC2626; font-weight: 700; }
  .variacao.eq { color: #6B7280; font-weight: 700; }
  .row-up { background: #F0FDF4; }
  .row-down { background: #FEF2F2; }

  /* Rodape de rastreabilidade. */
  .trace-card {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 8pt;
    padding: 4mm 6mm;
    font-size: 9pt;
    color: #374151;
    line-height: 1.6;
    page-break-inside: avoid;
  }
  .trace-card strong { color: #111827; font-weight: 600; }
  .trace-card code {
    font-family: 'Menlo', 'Monaco', monospace;
    font-size: 8.5pt;
    color: #374151;
    background: #F3F4F6;
    padding: 0.5mm 1.5mm;
    border-radius: 2pt;
  }
  .edit-note {
    background: #FEFCE8;
    border-left: 3px solid #FBBF24;
    padding: 3mm 5mm;
    margin-top: 3mm;
    font-size: 9pt;
    color: #78350F;
    line-height: 1.55;
    border-radius: 0 6pt 6pt 0;
    page-break-inside: avoid;
  }
  .edit-note strong { color: #78350F; font-weight: 700; }

  /* Classes utilitarias canonicas de cor. */
  .cs-green { color: #16A34A; }
  .cs-yellow { color: #D97706; }
  .cs-red { color: #DC2626; }
  .fw-700 { font-weight: 700; }

  /* Dots coloridos na legenda do radar. */
  .legend-dot {
    display: inline-block;
    width: 2.5mm; height: 2.5mm;
    border-radius: 50%;
    margin-right: 2mm;
    vertical-align: middle;
  }

  /* Suggestions com marker canonico. */
  .suggestion-intro {
    background: #F0FDFA;
    border: 1px solid #99F6E4;
    border-radius: 8pt;
    padding: 4mm 6mm;
    margin-bottom: 4mm;
    font-size: 10pt;
    color: #134E4A;
    line-height: 1.55;
  }
  .suggestion-item {
    display: flex;
    gap: 3mm;
    padding: 3mm 0;
    border-bottom: 1px solid #F3F4F6;
    font-size: 10pt;
    color: #374151;
    line-height: 1.55;
    page-break-inside: avoid;
  }
  .suggestion-item:last-child { border-bottom: none; }
  .suggestion-marker {
    font-size: 14pt;
    color: #14B8A6;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 0.5mm;
    font-weight: 700;
  }
  .suggestion-body { flex: 1; }
  .suggestion-title { font-weight: 700; color: #111827; margin-bottom: 0.5mm; font-size: 10.5pt; }
  .suggestion-desc { font-size: 9.5pt; color: #4B5563; line-height: 1.55; }

  /* ME-1.3c CC079-v4: comparativo dept x empresa — layout lado a lado. */
  .dept-vs-empresa {
    display: flex;
    gap: 6mm;
    align-items: flex-start;
    margin-top: 6mm;
  }
  .dept-vs-empresa .mini-empresa {
    flex: 0 0 40%;
  }
  .dept-vs-empresa .texto-comparativo {
    flex: 1;
    font-size: 10pt;
    color: #374151;
    line-height: 1.6;
  }
  .dept-vs-empresa .texto-comparativo strong {
    color: #111827;
    font-weight: 700;
  }

  /* ME-1.3c CC079-v4: grade de mini 9-Boxes na pagina final. */
  .mini-grid-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4mm;
    margin: 4mm 0;
  }
  .mini-grid-row > div {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 8pt;
    padding: 3mm;
    page-break-inside: avoid;
  }
  .mini-grid-row > div .mini-titulo {
    font-size: 9pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin-bottom: 1.5mm;
    letter-spacing: 0.02em;
  }
  .mini-grid-row > div.mini-empresa-destaque {
    background: #F0FDFA;
    border-color: #99F6E4;
  }

  /* ME-1.3c CC079-v4: barras empilhadas de distribuicao. */
  .stacked-bar-row {
    display: flex;
    align-items: center;
    gap: 3mm;
    margin: 2mm 0;
    font-size: 9.5pt;
  }
  .stacked-bar-row .nome-depto {
    flex: 0 0 32mm;
    color: #374151;
    font-weight: 600;
  }
  .stacked-bar-row .barra-wrap {
    flex: 1;
    display: flex;
    height: 7mm;
    border-radius: 3pt;
    overflow: hidden;
    border: 1px solid #E5E7EB;
  }
  .stacked-bar-row .barra-seg {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8pt;
    font-weight: 700;
    color: #FFFFFF;
    text-shadow: 0 0 1px rgba(0,0,0,0.3);
  }
  .stacked-bar-row .total-depto {
    flex: 0 0 10mm;
    text-align: right;
    color: #6B7280;
    font-weight: 600;
    font-size: 9pt;
  }

  /* ME-1.3c CC079-v4: legenda das barras empilhadas / mini grids. */
  .legenda-quadrantes {
    display: flex;
    flex-wrap: wrap;
    gap: 3mm;
    font-size: 8.5pt;
    color: #374151;
    margin-top: 2mm;
  }
  .legenda-quadrantes .leg-item {
    display: inline-flex;
    align-items: center;
    gap: 1mm;
  }
  .legenda-quadrantes .leg-swatch {
    display: inline-block;
    width: 3mm;
    height: 3mm;
    border-radius: 2pt;
  }
`;

/**
 * Renderiza o envelope HTML canonico envolvendo o `bodyHtml` do
 * consumidor. Deterministico: mesmos inputs -> mesma saida byte a byte.
 *
 * O cabecalho/rodape recorrentes vem via CSS `string()`: o consumidor
 * injeta no inicio do `bodyHtml` tres `<div class="string-set-only ..."
 * >` canonicos (`doc-header-left`, `doc-header-right`, `doc-footer-left`)
 * que o Puppeteer coleta e replica em todas as paginas via `@page`.
 * A capa editorial recebe `page: cover` e o CSS `@page cover` oculta
 * cabecalho/rodape na pagina 1.
 */
export function renderLayoutBase(input: LayoutBaseInput): string {
  const title = escapeHtml(input.title);
  const footerLeftRaw = input.footerLeft ?? input.title;
  const headerLeft = `ROIP APP · ${input.title}`;
  const headerRight = `${input.company.nomeFantasia}${input.footerCenter ? ` · ${input.footerCenter}` : ''}`;
  const stringSets =
    `<div class="string-set-only doc-header-left">${escapeHtml(headerLeft)}</div>` +
    `<div class="string-set-only doc-header-right">${escapeHtml(headerRight)}</div>` +
    `<div class="string-set-only doc-footer-left">${escapeHtml(footerLeftRaw)}</div>`;
  // ME-1.3c CC079-v2: logo canonico injetado como marca discreta no
  // canto superior direito da capa — espelho da identidade visual da
  // empresa. Posicao absoluta nao interfere com o layout editorial.
  const logoBrand = input.company.logoUrl
    ? `<img class="logo-brand" src="${escapeHtml(input.company.logoUrl)}" alt="Logo da empresa" ` +
      `style="position:absolute; top:12mm; right:12mm; max-height:14mm; max-width:40mm; z-index:10;" />`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>${LAYOUT_BASE_CSS}</style>
</head>
<body>
${stringSets}
${logoBrand}
<main>
${input.bodyHtml}
</main>
</body>
</html>`;
}
