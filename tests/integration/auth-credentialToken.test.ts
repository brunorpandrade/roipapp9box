// ROIP APP 9BOX — teste do modulo `credentialToken` (ME-022b).
//
// Cobertura: sign/verify simetrico; rejeicao de payload malformado;
// rejeicao cruzada com token de sessao (`jwt.ts`) — um verifier nao
// aceita o token do outro. Sem MySQL nesta suite: o modulo e puramente
// criptografico. Roda no perfil de integracao (`.test.ts`) por
// convencao, sem tocar em banco.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';

import {
  signCredentialToken,
  verifyCredentialToken,
  type CredentialTokenTipo,
  type CredentialUserType,
} from '../../src/server/auth/credentialToken';
import { signPlatformToken, verifyToken } from '../../src/server/auth/jwt';

const PREV_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-roip-me022b-credentialToken';
});

afterAll(() => {
  if (PREV_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = PREV_SECRET;
  }
});

describe('credentialToken — sign/verify simetrico', () => {
  const cenarios: Array<{
    tipo: CredentialTokenTipo;
    userType: CredentialUserType;
    userId: number;
  }> = [
    { tipo: 'reset', userType: 'employee', userId: 101 },
    { tipo: 'reset', userType: 'clevel', userId: 202 },
    { tipo: 'reset', userType: 'super_admin', userId: 1 },
    { tipo: 'first_access', userType: 'employee', userId: 303 },
    { tipo: 'first_access', userType: 'clevel', userId: 404 },
  ];

  for (const c of cenarios) {
    it(`preserva claims (tipo=${c.tipo}, userType=${c.userType}, sub=${c.userId})`, async () => {
      const token = await signCredentialToken(c);
      const result = await verifyCredentialToken(token);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.claims.userId).toBe(c.userId);
        expect(result.claims.tipo).toBe(c.tipo);
        expect(result.claims.userType).toBe(c.userType);
      }
    });
  }

  it('tokens sucessivos com mesmo payload sao distintos (jti nonce garante UNIQUE)', async () => {
    const payload = { tipo: 'reset', userType: 'employee', userId: 501 } as const;
    const t1 = await signCredentialToken(payload);
    // Sem espera — o `jti` random garante unicidade mesmo no mesmo segundo,
    // preservando UNIQUE de `accessTokens.token` (DOC 01 §4.8).
    const t2 = await signCredentialToken(payload);
    expect(t1).not.toBe(t2);
    const t3 = await signCredentialToken(payload);
    expect(t3).not.toBe(t1);
    expect(t3).not.toBe(t2);
  });
});

describe('credentialToken — rejeicoes', () => {
  it('assinatura invalida → malformed', async () => {
    const bogus = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SIGNATURE_INVALIDA';
    const result = await verifyCredentialToken(bogus);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('token vazio → malformed', async () => {
    const result = await verifyCredentialToken('');
    expect(result.valid).toBe(false);
  });

  it('token com estrutura JWT quebrada → malformed', async () => {
    const result = await verifyCredentialToken('nao-e-um-jwt');
    expect(result.valid).toBe(false);
  });

  it('payload sem `tipo` (jwt manual sem tipo) → malformed', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ userType: 'employee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('123')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('payload com `tipo` fora do enum → malformed', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'wildcard', userType: 'employee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('123')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('payload com `userType` fora do enum → malformed', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'reset', userType: 'employer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('123')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('payload com `exp` presente → malformed (S023: credencial nao carrega exp)', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'reset', userType: 'employee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('123')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('payload com `role` presente → malformed (nao confundir com token de sessao)', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'reset', userType: 'employee', role: 'rh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('123')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('sub invalido (nao numerico) → malformed', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'reset', userType: 'employee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('abc')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });

  it('sub zero ou negativo → malformed', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({ tipo: 'reset', userType: 'employee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('0')
      .setIssuedAt()
      .sign(secret);
    const result = await verifyCredentialToken(jwt);
    expect(result.valid).toBe(false);
  });
});

describe('credentialToken — nao confusao com jwt de sessao', () => {
  it('token de credencial nao passa em verifyToken de sessao (sem role)', async () => {
    const credToken = await signCredentialToken({
      userId: 42,
      tipo: 'reset',
      userType: 'employee',
    });
    const sessionResult = await verifyToken(credToken);
    expect(sessionResult.valid).toBe(false);
  });

  it('token de sessao nao passa em verifyCredentialToken (sem tipo)', async () => {
    const sessionToken = await signPlatformToken({
      userId: 42,
      role: 'rh',
      companyId: 7,
      credentialVersion: 'aabbccdd11223344',
    });
    const credResult = await verifyCredentialToken(sessionToken);
    expect(credResult.valid).toBe(false);
  });
});
