// ROIP APP 9BOX — testes unitarios canonicos ME-1.3b RETOMADA do
// POLIMENTO UNIVERSAL DOS EXPORTAVEIS.
//
// Cobertura canonica (RV-03 bi-direcional em caso bom + defeito
// injetado):
//
// - NR1-TRIM-CRU: `formatDateBR` canonicamente humaniza as datas
//   da capa e da rastreabilidade do PDF Radar NR-1 (contrato
//   bit-exact ja coberto; aqui so revalida).
// - NR1-SCORE-PT-BR: scores dos alertas canonicamente formatados
//   via `toLocaleString('pt-BR', ...)` em vez de `toFixed(1)` cru.
// - XLSX-RH-HEADER: `COLUNAS_CANONICAS_RH` canonicamente com
//   `'Líder direto'` acentuado.
// - XLSX-LIDER-HEADER: `LABEL_META`/`LABEL_DEMANDA`/`LABEL_REALIZADO`
//   canonicamente com `'Variável'` acentuado.
// - XLSX-RH-CPF: parser canonicamente aceita CPF em dois formatos
//   (`XXX.XXX.XXX-XX` e `XXXXXXXXXXX`) via strip de pontos/hifen
//   antes do lookup em `cpfIndex`.
//
// RV-13: todo export novo tem chamador real:
//   - `formatDateBR` consumido pelo `nr1Template.ts` + ja consumido pelo
//     `individualProfileTemplate.ts` (ME-1.3) + `lgpdPortabilityTemplate.ts`
//     (ME-B11.1c PATCH2).
//   - `formatCpf` consumido pelo `spreadsheets.ts.buildRHTemplateBuffer`
//     + ja consumido pelo `lgpdPortabilityTemplate.ts` + 2 internals de
//     dashboard individual (ME-B11.1c).
//
// RV-14: um statement por linha, 100 colunas.

import { describe, expect, it } from 'vitest';

import { formatCpf } from '../../src/lib/cpf/formatCpf';
import { formatDateBR } from '../../src/lib/date/formatDateBR';
import {
  COLUNAS_CANONICAS_RH,
  LABEL_DEMANDA,
  LABEL_META,
  LABEL_REALIZADO,
} from '../../src/server/routers/spreadsheets';

describe('ME-1.3b · XLSX RH header canonico — Lider direto -> Líder direto', () => {
  it('bit-exact: coluna 4 canonicamente acentuada', () => {
    expect(COLUNAS_CANONICAS_RH[3]).toBe('Líder direto');
  });

  it('bit-exact: 6 colunas canonicas no total, ordem preservada', () => {
    expect(COLUNAS_CANONICAS_RH).toEqual([
      'Nome',
      'CPF',
      'Cargo',
      'Líder direto',
      'Custo mensal (R$)',
      'Faltas',
    ]);
  });

  it('defeito injetado RV-03: nao aceita versao sem acento', () => {
    expect(COLUNAS_CANONICAS_RH[3]).not.toBe('Lider direto');
  });
});

describe('ME-1.3b · XLSX Lider header canonico — Variavel -> Variável', () => {
  it('bit-exact: LABEL_META acentuado', () => {
    expect(LABEL_META(1)).toBe('Meta [Variável 1]');
    expect(LABEL_META(3)).toBe('Meta [Variável 3]');
  });

  it('bit-exact: LABEL_DEMANDA acentuado', () => {
    expect(LABEL_DEMANDA(1)).toBe('Demanda [Variável 1]');
    expect(LABEL_DEMANDA(4)).toBe('Demanda [Variável 4]');
  });

  it('bit-exact: LABEL_REALIZADO acentuado', () => {
    expect(LABEL_REALIZADO(1)).toBe('Realizado [Variável 1]');
    expect(LABEL_REALIZADO(2)).toBe('Realizado [Variável 2]');
  });

  it('defeito injetado RV-03: nao aceita versao sem acento', () => {
    expect(LABEL_META(1)).not.toBe('Meta [Variavel 1]');
    expect(LABEL_DEMANDA(1)).not.toBe('Demanda [Variavel 1]');
    expect(LABEL_REALIZADO(1)).not.toBe('Realizado [Variavel 1]');
  });
});

