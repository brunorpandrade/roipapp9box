// ROIP APP 9BOX — teste unitario `services/pdfRenderer` (ME-050/51, S260).
//
// Cobre a forma canonica da Facade DI e a resolucao do env-var:
// - `DEFAULT_PDF_RENDERER_FACADE` tem `renderPdf(html)` chamavel.
// - `PUPPETEER_EXECUTABLE_PATH` ausente -> throw explicito.
// - O renderer REAL do puppeteer nao e exercitado aqui: o sandbox
//   Claude bloqueia googleapis (RV-01) e chromium nao esta presente. A
//   toolchain real e responsabilidade do runtime Manus + L61
//   (verify E2E do ciclo Manus rodado por Claude em clone limpo em ME
//   futura dedicada, quando o ambiente Manus e reproduzivel).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../src/server/services/pdfRenderer';

describe('services/pdfRenderer (ME-050/51)', () => {
  const originalEnv = process.env.PUPPETEER_EXECUTABLE_PATH;

  beforeEach(() => {
    process.env.PUPPETEER_EXECUTABLE_PATH = originalEnv;
  });

  afterEach(() => {
    process.env.PUPPETEER_EXECUTABLE_PATH = originalEnv;
  });

  it('DEFAULT_PDF_RENDERER_FACADE tem renderPdf chamavel (forma canonica S260)', () => {
    expect(typeof DEFAULT_PDF_RENDERER_FACADE.renderPdf).toBe('function');
  });

  it('renderPdf lanca erro explicito quando PUPPETEER_EXECUTABLE_PATH ausente', async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    await expect(DEFAULT_PDF_RENDERER_FACADE.renderPdf('<html></html>')).rejects.toThrow(
      /PUPPETEER_EXECUTABLE_PATH ausente/,
    );
  });

  it('renderPdf lanca erro explicito quando PUPPETEER_EXECUTABLE_PATH vazio', async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '';
    await expect(DEFAULT_PDF_RENDERER_FACADE.renderPdf('<html></html>')).rejects.toThrow(
      /PUPPETEER_EXECUTABLE_PATH ausente/,
    );
  });

  it('Facade custom (stub deterministico) exercita o padrao DI canonico', async () => {
    // Bytes canonicos "%PDF-1.7" — magic number valido de PDF.
    const STUB_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const stub: PdfRendererFacade = {
      renderPdf: async (): Promise<Uint8Array> => STUB_BYTES,
    };
    const out = await stub.renderPdf('<html><body>x</body></html>');
    expect(out).toBe(STUB_BYTES);
    expect(out[0]).toBe(0x25); // '%'
  });
});
