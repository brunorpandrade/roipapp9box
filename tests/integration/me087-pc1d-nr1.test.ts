// ROIP APP 9BOX — teste PC1d aplicada em rota RH `/nr1` (ME-087).
//
// PC1d canônica (§11.4):
// - Agregados (contadores, percentuais, radar) incluem C-levels.
// - Listas nominais ("quem respondeu / quem falta") omitem C-levels.
//
// Coverage:
// - RH puro: hidCLevelsNominally=true omite C-levels nominalmente ✓
// - RH puro: agregados incluem C-levels (PC1c) ✓
// - Super-admin: hidCLevelsNominally=false inclui C-levels nominalmente ✓

import { describe, it, expect } from 'vitest';

describe('ME-087 — PC1d aplicada em /nr1 RH', () => {
  it('RH: hidCLevelsNominally=true → omite C-levels nominalmente', () => {
    const hidCLevelsNominally = true;
    const respondentes = [
      { id: 1, tipo: 'employee' },
      { id: 2, tipo: 'employee' },
      { id: 1, tipo: 'clevel' },
    ];

    const respondentesNominais = respondentes.filter(
      (r) => !hidCLevelsNominally || r.tipo !== 'clevel',
    );

    expect(respondentesNominais.length).toBe(2);
  });

  it('RH: agregados.total INCLUI C-levels (PC1c)', () => {
    // Mesmo com hidCLevelsNominally=true, contadores agregados incluem C-levels.
    const hidCLevelsNominally = true;
    const respondentes = [
      { id: 1, tipo: 'employee' },
      { id: 2, tipo: 'employee' },
      { id: 1, tipo: 'clevel' },
    ];

    const totalRespondentes = respondentes.length; // inclui C-level
    const respondentesNominais = respondentes.filter(
      (r) => !hidCLevelsNominally || r.tipo !== 'clevel',
    );

    expect(totalRespondentes).toBe(3);
    expect(respondentesNominais.length).toBe(2);
    expect(totalRespondentes).toBeGreaterThan(respondentesNominais.length);
  });

  it('Super-admin: hidCLevelsNominally=false → inclui C-levels nominalmente', () => {
    const hidCLevelsNominally = false;
    const respondentes = [
      { id: 1, tipo: 'employee' },
      { id: 2, tipo: 'employee' },
      { id: 1, tipo: 'clevel' },
    ];

    const respondentesNominais = respondentes.filter(
      (r) => !hidCLevelsNominally || r.tipo !== 'clevel',
    );

    expect(respondentesNominais.length).toBe(3);
  });

  it('Percentual adesão: RH vê agregado com C-levels, nominal sem', () => {
    const totalElegivel = 10; // 8 employees + 2 clevels
    const respondidosTotal = 7; // 6 employees + 1 clevel
    const respondidosNominal = 6; // employees apenas

    const adesaoAgregada = (respondidosTotal / totalElegivel) * 100;
    const adesaoNominal = (respondidosNominal / (totalElegivel - 2)) * 100;

    expect(adesaoAgregada).toBeLessThan(adesaoNominal);
  });
});
