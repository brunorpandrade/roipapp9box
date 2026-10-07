// ROIP APP 9BOX — testes unitarios canonicos ME-B11.1c PATCH2
// (HUMANIZACAO ANTECIPADA no PDF LGPD: PDL3 + PDL4 + PDL5 + PDL8 +
// PDL9 + PDL10 + MD1).
//
// Cobertura canonica (RV-03 bi-direcional em caso bom + defeito
// injetado, aplicada aos 3 helpers puros desta ME):
//
// - PDL3: `formatDateBR` da fonte unica canonica
//   `src/lib/date/formatDateBR.ts` aceita `Date | string | null` e
//   emite `DD/MM/YYYY` deterministico.
// - PDL4 (+ MD1): `formatJobFamily` humaniza os 6 valores canonicos
//   do enum `JobFamily` (DOC 01 §15.3) bit-exact com o grid de
//   familias.
// - PDL9: `formatTrimestreBR` humaniza `YYYY-QN` (e `YYYY-QN-<sufixo>`
//   seed canonico) para "Nº trimestre de YYYY" em pt-BR.
// - Delegacao canonica (L125 RV-14): os callsites antigos
//   (`meus-dados/internals.ts.formatarDataBR`,
//   `todos-os-colaboradores/internals.ts.formatDateBR` e
//   `JOB_FAMILY_LABELS`) delegam bit-exact aos helpers compartilhados.
//
// **RV-13.** Todo export novo tem chamador real:
//   - `formatDateBR` consumido pelo PDF LGPD +
//     `meus-dados/internals.ts` (delegacao) +
//     `todos-os-colaboradores/internals.ts` (delegacao).
//   - `formatJobFamily` consumido pelo PDF LGPD + `routers/myData.ts`
//     + `todos-os-colaboradores/internals.ts` (delegacao).
//   - `formatTrimestreBR` consumido pelo PDF LGPD.
// **RV-14.** Um statement por linha, 100 colunas.

import { describe, expect, it } from 'vitest';

import { formatTrimestreBR } from '../../src/lib/cycle/formatTrimestreBR';
import { formatDateBR } from '../../src/lib/date/formatDateBR';
import { JOB_FAMILY_LABELS, formatJobFamily } from '../../src/lib/job-family/formatJobFamily';
// eslint-disable-next-line @stylistic/max-len -- path real do callsite canonico refatorado nesta ME
import { formatDateBR as formatDateBRTodos } from '../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
// eslint-disable-next-line @stylistic/max-len -- path real do callsite canonico refatorado nesta ME
import { JOB_FAMILY_LABELS as JOB_FAMILY_LABELS_LEGACY } from '../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
import { formatarDataBR } from '../../src/app/meus-dados/internals';

describe('ME-B11.1c PATCH2 · formatDateBR (PDL3) — fonte unica canonica', () => {
  it('formata string ISO YYYY-MM-DD em DD/MM/YYYY', () => {
    expect(formatDateBR('2017-01-02')).toBe('02/01/2017');
    expect(formatDateBR('1990-04-27')).toBe('27/04/1990');
  });

  it('formata Date em DD/MM/YYYY com getUTC* (sem drift TZ)', () => {
    expect(formatDateBR(new Date('2026-10-07T00:00:00Z'))).toBe('07/10/2026');
    expect(formatDateBR(new Date('2017-01-02T00:00:00Z'))).toBe('02/01/2017');
  });

  it('aceita string ISO com parte de tempo (corta nos 10 primeiros)', () => {
    expect(formatDateBR('2026-10-07T13:10:32.000Z')).toBe('07/10/2026');
  });

  it('retorna string vazia para null/undefined/vazio/invalido', () => {
    expect(formatDateBR(null)).toBe('');
    expect(formatDateBR(undefined)).toBe('');
    expect(formatDateBR('')).toBe('');
    expect(formatDateBR('invalido')).toBe('');
  });

  it('RV-03 defeito injetado — nao transforma formato nao-ISO', () => {
    expect(formatDateBR('07/10/2026')).toBe('');
    expect(formatDateBR('07-10-2026')).toBe('');
  });
});

