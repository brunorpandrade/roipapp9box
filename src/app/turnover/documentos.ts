// ROIP APP 9BOX — montagem dos documentos padrao para a pagina de
// turnover (ME-fila6 D2). Corpo HTML gerado pelo mesmo template do PDF.

import type { DocumentoPadraoView } from '../../components/turnover/DocumentosPadraoClient';
import {
  DOCUMENTO_PADRAO_TIPOS,
  DOCUMENTO_PADRAO_TITULOS,
  renderDocumentoPadraoBody,
} from '../../server/pdf-templates/terminationFormDocumentTemplate';

const BOTOES: Record<(typeof DOCUMENTO_PADRAO_TIPOS)[number], string> = {
  'roteiro-voluntario': 'Ver roteiro de entrevista de desligamento voluntário',
  'formulario-involuntario': 'Ver formulário de justificativa de desligamento involuntário',
};

/** Documentos com link de PDF; `companyId` so vai na query para Bruno. */
export function buildDocumentosPadrao(companyIdSuperAdmin: number | null): DocumentoPadraoView[] {
  return DOCUMENTO_PADRAO_TIPOS.map((tipo) => {
    const query = companyIdSuperAdmin === null ? '' : `&companyId=${companyIdSuperAdmin}`;
    return {
      tipo,
      botao: BOTOES[tipo],
      titulo: DOCUMENTO_PADRAO_TITULOS[tipo],
      corpoHtml: renderDocumentoPadraoBody(tipo),
      pdfHref: `/api/turnover/documento?tipo=${tipo}${query}`,
    };
  });
}