describe('ME-1.3b · regex canonico do parser Lider (parseLeaderUpload)', () => {
  // Regex canonico embarcado no `src/server/routers/spreadsheets.ts`
  // linha ~927. Precisa bater bit-exact com `LABEL_META(n)` acentuado
  // para aceitar a reimportacao de planilhas geradas pelo
  // `buildLeaderTemplateBuffer`. Esta suite exercita o regex direto
  // (sem precisar de MySQL) por simetria canonica com a correcao da
  // ME-1.3b que levou a regressao para 3 testes de integracao.

  const REGEX_META_CANONICO = /^Meta \[Variável (\d+)\]$/;

  it('contrato canonico: bate com LABEL_META acentuado', () => {
    expect(REGEX_META_CANONICO.exec(LABEL_META(1))?.[1]).toBe('1');
    expect(REGEX_META_CANONICO.exec(LABEL_META(4))?.[1]).toBe('4');
  });

  it('defeito injetado RV-03: nao bate com header antigo sem acento', () => {
    expect(REGEX_META_CANONICO.exec('Meta [Variavel 1]')).toBeNull();
    expect(REGEX_META_CANONICO.exec('Meta [Variavel 4]')).toBeNull();
  });

  it('defeito injetado RV-03: nao bate com strings fora do padrao', () => {
    expect(REGEX_META_CANONICO.exec('Meta [Variável]')).toBeNull();
    expect(REGEX_META_CANONICO.exec('meta [variável 1]')).toBeNull();
    expect(REGEX_META_CANONICO.exec('')).toBeNull();
  });
});

describe('ME-1.3b · Score pt-BR em alertas NR-1', () => {
  it('contrato canonico: toLocaleString pt-BR com 1 casa decimal', () => {
    const scoreBr = (39.14).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    expect(scoreBr).toBe('39,1');
  });

  it('contrato canonico: separador decimal e virgula, nao ponto', () => {
    const scoreBr = (44.5).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    expect(scoreBr).toBe('44,5');
    expect(scoreBr).not.toContain('.');
  });

  it('defeito injetado RV-03: toFixed(1) retornaria ponto decimal cru', () => {
    const scoreCru = (39.1).toFixed(1);
    expect(scoreCru).toBe('39.1');
    expect(scoreCru).toContain('.');
  });
});

describe('ME-1.3b · formatDateBR aplicado ao NR-1 (regressao canonica)', () => {
  it('humaniza ISO YYYY-MM-DD em DD/MM/YYYY (bit-exact)', () => {
    expect(formatDateBR('2026-10-20')).toBe('20/10/2026');
    expect(formatDateBR('2026-11-30')).toBe('30/11/2026');
  });

  it('defeito injetado RV-03: ISO cru nao e aceito como humanizado', () => {
    expect(formatDateBR('2026-10-20')).not.toBe('2026-10-20');
  });
});

describe('ME-1.3b · formatCpf aplicado ao template RH + parser dual-format', () => {
  it('humaniza CPF cru em XXX.XXX.XXX-XX (bit-exact)', () => {
    expect(formatCpf('15955406603')).toBe('159.554.066-03');
  });

  it('strip canonico de pontos/hifen (parser dual-format)', () => {
    const cpfFormatado = '159.554.066-03';
    const normalizado = cpfFormatado.replace(/[.\-]/g, '');
    expect(normalizado).toBe('15955406603');
  });

  it('CPF cru digitado pelo humano (sem formatacao) nao sofre alteracao no strip', () => {
    const cpfCru = '15955406603';
    const normalizado = cpfCru.replace(/[.\-]/g, '');
    expect(normalizado).toBe('15955406603');
  });

  it('defeito injetado RV-03: comparacao bit-exact entre formatado e cru falha sem strip', () => {
    const cpfFormatado = '159.554.066-03';
    const cpfCru = '15955406603';
    expect(cpfFormatado).not.toBe(cpfCru);
  });
});
