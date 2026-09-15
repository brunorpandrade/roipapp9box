// ROIP APP 9BOX — helper client-side canonico para dispararnodownload
// de arquivo XLSX a partir de payload em Base64 (ME-fila5 Dispatch 2).
//
// Padrao arquitetural canonico bit-a-bit ao `RelatoriosClient.tsx:265-
// 301` (Central de Relatorios) — cria Blob → `URL.createObjectURL` →
// `<a>` sintetico → click → cleanup. Difere apenas em que a origem e
// Base64 (retorno canonico das procs `downloadTemplate`/`exportSpread-
// sheet`) em vez de Response direto do endpoint.
//
// **RV-13.** Consumido por `ImportarPlanilhaModal.tsx` (botao "Baixar
// planilha modelo (.xlsx)") + `TodosColaboradoresClient.tsx` (botoes
// "Baixar planilha modelo" e "Exportar planilha").
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.
//
// MIME type canonico OpenXML (§14.10 CAMADA_UI implicito):
// `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

/** MIME type canonico do XLSX (padrao OpenXML). */
export const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;

/**
 * Decodifica string Base64 em Uint8Array. Usa `atob` (disponivel em
 * todos os navegadores modernos + jsdom). Nao usa Buffer para preservar
 * compatibilidade client-side pura.
 */
export function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Dispara download de arquivo XLSX no navegador a partir de payload
 * Base64 + nome de arquivo. Cria Blob canonico OpenXML, monta URL
 * objeto, cria `<a>` sintetico, dispara click programatico, remove
 * elemento + revoga URL objeto para liberar memoria.
 *
 * Retorna sem erro se tudo executa; propaga excecao ao caller apenas
 * se `atob` falhar (payload Base64 corrompido — raro; se acontecer, e
 * bug de backend a investigar).
 */
export function triggerXlsxDownload(xlsxBase64: string, filename: string): void {
  const bytes = decodeBase64ToBytes(xlsxBase64);
  // Cast canonico: BlobPart aceita ArrayBufferView; Uint8Array satisfaz
  // esse contrato em runtime. O erro tipado surge de sobrecargas
  // ArrayBufferLike vs ArrayBuffer no lib.dom recente do TS 5.9.
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: MIME_XLSX });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
