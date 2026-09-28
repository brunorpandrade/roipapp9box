// ROIP APP 9BOX — modulo canonico do XLSX de "Baixar matriculas"
// (ME 3.5.1, Debito A).
//
// Origem canonica:
// - CAMADA_UI §14.10 (barra de acoes de `/todos-os-colaboradores`) +
//   §14.10.1 (badges L/RH/RF).
// - CAMADA_DADOS §4.5 (`employees.matricula varchar(4)`) + §4.4
//   (`cLevelMembers.matricula varchar(4)`) — schema canonico bit-exact
//   ME-080b Dispatch 1 (S515, `uniqueIndex(companyId, matricula)`).
// - CAMADA_AUTH §12 (`isRH` toggle exclusivo Bruno — nao aplicavel a
//   esta ME; esta ME apenas LE `matricula`, nao escreve nada).
// - ROIP_OPERACAO_POS_FILA_v15 §3.1 (ficha aprovada do Debito A —
//   colunas Nome / CPF / Matricula, sem senha, ordenacao por Nome).
//
// Exceção canonica explicita a PC1a (§11.1 DOC 02): a listagem de
// matriculas UNE `employees` + `cLevelMembers` na mesma planilha. RH
// canonicamente NAO ve C-levels em listagens nominais (`/todos-os-
// colaboradores` filtra `WHERE role != 'clevel'`). AQUI a excecao e
// justificada empiricamente pela §8.12.2 do operação — RH precisa das
// matriculas dos 2 C-levels para distribuir credenciais operacionais
// aos operadores da empresa. O mesmo precedente ja existe no repo em
// `credenciais_iniciais_*.xlsx` do upload em massa cross-tabela
// (ME-080b Dispatch 4), que expoe employees + C-levels na mesma
// planilha por identica razao operacional. Documentada aqui e no
// service para futura auditoria.
//
// Padrao canonico bit-exact ao par existente `buildEmployeesTemplate-
// Buffer` + `buildEmployeesExportBuffer` (employees.ts L2207-2300):
//   - `ExcelJS.Workbook` novo por chamada.
//   - Aba unica canonica `NOME_ABA_MATRICULAS`.
//   - Header canonico linha 1 (bold, background navy claro).
//   - `SHEET_PROTECTION_PASSWORD` canonico ('roip') herdado bit-a-bit
//     de `spreadsheets.ts:166`.
//   - Widths canonicos por coluna (Nome 40, CPF 18, Matricula 12).
//   - Retorno como Buffer (o caller converte para Base64).
//
// **RV-12.** Zero SQL cru — este modulo nao toca DB; recebe rows
// tipadas do service.
// **RV-13.** Consumido por:
//   - `employees.downloadMatriculas` (proc tRPC).
//   - `tests/unit/me-3-5-1-matriculas-export-buffer.test.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import ExcelJS from 'exceljs';

/** Nome canonico da aba do XLSX de matriculas. */
export const NOME_ABA_MATRICULAS = 'Matriculas' as const;

/**
 * 3 rotulos canonicos bit-exact da linha 1 do XLSX de matriculas.
 * Ordem canonica: Nome / CPF / Matricula. Sem coluna de senha (evita
 * exposicao de hash — decisao canonica D-A da ficha §3.1 do operação
 * v15).
 */
export const MATRICULAS_COLUMNS_CANONICAS = ['Nome', 'CPF', 'Matricula'] as const;

/** Senha de protecao canonica (bit-a-bit `spreadsheets.SHEET_PROTECTION_PASSWORD`). */
export const MATRICULAS_SHEET_PROTECTION_PASSWORD = 'roip' as const;

/**
 * Linha canonica de matricula. Cobre tanto `employees` quanto
 * `cLevelMembers` — ambos possuem `matricula varchar(4)` no schema.
 * `matricula === null` indica registro pre-provisionamento (raro para
 * empresas pos-ME-080b; ainda assim exportado como string vazia para
 * preservar quantitativo).
 */
export interface MatriculaExportRow {
  readonly name: string;
  readonly cpf: string;
  readonly matricula: string | null;
}

/**
 * Aplica mascara canonica de CPF `000.000.000-00` a partir dos 11
 * digitos brutos armazenados no schema. Bit-exact ao helper
 * `formatCpfMasked` do `internals.ts` do `TodosColaboradoresClient`,
 * duplicado aqui para preservar isolamento do modulo (RV-13 — modulo
 * puro consumido em contexto server-side sem dependencia de client).
 */
export function formatCpfMasked(cpfDigits: string): string {
  const clean = cpfDigits.replace(/\D/g, '');
  if (clean.length !== 11) {
    return cpfDigits;
  }
  const p1 = clean.slice(0, 3);
  const p2 = clean.slice(3, 6);
  const p3 = clean.slice(6, 9);
  const p4 = clean.slice(9, 11);
  return `${p1}.${p2}.${p3}-${p4}`;
}

/**
 * Constroi o Buffer canonico do XLSX de matriculas.
 *
 * Assumidos canonicos:
 *   - `rows` ja vem ordenada por nome (collator pt-BR sensitivity base)
 *     pelo caller. O buffer nao reordena.
 *   - `rows` UNE employees + cLevelMembers da empresa (excecao a PC1a
 *     documentada no cabecalho + racional canonico bit-exact).
 *   - `rows.matricula === null` renderiza como string vazia.
 *
 * Layout canonico:
 *   - Header linha 1: bold, fundo `#E6F1FB` (badge-rh canonica §14.10.1),
 *     texto `#0C447C`.
 *   - Widths canonicos: Nome 40, CPF 18, Matricula 12.
 *   - Sheet protection canonica ('roip'), preserva bit-exact o padrao
 *     `spreadsheets.SHEET_PROTECTION_PASSWORD`.
 */
export async function buildMatriculasExportBuffer(
  rows: readonly MatriculaExportRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOME_ABA_MATRICULAS);
  ws.columns = [
    { header: MATRICULAS_COLUMNS_CANONICAS[0], key: 'name', width: 40 },
    { header: MATRICULAS_COLUMNS_CANONICAS[1], key: 'cpf', width: 18 },
    { header: MATRICULAS_COLUMNS_CANONICAS[2], key: 'matricula', width: 12 },
  ];
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF0C447C' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6F1FB' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.commit();
  for (const row of rows) {
    ws.addRow({
      name: row.name,
      cpf: formatCpfMasked(row.cpf),
      matricula: row.matricula ?? '',
    });
  }
  await ws.protect(MATRICULAS_SHEET_PROTECTION_PASSWORD, {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}
