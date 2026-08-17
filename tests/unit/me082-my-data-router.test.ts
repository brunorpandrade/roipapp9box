// ROIP APP 9BOX — testes do router myData (ME-082).
//
// Cobre RV-13 (router exportado com chamador ativo em routers/index.ts)
// e RV-08 (procs canonicas, sem decisao ambigua no consumidor).
//
// Padrao canonico do repo: identidade estatica + verificacao de
// procedures nomeadas. Sem MySQL (testes de integracao contra banco
// real vivem em tests/integration/).

import { describe, expect, it } from 'vitest';

import { appRouter } from '../../src/server/routers';
import { myDataRouter } from '../../src/server/routers/myData';

describe('myDataRouter — smoke tests RV-13', () => {
  it('myDataRouter e objeto exportado com procedures', () => {
    expect(myDataRouter).toBeDefined();
    expect(typeof myDataRouter).toBe('object');
  });

  it('myDataRouter tem proc getForCurrentUser', () => {
    const procs = myDataRouter._def.procedures;
    expect(procs).toBeDefined();
    expect('getForCurrentUser' in procs).toBe(true);
  });

  it('myDataRouter tem proc updateName', () => {
    const procs = myDataRouter._def.procedures;
    expect('updateName' in procs).toBe(true);
  });

  it('appRouter tem sub-router myData registrado', () => {
    const procs = appRouter._def.procedures;
    expect('myData.getForCurrentUser' in procs).toBe(true);
    expect('myData.updateName' in procs).toBe(true);
  });
});
