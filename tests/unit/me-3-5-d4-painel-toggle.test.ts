// ROIP APP 9BOX — teste unit ME 3.5 Dispatch 4.
//
// Regua RV-03 dirigida a `computeToggleLabels` — funcao pura canonica que
// decide os rotulos do `<PainelToggle />` conforme o modo corrente.
//
// Cobre:
//   1. Modo 'clevel' → alterna para 'rh' com label "⇄ Painel RH".
//   2. Modo 'rh' → alterna para 'clevel' com label "⇄ Painel C-level".
//   3. ariaLabel remove o glifo "⇄ " para leitores de tela.
//
// Injecao canonica RV-03: se a decisao inverter (proximo modo = atual),
// os testes reprovam.

import { describe, expect, it } from 'vitest';

import {
  computeToggleLabels,
  type PainelToggleLabels,
} from '../../src/components/shell/PainelToggle';

describe('ME 3.5 D4 — computeToggleLabels (funcao pura RV-13)', () => {
  it("modo 'clevel' → nextMode 'rh', label '⇄ Painel RH'", () => {
    const r = computeToggleLabels('clevel');
    expect(r.nextMode).toBe('rh');
    expect(r.label).toBe('⇄ Painel RH');
    expect(r.ariaLabel).toBe('Alternar para Painel RH');
  });

  it("modo 'rh' → nextMode 'clevel', label '⇄ Painel C-level'", () => {
    const r = computeToggleLabels('rh');
    expect(r.nextMode).toBe('clevel');
    expect(r.label).toBe('⇄ Painel C-level');
    expect(r.ariaLabel).toBe('Alternar para Painel C-level');
  });

  it('nextMode nunca e igual ao modo atual (invariante canonica)', () => {
    const a = computeToggleLabels('clevel');
    expect(a.nextMode).not.toBe('clevel');
    const b = computeToggleLabels('rh');
    expect(b.nextMode).not.toBe('rh');
  });

  it('tipo publico PainelToggleLabels compativel (RV-13)', () => {
    const r: PainelToggleLabels = computeToggleLabels('clevel');
    expect(Object.keys(r).sort()).toEqual(['ariaLabel', 'label', 'nextMode']);
  });
});
