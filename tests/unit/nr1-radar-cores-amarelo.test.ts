// ROIP APP 9BOX — teste unit CC079-DIS-C-3-NR1-AMARELO.
//
// Canoniza a cor amarela do RADAR_NR1_CORES em #F2A900 (paleta canonica
// herdada do PDF Clima). Antes: #D97706 (laranja escuro). Afeta os
// scores amarelos renderizados no PDF Radar NR-1:
//   - Pag 2: bolinhas e scores na lista de fatores (ex: "Conflitos de
//     papel 60,1", "Insegurança no trabalho 65,9").
//   - Pag 3: scores na secao "Descricao de cada fator".
//   - Pags 6-9: scores amarelos nas tabelas "Dept vs Empresa".

import { describe, expect, it } from 'vitest';

import { RADAR_NR1_CORES } from '../../src/lib/svg/pdfVisualTokens';

describe('CC079-DIS-C-3-NR1-AMARELO — RADAR_NR1_CORES.amarelo', () => {
  it('amarelo canonizado em #F2A900', () => {
    expect(RADAR_NR1_CORES.amarelo).toBe('#F2A900');
  });

  it('verde e vermelho preservados', () => {
    expect(RADAR_NR1_CORES.verde).toBe('#16A34A');
    expect(RADAR_NR1_CORES.vermelho).toBe('#DC2626');
  });

  it('amarelo nao e mais #D97706 (laranja escuro antigo)', () => {
    expect(RADAR_NR1_CORES.amarelo).not.toBe('#D97706');
  });
});
