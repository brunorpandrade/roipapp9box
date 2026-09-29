// ROIP APP 9BOX — teste unitario `getPendenciasCardData`
// (ME-PAINEL-PENDENCIAS-DIALOGOS).
//
// Cobre a invariante canonica polimorfica {liderId} XOR {clevelId} do
// helper `getPendenciasCardData` do service `developmentDialogs`. Cases
// de banco real (JOIN em employees + filtros WHERE) sao cobertos pelo
// teste de integracao `tests/integration/developmentDialogs.test.ts`.

import { describe, expect, it } from 'vitest';

import {
  getPendenciasCardData,
  type PendenciaCardArgs,
} from '../../src/server/services/developmentDialogs';

describe('getPendenciasCardData — invariante polimorfica {liderId} XOR {clevelId}', () => {
  it('lanca quando ambos liderId e clevelId sao passados', async () => {
    const args = { liderId: 1, clevelId: 2 } as unknown as PendenciaCardArgs;
    await expect(getPendenciasCardData({} as never, args)).rejects.toThrow(/XOR/i);
  });

  it('lanca quando nenhum de liderId ou clevelId e passado', async () => {
    const args = {} as unknown as PendenciaCardArgs;
    await expect(getPendenciasCardData({} as never, args)).rejects.toThrow(/XOR/i);
  });
});
