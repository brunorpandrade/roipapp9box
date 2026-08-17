// ROIP APP 9BOX — smoke tests do MeusDadosClient (ME-082).
//
// Padrao canonico do repo (tests/unit/shell.test.ts): sem renderizacao
// React. Verifica identidade estrutural + textos literais canonicos
// exportados pelo componente e por internals.
//
// Cobre bit-exact:
//   - Componente e funcao React exportada (RV-13).
//   - Constantes canonicas re-exportadas pelo Client (MSG_NOME_*).

import { describe, expect, it } from 'vitest';

import {
  MSG_NOME_ATUALIZADO,
  MSG_NOME_OBRIGATORIO,
  MeusDadosClient,
} from '../../src/app/meus-dados/MeusDadosClient';

describe('MeusDadosClient — smoke tests RV-13 (nenhum export orfao)', () => {
  it('MeusDadosClient e uma funcao componente exportada', () => {
    expect(typeof MeusDadosClient).toBe('function');
    expect(MeusDadosClient.name).toBe('MeusDadosClient');
  });
});

describe('MeusDadosClient — mensagens canonicas literais §14.5', () => {
  it('MSG_NOME_ATUALIZADO reexportado bit-exact', () => {
    expect(MSG_NOME_ATUALIZADO).toBe('Nome atualizado.');
  });
  it('MSG_NOME_OBRIGATORIO reexportado bit-exact', () => {
    expect(MSG_NOME_OBRIGATORIO).toBe('O nome é obrigatório.');
  });
});
