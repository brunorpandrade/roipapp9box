// ROIP APP 9BOX — testes do refactor canonico /alterar-senha (ME-082).
//
// Padrao canonico do repo: sem renderizacao React. Verifica:
//   - Componente e funcao React exportada (RV-13).
//   - Mensagens canonicas literais §18.5 + DOC 02 §13.3 + §5.9
//     exportadas bit-exact.
//   - Constante PASSWORD_MIN_LENGTH == 8 canonica.
//
// **Refactor bit-exact ME-082 vs implementacao original ME-080b:**
//   - Textos literais canonicos com acentuacao correta.
//   - Mensagens de erro §18.5 literais.

import { describe, expect, it } from 'vitest';

import {
  AlterarSenhaClient,
  MSG_CAPS_LOCK,
  MSG_NOVA_IGUAL_ATUAL,
  MSG_POLITICA_SENHA,
  MSG_SENHA_ALTERADA_SUCESSO,
  MSG_SENHA_ATUAL_INCORRETA,
  MSG_SENHA_ATUAL_VAZIA,
  MSG_SENHAS_DIVERGEM,
  PASSWORD_MIN_LENGTH,
} from '../../src/app/alterar-senha/AlterarSenhaClient';

describe('AlterarSenhaClient — smoke tests RV-13 (nenhum export orfao)', () => {
  it('AlterarSenhaClient e uma funcao componente exportada', () => {
    expect(typeof AlterarSenhaClient).toBe('function');
    expect(AlterarSenhaClient.name).toBe('AlterarSenhaClient');
  });
});

describe('AlterarSenhaClient — mensagens canonicas literais §18.5', () => {
  it('MSG_SENHA_ATUAL_VAZIA bit-exact', () => {
    expect(MSG_SENHA_ATUAL_VAZIA).toBe('Informe sua senha atual.');
  });
  it('MSG_SENHA_ATUAL_INCORRETA bit-exact', () => {
    expect(MSG_SENHA_ATUAL_INCORRETA).toBe('Senha atual incorreta.');
  });
  it('MSG_POLITICA_SENHA bit-exact literal (com acentos)', () => {
    expect(MSG_POLITICA_SENHA).toBe(
      'A senha deve ter no mínimo 8 caracteres, pelo menos 1 letra e pelo menos 1 número.',
    );
  });
  it('MSG_NOVA_IGUAL_ATUAL bit-exact', () => {
    expect(MSG_NOVA_IGUAL_ATUAL).toBe('A nova senha deve ser diferente da atual.');
  });
  it('MSG_SENHAS_DIVERGEM bit-exact literal (com til)', () => {
    expect(MSG_SENHAS_DIVERGEM).toBe('As senhas não coincidem.');
  });
  it('MSG_SENHA_ALTERADA_SUCESSO bit-exact literal (DOC 02 §13.3)', () => {
    expect(MSG_SENHA_ALTERADA_SUCESSO).toBe('Senha alterada com sucesso.');
  });
  it('MSG_CAPS_LOCK bit-exact literal §5.9', () => {
    expect(MSG_CAPS_LOCK).toBe('Caps Lock ativado.');
  });
});

describe('AlterarSenhaClient — constantes canonicas §4.7 politica', () => {
  it('PASSWORD_MIN_LENGTH == 8 canonico', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
