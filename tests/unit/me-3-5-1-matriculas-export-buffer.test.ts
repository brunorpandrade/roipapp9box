// ROIP APP 9BOX — teste canonico bit-exact do modulo puro
// `src/lib/shared/matriculasExport.ts` (ME 3.5.1 Debito A).
//
// Cobertura canonica:
// - `formatCpfMasked` — mascara 000.000.000-00 sobre 11 digitos brutos.
// - `buildMatriculasExportBuffer` — layout XLSX bit-exact.
//   * Header linha 1 canonico: Nome | CPF | Matricula.
//   * Ordem preservada (caller ja ordena — modulo nao reordena).
//   * matricula NULL → renderiza como string vazia.
//   * Buffer valido (parse-back com ExcelJS).
//
// RV-13: consumidor real do modulo puro alem da proc tRPC.

import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import {
  MATRICULAS_COLUMNS_CANONICAS,
  NOME_ABA_MATRICULAS,
  buildMatriculasExportBuffer,
  formatCpfMasked,
  type MatriculaExportRow,
} from '../../src/lib/shared/matriculasExport';

describe('ME 3.5.1 — matriculasExport.formatCpfMasked', () => {
  it('aplica mascara canonica 000.000.000-00', () => {
    expect(formatCpfMasked('12345678909')).toBe('123.456.789-09');
  });
  it('retorna literal se input nao tem 11 digitos', () => {
    expect(formatCpfMasked('123')).toBe('123');
  });
  it('remove nao-digitos antes de mascarar', () => {
    expect(formatCpfMasked('123.456.789-09')).toBe('123.456.789-09');
  });
});

describe('ME 3.5.1 — buildMatriculasExportBuffer', () => {
  const rows: readonly MatriculaExportRow[] = [
    { name: 'Ana Beatriz Souza', cpf: '11122233344', matricula: 'AB01' },
    { name: 'Bruno Pereira Andrade', cpf: '55566677788', matricula: 'BR02' },
    { name: 'Carlos Sem Matricula', cpf: '99988877766', matricula: null },
  ];

  it('gera buffer canonico com aba, header e linhas na ordem informada', async () => {
    const buf = await buildMatriculasExportBuffer(rows);
    expect(buf.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    // Cast canonico `as any` bit-a-bit ao padrao dos demais testes de
    // integracao (`me-fila5-employees-download-template.test.ts`, etc.)
    // por incompatibilidade tipada Buffer<ArrayBufferLike> vs Buffer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_MATRICULAS);
    expect(ws).toBeDefined();

    // Header canonico
    const header = ws!.getRow(1);
    expect(header.getCell(1).value).toBe(MATRICULAS_COLUMNS_CANONICAS[0]);
    expect(header.getCell(2).value).toBe(MATRICULAS_COLUMNS_CANONICAS[1]);
    expect(header.getCell(3).value).toBe(MATRICULAS_COLUMNS_CANONICAS[2]);

    // Ordem preservada + mascara CPF + matricula NULL → ''
    const r2 = ws!.getRow(2);
    expect(r2.getCell(1).value).toBe('Ana Beatriz Souza');
    expect(r2.getCell(2).value).toBe('111.222.333-44');
    expect(r2.getCell(3).value).toBe('AB01');

    const r3 = ws!.getRow(3);
    expect(r3.getCell(1).value).toBe('Bruno Pereira Andrade');
    expect(r3.getCell(2).value).toBe('555.666.777-88');
    expect(r3.getCell(3).value).toBe('BR02');

    const r4 = ws!.getRow(4);
    expect(r4.getCell(1).value).toBe('Carlos Sem Matricula');
    expect(r4.getCell(2).value).toBe('999.888.777-66');
    expect(r4.getCell(3).value).toBe('');
  });

  it('aceita lista vazia (buffer valido com header apenas)', async () => {
    const buf = await buildMatriculasExportBuffer([]);
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_MATRICULAS);
    expect(ws).toBeDefined();
    expect(ws!.getRow(1).getCell(1).value).toBe(MATRICULAS_COLUMNS_CANONICAS[0]);
    // Linha 2 nao deve conter dados de colaborador.
    expect(ws!.getRow(2).getCell(1).value).toBeFalsy();
  });
});
