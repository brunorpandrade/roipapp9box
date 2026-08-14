// ROIP APP 9BOX — teste unitario `services/credentialProvisioning`
// (ME-080b Dispatch 2a).
//
// Cobertura desta rodada (unit — nao toca banco): apenas
// `provisionInitialPassword`, que e puro (nao consulta BD, so gera via
// PRNG + bcrypt). As duas outras funcoes exportadas
// (`provisionUniqueMatricula`, `validateProvidedMatricula`) exigem MySQL
// real e sao cobertas por testes de integracao do proprio router
// `employees.create` (Dispatch 2b) — que atravessam este servico
// naturalmente como parte do fluxo canonico.
//
// RV-13: consumidor deste export unit — `tests/unit/*.test.ts` conta como
// chamador legitimo por convencao do repositorio (Bloco B1).

import { describe, expect, it } from 'vitest';

import { provisionInitialPassword } from '../../src/server/services/credentialProvisioning';

const ALPHANUMERIC_REGEX = /^[A-Za-z0-9]+$/;
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /[0-9]/;
const BCRYPT_HASH_REGEX = /^\$2[abxy]\$\d{2}\$/;

describe('services/credentialProvisioning — provisionInitialPassword (ME-080b)', () => {
  it('retorna plain de 8 caracteres alfanumericos', async () => {
    const result = await provisionInitialPassword();
    expect(result.plain).toHaveLength(8);
    expect(ALPHANUMERIC_REGEX.test(result.plain)).toBe(true);
  });

  it('plain sempre satisfaz MSG_PASSWORD_POLICY (>=1 letra, >=1 numero)', async () => {
    // Amostragem enxuta — bcrypt custo 12 canonico e caro (~200ms/hash),
    // manter poucas iteracoes para caber no timeout default do vitest.
    // A garantia canonica sob 1000 amostras esta em
    // `passwordGenerator.test.ts`; aqui so validamos que a integracao
    // com bcrypt nao corrompe a propriedade.
    for (let i = 0; i < 3; i++) {
      const result = await provisionInitialPassword();
      expect(HAS_LETTER.test(result.plain)).toBe(true);
      expect(HAS_DIGIT.test(result.plain)).toBe(true);
    }
  });

  it('retorna hash bcrypt no formato canonico ($2a$/$2b$)', async () => {
    const result = await provisionInitialPassword();
    expect(BCRYPT_HASH_REGEX.test(result.hash)).toBe(true);
  });

  it('hash resultante casa com o plain (roundtrip)', async () => {
    const bcrypt = await import('bcryptjs');
    const result = await provisionInitialPassword();
    const ok = await bcrypt.default.compare(result.plain, result.hash);
    expect(ok).toBe(true);
  });

  it('duas chamadas consecutivas produzem senhas distintas (runtime seed)', async () => {
    // Espaco 62^8 = ~2.18e14, prob de colisao ~4.6e-15 — teste flakey
    // acontece 1 em 10^14 execucoes. Aceitavel para regressao operacional.
    const a = await provisionInitialPassword();
    const b = await provisionInitialPassword();
    expect(a.plain).not.toBe(b.plain);
  });
});