describe('ME-B11.1c PATCH2 · formatJobFamily (PDL4 + MD1) — fonte unica', () => {
  it('humaniza as 6 familias canonicas bit-exact com o grid', () => {
    expect(formatJobFamily('vendas_comercial')).toBe('Vendas e comercial');
    expect(formatJobFamily('producao_operacoes')).toBe('Produção e operações');
    expect(formatJobFamily('tecnico_especialista')).toBe('Técnico especialista');
    expect(formatJobFamily('administrativo_suporte')).toBe('Administrativo e suporte');
    expect(formatJobFamily('atendimento_relacionamento')).toBe('Atendimento e relacionamento');
    expect(formatJobFamily('lideranca_gestao')).toBe('Liderança e gestão');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(formatJobFamily(null)).toBe('');
    expect(formatJobFamily(undefined)).toBe('');
  });

  it('RV-03 defeito defensivo — retorna input bit-exact fora do enum', () => {
    expect(formatJobFamily('xxx_desconhecido')).toBe('xxx_desconhecido');
    expect(formatJobFamily('')).toBe('');
  });

  it('mapa exportado tem exatamente as 6 entradas canonicas', () => {
    expect(Object.keys(JOB_FAMILY_LABELS)).toHaveLength(6);
  });
});

describe('ME-B11.1c PATCH2 · formatTrimestreBR (PDL9) — fonte unica', () => {
  it('humaniza YYYY-QN em "Nº trimestre de YYYY"', () => {
    expect(formatTrimestreBR('2027-Q4')).toBe('4º trimestre de 2027');
    expect(formatTrimestreBR('2026-Q1')).toBe('1º trimestre de 2026');
    expect(formatTrimestreBR('2026-Q2')).toBe('2º trimestre de 2026');
    expect(formatTrimestreBR('2026-Q3')).toBe('3º trimestre de 2026');
  });

  it('aceita sufixos canonicos opcionais (seed `-CORRENTE`)', () => {
    expect(formatTrimestreBR('2026-Q3-CORRENTE')).toBe('3º trimestre de 2026');
    expect(formatTrimestreBR('2027-Q1-LEGADO')).toBe('1º trimestre de 2027');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(formatTrimestreBR(null)).toBe('');
    expect(formatTrimestreBR(undefined)).toBe('');
  });

  it('RV-03 defeito defensivo — retorna input bit-exact fora do padrao', () => {
    expect(formatTrimestreBR('2026-T4')).toBe('2026-T4');
    expect(formatTrimestreBR('xxx-invalido')).toBe('xxx-invalido');
    expect(formatTrimestreBR('')).toBe('');
  });

  it('rejeita trimestre fora de 1..4', () => {
    expect(formatTrimestreBR('2026-Q5')).toBe('2026-Q5');
    expect(formatTrimestreBR('2026-Q0')).toBe('2026-Q0');
  });
});

describe('ME-B11.1c PATCH2 · delegacao canonica (L125 RV-14)', () => {
  it('meus-dados/internals.ts.formatarDataBR delega bit-exact', () => {
    expect(formatarDataBR('2017-01-02')).toBe('02/01/2017');
    expect(formatarDataBR('2017-01-02')).toBe(formatDateBR('2017-01-02'));
  });

  it('todos-os-colaboradores/internals.ts.formatDateBR delega bit-exact', () => {
    const d = new Date('2026-10-07T00:00:00Z');
    expect(formatDateBRTodos(d)).toBe('07/10/2026');
    expect(formatDateBRTodos(d)).toBe(formatDateBR(d));
  });

  it('todos-os-colaboradores/internals.ts.JOB_FAMILY_LABELS delega bit-exact', () => {
    expect(JOB_FAMILY_LABELS_LEGACY).toBe(JOB_FAMILY_LABELS);
    expect(JOB_FAMILY_LABELS_LEGACY['vendas_comercial']).toBe('Vendas e comercial');
    expect(JOB_FAMILY_LABELS_LEGACY['producao_operacoes']).toBe('Produção e operações');
  });
});
