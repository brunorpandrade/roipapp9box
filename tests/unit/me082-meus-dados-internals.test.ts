// ROIP APP 9BOX — testes canonicos das funcoes puras do
// /meus-dados/internals.ts (ME-082).
//
// Cobre bit-exact:
//   - Microcopy resolution (§14.5 Secao 3).
//   - Badge papel resolution (§14.5 Secao 1).
//   - Mask CPF + format CPF (§14.5 fluxo revelar CPF).
//   - Calculo idade + tempo empresa + formatacao subtexto (§14.5
//     calculos derivados).
//   - Validacao nome + mensagens canonicas (§14.5 fluxo edicao).
//
// Padrao de teste: identidade estatica + funcoes puras. Sem
// renderizacao React (o repo nao instala jsdom nem
// @testing-library/react — ver tests/unit/shell.test.ts).

import { describe, expect, it } from 'vitest';

import {
  MICROCOPY_ALTERAR_EMAIL_CLEVEL_LIDER,
  MICROCOPY_ALTERAR_EMAIL_RH,
  MSG_NOME_ATUALIZADO,
  MSG_NOME_OBRIGATORIO,
  MSG_ROTA_INVALIDA_PORTAL,
  NOME_MAX_LENGTH,
  calcularIdade,
  calcularTempoEmpresa,
  formatCpf,
  formatarDataBR,
  formatarIdade,
  formatarTempoEmpresa,
  maskCpf,
  resolveBadgePapel,
  resolveMicrocopyAlterarEmail,
  validateNome,
} from '../../src/app/meus-dados/internals';

describe('meus-dados internals — microcopy canonico §14.5 Secao 3', () => {
  it('RH recebe microcopy "contate o Super Admin"', () => {
    expect(resolveMicrocopyAlterarEmail('rh')).toBe(MICROCOPY_ALTERAR_EMAIL_RH);
    expect(resolveMicrocopyAlterarEmail('rh')).toBe(
      'Para alterar seu e-mail, contate o Super Admin.',
    );
  });

  it('RH-Lider recebe microcopy "contate o Super Admin"', () => {
    expect(resolveMicrocopyAlterarEmail('rh_lider')).toBe(MICROCOPY_ALTERAR_EMAIL_RH);
  });

  it('C-level recebe microcopy "contate o RH da sua empresa"', () => {
    expect(resolveMicrocopyAlterarEmail('clevel')).toBe(MICROCOPY_ALTERAR_EMAIL_CLEVEL_LIDER);
    expect(resolveMicrocopyAlterarEmail('clevel')).toBe(
      'Para alterar seu e-mail, contate o RH da sua empresa.',
    );
  });

  it('Lider recebe microcopy "contate o RH da sua empresa"', () => {
    expect(resolveMicrocopyAlterarEmail('lider')).toBe(MICROCOPY_ALTERAR_EMAIL_CLEVEL_LIDER);
  });
});

describe('meus-dados internals — badge papel canonico §14.5 Secao 1', () => {
  it('rh -> "RH"', () => {
    expect(resolveBadgePapel('rh')).toBe('RH');
  });
  it('rh_lider -> "RH e Lider" com acento', () => {
    expect(resolveBadgePapel('rh_lider')).toBe('RH e Líder');
  });
  it('clevel -> "C-level"', () => {
    expect(resolveBadgePapel('clevel')).toBe('C-level');
  });
  it('lider -> "Lider" com acento', () => {
    expect(resolveBadgePapel('lider')).toBe('Líder');
  });
});

describe('meus-dados internals — CPF mask/format §14.5 fluxo revelar', () => {
  it('mask preserva 3 primeiros e 2 ultimos digitos', () => {
    expect(maskCpf('12345678900')).toBe('123.***.***-00');
  });
  it('format aplica pontuacao canonica brasileira', () => {
    expect(formatCpf('12345678900')).toBe('123.456.789-00');
  });
  it('CPF com comprimento invalido retorna string original', () => {
    expect(maskCpf('123')).toBe('123');
    expect(formatCpf('123')).toBe('123');
  });
});

