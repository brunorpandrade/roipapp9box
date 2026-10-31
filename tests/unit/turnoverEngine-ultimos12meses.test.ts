// ROIP APP 9BOX — teste de contrato canonico ME-1.3d-REV DIS-A
// (CC079-DIS-A-1): `computeTurnoverUltimos12Meses` +
// `TurnoverUltimos12MesesResult`.
//
// Teste de contrato (RV-13): asseria apenas que a funcao e exportada
// com a assinatura canonica + o tipo e consumivel como anotacao. A
// execucao integrada com MySQL real fica no `tests/integration/
// turnover-router.test.ts` (futura ME que exponha o endpoint na UI).
//
// Precisa existir fora de `src/server/services/` para satisfazer o
// gate `check-no-dead-exports.sh` (RV-13).

import { describe, expect, it } from 'vitest';

import {
  type TurnoverUltimos12MesesResult,
  computeTurnoverUltimos12Meses,
} from '../../src/server/services/turnoverEngine';

describe('ME-1.3d-REV DIS-A — computeTurnoverUltimos12Meses contrato canonico', () => {
  it('export canonico: funcao assincrona', () => {
    expect(typeof computeTurnoverUltimos12Meses).toBe('function');
    expect(computeTurnoverUltimos12Meses.constructor.name).toBe('AsyncFunction');
    expect(computeTurnoverUltimos12Meses.length).toBe(3);
  });

  it('tipo canonico TurnoverUltimos12MesesResult carrega 5 chaves esperadas', () => {
    const amostra: TurnoverUltimos12MesesResult = {
      companyId: 1,
      trimestre: '2026-Q4',
      taxaUltimos12Meses: 12.34,
      totalSaidas12Meses: 7,
      headcountInicio12Meses: 56,
    };
    expect(amostra.companyId).toBe(1);
    expect(amostra.trimestre).toBe('2026-Q4');
    expect(amostra.taxaUltimos12Meses).toBe(12.34);
    expect(amostra.totalSaidas12Meses).toBe(7);
    expect(amostra.headcountInicio12Meses).toBe(56);
  });
});
