// ROIP APP 9BOX — teste unitario `auth/password` (ME-020).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido na
// abertura da ME — RV-08). Cobre: roundtrip hash+verify, vetor conhecido
// de custo canonico 12, rejeicao de senha errada e rejeicao de hash
// malformado (que resolve `false`, nunca lanca — semantica
// anti-enumeracao do DOC 02 §13.1).
//
// Os roundtrips usam custo 4 exclusivamente para velocidade da regua; o
// custo canonico de producao (12, S010) e provado pelo vetor conhecido e
// pela constante exportada.

import { describe, expect, it } from 'vitest';

import { BCRYPT_COST, hashPassword, verifyPassword } from '../../src/server/auth/password';

// Vetor conhecido: bcrypt cost 12 de 'Roip2026teste', gerado uma unica
// vez na ME-020 e congelado aqui. Prova compatibilidade de formato `$2b$`
// e o custo canonico sem pagar um hash de custo 12 por rodada.
const KNOWN_PLAIN = 'Roip2026teste';
const KNOWN_HASH_COST_12 = '$2b$12$uo4//Wz2Ld4/iy8yRTeUq.Dla5Vc33OZa1kEFUOsY1D1ti1Y3n3yC';

const TEST_COST = 4;

describe('auth/password (ME-020)', () => {
  it('BCRYPT_COST canonico e 12 (S010)', () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it('hashPassword gera hash bcrypt verificavel (roundtrip)', async () => {
    const hash = await hashPassword('senha-forte-1', TEST_COST);
    expect(hash.startsWith('$2b$04$')).toBe(true);
    await expect(verifyPassword('senha-forte-1', hash)).resolves.toBe(true);
  });

  it('hashPassword sem cost explicito embute o custo canonico 12', async () => {
    const hash = await hashPassword('senha-forte-2');
    expect(hash.startsWith('$2b$12$')).toBe(true);
  });

  it('dois hashes da mesma senha divergem (salt interno)', async () => {
    const a = await hashPassword('mesma-senha-9', TEST_COST);
    const b = await hashPassword('mesma-senha-9', TEST_COST);
    expect(a).not.toBe(b);
    await expect(verifyPassword('mesma-senha-9', a)).resolves.toBe(true);
    await expect(verifyPassword('mesma-senha-9', b)).resolves.toBe(true);
  });

  it('verifyPassword aceita vetor conhecido de custo 12', async () => {
    await expect(verifyPassword(KNOWN_PLAIN, KNOWN_HASH_COST_12)).resolves.toBe(true);
  });

  it('verifyPassword rejeita senha errada contra vetor conhecido', async () => {
    await expect(verifyPassword('Roip2026errada', KNOWN_HASH_COST_12)).resolves.toBe(false);
  });

  it('verifyPassword resolve false para hash vazio', async () => {
    await expect(verifyPassword('qualquer', '')).resolves.toBe(false);
  });

  it('verifyPassword resolve false para hash sem formato bcrypt', async () => {
    await expect(verifyPassword('qualquer', 'nao-e-um-hash-bcrypt')).resolves.toBe(false);
  });

  it('verifyPassword resolve false para hash bcrypt truncado', async () => {
    const truncado = KNOWN_HASH_COST_12.slice(0, 20);
    await expect(verifyPassword(KNOWN_PLAIN, truncado)).resolves.toBe(false);
  });
});