describe('meus-dados internals — calculo derivado idade §14.5', () => {
  it('aniversario ja passou no ano => idade completa', () => {
    const idade = calcularIdade('1988-03-15', new Date(Date.UTC(2026, 7, 17)));
    expect(idade).toBe(38);
  });
  it('aniversario ainda nao chegou no ano => idade menor 1', () => {
    const idade = calcularIdade('1988-12-15', new Date(Date.UTC(2026, 7, 17)));
    expect(idade).toBe(37);
  });
  it('formatarIdade produz "(N anos)"', () => {
    expect(formatarIdade(37)).toBe('(37 anos)');
  });
  it('data invalida retorna 0', () => {
    expect(calcularIdade('nao-e-data', new Date())).toBe(0);
  });
});

describe('meus-dados internals — calculo tempo empresa §14.5', () => {
  it('4 anos e 4 meses de admissao 15/04/2022 vs 15/08/2026', () => {
    const t = calcularTempoEmpresa('2022-04-15', new Date(Date.UTC(2026, 7, 15)));
    expect(t.anos).toBe(4);
    expect(t.meses).toBe(4);
  });
  it('tempo negativo (admissao futura) retorna zerado', () => {
    const t = calcularTempoEmpresa('2027-01-01', new Date(Date.UTC(2026, 7, 15)));
    expect(t.anos).toBe(0);
    expect(t.meses).toBe(0);
  });
  it('formatarTempoEmpresa com anos > 0 e meses > 1', () => {
    expect(formatarTempoEmpresa(4, 4)).toBe('(4 anos e 4 meses)');
  });
  it('formatarTempoEmpresa singular anos e mes', () => {
    expect(formatarTempoEmpresa(1, 1)).toBe('(1 ano e 1 mês)');
  });
  it('formatarTempoEmpresa apenas meses quando anos === 0', () => {
    expect(formatarTempoEmpresa(0, 3)).toBe('(3 meses)');
    expect(formatarTempoEmpresa(0, 1)).toBe('(1 mês)');
  });
});

describe('meus-dados internals — formatarDataBR §14.5', () => {
  it('ISO YYYY-MM-DD -> DD/MM/YYYY canonico', () => {
    expect(formatarDataBR('2022-04-15')).toBe('15/04/2022');
  });
  it('ISO com T timestamp -> extrai a data', () => {
    expect(formatarDataBR('2022-04-15T12:34:56Z')).toBe('15/04/2022');
  });
  it('string vazia retorna vazia', () => {
    expect(formatarDataBR('invalid')).toBe('');
  });
});

describe('meus-dados internals — validacao nome §14.5 fluxo edicao', () => {
  it('nome vazio retorna MSG_NOME_OBRIGATORIO literal canonico', () => {
    expect(validateNome('')).toBe(MSG_NOME_OBRIGATORIO);
    expect(validateNome('')).toBe('O nome é obrigatório.');
  });
  it('nome apenas whitespace retorna MSG_NOME_OBRIGATORIO', () => {
    expect(validateNome('   ')).toBe(MSG_NOME_OBRIGATORIO);
  });
  it('nome no limite maximo valido', () => {
    expect(validateNome('a'.repeat(NOME_MAX_LENGTH))).toBeNull();
  });
  it('nome acima do limite maximo reprova', () => {
    const excedido = validateNome('a'.repeat(NOME_MAX_LENGTH + 1));
    expect(excedido).not.toBeNull();
    expect(excedido).toContain('máximo');
  });
  it('nome valido retorna null', () => {
    expect(validateNome('Bruno Andrade')).toBeNull();
  });
});

describe('meus-dados internals — constantes canonicas exportadas', () => {
  it('MSG_NOME_ATUALIZADO literal canonico', () => {
    expect(MSG_NOME_ATUALIZADO).toBe('Nome atualizado.');
  });
  it('MSG_ROTA_INVALIDA_PORTAL literal canonico', () => {
    expect(MSG_ROTA_INVALIDA_PORTAL).toBe('Rota inválida. Redirecionando para o portal.');
  });
  it('NOME_MAX_LENGTH == 100 canonico', () => {
    expect(NOME_MAX_LENGTH).toBe(100);
  });
});
