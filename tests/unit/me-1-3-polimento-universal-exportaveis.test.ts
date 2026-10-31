// ROIP APP 9BOX — testes unitarios canonicos ME-1.3 POLIMENTO
// UNIVERSAL DOS EXPORTAVEIS.
//
// Resolve o item [1.3] do ROADMAP_V2 (Opcao B canonica: escopo
// restrito ao polimento universal estrutural; lapidacao do
// conteudo visual de cada PDF rich fica no 2.11-2.13 por bloco).
//
// Cobertura canonica (RV-03 bi-direcional em caso bom + defeito
// injetado):
//
// - D-TRIMESTRE-CRU-XLSX / D-TRIMESTRE-CRU-PDFS: 7 call sites
//   canonicos que emitiam `YYYY-QN` cru agora delegam bit-exact a
//   `formatTrimestreBR` (helper L125 RV-14 compartilhado,
//   estabelecido em ME-B11.1c PATCH2).
// - D-DATA-APLICACAO-ISO-CRU: 1 call site (Perfil individual PDF)
//   que emitia `YYYY-MM-DD` cru agora delega bit-exact a
//   `formatDateBR`.
// - Validacao estrutural: o helper `formatTrimestreBR` canonicamente
//   mantem contrato bit-exact (nao foi tocado nesta ME).
//
// RV-13: todo call site canonico tocado nesta ME tem chamador real
// (os templates PDF e os composers xlsx sao consumidos em producao
// via `exports.*` tRPC procs e Route Handlers).
//
// RV-14: um statement por linha, 100 colunas.

import { describe, expect, it } from 'vitest';

import { formatTrimestreBR } from '../../src/lib/cycle/formatTrimestreBR';
import { formatDateBR } from '../../src/lib/date/formatDateBR';

describe('ME-1.3 · formatTrimestreBR — contrato bit-exact preservado', () => {
  it('humaniza YYYY-QN para "Nº trimestre de YYYY"', () => {
    expect(formatTrimestreBR('2026-Q4')).toBe('4º trimestre de 2026');
    expect(formatTrimestreBR('2027-Q1')).toBe('1º trimestre de 2027');
    expect(formatTrimestreBR('2026-Q2')).toBe('2º trimestre de 2026');
    expect(formatTrimestreBR('2026-Q3')).toBe('3º trimestre de 2026');
  });

  it('aceita sufixos canonicos opcionais (-CORRENTE) de seed demo', () => {
    expect(formatTrimestreBR('2026-Q3-CORRENTE')).toBe('3º trimestre de 2026');
  });

  it('retorna input bit-exact para formatos nao-conformes (defensivo)', () => {
    expect(formatTrimestreBR('xxx-invalido')).toBe('xxx-invalido');
    expect(formatTrimestreBR('2026-Q5')).toBe('2026-Q5');
  });

  it('retorna string vazia para null/undefined (defensivo)', () => {
    expect(formatTrimestreBR(null)).toBe('');
    expect(formatTrimestreBR(undefined)).toBe('');
    expect(formatTrimestreBR('')).toBe('');
  });

  it('defeito injetado RV-03: cru nao e aceito como humanizado', () => {
    const cru = '2026-Q4';
    const humanizado = formatTrimestreBR(cru);
    expect(humanizado).not.toBe(cru);
    expect(humanizado).toMatch(/^\dº trimestre de \d{4}$/);
  });
});

describe('ME-1.3 · formatDateBR — contrato bit-exact preservado', () => {
  it('humaniza YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatDateBR('2026-10-07')).toBe('07/10/2026');
    expect(formatDateBR('2017-01-02')).toBe('02/01/2017');
  });

  it('aceita Date em UTC sem drift TZ', () => {
    expect(formatDateBR(new Date('2026-10-07T00:00:00Z'))).toBe('07/10/2026');
  });

  it('retorna string vazia para null/undefined (defensivo)', () => {
    expect(formatDateBR(null)).toBe('');
    expect(formatDateBR(undefined)).toBe('');
  });

  it('defeito injetado RV-03: cru ISO nao e aceito como humanizado', () => {
    const cru = '2026-10-07';
    const humanizado = formatDateBR(cru);
    expect(humanizado).not.toBe(cru);
    expect(humanizado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('ME-1.3 · delegacao canonica dos call sites tocados (RV-14 bit-exact)', () => {
  // Os 7 call sites canonicos de trimestre tocados nesta ME:
  //
  // 1. `src/server/routers/exports.ts:composeResumoDashboardXlsx`
  //    header `Trimestre: ${formatTrimestreBR(trimestre)}`.
  // 2. `src/server/routers/exports.ts:composeEvolucaoTrimestralXlsx`
  //    headers de 20 colunas metricas `${m.label} ${formatTrimestreBR(t)}`.
  // 3. `src/server/pdf-templates/boardDeckTemplate.ts:body` +
  //    `title` HTML.
  // 4. `src/server/pdf-templates/climaEngajamentoTemplate.ts:body`
  //    + `title` HTML.
  // 5. `src/server/pdf-templates/executiveReportTemplate.ts:body`
  //    + `title` HTML.
  // 6. `src/server/pdf-templates/snapshot9BoxTemplate.ts:body` +
  //    `title` HTML.
  //
  // E o 1 call site de data:
  //
  // 7. `src/server/pdf-templates/individualProfileTemplate.ts:body`
  //    `Data de aplicação: ${formatDateBR(id.dataAplicacao)}`.
  //
  // Como estes call sites consomem o helper e produzem HTML/strings
  // deterministicos, o teste de aderencia bit-exact e feito pela
  // regressao do proprio helper canonico (acima) + validacao
  // empirica em producao (xlsx + PDFs reais abertos no navegador
  // em Nativa e Ubatuba pos-deploy).

  it('contrato canonico: humanizacao de trimestre e idempotente', () => {
    // `formatTrimestreBR` tem regex defensivo que retorna input
    // bit-exact quando nao bate em `YYYY-QN`, logo e idempotente
    // sobre o proprio output humanizado.
    expect(formatTrimestreBR(formatTrimestreBR('2026-Q4'))).toBe('4º trimestre de 2026');
  });

  it('contrato canonico: formatDateBR aceita apenas ISO ou Date (nao e idempotente)', () => {
    // Diferente de `formatTrimestreBR` (idempotente), `formatDateBR`
    // espera canonicamente `YYYY-MM-DD` ou `Date`. Passar o output
    // humanizado `DD/MM/YYYY` retorna string vazia (defensivo:
    // dado nao-conforme nao e mascarado).
    expect(formatDateBR('2026-10-07')).toBe('07/10/2026');
    expect(formatDateBR(formatDateBR('2026-10-07'))).toBe('');
  });
});
