// ROIP APP 9BOX — teste unit ME 3.5 Dispatch 4 + ampliacao ME-1.16
// (Conversa 4b, Despacho B — D-B8).
//
// Regua RV-03 dirigida a `computeToggleLabels` — funcao pura canonica que
// decide os rotulos do `<PainelToggle />` conforme o modo corrente e o
// cenario de alternancia (`'clevel_rh'` | `'rh_lider'`).
//
// Cobre:
//   1. Cenario clevel_rh: 'clevel' → 'rh' (label "⇄ Painel RH").
//   2. Cenario clevel_rh: 'rh' → 'clevel' (label "⇄ Painel C-level").
//   3. Cenario rh_lider: 'rh' → 'lider' (label "⇄ Painel Líder").
//   4. Cenario rh_lider: 'lider' → 'rh' (label "⇄ Painel RH").
//   5. ariaLabel remove o glifo "⇄ " para leitores de tela.
//   6. Default canonico de `scenario` e 'clevel_rh' (bit-exact compat).
//
// Injecao canonica RV-03: se a decisao inverter (proximo modo = atual),
// os testes reprovam.

import { describe, expect, it } from 'vitest';

import {
  computeToggleLabels,
  type PainelToggleLabels,
} from '../../src/components/shell/PainelToggle';

describe('ME 3.5 D4 — computeToggleLabels cenario clevel_rh (default)', () => {
  it("modo 'clevel' → nextMode 'rh', label '⇄ Painel RH'", () => {
    const r = computeToggleLabels('clevel');
    expect(r.nextMode).toBe('rh');
    expect(r.label).toBe('⇄ Painel RH');
    expect(r.ariaLabel).toBe('Alternar para Painel RH');
  });

  it("modo 'rh' → nextMode 'clevel', label '⇄ Painel C-level'", () => {
    const r = computeToggleLabels('rh', 'clevel_rh');
    expect(r.nextMode).toBe('clevel');
    expect(r.label).toBe('⇄ Painel C-level');
    expect(r.ariaLabel).toBe('Alternar para Painel C-level');
  });

  it('default canonico de scenario e "clevel_rh" (compat pre-ME-1.16)', () => {
    const r1 = computeToggleLabels('clevel');
    const r2 = computeToggleLabels('clevel', 'clevel_rh');
    expect(r1).toEqual(r2);
  });

  it('nextMode nunca e igual ao modo atual (invariante canonica)', () => {
    const a = computeToggleLabels('clevel', 'clevel_rh');
    expect(a.nextMode).not.toBe('clevel');
    const b = computeToggleLabels('rh', 'clevel_rh');
    expect(b.nextMode).not.toBe('rh');
  });
});

describe('ME-1.16 — computeToggleLabels cenario rh_lider', () => {
  it("modo 'rh' → nextMode 'lider', label '⇄ Painel Líder'", () => {
    const r = computeToggleLabels('rh', 'rh_lider');
    expect(r.nextMode).toBe('lider');
    expect(r.label).toBe('⇄ Painel Líder');
    expect(r.ariaLabel).toBe('Alternar para Painel Líder');
  });

  it("modo 'lider' → nextMode 'rh', label '⇄ Painel RH'", () => {
    const r = computeToggleLabels('lider', 'rh_lider');
    expect(r.nextMode).toBe('rh');
    expect(r.label).toBe('⇄ Painel RH');
    expect(r.ariaLabel).toBe('Alternar para Painel RH');
  });

  it('nextMode nunca e igual ao modo atual (invariante canonica)', () => {
    const a = computeToggleLabels('rh', 'rh_lider');
    expect(a.nextMode).not.toBe('rh');
    const b = computeToggleLabels('lider', 'rh_lider');
    expect(b.nextMode).not.toBe('lider');
  });
});

describe('ME 3.5 D4 — tipo publico', () => {
  it('tipo publico PainelToggleLabels compativel (RV-13)', () => {
    const r: PainelToggleLabels = computeToggleLabels('clevel');
    expect(Object.keys(r).sort()).toEqual(['ariaLabel', 'label', 'nextMode']);
  });
});
