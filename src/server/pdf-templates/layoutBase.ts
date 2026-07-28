/* eslint-disable @stylistic/max-len -- layout HTML canonico com string CSS multi-linha */
// ROIP APP 9BOX — layout HTML canonico compartilhado (ME-050/51, S257).
//
// Envelope HTML+CSS reutilizado por todos os templates PDF do projeto:
// - `individualProfileTemplate.ts` (ME-050/51) — Perfil Individual.
// - `nr1Template.ts` (ME-050/51) — Radar NR-1.
// - `execReport*Template.ts` (ME-053) — Relatorio executivo trimestral.
// - `snapshot9BoxTemplate.ts` (ME-053) — Snapshot 9-Box.
// - `boardDeckTemplate.ts` (ME-053) — Board deck one-pager.
//
// Racional canonico (S257 aprovado por Bruno na sessao N7/S226):
// pasta unica reduz drift visual entre PDFs e coloca o DOC 05 como
// referencia unica de tokens de design. O layout base define:
// - orientacao A4 retrato, margens 20mm (DOC 03 §10.10, §11.12);
// - tipografia canonica (system-ui, sem-serif com fallback para
//   Liberation Sans — instalada por `preparar_ambiente.sh` no path
//   Manus);
// - cabecalho fixo com nome fantasia da empresa e logo opcional;
// - rodape fixo com data de geracao (renderizada pelo template — o
//   layout apenas reserva o espaco);
// - numeracao de paginas via CSS `@page` counter (Puppeteer respeita).
//
// Determinismo canonico (§11.12): mesmos `LayoutBaseInput` geram byte
// a byte o mesmo HTML — nenhum `Date.now()`, nenhum `Math.random()`,
// nenhum campo dependente de ambiente e emitido pelo layout. O
// timestamp de geracao entra pelo campo `footerCenter` do consumidor,
// que decide se preserva ou omite.

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
   * DOC 03 §10.10: esquerda vazia, centro = data de geracao, direita
   * = numeracao (renderizada pelo CSS `@page`). Consumidor decide.
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
 */
export const LAYOUT_BASE_CSS = `
  @page {
    size: A4 portrait;
    margin: 20mm;
    @bottom-right {
      content: counter(page) " / " counter(pages);
      font-family: 'Liberation Sans', system-ui, sans-serif;
      font-size: 9pt;
      color: #6b7280;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Liberation Sans', system-ui, sans-serif;
    font-size: 10.5pt;
    color: #1f2937;
    line-height: 1.4;
  }
  header.layout-base-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8mm;
    border-bottom: 0.5pt solid #d1d5db;
    margin-bottom: 6mm;
  }
  header.layout-base-header .company-name {
    font-size: 12pt;
    font-weight: 600;
    color: #111827;
  }
  header.layout-base-header .company-logo {
    max-height: 14mm;
    max-width: 40mm;
  }
  h1 { font-size: 18pt; color: #111827; margin: 0 0 4mm; }
  h2 { font-size: 14pt; color: #111827; margin: 6mm 0 3mm; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #1f2937; margin: 4mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 3mm; }
  section { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
  .muted { color: #6b7280; }
  footer.layout-base-footer {
    position: running(customFooter);
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: #6b7280;
    padding-top: 4mm;
    border-top: 0.5pt solid #d1d5db;
    margin-top: 8mm;
  }
`;

/**
 * Renderiza o envelope HTML canonico envolvendo o `bodyHtml` do
 * consumidor. Deterministico: mesmos inputs -> mesma saida byte a byte.
 */
export function renderLayoutBase(input: LayoutBaseInput): string {
  const title = escapeHtml(input.title);
  const companyName = escapeHtml(input.company.nomeFantasia);
  const logoTag = input.company.logoUrl
    ? `<img class="company-logo" src="${escapeHtml(input.company.logoUrl)}" alt="Logo da empresa" />`
    : '';
  const footerLeft = escapeHtml(input.footerLeft ?? '');
  const footerCenter = escapeHtml(input.footerCenter ?? '');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>${LAYOUT_BASE_CSS}</style>
</head>
<body>
<header class="layout-base-header">
  <div class="company-name">${companyName}</div>
  ${logoTag}
</header>
<main>
${input.bodyHtml}
</main>
<footer class="layout-base-footer">
  <span>${footerLeft}</span>
  <span>${footerCenter}</span>
  <span></span>
</footer>
</body>
</html>`;
}
