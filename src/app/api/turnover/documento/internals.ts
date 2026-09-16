// ROIP APP 9BOX — dependencias injetaveis do route handler de PDF dos
// documentos padrao de desligamento (ME-fila6 D2). Mesmo padrao de DI dos
// PDFs sem IA (`snapshot-9box/download/internals.ts`): testes trocam o
// renderer por stub deterministico, sem chromium.

import {
  DEFAULT_PDF_RENDERER_FACADE,
  type PdfRendererFacade,
} from '../../../../server/services/pdfRenderer';

let pdfRendererFacade: PdfRendererFacade = DEFAULT_PDF_RENDERER_FACADE;

export function getDocumentoPdfRenderer(): PdfRendererFacade {
  return pdfRendererFacade;
}

export function __setDocumentoPdfRenderer(next: PdfRendererFacade | null): void {
  pdfRendererFacade = next ?? DEFAULT_PDF_RENDERER_FACADE;
}
