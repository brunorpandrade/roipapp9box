// ROIP APP 9BOX — tests unit `resolveServerSession` (ME-056 Bloco A).
//
// Cobre bit-exact os dois branches que nao dependem de banco:
//   - token null → null (sem cookie).
//   - token invalido/expirado → null (verifyToken retorna { valid: false }).
//
// Os branches que dependem de banco (super_admin OK, platform rh OK,
// platform rh_lider OK, platform clevel OK, platform lider OK, userId
// inexistente) sao cobertos por `tests/integration/me056-panels.test.ts`
// contra MySQL real. Aqui e apenas o filtro superior — TypeScript garante
// as demais possibilidades por narrowing exaustivo.
//
// Motivo canonico: o repo nao instalou jsdom nem mock helpers para
// Drizzle (padrao S007 estendido — tests unit puros; integration
// contra MySQL efemero). Um mock parcial de `db` produziria falsos
// positivos, contradizendo RV-11.

import { describe, it, expect } from 'vitest';

import { resolveServerSession } from '../../src/server/session/serverSession';
import type { RoipDatabase } from '../../src/db/client';

/**
 * Sentinela de `db` — nunca acessada nos branches testados abaixo.
 * Se algum branch tocar `db.select(...)`, o teste falha imediatamente
 * (TypeError sobre `undefined`), o que sinalizaria regressao logica.
 */
const UNTOUCHED_DB = undefined as unknown as RoipDatabase;

describe('resolveServerSession — token nulo/vazio (branch pre-verifyToken)', () => {
  it('retorna null quando token e null', async () => {
    const result = await resolveServerSession(null, UNTOUCHED_DB);
    expect(result).toBe(null);
  });

  it('retorna null quando token e string vazia', async () => {
    const result = await resolveServerSession('', UNTOUCHED_DB);
    expect(result).toBe(null);
  });
});

describe('resolveServerSession — token invalido (branch pos-verifyToken)', () => {
  it('retorna null quando token e uma string arbitraria nao-JWT', async () => {
    // `verifyToken` decodifica a string e devolve { valid: false }
    // quando nao e um JWT valido. Sem JWT_SECRET setado neste path,
    // qualquer string cai em falha.
    const result = await resolveServerSession('lorem-ipsum-not-a-jwt', UNTOUCHED_DB);
    expect(result).toBe(null);
  });

  it('retorna null para JWT malformado', async () => {
    // 3 segmentos Base64URL falsos separados por ponto — parseia mas
    // nao verifica assinatura.
    const result = await resolveServerSession('aaa.bbb.ccc', UNTOUCHED_DB);
    expect(result).toBe(null);
  });
});
