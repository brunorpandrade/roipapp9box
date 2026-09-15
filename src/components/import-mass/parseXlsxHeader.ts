// ROIP APP 9BOX — helper client-side canonico para validar cabecalho
// XLSX contra lista canonica antes de submeter upload (ME-fila5
// Dispatch 2). Canonicamente exigido por §14 CAMADA_UI linha 2197:
// "Validacao de cabecalhos client-side; se invalido, mensagem inline
// listando colunas ausentes".
//
// Padrao arquitetural: usa SheetJS (`xlsx` v0.18.5) para parser rapido
// e enxuto no cliente — ExcelJS custaria ~1MB adicional no bundle. Le
// apenas a primeira linha da primeira sheet (cabecalho canonico) e
// compara com lista fornecida.
//
// **RV-13.** Consumido por `ImportarPlanilhaModal.tsx` (validacao
// client-side antes de habilitar botao `[Enviar planilha]`).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import * as XLSX from 'xlsx';

/** Resultado canonico da validacao. */
export type HeaderValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly missing: readonly string[];
      readonly extra: readonly string[];
      readonly canonicalMessage: string;
    };

/**
 * Mensagem canonica exibida no modal quando cabecalho diverge — segue
 * o padrao de §14 linha 2197 ("mensagem inline listando colunas ausen-
 * tes"). Formato canonico: "Colunas ausentes: X, Y, Z" ou "Colunas
 * inesperadas: A, B" ou ambos.
 */
export function buildHeaderMismatchMessage(
  missing: readonly string[],
  extra: readonly string[],
): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Colunas ausentes: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    parts.push(`Colunas inesperadas: ${extra.join(', ')}`);
  }
  if (parts.length === 0) {
    return 'Cabecalho do arquivo diverge do modelo canonico.';
  }
  return parts.join('. ') + '.';
}

/**
 * Modo de comparacao canonico:
 * - `strict` (default): expectedHeader deve bater EXATAMENTE (mesmos
 *   itens, nada a mais). Usado por `employees` e `monthly-rh`.
 * - `prefix`: expectedHeader deve aparecer como PREFIXO do header do
 *   arquivo (nas primeiras N posicoes, em ordem). Colunas extras apos
 *   as fixas sao permitidas (ficam para o backend validar). Usado por
 *   `monthly-leader` (colunas dinamicas CC3 apos as 2 fixas).
 */
export type HeaderMatchMode = 'strict' | 'prefix';

/**
 * Le a linha 1 (cabecalho) da primeira sheet do XLSX carregado e
 * compara com `expectedHeader`. Aceita ArrayBuffer do FileReader ou
 * File direto.
 *
 * Racional canonico: SheetJS aceita `File` diretamente em modo async
 * via `wb.readFile` no server, mas no cliente a API canonica e passar
 * ArrayBuffer. Este helper faz o ciclo completo (File → ArrayBuffer →
 * parse → header extraction → compare).
 *
 * Em caso de arquivo corrompido, retorna `ok:false` com mensagem
 * canonica generica — o backend fara validacao autoritativa via
 * `parseEmployeesUpload` de qualquer forma.
 */
export async function validateXlsxHeader(
  file: File,
  expectedHeader: readonly string[],
  matchMode: HeaderMatchMode = 'strict',
): Promise<HeaderValidationResult> {
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return {
      ok: false,
      missing: [],
      extra: [],
      canonicalMessage: 'Nao foi possivel ler o arquivo. Verifique se e um XLSX valido.',
    };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    return {
      ok: false,
      missing: [],
      extra: [],
      canonicalMessage: 'Arquivo XLSX invalido ou corrompido.',
    };
  }

  const firstSheetName = wb.SheetNames[0];
  if (firstSheetName === undefined) {
    return {
      ok: false,
      missing: [],
      extra: [],
      canonicalMessage: 'Arquivo XLSX sem planilhas.',
    };
  }

  const ws = wb.Sheets[firstSheetName];
  if (ws === undefined) {
    return {
      ok: false,
      missing: [],
      extra: [],
      canonicalMessage: 'Arquivo XLSX sem planilhas.',
    };
  }

  // Extrai apenas a linha 1 usando range explicito para minimizar leitura.
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: '',
  });
  const rawHeaderRow = rows[0];
  const headerRow: readonly string[] = Array.isArray(rawHeaderRow)
    ? rawHeaderRow.map((c) => String(c).trim())
    : [];

  const expected = expectedHeader.map((c) => c.trim());

  // Prefix mode: expectedHeader deve aparecer NA MESMA ORDEM nas
  // primeiras N posicoes do arquivo. Nenhuma coluna dinamica pre-fixa
  // (backend valida as demais). Se alguma das fixas nao bater na
  // posicao correta, e considerada ausente.
  if (matchMode === 'prefix') {
    const missing: string[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      const esperado = expected[i]!;
      const encontrado = headerRow[i];
      if (encontrado === undefined || encontrado !== esperado) {
        missing.push(esperado);
      }
    }
    if (missing.length === 0) {
      return { ok: true };
    }
    return {
      ok: false,
      missing,
      extra: [],
      canonicalMessage: buildHeaderMismatchMessage(missing, []),
    };
  }

  // Strict mode (default): mesmos itens, nada a mais.
  const missing = expected.filter((c) => !headerRow.includes(c));
  const extraRaw = headerRow.filter((c) => c !== '' && !expected.includes(c));
  // Remove duplicatas na lista de "extras" preservando ordem canonica.
  const extra: string[] = [];
  const seen = new Set<string>();
  for (const c of extraRaw) {
    if (!seen.has(c)) {
      seen.add(c);
      extra.push(c);
    }
  }

  if (missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    missing,
    extra,
    canonicalMessage: buildHeaderMismatchMessage(missing, extra),
  };
}
