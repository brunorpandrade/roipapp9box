// ROIP APP 9BOX — teste unit ME-fila5 Dispatch 3 que garante consis-
// tencia bit-a-bit entre o modulo puro `src/lib/shared/monthly-columns
// .ts` (consumido por Client Components) e o `src/server/routers/
// spreadsheets.ts` (fonte da verdade backend). Divergencia entre os
// dois = bug latente na validacao client-side.
//
// Cobre canonicamente:
//   - `NOME_ABA_RH_MONTHLY` === `NOME_ABA_RH` (spreadsheets).
//   - `NOME_ABA_LIDER_MONTHLY` === `NOME_ABA_LIDER` (spreadsheets).
//   - `COLUNAS_CANONICAS_RH_MONTHLY` === `COLUNAS_CANONICAS_RH` bit-a-bit.
//   - `COLUNAS_FIXAS_LIDER_MONTHLY` === `COLUNAS_FIXAS_LIDER` bit-a-bit.
//
// Se algum falhar, ambos os arquivos precisam ser atualizados em bloco
// (nunca apenas um). Este teste eh o guard-rail canonico.

import { describe, expect, it } from 'vitest';

import {
  COLUNAS_FIXAS_LIDER_MONTHLY,
  COLUNAS_CANONICAS_RH_MONTHLY,
  NOME_ABA_LIDER_MONTHLY,
  NOME_ABA_RH_MONTHLY,
} from '../../src/lib/shared/monthly-columns';
import {
  COLUNAS_CANONICAS_RH,
  COLUNAS_FIXAS_LIDER,
  NOME_ABA_LIDER,
  NOME_ABA_RH,
} from '../../src/server/routers/spreadsheets';

describe('ME-fila5 D3 — consistencia monthly-columns.ts vs spreadsheets.ts', () => {
  it('NOME_ABA_RH_MONTHLY bate bit-a-bit com NOME_ABA_RH', () => {
    expect(NOME_ABA_RH_MONTHLY).toBe(NOME_ABA_RH);
  });

  it('NOME_ABA_LIDER_MONTHLY bate bit-a-bit com NOME_ABA_LIDER', () => {
    expect(NOME_ABA_LIDER_MONTHLY).toBe(NOME_ABA_LIDER);
  });

  it('COLUNAS_CANONICAS_RH_MONTHLY bate bit-a-bit com COLUNAS_CANONICAS_RH', () => {
    expect(COLUNAS_CANONICAS_RH_MONTHLY).toEqual(COLUNAS_CANONICAS_RH);
  });

  it('COLUNAS_FIXAS_LIDER_MONTHLY bate bit-a-bit com COLUNAS_FIXAS_LIDER', () => {
    expect(COLUNAS_FIXAS_LIDER_MONTHLY).toEqual(COLUNAS_FIXAS_LIDER);
  });

  it('NOME_ABA_RH_MONTHLY tem valor literal esperado', () => {
    expect(NOME_ABA_RH_MONTHLY).toBe('Preenchimento mensal RH');
  });

  it('NOME_ABA_LIDER_MONTHLY tem valor literal esperado', () => {
    expect(NOME_ABA_LIDER_MONTHLY).toBe('Preenchimento mensal Lider');
  });

  it('COLUNAS_CANONICAS_RH_MONTHLY tem 6 rotulos em ordem canonica', () => {
    expect(COLUNAS_CANONICAS_RH_MONTHLY.length).toBe(6);
    expect([...COLUNAS_CANONICAS_RH_MONTHLY]).toEqual([
      'Nome',
      'CPF',
      'Cargo',
      'Lider direto',
      'Custo mensal (R$)',
      'Faltas',
    ]);
  });

  it('COLUNAS_FIXAS_LIDER_MONTHLY tem 2 rotulos fixos', () => {
    expect(COLUNAS_FIXAS_LIDER_MONTHLY.length).toBe(2);
    expect([...COLUNAS_FIXAS_LIDER_MONTHLY]).toEqual(['Nome liderado', 'Cargo']);
  });
});
