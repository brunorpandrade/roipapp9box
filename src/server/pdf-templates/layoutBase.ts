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
 * - Faixas semanticas: verde `#16A34A`, amarelo `#F2A900`, vermelho
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
  /* CC079-DIS-C-2a-2: fix canonico global das bordas assimetricas
     no ULTIMO card de cada linha de grid (semaforizado OU cinza).
     Causa: o conteudo util bate exatamente em 170mm (210mm folha
     - 2 x 20mm @page margin). Qualquer sub-pixel positivo a direita
     e truncado. Fix: 'main' ganha 1mm de padding-right, que da ao
     grid um colchao interno sem reduzir visualmente o layout. */
  main {
    padding-right: 1mm;
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

  /* Capa editorial — página 1. */
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
  /* ME-1.10-CC079-DIS-E: cor canonizada na paleta amarela global
     #F2A900 (fecha D-CLASSES-AMARELAS-LEGADO para esta classe). Antes:
     fundo #FEF3C7, borda #FBBF24, texto #78350F (marrom pre-canonizacao).
     Padrao canonico: fundo amarelo claro + borda/strong em #F2A900
     (accent), corpo em neutro escuro legivel (#374151) — mesmo criterio
     dos cards KPI (amarelo para accent, neutro para corpo longo). */
  .cover-note {
    background: #FEFCE8;
    border: 1px solid #F2A900;
    border-radius: 8pt;
    padding: 4mm 6mm;
    font-size: 9pt;
    color: #374151;
    line-height: 1.55;
  }
  .cover-note strong { color: #F2A900; font-weight: 700; }

  /* ME-1.3c CC079-v4: classes de sumario (.toc-*) retiradas junto com
  o índice do documento. */

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
  .kpi-value.yellow { color: #F2A900; }
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

  /* Bloco de descrição executiva por fator — borda lateral teal. */
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

  /* Cards de análise de departamento com classes de severidade. */
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

  /* Departamento crítico em card vermelho. */
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
    border-left: 4px solid #F2A900;
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
  .alert-score.yellow { color: #F2A900; }

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

  /* Rodapé de rastreabilidade. */
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

  /* Classes utilitárias canonicas de cor. */
  .cs-green { color: #16A34A; }
  .cs-yellow { color: #F2A900; }
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

  /* ME-1.3c CC079-v4: grade de mini 9-Boxes na página final. */
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

  /* ME-1.3c CC079-v4: barras empilhadas de distribuição. */
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

  /* ============================================================
     ME-1.3c CC079-v5 — layout canonico do PDF Radar NR-1.
     Classes novas para radar centralizado com legenda abaixo
     (não mais lado a lado), página por departamento com cabeçalho
     idêntico, tabela 3 colunas comparativa dept x empresa, e
     nota padronizada para páginas sem dados ainda disponíveis.
     ============================================================ */

  .radar-stacked {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4mm;
    margin-top: 2mm;
  }
  .radar-stacked .radar-svg-centered {
    width: 72%;
    max-width: 110mm;
  }
  .radar-stacked .radar-respondentes-cap {
    font-size: 9pt;
    color: #6B7280;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-align: center;
  }
  .radar-legend-horizontal {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2mm 6mm;
    width: 100%;
    font-size: 9.5pt;
  }
  .radar-legend-horizontal .leg-item {
    display: flex;
    align-items: center;
    gap: 2mm;
    padding: 1mm 0;
    border-bottom: 1px solid #F3F4F6;
  }
  .radar-legend-horizontal .leg-item:nth-last-child(-n+2) {
    border-bottom: none;
  }
  .radar-legend-horizontal .leg-nome {
    flex: 1;
    color: #374151;
    font-weight: 500;
  }
  .radar-legend-horizontal .leg-score {
    font-weight: 700;
  }
  .radar-legend-biparticao {
    display: flex;
    justify-content: center;
    gap: 10mm;
    margin: 2mm 0 3mm;
    font-size: 9pt;
    color: #374151;
    font-weight: 600;
  }
  .radar-legend-biparticao .leg-chip {
    display: inline-flex;
    align-items: center;
    gap: 2mm;
  }
  .radar-legend-biparticao .leg-swatch-line {
    display: inline-block;
    width: 8mm;
    height: 2pt;
    border-radius: 1pt;
  }
  .radar-legend-biparticao .leg-swatch-line.dashed {
    border-top: 2pt dashed #14B8A6;
    height: 0;
    background: transparent;
  }

  /* Tabela 3 colunas comparativa dept x empresa (sem delta/setinhas). */
  table.data-table-3col {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-top: 4mm;
  }
  table.data-table-3col thead th {
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
  table.data-table-3col thead th.right {
    text-align: right;
  }
  table.data-table-3col tbody td {
    padding: 2.5mm 3mm;
    border-bottom: 1px solid #F3F4F6;
    color: #111827;
    font-size: 9.5pt;
  }
  table.data-table-3col tbody tr:last-child td {
    border-bottom: none;
  }
  table.data-table-3col tbody td.right {
    text-align: right;
    font-weight: 700;
  }

  /* Nota padronizada para páginas sem dados ainda disponíveis. */
  .sem-dados-nota {
    background: #F9FAFB;
    border: 1px dashed #D1D5DB;
    border-radius: 10pt;
    padding: 10mm 8mm;
    margin: 6mm 0;
    text-align: center;
    color: #6B7280;
    font-size: 10pt;
    line-height: 1.55;
  }
  .sem-dados-nota strong {
    display: block;
    font-size: 11pt;
    color: #374151;
    margin-bottom: 2mm;
    font-weight: 700;
  }

  /* Cabeçalho canonico de página de departamento. */
  .dept-page-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2mm;
  }
  .dept-page-head .dept-page-title {
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    letter-spacing: -0.01em;
  }
  .dept-page-head .dept-page-sub {
    font-size: 9pt;
    color: #6B7280;
    font-weight: 500;
  }

  /* ============================================================
     ME-1.3c CC079-v6 — camada canonica para o layout de 14 páginas
     do modelo. Hero da capa em duas linhas separadas, radar maior
     com nomes completos, lista enxuta de deptos insuficientes.
     ============================================================ */

  /* Hero da capa — v7: compacto, line2 em UMA linha. */
  .cover-hero {
    margin-top: 0;
    margin-bottom: 7mm;
    padding-right: 50mm; /* reserva espaço para o logo no canto */
  }
  .cover-title-line1 {
    font-size: 32pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.05;
    letter-spacing: -0.01em;
    margin-bottom: 3mm;
    white-space: nowrap;
  }
  .cover-title-line2 {
    font-size: 20pt;
    font-weight: 700;
    color: #14B8A6;
    line-height: 1.1;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
  }

  /* Resumo executivo compacto (dentro da capa — v7). */
  .h2-compact {
    font-size: 14pt;
    margin-top: 6mm;
    margin-bottom: 2.5mm;
    padding-bottom: 1.2mm;
    border-bottom: 2px solid #14B8A6;
  }
  .resumo-exec-paragrafo {
    font-size: 9.5pt;
    color: #374151;
    margin-bottom: 3mm;
    line-height: 1.45;
  }
  /* Capa v7: reduzir meta-grid para caber tudo numa página. */
  .cover-page .cover-meta {
    padding: 4mm 6mm;
    margin-bottom: 5mm;
  }
  .cover-page .cover-meta-row {
    padding: 1.5mm 0;
    font-size: 9.5pt;
  }
  .cover-page .cover-note {
    padding: 3mm 5mm;
    font-size: 9pt;
    margin-bottom: 4mm;
  }
  .cover-page .kpi-card {
    padding: 2.5mm 4mm;
  }
  .cover-page .kpi-value {
    font-size: 18pt;
  }
  .cover-page .gauge-wrap {
    padding: 3mm 5mm;
    margin-bottom: 0;
    margin-top: 3mm;
  }

  /* Radar v7.1 — aumentado para ocupar o espaço disponível na
     página da empresa. O override da dept-page (abaixo) mantém
     tamanho reduzido para caber radar + tabela juntos. */
  .radar-stacked .radar-svg-centered {
    width: 100%;
    max-width: 165mm;
  }
  /* Legenda horizontal maior na v7.1. */
  .radar-legend-horizontal {
    font-size: 11pt;
  }
  .radar-legend-horizontal .leg-nome,
  .radar-legend-horizontal .leg-score {
    font-size: 11pt;
  }
  .radar-legend-biparticao {
    font-size: 10.5pt;
  }

  /* Página de departamento v7.2 — radar GRANDE igual ao da página
     da empresa (max-width 165mm, mesma legenda 10.5pt), com tabela
     3 colunas compactada para caber radar + tabela na mesma página
     sem corte. Não há mais override reduzindo o SVG do radar nem a
     legenda da biparticao — a dept-page herda os valores da v7.1. */
  .dept-page {
    page-break-inside: avoid;
  }
  .dept-page .radar-block {
    margin-bottom: 2mm;
    padding: 2.5mm 4mm;
  }
  .dept-page .radar-stacked {
    gap: 2.5mm;
    margin-top: 1mm;
  }
  .dept-page table.data-table-3col {
    margin-top: 2mm;
    font-size: 9pt;
  }
  .dept-page table.data-table-3col tbody td {
    padding: 1.5mm 3mm;
    font-size: 9pt;
  }
  .dept-page table.data-table-3col thead th {
    padding: 1.5mm 3mm;
    font-size: 8pt;
  }
  .dept-page p {
    margin-bottom: 2mm;
  }
  .dept-page .dept-page-head {
    margin-bottom: 1.5mm;
  }

  /* ============================================================
     ME-1.3c CC079-v7 — página "Instrumento aplicado — os 32 itens".
     Grid de 8 blocos (um por fator) em 2 colunas; 4 itens numerados
     por bloco. Sem a escala — ela aparece apenas na rastreabilidade.
     ============================================================ */
  .instrumento-page {
    page-break-inside: avoid;
  }
  .instrumento-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm 5mm;
    margin-top: 3mm;
  }
  .instrumento-fator {
    page-break-inside: avoid;
  }
  .instrumento-fator-header {
    font-size: 9pt;
    font-weight: 700;
    color: #0F766E;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-bottom: 1mm;
    margin-bottom: 1.5mm;
    border-bottom: 1px solid #99F6E4;
  }
  .instrumento-item-list {
    padding-left: 5mm;
    margin: 0;
    font-size: 8.5pt;
    color: #374151;
    line-height: 1.4;
  }
  .instrumento-item {
    margin-bottom: 1.3mm;
  }
  .instrumento-item:last-child {
    margin-bottom: 0;
  }

  /* Lista enxuta de departamentos com amostra insuficiente. */
  .dept-insuf-list {
    list-style: none;
    padding: 0;
    margin: 4mm 0 0;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 8pt;
    overflow: hidden;
  }
  .dept-insuf-item {
    display: flex;
    align-items: center;
    gap: 2mm;
    padding: 3mm 5mm;
    border-bottom: 1px solid #F3F4F6;
    font-size: 10.5pt;
  }
  .dept-insuf-item:last-child {
    border-bottom: none;
  }
  .dept-insuf-nome {
    font-weight: 600;
    color: #111827;
    flex: 1;
  }
  .dept-insuf-sep {
    color: #9CA3AF;
  }
  .dept-insuf-count {
    color: #6B7280;
    font-weight: 500;
    font-size: 10pt;
  }

  /* Suavizar visual (v6): bordas e paletas mais limpas. */
  .info-card {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 4mm 5mm;
    font-size: 9.5pt;
    color: #374151;
    line-height: 1.55;
  }

  /* ============================================================
     ME-1.3c-Snapshot v1 — padrão do Snapshot 9-Box (espelho do Radar)
     ============================================================ */

  /* v2: hero em UMA linha "Snapshot do 9-Box" (preto + teal). */
  .cover-title-oneline {
    font-size: 32pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin-bottom: 3mm;
    white-space: nowrap;
  }
  .cover-title-oneline .cover-title-accent { color: #14B8A6; }

  /* Página de departamento no 9-Box: garante que matriz + comparativo
     caibam na mesma A4 sem corte (bug recorrente no v4). */
  .ninebox-dept-page {
    page-break-inside: avoid;
  }
  .ninebox-dept-page .radar-block {
    margin-bottom: 3mm;
    padding: 4mm 5mm;
  }

  /* Bloco "Comparativo com a empresa" dentro da dept-page: mini-matriz
     à esquerda + texto comparativo à direita, em flex horizontal. */
  .ninebox-comparativo-wrap {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 4mm 5mm;
    margin-top: 3mm;
    page-break-inside: avoid;
  }
  .ninebox-comparativo-head {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #E5E7EB;
  }
  .ninebox-comparativo-row {
    display: flex;
    gap: 6mm;
    align-items: flex-start;
  }
  .ninebox-comparativo-mini {
    width: 55mm;
    flex-shrink: 0;
  }
  .ninebox-comparativo-mini-title {
    font-size: 8pt;
    color: #6B7280;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 1.5mm;
    text-align: center;
  }
  .ninebox-comparativo-texto {
    flex: 1;
    font-size: 9pt;
    color: #374151;
    line-height: 1.55;
  }
  .ninebox-comparativo-texto p {
    margin: 0 0 2mm;
  }
  .ninebox-comparativo-texto p:last-child {
    margin-bottom: 0;
  }

  /* Resumão comparativo: grid de 8 mini-matrizes (empresa em destaque
     teal + 7 depts) + barras empilhadas horizontais. */
  .ninebox-mini-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4mm;
    margin: 4mm 0 6mm;
  }
  .ninebox-mini-cell {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 8pt;
    padding: 3mm;
    page-break-inside: avoid;
  }
  .ninebox-mini-cell.destaque {
    background: #F0FDFA;
    border-color: #99F6E4;
  }
  .ninebox-mini-cell-title {
    font-size: 9pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin-bottom: 1.5mm;
  }

  /* Participação relativa por quadrante: barras horizontais empilhadas.
     v3: gaps verticais maiores + barras mais altas para aproveitar o
     espaço da página dedicada. */
  .ninebox-stacked-bar-row {
    display: flex;
    align-items: center;
    gap: 4mm;
    margin-bottom: 5mm;
    page-break-inside: avoid;
  }
  .ninebox-stacked-bar-label {
    width: 36mm;
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    text-align: right;
    flex-shrink: 0;
  }
  .ninebox-stacked-bar-wrap {
    flex: 1;
    display: flex;
    height: 10mm;
    border-radius: 3pt;
    overflow: hidden;
    background: #F3F4F6;
  }
  .ninebox-stacked-bar-seg {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8.5pt;
    font-weight: 700;
    min-width: 3mm;
    /* v2: cor do número vem inline (paleta.text da célula) para legibilidade
       sobre o fundo pastel (paleta.bg). */
  }
  .ninebox-stacked-bar-total {
    width: 10mm;
    font-size: 9pt;
    font-weight: 700;
    color: #6B7280;
    text-align: left;
    flex-shrink: 0;
  }
  .ninebox-legend-full {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5mm 4mm;
    margin-top: 10mm;
    font-size: 9pt;
    color: #374151;
  }
  /* v4: nowrap em cada item + fonte 9pt para que nenhum rótulo quebre em
     duas linhas; 3 colunas x 3 linhas canonicas. */
  .ninebox-legend-full .leg-item {
    display: flex;
    align-items: center;
    gap: 2mm;
    white-space: nowrap;
  }
  .ninebox-legend-full .leg-swatch {
    display: inline-block;
    width: 4mm;
    height: 4mm;
    border-radius: 2pt;
    flex-shrink: 0;
  }

  /* Nota introdutória padrão (card teal pastel) — usada em "Participação
     relativa por quadrante" e seções com explicação de leitura. */
  .ninebox-nota-intro {
    background: #F0FDFA;
    border: 1px solid #99F6E4;
    border-radius: 8pt;
    padding: 4mm 5mm;
    font-size: 9.5pt;
    color: #134E4A;
    line-height: 1.55;
    margin: 3mm 0 5mm;
  }
  .ninebox-nota-intro strong { color: #134E4A; font-weight: 700; }

  /* Rastreabilidade final. */
  .rastreabilidade-card {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 5mm 7mm;
    margin: 4mm 0;
  }
  .rastreabilidade-row {
    font-size: 9.5pt;
    color: #374151;
    margin-bottom: 2mm;
    line-height: 1.55;
  }
  .rastreabilidade-row:last-child { margin-bottom: 0; }
  .rastreabilidade-row strong {
    color: #111827;
    font-weight: 700;
    margin-right: 1mm;
  }
  .rastreabilidade-nota {
    font-size: 9pt;
    color: #4B5563;
    line-height: 1.55;
    margin-top: 3mm;
  }
  .rastreabilidade-nota strong { color: #111827; font-weight: 700; }

  /* ME-1.3d — classes canonicas compartilhadas por board_deck +
     relatorio_executivo + clima_engajamento (polimento visual estrutural). */
  .h3-compact {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
    margin: 4mm 0 2mm 0;
    letter-spacing: 0.02em;
  }
  .radar-legenda-biparticao {
    display: flex;
    flex-direction: column;
    gap: 2mm;
    margin-top: 3mm;
    font-size: 9.5pt;
    color: #374151;
    line-height: 1.5;
  }
  .radar-legenda-item {
    display: flex;
    align-items: center;
    gap: 2mm;
  }
  .radar-legenda-swatch {
    display: inline-block;
    width: 4mm;
    height: 4mm;
    border-radius: 2pt;
    flex-shrink: 0;
  }
  .turnover-bars { margin-top: 2mm; }
  .turnover-bar-row {
    display: grid;
    grid-template-columns: 32mm 1fr 32mm;
    align-items: center;
    gap: 2mm;
    margin-bottom: 2mm;
    font-size: 10pt;
  }
  .turnover-bar-label {
    font-weight: 600;
    color: #111827;
  }
  .turnover-bar-track {
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
    height: 7mm;
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  .turnover-bar-fill {
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 2mm;
    font-weight: 700;
    font-size: 9pt;
    white-space: nowrap;
    min-width: 10mm;
    box-sizing: border-box;
  }
  .turnover-bar-value {
    text-align: right;
    color: #4B5563;
    font-size: 9pt;
  }

  /* Dimensão horizontal canonica para blocos clima/plenitude (dim-bar). */
  .dim-bars { margin-top: 2mm; }
  .dim-bar-row {
    display: grid;
    grid-template-columns: 42mm 1fr 20mm;
    align-items: center;
    gap: 2mm;
    margin-bottom: 2mm;
    font-size: 10pt;
  }
  .dim-bar-label {
    font-weight: 600;
    color: #111827;
  }
  .dim-bar-track {
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
    height: 6mm;
    overflow: hidden;
    position: relative;
  }
  .dim-bar-fill {
    height: 100%;
    background: #14B8A6;
    border-radius: 3pt 0 0 3pt;
  }
  .dim-bar-value {
    text-align: right;
    font-weight: 700;
    color: #111827;
    font-size: 10pt;
  }

  /* ME-1.10-DIS-F/G: Painel de resultados por area do Perfil Individual.
     Cada area abre com nota fixa; cada leitura traz nota fixa, barra por
     faixa de intensidade, valor, faixa textual e selo de papel. Duas
     areas por pagina, com respiro entre blocos para evitar encavalamento
     do cabecalho da area de baixo com a ultima leitura da de cima. */
  .subv-area {
    page-break-inside: avoid;
    margin-bottom: 14mm;
  }
  /* Primeira area logo apos o titulo: mesmo respiro que entre areas, para
     nao colar a Postura na linha do cabecalho. */
  h2 + .subv-area {
    margin-top: 10mm;
  }
  /* Item do painel (area ou leitura): nome em linha cheia, barra curta a
     direita com valor e faixa, nota embaixo. Layout do print. */
  .pf-item {
    margin-bottom: 3mm;
  }
  .pf-area {
    border-bottom: 1.5px solid #E2E8F0;
    padding-bottom: 3mm;
    margin-bottom: 5.5mm;
  }
  /* Barra da area 20% mais alta que a do fator (6mm), mesma largura. */
  .pf-area .dim-bar-track {
    height: 7.2mm;
  }
  .pf-row {
    display: flex;
    align-items: center;
    gap: 5mm;
  }
  .pf-nome {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
    font-size: 10.5pt;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pf-nome-area {
    font-size: 13.5pt;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: 0.2pt;
  }
  .pf-bar {
    flex: 0 0 52mm;
  }
  .pf-val {
    flex: 0 0 16mm;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
  }
  .pf-nota {
    font-size: 8pt;
    color: #6B7280;
    line-height: 1.15;
    margin-top: 0.3mm;
  }
  .subv-selo {
    display: inline-block;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.2pt;
    padding: 0.3mm 1.6mm;
    border-radius: 2pt;
    background: #E8EEF7;
    color: #1E3A5F;
    vertical-align: middle;
  }
  .subv-num {
    font-weight: 700;
    font-size: 11pt;
    line-height: 1.1;
    color: #1E293B;
  }
  /* Escala de intensidade neutra: 5 tons da mesma matiz azul por faixa,
     do mais claro (faixa muito baixa) ao mais cheio (faixa muito alta).
     Comunica magnitude, nao qualidade — sem semaforo. */
  .dim-bar-fill.subv-fx1 {
    background: #C3D0E0;
  }
  .dim-bar-fill.subv-fx2 {
    background: #97ACC8;
  }
  .dim-bar-fill.subv-fx3 {
    background: #6A89AE;
  }
  .dim-bar-fill.subv-fx4 {
    background: #3E6191;
  }
  .dim-bar-fill.subv-fx5 {
    background: #1E3A5F;
  }
  .subv-faixa {
    font-size: 7.5pt;
    font-weight: 600;
    color: #6B7280;
    margin-top: 0.3mm;
  }

  /* ME-1.10-DIS-G: pagina do radar de teia + indice por area + legenda. */
  .radar-wrap {
    width: 94%;
    margin: 1mm auto 3mm;
  }
  .idxarea {
    margin-top: 1mm;
  }
  .idxarea-title {
    font-size: 11pt;
    font-weight: 700;
    color: #0F172A;
    border-bottom: 1.5px solid #E2E8F0;
    padding-bottom: 1.2mm;
    margin-bottom: 2.5mm;
  }
  .idxarea-row {
    display: grid;
    grid-template-columns: 32mm 1fr 22mm;
    align-items: center;
    gap: 5mm;
    margin-bottom: 2mm;
  }
  .idxarea-nome {
    font-size: 10.5pt;
    font-weight: 700;
    color: #1E293B;
  }
  .idxarea-val {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
  }
  .leg-escala {
    display: flex;
    flex-wrap: wrap;
    gap: 4mm;
    margin-top: 3.5mm;
    padding-top: 2.5mm;
    border-top: 1px solid #E5E7EB;
  }
  .leg-item {
    display: inline-flex;
    align-items: center;
    gap: 1.5mm;
    font-size: 8.5pt;
    color: #6B7280;
  }
  .leg-swatch {
    display: inline-block;
    width: 3.2mm;
    height: 3.2mm;
    border-radius: 1pt;
  }

  /* ME-1.10-DIS-G: grafico de confiabilidade. Barras no mesmo padrao
     tonal dos fatores; descricao de uma linha por aspecto; nivel geral
     em destaque. */
  .conf-nivel {
    font-size: 12pt;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 6mm;
  }
  .conf-nivel-badge {
    display: inline-block;
    margin-left: 2.5mm;
    padding: 1mm 3.5mm;
    border-radius: 3pt;
    font-size: 11.5pt;
    font-weight: 800;
    text-transform: capitalize;
  }
  /* Semaforo do nivel geral: paleta oficial com fundo translucido. */
  .conf-nivel-alta {
    background: rgba(22, 163, 74, 0.12);
    color: #15803D;
  }
  .conf-nivel-moderada {
    background: rgba(242, 169, 0, 0.18);
    color: #B45309;
  }
  .conf-nivel-baixa {
    background: rgba(220, 38, 38, 0.12);
    color: #991B1B;
  }
  .conf-chart {
    margin-top: 1mm;
  }
  .conf-row {
    display: grid;
    grid-template-columns: 52mm 1fr 28mm;
    align-items: center;
    gap: 5mm;
    margin-bottom: 3.5mm;
  }
  .conf-nome {
    font-size: 10.5pt;
    font-weight: 600;
    color: #1E293B;
  }
  .conf-estado {
    font-size: 9pt;
    font-weight: 700;
    color: #475569;
    text-align: right;
  }
  .conf-desc {
    font-size: 8.5pt;
    color: #6B7280;
    line-height: 1.3;
    margin: 0 0 9mm;
  }

  /* Comparativo deptos — tabela colorizada canonica para o executivo. */
  .exec-dept-table-wrap {
    margin-top: 3mm;
    overflow: hidden;
    border-radius: 4pt;
    border: 1px solid #E5E7EB;
  }
  .exec-dept-table-wrap table.data-table {
    border: none;
    margin: 0;
  }
  .exec-info-row {
    display: flex;
    align-items: center;
    gap: 3mm;
    margin-top: 3mm;
    padding: 3mm 4mm;
    background: #F0FDFA;
    border-left: 3pt solid #14B8A6;
    border-radius: 3pt;
    font-size: 10pt;
    color: #0F766E;
    line-height: 1.55;
  }
  .exec-info-row strong {
    color: #0F766E;
    font-weight: 700;
  }

  /* Agregação em cascata do clima_engajamento. */
  .clima-nivel-empresa { }
  .clima-nivel-dept {
    margin-top: 6mm;
    padding-top: 4mm;
    border-top: 1px solid #E5E7EB;
  }
  .clima-nivel-equipe {
    margin-top: 4mm;
    padding-left: 6mm;
    border-left: 2pt solid #CFFAFE;
  }
  .clima-anonimato-nota {
    margin-top: 2mm;
    padding: 2mm 3mm;
    background: #FEFCE8;
    border-left: 3pt solid #F2A900;
    font-size: 9pt;
    color: #78350F;
    border-radius: 2pt;
  }

  /* CC079-DIS-C-2a-1: classes base dos aspecto-bars. O grid 2x2
     antigo foi aposentado — o template consome agora exclusivamente
     a classe canonica compacta .dim-aberta-compacta (secao mais
     abaixo). */
  .aspecto-dim-group {
    page-break-inside: avoid;
  }
  .aspecto-dim-title {
    margin: 0 0 2mm 0;
    font-size: 10pt;
    font-weight: 700;
    color: #0F766E;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .aspecto-bars { display: block; }
  .aspecto-bar-row {
    display: grid;
    grid-template-columns: 1fr 22mm 12mm;
    align-items: center;
    gap: 2.5mm;
    margin-bottom: 2.2mm;
    font-size: 10pt;
  }
  .aspecto-bar-label {
    color: #374151;
    line-height: 1.4;
  }
  /* "p.p." em span canonico com fonte reduzida para caber na mesma
     linha do numero no KPI value de variacao do turnover. */
  .kpi-value .pp-unidade {
    font-size: 0.55em;
    font-weight: 600;
    letter-spacing: 0.02em;
    vertical-align: baseline;
  }
  /* CC079-DIS-C-2a-2: borda semaforizada original restaurada (1.5px).
     A causa real das bordas assimetricas NAO era o card de semaforo —
     era QUALQUER card que termina perto da margem direita da folha,
     onde o conteudo bate em 170mm util e a borda direita e truncada
     por sub-pixel. Fix canonico global agora e aplicado em 'main'
     via padding-right abaixo. */
  .kpi-card.highlight-green,
  .kpi-card.highlight-yellow,
  .kpi-card.highlight-red,
  .kpi-card.folha-dentro,
  .kpi-card.folha-acima,
  .kpi-card.folha-abaixo,
  .kpi-card.turnover-up,
  .kpi-card.turnover-down {
    border-width: 1.5px;
    border-style: solid;
  }
  .aspecto-bar-track {
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 2pt;
    height: 3.4mm;
    overflow: hidden;
    position: relative;
  }
  .aspecto-bar-fill {
    height: 100%;
    background: #14B8A6;
    border-radius: 2pt 0 0 2pt;
  }
  .aspecto-bar-value {
    text-align: right;
    font-weight: 700;
    color: #111827;
    font-size: 9pt;
  }

  /* ME-1.3d-REV DIS-B: cascata Opção B tabela única por departamento. */
  table.clima-cascata-tabela tbody tr.clima-row-dept td {
    background: #F3F4F6;
    font-weight: 700;
    color: #111827;
  }
  table.clima-cascata-tabela tbody tr.clima-row-equipe td {
    background: #FFFFFF;
    color: #374151;
    font-size: 9pt;
  }
  .clima-row-equipe-prefix {
    color: #14B8A6;
    font-weight: 700;
    margin-right: 1mm;
  }

  /* ME-1.3d-REV DIS-B: top destaques no resumo executivo (3 bullets
     canonicos derivados deterministicamente dos blocos). */
  .exec-topdestaques-list {
    list-style: none;
    padding: 0;
    margin: 0 0 3mm 0;
  }
  .exec-topdestaques-item {
    display: flex;
    align-items: flex-start;
    gap: 2mm;
    padding: 2mm 3mm;
    margin-bottom: 1.5mm;
    background: #F0FDFA;
    border-left: 3pt solid #14B8A6;
    border-radius: 2pt;
    font-size: 10pt;
    color: #0F766E;
    line-height: 1.4;
  }
  .exec-topdestaques-item::before {
    content: "✦";
    color: #14B8A6;
    font-weight: 700;
    flex-shrink: 0;
  }

  /* ME-1.3d-REV DIS-B: KPI do turnover com variação SEMÂNTICA INVERTIDA
     (subida = pior = vermelho; descida = melhor = verde). */
  .kpi-card.turnover-up { background: #FEF2F2; border-color: #FCA5A5; }
  .kpi-card.turnover-down { background: #F0FDF4; border-color: #86EFAC; }
  .kpi-value.turnover-up { color: #DC2626; }
  .kpi-value.turnover-down { color: #16A34A; }

  /* ME-1.3d-REV DIS-B: faixa ideal da folha em % do faturamento no
     bloco financeiro. */
  .kpi-card.folha-dentro { background: #F0FDF4; border-color: #86EFAC; }
  .kpi-card.folha-acima { background: #FEF2F2; border-color: #FCA5A5; }
  .kpi-card.folha-abaixo { background: #F0FDF4; border-color: #86EFAC; }
  .kpi-value.folha-ok { color: #16A34A; }
  .kpi-value.folha-alerta { color: #DC2626; }

  /* ============================================================
     ME-1.3d-REV DIS-C — redesign McKinsey/BCG. Componentes canonicos:
     - tese canonica + 3 achados principais na capa
     - painel executivo semaforizado (5 blocos em UMA A4)
     - takeaway card por secao
     - rankings e outliers destacados
     - proximos passos antes da rastreabilidade
     - barras de aspecto / dim-bar semaforizadas por valor
     ============================================================ */

  /* Tese canonica + 3 achados principais na capa. */
  .tese-card {
    margin-top: 4mm;
    padding: 5mm 6mm;
    background: #ECFEFF;
    border-left: 4pt solid #0F766E;
    border-radius: 3pt;
    font-size: 11pt;
    color: #0F766E;
    font-weight: 600;
    line-height: 1.45;
  }
  .achados-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .achado-item {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
    padding: 3mm 4mm;
    margin-bottom: 2mm;
    border-left: 3pt solid #D1D5DB;
    border-radius: 2pt;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .achado-item::before {
    content: "✦";
    font-weight: 700;
    flex-shrink: 0;
    font-size: 11pt;
    line-height: 1.3;
  }
  .achado-item.achado-verde { background: #F0FDF4; border-left-color: #16A34A; color: #166534; }
  /* CC079-DIS-C-3-EXEC-3: cor do texto canonizada em #F2A900 (paleta
     canonica herdada do PDF Clima). Antes: #78350F (marrom antigo). */
  .achado-item.achado-amarelo { background: #FEFCE8; border-left-color: #F2A900; color: #F2A900; }
  .achado-item.achado-vermelho { background: #FEF2F2; border-left-color: #DC2626; color: #7F1D1D; }
  .achado-item.achado-verde::before { color: #16A34A; }
  .achado-item.achado-amarelo::before { color: #F2A900; }
  .achado-item.achado-vermelho::before { color: #DC2626; }

  /* CC079-DIS-C-3-EXEC: Painel executivo em DUAS linhas canonicas:
     linha 1 com 3 cards (Financeiro, Desempenho, Plenitude), linha 2
     com 2 cards (Clima, Turnover). Cada linha ocupa largura inteira
     da folha. Classes painel-exec-grid-3 e painel-exec-grid-2. */
  .painel-exec-grid {
    display: grid;
    gap: 3mm;
    margin-top: 3mm;
  }
  .painel-exec-grid-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .painel-exec-grid-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .painel-exec-card {
    border: 1px solid #E5E7EB;
    border-left: 4pt solid #D1D5DB;
    border-radius: 3pt;
    padding: 3mm 3mm 3mm 4mm;
    background: #FFFFFF;
    display: flex;
    flex-direction: column;
    gap: 1.5mm;
    page-break-inside: avoid;
  }
  .painel-exec-card.painel-verde { border-left-color: #16A34A; background: #F0FDF4; }
  .painel-exec-card.painel-amarelo { border-left-color: #F2A900; background: #FEFCE8; }
  .painel-exec-card.painel-vermelho { border-left-color: #DC2626; background: #FEF2F2; }
  .painel-exec-label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6B7280;
    margin: 0;
  }
  .painel-exec-kpi {
    font-size: 18pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.05;
  }
  .painel-exec-card.painel-verde .painel-exec-kpi { color: #166534; }
  /* CC079-DIS-C-3-EXEC-2: paleta amarela canonizada em #F2A900
     (herdada do PDF Clima). Antes: #92400E (marrom/laranja antigo). */
  .painel-exec-card.painel-amarelo .painel-exec-kpi { color: #F2A900; }
  .painel-exec-card.painel-vermelho .painel-exec-kpi { color: #7F1D1D; }
  /* CC079-DIS-C-3-EXEC-1: fonte reduzida + nowrap para caber
     "+X,YZ% vs trimestre anterior" em UMA UNICA linha no card. */
  .painel-exec-delta {
    font-size: 7.5pt;
    font-weight: 600;
    color: #6B7280;
    white-space: nowrap;
  }
  .painel-exec-delta.delta-pos { color: #166534; }
  .painel-exec-delta.delta-neg { color: #7F1D1D; }
  /* CC079-DIS-C-3-EXEC-2: dentro do card amarelo, o delta sempre
     usa a paleta canonica #F2A900 (sobrepondo delta-pos/delta-neg)
     para manter consistencia com o kpi-value amarelo. */
  .painel-exec-card.painel-amarelo .painel-exec-delta,
  .painel-exec-card.painel-amarelo .painel-exec-delta.delta-pos,
  .painel-exec-card.painel-amarelo .painel-exec-delta.delta-neg {
    color: #F2A900;
  }
  .painel-exec-takeaway {
    font-size: 8pt;
    color: #374151;
    line-height: 1.35;
  }

  /* Takeaway card canonico — 1-3 linhas interpretativas no fim de
     cada secao. Variante enxuta do info-card. */
  .takeaway-card {
    margin-top: 3mm;
    padding: 3mm 4mm;
    background: #F0FDFA;
    border-left: 3pt solid #14B8A6;
    border-radius: 3pt;
    font-size: 10pt;
    color: #0F766E;
    line-height: 1.5;
    font-weight: 500;
  }
  .takeaway-card::before {
    content: "✧  ";
    font-weight: 700;
    color: #14B8A6;
  }

  /* Ranking cards (top/bottom). */
  .ranking-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
    margin-top: 3mm;
  }
  .ranking-col {
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
    padding: 3mm 4mm;
    background: #FFFFFF;
  }
  .ranking-col.ranking-top { border-top: 3pt solid #16A34A; }
  .ranking-col.ranking-bottom { border-top: 3pt solid #DC2626; }
  .ranking-col-title {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #6B7280;
    margin: 0 0 2mm 0;
  }
  .ranking-col.ranking-top .ranking-col-title { color: #166534; }
  .ranking-col.ranking-bottom .ranking-col-title { color: #7F1D1D; }
  .ranking-item {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 2mm;
    padding: 1.5mm 0;
    border-bottom: 1px solid #F3F4F6;
    font-size: 9.5pt;
  }
  .ranking-item:last-child { border-bottom: none; }
  .ranking-item-name { color: #111827; font-weight: 500; }
  .ranking-item-score { font-weight: 700; color: #111827; }

  /* Proximos passos canonicos antes da rastreabilidade. */
  .proximos-passos-list {
    list-style: none;
    padding: 0;
    margin: 3mm 0 0 0;
  }
  .proximos-passos-item {
    display: grid;
    grid-template-columns: 8mm 1fr;
    gap: 3mm;
    padding: 3mm 4mm;
    margin-bottom: 2mm;
    background: #F8FAFC;
    border-left: 3pt solid #0F766E;
    border-radius: 3pt;
    font-size: 10pt;
    color: #0F172A;
    line-height: 1.45;
    page-break-inside: avoid;
  }
  .proximos-passos-numero {
    font-weight: 700;
    color: #0F766E;
    font-size: 11pt;
    line-height: 1;
    text-align: center;
    padding-top: 0.5mm;
  }

  /* Assiduidade — barra horizontal full-width semaforizada. */
  .assiduidade-wrap {
    margin-top: 4mm;
    padding: 2mm 3mm;
    background: #F8FAFC;
    border-radius: 3pt;
    border: 1px solid #E5E7EB;
  }
  .assiduidade-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2mm;
  }
  .assiduidade-label {
    font-size: 10pt;
    font-weight: 600;
    color: #111827;
  }
  .assiduidade-value {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
  }
  .assiduidade-value.semf-verde { color: #16A34A; }
  .assiduidade-value.semf-amarelo { color: #F2A900; }
  .assiduidade-value.semf-vermelho { color: #DC2626; }
  .assiduidade-track {
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
    height: 6mm;
    overflow: hidden;
    position: relative;
  }
  .assiduidade-fill {
    height: 100%;
    border-radius: 3pt 0 0 3pt;
  }
  .assiduidade-fill.semf-verde { background: #16A34A; }
  .assiduidade-fill.semf-amarelo { background: #F2A900; }
  .assiduidade-fill.semf-vermelho { background: #DC2626; }

  /* dim-bar semaforizada (variante com cor por faixa). */
  .dim-bar-fill.semf-verde { background: #16A34A; }
  .dim-bar-fill.semf-amarelo { background: #F2A900; }
  .dim-bar-fill.semf-vermelho { background: #DC2626; }
  .dim-bar-value.semf-verde { color: #16A34A; }
  .dim-bar-value.semf-amarelo { color: #F2A900; }
  .dim-bar-value.semf-vermelho { color: #DC2626; }

  /* aspecto-bar semaforizada. */
  .aspecto-bar-fill.semf-verde { background: #16A34A; }
  .aspecto-bar-fill.semf-amarelo { background: #F2A900; }
  .aspecto-bar-fill.semf-vermelho { background: #DC2626; }
  .aspecto-bar-value.semf-verde { color: #16A34A; }
  .aspecto-bar-value.semf-amarelo { color: #F2A900; }
  .aspecto-bar-value.semf-vermelho { color: #DC2626; }

  /* Dimensao aberta formato vertical (clima + executive). */
  .dim-aberta-group {
    margin-top: 4mm;
    padding-top: 3mm;
    border-top: 1px solid #E5E7EB;
    page-break-inside: avoid;
  }
  .dim-aberta-group:first-of-type {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
  .dim-aberta-head {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 3mm;
    margin-bottom: 2mm;
  }
  .dim-aberta-title {
    margin: 0;
    font-size: 11pt;
    font-weight: 700;
    color: #0F766E;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .dim-aberta-barra {
    width: 55mm;
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 2pt;
    height: 4mm;
    overflow: hidden;
    position: relative;
  }
  .dim-aberta-fill { height: 100%; border-radius: 2pt 0 0 2pt; }
  .dim-aberta-fill.semf-verde { background: #16A34A; }
  .dim-aberta-fill.semf-amarelo { background: #F2A900; }
  .dim-aberta-fill.semf-vermelho { background: #DC2626; }
  .dim-aberta-nota {
    font-size: 11pt;
    font-weight: 700;
    text-align: right;
    min-width: 12mm;
  }
  .dim-aberta-nota.semf-verde { color: #16A34A; }
  .dim-aberta-nota.semf-amarelo { color: #F2A900; }
  .dim-aberta-nota.semf-vermelho { color: #DC2626; }

  /* CC079-DIS-C-2a-2: layout 1 coluna com espacamento canonico
     aumentado para ocupar bem a pagina. A dim-bar principal da
     dimensao e so um pouco mais larga que as barras dos aspectos
     (40mm vs 28mm) — nao desproporcional como estava (70mm). */
  .dim-aberta-compacta {
    margin-top: 4mm;
    padding-top: 3mm;
  }
  .dim-aberta-compacta:first-of-type {
    margin-top: 0;
    padding-top: 0;
  }
  /* CC079-DIS-C-2a-3: alinhamento canonico do cabecalho da dimensao
     com as linhas de aspecto abaixo (mesma grid: label | 28mm | 11mm)
     para que a barra da dimensao fique exatamente na mesma coluna
     visual das barras dos 5 aspectos individuais. */
  .dim-aberta-compacta .dim-aberta-head {
    grid-template-columns: 1fr 28mm 11mm;
    margin-bottom: 2.5mm;
    gap: 2.5mm;
  }
  .dim-aberta-compacta .dim-aberta-title {
    font-size: 10.5pt;
  }
  /* CC079-DIS-C-2a-3: dim-bar da dimensao com MESMO comprimento das
     barras dos aspectos (28mm) — apenas um pouco mais alta (3.6mm vs
     3mm) para marcar a hierarquia visual sem distorcer proporcao. */
  .dim-aberta-compacta .dim-aberta-barra {
    width: 28mm;
    height: 3.6mm;
  }
  .dim-aberta-compacta .dim-aberta-nota {
    font-size: 10.5pt;
    min-width: 11mm;
  }
  .dim-aberta-compacta .aspecto-bars { display: block; }
  .dim-aberta-compacta .aspecto-bar-row {
    display: grid;
    grid-template-columns: 1fr 28mm 11mm;
    align-items: center;
    gap: 2.5mm;
    margin-bottom: 2.4mm;
    font-size: 9pt;
    line-height: 1.4;
  }
  .dim-aberta-compacta .aspecto-bar-label {
    color: #374151;
  }
  .dim-aberta-compacta .aspecto-bar-track {
    height: 3mm;
  }
  .dim-aberta-compacta .aspecto-bar-value {
    font-size: 9pt;
  }

  /* Tabela comparativa de deptos no clima — table-layout fixed para
     corrigir D-CLIMA-COLUNA-CORTADA. Cabe em A4 sem transbordar.
     ME-1.3d-REV DIS-C CC079-1 (D-DIS-C-COLUNA-SOBREPOSTA): cabecalho
     com quebra de linha, text-align center e fonte reduzida para
     evitar sobreposicao dos nomes longos (Engajamento, Desenvolvimento,
     Pertencimento, Realizacao). */
  /* CC079-DIS-C-2 D-CLIMA-CABECALHO-COLADO: tabela comparativa com
     rotulos abreviados no template + larguras do colgroup inline do
     consumidor (sem override por nth-child aqui), fonte 6pt no
     cabecalho + word-break: break-word + text-align center. */
  table.clima-cascata-tabela {
    table-layout: fixed;
    width: 100%;
    font-size: 8.5pt;
  }
  /* CC079-DIS-C-2a-2: palavras completas no cabecalho (sem
     abreviacoes). Fonte 5pt + word-break para que "Desenvolvimento"
     e "Pertencimento" quebrem em duas linhas se necessario. */
  table.clima-cascata-tabela thead th {
    font-size: 5pt;
    padding: 2mm 0.4mm;
    text-align: center;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
    line-height: 1.2;
    letter-spacing: 0;
    font-weight: 700;
  }
  table.clima-cascata-tabela thead th:first-child {
    text-align: left;
    font-size: 7pt;
  }
  table.clima-cascata-tabela tbody td {
    padding: 2mm 0.8mm;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  table.clima-cascata-tabela tbody td:first-child {
    text-align: left;
  }
  table.clima-cascata-tabela tbody td.right {
    text-align: center;
  }

  /* Wrapper SEM overflow:hidden quando a tabela tem table-layout:fixed
     (evita cortar visualmente a borda arredondada enquanto a tabela
     se ajusta sozinha). */
  .exec-dept-table-wrap.wrap-no-clip {
    overflow: visible;
  }

  /* Painel comparativo canonico (dept lado a lado) — layout de linhas
     densas com destaque do melhor e pior pela cor da borda. */
  table.ranking-table {
    table-layout: fixed;
    width: 100%;
    font-size: 9pt;
  }
  /* ME-1.3d-REV DIS-C CC079-1: alinhamento canonico cabecalho × dados.
     Primeira coluna (nome) a esquerda; demais colunas centralizadas. */
  table.ranking-table thead th {
    text-align: center;
    padding: 2mm 1.5mm;
    white-space: normal;
    line-height: 1.15;
  }
  table.ranking-table thead th:first-child { text-align: left; }
  table.ranking-table tbody td { text-align: center; padding: 2mm 1.5mm; }
  table.ranking-table tbody td:first-child { text-align: left; }
  table.ranking-table tbody td.right { text-align: center; }
  table.ranking-table tbody tr.ranking-row-media td {
    background: #F3F4F6;
    font-weight: 700;
    color: #111827;
    border-top: 2px solid #CBD5E1;
    border-bottom: 2px solid #CBD5E1;
  }
  table.ranking-table tbody tr td.cell-semf-verde { color: #16A34A; font-weight: 600; }
  table.ranking-table tbody tr td.cell-semf-amarelo { color: #F2A900; font-weight: 600; }
  table.ranking-table tbody tr td.cell-semf-vermelho { color: #DC2626; font-weight: 600; }

  /* Mini-cascata do clima drill-down compacto 2x1. */
  .clima-drilldown-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5mm;
    margin-top: 3mm;
  }
  .clima-drilldown-card {
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
    padding: 3mm 4mm;
    page-break-inside: avoid;
    background: #FFFFFF;
  }
  .clima-drilldown-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2mm;
    padding-bottom: 2mm;
    border-bottom: 1px solid #E5E7EB;
  }
  .clima-drilldown-nome {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
  }
  .clima-drilldown-nota {
    font-size: 14pt;
    font-weight: 700;
  }
  .clima-drilldown-nota.semf-verde { color: #16A34A; }
  .clima-drilldown-nota.semf-amarelo { color: #F2A900; }
  .clima-drilldown-nota.semf-vermelho { color: #DC2626; }
  .clima-drilldown-meta {
    font-size: 8.5pt;
    color: #6B7280;
    margin-bottom: 2mm;
  }

  /* CC079-DIS-C-2a-2: variante 2x4 do drill-down (8 cards por A4)
     + cards mais compactos para caber 8 por pagina. */
  .clima-drilldown-grid-8 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    margin-top: 3mm;
  }
  .clima-drilldown-grid-8 .clima-drilldown-card { padding: 2mm 3mm; }
  .clima-drilldown-grid-8 .clima-drilldown-nome { font-size: 9.5pt; }
  .clima-drilldown-grid-8 .clima-drilldown-nota { font-size: 11pt; }
  .clima-drilldown-grid-8 .clima-drilldown-meta { font-size: 7pt; margin-bottom: 1.2mm; }
  .clima-drilldown-grid-8 .clima-drilldown-head {
    margin-bottom: 1.2mm;
    padding-bottom: 1.2mm;
  }
  .clima-drilldown-bars .dim-bar-row {
    grid-template-columns: 32mm 1fr 11mm;
    gap: 2mm;
    margin-bottom: 1.6mm;
    font-size: 8pt;
  }
  .clima-drilldown-bars .dim-bar-track { height: 3mm; }
  /* CC079-DIS-C-2a-2: dim-bars ainda mais compactas quando dentro
     do grid-8 (8 cards por A4). */
  .clima-drilldown-grid-8 .clima-drilldown-bars .dim-bar-row {
    grid-template-columns: 28mm 1fr 10mm;
    gap: 1.5mm;
    margin-bottom: 1mm;
    font-size: 7.5pt;
  }
  .clima-drilldown-grid-8 .clima-drilldown-bars .dim-bar-track {
    height: 2.4mm;
  }
  table.clima-equipes-mini {
    table-layout: fixed;
    width: 100%;
    font-size: 7.5pt;
    margin-top: 1.5mm;
  }
  table.clima-equipes-mini thead th {
    font-size: 7pt;
    padding: 1.2mm 1mm;
    text-align: center;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: normal;
    line-height: 1.1;
  }
  table.clima-equipes-mini thead th:first-child { text-align: left; }
  table.clima-equipes-mini tbody td {
    padding: 1.2mm 1mm;
    text-align: center;
  }
  table.clima-equipes-mini tbody td:first-child { text-align: left; }

  /* CC079-DIS-C-2: rodape canonico da secao de Drill-down por lideranca
     listando as equipes abaixo do piso de anonimato. Formato:
     "[Nome do lider] (Departamento) — N liderados". */
  .clima-liderancas-fora-piso {
    margin-top: 4mm;
    padding: 3mm 4mm;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-left: 3px solid #9CA3AF;
    border-radius: 0 6pt 6pt 0;
    page-break-inside: avoid;
  }
  .clima-liderancas-fora-piso-title {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 1.5mm 0;
  }
  .clima-liderancas-fora-piso-hint {
    font-size: 8.5pt;
    color: #6B7280;
    margin: 0 0 2mm 0;
    line-height: 1.4;
  }
  .clima-liderancas-fora-piso-list {
    margin: 0;
    padding-left: 4mm;
    font-size: 8.5pt;
    color: #374151;
    line-height: 1.5;
    list-style: disc;
  }
  .clima-liderancas-fora-piso-list li {
    margin-bottom: 0.5mm;
  }
  .clima-liderancas-fora-piso-list li .muted {
    color: #6B7280;
  }

  /* ============================================================
     ME-1.10-CC079-DIS-E — lapidacao visual estrutural dos 4 PDFs
     restantes do item [1.10]. Classes canonicas reutilizaveis
     para Perfil individual, Portabilidade LGPD e documentos de
     desligamento. Mesma identidade editorial dos 5 PDFs ja
     fechados (badge, cover-hero, cover-meta, data-table).
     ============================================================ */

  /* Cabecalho editorial compacto — topo da pagina 1 de documentos
     operacionais (formularios de desligamento) que NAO justificam
     uma pagina-capa inteira. Badge + titulo + subtitulo + divisoria
     teal, com reserva de espaco para o logo no canto. */
  .doc-head-compact {
    margin: 0 0 7mm;
    padding: 0 50mm 4mm 0;
    border-bottom: 2px solid #14B8A6;
  }
  .doc-head-compact .doc-head-badge {
    display: inline-block;
    padding: 3.5pt 11pt;
    background: #EEF2FF;
    color: #1F3A5F;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: 20pt;
    margin-bottom: 4mm;
  }
  .doc-head-compact .doc-head-title {
    font-size: 20pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin: 0 0 2mm;
  }
  .doc-head-compact .doc-head-subtitle {
    font-size: 10pt;
    color: #4B5563;
    line-height: 1.45;
    margin: 0;
  }

  /* Grid de dados cadastrais (rotulo esquerda + valor direita) em
     card editorial. Substitui parrafos soltos com espacamento
     irregular por linhas alinhadas e consistentes. */
  .cadastro-grid {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 10pt;
    padding: 2mm 6mm;
    margin: 4mm 0;
  }
  .cadastro-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6mm;
    padding: 2.3mm 0;
    border-bottom: 1px solid #EEF0F3;
    font-size: 10pt;
  }
  .cadastro-row:last-child {
    border-bottom: none;
  }
  .cadastro-label {
    color: #6B7280;
    font-weight: 600;
    flex-shrink: 0;
  }
  .cadastro-value {
    color: #111827;
    font-weight: 700;
    text-align: right;
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
  // ME-1.3c CC079-v6: logo canonico injetado como marca independente
  // no canto superior direito da capa. z-index acima do texto do hero
  // e background branco opaco para evitar sobreposicao visual sobre
  // qualquer texto do titulo em 2 linhas.
  // ME-1.3d-REV DIS-A: reposicionamento canonico da logo. Antes ocupava
  // area dentro do conteudo (`top:14mm`) e invadia o H1/H2 da capa. Agora
  // fica acima da margem canonica da pagina (@page margin: 20mm), no
  // canto superior direito, menor (max-height: 14mm). D-LOGO-POSICAO
  // fechado.
  const logoBrand = input.company.logoUrl
    ? `<img class="logo-brand" src="${escapeHtml(input.company.logoUrl)}" alt="Logo da empresa" ` +
      `style="position:absolute; top:6mm; right:14mm; max-height:14mm; max-width:34mm; z-index:20; background:#FFFFFF; border-radius:3pt; padding:1pt;" />`
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
