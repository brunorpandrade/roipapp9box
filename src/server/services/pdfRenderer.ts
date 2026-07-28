// ROIP APP 9BOX — servico `pdfRenderer` (ME-050/51, S260).
//
// Toolchain canonica HTML -> PDF via `puppeteer-core`. Facade DI (S205
// + S258 estendida): consumidores tRPC recebem a interface
// `PdfRendererFacade` e chamam `renderPdf(html)` atraves dela; testes
// substituem por stub deterministico que devolve `Uint8Array` fixo.
//
// Racional canonico (S259 + S260 — sessao N7/S226, gate Opcao A):
// - `puppeteer-core` NAO baixa chromium no `npm install`. O runtime
//   precisa apontar para um binario ja presente no ambiente via
//   `PUPPETEER_EXECUTABLE_PATH`. Isso coloca a instalacao do chromium
//   no lugar certo — o `preparar_ambiente.sh` do path Manus faz
//   `apt-get install -y chromium-browser` idempotente.
// - No sandbox Claude (sem googleapis, RV-01), `PUPPETEER_EXECUTABLE_PATH`
//   pode ficar vazio: os testes usam Facade DI com stub e nunca
//   exercitam a toolchain real. Nenhum caminho canonico exige que
//   Claude produza PDFs reais.
// - Determinismo (§11.12): o motor Puppeteer respeita `@page` do CSS
//   canonico do `layoutBase.ts`. Margens nativas em `page.pdf()`
//   ficam em 0 para nao competir com o CSS.
//
// Politica canonica de erro:
// - `PUPPETEER_EXECUTABLE_PATH` ausente -> throw explicito com mensagem
//   de configuracao — nao ha fallback silencioso (canonico: se o
//   consumidor chamou o renderer real, o runtime tem chromium).
// - Falha do puppeteer (crash, timeout de navegacao) -> propaga
//   excecao ao consumidor, que traduz em erro tRPC canonico (§11.4
//   variante Perfil Individual; §11.12 variante NR-1).

/**
 * Facade canonica do renderizador HTML->PDF. Union interna preserva a
 * possibilidade de handlers stub que devolvem Buffer/Uint8Array
 * arbitrarios em testes, sem dependencia do puppeteer-core.
 */
export interface PdfRendererFacade {
  renderPdf: (html: string) => Promise<Uint8Array>;
}

/**
 * Resolve o binario do chromium a partir do env-var canonico. Throw
 * explicito quando ausente — nao ha fallback silencioso.
 */
function resolveExecutablePath(): string {
  const path = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!path || path.length === 0) {
    throw new Error(
      'PUPPETEER_EXECUTABLE_PATH ausente no ambiente — configure .env ' +
        '(caminho do binario chromium; rode `preparar_ambiente.sh` para instalar)',
    );
  }
  return path;
}

/**
 * Implementacao canonica do renderer real. Isolada em funcao propria
 * para permitir mock via `vi.mock` no unit deste modulo — o
 * `DEFAULT_PDF_RENDERER_FACADE` aponta para esta funcao.
 *
 * Args canonicos ao Puppeteer:
 * - `headless: true` — modo headless canonico (produce identico ao
 *   headful para PDF).
 * - `args: ['--no-sandbox', '--disable-setuid-sandbox']` — obrigatorio
 *   para rodar em container Linux sem privilegios extras. NAO afeta
 *   determinismo do PDF.
 * - `waitUntil: 'networkidle0'` no `setContent` — garante que o layout
 *   base terminou de renderizar antes do `pdf()`. Como o layout nao
 *   carrega recursos externos (exceto o logo opcional), o idle
 *   acontece imediatamente.
 * - `format: 'A4'`, `printBackground: true`, margens 0mm no `pdf()`
 *   (o CSS `@page` do layout base ja define margem canonica 20mm).
 */
async function renderPdfWithPuppeteer(html: string): Promise<Uint8Array> {
  const executablePath = resolveExecutablePath();
  // Import dinamico para nao acoplar o build do tsc/vitest com a
  // resolucao real do puppeteer-core quando o modulo nao e usado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- puppeteer-core sem types
  const puppeteer: any = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer: Uint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return buffer;
  } finally {
    await browser.close();
  }
}

/**
 * Facade DI canonica default (S260). Consumidores tRPC recebem esta
 * constante como valor default do parametro DI; testes substituem por
 * stub deterministico. Chamar `renderPdf` sem ter o chromium instalado
 * no ambiente resultara em throw explicito de `resolveExecutablePath`.
 */
export const DEFAULT_PDF_RENDERER_FACADE: PdfRendererFacade = {
  renderPdf: (html: string): Promise<Uint8Array> => renderPdfWithPuppeteer(html),
};
